-- Phase 6: reports, suggested standing orders, notifications and audit log.
--
-- Reports are functions run as the signed-in user (security invoker), so
-- row-level security limits them to the user's own locations.

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------

-- Stock movements per location and item over a range of business days.
-- Quantities out are positive numbers (sold 5, not -5).
create function public.report_movements(p_from date, p_to date, p_location_id uuid default null)
returns table (
  location_id uuid,
  location_code text,
  location_name text,
  location_type public.location_type,
  item_id uuid,
  sku text,
  item_name text,
  kind public.item_kind,
  unit public.item_unit,
  category_name text,
  unit_cost numeric,
  unit_price numeric,
  produced numeric,
  received numeric,
  sent numeric,
  sold numeric,
  ordered numeric,
  wasted numeric,
  used numeric,
  count_difference numeric,
  other numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    l.id, l.code, l.name, l.type,
    i.id, i.sku, i.name, i.kind, i.unit, c.name, i.cost, i.price,
    coalesce(sum(m.qty) filter (where m.type = 'production_in'), 0),
    coalesce(sum(m.qty) filter (where m.type in ('transfer_in', 'transfer_loss', 'purchase_in')), 0),
    coalesce(-sum(m.qty) filter (where m.type = 'transfer_out'), 0),
    coalesce(-sum(m.qty) filter (where m.type = 'sale'), 0),
    coalesce(-sum(m.qty) filter (where m.type = 'order_fulfilled'), 0),
    coalesce(-sum(m.qty) filter (where m.type = 'waste'), 0),
    coalesce(-sum(m.qty) filter (where m.type = 'ingredient_use'), 0),
    coalesce(sum(m.qty) filter (where m.type = 'count_adjustment'), 0),
    coalesce(sum(m.qty) filter (where m.type in ('opening_balance', 'manual_adjustment')), 0)
  from public.stock_movements m
  join public.locations l on l.id = m.location_id
  join public.items i on i.id = m.item_id
  left join public.categories c on c.id = i.category_id
  where m.business_date between p_from and p_to
    and (p_location_id is null or m.location_id = p_location_id)
  group by l.id, l.code, l.name, l.type, i.id, i.sku, i.name, i.kind, i.unit, c.name, i.cost, i.price
  order by l.code, i.kind, i.name;
$$;

-- Waste by location, item and reason.
create function public.report_waste(p_from date, p_to date, p_location_id uuid default null)
returns table (
  location_id uuid,
  location_code text,
  item_id uuid,
  sku text,
  item_name text,
  kind public.item_kind,
  unit public.item_unit,
  category_name text,
  reason public.waste_reason,
  entries bigint,
  qty numeric,
  cost_value numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    l.id, l.code, i.id, i.sku, i.name, i.kind, i.unit, c.name, w.reason,
    count(*),
    sum(w.qty),
    sum(w.qty * coalesce(w.unit_cost, i.cost, 0))
  from public.waste_entries w
  join public.locations l on l.id = w.location_id
  join public.items i on i.id = w.item_id
  left join public.categories c on c.id = i.category_id
  where w.voided_at is null
    and w.business_date between p_from and p_to
    and (p_location_id is null or w.location_id = p_location_id)
  group by l.id, l.code, i.id, i.sku, i.name, i.kind, i.unit, c.name, w.reason
  order by sum(w.qty * coalesce(w.unit_cost, i.cost, 0)) desc;
$$;

-- Differences found by approved stock takes.
create function public.report_count_differences(p_from date, p_to date, p_location_id uuid default null)
returns table (
  stock_take_id uuid,
  code text,
  count_date date,
  location_code text,
  item_id uuid,
  sku text,
  item_name text,
  unit public.item_unit,
  batch_code text,
  expected numeric,
  counted numeric,
  difference numeric,
  value numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.id, t.code, t.count_date, lo.code,
    i.id, i.sku, i.name, i.unit, b.code,
    l.expected_qty, l.counted_qty, l.variance,
    l.variance * coalesce(l.unit_cost, i.cost, 0)
  from public.stock_take_lines l
  join public.stock_takes t on t.id = l.stock_take_id and t.status = 'approved'
  join public.locations lo on lo.id = t.location_id
  join public.items i on i.id = l.item_id
  left join public.batches b on b.id = l.batch_id
  where t.count_date between p_from and p_to
    and (p_location_id is null or t.location_id = p_location_id)
    and l.counted_qty is not null
    and l.variance <> 0
  order by t.count_date desc, abs(l.variance * coalesce(l.unit_cost, i.cost, 0)) desc;
$$;

-- Deliveries that arrived short, damaged or with extra.
create function public.report_transfer_differences(p_from date, p_to date, p_location_id uuid default null)
returns table (
  transfer_id uuid,
  code text,
  received_on date,
  from_code text,
  to_code text,
  item_id uuid,
  sku text,
  item_name text,
  unit public.item_unit,
  batch_code text,
  sent numeric,
  received numeric,
  difference numeric,
  reason public.discrepancy_reason,
  note text,
  value numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.id, t.code, (t.received_at at time zone lt.timezone)::date, lf.code, lt.code,
    i.id, i.sku, i.name, i.unit, b.code,
    tlb.dispatched_qty, tlb.received_qty, tlb.received_qty - tlb.dispatched_qty,
    tlb.discrepancy_reason, tlb.discrepancy_note,
    (tlb.received_qty - tlb.dispatched_qty) * coalesce(i.cost, 0)
  from public.transfer_line_batches tlb
  join public.transfer_lines tl on tl.id = tlb.line_id
  join public.transfers t on t.id = tl.transfer_id and t.status = 'received'
  join public.locations lf on lf.id = t.from_location_id
  join public.locations lt on lt.id = t.to_location_id
  join public.items i on i.id = tlb.item_id
  left join public.batches b on b.id = tlb.batch_id
  where tlb.discrepancy_reason is not null
    and (t.received_at at time zone lt.timezone)::date between p_from and p_to
    and (p_location_id is null or t.from_location_id = p_location_id or t.to_location_id = p_location_id)
  order by t.received_at desc;
$$;

-- What was baked.
create function public.report_production(p_from date, p_to date, p_location_id uuid default null)
returns table (
  location_id uuid,
  location_code text,
  item_id uuid,
  sku text,
  item_name text,
  unit public.item_unit,
  bakes bigint,
  qty numeric,
  cost_value numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    l.id, l.code, i.id, i.sku, i.name, i.unit,
    count(*), sum(r.qty), sum(r.qty * coalesce(i.cost, 0))
  from public.production_runs r
  join public.locations l on l.id = r.location_id
  join public.items i on i.id = r.item_id
  where r.voided_at is null
    and r.produced_on between p_from and p_to
    and (p_location_id is null or r.location_id = p_location_id)
  group by l.id, l.code, i.id, i.sku, i.name, i.unit
  order by l.code, sum(r.qty) desc;
$$;

-- Customer orders collected (their value comes from the order, not the catalogue).
create function public.report_collected_orders(p_from date, p_to date, p_location_id uuid default null)
returns table (
  location_id uuid,
  location_code text,
  orders bigint,
  value numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    l.id, l.code, count(distinct o.id), coalesce(sum(ol.qty * ol.unit_price), 0)
  from public.customer_orders o
  join public.locations l on l.id = o.pickup_location_id
  join public.customer_order_lines ol on ol.order_id = o.id
  where o.status = 'collected'
    and (o.collected_at at time zone l.timezone)::date between p_from and p_to
    and (p_location_id is null or o.pickup_location_id = p_location_id)
  group by l.id, l.code
  order by l.code;
$$;

-- ---------------------------------------------------------------------------
-- Suggested standing order: what the store sold on each weekday, on average,
-- over the last p_weeks weeks (sales and collected orders; waste is shown so
-- managers can see where they send too much).
-- ---------------------------------------------------------------------------
create function public.suggest_standing_order(p_from uuid, p_to uuid, p_weeks integer default 4)
returns table (
  item_id uuid,
  weekday smallint,
  avg_sold numeric,
  avg_wasted numeric,
  suggested numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_today date;
begin
  if not (public.can_manage_location(p_from) or public.can_manage_location(p_to)) then
    raise exception 'Only managers of these locations can see suggestions' using errcode = '42501';
  end if;
  if p_weeks is null or p_weeks < 1 or p_weeks > 26 then
    raise exception 'Choose between 1 and 26 weeks';
  end if;

  v_today := public.location_today(p_to);

  return query
  with daily as (
    select
      m.item_id,
      m.business_date,
      coalesce(-sum(m.qty) filter (where m.type in ('sale', 'order_fulfilled')), 0) as sold,
      coalesce(-sum(m.qty) filter (where m.type = 'waste'), 0) as wasted
    from public.stock_movements m
    join public.items i on i.id = m.item_id and i.kind = 'product' and not i.made_to_order and i.active
    where m.location_id = p_to
      and m.business_date between v_today - p_weeks * 7 and v_today - 1
      and m.type in ('sale', 'order_fulfilled', 'waste')
    group by m.item_id, m.business_date
  )
  select
    d.item_id,
    extract(isodow from d.business_date)::smallint,
    round(sum(d.sold) / p_weeks, 2),
    round(sum(d.wasted) / p_weeks, 2),
    ceil(sum(d.sold) / p_weeks)
  from daily d
  group by d.item_id, extract(isodow from d.business_date)
  having sum(d.sold) > 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  location_id uuid references public.locations (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  -- Daily alerts carry a key so each person gets them once per day.
  dedupe_key text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, dedupe_key)
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- Internal: notify the managers ('managers') or everyone who works there
-- ('workers', i.e. not drivers) at a location, except whoever caused it.
create function public.notify_location(
  p_location_id uuid,
  p_who text,
  p_kind text,
  p_title text,
  p_body text default null,
  p_link text default null,
  p_dedupe text default null
)
returns integer
language sql
security definer
set search_path = ''
as $$
  with recipients as (
    select distinct ul.user_id
    from public.user_locations ul
    join public.profiles p on p.id = ul.user_id and p.active
    where ul.location_id = p_location_id
      and case
        when p_who = 'managers' then ul.role in ('warehouse_manager', 'store_manager')
        else ul.role <> 'driver'
      end
      and ul.user_id is distinct from auth.uid()
  ),
  inserted as (
    insert into public.notifications (user_id, location_id, kind, title, body, link, dedupe_key)
    select user_id, p_location_id, p_kind, p_title, p_body, p_link, p_dedupe
    from recipients
    on conflict (user_id, dedupe_key) do nothing
    returning 1
  )
  select count(*)::integer from inserted;
$$;

-- Mark your own notifications read (all of them when p_ids is null).
create function public.mark_notifications_read(p_ids bigint[] default null)
returns integer
language sql
security definer
set search_path = ''
as $$
  with updated as (
    update public.notifications
    set read_at = now()
    where user_id = auth.uid()
      and read_at is null
      and (p_ids is null or id = any (p_ids))
    returning 1
  )
  select count(*)::integer from updated;
$$;

-- Transfers: tell the other side what happened.
create function public.notify_transfer_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.transfers;
  v_from public.locations;
  v_to public.locations;
  v_link text;
begin
  select * into v_t from public.transfers where id = new.transfer_id;
  if not found then
    return null;
  end if;
  select * into v_from from public.locations where id = v_t.from_location_id;
  select * into v_to from public.locations where id = v_t.to_location_id;
  v_link := '/transfers/' || v_t.code;

  if new.action = 'requested' then
    perform public.notify_location(
      v_t.from_location_id, 'managers', 'transfer_requested',
      case when v_t.origin = 'standing_order'
        then 'Standing order ' || v_t.code || ' from ' || v_to.name || ' to approve'
        else 'New request ' || v_t.code || ' from ' || v_to.name end,
      'Needed ' || coalesce(to_char(v_t.needed_on, 'FMDy DD Mon'), 'as soon as possible'),
      v_link
    );
  elsif new.action = 'approved' and v_t.origin <> 'push' then
    perform public.notify_location(
      v_t.to_location_id, 'managers', 'transfer_approved',
      v_t.code || ' approved by ' || v_from.name, new.note, v_link
    );
  elsif new.action = 'rejected' then
    perform public.notify_location(
      v_t.to_location_id, 'managers', 'transfer_rejected',
      v_t.code || ' was rejected by ' || v_from.name, new.note, v_link
    );
  elsif new.action = 'dispatched' then
    perform public.notify_location(
      v_t.to_location_id, 'workers', 'transfer_dispatched',
      v_t.code || ' is on the way from ' || v_from.name, 'Receive it when it arrives.', v_link
    );
  elsif new.action = 'received' and v_t.has_discrepancy then
    perform public.notify_location(
      v_t.from_location_id, 'managers', 'transfer_differences',
      v_t.code || ' arrived at ' || v_to.name || ' with differences', new.note, v_link
    );
  end if;
  return null;
end;
$$;

create trigger transfer_events_notify
  after insert on public.transfer_events
  for each row execute function public.notify_transfer_event();

-- Stock takes: managers hear when a count is waiting for them.
create function public.notify_stock_take()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    perform public.notify_location(
      new.location_id, 'managers', 'count_submitted',
      'Count ' || new.code || ' is waiting for approval',
      'Closing stock of ' || to_char(new.count_date, 'FMDy DD Mon'),
      '/stock-takes/' || new.code
    );
  end if;
  return null;
end;
$$;

create trigger stock_takes_notify
  after update of status on public.stock_takes
  for each row execute function public.notify_stock_take();

-- Customer orders: the bakery hears about orders to make (and cancellations),
-- the pickup store hears when it's made.
create function public.notify_customer_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer text;
  v_pickup text;
  v_link text := '/orders/' || new.code;
  v_when text := to_char(new.pickup_date, 'FMDy DD Mon') || coalesce(' ' || to_char(new.pickup_time, 'HH24:MI'), '');
begin
  if new.fulfil_location_id = new.pickup_location_id then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;

  select name into v_customer from public.customers where id = new.customer_id;
  select name into v_pickup from public.locations where id = new.pickup_location_id;

  if new.status = 'confirmed' then
    perform public.notify_location(
      new.fulfil_location_id, 'workers', 'order_to_make',
      'New customer order ' || new.code || ' for ' || v_customer,
      'Collect ' || v_when || ' at ' || v_pickup, v_link
    );
  elsif new.status = 'ready' then
    perform public.notify_location(
      new.pickup_location_id, 'workers', 'order_made',
      new.code || ' for ' || v_customer || ' is made',
      'It comes on the next delivery. Collect ' || v_when || '.', v_link
    );
  elsif new.status = 'cancelled' and tg_op = 'UPDATE' and old.status in ('confirmed', 'ready') then
    perform public.notify_location(
      new.fulfil_location_id, 'workers', 'order_cancelled',
      new.code || ' for ' || v_customer || ' was cancelled',
      new.cancel_reason, v_link
    );
  end if;
  return null;
end;
$$;

create trigger customer_orders_notify
  after insert or update of status on public.customer_orders
  for each row execute function public.notify_customer_order();

-- Daily alerts, once per person per day (from 06:00 local time): stock at or
-- past its best-before, items below their reorder level, and customer orders
-- to make for tomorrow. Runs hourly from pg_cron. Returns how many were sent.
-- Also clears notifications older than 60 days.
create function public.generate_daily_alerts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_loc record;
  v_today date;
  v_count integer;
  v_sent integer := 0;
begin
  delete from public.notifications where created_at < now() - interval '60 days';

  for v_loc in select * from public.locations where active loop
    continue when extract(hour from now() at time zone v_loc.timezone) < 6;
    v_today := (now() at time zone v_loc.timezone)::date;

    select count(*) into v_count
    from public.stock_levels sl
    join public.batches b on b.id = sl.batch_id
    where sl.location_id = v_loc.id and sl.qty > 0 and b.best_before <= v_today;
    if v_count > 0 then
      v_sent := v_sent + public.notify_location(
        v_loc.id, 'workers', 'expiry',
        v_count || ' batch' || case when v_count = 1 then ' is' else 'es are' end || ' at or past best-before',
        'Sell first, or log them as waste.', '/waste?location=' || v_loc.id,
        'expiry:' || v_loc.id || ':' || v_today
      );
    end if;

    select count(*) into v_count
    from public.item_location_settings s
    join public.items i on i.id = s.item_id and i.active
    where s.location_id = v_loc.id
      and s.reorder_level is not null
      and coalesce((select sum(sl.qty) from public.stock_levels sl
                    where sl.location_id = s.location_id and sl.item_id = s.item_id), 0) <= s.reorder_level;
    if v_count > 0 then
      v_sent := v_sent + public.notify_location(
        v_loc.id, 'managers', 'low_stock',
        v_count || ' item' || case when v_count = 1 then ' is' else 's are' end || ' running low',
        'At or below the reorder level.',
        case when v_loc.type = 'warehouse' then '/deliveries' else '/dashboard' end,
        'low:' || v_loc.id || ':' || v_today
      );
    end if;

    if v_loc.can_produce then
      select count(*) into v_count
      from public.customer_orders o
      where o.fulfil_location_id = v_loc.id
        and o.status = 'confirmed'
        and o.fulfil_location_id <> o.pickup_location_id
        and o.pickup_date <= v_today + 1;
      if v_count > 0 then
        v_sent := v_sent + public.notify_location(
          v_loc.id, 'workers', 'orders_due',
          v_count || ' customer order' || case when v_count = 1 then '' else 's' end || ' to make by tomorrow',
          null, '/production?location=' || v_loc.id,
          'orders:' || v_loc.id || ':' || v_today
        );
      end if;
    end if;
  end loop;
  return v_sent;
end;
$$;

select cron.schedule('daily-alerts', '15 * * * *', 'select public.generate_daily_alerts()');

-- ---------------------------------------------------------------------------
-- Audit log: who changed what in the catalogue and settings.
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_key text,
  action text not null check (action in ('insert', 'update', 'delete')),
  -- insert/delete: the row; update: { column: [old, new] } for changed columns.
  changes jsonb,
  actor uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index audit_log_time_idx on public.audit_log (created_at desc);
create index audit_log_row_idx on public.audit_log (table_name, row_key);

-- Trigger arguments name the key columns (defaults to "id").
create function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changes jsonb;
  v_key text;
  v_cols text[] := case when tg_nargs > 0 then tg_argv else array['id'] end;
begin
  select string_agg(v_row ->> c, '|') into v_key from unnest(v_cols) as c;

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(e.key, jsonb_build_array(v_old -> e.key, e.value))
    into v_changes
    from jsonb_each(v_new) e
    where e.key not in ('updated_at', 'updated_by')
      and v_old -> e.key is distinct from e.value;
    if v_changes is null then
      return null;
    end if;
  else
    v_changes := v_row - 'created_at' - 'updated_at';
  end if;

  insert into public.audit_log (table_name, row_key, action, changes, actor)
  values (tg_table_name, v_key, lower(tg_op), v_changes, auth.uid());
  return null;
end;
$$;

create trigger items_audit after insert or update or delete on public.items
  for each row execute function public.audit_row();
create trigger item_barcodes_audit after insert or update or delete on public.item_barcodes
  for each row execute function public.audit_row('barcode');
create trigger categories_audit after insert or update or delete on public.categories
  for each row execute function public.audit_row();
create trigger locations_audit after insert or update or delete on public.locations
  for each row execute function public.audit_row();
create trigger profiles_audit after insert or update or delete on public.profiles
  for each row execute function public.audit_row();
create trigger user_locations_audit after insert or update or delete on public.user_locations
  for each row execute function public.audit_row('user_id', 'location_id');
create trigger item_location_settings_audit after insert or update or delete on public.item_location_settings
  for each row execute function public.audit_row('item_id', 'location_id');
create trigger suppliers_audit after insert or update or delete on public.suppliers
  for each row execute function public.audit_row();
create trigger recipes_audit after insert or update or delete on public.recipes
  for each row execute function public.audit_row();
create trigger recipe_lines_audit after insert or update or delete on public.recipe_lines
  for each row execute function public.audit_row();
create trigger standing_orders_audit after insert or update or delete on public.standing_orders
  for each row execute function public.audit_row('from_location_id', 'to_location_id', 'item_id', 'weekday');

-- Saving a standing order or a recipe used to delete every line and add it
-- back. Now only lines that really changed are written, so the audit log
-- shows what changed (and keeps who last changed each line).
create or replace function public.save_standing_orders(p_from uuid, p_to uuid, p_rows jsonb)
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

  delete from public.standing_orders s
  where s.from_location_id = p_from
    and s.to_location_id = p_to
    and not exists (
      select 1 from jsonb_array_elements(p_rows) as r
      where (r ->> 'item_id')::uuid = s.item_id
        and (r ->> 'weekday')::smallint = s.weekday
        and (r ->> 'qty')::numeric > 0
    );

  insert into public.standing_orders (from_location_id, to_location_id, item_id, weekday, qty, updated_by)
  select p_from, p_to, (r ->> 'item_id')::uuid, (r ->> 'weekday')::smallint, (r ->> 'qty')::numeric, auth.uid()
  from jsonb_array_elements(p_rows) as r
  where (r ->> 'qty')::numeric > 0
  on conflict (from_location_id, to_location_id, item_id, weekday) do update
    set qty = excluded.qty, updated_by = excluded.updated_by, updated_at = now()
    where public.standing_orders.qty is distinct from excluded.qty;

  select count(*) into v_count
  from public.standing_orders
  where from_location_id = p_from and to_location_id = p_to;
  return v_count;
end;
$$;

create or replace function public.save_recipe(
  p_product_item_id uuid,
  p_yield numeric,
  p_lines jsonb,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.items;
  v_recipe_id uuid;
  v_line jsonb;
  v_item public.items;
  v_qty numeric;
  v_ids uuid[] := '{}';
begin
  if not public.can_edit_recipes() then
    raise exception 'Only admins and bakery managers can change recipes' using errcode = '42501';
  end if;

  select * into v_product from public.items where id = p_product_item_id;
  if not found then
    raise exception 'Product not found';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Expected a list of ingredients';
  end if;

  if jsonb_array_length(p_lines) = 0 then
    delete from public.recipes where product_item_id = p_product_item_id;
    return null;
  end if;

  if p_yield is null or p_yield <= 0 then
    raise exception 'Say how many % the recipe makes', v_product.name;
  end if;
  if jsonb_array_length(p_lines) > 100 then
    raise exception 'A recipe can have at most 100 ingredients';
  end if;

  insert into public.recipes (product_item_id, yield_qty, notes, updated_by)
  values (p_product_item_id, p_yield, nullif(trim(p_notes), ''), auth.uid())
  on conflict (product_item_id) do update
  set yield_qty = excluded.yield_qty, notes = excluded.notes, updated_by = excluded.updated_by
  returning id into v_recipe_id;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    select * into v_item from public.items where id = nullif(v_line ->> 'item_id', '')::uuid;
    if not found then
      raise exception 'Choose an ingredient on every line';
    end if;
    if v_item.id = p_product_item_id then
      raise exception 'A recipe can''t use the product itself';
    end if;
    if v_item.id = any (v_ids) then
      raise exception '% is in the recipe twice', v_item.name;
    end if;
    v_qty := nullif(v_line ->> 'qty', '')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Enter how much % the recipe uses', v_item.name;
    end if;
    v_ids := v_ids || v_item.id;

    insert into public.recipe_lines (recipe_id, ingredient_item_id, qty)
    values (v_recipe_id, v_item.id, v_qty)
    on conflict (recipe_id, ingredient_item_id) do update
      set qty = excluded.qty
      where public.recipe_lines.qty is distinct from excluded.qty;
  end loop;

  delete from public.recipe_lines
  where recipe_id = v_recipe_id and not (ingredient_item_id = any (v_ids));

  return v_recipe_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.notifications enable row level security;
alter table public.audit_log enable row level security;

create policy "notifications_read_own" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "audit_log_admin_read" on public.audit_log
  for select to authenticated using (public.is_admin());

revoke insert, update, delete, truncate on public.notifications from anon, authenticated;
revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;

revoke execute on function public.notify_location(uuid, text, text, text, text, text, text) from public, anon, authenticated;

revoke execute on function public.report_movements(date, date, uuid) from public, anon;
grant execute on function public.report_movements(date, date, uuid) to authenticated;
revoke execute on function public.report_waste(date, date, uuid) from public, anon;
grant execute on function public.report_waste(date, date, uuid) to authenticated;
revoke execute on function public.report_count_differences(date, date, uuid) from public, anon;
grant execute on function public.report_count_differences(date, date, uuid) to authenticated;
revoke execute on function public.report_transfer_differences(date, date, uuid) from public, anon;
grant execute on function public.report_transfer_differences(date, date, uuid) to authenticated;
revoke execute on function public.report_production(date, date, uuid) from public, anon;
grant execute on function public.report_production(date, date, uuid) to authenticated;
revoke execute on function public.report_collected_orders(date, date, uuid) from public, anon;
grant execute on function public.report_collected_orders(date, date, uuid) to authenticated;
revoke execute on function public.suggest_standing_order(uuid, uuid, integer) from public, anon;
grant execute on function public.suggest_standing_order(uuid, uuid, integer) to authenticated;
revoke execute on function public.mark_notifications_read(bigint[]) from public, anon;
grant execute on function public.mark_notifications_read(bigint[]) to authenticated;
revoke execute on function public.generate_daily_alerts() from public, anon, authenticated;
