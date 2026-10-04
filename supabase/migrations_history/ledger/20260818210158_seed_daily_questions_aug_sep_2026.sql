-- Production ledger 20260818210158 seed_daily_questions_aug_sep_2026: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 4e0dac5edb4a7429f6e6512ba2f6db4d; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

insert into public.daily_questions(question_date,question,category) values
('2026-08-19','Qual è una cosa che vorresti che capissi meglio di te?','profondo'),
('2026-08-20','Quale piccolo gesto ti fa sentire più amato/a?','affetto'),
('2026-08-21','Qual è un ricordo di noi che ti torna in mente senza motivo?','ricordi'),
('2026-08-22','Se avessimo una giornata completamente libera, come la passeresti?','quotidiano'),
('2026-08-23','Quale cosa nuova vorresti provare insieme entro un anno?','futuro'),
('2026-08-24','Quando sei giù, cosa vorresti che facessi più spesso?','cura'),
('2026-08-25','Qual è una mia abitudine che ormai ti fa sorridere?','noi'),
('2026-08-26','Cosa pensi che facciamo meglio come coppia?','noi'),
('2026-08-27','Quale posto vorresti diventasse “un nostro posto”?','futuro'),
('2026-08-28','Qual è una cosa semplice che vorresti fare più spesso insieme?','quotidiano'),
('2026-08-29','Quale momento della nostra storia racconteresti per primo a qualcuno?','ricordi'),
('2026-08-30','Cosa ti fa sentire più al sicuro con me?','profondo'),
('2026-08-31','Se potessimo rivivere una sola serata, quale sceglieresti?','ricordi'),
('2026-09-01','Quale sogno personale vorresti che sostenessi di più?','futuro'),
('2026-09-02','Qual è una cosa che hai imparato su di te stando con me?','profondo'),
('2026-09-03','Che tipo di viaggio ci rappresenta di più?','viaggi'),
('2026-09-04','Qual è una cosa che non vorresti mai diventasse routine tra noi?','noi'),
('2026-09-05','Cosa ti piacerebbe festeggiare insieme tra un anno?','futuro'),
('2026-09-06','Quando pensi a “casa”, che immagine di noi ti viene in mente?','futuro'),
('2026-09-07','Quale complimento da parte mia ti resta più addosso?','affetto'),
('2026-09-08','Quale nostra differenza pensi ci faccia bene?','profondo'),
('2026-09-09','Qual è una cosa che vorresti imparassimo a fare meglio insieme?','noi'),
('2026-09-10','Se dovessi scegliere una canzone per questo periodo di noi, che atmosfera avrebbe?','ricordi'),
('2026-09-11','Cosa vorresti che facessimo quando uno dei due ha bisogno di spazio?','cura'),
('2026-09-12','Qual è una piccola tradizione che vorresti creare solo nostra?','noi'),
('2026-09-13','Quale avventura ti farebbe dire “questa dobbiamo farla”?','futuro'),
('2026-09-14','Quale parte del mio carattere apprezzi più oggi rispetto all’inizio?','profondo'),
('2026-09-15','Se potessimo spegnere i telefoni per 24 ore, cosa faremmo?','quotidiano'),
('2026-09-16','Qual è una cosa che vorresti sentirti dire più spesso da me?','affetto'),
('2026-09-17','Che cosa speri rimanga identico tra noi anche tra molti anni?','futuro')
on conflict (question_date) do update set question=excluded.question,category=excluded.category;;
