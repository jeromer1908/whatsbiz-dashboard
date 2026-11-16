-- Role-based accounts: tasks are assigned to a username and notifications target a username.
-- Usernames come from src/auth/users.ts: admin (super_admin), staff and staff2 (user).
-- Run once in the Supabase SQL editor, after 20261016000000_tasks_notifications.sql.

-- ------------------------------------------------------------
-- tasks.assigned_to — existing tasks belonged to the single staff login, so they go to 'staff'
-- ------------------------------------------------------------
alter table public.tasks add column if not exists assigned_to text;
update public.tasks set assigned_to = 'staff' where assigned_to is null;
alter table public.tasks alter column assigned_to set not null;

alter table public.tasks drop constraint if exists tasks_assigned_to_check;
alter table public.tasks add constraint tasks_assigned_to_check check (assigned_to in ('staff', 'staff2'));

create index if not exists tasks_assigned_to_due_idx on public.tasks (assigned_to, due_date);

-- ------------------------------------------------------------
-- notifications.recipient — allow staff2
-- ------------------------------------------------------------
do $$
declare
  c record;
begin
  -- Drop whatever check constraint currently restricts recipient (auto-named in the first migration).
  for c in
    select con.conname
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where con.conrelid = 'public.notifications'::regclass
      and con.contype = 'c'
      and att.attname = 'recipient'
  loop
    execute format('alter table public.notifications drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.notifications
  add constraint notifications_recipient_check check (recipient in ('admin', 'staff', 'staff2'));
