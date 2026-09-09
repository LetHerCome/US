# US vNext — M4 Ti penso reciproco

**Status:** CURRENT / READY FOR MANUAL QA CHECKPOINT
**Roadmap status:** CURRENT
**Product authority:** `docs/product/us-vnext-vision.md`
**Roadmap authority:** `docs/roadmap/us-vnext-roadmap.md`
**Repository:** `F:\AI\US`

## 1. Objective

Evolvere `Ti penso` da bottone/reward a gesto reciproco:

```text
gesto di A → ricezione di B → reazione o risposta di B → nuova conseguenza
```

La vision nomina tre possibili segnali (`Ti penso`, `Mi manchi`, `Ho pensato a noi`) e richiede che il partner possa reagire o lasciare qualcosa in risposta. Non richiede un social feed, un message engine universale o XP.

## 2. Stato reale verificato

`public.shared_messages` è l’authority esistente per messaggi condivisi e supporta già:

- `kind = 'think'` nel check constraint;
- `couple_id`, sender, recipient, body e timestamp;
- RLS di inserimento per sender autenticato della coppia;
- lettura sender/recipient nella coppia;
- update limitato al recipient;
- Realtime già attivo;
- indici per couple, kind e recipient.

`public.widget_send_think_internal(text, uuid)` gestisce già:

- token scope `think:send`;
- partner resolution server-side;
- idempotenza receipt;
- rate limiting;
- insert di `kind = 'think'`, `body = 'Ti penso'`;
- delivery tramite il percorso widget/edge esistente.

`claim_us_role` migra già sender/recipient di `shared_messages` durante il re-pair.

## 3. Gap rispetto alla vision

Non è stato trovato un contratto esistente per:

- tipi distinti `Mi manchi` / `Ho pensato a noi`;
- reazione strutturata del partner;
- risposta testuale collegata al gesto;
- outcome o receipt reciproco oltre `opened_at`;
- UI composer per una risposta a Ti penso;
- authority che stabilisca se una risposta sia parte dello stesso gesto.

Il riuso senza decisione potrebbe quindi trasformare arbitrariamente:

- `body` in payload strutturato;
- `kind = 'normal'` in risposta implicita;
- `opened_at` in reazione;
- un nuovo `kind` in una nuova semantica di dominio.

## 4. Raccomandazione minima

Procedere in due possibili slice, ma non scegliere autonomamente tra loro:

### Slice A — delivery + acknowledgment

Riusa integralmente `kind = 'think'` e `opened_at` esistente. Il partner può aprire il gesto e produrre un acknowledgment non testuale. Non introduce nuova persistence, ma realizza solo una conseguenza minima.

### Slice B — delivery + risposta breve

Aggiunge un contratto esplicito per una risposta associata al gesto. Richiede decidere se usare `shared_messages` con relazione/payload supportato oppure una persistence dedicata, con RLS, idempotenza e re-pair.

La Slice B è più aderente alla vision, ma non può essere implementata senza decidere la semantica della relazione tra gesto e risposta.

## 5. Decisione approvata

È approvato **One-tap reaction**:

- il recipient può lasciare una sola reazione predefinita al messaggio `think`;
- il vocabolario M4 iniziale chiuso è esclusivamente `heart`, `hug`, `miss_you`;
- `smile` e qualsiasi altro valore sono fuori da M4;
- la reazione è sostituibile e rimovibile;
- non è ammesso testo libero;
- non viene creato un sistema reaction generico;
- il sender può leggere la reazione ma non modificarla o rimuoverla;
- la reaction deve restare collegata al messaggio Ti penso e sopravvivere a refresh/sessione;
- la semantica deve restare una vertical slice M4, non un nuovo message engine.

La scelta ha autorizzato la persistence minima M4. La migration corrispondente risulta applicata nello schema remoto e resta da congelare nel commit M4 locale.

## 6. Invarianti

- Non creare un universal Interaction Lifecycle Engine.
- Non creare un nuovo message engine generico.
- Non modificare Auth.
- Non rompere `widget_send_think_internal`, token scope, rate limit o idempotenza.
- Non duplicare `shared_messages`.
- Preservare `claim_us_role` e il re-pair dei riferimenti esistenti.
- Nessun nuovo tipo/persistence finché il contratto prodotto non è scelto.
- La reazione M4 deve usare un insieme chiuso e versionabile di valori predefiniti, definito nella specification/migration; nessun valore arbitrario dal client.
- M4 resta l’unica milestone CURRENT; M5 non parte.

## 7. Architecture proposal — pending vocabulary decision

La proposta minima è una tabella dedicata `public.think_reactions`, collegata a `shared_messages.id`:

- una sola riga per `message_id`;
- `reaction` come valore chiuso tramite CHECK, senza testo libero;
- nessun `sender_id`/`recipient_id` persistito: il destinatario si deriva dal messaggio `think`, così `claim_us_role` continua a migrare soltanto i riferimenti di `shared_messages`;
- RPC `set_think_reaction(message_id, reaction)` e `delete_think_reaction(message_id)` con actor derivato da `auth.uid()` e verifica recipient;
- sender in sola lettura tramite RLS scoped a sender/recipient della coppia;
- recipient unico writer/deleter;
- write ACL dirette revocate, SECURITY DEFINER con `search_path=''`, idempotenza e controllo del messaggio `kind='think'`;
- niente Realtime iniziale: refresh su foreground/apertura, per evitare leakage sui DELETE Postgres Changes;
- nessuna modifica a `shared_messages`, Auth o widget send RPC.

Questa proposta è architetturalmente compatibile con l’authority esistente. Il vocabolario `heart` / `hug` / `miss_you` è approvato per M4 e non può essere ampliato nella milestone.

L’implementation bounded UI/runtime, la migration e la review indipendente finale sono completati. La migration è verificata nello schema remoto; questo working tree contiene la versione da congelare nel commit M4. Il prossimo checkpoint è il manual QA M4 in ambiente autenticato.

## 8. Routing checkpoint

- **Phase:** M4 reciprocal response contract and data boundary
- **Classification:** DEEP
- **Worker:** Hermes diretto per repository/remote authority inspection e checkpoint
- **Model:** `gpt-5.6-luna`
- **Reasoning:** il delivery esistente è riutilizzabile, ma la risposta/reazione introduce una semantica prodotto e potenzialmente una nuova persistence.
- **Escalation:** checkpoint Francesco prima di migration, schema/RLS/RPC, nuova semantica `kind` o modifica del percorso widget.

## 9. Approved vocabulary contract

```text
heart
hug
miss_you
```

Il client può inviare soltanto uno dei tre valori. Il server deve applicare lo stesso CHECK contract; nessun valore arbitrario o fallback semantico è valido.

## 10. Routing dopo decisione

- **Phase:** M4 reaction data contract and migration design
- **Classification:** DEEP
- **Selected worker:** Codex CLI read-only per design/security review indipendente
- **Model/effort:** `gpt-5.6-sol` / `high`
- **Reason:** la reaction è nuova persistence production-scoped con ownership sender/recipient, sostituzione, delete e re-pair.
- **Actual next checkpoint:** migration proposal + DEEP/security review; nessun apply production.
