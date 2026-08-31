-- End RETA 10mg launch pricing while preserving current stock and batch data.
-- RT10 and RT10X3 return to their original full prices and become MAXX10 eligible.
-- NAD+ (NJ500) remains the only launch-priced product.

update public.products
set
  price = case sku
    when 'RT10' then 54.99
    when 'RT10X3' then 149.99
    else price
  end,
  updated_at = now()
where sku in ('RT10', 'RT10X3');

do $$
begin
  if not exists (
    select 1 from public.products where sku = 'RT10' and price = 54.99
  ) then
    raise exception 'RT10 full-price update failed';
  end if;

  if not exists (
    select 1 from public.products where sku = 'RT10X3' and price = 149.99
  ) then
    raise exception 'RT10X3 full-price update failed';
  end if;
end;
$$;
