-- Phase 5: customer orders — custom cakes and pre-orders.
--
-- Flow: new → confirmed → ready → collected (or cancelled).
--   * Confirmed orders are on the bakery's production plan for their pickup day.
--   * "Ready" at the bakery puts the order on the next delivery to the pickup
--     store (an approved transfer for that day, or a new one).
--   * Collecting takes the items out of the pickup store's stock.
-- Custom cakes are catalogue items marked "made to order" (e.g. Custom cake);
-- their size, flavour, wording and photo are stored on the order line.

-- ---------------------------------------------------------------------------
-- Made-to-order items
-- ---------------------------------------------------------------------------
alter table public.items add column made_to_order boolean not null default false;

create or replace function public.save_item(p_item jsonb, p_barcodes text[], p_id uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_barcodes text[];
begin
  if not public.is_admin() then
    raise exception 'Only admins can change the catalogue' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct trim(b)), '{}')
  into v_barcodes
  from unnest(coalesce(p_barcodes, '{}')) as b
  where length(trim(b)) > 0;

  if p_id is null then
    insert into public.items (
      sku, name, kind, category_id, unit, shelf_life_days, track_batches,
      cost, price, notes, active, made_to_order
    ) values (
      trim(p_item ->> 'sku'),
      trim(p_item ->> 'name'),
      (p_item ->> 'kind')::public.item_kind,
      nullif(p_item ->> 'category_id', '')::uuid,
      (p_item ->> 'unit')::public.item_unit,
      nullif(p_item ->> 'shelf_life_days', '')::integer,
      coalesce((p_item ->> 'track_batches')::boolean, true),
      nullif(p_item ->> 'cost', '')::numeric,
      nullif(p_item ->> 'price', '')::numeric,
      nullif(trim(p_item ->> 'notes'), ''),
      coalesce((p_item ->> 'active')::boolean, true),
      coalesce((p_item ->> 'made_to_order')::boolean, false)
    )
    returning id into v_id;
  else
    update public.items set
      sku = trim(p_item ->> 'sku'),
      name = trim(p_item ->> 'name'),
      kind = (p_item ->> 'kind')::public.item_kind,
      category_id = nullif(p_item ->> 'category_id', '')::uuid,
      unit = (p_item ->> 'unit')::public.item_unit,
      shelf_life_days = nullif(p_item ->> 'shelf_life_days', '')::integer,
      track_batches = coalesce((p_item ->> 'track_batches')::boolean, true),
      cost = nullif(p_item ->> 'cost', '')::numeric,
      price = nullif(p_item ->> 'price', '')::numeric,
      notes = nullif(trim(p_item ->> 'notes'), ''),
      active = coalesce((p_item ->> 'active')::boolean, true),
      made_to_order = coalesce((p_item ->> 'made_to_order')::boolean, false)
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Item not found';
    end if;
  end if;

  if exists (
    select 1 from public.item_barcodes ib
    where ib.barcode = any (v_barcodes) and ib.item_id <> v_id
  ) then
    raise exception 'A barcode is already used by another item'
      using errcode = '23505', constraint = 'item_barcodes_pkey';
  end if;

  delete from public.item_barcodes
  where item_id = v_id and barcode <> all (v_barcodes);

  insert into public.item_barcodes (barcode, item_id)
  select b, v_id from unnest(v_barcodes) as b
  on conflict (barcode) do nothing;

  return v_id;
end;
$$;

-- Anyone with a working role somewhere (not driver-only).
create function public.is_staff()
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
    where ul.user_id = auth.uid() and ul.role <> 'driver' and p.active
  );
$$;

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  phone text,
  -- The last 9 digits, to find returning customers however the number was
  -- typed ("082 555 1234", "+27 82 555 1234" and "0825551234" all match).
  phone_key text generated always as (
    nullif(right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9), '')
  ) stored,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_phone_idx on public.customers (phone_key);

create trigger customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create type public.order_status as enum ('new', 'confirmed', 'ready', 'collected', 'cancelled');

