-- Add the full-price BPC-157 3-pack bundle.
-- One BC5X3 order item consumes 3x BC5 and 1x WA10.
-- MAXX10 remains eligible because this is not a launch-price SKU.

insert into public.products (
  sku,
  name,
  slug,
  description,
  price,
  stock_quantity,
  is_active,
  image_url
)
values (
  'BC5X3',
  'BPC 157 3-PACK',
  'bpc-157-3-pack',
  'Three BPC-157 5mg research vials from batch BPC-2026-05-A plus one BAC Water 10ml vial.',
  89.99,
  0,
  true,
  './images/ukmaxx-bpc-bundle.png'
)
on conflict (sku) do update set
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description,
  price = excluded.price,
  is_active = excluded.is_active,
  image_url = excluded.image_url,
  updated_at = now();

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

    if v_sku in ('RT10X3', 'BC5X3') then
      for v_component_sku, v_component_qty in
        select component_sku, component_qty
        from (values
          ('RT10X3', 'RT10', 3),
          ('RT10X3', 'WA10', 1),
          ('BC5X3', 'BC5', 3),
          ('BC5X3', 'WA10', 1)
        ) as bundle_map(bundle_sku, component_sku, component_qty)
        where bundle_sku = v_sku
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

revoke all on function public.create_paid_order_v2(
  text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,text,boolean,jsonb
) from public, anon, authenticated;

grant execute on function public.create_paid_order_v2(
  text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,text,boolean,jsonb
) to service_role;
