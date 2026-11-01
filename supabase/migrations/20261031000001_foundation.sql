-- Foundation schema: locations, users & roles, catalogue, batches and the stock ledger.
--
-- Stock rule: every stock change is a row in stock_movements (append-only).
-- stock_levels is a cache kept up to date by a trigger. Clients never write
-- stock directly; they call security-definer functions that check permissions.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.location_type as enum ('warehouse', 'store');

create type public.location_role as enum (
  'warehouse_manager',
  'warehouse_staff',
  'store_manager',
  'store_staff',
  'driver'
);

create type public.item_kind as enum ('product', 'ingredient', 'packaging');

create type public.item_unit as enum ('each', 'g', 'kg', 'ml', 'l');

create type public.batch_source as enum ('opening', 'production', 'purchase');

create type public.movement_type as enum (
  'opening_balance',
  'production_in',
  'ingredient_use',
  'purchase_in',
  'transfer_out',
  'transfer_in',
  'transfer_loss',
  'sale',
  'waste',
  'count_adjustment',
  'order_fulfilled',
  'manual_adjustment'
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Locations
-- ---------------------------------------------------------------------------
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9-]{2,12}$'),
  name text not null check (length(trim(name)) > 0),
  type public.location_type not null,
  address text,
  phone text,
  can_produce boolean not null default false,
  timezone text not null default 'Africa/Johannesburg',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger locations_updated_at
  before update on public.locations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profiles & location roles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text not null default '',
  is_admin boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.user_locations (
  user_id uuid not null references public.profiles (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  role public.location_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, location_id)
);

create index user_locations_location_idx on public.user_locations (location_id);

-- Every new auth user gets a profile. The very first user becomes admin so a
-- fresh install can be bootstrapped (public sign-up is disabled in config).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, is_admin)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    not exists (select 1 from public.profiles where is_admin)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Access helpers (used by RLS policies and stock functions)
-- ---------------------------------------------------------------------------
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_admin and p.active from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

create function public.has_location_access(p_location_id uuid)
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
      and p.active
  );
$$;

create function public.can_manage_location(p_location_id uuid)
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
      and ul.role in ('warehouse_manager', 'store_manager')
      and p.active
  );
$$;

-- Only admins (or the service role) may change admin/active flags or email.
create function public.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin') then
    return new;
  end if;

  if (new.is_admin is distinct from old.is_admin
      or new.active is distinct from old.active
      or new.email is distinct from old.email)
     and not public.is_admin()
  then
    raise exception 'Only an admin can change this' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique check (sku ~ '^[A-Za-z0-9._-]{1,32}$'),
  name text not null check (length(trim(name)) > 0),
  kind public.item_kind not null default 'product',
  category_id uuid references public.categories (id) on delete set null,
  unit public.item_unit not null default 'each',
  shelf_life_days integer check (shelf_life_days >= 0),
  track_batches boolean not null default true,
  cost numeric(12, 2) check (cost >= 0),
  price numeric(12, 2) check (price >= 0),
  image_path text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index items_category_idx on public.items (category_id);
create index items_kind_idx on public.items (kind) where active;

create trigger items_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

