-- Catalogue save/import functions and stock summary views.

-- ---------------------------------------------------------------------------
-- Views (security_invoker so the caller's RLS applies)
-- ---------------------------------------------------------------------------

-- Stock per location and item, summed over batches.
create view public.stock_by_item
with (security_invoker = true)
as
select
  sl.location_id,
  l.code as location_code,
  l.name as location_name,
  sl.item_id,
  i.sku,
  i.name as item_name,
  i.kind,
  i.unit,
  c.name as category_name,
  sum(sl.qty) as qty,
  count(*) filter (where sl.qty <> 0) as batch_count,
  min(b.best_before) filter (where sl.qty > 0) as earliest_best_before,
  min(b.best_before) filter (where sl.qty > 0)
    - (now() at time zone l.timezone)::date as days_to_earliest_expiry
from public.stock_levels sl
join public.locations l on l.id = sl.location_id
join public.items i on i.id = sl.item_id
left join public.categories c on c.id = i.category_id
left join public.batches b on b.id = sl.batch_id
group by sl.location_id, l.code, l.name, l.timezone, sl.item_id, i.sku, i.name, i.kind, i.unit, c.name
having sum(sl.qty) <> 0;

-- Items at or below their reorder level at a location.
create view public.low_stock
with (security_invoker = true)
as
select
  s.location_id,
  l.code as location_code,
  l.name as location_name,
  s.item_id,
  i.sku,
  i.name as item_name,
  i.unit,
  s.reorder_level,
  s.par_level,
  coalesce(sum(sl.qty), 0) as qty
from public.item_location_settings s
join public.locations l on l.id = s.location_id and l.active
join public.items i on i.id = s.item_id and i.active
left join public.stock_levels sl
  on sl.location_id = s.location_id and sl.item_id = s.item_id
where s.reorder_level is not null
group by s.location_id, l.code, l.name, s.item_id, i.sku, i.name, i.unit, s.reorder_level, s.par_level
having coalesce(sum(sl.qty), 0) <= s.reorder_level;

-- ---------------------------------------------------------------------------
-- Save one item and its barcodes in a single transaction. Pass p_id to update
-- an existing item; leave it out to create one. p_item keys: sku, name, kind, category_id, unit, shelf_life_days,
-- track_batches, cost, price, notes, active.
-- ---------------------------------------------------------------------------
create function public.save_item(p_item jsonb, p_barcodes text[], p_id uuid default null)
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
      cost, price, notes, active
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
      coalesce((p_item ->> 'active')::boolean, true)
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
      active = coalesce((p_item ->> 'active')::boolean, true)
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

-- ---------------------------------------------------------------------------
-- Bulk import / update items by SKU (CSV import).
-- Each row: sku, name, kind, category (name), unit, shelf_life_days,
-- track_batches, cost, price, barcode. Categories are created when missing.
-- ---------------------------------------------------------------------------
create function public.import_items(p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r jsonb;
  v_category_id uuid;
  v_category text;
  v_barcode text;
  v_item_id uuid;
  v_existed boolean;
  v_created integer := 0;
  v_updated integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Only admins can change the catalogue' using errcode = '42501';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Expected a list of rows';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    v_category_id := null;
    v_category := nullif(trim(r ->> 'category'), '');
    if v_category is not null then
      insert into public.categories (name) values (v_category)
      on conflict (name) do nothing;
      select id into v_category_id from public.categories where name = v_category;
    end if;

    v_existed := exists (select 1 from public.items where sku = trim(r ->> 'sku'));

    insert into public.items (
      sku, name, kind, category_id, unit, shelf_life_days, track_batches, cost, price
    ) values (
      trim(r ->> 'sku'),
      trim(r ->> 'name'),
      (r ->> 'kind')::public.item_kind,
      v_category_id,
      (r ->> 'unit')::public.item_unit,
      nullif(r ->> 'shelf_life_days', '')::integer,
      coalesce((r ->> 'track_batches')::boolean, true),
      nullif(r ->> 'cost', '')::numeric,
      nullif(r ->> 'price', '')::numeric
    )
    on conflict (sku) do update set
      name = excluded.name,
      kind = excluded.kind,
      category_id = coalesce(excluded.category_id, public.items.category_id),
      unit = excluded.unit,
      shelf_life_days = excluded.shelf_life_days,
      track_batches = excluded.track_batches,
      cost = coalesce(excluded.cost, public.items.cost),
      price = coalesce(excluded.price, public.items.price)
    returning id into v_item_id;

    v_barcode := nullif(trim(r ->> 'barcode'), '');
    if v_barcode is not null then
      if exists (
        select 1 from public.item_barcodes
        where barcode = v_barcode and item_id <> v_item_id
      ) then
        raise exception 'Barcode % (SKU %) is already used by another item',
          v_barcode, r ->> 'sku'
          using errcode = '23505';
      end if;
      insert into public.item_barcodes (barcode, item_id)
      values (v_barcode, v_item_id)
      on conflict (barcode) do nothing;
    end if;

    if v_existed then
      v_updated := v_updated + 1;
    else
      v_created := v_created + 1;
    end if;
  end loop;

  return jsonb_build_object('created', v_created, 'updated', v_updated);
end;
$$;

revoke execute on function public.save_item(jsonb, text[], uuid) from public, anon;
grant execute on function public.save_item(jsonb, text[], uuid) to authenticated;
revoke execute on function public.import_items(jsonb) from public, anon;
grant execute on function public.import_items(jsonb) to authenticated;
