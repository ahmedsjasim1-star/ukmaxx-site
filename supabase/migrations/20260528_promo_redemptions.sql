create table if not exists public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  promo_code text not null,
  stripe_session_id text not null,
  order_id uuid references public.orders(id) on delete set null,
  redeemed_at timestamptz not null default now(),
  constraint promo_redemptions_email_lower check (email = lower(email)),
  constraint promo_redemptions_code_upper check (promo_code = upper(promo_code)),
  constraint promo_redemptions_email_code_unique unique (email, promo_code)
);

create index if not exists idx_promo_redemptions_email on public.promo_redemptions(email);
create index if not exists idx_promo_redemptions_code on public.promo_redemptions(promo_code);
