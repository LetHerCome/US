-- Production ledger 20260818205935 real_quiz_sync_and_private_results: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 31c1d418ba03adc44058092b30dff043; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

-- Seed the four real quiz sets and add guarded quiz RPCs.

insert into public.quiz_questions(set_id, position, question, options)
select s.id, v.position, v.question, v.options
from public.quiz_sets s
cross join (values
      (1, 'Qual è la sua serata perfetta?', '["Film sul divano", "Uscire a cena", "Serata con amici", "Gaming insieme"]'::jsonb),
      (2, 'Che tipo di regalo apprezza di più?', '["Esperienza insieme", "Qualcosa di utile", "Qualcosa di romantico", "Una sorpresa assurda"]'::jsonb),
      (3, 'Quando è stressata, cosa preferisce?', '["Stare da sola", "Parlarne subito", "Distrarsi", "Dormire"]'::jsonb),
      (4, 'Quale vacanza sceglierebbe?', '["Mare", "Montagna", "Grande città", "Road trip"]'::jsonb),
      (5, 'Che cosa sceglierebbe più facilmente?', '["Dolce", "Salato", "Entrambi", "Dipende dal giorno"]'::jsonb),
      (6, 'Qual è il suo modo preferito di ricevere affetto?', '["Parole", "Tempo insieme", "Contatto", "Piccoli gesti"]'::jsonb),
      (7, 'Una domenica libera ideale?', '["Casa e relax", "Gita", "Shopping", "Pranzo fuori"]'::jsonb),
      (8, 'Cosa la fa ridere di più?', '["Meme", "Battute stupide", "Inside joke", "Figuracce"]'::jsonb),
      (9, 'Se potesse scegliere ora?', '["Viaggio", "Concerto", "Spa", "Weekend in casa"]'::jsonb),
      (10, 'Quale sorpresa gradirebbe di più?', '["Cena preparata", "Lettera", "Biglietti viaggio", "Foto/ricordo"]'::jsonb)
) as v(position, question, options)
where s.slug = 'preferenze'
on conflict (set_id, position) do update set question = excluded.question, options = excluded.options;

insert into public.quiz_questions(set_id, position, question, options)
select s.id, v.position, v.question, v.options
from public.quiz_sets s
cross join (values
      (1, 'Dove ci siamo conosciuti davvero?', '["Online", "Amici", "Lavoro", "Caso"]'::jsonb),
      (2, 'Chi ha fatto il primo passo?', '["Io", "Lei", "Entrambi", "Non si capisce"]'::jsonb),
      (3, 'La nostra cosa più tipica?', '["Mangiare", "Film/serie", "Viaggiare", "Fare casino"]'::jsonb),
      (4, 'Cosa discutiamo più facilmente?', '["Orari", "Messaggi", "Programmi", "Ordine"]'::jsonb),
      (5, 'Chi cede prima dopo una discussione?', '["Io", "Lei", "Dipende", "Nessuno"]'::jsonb),
      (6, 'Il nostro tipo di appuntamento migliore?', '["Cena", "Passeggiata", "Casa", "Gita"]'::jsonb),
      (7, 'Quale gesto ci rappresenta?', '["Abbraccio", "Bacio", "Tenersi la mano", "Prendersi in giro"]'::jsonb),
      (8, 'Quando siamo insieme il tempo...', '["Vola", "Rallenta", "Scompare", "Dipende"]'::jsonb),
      (9, 'La nostra vacanza ideale è...', '["Organizzata", "Improvvisata", "Metà e metà", "Basta partire"]'::jsonb),
      (10, 'Cosa ci fa tornare sempre a posto?', '["Parlarne", "Tempo", "Abbraccio", "Una battuta"]'::jsonb)
) as v(position, question, options)
where s.slug = 'noi'
on conflict (set_id, position) do update set question = excluded.question, options = excluded.options;

insert into public.quiz_questions(set_id, position, question, options)
select s.id, v.position, v.question, v.options
from public.quiz_sets s
cross join (values
      (1, 'Qual è la prima cosa che fa appena sveglia?', '["Telefono", "Bagno", "Colazione", "Resta a letto"]'::jsonb),
      (2, 'Quando ha fame diventa...', '["Silenziosa", "Nervosa", "Drammatica", "Normalissima"]'::jsonb),
      (3, 'Come preferisce organizzare una giornata?', '["Tutto deciso", "Solo due cose", "Improvvisare", "Decidi tu"]'::jsonb),
      (4, 'Messaggi: cosa preferisce?', '["Tanti brevi", "Pochi lunghi", "Vocali", "Chiamata"]'::jsonb),
      (5, 'Quando guarda una serie...', '["Non parla", "Commenta tutto", "Sta al telefono", "Si addormenta"]'::jsonb),
      (6, 'Che cosa dimentica più facilmente?', '["Chiavi", "Caricatore", "Orari", "Niente"]'::jsonb),
      (7, 'La sua comfort food?', '["Pizza", "Pasta", "Sushi", "Dolci"]'::jsonb),
      (8, 'Quando è in ritardo...', '["Corre", "Fa finta di niente", "Avvisa subito", "Dà la colpa al traffico"]'::jsonb),
      (9, 'In casa preferisce...', '["Silenzio", "Musica", "TV accesa", "Podcast"]'::jsonb),
      (10, 'Per decidere dove mangiare...', '["Sceglie subito", "Dice ''boh''", "Fa 20 proposte", "Lascia scegliere me"]'::jsonb)
) as v(position, question, options)
where s.slug = 'quotidiano'
on conflict (set_id, position) do update set question = excluded.question, options = excluded.options;