create sequence public.customer_order_code_seq;

-- Order numbers look like O-00042.
create function public.next_customer_order_code()
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_seq text := nextval('public.customer_order_code_seq')::text;
begin
  return 'O-' || lpad(v_seq, greatest(5, length(v_seq)), '0');
end;
$$;

create table public.customer_orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default public.next_customer_order_code(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  taken_at_location_id uuid not null references public.locations (id) on delete restrict,
  pickup_location_id uuid not null references public.locations (id) on delete restrict,
  -- Where it is made (a bakery), or the pickup store itself for shelf items.
  fulfil_location_id uuid not null references public.locations (id) on delete restrict,
  pickup_date date not null,
  pickup_time time,
  status public.order_status not null default 'new',
  notes text,
  deposit numeric(12, 2) not null default 0 check (deposit >= 0),
  paid_on_collection numeric(12, 2) check (paid_on_collection >= 0),
  -- The delivery that takes it to the pickup store.
  transfer_id uuid references public.transfers (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles (id) on delete set null,
  ready_at timestamptz,
  ready_by uuid references public.profiles (id) on delete set null,
  collected_at timestamptz,
  collected_by uuid references public.profiles (id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  cancel_reason text
);

create index customer_orders_pickup_idx on public.customer_orders (pickup_location_id, pickup_date);
create index customer_orders_fulfil_idx on public.customer_orders (fulfil_location_id, pickup_date);
create index customer_orders_transfer_idx on public.customer_orders (transfer_id);
create index customer_orders_customer_idx on public.customer_orders (customer_id);

create trigger customer_orders_updated_at
  before update on public.customer_orders
  for each row execute function public.set_updated_at();

create table public.customer_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.customer_orders (id) on delete cascade,
  position smallint not null default 0,
  item_id uuid not null references public.items (id) on delete restrict,
  qty numeric(14, 3) not null check (qty > 0),
  unit_price numeric(12, 2) not null default 0 check (unit_price >= 0),
  -- Custom cake details: { size, flavour, filling, inscription, notes }.
  details jsonb,
  photo_path text
);

create index customer_order_lines_order_idx on public.customer_order_lines (order_id, position);

create function public.can_see_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.customer_orders o
    where o.id = p_order_id
      and (public.has_location_access(o.taken_at_location_id)
           or public.has_location_access(o.pickup_location_id)
           or public.has_location_access(o.fulfil_location_id))
  );
$$;

-- Internal: the default bakery for an order picked up at p_pickup.
create function public.default_fulfil_location(p_pickup uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select id from public.locations where id = p_pickup and can_produce and active),
    (select id from public.locations where can_produce and active order by type, name limit 1),
    p_pickup
  );
$$;

