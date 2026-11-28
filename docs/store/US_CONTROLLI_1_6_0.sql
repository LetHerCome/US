-- US 1.6.0: controlli in sola lettura sulla produzione prima delle migrazioni (28/11/2026).
-- Lanciare da fuori dal repo: supabase db query --linked --project-ref iiakdfsxpywdkxravqjh -f <questo file> --output-format json
-- Il controllo delle 141 domande di 20261128122730_domande_a_scelta lo rifà la migrazione stessa: si ferma prima di cambiare qualcosa.
select 'md5 ' || v.sig as controllo,
  coalesce((select pg_catalog.md5(pg_catalog.replace(p.prosrc, E'\r', '')) from pg_catalog.pg_proc p
            where p.oid = pg_catalog.to_regprocedure(v.sig)), 'manca') as valore,
  v.atteso
from (values
  ('private.game_v2_candidates(uuid,text,timestamp with time zone)', '585d2aa6cb2dc80de4d613f3c1e1a406'),
  ('public.start_swipe_round(uuid)', 'e408d3e89dc882f78fa684950c965fa7'),
  ('public.play_us_answer(uuid,boolean)', 'manca prima di play_us_v1')
) v(sig, atteso)
union all
select 'policy realtime.messages ' || policyname, cmd || ' ' || array_to_string(roles, ',') || ' ' || coalesce(qual, '') || coalesce(' WITH ' || with_check, ''), 'solo le nostre due, dopo play_us_v1'
from pg_catalog.pg_policies where schemaname = 'realtime' and tablename = 'messages'
union all
select 'rls realtime.messages', coalesce((select relrowsecurity::text from pg_catalog.pg_class where oid = pg_catalog.to_regclass('realtime.messages')), 'manca'), 'true'
union all
select 'vault ' || name,
  case when name = 'us_project_url' then
    case when rtrim(decrypted_secret, '/') = 'https://iiakdfsxpywdkxravqjh.supabase.co' then 'https://iiakdfsxpywdkxravqjh.supabase.co'
         else 'DIVERSO dal progetto di produzione' end
  else 'presente (valore non letto)' end,
  'us_project_url = https://iiakdfsxpywdkxravqjh.supabase.co'
from vault.decrypted_secrets
where name in ('us_project_url', 'us_invite_reminder_cron_key', 'us_ricorda_push_cron_key')
union all
select 'cron ' || jobname, schedule || ' ' || active::text, 'elenco attuale'
from cron.job
union all
select 'funzione private.current_couple_id', case when pg_catalog.to_regprocedure('private.current_couple_id()') is null then 'manca' else 'c''è' end, 'c''è'
union all
select 'funzione private.couple_has_plus', case when pg_catalog.to_regprocedure('private.couple_has_plus(uuid,timestamp with time zone)') is null then 'manca' else 'c''è' end, 'c''è'
union all
select 'profili per colore ' || coalesce(person_color, '(nessuno)'), count(*)::text, 'oro/cielo/rubino cambiano'
from public.profiles group by person_color;
