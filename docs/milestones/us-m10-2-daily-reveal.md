# US M10.2 — Daily reveal: avviso, dismiss, reazioni

Stato: branch di candidato, **nessuna migration applicata, nessun deploy**. Base: `main` 95d802d.

## Ciclo della Domanda del giorno

1. La card Daily su Oggi esiste solo finché `get_daily_state().my_answer == null` (invariato da M10.1).
2. Il secondo a rispondere fa partire la push esistente di `send-web-push` (`daily_answer`): "Le vostre risposte sono pronte ♡" a entrambi, target `today`, dedupe `daily-reveal:<couple>:<question>`. **Non modificata**, coperta da `tests/m10-daily-answer-push-regression.test.js` e `tests/m10-2-push-regression.test.js`.
3. Su Oggi compare un piccolo avviso personale "Risposte pronte" (categoria priority `answers_ready`, orbit M10 acceso).
4. Tocco → foglio Today esistente → risposte da `get_daily_state` → `mark_daily_reveal_seen`. Swipe orizzontale o bottone × ("Nascondi avviso Risposte pronte") → `dismiss_daily_reveal_notice`.
5. Dopo aperto o nascosto compare il link passivo "Rivedi le risposte di oggi" (nessun orbit, nessuna animazione).
6. Nel reveal si reagisce alla risposta del PARTNER con ❤️ 😡 😭; la reazione del partner alla mia risposta è passiva ("Bea ha reagito ❤️").

## Regola di visibilità dell'avviso

`both_answered == true` **e** `my_reveal_seen_at == null` **e** `my_notice_dismissed_at == null` (tutto personale, da `get_daily_reveal_meta`, riferito alla domanda di oggi Europe/Rome). Senza meta caricata non si mostra né avviso né link.

## Backend (solo sorgente)

`supabase/migrations/20260930093000_m10_2_daily_reveal_states.sql`

- Tabella `daily_question_reveal_states`, chiave `(couple_id, question_id, actor_role)`. Ownership per **coppia + ruolo**, come `daily_question_outcomes` (M3): `claim_us_role` sostituisce l'UID al re-pair, il ruolo no; nessun user_id/couple_id/target dal client. RLS forzata, nessuna policy, nessun grant client.
- RPC `SECURITY DEFINER`: `get_daily_reveal_meta`, `mark_daily_reveal_seen`, `dismiss_daily_reveal_notice`, `set_daily_answer_reaction` (`heart|angry|cry`, `null` la toglie). Reveal-ready delegato a `private.daily_question_reveal_ready` → `get_daily_state`.
- `seen` e `dismissed` sono distinti: il dismiss non imposta mai `reveal_seen_at`.
- Nessuna push per reazioni, ricevute o dismiss.
