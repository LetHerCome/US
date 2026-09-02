# US vNext — M3 Daily Question: loop reciproco

**Status:** DONE
**Roadmap status:** CURRENT
**Product authority:** `docs/product/us-vnext-vision.md`
**Roadmap authority:** `docs/roadmap/us-vnext-roadmap.md`
**Repository:** `F:\AI\US`

## 1. Objective

Trasformare il flusso Daily Question esistente:

```text
domanda → risposta separata → waiting → reveal
```

in una prima vertical slice coerente con la product vision:

```text
domanda → risposta separata → waiting → reveal
         → confronto/conversazione
         → eventuale outcome/memoria
```

M3 deve dimostrare il core loop senza creare un universal interaction engine, una nuova inbox o una seconda state authority.

## 2. Authority e stato verificato

Le autorità esistenti sono:

- `daily_questions` per la domanda corrente;
- `daily_answers` per le risposte individuali;
- RPC `get_daily_state` per stato reciproco, `partner_has_answer`, `my_answer` e `both_answered`;
- `openToday()`/`hydrateToday()` in `app.js` per l’overlay e il lifecycle esistente;
- subscription realtime su `daily_answers`;
- `navigation.js` per layer, history e native-back.

Nel repository non è stata trovata una persistence esistente per:

- commenti o messaggi associati a una domanda;
- reazioni al reveal;
- outcome della conversazione;
- preservazione di una domanda come Ricordo;
- lifecycle condiviso post-reveal.

Le tabelle `shared_messages` e le relative RPC/migration esistenti sono dedicate al segnale `Ti penso`/widget, non costituiscono una authority generica per conversazioni Daily Question.

## 3. Proposta tecnica preliminare

La direzione più sicura, ancora da approvare sul piano dati, è:

1. mantenere `daily_questions`, `daily_answers` e `get_daily_state` come sole autorità della domanda e del reveal;
2. aggiungere un post-reveal step esplicito nell’overlay esistente, non una nuova route;
3. separare ciò che è immediatamente derivabile (reveal disponibile, stato waiting, invito al confronto) da ciò che deve essere persistito (eventuale testo/reazione/outcome);
4. introdurre persistence soltanto se si decide che la conversazione o l’outcome debbano sopravvivere a refresh, offline o process death;
5. se serve persistence, definire una singola authority, ownership, RLS, deduplica, delete semantics e compatibilità prima del codice.

Non è autorizzato riusare `shared_messages` come workaround senza verificare che il suo contratto semantico e di sicurezza supporti realmente Daily Question.

## 4. Decisione approvata

È approvata **Opzione 2 — persistence minima dedicata**.

Il nuovo contratto deve essere una vertical slice esclusiva della Daily Question:

- `daily_questions` e `daily_answers` restano authority dei dati esistenti;
- non si duplicano domanda, risposte, `my_answer`, `partner_has_answer` o `both_answered`;
- si persistono soltanto gli outcome post-reveal non ricostruibili e necessari a sopravvivere a refresh/device/sessione;
- non si persiste stato UI, route, modal, spinner o lifecycle generico;
- schema, RLS e RPC devono avere il minimo blast radius e nessuna modifica Auth;
- non è ammesso dual-write permanente;
- la traccia durevole non costruisce la futura timeline Ricordi: potrà essere consumata da una milestone futura.

La scelta è una decisione di data/state architecture e security autorizzata per M3. Restano da validare durante la fase DEEP: semantica minima dell’outcome, ownership delle scritture, idempotenza, delete/privacy semantics, compatibilità con client esistenti e rollback della migration.

## 5. Invarianti già fissati

- Oggi resta `home` e M2 non viene alterata.
- Daily Question continua a usare `openToday()` e il suo overlay.
- Nessuna nuova route, inbox, router o history entry artificiale.
- Nessun universal interaction engine.
- Nessuna duplicazione delle autorità Daily Question.
- Waiting e reveal restano derivati da dati reali.
- Native-back, layer lifecycle, offline e realtime esistenti restano invariati.

## 6. Acceptance preliminare

Dopo la decisione dati, i test M3 dovranno coprire almeno:

