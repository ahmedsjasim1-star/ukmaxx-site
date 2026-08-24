-- Verified review identity choices, moderated photos and duplicate protection.
-- Run this migration before deploying the matching website/API update.

alter table public.reviews_pending
  add column if not exists display_name text,
  add column if not exists display_mode text not null default 'initials',
  add column if not exists image_paths text[] not null default '{}';

alter table public.reviews_public
  add column if not exists display_name text,
  add column if not exists display_mode text not null default 'initials',
  add column if not exists image_paths text[] not null default '{}',
  add column if not exists source_review_id uuid;

update public.reviews_pending
set display_name = initials
where display_name is null or btrim(display_name) = '';

update public.reviews_public
set display_name = initials
where display_name is null or btrim(display_name) = '';

alter table public.reviews_pending
  drop constraint if exists reviews_pending_display_mode_check;
alter table public.reviews_pending
  add constraint reviews_pending_display_mode_check
  check (display_mode in ('initials', 'first_name'));

alter table public.reviews_public
  drop constraint if exists reviews_public_display_mode_check;
alter table public.reviews_public
  add constraint reviews_public_display_mode_check
  check (display_mode in ('initials', 'first_name'));

create unique index if not exists reviews_pending_one_per_order_product
  on public.reviews_pending (order_number, product)
  where order_number is not null and status in ('pending', 'approved');

create unique index if not exists reviews_public_source_review_id_unique
  on public.reviews_public (source_review_id)
  where source_review_id is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'review-images',
  'review-images',
  false,
  870400,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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
      'review_order_verified',
      'review_submitted',
      'whatsapp_support_click'
    )
  );

-- No anon/authenticated storage policies are created. Uploads, signed reads
-- and moderation are performed only by the existing server-side service role.
