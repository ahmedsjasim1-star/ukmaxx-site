-- Release BPC-157 after verified Janoshik COA.
-- Janoshik report #208699, batch BPC-2026-05-A, 4.84mg, 99.746%, analysed 27 Jul 2026.

update public.products
set stock_quantity = 19,
    is_active = true,
    updated_at = now()
where sku = 'BC5';
