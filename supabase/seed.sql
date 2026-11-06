-- Local development seed data. Runs after migrations on `supabase db reset`.
-- All test users use the password: password123

-- ---------------------------------------------------------------------------
-- Locations
-- ---------------------------------------------------------------------------
insert into public.locations (id, code, name, type, address, can_produce) values
  ('10000000-0000-0000-0000-000000000001', 'WH-01', 'Central Warehouse & Bakery', 'warehouse', '1 Industrial Road', true),
  ('10000000-0000-0000-0000-000000000002', 'ST-01', 'Westham Store', 'store', '12 Main Street', false),
  ('10000000-0000-0000-0000-000000000003', 'ST-02', 'Riverside Store', 'store', '8 River Mall', false);

-- ---------------------------------------------------------------------------
-- Users (the first user created becomes admin via the handle_new_user trigger)
-- ---------------------------------------------------------------------------
create or replace function pg_temp.seed_user(p_id uuid, p_email text, p_name text)
returns void
language plpgsql
as $$
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    p_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_email, crypt('password123', gen_salt('bf')), now(),
    '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_name), now(), now()
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) values (
    p_id, p_id,
    jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true),
    'email', p_id::text, now(), now(), now()
  );
end;
$$;

select pg_temp.seed_user('20000000-0000-0000-0000-000000000001', 'admin@bakery.test', 'Alex Admin');
select pg_temp.seed_user('20000000-0000-0000-0000-000000000002', 'warehouse@bakery.test', 'Wanda Warehouse');
select pg_temp.seed_user('20000000-0000-0000-0000-000000000003', 'westham@bakery.test', 'Sam Westham');
select pg_temp.seed_user('20000000-0000-0000-0000-000000000004', 'staff@bakery.test', 'Thandi Staff');
select pg_temp.seed_user('20000000-0000-0000-0000-000000000005', 'riverside@bakery.test', 'Riley Riverside');
select pg_temp.seed_user('20000000-0000-0000-0000-000000000006', 'baker@bakery.test', 'Ben Baker');
select pg_temp.seed_user('20000000-0000-0000-0000-000000000007', 'driver@bakery.test', 'Dee Driver');

insert into public.user_locations (user_id, location_id, role) values
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'warehouse_manager'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'store_manager'),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', 'store_staff'),
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000003', 'store_manager'),
  ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'warehouse_staff'),
  ('20000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', 'driver');

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------
insert into public.categories (id, name, sort_order) values
  ('30000000-0000-0000-0000-000000000001', 'Cakes', 1),
  ('30000000-0000-0000-0000-000000000002', 'Cupcakes & Pastries', 2),
  ('30000000-0000-0000-0000-000000000003', 'Bread', 3),
  ('30000000-0000-0000-0000-000000000004', 'Ingredients', 4),
  ('30000000-0000-0000-0000-000000000005', 'Packaging', 5);

insert into public.items (id, sku, name, kind, category_id, unit, shelf_life_days, track_batches, cost, price) values
  ('40000000-0000-0000-0000-000000000001', 'CAKE-CHOC-L', 'Chocolate cake (large)', 'product', '30000000-0000-0000-0000-000000000001', 'each', 4, true, 120.00, 350.00),
  ('40000000-0000-0000-0000-000000000002', 'CAKE-RV-L', 'Red velvet cake (large)', 'product', '30000000-0000-0000-0000-000000000001', 'each', 4, true, 140.00, 380.00),
  ('40000000-0000-0000-0000-000000000003', 'CAKE-CARROT-L', 'Carrot cake (large)', 'product', '30000000-0000-0000-0000-000000000001', 'each', 5, true, 130.00, 360.00),
  ('40000000-0000-0000-0000-000000000004', 'CUP-VAN', 'Vanilla cupcake', 'product', '30000000-0000-0000-0000-000000000002', 'each', 3, true, 8.00, 25.00),
  ('40000000-0000-0000-0000-000000000005', 'CROIS-BUT', 'Butter croissant', 'product', '30000000-0000-0000-0000-000000000002', 'each', 2, true, 6.00, 18.00),
  ('40000000-0000-0000-0000-000000000006', 'BREAD-WHITE', 'White loaf', 'product', '30000000-0000-0000-0000-000000000003', 'each', 3, true, 9.00, 22.00),
  ('40000000-0000-0000-0000-000000000007', 'FLOUR-CAKE', 'Cake flour', 'ingredient', '30000000-0000-0000-0000-000000000004', 'kg', null, false, 18.00, null),
  ('40000000-0000-0000-0000-000000000008', 'SUGAR', 'White sugar', 'ingredient', '30000000-0000-0000-0000-000000000004', 'kg', null, false, 22.00, null),
  ('40000000-0000-0000-0000-000000000009', 'BUTTER', 'Butter', 'ingredient', '30000000-0000-0000-0000-000000000004', 'kg', 30, true, 110.00, null),
  ('40000000-0000-0000-0000-000000000010', 'EGGS', 'Eggs', 'ingredient', '30000000-0000-0000-0000-000000000004', 'each', 21, false, 3.00, null),
  ('40000000-0000-0000-0000-000000000011', 'COCOA', 'Cocoa powder', 'ingredient', '30000000-0000-0000-0000-000000000004', 'kg', null, false, 160.00, null),
  ('40000000-0000-0000-0000-000000000012', 'BOX-CAKE-L', 'Cake box (large)', 'packaging', '30000000-0000-0000-0000-000000000005', 'each', null, false, 7.50, null);

