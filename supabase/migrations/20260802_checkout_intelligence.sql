-- Phase C admin analytics: privacy-safe cart and checkout intelligence.
-- Stores product/cart behaviour only. No names, emails, addresses, phone numbers or IPs.

alter table public.site_events
  add column if not exists cart_items jsonb,
  add column if not exists cart_value numeric(10,2),
  add column if not exists promo_code text;

create index if not exists idx_site_events_checkout_session_created_at
  on public.site_events (session_id, created_at desc)
  where event_type in ('add_to_cart', 'checkout_opened', 'payment_started', 'payment_failed', 'payment_success');

create index if not exists idx_site_events_cart_value_created_at
  on public.site_events (cart_value, created_at desc)
  where cart_value is not null;
