-- Day-wise quota snapshots so the Quota page can show previous days
-- (yesterday, 17 Oct 2026, ...). One row per customer per day.
-- Customer details are denormalized so history stays readable after a
-- customer is renamed or deleted.
-- Run once in the Supabase SQL editor.

create table if not exists public.quota_history (
  snapshot_date       date not null,
  customer_id         uuid not null references public.customers (id) on delete cascade,
  customer_name       text not null,
  mobile              text,
  plan                text,
  quota_type          text check (quota_type in ('daily', 'monthly')),
  daily_limit         integer,
  monthly_limit       integer,
  valid_till          date,
  vendor_daily_limit  integer,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (snapshot_date, customer_id)
);

create index if not exists quota_history_snapshot_date_idx on public.quota_history (snapshot_date desc);
create index if not exists quota_history_customer_idx on public.quota_history (customer_id, snapshot_date desc);

-- ------------------------------------------------------------
-- RLS — same reasoning as tasks/notifications: admin signs in through
-- Supabase Auth (authenticated), staff uses the anon key.
-- ------------------------------------------------------------
grant select, insert, update, delete on public.quota_history to anon, authenticated;

alter table public.quota_history enable row level security;

drop policy if exists "quota_history_all" on public.quota_history;
create policy "quota_history_all" on public.quota_history for all to anon, authenticated using (true) with check (true);