-- Made to order: priced per order; the cake's details live on the order.
insert into public.items (id, sku, name, kind, category_id, unit, shelf_life_days, track_batches, cost, price, made_to_order, notes) values
  ('40000000-0000-0000-0000-000000000013', 'CAKE-CUSTOM', 'Custom cake', 'product', '30000000-0000-0000-0000-000000000001', 'each', 3, true, null, null, true,
   'Size, flavour and wording are taken on the customer order');

insert into public.item_barcodes (barcode, item_id) values
  ('2000000000015', '40000000-0000-0000-0000-000000000001'),
  ('2000000000022', '40000000-0000-0000-0000-000000000002'),
  ('2000000000039', '40000000-0000-0000-0000-000000000003'),
  ('2000000000046', '40000000-0000-0000-0000-000000000004'),
  ('2000000000053', '40000000-0000-0000-0000-000000000005'),
  ('2000000000060', '40000000-0000-0000-0000-000000000006');

insert into public.item_location_settings (item_id, location_id, reorder_level, par_level) values
  ('40000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', 20, 60),
  ('40000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', 10, 30),
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 2, 6),
  ('40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', 12, 36),
  ('40000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', 10, 40),
  ('40000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001', 120, 360),
  ('40000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 2, 6),
  ('40000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', 30, 120);

-- ---------------------------------------------------------------------------
-- Suppliers and recipes
-- ---------------------------------------------------------------------------
insert into public.suppliers (id, name, contact_name, phone, email) values
  ('50000000-0000-0000-0000-000000000001', 'Mills & Co', 'Pieter Mills', '021 555 0101', 'orders@millsco.test'),
  ('50000000-0000-0000-0000-000000000002', 'Dairy Fresh', 'Nomsa Dlamini', '021 555 0202', 'sales@dairyfresh.test'),
  ('50000000-0000-0000-0000-000000000003', 'Pack-It Packaging', null, '021 555 0303', null);

-- Quantities per round of the recipe, in each ingredient's unit (kg / each).
insert into public.recipes (id, product_item_id, yield_qty, notes) values
  ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 1, 'One 24 cm cake, boxed'),
  ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 1, 'One 24 cm cake, boxed'),
  ('60000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003', 1, 'One 24 cm cake, boxed'),
  ('60000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000004', 12, 'One tray of 12'),
  ('60000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000005', 24, 'One batch of dough'),
  ('60000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000006', 10, 'One mixer load');

insert into public.recipe_lines (recipe_id, ingredient_item_id, qty)
select ('60000000-0000-0000-0000-00000000000' || r)::uuid, ('40000000-0000-0000-0000-0000000000' || i)::uuid, q
from (values
  -- chocolate cake: flour, sugar, butter, eggs, cocoa, box
  (1, '07', 0.35), (1, '08', 0.30), (1, '09', 0.25), (1, '10', 4), (1, '11', 0.08), (1, '12', 1),
  -- red velvet
  (2, '07', 0.35), (2, '08', 0.30), (2, '09', 0.25), (2, '10', 4), (2, '11', 0.02), (2, '12', 1),
  -- carrot cake
  (3, '07', 0.30), (3, '08', 0.25), (3, '09', 0.20), (3, '10', 3), (3, '12', 1),
  -- vanilla cupcakes (per 12)
  (4, '07', 0.25), (4, '08', 0.22), (4, '09', 0.20), (4, '10', 4),
  -- croissants (per 24)
  (5, '07', 1.50), (5, '08', 0.10), (5, '09', 0.90), (5, '10', 2),
  -- white loaves (per 10)
  (6, '07', 5.00), (6, '08', 0.10), (6, '09', 0.15)
) as v (r, i, q);

