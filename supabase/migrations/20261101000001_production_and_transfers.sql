-- Phase 2: production (bake log), transfers between locations, standing orders.
--
-- Transfer flow:
--   draft → requested → approved → picking → in_transit → received
--   requested → rejected;   draft/requested/approved/picking → cancelled
--
-- Stock leaves the sender at dispatch (transfer_out). At receipt the receiver
-- books the full amount sent (transfer_in) and then any difference
-- (transfer_loss, with a reason), so each transfer balances in the ledger and
-- shortages are never silent.

-- ---------------------------------------------------------------------------
-- Fix: batch codes must not be cut off after 99,999 batches.
-- ---------------------------------------------------------------------------
create or replace function public.set_batch_code()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_seq text;
begin
  if new.code is null or length(trim(new.code)) = 0 then
    v_seq := nextval('public.batch_code_seq')::text;
    new.code := 'B' || to_char(new.produced_on, 'YYMMDD') || '-'
      || lpad(v_seq, greatest(5, length(v_seq)), '0');
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.transfer_status as enum (
  'draft',
  'requested',
  'approved',
  'picking',
  'in_transit',
  'received',
  'rejected',
  'cancelled'
);

-- request: asked for by the receiving location
-- push: sent by the sending location (includes store returns)
-- standing_order: created automatically from standing orders
create type public.transfer_origin as enum ('request', 'push', 'standing_order');

create type public.discrepancy_reason as enum ('missing', 'damaged', 'extra', 'other');

-- ---------------------------------------------------------------------------
-- Access helper: any role at the location except driver (drivers only look).
-- ---------------------------------------------------------------------------
create function public.can_work_location(p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1
    from public.user_locations ul
    join public.profiles p on p.id = ul.user_id
    where ul.user_id = auth.uid()
      and ul.location_id = p_location_id
      and ul.role <> 'driver'
      and p.active
  );
$$;

-- ---------------------------------------------------------------------------
-- Production runs (bake log)
-- ---------------------------------------------------------------------------
create table public.production_runs (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete restrict,
  item_id uuid not null references public.items (id) on delete restrict,
  batch_id uuid references public.batches (id) on delete restrict,
  qty numeric(14, 3) not null check (qty > 0),
  produced_on date not null,
  note text,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  void_reason text
);

create index production_runs_location_date_idx
  on public.production_runs (location_id, produced_on desc, created_at desc);

