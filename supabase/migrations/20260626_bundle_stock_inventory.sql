-- Bundle-aware stock handling for UKMAXX launch.
-- RT10X3 remains a sellable product, but its stock is calculated from:
--   3x RT10 + 3x WA10

update public.products
set stock_quantity = case sku
  when 'RT10' then 19
  when 'WA10' then 20
  when 'RT10X3' then 6
  else stock_quantity
end,
updated_at = now()
where sku in ('RT10', 'WA10', 'RT10X3');

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
  v_component_sku text;
  v_component_qty integer;
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
