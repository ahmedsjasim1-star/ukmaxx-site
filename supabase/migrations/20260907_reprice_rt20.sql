-- Current RT20 prices only; historical orders retain their original totals.
begin;
update public.products
set price = case sku
  when 'RT20' then 64.99
  when 'RT20X3' then 184.99
  else price
end,
updated_at = now()
where sku in ('RT20', 'RT20X3');
commit;

select sku, name, price from public.products where sku in ('RT20', 'RT20X3');