-- Log a bake: creates a batch (for batch-tracked items) and adds the stock.
-- Best-before defaults to the bake date + the item's shelf life.
create function public.log_production(
  p_location_id uuid,
  p_item_id uuid,
  p_qty numeric,
  p_produced_on date default null,
  p_best_before date default null,
  p_note text default null
)
returns table (run_id uuid, batch_id uuid, batch_code text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_location public.locations;
  v_item public.items;
  v_today date;
  v_produced date;
  v_best date;
  v_batch_id uuid;
  v_batch_code text;
  v_run_id uuid;
begin
  if not public.can_work_location(p_location_id) then
    raise exception 'You are not allowed to log bakes at this location'
      using errcode = '42501';
  end if;

  select * into v_location from public.locations where id = p_location_id and active;
  if not found then
    raise exception 'Location not found or inactive';
  end if;
  if not v_location.can_produce then
    raise exception '% is not set up for baking. An admin can turn this on under Locations.',
      v_location.name;
  end if;

  select * into v_item from public.items where id = p_item_id and active;
  if not found then
    raise exception 'Unknown or inactive item';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'Quantity must be more than 0';
  end if;

  v_today := (now() at time zone v_location.timezone)::date;
  v_produced := coalesce(p_produced_on, v_today);
  if v_produced > v_today then
    raise exception 'The bake date can''t be in the future';
  end if;

  if v_item.track_batches then
    v_best := coalesce(p_best_before, v_produced + v_item.shelf_life_days);
    if v_best < v_produced then
      raise exception 'Best-before can''t be before the bake date';
    end if;

    insert into public.batches (item_id, source, location_id, produced_on, best_before, created_by)
    values (v_item.id, 'production', p_location_id, v_produced, v_best, auth.uid())
    returning id, code into v_batch_id, v_batch_code;
  end if;

  insert into public.production_runs (location_id, item_id, batch_id, qty, produced_on, note, created_by)
  values (p_location_id, v_item.id, v_batch_id, p_qty, v_produced, nullif(trim(p_note), ''), auth.uid())
  returning id into v_run_id;

  insert into public.stock_movements (
    location_id, item_id, batch_id, qty, type, reference_type, reference_id, note, created_by
  ) values (
    p_location_id, v_item.id, v_batch_id, p_qty, 'production_in', 'production_run', v_run_id,
    nullif(trim(p_note), ''), auth.uid()
  );

  return query select v_run_id, v_batch_id, v_batch_code;
end;
$$;

-- Undo a bake logged by mistake. Only possible while none of the batch has
-- been moved, sold or counted; otherwise use waste or a stock take.
create function public.void_production_run(p_run_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.production_runs;
begin
  select * into v_run from public.production_runs where id = p_run_id for update;
  if not found then
    raise exception 'Bake not found';
  end if;

  if not (
    public.can_manage_location(v_run.location_id)
    or (v_run.created_by = auth.uid() and public.can_work_location(v_run.location_id))
  ) then
    raise exception 'Only a manager or the person who logged this bake can undo it'
      using errcode = '42501';
  end if;

  if v_run.voided_at is not null then
    raise exception 'This bake has already been undone';
  end if;

  if nullif(trim(p_reason), '') is null then
    raise exception 'Give a reason for undoing the bake';
  end if;

  if v_run.batch_id is not null and exists (
    select 1 from public.stock_movements m
    where m.batch_id = v_run.batch_id
      and not (m.type = 'production_in' and m.reference_id = v_run.id)
  ) then
    raise exception 'Some of this batch has already been sent, sold or counted, so the bake can''t be undone. Record waste or do a stock take instead.';
  end if;

  insert into public.stock_movements (
    location_id, item_id, batch_id, qty, type, reference_type, reference_id, note, created_by
  ) values (
    v_run.location_id, v_run.item_id, v_run.batch_id, -v_run.qty, 'production_in',
    'production_run', v_run.id, 'Bake undone: ' || trim(p_reason), auth.uid()
  );

  update public.production_runs
  set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason)
  where id = v_run.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Transfers
-- ---------------------------------------------------------------------------
create sequence public.transfer_code_seq;

-- Transfer numbers look like T-00042.
create function public.next_transfer_code()
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_seq text := nextval('public.transfer_code_seq')::text;
begin
  return 'T-' || lpad(v_seq, greatest(5, length(v_seq)), '0');
end;
$$;

create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default public.next_transfer_code(),
  from_location_id uuid not null references public.locations (id) on delete restrict,
  to_location_id uuid not null references public.locations (id) on delete restrict,
  origin public.transfer_origin not null,
  status public.transfer_status not null default 'draft',
  needed_on date,
  note text,
  has_discrepancy boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  dispatched_at timestamptz,
  received_at timestamptz,
  check (from_location_id <> to_location_id)
);

create index transfers_from_status_idx on public.transfers (from_location_id, status);
create index transfers_to_status_idx on public.transfers (to_location_id, status);
create index transfers_needed_on_idx on public.transfers (needed_on);

-- One standing-order transfer per route per day.
create unique index transfers_standing_order_key
  on public.transfers (from_location_id, to_location_id, needed_on)
  where origin = 'standing_order';

create trigger transfers_updated_at
  before update on public.transfers
  for each row execute function public.set_updated_at();