-- Create (p_id null) or change an order that isn't ready yet.
-- p_order keys: customer_name, customer_phone, customer_email,
--   taken_at_location_id (new orders), pickup_location_id,
--   fulfil_location_id (optional), pickup_date, pickup_time, notes, deposit,
--   confirm (true = confirmed straight away).
-- p_lines: [{ item_id, qty, unit_price?, details?, photo_path? }]
create function public.save_customer_order(p_order jsonb, p_lines jsonb, p_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.customer_orders;
  v_taken uuid;
  v_pickup uuid;
  v_fulfil uuid;
  v_today date;
  v_date date;
  v_name text;
  v_phone text;
  v_email text;
  v_customer_id uuid;
  v_line jsonb;
  v_item public.items;
  v_qty numeric;
  v_price numeric;
  v_photo text;
  v_position smallint := 0;
  v_deposit numeric;
begin
  if p_id is not null then
    select * into v_order from public.customer_orders where id = p_id for update;
    if not found then
      raise exception 'Order not found';
    end if;
    if v_order.status not in ('new', 'confirmed') then
      raise exception 'This order is % and can''t be changed any more', v_order.status;
    end if;
    if not (public.can_work_location(v_order.taken_at_location_id)
            or public.can_work_location(v_order.pickup_location_id)) then
      raise exception 'You can''t change this order' using errcode = '42501';
    end if;
    v_taken := v_order.taken_at_location_id;
  else
    v_taken := nullif(p_order ->> 'taken_at_location_id', '')::uuid;
    if v_taken is null or not public.can_work_location(v_taken) then
      raise exception 'You can only take orders at a location you work at' using errcode = '42501';
    end if;
  end if;

  v_pickup := nullif(p_order ->> 'pickup_location_id', '')::uuid;
  if v_pickup is null or not exists (select 1 from public.locations where id = v_pickup and active) then
    raise exception 'Choose where the customer will collect the order';
  end if;

  v_fulfil := coalesce(nullif(p_order ->> 'fulfil_location_id', '')::uuid, public.default_fulfil_location(v_pickup));
  if v_fulfil <> v_pickup and not exists (
    select 1 from public.locations where id = v_fulfil and active and can_produce
  ) then
    raise exception 'Orders are made at a bakery, or taken from the pickup store''s shelf';
  end if;

  v_today := public.location_today(v_pickup);
  v_date := nullif(p_order ->> 'pickup_date', '')::date;
  if v_date is null then
    raise exception 'Choose the pickup date';
  end if;
  if v_date < v_today and (p_id is null or v_date <> v_order.pickup_date) then
    raise exception 'The pickup date can''t be in the past';
  end if;

  v_name := nullif(trim(p_order ->> 'customer_name'), '');
  if v_name is null then
    raise exception 'Enter the customer''s name';
  end if;
  v_phone := nullif(trim(p_order ->> 'customer_phone'), '');
  v_email := nullif(trim(p_order ->> 'customer_email'), '');

  v_deposit := coalesce(nullif(p_order ->> 'deposit', '')::numeric, 0);
  if v_deposit < 0 then
    raise exception 'The deposit can''t be negative';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one item to the order';
  end if;
  if jsonb_array_length(p_lines) > 50 then
    raise exception 'An order can have at most 50 lines';
  end if;

  -- Returning customers are found by phone number.
  if v_phone is not null and length(regexp_replace(v_phone, '\D', '', 'g')) >= 6 then
    select id into v_customer_id
    from public.customers
    where phone_key = right(regexp_replace(v_phone, '\D', '', 'g'), 9)
    order by created_at
    limit 1;
  end if;
  if p_id is not null and v_customer_id is null and v_phone is null then
    v_customer_id := v_order.customer_id;
  end if;

  if v_customer_id is null then
    insert into public.customers (name, phone, email)
    values (v_name, v_phone, v_email)
    returning id into v_customer_id;
  else
    update public.customers
    set name = v_name, phone = coalesce(v_phone, phone), email = coalesce(v_email, email)
    where id = v_customer_id;
  end if;

  if p_id is null then
    insert into public.customer_orders (
      customer_id, taken_at_location_id, pickup_location_id, fulfil_location_id,
      pickup_date, pickup_time, notes, deposit, created_by
    ) values (
      v_customer_id, v_taken, v_pickup, v_fulfil,
      v_date, nullif(p_order ->> 'pickup_time', '')::time,
      nullif(trim(p_order ->> 'notes'), ''), v_deposit, auth.uid()
    )
    returning * into v_order;
  else
    update public.customer_orders
    set customer_id = v_customer_id,
        pickup_location_id = v_pickup,
        fulfil_location_id = v_fulfil,
        pickup_date = v_date,
        pickup_time = nullif(p_order ->> 'pickup_time', '')::time,
        notes = nullif(trim(p_order ->> 'notes'), ''),
        deposit = v_deposit
    where id = p_id
    returning * into v_order;
    delete from public.customer_order_lines where order_id = p_id;
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    select * into v_item from public.items where id = nullif(v_line ->> 'item_id', '')::uuid;
    if not found or not v_item.active then
      raise exception 'Choose an item on every line';
    end if;

    v_qty := nullif(v_line ->> 'qty', '')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Enter how many % the customer wants', v_item.name;
    end if;

    v_price := coalesce(nullif(v_line ->> 'unit_price', '')::numeric, v_item.price);
    if v_price is null then
      raise exception 'Enter a price for the %', lower(v_item.name);
    end if;
    if v_price < 0 then
      raise exception 'Prices can''t be negative';
    end if;

    v_photo := nullif(trim(v_line ->> 'photo_path'), '');
    if v_photo is not null and v_photo not like 'orders/%' then
      raise exception 'That photo can''t be used on an order';
    end if;

    insert into public.customer_order_lines (order_id, position, item_id, qty, unit_price, details, photo_path)
    values (
      v_order.id, v_position, v_item.id, v_qty, v_price,
      case when jsonb_typeof(v_line -> 'details') = 'object' then v_line -> 'details' end,
      v_photo
    );
    v_position := v_position + 1;
  end loop;

  if coalesce((p_order ->> 'confirm')::boolean, false) and v_order.status = 'new' then
    update public.customer_orders
    set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid()
    where id = v_order.id;
  end if;

  return v_order.id;
end;
$$;

create function public.confirm_customer_order(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.customer_orders;
begin
  select * into v_order from public.customer_orders where id = p_id for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if v_order.status <> 'new' then
    raise exception 'Only new orders can be confirmed';
  end if;
  if not (public.can_work_location(v_order.taken_at_location_id)
          or public.can_work_location(v_order.pickup_location_id)) then
    raise exception 'You can''t confirm this order' using errcode = '42501';
  end if;
  update public.customer_orders
  set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid()
  where id = p_id;
end;
$$;

-- The bakery has made the order. If it's collected somewhere else, it goes
-- onto the delivery to that store: an approved/picking transfer due the day
-- before or on the pickup day, or else a new one. Returns the transfer code.
create function public.mark_order_ready(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.customer_orders;
  v_transfer public.transfers;
  v_line record;
begin
  select * into v_order from public.customer_orders where id = p_id for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if v_order.status = 'new' then
    raise exception 'Confirm the order before marking it ready';
  end if;
  if v_order.status <> 'confirmed' then
    raise exception 'This order is already %', v_order.status;
  end if;
  if not public.can_work_location(v_order.fulfil_location_id) then
    raise exception 'Only staff where the order is made can mark it ready' using errcode = '42501';
  end if;

  update public.customer_orders
  set status = 'ready', ready_at = now(), ready_by = auth.uid()
  where id = p_id;

  if v_order.fulfil_location_id = v_order.pickup_location_id then
    return null;
  end if;

  select * into v_transfer
  from public.transfers t
  where t.from_location_id = v_order.fulfil_location_id
    and t.to_location_id = v_order.pickup_location_id
    and t.status in ('approved', 'picking')
    and t.needed_on between v_order.pickup_date - 1 and v_order.pickup_date
  order by t.needed_on desc, t.created_at
  limit 1
  for update;

  if not found then
    insert into public.transfers (
      from_location_id, to_location_id, origin, status, needed_on, note, created_by
    ) values (
      v_order.fulfil_location_id, v_order.pickup_location_id, 'push', 'approved',
      v_order.pickup_date, 'Customer order ' || v_order.code, auth.uid()
    )
    returning * into v_transfer;
    perform public.log_transfer_event(v_transfer.id, 'created', 'For customer order ' || v_order.code);
  end if;

  for v_line in
    select item_id, sum(qty) as qty
    from public.customer_order_lines
    where order_id = p_id
    group by item_id
  loop
    insert into public.transfer_lines (transfer_id, item_id, qty)
    values (v_transfer.id, v_line.item_id, v_line.qty)
    on conflict (transfer_id, item_id)
    do update set qty = public.transfer_lines.qty + excluded.qty;
  end loop;

  perform public.log_transfer_event(v_transfer.id, 'updated', 'Added customer order ' || v_order.code);

  update public.customer_orders set transfer_id = v_transfer.id where id = p_id;
  return v_transfer.code;
end;
$$;

-- The customer collected the order: the items leave the pickup store's stock.
create function public.collect_customer_order(p_id uuid, p_paid numeric default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.customer_orders;
  v_line record;
  v_today date;
begin
  select * into v_order from public.customer_orders where id = p_id for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if v_order.status not in ('confirmed', 'ready') then
    raise exception 'This order is % and can''t be collected', v_order.status;
  end if;
  -- Orders made at a bakery must be marked ready (made) first; orders from
  -- the store's own shelf can be handed over straight away.
  if v_order.status = 'confirmed' and v_order.fulfil_location_id <> v_order.pickup_location_id then
    raise exception 'This order hasn''t been made yet. The bakery marks it ready when it''s done.';
  end if;
  if not public.can_work_location(v_order.pickup_location_id) then
    raise exception 'Only staff at the pickup store can hand over this order' using errcode = '42501';
  end if;
  if p_paid is not null and p_paid < 0 then
    raise exception 'The amount paid can''t be negative';
  end if;

  v_today := public.location_today(v_order.pickup_location_id);

  for v_line in
    select item_id, sum(qty) as qty
    from public.customer_order_lines
    where order_id = p_id
    group by item_id
  loop
    perform public.take_stock_fefo(
      v_order.pickup_location_id, v_line.item_id, v_line.qty, 'order_fulfilled',
      'customer_order', p_id, v_today, v_order.code
    );
  end loop;

  update public.customer_orders
  set status = 'collected', collected_at = now(), collected_by = auth.uid(),
      paid_on_collection = coalesce(p_paid, 0)
  where id = p_id;
end;
$$;

-- Cancel before collection. If the order is on a delivery that hasn't left
-- yet, its quantities come off that delivery again.
create function public.cancel_customer_order(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.customer_orders;
  v_transfer public.transfers;
  v_line record;
begin
  select * into v_order from public.customer_orders where id = p_id for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if v_order.status in ('collected', 'cancelled') then
    raise exception 'This order is already %', v_order.status;
  end if;

  if v_order.status = 'ready' then
    if not (public.can_manage_location(v_order.pickup_location_id)
            or public.can_manage_location(v_order.fulfil_location_id)
            or public.can_manage_location(v_order.taken_at_location_id)) then
      raise exception 'Only a manager can cancel an order that is already made' using errcode = '42501';
    end if;
  elsif not (public.can_work_location(v_order.taken_at_location_id)
             or public.can_work_location(v_order.pickup_location_id)) then
    raise exception 'You can''t cancel this order' using errcode = '42501';
  end if;

  if v_order.transfer_id is not null then
    select * into v_transfer from public.transfers where id = v_order.transfer_id for update;
    if found and v_transfer.status in ('approved', 'picking') then
      for v_line in
        select item_id, sum(qty) as qty
        from public.customer_order_lines
        where order_id = p_id
        group by item_id
      loop
        update public.transfer_lines
        set qty = greatest(qty - v_line.qty, 0)
        where transfer_id = v_transfer.id and item_id = v_line.item_id;
      end loop;
      delete from public.transfer_lines
      where transfer_id = v_transfer.id and qty = 0 and requested_qty is null;
      perform public.log_transfer_event(v_transfer.id, 'updated', 'Removed cancelled customer order ' || v_order.code);
    end if;
  end if;

  update public.customer_orders
  set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
      cancel_reason = nullif(trim(p_reason), '')
  where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Production plan: confirmed orders count as needed on their pickup day.
-- ---------------------------------------------------------------------------
create or replace function public.production_plan(p_location_id uuid, p_date date)
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
  with demand as (
    select tl.item_id, tl.qty
    from public.transfers t
    join public.transfer_lines tl on tl.transfer_id = t.id
    where t.from_location_id = p_location_id
      and t.status in ('requested', 'approved', 'picking')
      and coalesce(t.needed_on, p_date) <= p_date
    union all
    select l.item_id, l.qty
    from public.customer_orders o
    join public.customer_order_lines l on l.order_id = o.id
    where o.fulfil_location_id = p_location_id
      and o.status = 'confirmed'
      and o.pickup_date <= p_date
  ),
  needed as (
    select d.item_id, sum(d.qty) as qty from demand d group by d.item_id
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

-- Daily summary: collected customer orders count as sold.
create or replace function public.daily_summary(p_location_id uuid, p_date date)
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
      coalesce(sum(m.qty) filter (
        where m.business_date = p_date and m.type in ('transfer_in', 'transfer_loss', 'purchase_in')
      ), 0) as received,
      coalesce(sum(m.qty) filter (where m.business_date = p_date and m.type = 'transfer_out'), 0) as sent,
      coalesce(sum(m.qty) filter (
        where m.business_date = p_date and m.type in ('sale', 'order_fulfilled')
      ), 0) as sold,
      coalesce(sum(m.qty) filter (where m.business_date = p_date and m.type = 'waste'), 0) as wasted,
      coalesce(sum(m.qty) filter (where m.business_date = p_date and m.type = 'count_adjustment'), 0) as counted_diff,
      coalesce(sum(m.qty) filter (
        where m.business_date = p_date
          and m.type not in ('production_in', 'transfer_in', 'transfer_loss', 'purchase_in',
                             'transfer_out', 'sale', 'order_fulfilled', 'waste', 'count_adjustment')
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
-- Order photos live under photos/orders/…; the person who uploaded one can
-- see it straight away, and once on an order everyone who can see the order
-- can (the bakery needs the reference picture).
-- ---------------------------------------------------------------------------
create function public.can_see_order_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.customer_order_lines l
    where l.photo_path = p_name and public.can_see_order(l.order_id)
  );
$$;

create policy "order_photos_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and name like 'orders/%' and public.is_staff());

create policy "order_photos_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and name like 'orders/%'
    and (owner_id = auth.uid()::text or public.can_see_order_photo(name))
  );

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.customers enable row level security;
alter table public.customer_orders enable row level security;
alter table public.customer_order_lines enable row level security;

-- Any store or bakery staff may look up customers (orders are taken anywhere).
create policy "customers_read" on public.customers
  for select to authenticated using (public.is_staff());
create policy "customer_orders_read" on public.customer_orders
  for select to authenticated using (public.can_see_order(id));
create policy "customer_order_lines_read" on public.customer_order_lines
  for select to authenticated using (public.can_see_order(order_id));

revoke insert, update, delete, truncate on public.customers from anon, authenticated;
revoke insert, update, delete, truncate on public.customer_orders from anon, authenticated;
revoke insert, update, delete, truncate on public.customer_order_lines from anon, authenticated;

revoke execute on function public.next_customer_order_code() from public, anon, authenticated;
revoke execute on function public.default_fulfil_location(uuid) from public, anon, authenticated;

revoke execute on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;
revoke execute on function public.can_see_order(uuid) from public, anon;
grant execute on function public.can_see_order(uuid) to authenticated;
revoke execute on function public.can_see_order_photo(text) from public, anon;
grant execute on function public.can_see_order_photo(text) to authenticated;
revoke execute on function public.save_customer_order(jsonb, jsonb, uuid) from public, anon;
grant execute on function public.save_customer_order(jsonb, jsonb, uuid) to authenticated;
revoke execute on function public.confirm_customer_order(uuid) from public, anon;
grant execute on function public.confirm_customer_order(uuid) to authenticated;
revoke execute on function public.mark_order_ready(uuid) from public, anon;
grant execute on function public.mark_order_ready(uuid) to authenticated;
revoke execute on function public.collect_customer_order(uuid, numeric) from public, anon;
grant execute on function public.collect_customer_order(uuid, numeric) to authenticated;
revoke execute on function public.cancel_customer_order(uuid, text) from public, anon;
grant execute on function public.cancel_customer_order(uuid, text) to authenticated;
