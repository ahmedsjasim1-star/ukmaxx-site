-- Allow privacy-safe measurement of the site-wide WhatsApp support button.
-- The event stores the existing anonymous session/page/device fields only.

alter table public.site_events
  drop constraint if exists site_events_event_type_check;

alter table public.site_events
  add constraint site_events_event_type_check
  check (
    event_type in (
      'page_view',
      'product_view',
      'add_to_cart',
      'checkout_opened',
      'payment_started',
      'payment_success',
      'payment_failed',
      'review_opened',
      'whatsapp_support_click'
    )
  );
