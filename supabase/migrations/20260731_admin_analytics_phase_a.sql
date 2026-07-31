-- Phase A admin analytics accuracy.
-- Adds privacy-friendly visitor/session/location fields and internal traffic filtering.
-- No IP addresses, emails, names or checkout personal details are stored in site_events.

alter table public.site_events
  add column if not exists visitor_id text,
  add column if not exists is_internal boolean not null default false,
  add column if not exists referrer_host text,
  add column if not exists source_group text,
  add column if not exists country text,
  add column if not exists region text,
  add column if not exists city text,
  add column if not exists timezone text,
  add column if not exists language text;

update public.site_events
set visitor_id = session_id
where visitor_id is null;

create index if not exists idx_site_events_visitor_created_at
  on public.site_events (visitor_id, created_at desc);

create index if not exists idx_site_events_internal_created_at
  on public.site_events (is_internal, created_at desc);

create index if not exists idx_site_events_source_created_at
  on public.site_events (source_group, created_at desc);

create index if not exists idx_site_events_country_created_at
  on public.site_events (country, created_at desc);
