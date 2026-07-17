create table if not exists public.test_orders (
  id uuid primary key default gen_random_uuid(),
  name text,
  contact text not null,
  details text not null,
  page_url text,
  status text not null default 'new' check (status in ('new','reviewed','done','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.test_orders enable row level security;

drop policy if exists "public creates test orders" on public.test_orders;
create policy "public creates test orders"
on public.test_orders
for insert
with check (
  length(trim(contact)) >= 3
  and length(trim(details)) >= 10
);

drop policy if exists "admin reads test orders" on public.test_orders;
create policy "admin reads test orders"
on public.test_orders
for select
using (public.is_admin());

drop policy if exists "admin updates test orders" on public.test_orders;
create policy "admin updates test orders"
on public.test_orders
for update
using (public.is_admin())
with check (public.is_admin());

create index if not exists test_orders_created_idx
on public.test_orders(created_at desc);