create table public.item_barcodes (
  barcode text primary key check (length(trim(barcode)) > 0),
  item_id uuid not null references public.items (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index item_barcodes_item_idx on public.item_barcodes (item_id);

create table public.item_location_settings (
  item_id uuid not null references public.items (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  reorder_level numeric(14, 3) check (reorder_level >= 0),
  par_level numeric(14, 3) check (par_level >= 0),
  primary key (item_id, location_id)
);

-- ---------------------------------------------------------------------------
-- Batches (one per bake / delivery / opening stock line)
-- ---------------------------------------------------------------------------
create sequence public.batch_code_seq;

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete restrict,
  code text not null unique,
  source public.batch_source not null,
  location_id uuid references public.locations (id) on delete set null,
  produced_on date not null,
  best_before date,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (id, item_id),
  check (best_before is null or best_before >= produced_on)
);

create index batches_item_expiry_idx on public.batches (item_id, best_before);

-- Batch codes look like B261031-00042 (bake date + running number).
create function public.set_batch_code()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.code is null or length(trim(new.code)) = 0 then
    new.code := 'B' || to_char(new.produced_on, 'YYMMDD') || '-'
      || lpad(nextval('public.batch_code_seq')::text, 5, '0');
  end if;
  return new;
end;
$$;

create trigger batches_code
  before insert on public.batches
  for each row execute function public.set_batch_code();

-- ---------------------------------------------------------------------------
-- Stock ledger
-- ---------------------------------------------------------------------------
create table public.stock_movements (
  id bigint generated always as identity primary key,
  location_id uuid not null references public.locations (id) on delete restrict,
  item_id uuid not null references public.items (id) on delete restrict,
  batch_id uuid,
  qty numeric(14, 3) not null check (qty <> 0),
  type public.movement_type not null,
  reference_type text,
  reference_id uuid,
  note text,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (batch_id, item_id) references public.batches (id, item_id)
);

create index stock_movements_location_item_idx on public.stock_movements (location_id, item_id);
create index stock_movements_item_time_idx on public.stock_movements (item_id, created_at desc);
create index stock_movements_batch_idx on public.stock_movements (batch_id);
create index stock_movements_reference_idx on public.stock_movements (reference_type, reference_id);

create table public.stock_levels (
  id bigint generated always as identity primary key,
  location_id uuid not null references public.locations (id) on delete restrict,
  item_id uuid not null references public.items (id) on delete restrict,
  batch_id uuid references public.batches (id) on delete restrict,
  qty numeric(14, 3) not null default 0,
  updated_at timestamptz not null default now(),
  constraint stock_levels_key unique nulls not distinct (location_id, item_id, batch_id)
);

create index stock_levels_item_idx on public.stock_levels (item_id);

create function public.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.stock_levels (location_id, item_id, batch_id, qty, updated_at)
  values (new.location_id, new.item_id, new.batch_id, new.qty, now())
  on conflict (location_id, item_id, batch_id)
  do update set qty = public.stock_levels.qty + excluded.qty, updated_at = now();
  return new;
end;
$$;

create trigger stock_movements_apply
  after insert on public.stock_movements
  for each row execute function public.apply_stock_movement();

-- The ledger is append-only: corrections are new movements, never edits.
create function public.block_ledger_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'stock_movements is append-only; post a correcting movement instead'
    using errcode = '42501';
end;
$$;

create trigger stock_movements_append_only
  before update or delete on public.stock_movements
  for each row execute function public.block_ledger_changes();

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------
create view public.stock_on_hand
with (security_invoker = true)
as
select
  sl.id,
  sl.location_id,
  l.code as location_code,
  l.name as location_name,
  sl.item_id,
  i.sku,
  i.name as item_name,
  i.kind,
  i.unit,
  c.name as category_name,
  sl.batch_id,
  b.code as batch_code,
  b.produced_on,
  b.best_before,
  (b.best_before - (now() at time zone l.timezone)::date) as days_to_expiry,
  sl.qty,
  sl.updated_at
from public.stock_levels sl
join public.locations l on l.id = sl.location_id
join public.items i on i.id = sl.item_id
left join public.categories c on c.id = i.category_id
left join public.batches b on b.id = sl.batch_id
where sl.qty <> 0;

-- ---------------------------------------------------------------------------
-- Stock functions
-- ---------------------------------------------------------------------------

-- Opening stock for a location. p_lines is a JSON array of
-- { item_id, qty, produced_on?, best_before? }. Batch-tracked items get a new
-- 'opening' batch; best-before defaults to produced_on + shelf life.
create function public.post_opening_stock(
  p_location_id uuid,
  p_lines jsonb,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line jsonb;
  v_item public.items;
  v_batch_id uuid;
  v_qty numeric;
  v_produced date;
  v_best date;
  v_today date;
  v_count integer := 0;
begin
  if not public.can_manage_location(p_location_id) then
    raise exception 'You are not allowed to post stock at this location'
      using errcode = '42501';
  end if;

  select (now() at time zone l.timezone)::date into v_today
  from public.locations l
  where l.id = p_location_id and l.active;

  if v_today is null then
    raise exception 'Location not found or inactive';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'There are no lines to post';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    select * into v_item from public.items where id = (v_line ->> 'item_id')::uuid;
    if not found then
      raise exception 'Unknown item %', v_line ->> 'item_id';
    end if;

    v_qty := (v_line ->> 'qty')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantity for % must be more than 0', v_item.name;
    end if;

    v_batch_id := null;
    if v_item.track_batches then
      v_produced := coalesce(nullif(v_line ->> 'produced_on', '')::date, v_today);
      v_best := coalesce(
        nullif(v_line ->> 'best_before', '')::date,
        v_produced + v_item.shelf_life_days
      );

      insert into public.batches (item_id, source, location_id, produced_on, best_before, created_by)
      values (v_item.id, 'opening', p_location_id, v_produced, v_best, auth.uid())
      returning id into v_batch_id;
    end if;

    insert into public.stock_movements (location_id, item_id, batch_id, qty, type, note, created_by)
    values (p_location_id, v_item.id, v_batch_id, v_qty, 'opening_balance', p_note, auth.uid());

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Look up a scanned code: item barcode, SKU, or batch code.
create function public.find_by_code(p_code text)
returns table (item_id uuid, batch_id uuid)
language sql
stable
set search_path = ''
as $$
  select ib.item_id, null::uuid from public.item_barcodes ib where ib.barcode = trim(p_code)
  union all
  select i.id, null::uuid from public.items i where lower(i.sku) = lower(trim(p_code))
  union all
  select b.item_id, b.id from public.batches b where b.code = upper(trim(p_code))
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.locations enable row level security;
alter table public.profiles enable row level security;
alter table public.user_locations enable row level security;
alter table public.categories enable row level security;
alter table public.items enable row level security;
alter table public.item_barcodes enable row level security;
alter table public.item_location_settings enable row level security;
alter table public.batches enable row level security;
alter table public.stock_movements enable row level security;
alter table public.stock_levels enable row level security;

-- Locations: everyone signed in can see the list (needed to send stock to
-- other places); only admins change it.
create policy "locations_read" on public.locations
  for select to authenticated using (true);
create policy "locations_admin_insert" on public.locations
  for insert to authenticated with check (public.is_admin());
create policy "locations_admin_update" on public.locations
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "locations_admin_delete" on public.locations
  for delete to authenticated using (public.is_admin());

-- Profiles: staff names are visible to colleagues; you can edit your own name.
create policy "profiles_read" on public.profiles
  for select to authenticated using (true);
create policy "profiles_update" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Location roles: see your own, managers see their location's staff.
create policy "user_locations_read" on public.user_locations
  for select to authenticated
  using (user_id = auth.uid() or public.can_manage_location(location_id));
create policy "user_locations_admin_insert" on public.user_locations
  for insert to authenticated with check (public.is_admin());
create policy "user_locations_admin_update" on public.user_locations
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "user_locations_admin_delete" on public.user_locations
  for delete to authenticated using (public.is_admin());

-- Catalogue: readable by all staff; admins maintain it.
create policy "categories_read" on public.categories
  for select to authenticated using (true);
create policy "categories_admin_insert" on public.categories
  for insert to authenticated with check (public.is_admin());
create policy "categories_admin_update" on public.categories
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "categories_admin_delete" on public.categories
  for delete to authenticated using (public.is_admin());

create policy "items_read" on public.items
  for select to authenticated using (true);
create policy "items_admin_insert" on public.items
  for insert to authenticated with check (public.is_admin());
create policy "items_admin_update" on public.items
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "items_admin_delete" on public.items
  for delete to authenticated using (public.is_admin());

create policy "item_barcodes_read" on public.item_barcodes
  for select to authenticated using (true);
create policy "item_barcodes_admin_insert" on public.item_barcodes
  for insert to authenticated with check (public.is_admin());
create policy "item_barcodes_admin_update" on public.item_barcodes
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "item_barcodes_admin_delete" on public.item_barcodes
  for delete to authenticated using (public.is_admin());

create policy "item_location_settings_read" on public.item_location_settings
  for select to authenticated using (public.has_location_access(location_id));
create policy "item_location_settings_insert" on public.item_location_settings
  for insert to authenticated with check (public.can_manage_location(location_id));
create policy "item_location_settings_update" on public.item_location_settings
  for update to authenticated
  using (public.can_manage_location(location_id))
  with check (public.can_manage_location(location_id));
create policy "item_location_settings_delete" on public.item_location_settings
  for delete to authenticated using (public.can_manage_location(location_id));

-- Batches move between locations, so batch details are readable by all staff.
-- They are only created through stock functions.
create policy "batches_read" on public.batches
  for select to authenticated using (true);

-- Stock: you only see stock for your own locations. Writes go through functions.
create policy "stock_movements_read" on public.stock_movements
  for select to authenticated using (public.has_location_access(location_id));
create policy "stock_levels_read" on public.stock_levels
  for select to authenticated using (public.has_location_access(location_id));

-- Defence in depth: no direct writes to stock tables from the API roles.
revoke insert, update, delete, truncate on public.stock_movements from anon, authenticated;
revoke insert, update, delete, truncate on public.stock_levels from anon, authenticated;
revoke insert, update, delete, truncate on public.batches from anon, authenticated;

-- Functions: only signed-in users may call them.
revoke execute on function public.post_opening_stock(uuid, jsonb, text) from public, anon;
grant execute on function public.post_opening_stock(uuid, jsonb, text) to authenticated;
revoke execute on function public.find_by_code(text) from public, anon;
grant execute on function public.find_by_code(text) to authenticated;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
revoke execute on function public.has_location_access(uuid) from public, anon;
grant execute on function public.has_location_access(uuid) to authenticated;
revoke execute on function public.can_manage_location(uuid) from public, anon;
grant execute on function public.can_manage_location(uuid) to authenticated;
