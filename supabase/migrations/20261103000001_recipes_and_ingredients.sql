-- Phase 4: recipes and ingredients — suppliers, deliveries from suppliers,
-- recipes (with costing) and ingredients used up automatically when baking.

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------
-- Admins, and managers of any location.
create function public.is_any_manager()
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
      and ul.role in ('warehouse_manager', 'store_manager')
      and p.active
  );
$$;

-- Admins, and managers of a location that bakes.
create function public.can_edit_recipes()
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
    join public.locations l on l.id = ul.location_id
    where ul.user_id = auth.uid()
      and ul.role in ('warehouse_manager', 'store_manager')
      and l.can_produce
      and p.active
  );
$$;

-- ---------------------------------------------------------------------------
-- Suppliers
-- ---------------------------------------------------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  contact_name text,
  phone text,
  email text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Recipes: one per product. yield_qty = how many of the product one round of
-- the recipe makes; line quantities are in each ingredient's own unit.
-- ---------------------------------------------------------------------------
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  product_item_id uuid not null unique references public.items (id) on delete cascade,
  yield_qty numeric(14, 3) not null check (yield_qty > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid()
);

create trigger recipes_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

create table public.recipe_lines (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  ingredient_item_id uuid not null references public.items (id) on delete restrict,
  qty numeric(14, 4) not null check (qty > 0),
  unique (recipe_id, ingredient_item_id)
);

create index recipe_lines_ingredient_idx on public.recipe_lines (ingredient_item_id);

-- Save (or, with no lines, delete) the recipe for a product.
-- p_lines: [{ item_id, qty }]. Returns the recipe id (null when deleted).
create function public.save_recipe(
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

  delete from public.recipe_lines where recipe_id = v_recipe_id;

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
    values (v_recipe_id, v_item.id, v_qty);
  end loop;

  return v_recipe_id;
end;
$$;

-- Cost to make each product from its recipe (ingredients at their cost price).
create view public.recipe_costs
with (security_invoker = true)
as
select
  r.id as recipe_id,
  r.product_item_id,
  r.yield_qty,
  count(rl.id) as line_count,
  count(rl.id) filter (where i.cost is null) as lines_without_cost,
  coalesce(sum(rl.qty * i.cost), 0) as batch_cost,
  coalesce(sum(rl.qty * i.cost), 0) / r.yield_qty as unit_cost
from public.recipes r
left join public.recipe_lines rl on rl.recipe_id = r.id
left join public.items i on i.id = rl.ingredient_item_id
group by r.id, r.product_item_id, r.yield_qty;

-- ---------------------------------------------------------------------------
-- Deliveries from suppliers (goods receipts)
-- ---------------------------------------------------------------------------
create sequence public.goods_receipt_code_seq;

-- Delivery numbers look like R-00042.
create function public.next_goods_receipt_code()
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_seq text := nextval('public.goods_receipt_code_seq')::text;
begin
  return 'R-' || lpad(v_seq, greatest(5, length(v_seq)), '0');
end;
$$;

create table public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default public.next_goods_receipt_code(),
  location_id uuid not null references public.locations (id) on delete restrict,
  supplier_id uuid references public.suppliers (id) on delete set null,
  received_on date not null,
  -- The supplier's delivery note or invoice number.
  reference text,
  note text,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  void_reason text
);

create index goods_receipts_location_idx on public.goods_receipts (location_id, received_on desc);

create table public.goods_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.goods_receipts (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete restrict,
  qty numeric(14, 3) not null check (qty > 0),
  unit_cost numeric(12, 4) check (unit_cost >= 0),
  batch_id uuid,
  best_before date,
  -- The supplier's own lot/batch number, if printed on the goods.
  supplier_batch text,
  foreign key (batch_id, item_id) references public.batches (id, item_id)
);

create index goods_receipt_lines_item_idx on public.goods_receipt_lines (item_id);

