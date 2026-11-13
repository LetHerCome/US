-- US — Errori dell'app degli ultimi 7 giorni (09/11/2026)
--
-- Solo lettura. Serve la migrazione client_errors_v1. Nessun account: solo
-- quante persone hanno visto ogni errore.
-- Come si usa: come US_NUMERI_DELLA_SETTIMANA.sql, da una cartella fuori dal repo:
--   supabase db query --linked --project-ref <ref> -f <percorso>/US_ERRORI_APP.sql

select e.message as errore,
       coalesce(e.source, '') || case when e.line is not null then ':' || e.line else '' end as dove,
       string_agg(distinct e.platform, ', ') as piattaforme,
       string_agg(distinct e.build, ', ') as build,
       sum(e.repeats)::int as volte,
       count(distinct e.user_id)::int as persone,
       max(e.created_at) as ultima
  from private.client_errors as e
 where e.created_at >= now() - interval '7 days'
 group by e.message, e.source, e.line
 order by persone desc, volte desc
 limit 25;
