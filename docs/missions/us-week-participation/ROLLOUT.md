# Missione 2 — Rollout separato e autorizzato

La PR prepara frontend e SQL. Non applica migrazioni a Supabase produzione e non autorizza merge/deploy.

## Preflight di sola lettura

1. Confermare progetto, backup e ledger delle migrazioni applicate. Confrontare baseline e forward migrations, in particolare authority MC2, Game V2, Daily e Sintonia. Non eseguire un `db push` indiscriminato: il repository contiene altre migrazioni, incluse ricompense, fuori da questa missione.
2. Verificare RLS attiva su `daily_answers`, `daily_questions`, `game_sessions`, `game_session_sides`, `progression_events`; assenza di scritture client Game e TRUNCATE sui parent della membership; `profiles` e membership devono essere già protetti dall'authority MC2.
3. Confermare che la nuova colonna e le funzioni non esistano parzialmente. Snapshot aggregati di numero righe Daily, ledger, XP/livelli e definizioni delle authority XP/Game. Non esportare risposte o altri contenuti privati.
4. Confermare versione schema/Game con slot `actor_role` e completamenti server, indici esistenti e volume per la durata della creazione degli indici. La migrazione è transazionale: su substrate inatteso interrompersi e riconciliare il drift, senza aggirare i controlli.

Esempio di controllo ACL senza leggere dati personali:

```sql
select c.relname, c.relrowsecurity,
       has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE') as any_client_write,
       has_any_column_privilege('authenticated',c.oid,'INSERT,UPDATE') as any_client_column_write
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
 ('daily_answers','daily_questions','game_sessions','game_session_sides','progression_events');
select has_table_privilege('authenticated','public.couples','TRUNCATE') as couple_truncate,
       has_table_privilege('authenticated','public.profiles','TRUNCATE') as profile_truncate;
```

## Staging e approvazione

Ricostruire prima localmente con la baseline/migrazioni repository. Applicare **solo la candidata revisionata**, `supabase/migrations/20261009185803_us_v6_week_participation.sql`, tramite workflow CLI delle migrazioni su un progetto staging autorizzato con schema equivalente. Registrare coerentemente la versione nel ledger, senza dichiarare applicate migrazioni che non lo sono.

Confermare grant della sola RPC ad authenticated, rifiuto anon/no profilo/coppia diversa, helper privato non esposto, UPDATE/upsert che preserva ricevuta e NULL legacy, DELETE/TRUNCATE negati. Ripetere due-account completion reale, retry, budget tre e confronto XP/ledger prima/dopo la sola lettura; controllare advisor Supabase e piano/tempi della nuova lettura su volumi staging rappresentativi. I test locali non sostituiscono questa verifica dell'ambiente remoto.

Esaminare CI della PR, checklist Android fisico in `QA.md`, durata della migrazione e tutte le differenze schema. Richiedere autorizzazione esplicita per l'applicazione SQL in produzione, distinta da merge e deploy frontend.

## Sequenza produzione dopo autorizzazione

1. Applicare la migrazione candidata verificata e controllare il commit completo/schema cache PostgREST. Non fare backfill: ogni Daily già presente conserva NULL.
2. Smoke di sola lettura e controlli ACL; confronto conteggi storici, XP e livelli con snapshot preflight. I client precedenti continuano a usare lo stesso upsert Daily. Manutenzioni che scrivevano Daily come owner senza JWT richiedono un percorso amministrativo esplicito: il nuovo trigger richiede identità autenticata.
3. Solo con approvazione separata, integrare/rilasciare il frontend con marker coerenti. Senza RPC il nuovo client mostra “Settimana non disponibile”, senza spunte o XP inventati.
4. Monitorare errori RPC/trigger e latenza, aggiornamenti dopo entrambe le side e ritorno rete, rollover Rome, conteggio e ledger. Nessun job/budget/bonus aggiuntivo.

## Recupero

Se il DDL fallisce, la transazione non lascia cambiamenti parziali. Se la UI ha problemi dopo il rollout, ripristinare il frontend con un nuovo BUILD_ID coerente e verificare upgrade/offline. Conservare colonna/ricevute/trigger, ledger e dati storici; non rimuovere la protezione o ricostruire timestamp dal client. Preparare una successiva migrazione correttiva revisionata se necessario.

Riferimenti ufficiali consultati il 9 ottobre 2026: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Database Functions](https://supabase.com/docs/guides/database/functions), [Supabase changelog](https://supabase.com/changelog). Nessuna di queste istruzioni costituisce autorizzazione a operare in produzione.
