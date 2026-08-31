-- End launch pricing and apply the agreed permanent bundle prices.
-- Stock, batches, order functions and payment configuration are unchanged.

update public.products
set price = case sku
  when 'NJ500' then 39.99
  when 'RT20X3' then 269.99
  when 'BC5X3' then 84.99
  when 'GHKCUX3' then 84.99
  when 'UKXRB1' then 109.99
  else price
end,
updated_at = now()
where sku in ('NJ500', 'RT20X3', 'BC5X3', 'GHKCUX3', 'UKXRB1');

-- RT10X3 intentionally remains £149.99.
