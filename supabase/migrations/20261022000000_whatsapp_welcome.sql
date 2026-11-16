-- WhatsApp welcome message on conversion (New customers only).
-- Run once in the Supabase SQL editor.
--
-- Before it can send, store the WhatAPI token in Vault (once):
--   select vault.create_secret('PASTE_TOKEN_HERE', 'whatsapp_token');
-- To replace it later:
--   select vault.update_secret((select id from vault.secrets where name = 'whatsapp_token'), 'NEW_TOKEN');
--
-- To switch template later:
--   update public.whatsapp_settings set template_name = '...', template_lang = '...' where id = 1;
--   (and adjust the body parameters in public.send_welcome_whatsapp if the placeholders change)

create extension if not exists pg_net with schema extensions;

-- ------------------------------------------------------------
-- customers.customer_type — chosen in the Convert modal
-- ------------------------------------------------------------
alter table public.customers add column if not exists customer_type text;
alter table public.customers drop constraint if exists customers_customer_type_check;
alter table public.customers
  add constraint customers_customer_type_check check (customer_type is null or customer_type in ('new', 'existing'));

-- ------------------------------------------------------------
-- Settings (single row). No secrets here — the token lives in Vault.
-- ------------------------------------------------------------
create table if not exists public.whatsapp_settings (
  id               int primary key default 1 check (id = 1),
  enabled          boolean not null default true,
  api_base         text not null,
  api_version      text not null,
  phone_number_id  text not null,
  template_name    text not null,
  template_lang    text not null,
  updated_at       timestamptz not null default now()
);

insert into public.whatsapp_settings (id, api_base, api_version, phone_number_id, template_name, template_lang)
values (1, 'https://crmapi1.whatapi.in/api/meta', 'v19.0', '690305917501262', 'order_1901', 'en')
on conflict (id) do nothing;

alter table public.whatsapp_settings enable row level security;
drop policy if exists "whatsapp_settings_read" on public.whatsapp_settings;
create policy "whatsapp_settings_read" on public.whatsapp_settings for select to authenticated using (true);

