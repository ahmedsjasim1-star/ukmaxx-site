-- Reprice RT20 and its fixed three-vial bundle only.
-- Stock, batches, bundle components, order functions and payment configuration are unchanged.

update public.products
set price = case sku
  when 'RT20' then 79.99
  when 'RT20X3' then 227.97
  else price
end,
updated_at = now()
where sku in ('RT20', 'RT20X3');
