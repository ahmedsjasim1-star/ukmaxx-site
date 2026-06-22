-- Add dispatched/delivered tracking columns and update status constraint

alter table public.orders
  add column if not exists dispatched_at timestamptz,
  add column if not exists delivered_at timestamptz;

-- Convert existing 'shipped' orders to 'dispatched' before changing constraint
update public.orders set status = 'dispatched' where status = 'shipped';

-- Update the status check constraint to include 'dispatched'
alter table public.orders
  drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
    check (status in ('pending','paid','processing','dispatched','delivered','cancelled','refunded'));

-- Cancel / refund / review tracking columns
alter table public.orders
  add column if not exists cancellation_reason text,
  add column if not exists refunded_at timestamptz,
  add column if not exists stripe_refund_id text,
  add column if not exists review_request_sent_at timestamptz;
