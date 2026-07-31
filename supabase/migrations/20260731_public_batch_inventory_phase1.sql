-- Phase 1: public batch inventory for the UKMAXX COA checker.
-- This starts public sold counts from the current physical stock on 31 Jul 2026.
-- Historic/test orders are intentionally not counted in sold_count.

alter table public.coa_batches
  add column if not exists assay_result text,
  add column if not exists batch_size integer not null default 0 check (batch_size >= 0),
  add column if not exists sold_count integer not null default 0 check (sold_count >= 0),
  add column if not exists archived_at timestamptz,
  add column if not exists display_order integer not null default 100;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'coa_batches_sold_count_lte_batch_size'
      and conrelid = 'public.coa_batches'::regclass
  ) then
    alter table public.coa_batches
      add constraint coa_batches_sold_count_lte_batch_size
      check (batch_size = 0 or sold_count <= batch_size);
  end if;
end $$;

create or replace function public.set_coa_batch_archive_status()
returns trigger
language plpgsql
as $$
begin
  if new.batch_size > 0 and new.sold_count >= new.batch_size then
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
before insert or update of batch_size, sold_count, archived_at, is_active on public.coa_batches
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
  display_order
) values
  (
    'RT10-2026-06-A',
    'RT10',
    'RETA 10MG',
    '99.223%',
    '10.12mg',
    'UPLC/MS',
    'Janoshik Analytical',
    'https://verify.janoshik.com/tests/193587-RT10_I8UPPV43CJ42',
    './images/reta-coa-2026-06.png',
    '2026-06-22T00:00:00Z',
    now(),
    true,
    29,
    0,
    null,
    10
  ),
  (
    'BPC-2026-05-A',
    'BC5',
    'BPC 157',
    '99.746%',
    '4.84mg',
    'HPLC',
    'Janoshik Analytical',
    'https://verify.janoshik.com/tests/208699-BPC157_5mg_AK9GVE8V85T7',
    './images/bpc-coa-2026-07.png',
    '2026-07-27T00:00:00Z',
    now(),
    true,
    19,
    0,
    null,
    20
  ),
  (
    'GHK-2026-05-A',
    'GHKCU',
    'GHK-Cu 50MG',
    '99.799%',
    '46.68mg GHK-Cu / 38.84mg GHK / 7.84mg copper',
    'HPLC',
    'Janoshik Analytical',
    'https://verify.janoshik.com/tests/208700-GHKCu_50mg_ENTH4P5LPBYX',
    './images/ghkcu-coa-2026-07.png',
    '2026-07-28T00:00:00Z',
    now(),
    true,
    19,
    0,
    null,
    30
  ),
  (
    'NAD-2026-05-A',
    'NJ500',
    'NAD+ 500MG',
    null,
    '568.26mg NAD+',
    'NAD+ analysis',
    'Janoshik Analytical',
    'https://verify.janoshik.com/tests/208698-NAD_500mg_18EWQQVMK7IP',
    './images/nad-coa-2026-07.png',
    '2026-07-29T00:00:00Z',
    now(),
    true,
    19,
    0,
    null,
    40
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
  batch_size = excluded.batch_size,
  is_active = case
    when public.coa_batches.archived_at is not null then false
    else excluded.is_active
  end,
  archived_at = public.coa_batches.archived_at,
  display_order = excluded.display_order;

drop policy if exists public_read_active_coa on public.coa_batches;
drop policy if exists public_read_published_coa on public.coa_batches;

create policy public_read_published_coa
  on public.coa_batches
  for select
  using (published_at is not null);

grant select on public.coa_batches to anon, authenticated;
