-- UKMAXX launch pricing.
-- These prices are used by the Pay by Bank server checkout, so they must match
-- the public product prices in assets/js/data/products.js.

update public.products
set price = 44.99
where sku = 'RT10';

update public.products
set price = 134.99
where sku = 'RT10X3';

update public.products
set price = 39.99
where sku = 'NJ500';
