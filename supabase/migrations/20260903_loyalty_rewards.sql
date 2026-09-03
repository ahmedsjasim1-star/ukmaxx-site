-- UKMAXX Rewards: additive loyalty ledger. Checkout use remains feature-flagged
-- until the historical backfill and every reward path have been reviewed.

alter table public.orders
  add column if not exists account_user_id uuid,
  add column if not exists loyalty_eligible boolean not null default true,
  add column if not exists loyalty_qualifying_subtotal numeric(10,2),
  add column if not exists loyalty_reward_id uuid,
  add column if not exists loyalty_reward_discount numeric(10,2) not null default 0;

create table if not exists public.loyalty_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  email text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loyalty_members_email_lower check (email = lower(email))
);

create table if not exists public.loyalty_stamps (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.loyalty_members(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  sequence_number integer not null check (sequence_number > 0),
  cycle_number integer not null check (cycle_number > 0),
  step_number integer not null check (step_number between 1 and 10),
  awarded_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversal_reason text,
  unique(order_id),
  unique(member_id, sequence_number)
);

create table if not exists public.loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.loyalty_members(id) on delete cascade,
  stamp_id uuid not null unique references public.loyalty_stamps(id) on delete cascade,
  reward_code text not null,
  status text not null default 'available',
  reserved_reference text,
  reserved_at timestamptz,
  redeemed_order_id uuid references public.orders(id),
  redeemed_at timestamptz,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint loyalty_rewards_status_check check (status in ('available','reserved','redeemed','reversed')),
  constraint loyalty_rewards_code_check check (reward_code in (
    'CARD_UNLOCK','CREDIT_5','FREE_BAC','CREDIT_10','PERCENT_20_CAP_25',
    'FREE_VIAL_2999','CREDIT_20','FREE_BAC_VIAL_2999','PERCENT_30_CAP_50','FREE_ANY_VIAL'
  ))
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_loyalty_reward_id_fkey'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_loyalty_reward_id_fkey
      foreign key (loyalty_reward_id) references public.loyalty_rewards(id);
  end if;
end;
$$;

create index if not exists idx_loyalty_stamps_member on public.loyalty_stamps(member_id, sequence_number);
create index if not exists idx_loyalty_rewards_member_status on public.loyalty_rewards(member_id, status, created_at);
create index if not exists idx_orders_account_user on public.orders(account_user_id, created_at desc);

alter table public.loyalty_members enable row level security;
alter table public.loyalty_stamps enable row level security;
alter table public.loyalty_rewards enable row level security;
revoke all on public.loyalty_members, public.loyalty_stamps, public.loyalty_rewards from anon, authenticated;
grant all on public.loyalty_members, public.loyalty_stamps, public.loyalty_rewards to service_role;

create or replace function public.sync_loyalty_member(p_user_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_order record;
  v_sequence integer;
  v_step integer;
  v_stamp_id uuid;
  v_reward_code text;
begin
  if p_user_id is null or nullif(lower(trim(p_email)), '') is null then
    raise exception 'invalid_loyalty_member';
  end if;

  insert into public.loyalty_members(user_id, email)
  values (p_user_id, lower(trim(p_email)))
  on conflict (user_id) do update set
    email = excluded.email,
    updated_at = now()
  returning id into v_member_id;

  for v_order in
    select o.id, coalesce(o.delivered_at, o.created_at) as earned_at
    from public.orders o
    where lower(o.email) = lower(trim(p_email))
      and o.status = 'delivered'
      and o.loyalty_eligible = true
      and coalesce(o.loyalty_qualifying_subtotal, o.subtotal, 0) >= 50
      and not exists (select 1 from public.loyalty_stamps s where s.order_id = o.id)
    order by coalesce(o.delivered_at, o.created_at), o.id
  loop
    select coalesce(max(sequence_number), 0) + 1 into v_sequence
    from public.loyalty_stamps where member_id = v_member_id;
    v_step := ((v_sequence - 1) % 10) + 1;

    insert into public.loyalty_stamps(member_id, order_id, sequence_number, cycle_number, step_number, awarded_at)
    values (v_member_id, v_order.id, v_sequence, ((v_sequence - 1) / 10) + 1, v_step, v_order.earned_at)
    returning id into v_stamp_id;

    v_reward_code := case v_step
      when 1 then 'CARD_UNLOCK'
      when 2 then 'CREDIT_5'
      when 3 then 'FREE_BAC'
      when 4 then 'CREDIT_10'
      when 5 then 'PERCENT_20_CAP_25'
      when 6 then 'FREE_VIAL_2999'
      when 7 then 'CREDIT_20'
      when 8 then 'FREE_BAC_VIAL_2999'
      when 9 then 'PERCENT_30_CAP_50'
      when 10 then 'FREE_ANY_VIAL'
    end;

    insert into public.loyalty_rewards(member_id, stamp_id, reward_code, status, created_at)
    values (v_member_id, v_stamp_id, v_reward_code,
      case when v_reward_code = 'CARD_UNLOCK' then 'redeemed' else 'available' end,
      v_order.earned_at);
  end loop;

  return v_member_id;
end;
$$;

revoke all on function public.sync_loyalty_member(uuid,text) from public, anon, authenticated;
grant execute on function public.sync_loyalty_member(uuid,text) to service_role;