-- Custom cake: a typical 30 cm celebration cake.
insert into public.recipes (id, product_item_id, yield_qty, notes) values
  ('60000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000013', 1, 'Base for a 30 cm cake; decoration varies');
insert into public.recipe_lines (recipe_id, ingredient_item_id, qty) values
  ('60000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000007', 0.50),
  ('60000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000008', 0.45),
  ('60000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000009', 0.35),
  ('60000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000010', 6),
  ('60000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000012', 1);

-- ---------------------------------------------------------------------------
-- Opening stock (posted directly as the seed runs with full rights)
-- ---------------------------------------------------------------------------
create or replace function pg_temp.seed_stock(
  p_location uuid, p_item uuid, p_qty numeric, p_produced_days_ago integer default null
)
returns void
language plpgsql
as $$
declare
  v_item public.items;
  v_batch uuid;
  v_produced date;
begin
  select * into v_item from public.items where id = p_item;
  if v_item.track_batches then
    v_produced := current_date - coalesce(p_produced_days_ago, 0);
    insert into public.batches (item_id, source, location_id, produced_on, best_before, created_by)
    values (p_item, 'opening', p_location, v_produced, v_produced + v_item.shelf_life_days,
            '20000000-0000-0000-0000-000000000001')
    returning id into v_batch;
  end if;

  -- Opening stock was counted three days ago (go-live day).
  insert into public.stock_movements (location_id, item_id, batch_id, qty, type, note, business_date, created_by)
  values (p_location, p_item, v_batch, p_qty, 'opening_balance', 'Seed data',
          (now() at time zone 'Africa/Johannesburg')::date - 3,
          '20000000-0000-0000-0000-000000000001');
end;
$$;

