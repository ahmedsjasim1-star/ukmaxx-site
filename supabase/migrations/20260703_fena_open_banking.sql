-- Fena Open Banking / Pay by Bank support.
-- Keeps historical Stripe orders intact while allowing new orders to use
-- payment_provider/payment_reference instead of a required Stripe session.

alter table public.orders
  alter column stripe_session_id drop not null,
  add column if not exists payment_provider text not null default 'stripe',
  add column if not exists payment_reference text,
  add column if not exists fena_payment_id text,
  add column if not exists payment_status text;

update public.orders
set payment_provider = coalesce(nullif(payment_provider, ''), 'stripe'),
    payment_reference = coalesce(payment_reference, stripe_session_id),
    payment_status = coalesce(payment_status, status)
where payment_reference is null or payment_status is null;

create unique index if not exists idx_orders_provider_reference
  on public.orders(payment_provider, payment_reference)
  where payment_reference is not null;

create unique index if not exists idx_orders_fena_payment_id
  on public.orders(fena_payment_id)
  where fena_payment_id is not null;

alter table public.promo_redemptions
  alter column stripe_session_id drop not null,
  add column if not exists payment_provider text not null default 'stripe',
  add column if not exists payment_reference text,
  add column if not exists fena_payment_id text;

create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  payment_provider text not null,
  payment_reference text not null,
  provider_payment_id text,
  status text not null default 'created',
  amount numeric(10,2) not null check (amount >= 0),
  currency text not null default 'gbp',
  email text,
  payload jsonb not null,
  provider_payload jsonb,
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_attempts_provider_reference_unique unique (payment_provider, payment_reference)
);

create unique index if not exists idx_payment_attempts_provider_payment_id
  on public.payment_attempts(payment_provider, provider_payment_id)
  where provider_payment_id is not null;

create index if not exists idx_payment_attempts_status on public.payment_attempts(status);
create index if not exists idx_payment_attempts_email on public.payment_attempts(email);

drop trigger if exists payment_attempts_set_updated_at on public.payment_attempts;
create trigger payment_attempts_set_updated_at
  before update on public.payment_attempts
  for each row execute function public.set_updated_at();

create table if not exists public.fena_events (
  id uuid primary key default gen_random_uuid(),
  fena_payment_id text,
  payment_reference text,
  event_name text,
  status text,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

create unique index if not exists idx_fena_events_dedupe
  on public.fena_events(
    coalesce(fena_payment_id, ''),
    coalesce(payment_reference, ''),
    coalesce(event_name, ''),
    coalesce(status, '')
  );

create index if not exists idx_fena_events_payment_id on public.fena_events(fena_payment_id);
create index if not exists idx_fena_events_reference on public.fena_events(payment_reference);

create or replace function public.create_paid_order_v2(
  p_order_number text,
  p_payment_provider text,
  p_payment_reference text,
  p_fena_payment_id text,
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
  v_component_sku text;
  v_component_qty integer;
begin
  select * into v_order
  from public.orders
  where payment_provider = lower(p_payment_provider)
    and payment_reference = p_payment_reference;

  if found then
    return v_order;
  end if;

  if p_stripe_session_id is not null then
    select * into v_order
    from public.orders
    where stripe_session_id = p_stripe_session_id;

    if found then
      return v_order;
    end if;
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

    if v_sku = 'RT10X3' then
      for v_component_sku, v_component_qty in
        values ('RT10', 3), ('WA10', 3)
      loop
        update public.products
        set stock_quantity = stock_quantity - (v_component_qty * v_qty),
            updated_at = now()
        where sku = v_component_sku
          and is_active = true
          and stock_quantity >= (v_component_qty * v_qty);

        if not found then
          raise exception 'insufficient_stock_%', v_component_sku;
        end if;
      end loop;
    else
      update public.products
      set stock_quantity = stock_quantity - v_qty,
          updated_at = now()
      where sku = v_sku
        and is_active = true
        and stock_quantity >= v_qty;

      if not found then
        raise exception 'insufficient_stock_%', v_sku;
      end if;
    end if;
  end loop;

  insert into public.orders (
    order_number, stripe_session_id, payment_provider, payment_reference,
    fena_payment_id, payment_status, email, full_name, phone,
    shipping_address_line1, shipping_address_line2, shipping_city,
    shipping_postcode, shipping_country, subtotal, discount, shipping,
    total, currency, status, promo_opt_in
  ) values (
    p_order_number, p_stripe_session_id, lower(p_payment_provider), p_payment_reference,
    p_fena_payment_id, 'paid', lower(p_email), p_full_name, p_phone,
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

alter table public.payment_attempts enable row level security;
alter table public.fena_events enable row level security;

revoke all on public.payment_attempts, public.fena_events from anon, authenticated;

revoke all on function public.create_paid_order_v2(
  text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,text,boolean,jsonb
) from public, anon, authenticated;
grant execute on function public.create_paid_order_v2(
  text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,text,boolean,jsonb
) to service_role;

grant all privileges on public.payment_attempts, public.fena_events to service_role;
grant all privileges on all functions in schema public to service_role;
