create table if not exists public.reviews_pending (
  id uuid primary key default gen_random_uuid(),
  initials text not null,
  product text not null,
  rating int not null check (rating between 1 and 5),
  review_text text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.reviews_public (
  id uuid primary key default gen_random_uuid(),
  initials text not null,
  product text not null,
  rating int not null check (rating between 1 and 5),
  review_text text not null,
  review_date date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.reviews_pending enable row level security;
alter table public.reviews_public enable row level security;

-- Public can read approved reviews list only via reviews_public
drop policy if exists "public_read_reviews_public" on public.reviews_public;
create policy "public_read_reviews_public"
  on public.reviews_public
  for select
  to anon
  using (true);
