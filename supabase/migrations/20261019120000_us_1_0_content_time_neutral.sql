-- US 1.0 — questions that assumed how long the couple has been together.
--
-- Founder (19/10/2026): a couple together for six months got "In cosa pensi
-- che la nostra coppia sia cresciuta di più nell’ultimo anno?". The Daily
-- Question is one row per day for every couple, so it cannot be picked per
-- couple: the texts that assumed a year together now speak of "since we
-- got together", which is true for six months and for six years.
--
-- * Daily Question bank: profonda-03 and ricordi-26, Italian and English;
--   gioco-21 no longer assumes a home shared by both ("in casa nostra").
--   Days already materialized in the future (pre-materialization) take the
--   new Italian too; days already shown keep the text people answered.
-- * Game V2 catalog: scopritevi-003, Italian and English, same id with
--   version + 1 (as the content 1.0 fixes).
-- * Only these rows; nothing is deleted. Re-applying this migration changes
--   nothing (every update runs only when the text differs).
-- The drafts in supabase/game-v2/content-1-0 stay as approved on 14/10: they
-- generate the content 1.0 migration, which is already applied.

update public.daily_question_templates as t
set question = v.question, question_en = v.question_en
from (values
  ('profonda-03', 'In cosa pensi che la nostra coppia sia cresciuta di più da quando stiamo insieme?',
                  'Where do you think we’ve grown most as a couple since we got together?'),
  ('ricordi-26',  'Se potessi conservare un solo giorno passato insieme, quale sceglieresti?',
                  'If you could keep just one day we’ve spent together, which would you choose?'),
  ('gioco-21',    'Quale regola assurda ci faresti seguire per un giorno intero?',
                  'What ridiculous rule would you make us follow for a whole day?')
) as v(id, question, question_en)
where t.id = v.id
  and (t.question, t.question_en) is distinct from (v.question, v.question_en);

update public.daily_questions as q
set question = t.question
from public.daily_question_templates as t
where q.template_id = t.id
  and t.id in ('profonda-03', 'ricordi-26', 'gioco-21')
  and q.question_date > (now() at time zone 'Europe/Rome')::date
  and q.question is distinct from t.question;

update public.game_v2_catalog as c
set question_text = v.question_text, question_text_en = v.question_text_en, version = c.version + 1
from (values
  ('scopritevi-003',
   'C’è qualcosa su cui hai cambiato idea da quando ci conosciamo, e che forse io continuo ad attribuire alla vecchia versione di te?',
   'Is there something you’ve changed your mind about since we met, where I might still be going by the old version of you?')
) as v(id, question_text, question_text_en)
where c.id = v.id
  and (c.question_text, c.question_text_en) is distinct from (v.question_text, v.question_text_en);
