-- Royal Mail Click & Drop fulfilment automation.
-- Stores the Click & Drop order/label state separately from UKMAXX order state.

alter table public.orders
  add column if not exists royalmail_order_identifier bigint,
  add column if not exists royalmail_tracking_number text,
  add column if not exists royalmail_label_status text,
  add column if not exists royalmail_payload jsonb,
  add column if not exists label_created_at timestamptz,
  add column if not exists label_printed_at timestamptz;

create index if not exists idx_orders_royalmail_order_identifier
  on public.orders(royalmail_order_identifier)
  where royalmail_order_identifier is not null;

create index if not exists idx_orders_royalmail_tracking_number
  on public.orders(royalmail_tracking_number)
  where royalmail_tracking_number is not null;
