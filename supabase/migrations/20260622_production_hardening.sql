-- Reconcile the production database with the current application and apply
-- least-privilege Row Level Security before accepting live orders.

create extension if not exists pgcrypto;

create table if not exists public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  promo_code text not null,
  stripe_session_id text not null,
  order_id uuid references public.orders(id) on delete set null,
  redeemed_at timestamptz not null default now(),
  constraint promo_redemptions_email_lower check (email = lower(email)),
  constraint promo_redemptions_code_upper check (promo_code = upper(promo_code)),
  constraint promo_redemptions_email_code_unique unique (email, promo_code)
);

create index if not exists idx_promo_redemptions_email on public.promo_redemptions(email);
create index if not exists idx_promo_redemptions_code on public.promo_redemptions(promo_code);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  terms_accepted_at timestamptz,
  research_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists dispatched_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists refunded_at timestamptz,
  add column if not exists stripe_refund_id text,
  add column if not exists review_request_sent_at timestamptz;

update public.orders set status = 'dispatched' where status = 'shipped';

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check
  check (status in ('pending','paid','processing','dispatched','delivered','cancelled','refunded'));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name'
  )
  on conflict (id) do update set
    email = excluded.email,
    first_name = excluded.first_name,
    last_name = excluded.last_name;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Atomically creates an order, its line items, and decrements all stock.
-- Only the service role may execute this function.
create or replace function public.create_paid_order(
  p_order_number text,
  p_stripe_session_id text,
  p_email text,
  p_full_name text,
  p_phone text,
  p_address_line1 text,
  p_address_line2 text,
  p_city text,
  p_postcode text,
  p_country text,
  p_subtotal numeric,
  p_discount numeric,
  p_shipping numeric,
  p_total numeric,
  p_currency text,
  p_promo_opt_in boolean,
  p_items jsonb
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_item jsonb;
  v_qty integer;
  v_sku text;
begin
  select * into v_order
  from public.orders
  where stripe_session_id = p_stripe_session_id;

  if found then
    return v_order;
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_order_items';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_sku := upper(trim(v_item ->> 'sku'));
    v_qty := (v_item ->> 'qty')::integer;
    if v_qty < 1 or v_qty > 50 then
      raise exception 'invalid_quantity_%', v_sku;
    end if;

    update public.products
    set stock_quantity = stock_quantity - v_qty
    where sku = v_sku
      and is_active = true
      and stock_quantity >= v_qty;

    if not found then
      raise exception 'insufficient_stock_%', v_sku;
    end if;
  end loop;

  insert into public.orders (
    order_number, stripe_session_id, email, full_name, phone,
    shipping_address_line1, shipping_address_line2, shipping_city,
    shipping_postcode, shipping_country, subtotal, discount, shipping,
    total, currency, status, promo_opt_in
  ) values (
    p_order_number, p_stripe_session_id, lower(p_email), p_full_name, p_phone,
    p_address_line1, p_address_line2, p_city, p_postcode, p_country,
    p_subtotal, p_discount, p_shipping, p_total, lower(p_currency), 'paid',
    coalesce(p_promo_opt_in, false)
  )
  returning * into v_order;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    insert into public.order_items (
      order_id, sku, product_name, qty, price, line_total
    ) values (
      v_order.id,
      upper(trim(v_item ->> 'sku')),
      v_item ->> 'product_name',
      (v_item ->> 'qty')::integer,
      (v_item ->> 'price')::numeric,
      (v_item ->> 'line_total')::numeric
    );
  end loop;

  return v_order;
end;
$$;

-- Enable RLS everywhere. Service-role requests bypass RLS; browser requests do not.
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.coa_batches enable row level security;
alter table public.subscribers enable row level security;
alter table public.stripe_events enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.promo_redemptions enable row level security;
alter table public.notify_subscribers enable row level security;
alter table public.reviews_pending enable row level security;
alter table public.reviews_public enable row level security;
alter table public.profiles enable row level security;

drop policy if exists public_read_active_products on public.products;
create policy public_read_active_products on public.products
  for select to anon, authenticated using (is_active = true);

drop policy if exists public_read_active_coa on public.coa_batches;
create policy public_read_active_coa on public.coa_batches
  for select to anon, authenticated using (is_active = true and published_at is not null);

drop policy if exists public_read_reviews_public on public.reviews_public;
create policy public_read_reviews_public on public.reviews_public
  for select to anon, authenticated using (true);

drop policy if exists users_read_own_profile on public.profiles;
create policy users_read_own_profile on public.profiles
  for select to authenticated using (auth.uid() = id);

drop policy if exists users_update_own_profile on public.profiles;
create policy users_update_own_profile on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

revoke all on public.orders, public.order_items, public.subscribers,
  public.stripe_events, public.admin_audit_log, public.promo_redemptions,
  public.notify_subscribers, public.reviews_pending from anon, authenticated;

grant select on public.products, public.coa_batches, public.reviews_public to anon, authenticated;
grant select, update on public.profiles to authenticated;

revoke all on function public.create_paid_order(
  text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,text,boolean,jsonb
) from public, anon, authenticated;
grant execute on function public.create_paid_order(
  text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,text,boolean,jsonb
) to service_role;

grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;
alter default privileges in schema public grant all privileges on tables to service_role;
alter default privileges in schema public grant all privileges on sequences to service_role;
alter default privileges in schema public grant all privileges on functions to service_role;