-- Record a delivery. p_lines: [{ item_id, qty, unit_cost?, best_before?,
-- supplier_batch? }]. Batch-tracked items get a new batch whose best-before
-- defaults to the delivery date + shelf life. With p_update_costs (managers
-- only) each item's cost price becomes the delivered unit cost.
create function public.receive_goods(
  p_location_id uuid,
  p_lines jsonb,
  p_supplier_id uuid default null,
  p_received_on date default null,
  p_reference text default null,
  p_note text default null,
  p_update_costs boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date;
  v_date date;
  v_receipt_id uuid;
  v_line jsonb;
  v_item public.items;
  v_qty numeric;
  v_cost numeric;
  v_best date;
  v_batch_id uuid;
begin
  if not public.can_work_location(p_location_id) then
    raise exception 'You are not allowed to receive deliveries at this location' using errcode = '42501';
  end if;
  if coalesce(p_update_costs, false) and not public.can_manage_location(p_location_id) then
    raise exception 'Only managers can update cost prices' using errcode = '42501';
  end if;

  select (now() at time zone l.timezone)::date into v_today
  from public.locations l where l.id = p_location_id and l.active;
  if v_today is null then
    raise exception 'Location not found or inactive';
  end if;

  v_date := coalesce(p_received_on, v_today);
  if v_date > v_today then
    raise exception 'The delivery date can''t be in the future';
  end if;

  if p_supplier_id is not null and not exists (select 1 from public.suppliers where id = p_supplier_id) then
    raise exception 'Supplier not found';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one item';
  end if;
  if jsonb_array_length(p_lines) > 500 then
    raise exception 'A delivery can have at most 500 lines';
  end if;

  insert into public.goods_receipts (location_id, supplier_id, received_on, reference, note, created_by)
  values (
    p_location_id, p_supplier_id, v_date,
    nullif(trim(p_reference), ''), nullif(trim(p_note), ''), auth.uid()
  )
  returning id into v_receipt_id;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    select * into v_item from public.items where id = nullif(v_line ->> 'item_id', '')::uuid;
    if not found then
      raise exception 'Choose an item on every line';
    end if;

    v_qty := nullif(v_line ->> 'qty', '')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantity for % must be more than 0', v_item.name;
    end if;

    v_cost := nullif(v_line ->> 'unit_cost', '')::numeric;
    if v_cost is not null and v_cost < 0 then
      raise exception 'The cost of % can''t be negative', v_item.name;
    end if;

    v_batch_id := null;
    v_best := null;
    if v_item.track_batches then
      v_best := coalesce(nullif(v_line ->> 'best_before', '')::date, v_date + v_item.shelf_life_days);
      if v_best is not null and v_best < v_date then
        raise exception 'Best-before for % is before the delivery date', v_item.name;
      end if;
      insert into public.batches (item_id, source, location_id, produced_on, best_before, created_by)
      values (v_item.id, 'purchase', p_location_id, v_date, v_best, auth.uid())
      returning id into v_batch_id;
    end if;

    insert into public.goods_receipt_lines (
      receipt_id, item_id, qty, unit_cost, batch_id, best_before, supplier_batch
    ) values (
      v_receipt_id, v_item.id, v_qty, v_cost, v_batch_id, v_best,
      nullif(trim(v_line ->> 'supplier_batch'), '')
    );

    insert into public.stock_movements (
      location_id, item_id, batch_id, qty, type, reference_type, reference_id, note,
      business_date, created_by
    ) values (
      p_location_id, v_item.id, v_batch_id, v_qty, 'purchase_in', 'goods_receipt', v_receipt_id,
      nullif(trim(p_reference), ''), v_date, auth.uid()
    );

    if coalesce(p_update_costs, false) and v_cost is not null then
      update public.items set cost = round(v_cost, 2) where id = v_item.id;
    end if;
  end loop;

  return v_receipt_id;
end;
$$;

-- Cancel a delivery entered by mistake: takes its stock back out.
create function public.void_goods_receipt(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.goods_receipts;
begin
  select * into v_receipt from public.goods_receipts where id = p_id for update;
  if not found then
    raise exception 'Delivery not found';
  end if;
  if not public.can_manage_location(v_receipt.location_id) then
    raise exception 'Only a manager can cancel a delivery' using errcode = '42501';
  end if;
  if v_receipt.voided_at is not null then
    raise exception 'This delivery has already been cancelled';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'Give a reason for cancelling the delivery';
  end if;

  insert into public.stock_movements (
    location_id, item_id, batch_id, qty, type, reference_type, reference_id, note,
    business_date, created_by
  )
  select
    m.location_id, m.item_id, m.batch_id, -sum(m.qty), 'purchase_in', 'goods_receipt', p_id,
    'Delivery cancelled: ' || trim(p_reason), v_receipt.received_on, auth.uid()
  from public.stock_movements m
  where m.reference_type = 'goods_receipt' and m.reference_id = p_id
  group by m.location_id, m.item_id, m.batch_id
  having sum(m.qty) <> 0;

  update public.goods_receipts
  set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason)
  where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Baking uses up ingredients
-- ---------------------------------------------------------------------------
alter table public.production_runs add column used_recipe boolean not null default false;

drop function public.log_production(uuid, uuid, numeric, date, date, text);

-- Log a bake: creates a batch (for batch-tracked items), adds the stock and,
-- when the product has a recipe and p_use_recipe is on, takes the
-- ingredients out (oldest in-date batches first).
create function public.log_production(
  p_location_id uuid,
  p_item_id uuid,
  p_qty numeric,
  p_produced_on date default null,
  p_best_before date default null,
  p_note text default null,
  p_use_recipe boolean default true
)
returns table (run_id uuid, batch_id uuid, batch_code text, ingredients_used integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_location public.locations;
  v_item public.items;
  v_recipe public.recipes;
  v_ingredient record;
  v_today date;
  v_produced date;
  v_best date;
  v_batch_id uuid;
  v_batch_code text;
  v_run_id uuid;
  v_used integer := 0;
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

  if coalesce(p_use_recipe, true) then
    select * into v_recipe from public.recipes r where r.product_item_id = v_item.id;
    if found then
      for v_ingredient in
        select rl.ingredient_item_id, rl.qty
        from public.recipe_lines rl
        where rl.recipe_id = v_recipe.id
      loop
        perform public.take_stock_fefo(
          p_location_id,
          v_ingredient.ingredient_item_id,
          round(v_ingredient.qty * p_qty / v_recipe.yield_qty, 3),
          'ingredient_use',
          'production_run',
          v_run_id,
          v_produced,
          v_item.name
        );
        v_used := v_used + 1;
      end loop;

      if v_used > 0 then
        update public.production_runs set used_recipe = true where id = v_run_id;
      end if;
    end if;
  end if;

  return query select v_run_id, v_batch_id, v_batch_code, v_used;
end;
$$;

-- Undo a bake: the product and any ingredients go back where they came from.
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
  )
  select
    m.location_id, m.item_id, m.batch_id, -sum(m.qty), m.type, 'production_run', v_run.id,
    'Bake undone: ' || trim(p_reason), v_run.produced_on, auth.uid()
  from public.stock_movements m
  where m.reference_type = 'production_run' and m.reference_id = v_run.id
  group by m.location_id, m.item_id, m.batch_id, m.type
  having sum(m.qty) <> 0;

  update public.production_runs
  set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason)
  where id = v_run.id;
