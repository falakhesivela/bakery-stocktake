-- Phase 3: store daily operations — end-of-day sales, waste, stock takes and
-- the daily summary (opening + in − out = expected vs counted).
--
-- Business day: every stock movement belongs to a business day at its
-- location. It defaults to the local date when the movement is recorded, but
-- sales use the day they were made, bakes the bake date, and count
-- adjustments the day that was counted. A closing count for day D is
-- compared with all movements of day D and earlier, so it doesn't matter
-- whether the day's sales were typed in before or after counting.

-- ---------------------------------------------------------------------------
-- Business day on the ledger
-- ---------------------------------------------------------------------------
alter table public.stock_movements add column business_date date;

-- Backfill existing rows (the ledger is append-only, so pause that guard).
alter table public.stock_movements disable trigger stock_movements_append_only;
update public.stock_movements m
set business_date = (m.created_at at time zone l.timezone)::date
from public.locations l
where l.id = m.location_id;
alter table public.stock_movements enable trigger stock_movements_append_only;

create function public.set_movement_business_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.business_date is null then
    select (new.created_at at time zone l.timezone)::date
    into new.business_date
    from public.locations l
    where l.id = new.location_id;
  end if;
  return new;
end;
$$;

create trigger stock_movements_business_date
  before insert on public.stock_movements
  for each row execute function public.set_movement_business_date();

alter table public.stock_movements alter column business_date set not null;

create index stock_movements_location_date_idx
  on public.stock_movements (location_id, business_date);

-- Bakes belong to their bake date (they may be logged later).
create or replace function public.log_production(
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
    location_id, item_id, batch_id, qty, type, reference_type, reference_id, note,
    business_date, created_by
  ) values (
    p_location_id, v_item.id, v_batch_id, p_qty, 'production_in', 'production_run', v_run_id,
    nullif(trim(p_note), ''), v_produced, auth.uid()
  );

  return query select v_run_id, v_batch_id, v_batch_code;
end;
$$;

create or replace function public.void_production_run(p_run_id uuid, p_reason text)
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
    location_id, item_id, batch_id, qty, type, reference_type, reference_id, note,
    business_date, created_by
  ) values (
    v_run.location_id, v_run.item_id, v_run.batch_id, -v_run.qty, 'production_in',
    'production_run', v_run.id, 'Bake undone: ' || trim(p_reason), v_run.produced_on, auth.uid()
  );

  update public.production_runs
  set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason)
  where id = v_run.id;
end;
$$;

-- Today's date at a location.
create function public.location_today(p_location_id uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone l.timezone)::date from public.locations l where l.id = p_location_id;
$$;