1. domanda disponibile → risposta personale separata;
2. partner ha risposto → stato `waiting_for_me` corretto;
3. entrambi hanno risposto → reveal corretto;
4. reveal → confronto post-reveal nell’overlay esistente;
5. refresh/realtime/offline/back durante ogni stato;
6. deduplica e stale response se viene introdotta persistence;
7. nessuna regressione M2, Home, navigation o native-back;
8. preservazione o assenza di outcome conforme all’opzione scelta.

## 7. Routing checkpoint

- **Phase:** M3 architecture/data contract checkpoint
- **Classification:** DEEP
- **Selected worker:** Hermes diretto per inspection e documentazione del blocco
- **Model:** `gpt-5.6-luna`
- **Reasoning effort:** non esposto
- **Motivazione:** il repository non espone una authority post-reveal riutilizzabile; prima di delegare implementazione serve una decisione dati riservata al product owner.
- **Escalation:** fermarsi per Francesco; non introdurre schema/RPC/RLS/Auth/persistence per inferenza.

## 8. Routing aggiornato dopo approvazione

- **Phase:** schema, authority, migration, RLS/RPC architecture
- **Classification:** DEEP
- **Selected worker:** Codex CLI in read-only per proposta indipendente; Hermes mantiene ownership e decide l’applicazione conforme
- **Model:** `gpt-5.6-sol`
- **Reasoning effort:** `high`
- **Motivazione:** la decisione autorizza persistence e security scoped, ma il blast radius deve essere minimizzato e la compatibilità con le authority Daily Question esistenti verificata prima di scrivere migration.
- **Escalation:** se emerge incompatibilità con dati esistenti, RLS non dimostrabile o necessità di Auth/security oltre il perimetro approvato, fermarsi per Francesco.

## 9. Esito architecture review DEEP

La review indipendente ha confermato che la direzione minima può essere una authority dedicata `daily_question_outcomes`, con al massimo una riflessione post-reveal per partner e domanda. Il report ha classificato come `CONFIRMED` il riuso di `daily_questions`, `daily_answers`, `get_daily_state`, `openToday()` e del layer/navigation esistente; ha classificato come `UNKNOWN/BLOCKER` la DDL reale, le policy RLS, le firme RPC, la publication Realtime e le regole di unlink/re-pair/cancellazione di coppia.

Il worker ha completato il report ma è rimasto appeso dopo l’output; è stato terminato in sicurezza dopo la grace period. Nessuna modifica è stata prodotta dal worker.

La proposta non viene implementata finché non sono disponibili:

1. DDL/policy/publication authoritative di `daily_questions`, `daily_answers`, `profiles` e `couples`;
2. approvazione della semantica “riflessione testuale facoltativa per partner”;
3. approvazione di hard delete owner-only e relativo comportamento di unlink/re-pair/cancellazione.

## 12. Routing implementation checkpoint

- **Phase:** bounded Daily Question post-reveal vertical slice
- **Classification:** STANDARD (downgrade from DEEP after architecture/security design)
- **Selected worker:** Codex CLI workspace-write su branch dedicato
- **Model:** `gpt-5.6-terra`
- **Reasoning effort:** `medium`
- **Motivazione:** schema, ownership, RLS e re-pair sono già definiti e reviewed; l’implementazione è limitata a test, overlay Daily Question e adapter RPC/SELECT senza cambiare Auth, navigation o altri domini.
- **Escalation:** tornare a DEEP/fermarsi per Francesco se l’implementazione richiede modifica a `get_daily_state`, `claim_us_role`, Auth, RLS fuori dalla migration M3 o una nuova persistence.

## 13. Implementation contract

- aggiungere test M3 prima del codice e osservare RED;
- usare `get_daily_state` come unica fonte di reveal;
- caricare outcome solo dopo `both_answered`;
- leggere con SELECT RLS-scoped e scrivere/cancellare solo tramite i due RPC M3;
- gestire `saved`, `duplicate`, `stale`, `already_absent` senza persistere stato UI;
- mantenere il testo locale in caso di errore/offline;
- ricaricare gli outcome all’apertura/visibilità dell’overlay, senza nuova publication Realtime;
- usare l’overlay `today`, `openToday()`, `closeToday()`, focus/layer/native-back esistenti;
- aggiungere solo la UI necessaria per una riflessione per partner, partner read-only e hard delete owner-only;
- nessun cambiamento a schema remoto durante questa fase: la migration resta proposta/non applicata fino al gate remoto separato.

