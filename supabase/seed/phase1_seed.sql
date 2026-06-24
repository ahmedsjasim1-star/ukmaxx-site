-- UKMAXX V1 seed data

insert into public.products (sku, name, slug, description, price, stock_quantity, is_active, image_url)
values
  ('RT10', 'RETA 10MG', 'reta-10mg', 'Lyophilised peptide compound. Batch-specific COA available for current RETA batch. For in-vitro research only.', 54.99, 100, true, './images/reta-single.jpg'),
  ('RT10X3', 'RETA 3-PACK', 'reta-3-pack', '3x RT10 vials + 3x BAC water. COA included per batch. Save £41.95 vs buying separately.', 149.99, 50, true, './images/reta-3pack-v2.jpg'),
  ('BC5', 'BPC 157', 'bpc-157', '5mg lyophilised peptide per vial. COA pending; batch-coded for traceability.', 29.99, 100, true, './images/bpc-157.jpg'),
  ('IP5', 'IPAM 5MG', 'ipam-5mg', '5mg lyophilised peptide. COA pending; batch-coded for traceability.', 24.99, 100, true, './images/ipamorelin.jpg'),
  ('NJ500', 'NAD+ 500MG', 'nad-500mg', 'Coenzyme research compound. COA pending; batch-coded for traceability.', 44.99, 100, true, './images/nad-500-box.jpg'),
  ('WA10', 'BAC WATER', 'bac-water', '10ml bacteriostatic water. 0.9% benzyl alcohol. Sterile, multi-draw laboratory grade.', 8.99, 200, true, './images/bac-water-box.jpg')
on conflict (sku) do update set
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description,
  price = excluded.price,
  stock_quantity = excluded.stock_quantity,
  is_active = excluded.is_active,
  image_url = excluded.image_url,
  updated_at = now();

insert into public.coa_batches (batch_code, sku, product_name, purity, method, lab_name, coa_url, image_url, tested_at, published_at, is_active)
values
  ('RT10-2026-06-A', 'RT10', 'RETA 10MG', '99.223%', 'UPLC/MS (GLP-1 blind test)', 'Janoshik Analytical', 'https://verify.janoshik.com/tests/193587-RT10_I8UPPV43CJ42', './images/reta-coa-2026-06.png', '2026-06-22T00:00:00Z', '2026-06-22T00:00:00Z', true)
on conflict (batch_code) do update set
  sku = excluded.sku,
  product_name = excluded.product_name,
  purity = excluded.purity,
  method = excluded.method,
  lab_name = excluded.lab_name,
  coa_url = excluded.coa_url,
  image_url = excluded.image_url,
  tested_at = excluded.tested_at,
  published_at = excluded.published_at,
  is_active = excluded.is_active;
