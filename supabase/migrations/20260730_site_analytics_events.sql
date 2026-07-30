-- Lightweight first-party analytics for the private UKMAXX admin dashboard.
-- No IP addresses, names, emails or checkout personal data are stored here.

create table if not exists public.site_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (
    event_type in (
      'page_view',
      'product_view',
      'add_to_cart',
      'checkout_opened',
      'payment_started',
      'payment_success',
      'payment_failed',
      'review_opened'
    )
  ),
  session_id text not null,
  page_path text not null,
  page_title text,
  product_sku text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  device_type text,
  created_at timestamptz not null default now()
);

create index if not exists idx_site_events_created_at
  on public.site_events (created_at desc);

create index if not exists idx_site_events_event_type_created_at
  on public.site_events (event_type, created_at desc);

create index if not exists idx_site_events_session_created_at
  on public.site_events (session_id, created_at desc);

create index if not exists idx_site_events_page_path_created_at
  on public.site_events (page_path, created_at desc);

alter table public.site_events enable row level security;

revoke all on public.site_events from anon, authenticated;
