-- Reset UKMAXX live stock counts to physical inventory.
-- Bundle stock is calculated from 3x RT10 + 1x WA10.

update public.products
set stock_quantity = case sku
  when 'RT10' then 29
  when 'BC5' then 19
  when 'GHKCU' then 19
  when 'NJ500' then 19
  when 'WA10' then 70
  when 'RT10X3' then 9
  else stock_quantity
end,
is_active = case sku
  when 'RT10' then true
  when 'BC5' then true
  when 'GHKCU' then true
  when 'NJ500' then true
  when 'WA10' then true
  when 'RT10X3' then true
  else is_active
end,
updated_at = now()
where sku in ('RT10', 'BC5', 'GHKCU', 'NJ500', 'WA10', 'RT10X3');

