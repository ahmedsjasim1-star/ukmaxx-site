-- UKMAXX V1 schema
-- Phase 1: database + products

create extension if not exists pgcrypto;

-- updated_at trigger helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.products (
  sku text primary key,
  name text not null,
  slug text not null unique,
  description text,
  price numeric(10,2) not null check (price >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  is_active boolean not null default true,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  stripe_session_id text not null unique,
  email text not null,
  full_name text not null,
  phone text,
  shipping_address_line1 text not null,
  shipping_address_line2 text,
  shipping_city text not null,
  shipping_postcode text not null,
  shipping_country text not null,
  subtotal numeric(10,2) not null check (subtotal >= 0),
  discount numeric(10,2) not null default 0 check (discount >= 0),
  shipping numeric(10,2) not null default 0 check (shipping >= 0),
  total numeric(10,2) not null check (total >= 0),
  currency text not null default 'gbp',
  status text not null default 'pending' check (status in ('pending','paid','processing','shipped','delivered','cancelled','refunded')),
  promo_opt_in boolean not null default false,
  tracking_number text,
  tracking_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  sku text not null references public.products(sku),
  product_name text not null,
  qty integer not null check (qty > 0),
  price numeric(10,2) not null check (price >= 0),
  line_total numeric(10,2) not null check (line_total >= 0)
);

create table if not exists public.coa_batches (
  id uuid primary key default gen_random_uuid(),
  batch_code text not null unique,
  sku text not null references public.products(sku),
  product_name text not null,
  purity text,
  method text,
  lab_name text,
  coa_url text,
  image_url text,
  tested_at timestamptz,
  published_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint coa_batches_batch_code_uppercase check (batch_code = upper(batch_code))
);

create table if not exists public.subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source text not null,
  promo_opt_in boolean not null default false,
  consent_timestamp timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint subscribers_email_lowercase check (email = lower(email))
);

create table if not exists public.stripe_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  processed_at timestamptz not null default now(),
  payload jsonb not null
);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  order_id uuid references public.orders(id) on delete set null,
  admin_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_orders_email on public.orders(email);
create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_order_items_order_id on public.order_items(order_id);
create index if not exists idx_coa_batches_sku on public.coa_batches(sku);
create index if not exists idx_subscribers_source on public.subscribers(source);
create index if not exists idx_stripe_events_event_type on public.stripe_events(event_type);
create index if not exists idx_admin_audit_order_id on public.admin_audit_log(order_id);

create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();
