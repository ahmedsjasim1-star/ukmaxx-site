alter table public.reviews_pending
  add column if not exists reviewer_name text,
  add column if not exists order_number text,
  add column if not exists email_hash text,
  add column if not exists source text;

create index if not exists reviews_pending_order_number_idx
  on public.reviews_pending (order_number);

create index if not exists reviews_public_product_idx
  on public.reviews_public (product);