-- ------------------------------------------------------------
-- Message log — one row per send attempt
-- ------------------------------------------------------------
create table if not exists public.whatsapp_messages (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references public.customers (id) on delete cascade,
  request_id     bigint,               -- pg_net request id
  to_number      text,
  template_name  text,
  status         text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  http_status    int,
  response       text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists whatsapp_messages_customer_idx on public.whatsapp_messages (customer_id, created_at desc);

alter table public.whatsapp_messages enable row level security;
drop policy if exists "whatsapp_messages_read" on public.whatsapp_messages;
create policy "whatsapp_messages_read" on public.whatsapp_messages for select to authenticated using (true);

-- ------------------------------------------------------------
-- Send the welcome template to one customer. Returns the log row id.
-- Runs as the table owner so it can read the Vault token; the browser never sees it.
-- ------------------------------------------------------------
create or replace function public.send_welcome_whatsapp(p_customer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s        public.whatsapp_settings;
  c        public.customers;
  v_token  text;
  v_digits text;
  v_to     text;
  v_params text[];
  v_body   jsonb;
  v_req    bigint;
  v_log_id uuid;
begin
  select * into s from public.whatsapp_settings where id = 1;
  if not found or not s.enabled then
    raise exception 'WhatsApp sending is turned off';
  end if;

  select * into c from public.customers where id = p_customer_id;
  if not found then
    raise exception 'Customer not found';
  end if;

  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'whatsapp_token' limit 1;
  if v_token is null or v_token = '' then
    raise exception 'WhatsApp token is missing — add it to Vault as whatsapp_token';
  end if;

  -- Verified number first, enquiry mobile as fallback; Indian numbers → 91XXXXXXXXXX
  v_digits := right(regexp_replace(coalesce(nullif(c.verified_number, ''), c.mobile, ''), '\D', '', 'g'), 10);
  if length(v_digits) <> 10 then
    raise exception 'Customer has no valid WhatsApp number';
  end if;
  v_to := '91' || v_digits;

  -- Body parameters for the current (test) template "order 1901":
  --   Hello Sir/Ma'am, {{1}} {{2}} {{3}} Check below for further details {{4}} Thank you
  -- WhatsApp rejects empty parameters and newlines, so each one is filled and flattened.
  v_params := array[
    'Welcome to WhatsBiz, ' || c.name || '!',
    'Your ' || coalesce(nullif(c.plan, ''), 'WhatsBiz') || ' plan is now active.',
    'Start date: ' || coalesce(to_char(c.plan_start::date, 'DD Mon YYYY'), '-'),
    'Customer ID: WB-' || lpad(c.customer_no::text, 4, '0')
  ];

  v_body := jsonb_build_object(
    'messaging_product', 'whatsapp',
    'to', v_to,
    'type', 'template',
    'template', jsonb_build_object(
      'name', s.template_name,
      'language', jsonb_build_object('code', s.template_lang),
      'components', jsonb_build_array(
        jsonb_build_object(
          'type', 'body',
          'parameters', (
            select jsonb_agg(jsonb_build_object('type', 'text', 'text', regexp_replace(p, '\s+', ' ', 'g')) order by ord)
            from unnest(v_params) with ordinality as t(p, ord)
          )
        )
      )
    )
  );

  v_req := net.http_post(
    url := rtrim(s.api_base, '/') || '/' || s.api_version || '/' || s.phone_number_id || '/messages',
    body := v_body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_token),
    timeout_milliseconds := 15000
  );

  insert into public.whatsapp_messages (customer_id, request_id, to_number, template_name)
  values (c.id, v_req, v_to, s.template_name)
  returning id into v_log_id;

  return v_log_id;
end;
$$;

-- ------------------------------------------------------------
-- Pull pg_net results into the log and return the customer's messages (newest first).
-- pg_net keeps responses for ~6 hours, so results are copied into whatsapp_messages.
-- ------------------------------------------------------------
create or replace function public.whatsapp_messages_for(p_customer_id uuid)
returns setof public.whatsapp_messages
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.whatsapp_messages m
  set http_status = r.status_code,
      response    = left(coalesce(nullif(r.error_msg, ''), r.content), 2000),
      status      = case when r.status_code between 200 and 299 then 'sent' else 'failed' end,
      updated_at  = now()
  from net._http_response r
  where m.customer_id = p_customer_id
    and m.status = 'queued'
    and m.request_id = r.id;

  update public.whatsapp_messages
  set status = 'failed', response = 'No response recorded', updated_at = now()
  where customer_id = p_customer_id and status = 'queued' and created_at < now() - interval '6 hours';

  return query
    select * from public.whatsapp_messages where customer_id = p_customer_id order by created_at desc;
end;
$$;

-- ------------------------------------------------------------
-- Trigger: send when a NEW customer is converted (status → onboarded).
-- A failed send is logged but never blocks the conversion.
-- ------------------------------------------------------------
create or replace function public.customers_send_welcome()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  begin
    perform public.send_welcome_whatsapp(new.id);
  exception when others then
    insert into public.whatsapp_messages (customer_id, status, response)
    values (new.id, 'failed', sqlerrm);
  end;
  return new;
end;
$$;

drop trigger if exists customers_send_welcome on public.customers;
create trigger customers_send_welcome
  after update of status on public.customers
  for each row
  when (new.status = 'onboarded' and old.status is distinct from 'onboarded' and new.customer_type = 'new')
  execute function public.customers_send_welcome();

-- Only signed-in dashboard users may call these
revoke all on function public.send_welcome_whatsapp(uuid) from public, anon;
revoke all on function public.whatsapp_messages_for(uuid) from public, anon;
revoke all on function public.customers_send_welcome() from public, anon, authenticated;
grant execute on function public.send_welcome_whatsapp(uuid) to authenticated;
grant execute on function public.whatsapp_messages_for(uuid) to authenticated;
