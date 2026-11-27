-- US vi ricorda: «Non dirmelo più» also for the bubble of the Bacheca
-- (controllo del 27/11/2026). The app reads mutedKinds for 'bacheca' and the
-- long press now asks for it, but the table's check refused the kind, so the
-- choice was lost at the next launch. Only the check changes: the same kinds
-- as 20261125200000_us_vi_ricorda_v1.sql plus 'primi_passi' (20261127093508_prima_settimana.sql) and 'bacheca'.
-- STAGING ONLY until the founder decides otherwise: never apply to production
-- without an explicit, separate yes.

alter table public.us_battute_mute drop constraint if exists us_battute_mute_kind;
alter table public.us_battute_mute add constraint us_battute_mute_kind
  check (kind in ('*', 'compleanno', 'anniversario', 'mesiversario', 'giorni', 'un_anno_fa', 'traguardo', 'conoscervi', 'ti_aspetta', 'primi_passi', 'bacheca'));
