-- UKMAXX private admin customer journeys.
-- Additive only: existing checkout, orders and accounts continue to work.

alter table public.payment_attempts
  add column if not exists visitor_id text,
  add column if not exists session_id text,
  add column if not exists account_user_id uuid,
  add column if not exists checkout_type text,
  add column if not exists first_source text,
  add column if not exists first_referrer text,
  add column if not exists first_landing_page text,
  add column if not exists first_seen_at timestamptz,
  add column if not exists first_utm_source text,
  add column if not exists first_utm_medium text,
  add column if not exists first_utm_campaign text,
  add column if not exists conversion_source text,
  add column if not exists conversion_referrer text,
  add column if not exists conversion_landing_page text,
  add column if not exists conversion_utm_source text,
  add column if not exists conversion_utm_medium text,
  add column if not exists conversion_utm_campaign text,
  add column if not exists device_type text,
  add column if not exists visitor_country text,
  add column if not exists visitor_region text,
  add column if not exists visitor_city text;

create index if not exists idx_payment_attempts_visitor_created_at
  on public.payment_attempts (visitor_id, created_at desc)
  where visitor_id is not null;

create index if not exists idx_payment_attempts_session_created_at
  on public.payment_attempts (session_id, created_at desc)
  where session_id is not null;

create index if not exists idx_payment_attempts_account_created_at
  on public.payment_attempts (account_user_id, created_at desc)
  where account_user_id is not null;

alter table public.profiles
  add column if not exists signup_provider text,
  add column if not exists analytics_visitor_id text,
  add column if not exists analytics_session_id text,
  add column if not exists first_source text,
  add column if not exists first_referrer text,
  add column if not exists first_landing_page text,
  add column if not exists first_seen_at timestamptz,
  add column if not exists first_utm_source text,
  add column if not exists first_utm_medium text,
  add column if not exists first_utm_campaign text,
  add column if not exists last_linked_at timestamptz;

update public.profiles p
set signup_provider = coalesce(
  p.signup_provider,
  u.raw_app_meta_data ->> 'provider',
  case when u.encrypted_password is not null then 'email' else null end
)
from auth.users u
where p.id = u.id
  and p.signup_provider is null;

create index if not exists idx_profiles_created_at
  on public.profiles (created_at desc);

create index if not exists idx_profiles_analytics_visitor
  on public.profiles (analytics_visitor_id)
  where analytics_visitor_id is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    first_name,
    last_name,
    signup_provider
  ) values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data ->> 'given_name'),
    coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data ->> 'family_name'),
    coalesce(new.raw_app_meta_data ->> 'provider', 'email')
  )
  on conflict (id) do update set
    email = excluded.email,
    first_name = coalesce(excluded.first_name, public.profiles.first_name),
    last_name = coalesce(excluded.last_name, public.profiles.last_name),
    signup_provider = coalesce(excluded.signup_provider, public.profiles.signup_provider);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email, raw_user_meta_data, raw_app_meta_data on auth.users
  for each row execute function public.handle_new_user();