-- Warehouse
select pg_temp.seed_stock('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 20, 0);
select pg_temp.seed_stock('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 8, 1);
select pg_temp.seed_stock('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004', 60, 0);
select pg_temp.seed_stock('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000007', 50);
select pg_temp.seed_stock('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000008', 30);
select pg_temp.seed_stock('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000009', 8, 5);
select pg_temp.seed_stock('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000010', 300);
select pg_temp.seed_stock('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000012', 100);

-- Westham store: one cake batch fresh, cupcakes expiring today
select pg_temp.seed_stock('10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 3, 1);
select pg_temp.seed_stock('10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000004', 12, 3);
select pg_temp.seed_stock('10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000006', 10, 0);

-- Riverside store: red velvet already past best-before
select pg_temp.seed_stock('10000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000002', 2, 5);
select pg_temp.seed_stock('10000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000005', 24, 0);

-- ---------------------------------------------------------------------------
-- Standing orders (ISO weekday: 1 = Monday … 7 = Sunday)
-- ---------------------------------------------------------------------------
-- Westham: Monday to Saturday
insert into public.standing_orders (from_location_id, to_location_id, item_id, weekday, qty)
select '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', item_id::uuid, d, qty
from (values
  ('40000000-0000-0000-0000-000000000001', 3),   -- chocolate cake
  ('40000000-0000-0000-0000-000000000004', 24),  -- vanilla cupcakes
  ('40000000-0000-0000-0000-000000000005', 12),  -- croissants
  ('40000000-0000-0000-0000-000000000006', 8)    -- white loaf
) as v (item_id, qty)
cross join generate_series(1, 6) as d;

-- Riverside: every day
insert into public.standing_orders (from_location_id, to_location_id, item_id, weekday, qty)
select '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', item_id::uuid, d, qty
from (values
  ('40000000-0000-0000-0000-000000000002', 2),   -- red velvet cake
  ('40000000-0000-0000-0000-000000000005', 24),  -- croissants
  ('40000000-0000-0000-0000-000000000006', 6)    -- white loaf
) as v (item_id, qty)
cross join generate_series(1, 7) as d;

-- ---------------------------------------------------------------------------
-- Sample production and transfers, made through the real stock functions so
-- the ledger is exactly what the app would have written.
-- ---------------------------------------------------------------------------
create or replace function pg_temp.act_as(p_user uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, false);
$$;

-- Yesterday's deliveries from suppliers at the warehouse.
do $$
declare
  v_wh constant uuid := '10000000-0000-0000-0000-000000000001';
  v_yesterday date := (now() at time zone 'Africa/Johannesburg')::date - 1;
begin
  perform pg_temp.act_as('20000000-0000-0000-0000-000000000002');
  perform public.receive_goods(
    v_wh,
    jsonb_build_array(
      jsonb_build_object('item_id', '40000000-0000-0000-0000-000000000007', 'qty', 25, 'unit_cost', 17.50),
      jsonb_build_object('item_id', '40000000-0000-0000-0000-000000000008', 'qty', 10, 'unit_cost', 21.00),
      jsonb_build_object('item_id', '40000000-0000-0000-0000-000000000011', 'qty', 2, 'unit_cost', 165.00)
    ),
    '50000000-0000-0000-0000-000000000001', v_yesterday, 'INV-20431'
  );
  perform public.receive_goods(
    v_wh,
    jsonb_build_array(
      jsonb_build_object('item_id', '40000000-0000-0000-0000-000000000009', 'qty', 10, 'unit_cost', 112.00,
                         'supplier_batch', 'DF-8812'),
      jsonb_build_object('item_id', '40000000-0000-0000-0000-000000000010', 'qty', 180, 'unit_cost', 2.80)
    ),
    '50000000-0000-0000-0000-000000000002', v_yesterday, 'DN 5521'
  );
  perform set_config('request.jwt.claims', '', false);
end;
$$;

do $$
declare
  v_wh constant uuid := '10000000-0000-0000-0000-000000000001';
  v_westham constant uuid := '10000000-0000-0000-0000-000000000002';
  v_riverside constant uuid := '10000000-0000-0000-0000-000000000003';
  v_choc constant uuid := '40000000-0000-0000-0000-000000000001';
  v_carrot constant uuid := '40000000-0000-0000-0000-000000000003';
  v_cupcake constant uuid := '40000000-0000-0000-0000-000000000004';
  v_croissant constant uuid := '40000000-0000-0000-0000-000000000005';
  v_box constant uuid := '40000000-0000-0000-0000-000000000012';
  v_bake record;
  v_id uuid;
begin
  -- The baker logs this morning's croissants.
  perform pg_temp.act_as('20000000-0000-0000-0000-000000000006');
  select * into v_bake from public.log_production(v_wh, v_croissant, 48, null, null, 'Morning bake');

  -- The warehouse sends Westham a top-up of cakes and cake boxes: in transit now.
  perform pg_temp.act_as('20000000-0000-0000-0000-000000000002');
  v_id := public.save_transfer(
    jsonb_build_object('origin', 'push', 'from_location_id', v_wh, 'to_location_id', v_westham,
                       'needed_on', (now() at time zone 'Africa/Johannesburg')::date,
                       'note', 'Weekend top-up'),
    jsonb_build_array(
      jsonb_build_object('item_id', v_choc, 'qty', 4),
      jsonb_build_object('item_id', v_croissant, 'qty', 12),
      jsonb_build_object('item_id', v_box, 'qty', 10)
    )
  );
  perform public.submit_transfer(v_id);
  perform public.dispatch_transfer(v_id, (
    select jsonb_agg(jsonb_build_object(
      'line_id', l.id,
      'batch_id', (select sl.batch_id from public.stock_levels sl
                   where sl.location_id = v_wh and sl.item_id = l.item_id and sl.qty > 0
                   limit 1),
      'qty', l.qty))
    from public.transfer_lines l where l.transfer_id = v_id
  ));

  -- Riverside asks for carrot cakes for a customer's party (not in stock yet,
  -- so they show up on the warehouse's bake list).
  perform pg_temp.act_as('20000000-0000-0000-0000-000000000005');
  v_id := public.save_transfer(
    jsonb_build_object('origin', 'request', 'from_location_id', v_wh, 'to_location_id', v_riverside,
                       'needed_on', (now() at time zone 'Africa/Johannesburg')::date + 1,
                       'note', 'Party order, please box them'),
    jsonb_build_array(
      jsonb_build_object('item_id', v_carrot, 'qty', 3),
      jsonb_build_object('item_id', v_cupcake, 'qty', 12)
    )
  );
  perform public.submit_transfer(v_id);

  -- Tomorrow's standing orders.
  perform pg_temp.act_as('20000000-0000-0000-0000-000000000002');
  perform public.generate_standing_transfers();

  perform set_config('request.jwt.claims', '', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Yesterday at Westham: waste, end-of-day sales and an approved closing count
-- (one cupcake unaccounted for), so the End of day page has a full example.
-- ---------------------------------------------------------------------------
do $$
declare
  v_westham constant uuid := '10000000-0000-0000-0000-000000000002';
  v_choc constant uuid := '40000000-0000-0000-0000-000000000001';
  v_cupcake constant uuid := '40000000-0000-0000-0000-000000000004';
  v_loaf constant uuid := '40000000-0000-0000-0000-000000000006';
  v_yesterday date := (now() at time zone 'Africa/Johannesburg')::date - 1;
  v_take uuid;
  v_line record;
begin
  -- Staff log yesterday's waste.
  perform pg_temp.act_as('20000000-0000-0000-0000-000000000004');
  perform public.log_waste(v_westham, jsonb_build_array(
    jsonb_build_object('item_id', v_cupcake, 'qty', 2, 'reason', 'unsold'),
    jsonb_build_object('item_id', v_loaf, 'qty', 1, 'reason', 'damaged', 'note', 'Dropped on the floor')
  ), v_yesterday);

  -- The manager enters yesterday's sales from the till.
  perform pg_temp.act_as('20000000-0000-0000-0000-000000000003');
  perform public.save_sales_day(v_westham, v_yesterday, jsonb_build_array(
    jsonb_build_object('item_id', v_choc, 'qty', 1),
    jsonb_build_object('item_id', v_cupcake, 'qty', 7),
    jsonb_build_object('item_id', v_loaf, 'qty', 6)
  ), null, true);

  -- Staff count the products at closing; the manager approves.
  perform pg_temp.act_as('20000000-0000-0000-0000-000000000004');
  v_take := public.start_stock_take(v_westham, v_yesterday, 'products', '{}', true, 'Closing count');
  for v_line in
    select l.id, l.item_id from public.stock_take_lines l where l.stock_take_id = v_take
  loop
    perform public.set_stock_take_count(
      v_line.id,
      case v_line.item_id when v_choc then 2 when v_cupcake then 2 when v_loaf then 3 else 0 end
    );
  end loop;
  perform public.submit_stock_take(v_take);

  perform pg_temp.act_as('20000000-0000-0000-0000-000000000003');
  perform public.approve_stock_take(v_take);

  perform set_config('request.jwt.claims', '', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Customer orders
-- ---------------------------------------------------------------------------
do $$
declare
  v_wh constant uuid := '10000000-0000-0000-0000-000000000001';
  v_westham constant uuid := '10000000-0000-0000-0000-000000000002';
  v_riverside constant uuid := '10000000-0000-0000-0000-000000000003';
  v_today date := (now() at time zone 'Africa/Johannesburg')::date;
  v_id uuid;
begin
  -- A birthday cake for tomorrow, taken at Westham: on the bakery's list.
  perform pg_temp.act_as('20000000-0000-0000-0000-000000000004');
  perform public.save_customer_order(
    jsonb_build_object(
      'customer_name', 'Priya Naidoo', 'customer_phone', '082 555 1234',
      'taken_at_location_id', v_westham, 'pickup_location_id', v_westham,
      'pickup_date', v_today + 1, 'pickup_time', '10:00', 'deposit', 300, 'confirm', true,
      'notes', 'Customer will bring candles'
    ),
    jsonb_build_array(jsonb_build_object(
      'item_id', '40000000-0000-0000-0000-000000000013', 'qty', 1, 'unit_price', 650,
      'details', jsonb_build_object(
        'size', '30 cm round', 'flavour', 'Chocolate', 'filling', 'Salted caramel',
        'inscription', 'Happy 40th Priya!', 'notes', 'Gold sprinkles, no nuts'
      )
    ))
  );

  -- Cupcakes for a Riverside customer today: already made, on the delivery.
  perform pg_temp.act_as('20000000-0000-0000-0000-000000000005');
  v_id := public.save_customer_order(
    jsonb_build_object(
      'customer_name', 'Tom Jacobs', 'customer_phone', '083 555 9876',
      'taken_at_location_id', v_riverside, 'pickup_location_id', v_riverside,
      'pickup_date', v_today, 'pickup_time', '15:00', 'deposit', 100, 'confirm', true
    ),
    jsonb_build_array(jsonb_build_object('item_id', '40000000-0000-0000-0000-000000000004', 'qty', 24))
  );
  perform pg_temp.act_as('20000000-0000-0000-0000-000000000006');
  perform public.mark_order_ready(v_id);

  -- A chocolate cake set aside from Westham's own shelf, waiting for the customer.
  perform pg_temp.act_as('20000000-0000-0000-0000-000000000004');
  v_id := public.save_customer_order(
    jsonb_build_object(
      'customer_name', 'Lerato Mokoena', 'customer_phone', '084 555 2222',
      'taken_at_location_id', v_westham, 'pickup_location_id', v_westham,
      'fulfil_location_id', v_westham,
      'pickup_date', v_today, 'pickup_time', '16:30', 'confirm', true
    ),
    jsonb_build_array(jsonb_build_object('item_id', '40000000-0000-0000-0000-000000000001', 'qty', 1))
  );
  perform public.mark_order_ready(v_id);

  -- One already collected and paid.
  v_id := public.save_customer_order(
    jsonb_build_object(
      'customer_name', 'Anna Botha', 'customer_phone', '082 555 7777',
      'taken_at_location_id', v_westham, 'pickup_location_id', v_westham,
      'fulfil_location_id', v_westham, 'pickup_date', v_today, 'confirm', true
    ),
    jsonb_build_array(jsonb_build_object('item_id', '40000000-0000-0000-0000-000000000006', 'qty', 1))
  );
  perform public.collect_customer_order(v_id, 22);

  perform set_config('request.jwt.claims', '', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Four weeks of history at the stores (before go-live), so reports and the
-- suggested standing orders have something to work with: each day the
-- standing order arrived, most of it sold and the rest was thrown away at
-- closing. Each day nets to zero, so today's stock is unchanged.
-- ---------------------------------------------------------------------------
do $$
declare
  v_today date := (now() at time zone 'Africa/Johannesburg')::date;
  v_day date;
  v_row record;
  v_waste numeric;
  v_entry uuid;
  v_at timestamptz;
begin
  for v_day in select generate_series(v_today - 31, v_today - 4, interval '1 day')::date loop
    v_at := (v_day + time '08:00') at time zone 'Africa/Johannesburg';
    for v_row in
      select so.to_location_id as location_id, so.item_id, so.qty, i.cost
      from public.standing_orders so
      join public.items i on i.id = so.item_id
      where so.weekday = extract(isodow from v_day)
    loop
      -- Between 0 and 30% left over, varying by item and day (repeatable).
      v_waste := floor(v_row.qty * (abs(hashtext(v_row.item_id::text || v_day::text)) % 31) / 100.0);

      insert into public.stock_movements (location_id, item_id, qty, type, note, business_date, created_at, created_by)
      values (v_row.location_id, v_row.item_id, v_row.qty, 'transfer_in', 'History before go-live', v_day, v_at,
              '20000000-0000-0000-0000-000000000001');
      if v_row.qty - v_waste > 0 then
        insert into public.stock_movements (location_id, item_id, qty, type, note, business_date, created_at, created_by)
        values (v_row.location_id, v_row.item_id, -(v_row.qty - v_waste), 'sale', 'History before go-live', v_day,
                v_at + interval '10 hours', '20000000-0000-0000-0000-000000000001');
      end if;
      if v_waste > 0 then
        insert into public.waste_entries (location_id, item_id, qty, reason, business_date, unit_cost, created_by, created_at)
        values (v_row.location_id, v_row.item_id, v_waste, 'unsold', v_day, v_row.cost,
                '20000000-0000-0000-0000-000000000001', v_at + interval '11 hours')
        returning id into v_entry;
        insert into public.stock_movements (location_id, item_id, qty, type, reference_type, reference_id, note,
                                            business_date, created_at, created_by)
        values (v_row.location_id, v_row.item_id, -v_waste, 'waste', 'waste_entry', v_entry, 'History before go-live',
                v_day, v_at + interval '11 hours', '20000000-0000-0000-0000-000000000001');
      end if;
    end loop;
  end loop;
end;
$$;

-- Start the audit log clean: the seed itself isn't anyone's change.
truncate public.audit_log;