-- ---------------------------------------------------------------------------
-- Internal: take stock out oldest batch first.
-- Sales use in-date batches first (earliest best-before first) and only then
-- out-of-date ones, so stock that should have been thrown away still shows
-- up as expired. Waste can ask for expired stock first. Anything beyond what
-- the system knows about is booked without a batch (shows as negative stock
-- until a count corrects it).
-- ---------------------------------------------------------------------------
create function public.take_stock_fefo(
  p_location_id uuid,
  p_item_id uuid,
  p_qty numeric,
  p_type public.movement_type,
  p_reference_type text,
  p_reference_id uuid,
  p_business_date date,
  p_note text default null,
  p_expired_first boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.items;
  v_remaining numeric := p_qty;
  v_row record;
  v_take numeric;
begin
  if p_qty is null or p_qty <= 0 then
    return;
  end if;

  select * into v_item from public.items where id = p_item_id;

  if v_item.track_batches then
    for v_row in
      select sl.id, sl.batch_id, sl.qty
      from public.stock_levels sl
      join public.batches b on b.id = sl.batch_id
      where sl.location_id = p_location_id
        and sl.item_id = p_item_id
        and sl.qty > 0
      order by
        case when p_expired_first then false
             else coalesce(b.best_before < p_business_date, false) end,
        b.best_before nulls last,
        b.produced_on,
        b.code
      for update of sl
    loop
      exit when v_remaining <= 0;
      v_take := least(v_remaining, v_row.qty);
      insert into public.stock_movements (
        location_id, item_id, batch_id, qty, type, reference_type, reference_id, note,
        business_date, created_by
      ) values (
        p_location_id, p_item_id, v_row.batch_id, -v_take, p_type, p_reference_type,
        p_reference_id, p_note, p_business_date, auth.uid()
      );
      v_remaining := v_remaining - v_take;
    end loop;
  end if;

  if v_remaining > 0 then
    insert into public.stock_movements (
      location_id, item_id, batch_id, qty, type, reference_type, reference_id, note,
      business_date, created_by
    ) values (
      p_location_id, p_item_id, null, -v_remaining, p_type, p_reference_type,
      p_reference_id, p_note, p_business_date, auth.uid()
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- End-of-day sales
-- ---------------------------------------------------------------------------
create type public.sales_status as enum ('draft', 'posted');

create table public.sales_days (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete restrict,
  business_date date not null,
  status public.sales_status not null default 'draft',
  note text,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  posted_by uuid references public.profiles (id) on delete set null,
  posted_at timestamptz,
  unique (location_id, business_date)
);

create trigger sales_days_updated_at
  before update on public.sales_days
  for each row execute function public.set_updated_at();

create table public.sales_lines (
  id uuid primary key default gen_random_uuid(),
  sales_day_id uuid not null references public.sales_days (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete restrict,
  qty numeric(14, 3) not null check (qty > 0),
  -- Selling price when the sales were saved (for revenue reports).
  unit_price numeric(12, 2) check (unit_price >= 0),
  unique (sales_day_id, item_id)
);

create index sales_lines_item_idx on public.sales_lines (item_id);

-- Save a day's sales (one per location and day) and optionally post them.
-- p_lines: [{ item_id, qty }]; empty or 0 quantities are ignored. Posting
-- takes the stock out, oldest in-date batch first.
create function public.save_sales_day(
  p_location_id uuid,
  p_business_date date,
  p_lines jsonb,
  p_note text default null,
  p_post boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day public.sales_days;
  v_today date;
  v_line jsonb;
  v_item public.items;
  v_qty numeric;
  v_ids uuid[] := '{}';
  v_sale record;
begin
  if not public.can_work_location(p_location_id) then
    raise exception 'You are not allowed to enter sales at this location' using errcode = '42501';
  end if;

  select (now() at time zone l.timezone)::date into v_today
  from public.locations l where l.id = p_location_id and l.active;
  if v_today is null then
    raise exception 'Location not found or inactive';
  end if;
  if p_business_date is null or p_business_date > v_today then
    raise exception 'Sales can''t be entered for a future date';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Expected a list of sales';
  end if;
  if jsonb_array_length(p_lines) > 2000 then
    raise exception 'Too many lines';
  end if;

  insert into public.sales_days (location_id, business_date, created_by, updated_by)
  values (p_location_id, p_business_date, auth.uid(), auth.uid())
  on conflict (location_id, business_date) do nothing;

  select * into v_day
  from public.sales_days
  where location_id = p_location_id and business_date = p_business_date
  for update;

  if v_day.status = 'posted' then
    raise exception 'Sales for % are already posted. A manager can reopen them to make changes.',
      to_char(p_business_date, 'FMDD Mon YYYY');
  end if;

  update public.sales_days
  set note = nullif(trim(p_note), ''), updated_by = auth.uid()
  where id = v_day.id;

  delete from public.sales_lines where sales_day_id = v_day.id;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_qty := nullif(v_line ->> 'qty', '')::numeric;
    continue when v_qty is null or v_qty = 0;
    if v_qty < 0 then
      raise exception 'Sold quantities can''t be negative';
    end if;

    select * into v_item from public.items where id = nullif(v_line ->> 'item_id', '')::uuid;
    if not found then
      raise exception 'Unknown item on the sales list';
    end if;
    if v_item.id = any (v_ids) then
      raise exception '% is on the list twice', v_item.name;
    end if;
    v_ids := v_ids || v_item.id;

    insert into public.sales_lines (sales_day_id, item_id, qty, unit_price)
    values (v_day.id, v_item.id, v_qty, v_item.price);
  end loop;

  if p_post then
    for v_sale in select * from public.sales_lines where sales_day_id = v_day.id loop
      perform public.take_stock_fefo(
        p_location_id, v_sale.item_id, v_sale.qty, 'sale', 'sales_day', v_day.id, p_business_date
      );
    end loop;

    update public.sales_days
    set status = 'posted', posted_at = now(), posted_by = auth.uid()
    where id = v_day.id;
  end if;

  return v_day.id;
end;
$$;

-- Reopen posted sales so they can be corrected: puts back exactly what was
-- taken out (same batches) and returns the day to draft.
create function public.reopen_sales_day(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day public.sales_days;
begin
  select * into v_day from public.sales_days where id = p_id for update;
  if not found then
    raise exception 'Sales day not found';
  end if;
  if v_day.status <> 'posted' then
    raise exception 'These sales are not posted';
  end if;
  if not public.can_manage_location(v_day.location_id) then
    raise exception 'Only a manager can reopen posted sales' using errcode = '42501';
  end if;

  insert into public.stock_movements (
    location_id, item_id, batch_id, qty, type, reference_type, reference_id, note,
    business_date, created_by
  )
  select
    m.location_id, m.item_id, m.batch_id, -sum(m.qty), 'sale', 'sales_day', p_id,
    'Sales reopened' || coalesce(': ' || nullif(trim(p_reason), ''), ''),
    v_day.business_date, auth.uid()
  from public.stock_movements m
  where m.reference_type = 'sales_day' and m.reference_id = p_id and m.type = 'sale'
  group by m.location_id, m.item_id, m.batch_id
  having sum(m.qty) <> 0;

  update public.sales_days
  set status = 'draft', posted_at = null, posted_by = null, updated_by = auth.uid()
  where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Waste
-- ---------------------------------------------------------------------------
create type public.waste_reason as enum (
  'expired',
  'damaged',
  'unsold',
  'quality',
  'staff_sample',
  'other'
);

create table public.waste_entries (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete restrict,
  item_id uuid not null references public.items (id) on delete restrict,
  -- null for items without batches, or when the oldest stock was taken.
  batch_id uuid,
  qty numeric(14, 3) not null check (qty > 0),
  reason public.waste_reason not null,
  note text,
  photo_path text,
  business_date date not null,
  unit_cost numeric(12, 2),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  void_reason text,
  foreign key (batch_id, item_id) references public.batches (id, item_id)
);

create index waste_entries_location_date_idx
  on public.waste_entries (location_id, business_date desc, created_at desc);

-- Log waste. p_lines: [{ item_id, batch_id?, qty, reason, note?, photo_path? }].
-- Without a batch for a batch-tracked item, the oldest stock is taken
-- (expired first). Returns how many lines were logged.
create function public.log_waste(
  p_location_id uuid,
  p_lines jsonb,
  p_business_date date default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date;
  v_date date;
  v_line jsonb;
  v_item public.items;
  v_batch_id uuid;
  v_qty numeric;
  v_reason public.waste_reason;
  v_note text;
  v_photo text;
  v_id uuid;
  v_count integer := 0;
begin
  if not public.can_work_location(p_location_id) then
    raise exception 'You are not allowed to log waste at this location' using errcode = '42501';
  end if;

  select (now() at time zone l.timezone)::date into v_today
  from public.locations l where l.id = p_location_id and l.active;
  if v_today is null then
    raise exception 'Location not found or inactive';
  end if;

  v_date := coalesce(p_business_date, v_today);
  if v_date > v_today then
    raise exception 'Waste can''t be logged for a future date';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'There is nothing to log';
  end if;
  if jsonb_array_length(p_lines) > 500 then
    raise exception 'Log at most 500 lines at a time';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    select * into v_item from public.items where id = nullif(v_line ->> 'item_id', '')::uuid;
    if not found then
      raise exception 'Choose an item on every line';
    end if;

    v_qty := nullif(v_line ->> 'qty', '')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantity for % must be more than 0', v_item.name;
    end if;

    v_reason := nullif(v_line ->> 'reason', '')::public.waste_reason;
    if v_reason is null then
      raise exception 'Choose a reason for %', v_item.name;
    end if;

    v_note := nullif(trim(v_line ->> 'note'), '');
    v_photo := nullif(trim(v_line ->> 'photo_path'), '');
    if v_photo is not null and v_photo not like p_location_id::text || '/waste/%' then
      raise exception 'That photo doesn''t belong to this location';
    end if;

    v_batch_id := nullif(v_line ->> 'batch_id', '')::uuid;
    if not v_item.track_batches then
      v_batch_id := null;
    elsif v_batch_id is not null and not exists (
      select 1 from public.stock_levels sl
      where sl.location_id = p_location_id and sl.item_id = v_item.id and sl.batch_id = v_batch_id
    ) then
      raise exception 'That batch of % is not at this location', v_item.name;
    end if;

    insert into public.waste_entries (
      location_id, item_id, batch_id, qty, reason, note, photo_path, business_date, unit_cost, created_by
    ) values (
      p_location_id, v_item.id, v_batch_id, v_qty, v_reason, v_note, v_photo, v_date, v_item.cost, auth.uid()
    )
    returning id into v_id;

    if v_batch_id is not null or not v_item.track_batches then
      insert into public.stock_movements (
        location_id, item_id, batch_id, qty, type, reference_type, reference_id, note,
        business_date, created_by
      ) values (
        p_location_id, v_item.id, v_batch_id, -v_qty, 'waste', 'waste_entry', v_id,
        v_note, v_date, auth.uid()
      );
    else
      perform public.take_stock_fefo(
        p_location_id, v_item.id, v_qty, 'waste', 'waste_entry', v_id, v_date, v_note, true
      );
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Undo a waste entry logged by mistake: puts the stock back where it came from.
create function public.void_waste_entry(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.waste_entries;
begin
  select * into v_entry from public.waste_entries where id = p_id for update;
  if not found then
    raise exception 'Waste entry not found';
  end if;
  if not (
    public.can_manage_location(v_entry.location_id)
    or (v_entry.created_by = auth.uid() and public.can_work_location(v_entry.location_id))
  ) then
    raise exception 'Only a manager or the person who logged this can undo it'
      using errcode = '42501';
  end if;
  if v_entry.voided_at is not null then
    raise exception 'This waste entry has already been undone';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'Give a reason for undoing it';
  end if;

  insert into public.stock_movements (
    location_id, item_id, batch_id, qty, type, reference_type, reference_id, note,
    business_date, created_by
  )
  select
    m.location_id, m.item_id, m.batch_id, -sum(m.qty), 'waste', 'waste_entry', p_id,
    'Waste undone: ' || trim(p_reason), v_entry.business_date, auth.uid()
  from public.stock_movements m
  where m.reference_type = 'waste_entry' and m.reference_id = p_id
  group by m.location_id, m.item_id, m.batch_id
  having sum(m.qty) <> 0;

  update public.waste_entries
  set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason)
  where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Stock takes
-- ---------------------------------------------------------------------------
create type public.stock_take_status as enum ('counting', 'submitted', 'approved', 'cancelled');

-- products: products only (the quick daily closing count)
-- all: everything at the location
-- categories: chosen categories
create type public.stock_take_scope as enum ('products', 'all', 'categories');

create sequence public.stock_take_code_seq;

-- Count numbers look like C-00042.
create function public.next_stock_take_code()
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_seq text := nextval('public.stock_take_code_seq')::text;
begin
  return 'C-' || lpad(v_seq, greatest(5, length(v_seq)), '0');
end;
$$;

create table public.stock_takes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default public.next_stock_take_code(),
  location_id uuid not null references public.locations (id) on delete restrict,
  -- The business day this count closes. A count before opening is the
  -- closing count of the previous day.
  count_date date not null,
  scope public.stock_take_scope not null,
  category_ids uuid[] not null default '{}',
  -- Blind: counters don't see the expected quantities (to avoid bias).
  blind boolean not null default false,
  status public.stock_take_status not null default 'counting',
  note text,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_by uuid references public.profiles (id) on delete set null,
  submitted_at timestamptz,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  cancelled_at timestamptz,
  cancel_reason text
);

create index stock_takes_location_idx on public.stock_takes (location_id, count_date desc);

create trigger stock_takes_updated_at
  before update on public.stock_takes
  for each row execute function public.set_updated_at();

create table public.stock_take_lines (
  id uuid primary key default gen_random_uuid(),
  stock_take_id uuid not null references public.stock_takes (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete restrict,
  batch_id uuid,
  counted_qty numeric(14, 3) check (counted_qty >= 0),
  counted_by uuid references public.profiles (id) on delete set null,
  counted_at timestamptz,
  -- Filled in when the count is approved.
  expected_qty numeric(14, 3),
  variance numeric(14, 3),
  unit_cost numeric(12, 2),
  -- Found while counting (wasn't on the list).
  added_during_count boolean not null default false,
  foreign key (batch_id, item_id) references public.batches (id, item_id),
  constraint stock_take_lines_key unique nulls not distinct (stock_take_id, item_id, batch_id)
);

create index stock_take_lines_item_idx on public.stock_take_lines (item_id);

-- Internal: which items a stock take covers.
create function public.stock_take_covers(
  p_scope public.stock_take_scope,
  p_category_ids uuid[],
  p_kind public.item_kind,
  p_category_id uuid
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_scope
    when 'products' then p_kind = 'product'
    when 'categories' then p_category_id = any (p_category_ids)
    else true
  end;
$$;

-- Start a count. Lists every batch in stock for the covered items, plus
-- items without batches (so they can be counted even when the system says 0).
create function public.start_stock_take(
  p_location_id uuid,
  p_count_date date,
  p_scope public.stock_take_scope,
  p_category_ids uuid[] default '{}',
  p_blind boolean default false,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date;
  v_id uuid;
begin
  if not public.can_work_location(p_location_id) then
    raise exception 'You are not allowed to count stock at this location' using errcode = '42501';
  end if;

  select (now() at time zone l.timezone)::date into v_today
  from public.locations l where l.id = p_location_id and l.active;
  if v_today is null then
    raise exception 'Location not found or inactive';
  end if;
  if p_count_date is null or p_count_date > v_today then
    raise exception 'The count date can''t be in the future';
  end if;
  if p_count_date < v_today - 7 then
    raise exception 'The count date can be at most a week ago';
  end if;
  if p_scope is null then
    raise exception 'Choose what to count';
  end if;
  if p_scope = 'categories' and coalesce(cardinality(p_category_ids), 0) = 0 then
    raise exception 'Choose at least one category to count';
  end if;

  insert into public.stock_takes (location_id, count_date, scope, category_ids, blind, note, created_by)
  values (
    p_location_id, p_count_date, p_scope,
    case when p_scope = 'categories' then p_category_ids else '{}' end,
    coalesce(p_blind, false), nullif(trim(p_note), ''), auth.uid()
  )
  returning id into v_id;

  insert into public.stock_take_lines (stock_take_id, item_id, batch_id)
  select v_id, sl.item_id, sl.batch_id
  from public.stock_levels sl
  join public.items i on i.id = sl.item_id
  where sl.location_id = p_location_id
    and sl.qty <> 0
    and public.stock_take_covers(p_scope, p_category_ids, i.kind, i.category_id)
  union
  select v_id, i.id, null
  from public.items i
  where i.active
    and not i.track_batches
    and public.stock_take_covers(p_scope, p_category_ids, i.kind, i.category_id)
  on conflict on constraint stock_take_lines_key do nothing;

  return v_id;
end;
$$;

-- Internal: lock a stock take that is still being counted.
create function public.lock_counting_stock_take(p_id uuid)
returns public.stock_takes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_take public.stock_takes;
begin
  select * into v_take from public.stock_takes where id = p_id for update;
  if not found then
    raise exception 'Count not found';
  end if;
  if not public.can_work_location(v_take.location_id) then
    raise exception 'You are not allowed to count stock at this location' using errcode = '42501';
  end if;
  if v_take.status <> 'counting' then
    raise exception 'This count is %; counting is closed',
      replace(v_take.status::text, '_', ' ');
  end if;
  return v_take;
end;
$$;

-- Set (or clear, with null) the counted quantity on one line.
create function public.set_stock_take_count(p_line_id uuid, p_counted numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_take_id uuid;
begin
  select stock_take_id into v_take_id from public.stock_take_lines where id = p_line_id;
  if v_take_id is null then
    raise exception 'Count line not found';
  end if;
  perform public.lock_counting_stock_take(v_take_id);

  if p_counted is not null and p_counted < 0 then
    raise exception 'Counts can''t be negative';
  end if;

  update public.stock_take_lines
  set counted_qty = p_counted,
      counted_by = case when p_counted is null then null else auth.uid() end,
      counted_at = case when p_counted is null then null else now() end
  where id = p_line_id;
end;
$$;

-- Add to a count by scanning: a batch label (or the barcode of an item
-- without batches) adds p_delta to that line, creating it if it was not on
-- the list.
create function public.add_stock_take_count(
  p_stock_take_id uuid,
  p_code text,
  p_delta numeric default 1
)
returns table (line_id uuid, item_name text, batch_code text, counted_qty numeric)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_take public.stock_takes;
  v_item_id uuid;
  v_batch_id uuid;
  v_item public.items;
  v_line_id uuid;
begin
  v_take := public.lock_counting_stock_take(p_stock_take_id);

  if p_delta is null or p_delta <= 0 then
    raise exception 'Add at least 1';
  end if;

  select f.item_id, f.batch_id into v_item_id, v_batch_id
  from public.find_by_code(p_code) f;
  if v_item_id is null then
    raise exception 'Nothing has the code %', trim(p_code);
  end if;

  select * into v_item from public.items where id = v_item_id;
  if v_item.track_batches and v_batch_id is null then
    raise exception 'Scan the batch label on the % (not the product barcode), or add it as "no label".',
      v_item.name;
  end if;
  if not v_item.track_batches then
    v_batch_id := null;
  end if;

  insert into public.stock_take_lines (
    stock_take_id, item_id, batch_id, counted_qty, counted_by, counted_at, added_during_count
  ) values (
    p_stock_take_id, v_item_id, v_batch_id, p_delta, auth.uid(), now(), true
  )
  on conflict on constraint stock_take_lines_key do update
  set counted_qty = coalesce(public.stock_take_lines.counted_qty, 0) + excluded.counted_qty,
      counted_by = excluded.counted_by,
      counted_at = excluded.counted_at
  returning id into v_line_id;

  return query
  select l.id, i.name, b.code, l.counted_qty
  from public.stock_take_lines l
  join public.items i on i.id = l.item_id
  left join public.batches b on b.id = l.batch_id
  where l.id = v_line_id;
end;
$$;

-- Add an item to the count list (e.g. found stock with no label).
create function public.add_stock_take_line(
  p_stock_take_id uuid,
  p_item_id uuid,
  p_batch_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.lock_counting_stock_take(p_stock_take_id);

  if not exists (select 1 from public.items where id = p_item_id) then
    raise exception 'Unknown item';
  end if;

  insert into public.stock_take_lines (stock_take_id, item_id, batch_id, added_during_count)
  values (p_stock_take_id, p_item_id, p_batch_id, true)
  on conflict on constraint stock_take_lines_key do nothing;

  select id into v_id
  from public.stock_take_lines
  where stock_take_id = p_stock_take_id
    and item_id = p_item_id
    and batch_id is not distinct from p_batch_id;
  return v_id;
end;
$$;

-- Counting finished: hand over to a manager.
create function public.submit_stock_take(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.lock_counting_stock_take(p_id);
  if not exists (
    select 1 from public.stock_take_lines where stock_take_id = p_id and counted_qty is not null
  ) then
    raise exception 'Nothing has been counted yet';
  end if;

  update public.stock_takes
  set status = 'submitted', submitted_at = now(), submitted_by = auth.uid()
  where id = p_id;
end;
$$;

-- Manager sends a submitted count back for recounting.
create function public.return_stock_take(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_take public.stock_takes;
begin
  select * into v_take from public.stock_takes where id = p_id for update;
  if not found then
    raise exception 'Count not found';
  end if;
  if not public.can_manage_location(v_take.location_id) then
    raise exception 'Only a manager can send a count back' using errcode = '42501';
  end if;
  if v_take.status <> 'submitted' then
    raise exception 'Only submitted counts can be sent back';
  end if;

  update public.stock_takes
  set status = 'counting', submitted_at = null, submitted_by = null
  where id = p_id;
end;
$$;

-- Approve: for every counted line, compare with the stock the system has for
-- the count date (all movements of that business day and earlier) and post
-- the difference as a count adjustment dated on the count date. Lines that
-- weren't counted are left alone.
create function public.approve_stock_take(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_take public.stock_takes;
  v_line record;
  v_expected numeric;
  v_variance numeric;
  v_adjusted integer := 0;
begin
  select * into v_take from public.stock_takes where id = p_id for update;
  if not found then
    raise exception 'Count not found';
  end if;
  if not public.can_manage_location(v_take.location_id) then
    raise exception 'Only a manager can approve counts' using errcode = '42501';
  end if;
  if v_take.status not in ('counting', 'submitted') then
    raise exception 'This count is already %', v_take.status;
  end if;
  if not exists (
    select 1 from public.stock_take_lines where stock_take_id = p_id and counted_qty is not null
  ) then
    raise exception 'Nothing has been counted yet';
  end if;
  if exists (
    select 1 from public.stock_takes t
    where t.location_id = v_take.location_id
      and t.status = 'approved'
      and t.count_date > v_take.count_date
  ) then
    raise exception 'A count for a later day is already approved here. Approve counts in date order, or cancel this one.';
  end if;

  for v_line in
    select l.id, l.item_id, l.batch_id, l.counted_qty, i.cost
    from public.stock_take_lines l
    join public.items i on i.id = l.item_id
    where l.stock_take_id = p_id and l.counted_qty is not null
    for update of l
  loop
    select coalesce(sum(m.qty), 0) into v_expected
    from public.stock_movements m
    where m.location_id = v_take.location_id
      and m.item_id = v_line.item_id
      and m.batch_id is not distinct from v_line.batch_id
      and m.business_date <= v_take.count_date;

    v_variance := v_line.counted_qty - v_expected;

    update public.stock_take_lines
    set expected_qty = v_expected, variance = v_variance, unit_cost = v_line.cost
    where id = v_line.id;

    if v_variance <> 0 then
      insert into public.stock_movements (
        location_id, item_id, batch_id, qty, type, reference_type, reference_id, note,
        business_date, created_by
      ) values (
        v_take.location_id, v_line.item_id, v_line.batch_id, v_variance, 'count_adjustment',
        'stock_take', p_id, v_take.code, v_take.count_date, auth.uid()
      );
      v_adjusted := v_adjusted + 1;
    end if;
  end loop;

  update public.stock_takes
  set status = 'approved', approved_at = now(), approved_by = auth.uid()
  where id = p_id;

  return v_adjusted;
end;
$$;

create function public.cancel_stock_take(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_take public.stock_takes;
begin
  select * into v_take from public.stock_takes where id = p_id for update;
  if not found then
    raise exception 'Count not found';
  end if;
  if not public.can_manage_location(v_take.location_id) then
    raise exception 'Only a manager can cancel a count' using errcode = '42501';
  end if;
  if v_take.status not in ('counting', 'submitted') then
    raise exception 'This count is already %', v_take.status;
  end if;

  update public.stock_takes
  set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
      cancel_reason = nullif(trim(p_reason), '')
  where id = p_id;
end;
$$;

-- Lines of a count with the expected quantity: as approved, or (before
-- approval) what the system has for the count date right now.
create function public.stock_take_review(p_id uuid)
returns table (
  line_id uuid,
  item_id uuid,
  sku text,
  item_name text,
  unit public.item_unit,
  kind public.item_kind,
  category_name text,
  track_batches boolean,
  batch_id uuid,
  batch_code text,
  best_before date,
  counted_qty numeric,
  counted_by_name text,
  counted_at timestamptz,
  expected_qty numeric,
  variance numeric,
  unit_cost numeric,
  added_during_count boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    l.id,
    l.item_id,
    i.sku,
    i.name,
    i.unit,
    i.kind,
    c.name,
    i.track_batches,
    l.batch_id,
    b.code,
    b.best_before,
    l.counted_qty,
    p.full_name,
    l.counted_at,
    e.expected,
    case when l.counted_qty is null then null else l.counted_qty - e.expected end,
    coalesce(l.unit_cost, i.cost),
    l.added_during_count
  from public.stock_take_lines l
  join public.stock_takes t on t.id = l.stock_take_id
  join public.items i on i.id = l.item_id
  left join public.categories c on c.id = i.category_id
  left join public.batches b on b.id = l.batch_id
  left join public.profiles p on p.id = l.counted_by
  cross join lateral (
    select case
      when t.status = 'approved' and l.expected_qty is not null then l.expected_qty
      else coalesce((
        select sum(m.qty)
        from public.stock_movements m
        where m.location_id = t.location_id
          and m.item_id = l.item_id
          and m.batch_id is not distinct from l.batch_id
          and m.business_date <= t.count_date
      ), 0)
    end as expected
  ) e
  where l.stock_take_id = p_id
  order by c.name nulls last, i.name, b.best_before nulls last, b.code nulls first;
$$;

-- ---------------------------------------------------------------------------
-- Daily summary for one location and business day:
-- opening + baked + received − sent − sold − wasted ± other = expected
-- closing; count differences turn it into the counted closing stock.
-- ---------------------------------------------------------------------------
create function public.daily_summary(p_location_id uuid, p_date date)
returns table (
  item_id uuid,
  sku text,
  item_name text,
  unit public.item_unit,
  kind public.item_kind,
  unit_cost numeric,
  unit_price numeric,
  opening numeric,
  produced numeric,
  received numeric,
  sent numeric,
  sold numeric,
  wasted numeric,
  other numeric,
  expected_closing numeric,
  count_difference numeric,
  closing numeric,
  counted boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with sums as (
    select
      m.item_id,
      coalesce(sum(m.qty) filter (where m.business_date < p_date), 0) as opening,
      coalesce(sum(m.qty) filter (where m.business_date = p_date and m.type = 'production_in'), 0) as produced,
      coalesce(sum(m.qty) filter (where m.business_date = p_date and m.type in ('transfer_in', 'transfer_loss')), 0) as received,
      coalesce(sum(m.qty) filter (where m.business_date = p_date and m.type = 'transfer_out'), 0) as sent,
      coalesce(sum(m.qty) filter (where m.business_date = p_date and m.type = 'sale'), 0) as sold,
      coalesce(sum(m.qty) filter (where m.business_date = p_date and m.type = 'waste'), 0) as wasted,
      coalesce(sum(m.qty) filter (where m.business_date = p_date and m.type = 'count_adjustment'), 0) as counted_diff,
      coalesce(sum(m.qty) filter (
        where m.business_date = p_date
          and m.type not in ('production_in', 'transfer_in', 'transfer_loss', 'transfer_out',
                             'sale', 'waste', 'count_adjustment')
      ), 0) as other,
      count(*) filter (where m.business_date = p_date) as moves_today
    from public.stock_movements m
    where m.location_id = p_location_id
      and m.business_date <= p_date
    group by m.item_id
  ),
  counted_items as (
    select distinct l.item_id
    from public.stock_take_lines l
    join public.stock_takes t on t.id = l.stock_take_id
    where t.location_id = p_location_id
      and t.count_date = p_date
      and t.status = 'approved'
      and l.counted_qty is not null
  )
  select
    i.id,
    i.sku,
    i.name,
    i.unit,
    i.kind,
    i.cost,
    i.price,
    s.opening,
    s.produced,
    s.received,
    -s.sent,
    -s.sold,
    -s.wasted,
    s.other,
    s.opening + s.produced + s.received + s.sent + s.sold + s.wasted + s.other,
    s.counted_diff,
    s.opening + s.produced + s.received + s.sent + s.sold + s.wasted + s.other + s.counted_diff,
    exists (select 1 from counted_items c where c.item_id = i.id)
  from sums s
  join public.items i on i.id = s.item_id
  where s.opening <> 0 or s.moves_today > 0
  order by i.kind, i.name;
$$;

-- ---------------------------------------------------------------------------
-- Photos (waste, later damage on deliveries). Private bucket; files live
-- under <location id>/..., and only staff of that location can see them.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create function public.photo_location(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;

create policy "photos_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and public.has_location_access(public.photo_location(name)));

create policy "photos_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and public.can_work_location(public.photo_location(name)));

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.sales_days enable row level security;
alter table public.sales_lines enable row level security;
alter table public.waste_entries enable row level security;
alter table public.stock_takes enable row level security;
alter table public.stock_take_lines enable row level security;

create policy "sales_days_read" on public.sales_days
  for select to authenticated using (public.has_location_access(location_id));
create policy "sales_lines_read" on public.sales_lines
  for select to authenticated
  using (exists (
    select 1 from public.sales_days d
    where d.id = sales_day_id and public.has_location_access(d.location_id)
  ));
create policy "waste_entries_read" on public.waste_entries
  for select to authenticated using (public.has_location_access(location_id));
create policy "stock_takes_read" on public.stock_takes
  for select to authenticated using (public.has_location_access(location_id));
create policy "stock_take_lines_read" on public.stock_take_lines
  for select to authenticated
  using (exists (
    select 1 from public.stock_takes t
    where t.id = stock_take_id and public.has_location_access(t.location_id)
  ));

revoke insert, update, delete, truncate on public.sales_days from anon, authenticated;
revoke insert, update, delete, truncate on public.sales_lines from anon, authenticated;
revoke insert, update, delete, truncate on public.waste_entries from anon, authenticated;
revoke insert, update, delete, truncate on public.stock_takes from anon, authenticated;
revoke insert, update, delete, truncate on public.stock_take_lines from anon, authenticated;

-- Internal helpers.
revoke execute on function public.take_stock_fefo(uuid, uuid, numeric, public.movement_type, text, uuid, date, text, boolean) from public, anon, authenticated;
revoke execute on function public.lock_counting_stock_take(uuid) from public, anon, authenticated;
revoke execute on function public.next_stock_take_code() from public, anon, authenticated;

-- Callable by signed-in users (each checks permissions itself).
revoke execute on function public.location_today(uuid) from public, anon;
grant execute on function public.location_today(uuid) to authenticated;
revoke execute on function public.stock_take_covers(public.stock_take_scope, uuid[], public.item_kind, uuid) from public, anon;
grant execute on function public.stock_take_covers(public.stock_take_scope, uuid[], public.item_kind, uuid) to authenticated;
revoke execute on function public.photo_location(text) from public, anon;
grant execute on function public.photo_location(text) to authenticated;
revoke execute on function public.save_sales_day(uuid, date, jsonb, text, boolean) from public, anon;
grant execute on function public.save_sales_day(uuid, date, jsonb, text, boolean) to authenticated;
revoke execute on function public.reopen_sales_day(uuid, text) from public, anon;
grant execute on function public.reopen_sales_day(uuid, text) to authenticated;
revoke execute on function public.log_waste(uuid, jsonb, date) from public, anon;
grant execute on function public.log_waste(uuid, jsonb, date) to authenticated;
revoke execute on function public.void_waste_entry(uuid, text) from public, anon;
grant execute on function public.void_waste_entry(uuid, text) to authenticated;
revoke execute on function public.start_stock_take(uuid, date, public.stock_take_scope, uuid[], boolean, text) from public, anon;
grant execute on function public.start_stock_take(uuid, date, public.stock_take_scope, uuid[], boolean, text) to authenticated;
revoke execute on function public.set_stock_take_count(uuid, numeric) from public, anon;
grant execute on function public.set_stock_take_count(uuid, numeric) to authenticated;
revoke execute on function public.add_stock_take_count(uuid, text, numeric) from public, anon;
grant execute on function public.add_stock_take_count(uuid, text, numeric) to authenticated;
revoke execute on function public.add_stock_take_line(uuid, uuid, uuid) from public, anon;
grant execute on function public.add_stock_take_line(uuid, uuid, uuid) to authenticated;
revoke execute on function public.submit_stock_take(uuid) from public, anon;
grant execute on function public.submit_stock_take(uuid) to authenticated;
revoke execute on function public.return_stock_take(uuid) from public, anon;
grant execute on function public.return_stock_take(uuid) to authenticated;
revoke execute on function public.approve_stock_take(uuid) from public, anon;
grant execute on function public.approve_stock_take(uuid) to authenticated;
revoke execute on function public.cancel_stock_take(uuid, text) from public, anon;
grant execute on function public.cancel_stock_take(uuid, text) to authenticated;
revoke execute on function public.stock_take_review(uuid) from public, anon;
grant execute on function public.stock_take_review(uuid) to authenticated;
revoke execute on function public.daily_summary(uuid, date) from public, anon;
grant execute on function public.daily_summary(uuid, date) to authenticated;
