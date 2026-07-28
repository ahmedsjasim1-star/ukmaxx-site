-- Release GHK-Cu after verified Janoshik COA.
-- Janoshik report #208700, batch GHK-2026-05-A, 46.68mg GHK-Cu, 99.799%, analysed 28 Jul 2026.

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
  'GHKCU',
  'GHK-Cu 50MG',
  'ghk-cu-50mg',
  '50mg lyophilised copper peptide.',
  29.99,
  19,
  true,
  './images/ukmaxx-ghk-cu.png',
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
