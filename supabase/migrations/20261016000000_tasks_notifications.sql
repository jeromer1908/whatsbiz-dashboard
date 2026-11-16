-- Tasks, task updates & notifications for the admin/staff task feature.
-- Run once in the Supabase SQL editor.

create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  due_date      date not null,
  priority      text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status        text not null default 'pending' check (status in ('pending', 'completed')),
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists tasks_due_date_idx on public.tasks (due_date);
create index if not exists tasks_completed_at_idx on public.tasks (completed_at);

create table if not exists public.task_updates (
  id              uuid primary key default gen_random_uuid(),
  task_id         uuid not null references public.tasks (id) on delete cascade,
  message         text,
  screenshot_url  text,
  created_at      timestamptz not null default now(),
  constraint task_updates_has_content check (message is not null or screenshot_url is not null)
);
create index if not exists task_updates_task_id_idx on public.task_updates (task_id);

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  recipient   text not null check (recipient in ('admin', 'staff')),
  type        text not null check (type in ('task_assigned', 'task_completed')),
  task_id     uuid references public.tasks (id) on delete cascade,
  title       text not null,
  message     text,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_recipient_idx on public.notifications (recipient, is_read, created_at desc);

-- ------------------------------------------------------------
-- RLS
-- Admin signs in through Supabase Auth (role "authenticated").
-- Staff uses the static .env login, so its requests use the anon key (role "anon").
-- Both roles therefore need access to these three tables.
-- ------------------------------------------------------------
alter table public.tasks         enable row level security;
alter table public.task_updates  enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "tasks_all" on public.tasks;
create policy "tasks_all" on public.tasks for all to anon, authenticated using (true) with check (true);

drop policy if exists "task_updates_all" on public.task_updates;
create policy "task_updates_all" on public.task_updates for all to anon, authenticated using (true) with check (true);

drop policy if exists "notifications_all" on public.notifications;
create policy "notifications_all" on public.notifications for all to anon, authenticated using (true) with check (true);

-- ------------------------------------------------------------
-- Realtime on notifications
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ------------------------------------------------------------
-- Storage bucket for completion screenshots (public read)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-screenshots', 'task-screenshots', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set public = true;

drop policy if exists "task_screenshots_upload" on storage.objects;
create policy "task_screenshots_upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'task-screenshots');

drop policy if exists "task_screenshots_read" on storage.objects;
create policy "task_screenshots_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'task-screenshots');
