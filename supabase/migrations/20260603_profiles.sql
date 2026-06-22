-- UKMAXX V1.1: Auth profiles
-- Requires SUPABASE_ANON_KEY to be set in Vercel env vars for client-side auth.
--
-- Run after applying:
--   1. Go to Supabase Dashboard > Authentication > Settings
--   2. Set SITE_URL to https://ukmaxx-site-5tc7.vercel.app
--   3. Add redirect URLs: https://ukmaxx-site-5tc7.vercel.app/**
--   4. (Optional) DISABLE email confirmations for dev:
--      SQL: UPDATE auth.config SET enable_confirmations = false;
--
-- Environment variables needed in Vercel:
--   SUPABASE_URL        (already set)
--   SUPABASE_ANON_KEY   (NEW — get from Supabase Dashboard > Settings > API > anon/public key)
--   SUPABASE_SERVICE_ROLE_KEY (already set)

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  terms_accepted_at timestamptz,
  research_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Enable RLS on profiles
alter table public.profiles enable row level security;

-- Users can read their own profile
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Users can update their own profile
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Service role can do everything (for admin)
create policy "Service role full access"
  on public.profiles for all
  using (true)
  with check (true);
