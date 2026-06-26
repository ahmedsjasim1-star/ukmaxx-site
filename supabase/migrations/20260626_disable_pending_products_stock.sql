-- Keep future/COA-pending products unavailable until intentionally launched.
update public.products
set stock_quantity = 0,
    is_active = false,
    updated_at = now()
where sku in ('BC5', 'IP5', 'NJ500');
