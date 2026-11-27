-- Come stai che conta (grill del founder del 27/11/2026, D9/D17): US says once
-- «Bea è giù da 3 ore. Un pensiero?» when the partner is giù, non sta bene or
-- nervoso for two hours. The line is decided in the app, live, like
-- 'ti_aspetta' (us-ricorda.js), and «Non dirmelo più» switches it off like
-- the other kinds: the check of us_battute_mute must accept 'come_sta'.
-- Only the check changes, with ALL the kinds it already accepted
-- (20261127120000_us_battute_mute_bacheca.sql) plus the new one.
-- Re-applying this migration changes nothing.

alter table public.us_battute_mute drop constraint if exists us_battute_mute_kind;
alter table public.us_battute_mute add constraint us_battute_mute_kind
  check (kind in ('*', 'compleanno', 'anniversario', 'mesiversario', 'giorni', 'un_anno_fa', 'traguardo', 'conoscervi', 'ti_aspetta', 'primi_passi', 'bacheca', 'come_sta'));