## 14. Manual QA checkpoint

Automated validation and independent review are complete. Before commit and any remote migration application, Francesco must verify manually in a real authenticated environment:

1. con una domanda non rivelata, la regione post-reveal non è visibile e il testo partner non è leggibile;
2. dopo il secondo answer, il reveal esistente resta corretto e compare “Parlatene insieme”;
3. il salvataggio di una riflessione la rende visibile come propria;
4. l’altro partner vede la riflessione in sola lettura;
5. modifica e hard delete owner-only funzionano senza poter agire sul testo partner;
6. errore/offline conserva il draft e non nasconde il reveal;
7. refresh, chiusura/riapertura overlay, foreground e native-back mantengono il contenuto atteso;
8. nessun contenuto appare per una coppia diversa o prima del reveal.

M3 è chiusa: manual QA reciproco, migration base e correttiva applicate/verificate, test, build e review completati.

## 10. Prerequisito Supabase verificato e authority migration

I seguenti fatti sono stati recuperati dallo schema remoto autorevole e sono input verificati per questa proposal.

### `daily_questions`

- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`;
- `question_date date NOT NULL UNIQUE`;
- `question text NOT NULL`;
- `category text NOT NULL DEFAULT 'daily'`;
- `created_at timestamptz NOT NULL DEFAULT now()`.

### `daily_answers`

- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`;
- `question_id uuid NOT NULL REFERENCES daily_questions(id) ON DELETE CASCADE`;
- `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`;
- `couple_id uuid NOT NULL REFERENCES couples(id) ON DELETE CASCADE`;
- `answer text NOT NULL`;
- `created_at timestamptz NOT NULL DEFAULT now()`;
- `updated_at timestamptz NOT NULL DEFAULT now()`;
- `UNIQUE(question_id,user_id)`;
- index `(couple_id,question_id)`.

### RLS esistente

- `daily_questions`: `authenticated SELECT` con `true`;
- `daily_answers`: SELECT solo `user_id = auth.uid()`; INSERT con `user_id = auth.uid()` e `couple_id = private.current_couple_id()`; UPDATE owner-only con lo stesso controllo di coppia; nessuna DELETE policy utente;
- `profiles`: SELECT del profilo proprio o della stessa coppia; UPDATE solo self; unique parziale `(couple_id,role)` quando `couple_id IS NOT NULL`;
- `couples`: SELECT/UPDATE solo per `id = private.current_couple_id()`.

### Current-couple e Daily Question RPC

- `private.current_couple_id()` è `SECURITY DEFINER` e legge `profiles.couple_id` per `auth.uid()`;
- `public.get_daily_state(target_question_id uuid) RETURNS jsonb` è la **canonical Daily Question reveal authority**: è `SECURITY DEFINER`, verifica auth, deriva la coppia da `profiles`, legge la risposta corrente, conta le risposte della coppia e mostra `partner_answer` soltanto quando `answered_count >= 2`;
- lo stato autorevole restituito è `my_answer`, `partner_has_answer`, `both_answered`, `partner_answer`.

### Realtime e re-pair

- `daily_answers` è nella publication `supabase_realtime`;
- `daily_questions` e `profiles` non sono pubblicate;
- `public.claim_us_role(invite_code text, chosen_role text)` è `SECURITY DEFINER`; quando sostituisce un UID crea il nuovo profilo, migra esplicitamente i riferimenti profile/user-owned, aggiorna `daily_answers.user_id` dal vecchio al nuovo UID per la coppia e poi elimina il vecchio profilo;
- non è stata trovata una funzione DB dedicata di unlink/unpair.

## 11. Migration proposal M3

La migration base applicata è `supabase/migrations/20260901192817_daily_question_outcomes.sql`; la migration correttiva è `supabase/migrations/20260902101619_daily_question_reveal_authority.sql`.

### Ownership e re-pair

`daily_question_outcomes` usa `couple_id` + `author_role`, non `user_id` o `profile_id`:

