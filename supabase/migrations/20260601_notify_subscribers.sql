create table if not exists public.notify_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  topics text[] not null default array['restock','batch_updates']::text[],
  status text not null default 'active' check (status in ('active','unsubscribed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_notify_subscribers_status on public.notify_subscribers(status);

alter table public.notify_subscribers enable row level security;
