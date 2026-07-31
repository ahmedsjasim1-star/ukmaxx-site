-- Phase 2: connect paid orders to public COA batch sold counts.
-- This keeps the COA checker in sync with real paid stock movement.

update public.coa_batches
set assay_result = '10.12mg'
where batch_code = 'RT10-2026-06-A';

create table if not exists public.order_batch_allocations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  sku text not null references public.products(sku),
  batch_code text not null references public.coa_batches(batch_code),
  qty integer not null check (qty > 0),
  created_at timestamptz not null default now(),
  constraint order_batch_allocations_unique unique (order_id, sku, batch_code)
);

create index if not exists idx_order_batch_allocations_order_id
  on public.order_batch_allocations(order_id);

create index if not exists idx_order_batch_allocations_batch_code
  on public.order_batch_allocations(batch_code);

alter table public.order_batch_allocations enable row level security;

revoke all on public.order_batch_allocations from anon, authenticated;
grant all privileges on public.order_batch_allocations to service_role;

create or replace function public.allocate_coa_batch_sale(
  p_order_id uuid,
  p_sku text,
  p_qty integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_code text;
begin
  if p_qty < 1 then
    raise exception 'invalid_batch_allocation_quantity_%', p_sku;
  end if;

  with next_batch as (
    select id, batch_code
    from public.coa_batches
    where sku = upper(trim(p_sku))
      and published_at is not null
      and is_active = true
      and batch_size > 0
      and sold_count + p_qty <= batch_size
    order by display_order asc, tested_at asc nulls last, created_at asc
    limit 1
    for update
  ),
  updated_batch as (
    update public.coa_batches c
    set sold_count = c.sold_count + p_qty
    from next_batch nb
    where c.id = nb.id
    returning c.batch_code
  )
  select batch_code into v_batch_code
  from updated_batch;

  if v_batch_code is null then
    raise exception 'insufficient_coa_batch_stock_%', upper(trim(p_sku));
  end if;

  insert into public.order_batch_allocations (
    order_id,
    sku,
    batch_code,
    qty
  ) values (
    p_order_id,
    upper(trim(p_sku)),
    v_batch_code,
    p_qty
  )
  on conflict (order_id, sku, batch_code) do update set
    qty = public.order_batch_allocations.qty + excluded.qty;

  return v_batch_code;
end;
$$;

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
    v_sku := upper(trim(v_item ->> 'sku'));
    v_qty := (v_item ->> 'qty')::integer;

    if v_sku = 'RT10X3' then
      for v_component_sku, v_component_qty in
        values ('RT10', 3), ('WA10', 1)
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

        if v_component_sku <> 'WA10' then
          perform public.allocate_coa_batch_sale(v_order.id, v_component_sku, v_component_qty * v_qty);
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

      if v_sku <> 'WA10' then
        perform public.allocate_coa_batch_sale(v_order.id, v_sku, v_qty);
      end if;
    end if;

    insert into public.order_items (
      order_id, sku, product_name, qty, price, line_total
    ) values (
      v_order.id,
      v_sku,
      v_item ->> 'product_name',
      v_qty,
      (v_item ->> 'price')::numeric,
      (v_item ->> 'line_total')::numeric
    );
  end loop;

  return v_order;
end;
$$;

revoke all on function public.allocate_coa_batch_sale(uuid,text,integer)
  from public, anon, authenticated;

grant execute on function public.allocate_coa_batch_sale(uuid,text,integer)
  to service_role;

revoke all on function public.create_paid_order_v2(
  text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,text,boolean,jsonb
) from public, anon, authenticated;

grant execute on function public.create_paid_order_v2(
  text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,text,boolean,jsonb
) to service_role;