- la domanda e le risposte restano nelle authority esistenti;
- `public.get_daily_state(uuid)` è l’autorità canonica della semantica reveal;
- `private.daily_question_reveal_ready(uuid)` delega a `get_daily_state` ed estrae esclusivamente `both_answered`, senza contare direttamente `daily_answers`;
- ogni coppia/domanda/ruolo può avere una sola riflessione;
- il ruolo è già l’identità relazionale usata da `profiles` e dal contratto `claim_us_role`;
- il re-pair cambia UID/profile record ma conserva la coppia e il ruolo, quindi non deve migrare né perdere outcome;
- il nuovo RPC deriva `couple_id` e `author_role` da `auth.uid()` e `profiles`, senza accettarli dal client;
- non viene introdotta alcuna FK a `profiles` o `auth.users`, evitando cascade distruttivi al cambio UID.

### Persistenza minima

La tabella conserva solo:

- `id` UUID server-generated;
- `couple_id` FK a `couples` con `ON DELETE CASCADE`;
- `question_id` FK a `daily_questions` con `ON DELETE CASCADE`;
- `author_role` (`francesco` o `beatrice`);
- `body` non vuoto e limitato a 1000 caratteri;
- `revision`, `last_operation_id`, `created_at`, `updated_at`.

Non conserva domanda, risposte, reveal state, route, overlay, loading, `preserved` o un lifecycle generale.

### Security contract

- RLS enabled;
- nessun INSERT/UPDATE/DELETE diretto per `authenticated`;
- SELECT solo per membri della coppia e solo dopo reveal autorizzato;
- `save_daily_question_outcome` e `delete_daily_question_outcome` sono gli unici writer;
- funzioni `SECURITY DEFINER` con `SET search_path = ''`, riferimenti qualificati, grants espliciti e `REVOKE EXECUTE` da `PUBLIC`/`anon`;
- save è idempotente con `operation_id` e protegge update concorrenti con `expected_revision`;
- delete è owner-role-only, hard delete e idempotente.

### Realtime

M3 non aggiunge `daily_question_outcomes` alla publication `supabase_realtime`: i DELETE Postgres Changes non applicano RLS ai record precedenti e possono esporre metadata a subscriber non appartenenti alla coppia. Il partner ricarica gli outcome all’apertura/visibilità dell’overlay; un’eventuale publication futura richiede un contratto privacy separato.

L’idempotenza di `operation_id` vale per la riga esistente durante il suo lifecycle. Dopo un hard delete non viene conservato un tombstone: un retry tardivo con `expected_revision = null` è trattato come una nuova creazione, perché conservare ricevute di delete sarebbe una persistence ulteriore e contraria al contratto M3.

### Gate applicazione completato

La migration base e la migration correttiva sono applicate e verificate. Il rollback documentato resta non distruttivo e non è stato eseguito.

Controlli completati:

1. review DEEP/security read-only della SQL;
2. test SQL/RLS/catalogo read-only sul progetto remoto;
3. verifica della firma reale di `private.current_couple_id()` e della semantica role/profile;
4. verifica che nessuna publication aggiuntiva sia necessaria;
5. verifica advisors senza nuovi finding M3;
6. manual QA reciproco e closure gate applicativo.

## 15. Correttiva reveal authority

La migration `supabase/migrations/20260902101619_daily_question_reveal_authority.sql` è una correzione additiva di funzione:

- mantiene la signature `private.daily_question_reveal_ready(uuid)`;
- mantiene `SECURITY DEFINER`, `search_path = ''` e ACL selettive;
- delega a `public.get_daily_state(uuid)`, autorità canonica del reveal;
- estrae soltanto `both_answered` con fallback `false`;
- non legge direttamente `daily_answers`;
- non cambia tabelle, colonne, dati, Auth, RPC save/delete o Realtime;
- non propaga né persiste `partner_answer`.

Il contract test `M3 reveal helper delega a get_daily_state...` impedisce il ritorno a un conteggio autonomo di `daily_answers`.

La review indipendente DEEP/security è **PASS senza finding bloccanti**. Restano da eseguire dopo l’applicazione i controlli runtime/catalogo su owner, ACL effettive, RLS bypass, exposed schema e assenza di dipendenze circolari nella definizione remota di `get_daily_state`.