end;
$$;

-- Ingredients needed to bake what the production plan says, against usable
-- ingredient stock at the bakery.
create function public.production_ingredient_needs(p_location_id uuid, p_date date)
returns table (
  item_id uuid,
  sku text,
  item_name text,
  unit public.item_unit,
  needed numeric,
  in_stock numeric,
  short numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with plan as (
    select p.item_id, p.to_make
    from public.production_plan(p_location_id, p_date) p
    where p.to_make > 0
  ),
  needs as (
    select rl.ingredient_item_id as item_id, sum(rl.qty * plan.to_make / r.yield_qty) as needed
    from plan
    join public.recipes r on r.product_item_id = plan.item_id
    join public.recipe_lines rl on rl.recipe_id = r.id
    group by rl.ingredient_item_id
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
    round(n.needed, 3),
    coalesce(s.qty, 0),
    greatest(round(n.needed, 3) - coalesce(s.qty, 0), 0)
  from needs n
  join public.items i on i.id = n.item_id
  left join stock s on s.item_id = n.item_id
  order by greatest(n.needed - coalesce(s.qty, 0), 0) desc, i.name;
$$;

-- ---------------------------------------------------------------------------
-- Daily summary: supplier deliveries count as "in", ingredient use as "other".
-- ---------------------------------------------------------------------------
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
      coalesce(sum(m.qty) filter (where m.business_date = p_date and m.type = 'sale'), 0) as sold,
      coalesce(sum(m.qty) filter (where m.business_date = p_date and m.type = 'waste'), 0) as wasted,
      coalesce(sum(m.qty) filter (where m.business_date = p_date and m.type = 'count_adjustment'), 0) as counted_diff,
      coalesce(sum(m.qty) filter (
        where m.business_date = p_date
          and m.type not in ('production_in', 'transfer_in', 'transfer_loss', 'purchase_in',
                             'transfer_out', 'sale', 'waste', 'count_adjustment')
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
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.suppliers enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_lines enable row level security;
alter table public.goods_receipts enable row level security;
alter table public.goods_receipt_lines enable row level security;

-- Suppliers: everyone can see them; managers keep the list.
create policy "suppliers_read" on public.suppliers
  for select to authenticated using (true);
create policy "suppliers_insert" on public.suppliers
  for insert to authenticated with check (public.is_any_manager());
create policy "suppliers_update" on public.suppliers
  for update to authenticated using (public.is_any_manager()) with check (public.is_any_manager());
create policy "suppliers_delete" on public.suppliers
  for delete to authenticated using (public.is_any_manager());

-- Recipes: everyone can read; changes go through save_recipe.
create policy "recipes_read" on public.recipes
  for select to authenticated using (true);
create policy "recipe_lines_read" on public.recipe_lines
  for select to authenticated using (true);

create policy "goods_receipts_read" on public.goods_receipts
  for select to authenticated using (public.has_location_access(location_id));
create policy "goods_receipt_lines_read" on public.goods_receipt_lines
  for select to authenticated
  using (exists (
    select 1 from public.goods_receipts g
    where g.id = receipt_id and public.has_location_access(g.location_id)
  ));

revoke insert, update, delete, truncate on public.recipes from anon, authenticated;
revoke insert, update, delete, truncate on public.recipe_lines from anon, authenticated;
revoke insert, update, delete, truncate on public.goods_receipts from anon, authenticated;
revoke insert, update, delete, truncate on public.goods_receipt_lines from anon, authenticated;
revoke truncate on public.suppliers from anon, authenticated;

revoke execute on function public.next_goods_receipt_code() from public, anon, authenticated;

revoke execute on function public.is_any_manager() from public, anon;
grant execute on function public.is_any_manager() to authenticated;
revoke execute on function public.can_edit_recipes() from public, anon;
grant execute on function public.can_edit_recipes() to authenticated;
revoke execute on function public.save_recipe(uuid, numeric, jsonb, text) from public, anon;
grant execute on function public.save_recipe(uuid, numeric, jsonb, text) to authenticated;
revoke execute on function public.receive_goods(uuid, jsonb, uuid, date, text, text, boolean) from public, anon;
grant execute on function public.receive_goods(uuid, jsonb, uuid, date, text, text, boolean) to authenticated;
revoke execute on function public.void_goods_receipt(uuid, text) from public, anon;
grant execute on function public.void_goods_receipt(uuid, text) to authenticated;
revoke execute on function public.log_production(uuid, uuid, numeric, date, date, text, boolean) from public, anon;
grant execute on function public.log_production(uuid, uuid, numeric, date, date, text, boolean) to authenticated;
revoke execute on function public.production_ingredient_needs(uuid, date) from public, anon;
grant execute on function public.production_ingredient_needs(uuid, date) to authenticated;