create table public.transfer_lines (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.transfers (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete restrict,
  -- What the receiving location asked for (null for lines added by the sender).
  requested_qty numeric(14, 3) check (requested_qty >= 0),
  -- What will be sent: the approved quantity.
  qty numeric(14, 3) not null check (qty >= 0),
  dispatched_qty numeric(14, 3) check (dispatched_qty >= 0),
  received_qty numeric(14, 3) check (received_qty >= 0),
  note text,
  unique (transfer_id, item_id)
);

create index transfer_lines_item_idx on public.transfer_lines (item_id);

-- What was actually sent, per batch.
create table public.transfer_line_batches (
  id bigint generated always as identity primary key,
  line_id uuid not null references public.transfer_lines (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete restrict,
  batch_id uuid,
  dispatched_qty numeric(14, 3) not null check (dispatched_qty > 0),
  received_qty numeric(14, 3) check (received_qty >= 0),
  discrepancy_reason public.discrepancy_reason,
  discrepancy_note text,
  foreign key (batch_id, item_id) references public.batches (id, item_id),
  constraint transfer_line_batches_key unique nulls not distinct (line_id, batch_id)
);

create index transfer_line_batches_batch_idx on public.transfer_line_batches (batch_id);

-- Timeline of everything that happened to a transfer.
create table public.transfer_events (
  id bigint generated always as identity primary key,
  transfer_id uuid not null references public.transfers (id) on delete cascade,
  action text not null check (action in (
    'created', 'updated', 'requested', 'approved', 'rejected', 'cancelled',
    'picking', 'dispatched', 'received'
  )),
  status public.transfer_status not null,
  note text,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index transfer_events_transfer_idx on public.transfer_events (transfer_id, created_at);

-- ---------------------------------------------------------------------------
-- Transfer permission helpers
-- ---------------------------------------------------------------------------
create function public.can_see_transfer(p_transfer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.transfers t
    where t.id = p_transfer_id
      and (public.has_location_access(t.from_location_id)
           or public.has_location_access(t.to_location_id))
  );
$$;

-- Who may change lines and dates, by status:
--   draft      the side that started it
--   requested  the receiving side (until the sender approves)
--   approved / picking  the sending side
create function public.can_edit_transfer(
  p_from uuid,
  p_to uuid,
  p_origin public.transfer_origin,
  p_status public.transfer_status
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_status = 'draft' and p_origin = 'push' then public.can_manage_location(p_from)
    when p_status = 'draft' then public.can_manage_location(p_to)
    when p_status = 'requested' then public.can_manage_location(p_to)
    when p_status in ('approved', 'picking') then public.can_manage_location(p_from)
    else false
  end;
$$;

-- Internal: record a timeline event with the transfer's current status.
create function public.log_transfer_event(p_transfer_id uuid, p_action text, p_note text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.transfer_events (transfer_id, action, status, note, created_by)
  select t.id, p_action, t.status, nullif(trim(p_note), ''), auth.uid()
  from public.transfers t
  where t.id = p_transfer_id;
$$;

-- Internal: replace a transfer's lines with p_lines ([{ item_id, qty, note? }]).
-- With p_keep_requested, lines the receiver asked for are set to 0 instead of
-- removed, so the request stays on record.
create function public.replace_transfer_lines(
  p_transfer_id uuid,
  p_lines jsonb,
  p_keep_requested boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line jsonb;
  v_item public.items;
  v_qty numeric;
  v_ids uuid[] := '{}';
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one item';
  end if;
  if jsonb_array_length(p_lines) > 500 then
    raise exception 'A transfer can have at most 500 lines';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    select * into v_item
    from public.items
    where id = nullif(v_line ->> 'item_id', '')::uuid and active;
    if not found then
      raise exception 'Choose an active item on every line';
    end if;
    if v_item.id = any (v_ids) then
      raise exception '% is on the list twice', v_item.name;
    end if;

    v_qty := (v_line ->> 'qty')::numeric;
    if v_qty is null or v_qty < 0 then
      raise exception 'Enter a quantity for %', v_item.name;
    end if;
    v_ids := v_ids || v_item.id;

    insert into public.transfer_lines (transfer_id, item_id, qty, note)
    values (p_transfer_id, v_item.id, v_qty, nullif(trim(v_line ->> 'note'), ''))
    on conflict (transfer_id, item_id)
    do update set qty = excluded.qty, note = excluded.note;
  end loop;

  if p_keep_requested then
    update public.transfer_lines set qty = 0
    where transfer_id = p_transfer_id
      and item_id <> all (v_ids)
      and requested_qty is not null;
    delete from public.transfer_lines
    where transfer_id = p_transfer_id
      and item_id <> all (v_ids)
      and requested_qty is null;
  else
    delete from public.transfer_lines
    where transfer_id = p_transfer_id and item_id <> all (v_ids);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Transfer actions
-- ---------------------------------------------------------------------------

-- Create (p_id null) or edit a transfer.
-- p_transfer keys: origin ('request' | 'push'), from_location_id,
-- to_location_id, needed_on, note. Locations and origin are fixed once created.
create function public.save_transfer(p_transfer jsonb, p_lines jsonb, p_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.transfers;
  v_origin public.transfer_origin;
  v_from uuid;
  v_to uuid;
begin
  if p_id is null then
    v_origin := nullif(p_transfer ->> 'origin', '')::public.transfer_origin;
    v_from := nullif(p_transfer ->> 'from_location_id', '')::uuid;
    v_to := nullif(p_transfer ->> 'to_location_id', '')::uuid;

    if v_origin is null or v_origin = 'standing_order' then
      raise exception 'Choose whether you are requesting or sending stock';
    end if;
    if v_from is null or v_to is null then
      raise exception 'Choose where the stock comes from and where it goes';
    end if;
    if v_from = v_to then
      raise exception 'Choose two different locations';
    end if;
    if (select count(*) from public.locations where id in (v_from, v_to) and active) <> 2 then
      raise exception 'Location not found or inactive';
    end if;
    if v_origin = 'request' and not public.can_manage_location(v_to) then
      raise exception 'Only a manager of the receiving location can request stock'
        using errcode = '42501';
    end if;
    if v_origin = 'push' and not public.can_manage_location(v_from) then
      raise exception 'Only a manager of the sending location can send stock'
        using errcode = '42501';
    end if;

    insert into public.transfers (from_location_id, to_location_id, origin, needed_on, note, created_by)
    values (
      v_from, v_to, v_origin,
      nullif(p_transfer ->> 'needed_on', '')::date,
      nullif(trim(p_transfer ->> 'note'), ''),
      auth.uid()
    )
    returning * into v_t;

    perform public.replace_transfer_lines(v_t.id, p_lines, false);
    perform public.log_transfer_event(v_t.id, 'created');
    return v_t.id;
  end if;

  select * into v_t from public.transfers where id = p_id for update;
  if not found then
    raise exception 'Transfer not found';
  end if;
  if not public.can_edit_transfer(v_t.from_location_id, v_t.to_location_id, v_t.origin, v_t.status) then
    raise exception 'You can''t change this transfer now' using errcode = '42501';
  end if;

  update public.transfers
  set needed_on = nullif(p_transfer ->> 'needed_on', '')::date,
      note = nullif(trim(p_transfer ->> 'note'), '')
  where id = p_id;

  perform public.replace_transfer_lines(p_id, p_lines, v_t.status in ('approved', 'picking'));

  -- While a request is waiting, the requester's changes are the request.
  if v_t.status = 'requested' then
    update public.transfer_lines set requested_qty = qty where transfer_id = p_id;
  end if;

  if v_t.status <> 'draft' then
    perform public.log_transfer_event(p_id, 'updated');
  end if;
  return p_id;
end;
$$;

-- Send a draft on: requests go to the sender for approval; pushes are
-- approved straight away and ready for picking.
create function public.submit_transfer(p_id uuid)
returns public.transfer_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.transfers;
  v_status public.transfer_status;
begin
  select * into v_t from public.transfers where id = p_id for update;
  if not found then
    raise exception 'Transfer not found';
  end if;
  if v_t.status <> 'draft' then
    raise exception 'This transfer has already been sent on';
  end if;
  if not public.can_edit_transfer(v_t.from_location_id, v_t.to_location_id, v_t.origin, v_t.status) then
    raise exception 'You can''t send this transfer on' using errcode = '42501';
  end if;

  delete from public.transfer_lines where transfer_id = p_id and qty = 0;
  if not exists (select 1 from public.transfer_lines where transfer_id = p_id) then
    raise exception 'Add at least one item with a quantity';
  end if;

  if v_t.origin = 'push' then
    v_status := 'approved';
    update public.transfers set status = v_status where id = p_id;
    perform public.log_transfer_event(p_id, 'approved');
  else
    v_status := 'requested';
    update public.transfer_lines set requested_qty = qty where transfer_id = p_id;
    update public.transfers set status = v_status where id = p_id;
    perform public.log_transfer_event(p_id, 'requested');
  end if;

  return v_status;
end;
$$;

-- Sender approves a request, optionally with changed quantities.
create function public.approve_transfer(p_id uuid, p_lines jsonb default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.transfers;
begin
  select * into v_t from public.transfers where id = p_id for update;
  if not found then
    raise exception 'Transfer not found';
  end if;
  if v_t.status <> 'requested' then
    raise exception 'Only requested transfers can be approved';
  end if;
  if not public.can_manage_location(v_t.from_location_id) then
    raise exception 'Only a manager of the sending location can approve this'
      using errcode = '42501';
  end if;

  if p_lines is not null then
    perform public.replace_transfer_lines(p_id, p_lines, true);
  end if;

  if not exists (select 1 from public.transfer_lines where transfer_id = p_id and qty > 0) then
    raise exception 'Nothing is left to send. Reject the request instead.';
  end if;

  update public.transfers set status = 'approved' where id = p_id;
  perform public.log_transfer_event(
    p_id, 'approved',
    case when exists (
      select 1 from public.transfer_lines
      where transfer_id = p_id and qty is distinct from requested_qty
    ) then 'Quantities changed' end
  );
end;
$$;

create function public.reject_transfer(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.transfers;
begin
  select * into v_t from public.transfers where id = p_id for update;
  if not found then
    raise exception 'Transfer not found';
  end if;
  if v_t.status <> 'requested' then
    raise exception 'Only requested transfers can be rejected';
  end if;
  if not public.can_manage_location(v_t.from_location_id) then
    raise exception 'Only a manager of the sending location can reject this'
      using errcode = '42501';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'Give a reason so the other location knows why';
  end if;

  update public.transfers set status = 'rejected' where id = p_id;
  perform public.log_transfer_event(p_id, 'rejected', p_reason);
end;
$$;

-- Cancel before dispatch. Drafts are deleted outright. Returns 'deleted' or
-- 'cancelled'.
create function public.cancel_transfer(p_id uuid, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.transfers;
begin
  select * into v_t from public.transfers where id = p_id for update;
  if not found then
    raise exception 'Transfer not found';
  end if;

  if v_t.status = 'draft' then
    if not public.can_edit_transfer(v_t.from_location_id, v_t.to_location_id, v_t.origin, v_t.status) then
      raise exception 'You can''t delete this draft' using errcode = '42501';
    end if;
    delete from public.transfers where id = p_id;
    return 'deleted';
  end if;

  if v_t.status = 'requested' then
    if not (public.can_manage_location(v_t.to_location_id)
            or public.can_manage_location(v_t.from_location_id)) then
      raise exception 'You can''t cancel this transfer' using errcode = '42501';
    end if;
  elsif v_t.status in ('approved', 'picking') then
    if not public.can_manage_location(v_t.from_location_id) then
      raise exception 'Only the sending location can cancel an approved transfer. Ask them to cancel it.'
        using errcode = '42501';
    end if;
  else
    raise exception 'This transfer can''t be cancelled any more';
  end if;

  update public.transfers set status = 'cancelled' where id = p_id;
  perform public.log_transfer_event(p_id, 'cancelled', p_reason);
  return 'cancelled';
end;
$$;

-- Mark that someone has started picking (so others can see it's in hand).
create function public.start_picking(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.transfers;
begin
  select * into v_t from public.transfers where id = p_id for update;
  if not found then
    raise exception 'Transfer not found';
  end if;
  if v_t.status not in ('approved', 'picking') then
    raise exception 'This transfer is not ready for picking';
  end if;
  if not public.can_work_location(v_t.from_location_id) then
    raise exception 'Only staff at the sending location can pick this' using errcode = '42501';
  end if;

  update public.transfers set status = 'picking' where id = p_id;
  perform public.log_transfer_event(p_id, 'picking');
end;
$$;

-- Dispatch: take the picked batches out of the sender's stock.
-- p_picks: [{ line_id, batch_id (null for items without batches), qty }]
create function public.dispatch_transfer(p_id uuid, p_picks jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.transfers;
  v_pick jsonb;
  v_line public.transfer_lines;
  v_item public.items;
  v_batch_id uuid;
  v_qty numeric;
  v_total numeric := 0;
begin
  select * into v_t from public.transfers where id = p_id for update;
  if not found then
    raise exception 'Transfer not found';
  end if;
  if v_t.status in ('in_transit', 'received') then
    raise exception 'This transfer has already been dispatched';
  end if;
  if v_t.status not in ('approved', 'picking') then
    raise exception 'This transfer is not ready to dispatch';
  end if;
  if not public.can_work_location(v_t.from_location_id) then
    raise exception 'Only staff at the sending location can dispatch this' using errcode = '42501';
  end if;
  if p_picks is null or jsonb_typeof(p_picks) <> 'array' then
    raise exception 'Expected a list of picked items';
  end if;

  for v_pick in select value from jsonb_array_elements(p_picks) loop
    v_qty := (v_pick ->> 'qty')::numeric;
    if v_qty is null or v_qty < 0 then
      raise exception 'Picked quantities can''t be negative';
    end if;
    continue when v_qty = 0;

    select * into v_line
    from public.transfer_lines
    where id = nullif(v_pick ->> 'line_id', '')::uuid and transfer_id = p_id;
    if not found then
      raise exception 'A picked item is not on this transfer';
    end if;

    select * into v_item from public.items where id = v_line.item_id;

    v_batch_id := nullif(v_pick ->> 'batch_id', '')::uuid;
    if v_item.track_batches then
      if v_batch_id is null then
        raise exception '% needs a batch. Choose or scan the batch you are sending.', v_item.name;
      end if;
      if not exists (
        select 1 from public.stock_levels sl
        where sl.location_id = v_t.from_location_id
          and sl.item_id = v_item.id
          and sl.batch_id = v_batch_id
      ) then
        raise exception 'Batch % of % is not at this location',
          coalesce((select code from public.batches where id = v_batch_id), '?'), v_item.name;
      end if;
    else
      v_batch_id := null;
    end if;

    insert into public.transfer_line_batches (line_id, item_id, batch_id, dispatched_qty)
    values (v_line.id, v_item.id, v_batch_id, v_qty)
    on conflict (line_id, batch_id)
    do update set dispatched_qty = public.transfer_line_batches.dispatched_qty + excluded.dispatched_qty;

    insert into public.stock_movements (
      location_id, item_id, batch_id, qty, type, reference_type, reference_id, created_by
    ) values (
      v_t.from_location_id, v_item.id, v_batch_id, -v_qty, 'transfer_out', 'transfer', p_id, auth.uid()
    );

    v_total := v_total + v_qty;
  end loop;

  if v_total = 0 then
    raise exception 'Nothing was picked. Pick at least one item, or cancel the transfer.';
  end if;

  update public.transfer_lines l
  set dispatched_qty = coalesce(
    (select sum(b.dispatched_qty) from public.transfer_line_batches b where b.line_id = l.id), 0)
  where l.transfer_id = p_id;

  update public.transfers set status = 'in_transit', dispatched_at = now() where id = p_id;
  perform public.log_transfer_event(p_id, 'dispatched');
end;
$$;

-- Receive a delivery. p_lines: [{ id (transfer_line_batches.id), received_qty,
-- reason?, note? }] covering every batch that was sent. A reason is needed
-- whenever the received quantity differs from what was sent.
create function public.receive_transfer(p_id uuid, p_lines jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.transfers;
  v_row public.transfer_line_batches;
  v_in jsonb;
  v_received numeric;
  v_diff numeric;
  v_reason public.discrepancy_reason;
  v_note text;
  v_any_diff boolean := false;
begin
  select * into v_t from public.transfers where id = p_id for update;
  if not found then
    raise exception 'Transfer not found';
  end if;
  if v_t.status = 'received' then
    raise exception 'This delivery has already been received';
  end if;
  if v_t.status <> 'in_transit' then
    raise exception 'This transfer has not been dispatched yet';
  end if;
  if not public.can_work_location(v_t.to_location_id) then
    raise exception 'Only staff at the receiving location can receive this delivery'
      using errcode = '42501';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Expected a list of received quantities';
  end if;

  for v_row in
    select b.*
    from public.transfer_line_batches b
    join public.transfer_lines l on l.id = b.line_id
    where l.transfer_id = p_id
    order by b.id
  loop
    select value into v_in
    from jsonb_array_elements(p_lines)
    where (value ->> 'id')::bigint = v_row.id
    limit 1;

    if v_in is null then
      raise exception 'Confirm the quantity received for every line';
    end if;

    v_received := (v_in ->> 'received_qty')::numeric;
    if v_received is null or v_received < 0 then
      raise exception 'Received quantities can''t be negative';
    end if;

    v_diff := v_received - v_row.dispatched_qty;
    v_reason := null;
    v_note := null;

    if v_diff <> 0 then
      v_reason := nullif(v_in ->> 'reason', '')::public.discrepancy_reason;
      if v_reason is null then
        raise exception 'Choose a reason for the difference on %',
          (select name from public.items where id = v_row.item_id);
      end if;
      v_note := nullif(trim(v_in ->> 'note'), '');
      v_any_diff := true;
    end if;

    insert into public.stock_movements (
      location_id, item_id, batch_id, qty, type, reference_type, reference_id, created_by
    ) values (
      v_t.to_location_id, v_row.item_id, v_row.batch_id, v_row.dispatched_qty,
      'transfer_in', 'transfer', p_id, auth.uid()
    );

    if v_diff <> 0 then
      insert into public.stock_movements (
        location_id, item_id, batch_id, qty, type, reference_type, reference_id, note, created_by
      ) values (
        v_t.to_location_id, v_row.item_id, v_row.batch_id, v_diff,
        'transfer_loss', 'transfer', p_id,
        initcap(v_reason::text) || coalesce(': ' || v_note, ''),
        auth.uid()
      );
    end if;

    update public.transfer_line_batches
    set received_qty = v_received,
        discrepancy_reason = v_reason,
        discrepancy_note = v_note
    where id = v_row.id;
  end loop;

  update public.transfer_lines l
  set received_qty = (
    select sum(b.received_qty) from public.transfer_line_batches b where b.line_id = l.id)
  where l.transfer_id = p_id;

  update public.transfers
  set status = 'received', received_at = now(), has_discrepancy = v_any_diff
  where id = p_id;
  perform public.log_transfer_event(
    p_id, 'received', case when v_any_diff then 'Received with differences' end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Standing orders: default quantities per route, item and weekday.
-- ---------------------------------------------------------------------------
create table public.standing_orders (
  from_location_id uuid not null references public.locations (id) on delete cascade,
  to_location_id uuid not null references public.locations (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7), -- ISO: 1 = Monday
  qty numeric(14, 3) not null check (qty > 0),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (from_location_id, to_location_id, item_id, weekday),
  check (from_location_id <> to_location_id)
);

create index standing_orders_to_idx on public.standing_orders (to_location_id);

-- Replace the standing order for one route. p_rows: [{ item_id, weekday, qty }].
create function public.save_standing_orders(p_from uuid, p_to uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_from is null or p_to is null or p_from = p_to then
    raise exception 'Choose two different locations';
  end if;
  if not (public.can_manage_location(p_from) or public.can_manage_location(p_to)) then
    raise exception 'Only managers of these locations can change standing orders'
      using errcode = '42501';
  end if;
  if (select count(*) from public.locations where id in (p_from, p_to) and active) <> 2 then
    raise exception 'Location not found or inactive';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Expected a list of quantities';
  end if;

  delete from public.standing_orders where from_location_id = p_from and to_location_id = p_to;

  insert into public.standing_orders (from_location_id, to_location_id, item_id, weekday, qty, updated_by)
  select p_from, p_to, (r ->> 'item_id')::uuid, (r ->> 'weekday')::smallint, (r ->> 'qty')::numeric, auth.uid()
  from jsonb_array_elements(p_rows) as r
  where (r ->> 'qty')::numeric > 0;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Create requested transfers from standing orders. With no date, each route
-- gets tomorrow's order (in the sending location's timezone). Runs hourly from
-- pg_cron; safe to call repeatedly: each route and day is only created once,
-- and a cancelled one is not recreated. When a user calls it, only routes from
-- locations they manage are generated. Returns how many transfers were made.
create function public.generate_standing_transfers(p_date date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_route record;
  v_date date;
  v_id uuid;
  v_count integer := 0;
begin
  for v_route in
    select distinct so.from_location_id, so.to_location_id, lf.timezone
    from public.standing_orders so
    join public.locations lf on lf.id = so.from_location_id and lf.active
    join public.locations lt on lt.id = so.to_location_id and lt.active
  loop
    if auth.uid() is not null and not public.can_manage_location(v_route.from_location_id) then
      continue;
    end if;

    v_date := coalesce(p_date, (now() at time zone v_route.timezone)::date + 1);

    continue when not exists (
      select 1 from public.standing_orders so
      join public.items i on i.id = so.item_id and i.active
      where so.from_location_id = v_route.from_location_id
        and so.to_location_id = v_route.to_location_id
        and so.weekday = extract(isodow from v_date)
    );

    insert into public.transfers (
      from_location_id, to_location_id, origin, status, needed_on, note, created_by
    ) values (
      v_route.from_location_id, v_route.to_location_id, 'standing_order', 'requested',
      v_date, null, auth.uid()
    )
    on conflict (from_location_id, to_location_id, needed_on)
      where origin = 'standing_order'
      do nothing
    returning id into v_id;

    continue when v_id is null;

    insert into public.transfer_lines (transfer_id, item_id, requested_qty, qty)
    select v_id, so.item_id, so.qty, so.qty
    from public.standing_orders so
    join public.items i on i.id = so.item_id and i.active
    where so.from_location_id = v_route.from_location_id
      and so.to_location_id = v_route.to_location_id
      and so.weekday = extract(isodow from v_date);

    perform public.log_transfer_event(v_id, 'requested', 'Created from the standing order');
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Production plan: products needed for open outgoing transfers due on or
-- before p_date, against usable stock (not past best-before by then).
-- ---------------------------------------------------------------------------
create function public.production_plan(p_location_id uuid, p_date date)
returns table (
  item_id uuid,
  sku text,
  item_name text,
  unit public.item_unit,
  needed numeric,
  usable_stock numeric,
  to_make numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with needed as (
    select tl.item_id, sum(tl.qty) as qty
    from public.transfers t
    join public.transfer_lines tl on tl.transfer_id = t.id
    where t.from_location_id = p_location_id
      and t.status in ('requested', 'approved', 'picking')
      and coalesce(t.needed_on, p_date) <= p_date
    group by tl.item_id
  ),
  stock as (
    select sl.item_id, sum(sl.qty) as qty
    from public.stock_levels sl
    left join public.batches b on b.id = sl.batch_id
    where sl.location_id = p_location_id
      and sl.qty > 0
      and (b.best_before is null or b.best_before >= p_date)
    group by sl.item_id
  )
  select
    i.id,
    i.sku,
    i.name,
    i.unit,
    n.qty,
    coalesce(s.qty, 0),
    greatest(n.qty - coalesce(s.qty, 0), 0)
  from needed n
  join public.items i on i.id = n.item_id and i.kind = 'product'
  left join stock s on s.item_id = n.item_id
  where n.qty > 0
  order by greatest(n.qty - coalesce(s.qty, 0), 0) desc, i.name;
$$;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------
create view public.transfer_list
with (security_invoker = true)
as
select
  t.id,
  t.code,
  t.status,
  t.origin,
  t.needed_on,
  t.note,
  t.has_discrepancy,
  t.created_at,
  t.updated_at,
  t.dispatched_at,
  t.received_at,
  t.from_location_id,
  lf.code as from_code,
  lf.name as from_name,
  lf.type as from_type,
  t.to_location_id,
  lt.code as to_code,
  lt.name as to_name,
  lt.type as to_type,
  coalesce(s.line_count, 0) as line_count,
  coalesce(s.total_qty, 0) as total_qty,
  (t.needed_on < (now() at time zone lt.timezone)::date
    and t.status in ('requested', 'approved', 'picking', 'in_transit')) as overdue
from public.transfers t
join public.locations lf on lf.id = t.from_location_id
join public.locations lt on lt.id = t.to_location_id
left join lateral (
  select
    count(*) as line_count,
    sum(case when t.status in ('in_transit', 'received')
             then coalesce(l.dispatched_qty, 0) else l.qty end) as total_qty
  from public.transfer_lines l
  where l.transfer_id = t.id
) s on true;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.production_runs enable row level security;
alter table public.transfers enable row level security;
alter table public.transfer_lines enable row level security;
alter table public.transfer_line_batches enable row level security;
alter table public.transfer_events enable row level security;
alter table public.standing_orders enable row level security;

create policy "production_runs_read" on public.production_runs
  for select to authenticated using (public.has_location_access(location_id));

-- Both ends of a transfer can see it (drivers included).
create policy "transfers_read" on public.transfers
  for select to authenticated
  using (public.has_location_access(from_location_id) or public.has_location_access(to_location_id));
create policy "transfer_lines_read" on public.transfer_lines
  for select to authenticated using (public.can_see_transfer(transfer_id));
create policy "transfer_line_batches_read" on public.transfer_line_batches
  for select to authenticated
  using (exists (
    select 1 from public.transfer_lines l
    where l.id = line_id and public.can_see_transfer(l.transfer_id)
  ));
create policy "transfer_events_read" on public.transfer_events
  for select to authenticated using (public.can_see_transfer(transfer_id));

create policy "standing_orders_read" on public.standing_orders
  for select to authenticated
  using (public.has_location_access(from_location_id) or public.has_location_access(to_location_id));

-- All writes go through the functions above.
revoke insert, update, delete, truncate on public.production_runs from anon, authenticated;
revoke insert, update, delete, truncate on public.transfers from anon, authenticated;
revoke insert, update, delete, truncate on public.transfer_lines from anon, authenticated;
revoke insert, update, delete, truncate on public.transfer_line_batches from anon, authenticated;
revoke insert, update, delete, truncate on public.transfer_events from anon, authenticated;
revoke insert, update, delete, truncate on public.standing_orders from anon, authenticated;

-- Internal helpers: not callable through the API.
revoke execute on function public.log_transfer_event(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.replace_transfer_lines(uuid, jsonb, boolean) from public, anon, authenticated;
revoke execute on function public.next_transfer_code() from public, anon, authenticated;

-- Callable by signed-in users (each checks permissions itself).
revoke execute on function public.can_work_location(uuid) from public, anon;
grant execute on function public.can_work_location(uuid) to authenticated;
revoke execute on function public.can_see_transfer(uuid) from public, anon;
grant execute on function public.can_see_transfer(uuid) to authenticated;
revoke execute on function public.can_edit_transfer(uuid, uuid, public.transfer_origin, public.transfer_status) from public, anon;
grant execute on function public.can_edit_transfer(uuid, uuid, public.transfer_origin, public.transfer_status) to authenticated;
revoke execute on function public.log_production(uuid, uuid, numeric, date, date, text) from public, anon;
grant execute on function public.log_production(uuid, uuid, numeric, date, date, text) to authenticated;
revoke execute on function public.void_production_run(uuid, text) from public, anon;
grant execute on function public.void_production_run(uuid, text) to authenticated;
revoke execute on function public.save_transfer(jsonb, jsonb, uuid) from public, anon;
grant execute on function public.save_transfer(jsonb, jsonb, uuid) to authenticated;
revoke execute on function public.submit_transfer(uuid) from public, anon;
grant execute on function public.submit_transfer(uuid) to authenticated;
revoke execute on function public.approve_transfer(uuid, jsonb) from public, anon;
grant execute on function public.approve_transfer(uuid, jsonb) to authenticated;
revoke execute on function public.reject_transfer(uuid, text) from public, anon;
grant execute on function public.reject_transfer(uuid, text) to authenticated;
revoke execute on function public.cancel_transfer(uuid, text) from public, anon;
grant execute on function public.cancel_transfer(uuid, text) to authenticated;
revoke execute on function public.start_picking(uuid) from public, anon;
grant execute on function public.start_picking(uuid) to authenticated;
revoke execute on function public.dispatch_transfer(uuid, jsonb) from public, anon;
grant execute on function public.dispatch_transfer(uuid, jsonb) to authenticated;
revoke execute on function public.receive_transfer(uuid, jsonb) from public, anon;
grant execute on function public.receive_transfer(uuid, jsonb) to authenticated;
revoke execute on function public.save_standing_orders(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_standing_orders(uuid, uuid, jsonb) to authenticated;
revoke execute on function public.generate_standing_transfers(date) from public, anon;
grant execute on function public.generate_standing_transfers(date) to authenticated;
revoke execute on function public.production_plan(uuid, date) from public, anon;
grant execute on function public.production_plan(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Schedule: create tomorrow's standing-order transfers every hour.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'generate-standing-transfers',
  '5 * * * *',
  'select public.generate_standing_transfers()'
);
