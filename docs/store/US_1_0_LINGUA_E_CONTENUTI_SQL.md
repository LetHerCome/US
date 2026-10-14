# US 1.0 · Lingua e contenuti (SQL `20261014230000_us_1_0_locale_content_en.sql`)

Cosa fa: ogni persona ha una sua lingua (italiano o inglese) e legge Domanda del giorno, giochi, Swipe e Missioni nella propria lingua, anche dentro la stessa coppia; chi non ha scelto continua a vedere l'italiano di oggi. Le domande di «E se…?» entrano in «Confrontatevi»: niente viene cancellato e le partite vecchie restano leggibili.
Quando: SOLO dopo `20261014220000_content_1_0.sql`, nel SQL Editor di Supabase: prima su staging, poi (se tutto torna) su produzione. Se si ferma con un errore, non ha cambiato nulla.
Controllo (deve dare `0 | 0 | true`):
```sql
select (select count(*) from public.daily_question_templates where active and question_en is null) as daily_senza_inglese,
       (select count(*) from public.game_v2_recipes where active and (question_text_en is null or kind_label_en is null)) as ricette_senza_inglese,
       to_regprocedure('public.set_my_locale(text)') is not null as lingua_pronta;
```
