-- US-STAGING ONLY (dugmhngrfkuieeletatb). NEVER run on production.
-- Founder, 29/10/2026: «su staging sblocca tutte le robe plus».
-- Gives US Plus (source 'manuale') to every account on staging, so every
-- Plus feature can be tried there. Safe to run again: accounts that already
-- have it are left as they are, new accounts get it.
-- Where: Supabase › project US-STAGING › SQL Editor.

insert into public.plus_entitlements (user_id, source, product, status)
select id, 'manuale', 'us_plus_staging', 'active'
from auth.users
on conflict (user_id, source) do nothing;

-- Check: how many accounts have Plus on staging.
select count(*) as accounts_with_plus from public.plus_entitlements where status = 'active';
