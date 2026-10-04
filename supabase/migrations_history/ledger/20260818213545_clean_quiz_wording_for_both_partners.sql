-- Production ledger 20260818213545 clean_quiz_wording_for_both_partners: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 d7ff509e3b602c5c63a1c50535b4704d; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

update public.quiz_questions q
set options = case q.position
  when 2 then '["Francesco","Beatrice","Entrambi","Non si capisce"]'::jsonb
  when 5 then '["Francesco","Beatrice","Dipende","Nessuno"]'::jsonb
  else q.options
end
from public.quiz_sets s
where q.set_id=s.id and s.slug='noi' and q.position in (2,5);

update public.quiz_questions q
set options = case q.position
  when 3 then '["Stare per conto tuo","Parlarne subito","Distrarti","Dormire"]'::jsonb
  else q.options
end
from public.quiz_sets s
where q.set_id=s.id and s.slug='preferenze' and q.position=3;

update public.quiz_questions q
set options = case q.position
  when 1 then '["Telefono","Bagno","Colazione","Restare a letto"]'::jsonb
  when 2 then '["Ti chiudi un po’","Ti innervosisci","Fai drama","Non cambia nulla"]'::jsonb
  when 5 then '["Guardi in silenzio","Commenti tutto","Stai al telefono","Ti addormenti"]'::jsonb
  when 8 then '["Corri","Fai finta di niente","Avvisi subito","Dai la colpa al traffico"]'::jsonb
  when 10 then '["Scegli subito","Dici “boh”","Fai 20 proposte","Lasci scegliere l’altro"]'::jsonb
  else q.options
end
from public.quiz_sets s
where q.set_id=s.id and s.slug='quotidiano' and q.position in (1,2,5,8,10);;