insert into public.quiz_questions(set_id, position, question, options)
select s.id, v.position, v.question, v.options
from public.quiz_sets s
cross join (values
      (1, 'Quale viaggio vorrebbe fare prima?', '["Giappone", "Nord Europa", "USA", "Tropicale"]'::jsonb),
      (2, 'Che casa immagina?', '["Centro città", "Fuori città", "Vicino al mare", "Non importa"]'::jsonb),
      (3, 'Quale esperienza vorrebbe fare insieme?', '["Road trip", "Concerto", "Corso insieme", "Avventura estrema"]'::jsonb),
      (4, 'Quanto pianificare il futuro?', '["Molto", "Il giusto", "Poco", "Zero"]'::jsonb),
      (5, 'Cosa conta di più nei prossimi anni?', '["Stabilità", "Viaggiare", "Carriera", "Tempo insieme"]'::jsonb),
      (6, 'Un sogno condiviso sarebbe...', '["Casa nostra", "Grande viaggio", "Progetto insieme", "Vita tranquilla"]'::jsonb),
      (7, 'Dove passare un mese?', '["Tokyo", "New York", "Isola", "Borgo tranquillo"]'::jsonb),
      (8, 'Cosa vorrebbe imparare insieme?', '["Lingua", "Cucina", "Sport", "Qualcosa di creativo"]'::jsonb),
      (9, 'Weekend improvviso: dove?', '["Città d''arte", "Spa", "Mare", "Montagna"]'::jsonb),
      (10, 'Tra 10 anni ci vede...', '["Sempre in giro", "Con mille progetti", "Più tranquilli", "Tutte le precedenti"]'::jsonb)
) as v(position, question, options)
where s.slug = 'futuro'
on conflict (set_id, position) do update set question = excluded.question, options = excluded.options;

create or replace function public.save_quiz_answer(target_question_id uuid, target_answer_index smallint)
returns jsonb language plpgsql security definer set search_path = 'public' as $$
declare uid uuid := auth.uid(); cid uuid; sid uuid; option_count integer;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select couple_id into cid from public.profiles where id = uid;
  if cid is null then raise exception 'Profile not linked'; end if;
  select set_id, jsonb_array_length(options) into sid, option_count from public.quiz_questions where id = target_question_id;
  if sid is null then raise exception 'Quiz question not found'; end if;
  if target_answer_index < 0 or target_answer_index >= option_count then raise exception 'Invalid answer index'; end if;
  insert into public.quiz_responses(set_id, question_id, user_id, couple_id, answer_index, updated_at)
  values (sid, target_question_id, uid, cid, target_answer_index, now())
  on conflict (question_id, user_id) do update set answer_index=excluded.answer_index,set_id=excluded.set_id,couple_id=excluded.couple_id,updated_at=now();
  return jsonb_build_object('saved',true,'set_id',sid,'question_id',target_question_id);
end; $$;

create or replace function public.get_quiz_state(target_set_id uuid)
returns jsonb language plpgsql security definer set search_path = 'public' as $$
declare uid uuid := auth.uid(); cid uuid; total_count integer := 0; my_count integer := 0; partner_count integer := 0; score integer := null; my_answers jsonb := '{}'::jsonb; partner_answers jsonb := null;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select couple_id into cid from public.profiles where id = uid;
  if cid is null then raise exception 'Profile not linked'; end if;
  select count(*) into total_count from public.quiz_questions where set_id = target_set_id;
  if total_count = 0 then raise exception 'Quiz set not found or empty'; end if;
  select count(*),coalesce(jsonb_object_agg(question_id::text,answer_index),'{}'::jsonb) into my_count,my_answers from public.quiz_responses where set_id=target_set_id and couple_id=cid and user_id=uid;
  select count(*) into partner_count from public.quiz_responses where set_id=target_set_id and couple_id=cid and user_id<>uid;
  if my_count >= total_count and partner_count >= total_count then
    select coalesce(jsonb_object_agg(question_id::text,answer_index),'{}'::jsonb) into partner_answers from public.quiz_responses where set_id=target_set_id and couple_id=cid and user_id<>uid;
    select count(*) into score from public.quiz_responses mine join public.quiz_responses partner on partner.question_id=mine.question_id and partner.set_id=mine.set_id and partner.couple_id=mine.couple_id and partner.user_id<>mine.user_id where mine.set_id=target_set_id and mine.couple_id=cid and mine.user_id=uid and mine.answer_index=partner.answer_index;
  end if;
  return jsonb_build_object('total',total_count,'my_count',my_count,'partner_count',partner_count,'my_complete',my_count>=total_count,'partner_complete',partner_count>=total_count,'both_complete',my_count>=total_count and partner_count>=total_count,'my_answers',my_answers,'partner_answers',partner_answers,'score',score);
end; $$;

drop policy if exists quiz_responses_insert_own on public.quiz_responses;
drop policy if exists quiz_responses_update_own on public.quiz_responses;
revoke all on function public.save_quiz_answer(uuid, smallint) from public;
revoke all on function public.get_quiz_state(uuid) from public;
revoke execute on function public.save_quiz_answer(uuid, smallint) from anon;
revoke execute on function public.get_quiz_state(uuid) from anon;
grant execute on function public.save_quiz_answer(uuid, smallint) to authenticated;
grant execute on function public.get_quiz_state(uuid) to authenticated;;
