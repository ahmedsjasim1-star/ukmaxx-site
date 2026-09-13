begin;

-- Reporting metadata only. Does not alter orders, payments, stock or rewards.
create table if not exists public.admin_order_stat_exclusions (
  order_id uuid primary key references public.orders(id),
  enabled boolean not null default true,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.admin_order_stat_exclusions enable row level security;
revoke all on public.admin_order_stat_exclusions from anon, authenticated;
grant all on public.admin_order_stat_exclusions to service_role;

insert into public.admin_order_stat_exclusions (order_id, reason)
select id, case when order_number = 'UKX26XP9CK7'
  then 'Owner-confirmed test: 23 August £13.98'
  else 'Owner-confirmed test: before 5 August 2026 UK time' end
from public.orders
where created_at < timestamptz '2026-08-05 00:00:00 Europe/London'
   or (order_number = 'UKX26XP9CK7' and total = 13.98)
on conflict (order_id) do nothing;

commit;

select o.order_number, o.total, o.created_at, e.enabled, e.reason
from public.admin_order_stat_exclusions e
join public.orders o on o.id = e.order_id
order by o.created_at;
