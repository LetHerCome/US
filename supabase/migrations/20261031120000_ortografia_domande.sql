-- Spelling pass on every active question (founder, 31/10/2026).
--
-- All 1558 Italian texts were read: daily bank, Game V2 catalog (questions,
-- predictions, options), recipes, Swipe V1 and quests. Only these rows were
-- wrong or inconsistent:
--
-- * Daily Question bank: «di buon umore» becomes «di buonumore», as in
--   scoprirsi-02 («ti mette di buonumore»); vicinanza-41 quotes with “ ” like the
--   rest of the bank. Days already materialized in the future take the new
--   text; days already shown keep the text people answered.
-- * Game V2 catalog: quanto_mi_conosci-070 (a friendship cannot confide a
--   secret), quanto_mi_conosci-040 prediction (the question had no one
--   asking), scopritevi-057 option 4 (grammar). Same id, version + 1.
-- * Recipe calendar_upcoming-002: an event still to come takes the
--   conditional, not the past. Version + 1.
-- * Swipe V1 swipe-010: «prendercela con calma». Version + 1.
-- * English stays as it is. Only these rows; nothing is deleted. Re-applying
--   this migration changes nothing (every update runs only when the text
--   differs).

update public.daily_question_templates as t
set question = v.question
from (values
  ('scoprirsi-37', 'Cosa ti mette di buonumore appena apri gli occhi?'),
  ('vicinanza-36', 'Quale mia piccola abitudine ti mette di buonumore?'),
  ('vicinanza-41', 'Quale piccola attenzione ti dice “mi hai pensato”?')
) as v(id, question)
where t.id = v.id
  and t.question is distinct from v.question;

update public.daily_questions as q
set question = t.question
from public.daily_question_templates as t
where q.template_id = t.id
  and t.id in ('scoprirsi-37', 'vicinanza-36', 'vicinanza-41')
  and q.question_date > (now() at time zone 'Europe/Rome')::date
  and q.question is distinct from t.question;

update public.game_v2_catalog as c
set question_text = coalesce(v.question_text, c.question_text),
    predict_text = coalesce(v.predict_text, c.predict_text),
    options = coalesce(v.options, c.options),
    version = c.version + 1
from (values
  ('quanto_mi_conosci-070', 'Qualcuno ti confida un segreto. Quanto resiste?', null, null::jsonb),
  ('quanto_mi_conosci-040', null, 'Vedi {subject} con lo sguardo perso nel vuoto e chiedi «a cosa pensi?». Qual è la risposta vera?', null::jsonb),
  ('scopritevi-057', null, null, '["Esserci nei momenti difficili","Ridere delle stesse cose","Potersi dire tutto","Rivedersi come se fosse ieri"]'::jsonb)
) as v(id, question_text, predict_text, options)
where c.id = v.id
  and (c.question_text, c.predict_text, c.options)
      is distinct from (coalesce(v.question_text, c.question_text), coalesce(v.predict_text, c.predict_text), coalesce(v.options, c.options));

update public.game_v2_recipes as r
set question_text = v.question_text, version = r.version + 1
from (values
  ('calendar_upcoming-002', 'Se «{title}» andasse ancora meglio del previsto, cosa succederebbe?')
) as v(id, question_text)
where r.id = v.id
  and r.question_text is distinct from v.question_text;

update private.game_swipe_v1_catalog as c
set question_text = v.question_text, version = c.version + 1
from (values
  ('swipe-010', 'In viaggio preferisci vedere tantissime cose o prendercela con calma?')
) as v(id, question_text)
where c.id = v.id
  and c.question_text is distinct from v.question_text;
