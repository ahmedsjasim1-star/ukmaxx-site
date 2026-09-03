-- Reliable automated review requests for orders placed from 1 September 2026.
-- The application still enforces the launch cutoff; this migration provides
-- atomic claiming so duplicate cron invocations cannot claim the same order.

alter table public.orders
  add column if not exists review_request_status text,
  add column if not exists review_request_claimed_at timestamptz,
  add column if not exists review_request_attempts integer not null default 0,
  add column if not exists review_request_last_error text,
  add column if not exists review_request_email_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_review_request_status_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_review_request_status_check
      check (review_request_status is null or review_request_status in ('pending','sending','sent','failed','suppressed'));
  end if;
end;
$$;

update public.orders
set review_request_status = 'sent'
where review_request_sent_at is not null
  and review_request_status is distinct from 'sent';

create index if not exists idx_orders_automated_review_due
  on public.orders (delivered_at, created_at)
  where status = 'delivered' and review_request_sent_at is null;

create or replace function public.claim_automated_review_requests(
  p_order_cutoff timestamptz,
  p_due_before timestamptz,
  p_limit integer default 20
)
returns table (id uuid, order_number text, email text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with eligible as (
    select o.id
    from public.orders o
    where o.status = 'delivered'
      and o.created_at >= p_order_cutoff
      and o.delivered_at is not null
      and o.delivered_at <= p_due_before
      and o.review_request_sent_at is null
      and nullif(trim(o.email), '') is not null
      and coalesce(o.review_request_attempts, 0) < 3
      and (o.review_request_status is null or o.review_request_status in ('pending','failed'))
    order by o.delivered_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 20))
  )
  update public.orders o
  set review_request_status = 'sending',
      review_request_claimed_at = now(),
      review_request_attempts = coalesce(o.review_request_attempts, 0) + 1,
      review_request_last_error = null
  from eligible e
  where o.id = e.id
  returning o.id, o.order_number, o.email;
end;
$$;

revoke all on function public.claim_automated_review_requests(timestamptz, timestamptz, integer) from public;
revoke all on function public.claim_automated_review_requests(timestamptz, timestamptz, integer) from anon;
revoke all on function public.claim_automated_review_requests(timestamptz, timestamptz, integer) from authenticated;
grant execute on function public.claim_automated_review_requests(timestamptz, timestamptz, integer) to service_role;
