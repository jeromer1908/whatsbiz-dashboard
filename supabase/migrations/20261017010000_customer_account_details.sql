-- Account details captured when an enquiry is converted to a customer.
-- Run once in the Supabase SQL editor.

alter table public.customers add column if not exists login_username  text;
alter table public.customers add column if not exists login_password  text;
alter table public.customers add column if not exists verified_number text;
