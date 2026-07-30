-- Release NAD+ 500mg after verified Janoshik COA.
-- Janoshik report #208698, batch NAD-2026-05-A, 568.26mg NAD+, analysed 29 Jul 2026.

insert into public.products (
  sku,
  name,
  slug,
  description,
  price,
  stock_quantity,
  is_active,
  image_url,
  updated_at
) values (
  'NJ500',
  'NAD+ 500MG',
  'nad-500mg',
  '500mg lyophilised NAD+ coenzyme.',
  44.99,
  19,
  true,
  './images/ukmaxx-nad-500.png',
  now()
)
on conflict (sku) do update
set name = excluded.name,
    slug = excluded.slug,
    description = excluded.description,
    price = excluded.price,
    stock_quantity = excluded.stock_quantity,
    is_active = excluded.is_active,
    image_url = excluded.image_url,
    updated_at = now();
