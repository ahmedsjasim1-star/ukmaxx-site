-- Public rejected batch records for the UKMAXX COA checker.
-- Archived = previously approved/sold-through. Rejected = tested but not released for sale.

alter table public.coa_batches
  add column if not exists release_status text not null default 'approved',
  add column if not exists rejection_reason text,
  add column if not exists label_claim text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'coa_batches_release_status_check'
      and conrelid = 'public.coa_batches'::regclass
  ) then
    alter table public.coa_batches
      add constraint coa_batches_release_status_check
      check (release_status in ('approved', 'rejected'));
  end if;
end $$;

create or replace function public.set_coa_batch_archive_status()
returns trigger
language plpgsql
as $$
begin
  if new.release_status = 'rejected' then
    new.is_active := false;
    new.archived_at := null;
  elsif new.batch_size > 0 and new.sold_count >= new.batch_size then
    new.is_active := false;
    new.archived_at := coalesce(new.archived_at, now());
  elsif new.archived_at is null and new.batch_size > 0 and new.sold_count < new.batch_size then
    new.is_active := true;
  end if;

  return new;
end;
$$;

drop trigger if exists coa_batches_archive_status on public.coa_batches;
create trigger coa_batches_archive_status
before insert or update of batch_size, sold_count, archived_at, is_active, release_status on public.coa_batches
for each row execute function public.set_coa_batch_archive_status();

insert into public.coa_batches (
  batch_code,
  sku,
  product_name,
  purity,
  assay_result,
  method,
  lab_name,
  coa_url,
  image_url,
  tested_at,
  published_at,
  is_active,
  batch_size,
  sold_count,
  archived_at,
  display_order,
  release_status,
  rejection_reason,
  label_claim
) values (
  'IPA-2026-05-A',
  'IP5',
  'IPAM 5MG',
  '99.429%',
  '3.71mg',
  'Ipamorelin analysis',
  'Janoshik Analytical',
  'https://verify.janoshik.com/tests/208701-Ipamorelin_5mg_BHYXQQELT4GZ',
  './images/ukmaxx-ipamorelin.png',
  '2026-07-27T00:00:00Z',
  now(),
  false,
  19,
  0,
  null,
  90,
  'rejected',
  'Below UKMAXX release specification for labelled vial content: 3.71mg found vs 5mg label claim.',
  '5mg'
)
on conflict (batch_code) do update set
  sku = excluded.sku,
  product_name = excluded.product_name,
  purity = excluded.purity,
  assay_result = excluded.assay_result,
  method = excluded.method,
  lab_name = excluded.lab_name,
  coa_url = excluded.coa_url,
  image_url = excluded.image_url,
  tested_at = excluded.tested_at,
  published_at = coalesce(public.coa_batches.published_at, excluded.published_at),
  is_active = false,
  batch_size = excluded.batch_size,
  sold_count = excluded.sold_count,
  archived_at = null,
  display_order = excluded.display_order,
  release_status = excluded.release_status,
  rejection_reason = excluded.rejection_reason,
  label_claim = excluded.label_claim;

grant select on public.coa_batches to anon, authenticated;
