# US MC2 — Couple Creation + Invite Backend · Blueprint FINALE

Documento autosufficiente per l'agente di implementazione (export del 2026-10-07). Contiene la specifica completa; il pack SQL read-only è incluso nell'Appendice B.

**Stato:** BLUEPRINT FINALE, pronto per l'handoff all'implementazione (solo design: nessuna implementazione, nessun commit, nessuna PR, nessun deploy)
**Decisioni:** D1, D2, D3 approvate e D4 modificata da Francesco il 2026-10-07, dopo l'esecuzione read-only del pack in produzione (§1.7, §16)
**Base verificata:** `origin/main` = `4dcfa4580e0d43789325271291647e948ca21dd6` ("Multi-Couple Foundation V1 (#150)")
**Destinatario:** agente di implementazione MC2
**Pack read-only per produzione:** `MC2_PREFLIGHT_READONLY.sql` (testo integrale in Appendice B). Francesco l'ha eseguito il 2026-10-07 senza modificare la produzione; i fatti riportati sono in §1.7. Restano **[NON VERIFICATI IN PROD]** solo i punti che §1.7 non copre.

Tutti i riferimenti `file:riga` sono su `4dcfa45`. `supabase/baseline/*` è generato dalla cattura di produzione (F2A.1) e descrive lo stato di partenza; le migrazioni forward successive sono in `supabase/migrations/`.

---

## 0. Sintesi in 10 righe

1. **Verdetto: A — restare su `profiles.couple_id`.** Niente `couple_members`.
2. Il cap "max 2 membri" e "un utente = una coppia" esistono **già come vincoli strutturali**: PK `profiles.id` + indice unico `(couple_id, role)` + CHECK `role ∈ {francesco, beatrice}`.
3. Lo stato degli inviti va nella tabella **già esistente** `couple_invites` (oggi senza client grant, RLS senza policy), con 3 colonne in più: `expires_at`, `revoked_at`, `created_by`.
4. Regola: **un profilo esiste se e solo se l'utente è membro di una coppia.** Il profilo nasce nella stessa transazione che crea la coppia o accetta l'invito.
5. Le uniche scritture di membership passano per **4 RPC `SECURITY DEFINER`**, più 1 RPC di lettura. Nessun parametro `couple_id` in input, mai.
6. Token: 128 bit casuali generati dal server, mostrati una sola volta. Nel DB resta solo lo SHA-256. Scadenza 48 h, revocabile, monouso. A ogni coppia corrisponde al massimo un invito attivo.
7. Concorrenza: advisory lock per utente, poi `FOR UPDATE` sulla riga invito. L'indice unico resta come ultima difesa. Lo stesso ordine di lock vale in ogni RPC.
8. Una migrazione forward unica, fail-closed (pre-check e post-check). Rollback = kill switch (revoke EXECUTE), senza toccare i dati della Coppia A.
9. Signup pubblico **resta spento** (D1 approvata). Gli account della seconda coppia nascono in modo controllato. Gli utenti legacy **non** si cancellano in MC2 (D4 modificata): il gate di idoneità li esclude o li tollera senza rischio cross-tenant.
10. Blocker di prodotto per il lancio reale della Coppia B (fuori MC2): la UI e alcuni testi server mostrano ancora "Francesco/Bea" in base allo slot.

---

## 1. Stato attuale verificato nel repo

### 1.1 Modello membership

| Fatto | Evidenza |
|---|---|
| `profiles(id, display_name, couple_id NULL, role NOT NULL, created_at, avatar_path)`, PK `id` | `supabase/baseline/20_tables.sql:525-533` |
| `profiles.id → auth.users(id) ON DELETE CASCADE`; `profiles.couple_id → couples(id) ON DELETE CASCADE` | `supabase/baseline/40_constraints.sql:261-262` |
| `role ∈ ('francesco','beatrice')` | `40_constraints.sql:160` |
| **Indice unico parziale `(couple_id, role) WHERE couple_id IS NOT NULL`** | `supabase/baseline/50_indexes.sql:45` |
| `couples(id, name, started_on, created_at, home_photo_path, bond_xp)` | `20_tables.sql:208-215` |
| Default `couples.started_on = '2026-04-21'` (data privata della Coppia A) | `supabase/baseline/35_column_defaults.sql:52` |
| Resolver del tenant: `private.current_couple_id()` = `select couple_id from profiles where id = auth.uid()` (definer) | `supabase/baseline/30_functions.sql:410-417` |
| Actor helper per RPC: `private.m11a_actor()` / `m11a_actor_locked()` (FOR SHARE) | `30_functions.sql:1388-1427` |
| Contesto client: `UsCoupleContext` legge `couples` e `profiles` dal `couple_id` del profilo autenticato | `app.js:104-142` |
| Un account senza profilo vede "Nessun profilo US valido" | `app.js:791` |
| Decisione: `couple_members` rimandato | `docs/DECISIONS.md:63-71`, `docs/missions/us-multicouple-foundation-v1.md` |

**Conseguenza:** un account ha al massimo 1 profilo (PK), quindi 1 `couple_id`, quindi 1 slot. Una coppia ha al massimo 2 profili (2 slot × indice unico). Entrambi gli invarianti richiesti da MC2 **sono già imposti dal database** e non dipendono dalla UI.

### 1.2 Inviti: esiste già una tabella

| Fatto | Evidenza |
|---|---|
| `couple_invites(id, couple_id, role, code_hash, used_by, used_at, created_at)` | `20_tables.sql:145-153` |
| `UNIQUE(code_hash)`, **`UNIQUE(couple_id, role)`** | `20_tables.sql:155-156` |
| `role ∈ ('francesco','beatrice')`, FK `couple_id → couples` CASCADE, `used_by → auth.users` SET NULL | `40_constraints.sql:38, 209-210` |
| RLS abilitata, **nessuna policy** | `supabase/baseline/65_rls_policies.sql:22` |
| Nessun grant a `anon`/`authenticated`, solo `service_role` | `supabase/baseline/70_grants.sql:37-38` |
| Unico consumer storico: `claim_us_role` (anonimo, nessun controllo su `used_at`, poteva cancellare il profilo esistente). **Ritirato in F1A** con EXECUTE revocato | `30_functions.sql:2192-2335`, `70_grants.sql:295-296`, `docs/us-2.0/F1A_AUTH_SHUTDOWN.md` §1-2 |
| In produzione al 2026-10-03: 2 inviti, entrambi usati dai due profili reali | `docs/us-2.0/F1A_AUTH_SHUTDOWN.md:37` |

### 1.3 Grant e RLS sulle tabelle di membership

| Tabella | Grant client | Policy |
|---|---|---|
| `profiles` | `anon` e `authenticated`: **INSERT, SELECT, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN**; `authenticated` UPDATE solo su `avatar_path` (`70_grants.sql:116-120`) | SELECT `id = auth.uid() OR couple_id = current_couple_id()`; UPDATE self. **Nessuna policy INSERT/DELETE** (`65_rls_policies.sql:217-221`) |
| `couples` | `authenticated`: SELECT; UPDATE su `name`, `started_on`, `home_photo_path` (`70_grants.sql:48-53`) | SELECT/UPDATE `id = current_couple_id()` (`65_rls_policies.sql:149-153`) |
| `couple_invites` | nessuno | nessuna |

Oggi un client **non può** scegliersi un `couple_id`, per tre motivi: niente policy INSERT su `profiles`, il grant UPDATE copre solo `avatar_path` (fix F1C, `docs/us-2.0/F1C_AUTHORITY_RLS_HARDENING.md:52-54, 68-69`) e su `couples` non c'è INSERT. Il grant INSERT/DELETE/TRUNCATE su `profiles` è però un residuo (SEC-05, `docs/us-2.0/SEC_RLS_AUDIT.md:59`). Oggi è inerte, ma diventa **critico** appena `profiles` è l'autorità di membership: una futura policy permissiva aprirebbe proprio il caso 13 del brief. MC2 lo chiude (§6).

### 1.4 Auth

- `enable_signup = false`, `enable_anonymous_sign_ins = false` (`supabase/config.toml:10-11`). Gli account li crea il proprietario.
- In produzione ci sono **1 account email senza profilo** e **8 utenti anonimi** senza profilo, tutti con sessioni vive (verificato il 2026-10-07, §1.7; vedi anche `F1A_AUTH_SHUTDOWN.md:34-37`).
- ⚠ Il brief dice che "ogni account autenticato ha un record `profiles`". Per gli account reali della Coppia A è vero, **non per tutti gli `auth.users`**. Il design MC2 assume esplicitamente "profilo ⇔ membership" (§3.1).

### 1.5 Storage, Realtime, Edge

- `us-media`: path `<couple_id>/<uid>/…`, policy basate su `private.current_couple_id()` (`supabase/baseline/85_storage.sql:14-21`). Una nuova coppia è isolata automaticamente.
- Realtime: solo `postgres_changes` con filtro `couple_id`/`recipient_id` (`app.js:4246-4258`, `left-for-you.js:513`, `stories.js:909`). Nessun canale broadcast/presence.
- Le Edge Functions ricavano la coppia lato server dal profilo (es. `supabase/functions/send-web-push/index.ts:31-33`); audit SEC §87. Nessun UUID hardcoded in functions/SQL/JS (grep su `4dcfa45`).

### 1.6 Notifiche e device (punto 20)

**Native Notifications V1 è in `main`** (commit `e126b9c`, migrazione `supabase/migrations/20261006200000_native_notifications_v1.sql`). `docs/CURRENT_STATE.md` la descrive ancora come "review candidate non live": **q10 (verificato da Francesco, 2026-10-07):** Native Notifications V1 è **funzionalmente già applicata in produzione**, ma la versione `20261006200000` **manca dal migration ledger**. È un drift noto. **MC2 non deve ripararlo**: niente `migration repair` e nessuna modifica al ledger o a `device_push_tokens`, né riapplicazione di `20261006200000`. La migrazione MC2 non dipende dalla forma di `device_push_tokens`. Nel rollout di MC2 Francesco gestisce questo drift a parte, perché `supabase db push` vedrebbe `20261006200000` come pendente (§10).

- `device_push_tokens`: una riga per installazione, `couple_id` denormalizzato al momento della registrazione. RPC `register_native_push_device` richiede profilo + coppia (`20261006200000_native_notifications_v1.sql:103-110`).
- `register_web_push_subscription` richiede `couple_id` dal profilo (`30_functions.sql:4035-4060`).
- Dispatcher unico: il native filtra `device.couple_id === coupleId`, il Web Push filtra **solo per `user_id`** (`supabase/functions/_shared/notification-core.mjs:154-165`).

### 1.7 Fatti di produzione verificati (pack read-only, 2026-10-07, eseguito da Francesco)

Nessuna modifica è stata fatta alla produzione: tutto il controllo è stato read-only.

| Area | Valore live |
|---|---|
| `auth.users` | **11** in totale: **8** anonimi, **3** email permanenti |
| Utenti con profilo | **2** (Francesco e Beatrice) |
| Email permanente senza profilo | **1**, con 2 sessioni e 0 oggetti Storage |
| Anonimi con sessioni | **8** |
| Oggetti Storage di proprietà anonima | **28**, di **3** utenti anonimi |
| Coppie | **1**, con **2** membri |
| `profiles` | `id` PK/FK `auth.users`; indice UNIQUE `(couple_id, role)`; CHECK `role ∈ {francesco, beatrice}`. Uguale al repo |
| `couple_invites` | colonne `id, couple_id, role, code_hash, used_by, used_at, created_at`; RLS abilitata; **2 righe storiche, entrambe usate**; UNIQUE `(code_hash)`; UNIQUE `(couple_id, role)`; nessun grant ad `anon`/`authenticated`. Uguale al repo |
| Grant su `profiles` | `anon`/`authenticated` hanno ancora i grant legacy **INSERT, DELETE, TRUNCATE** (oltre a REFERENCES, SELECT, TRIGGER). Uguale a `70_grants.sql:117-118`: la hardening §6.2 è **confermata** e va testata fail-closed (DB-24) |
| `claim_us_role` | EXECUTE: `anon` false, `authenticated` false, `service_role` true. Uguale al repo |

Conseguenze per l'implementazione:
- I pre-check §10.1 sono soddisfatti dallo stato live: inviti legacy tutti usati, 1 coppia con 2 membri, indice e CHECK presenti. Restano comunque nella migrazione come guardia.
- Gli 8 anonimi **hanno sessioni vive**, quindi possono chiamare PostgREST con un JWT `authenticated`. Il gate `private.mc2_require_account()` (§5) è la sola cosa che li tiene fuori dalle RPC MC2, e va testato esplicitamente con una sessione anonima (DB-23).
- L'account email orfano resta (D4). Se ha l'email confermata può creare una coppia o accettare un invito: è voluto, perché potrebbe diventare un account della beta couple. Ogni coppia che crea resta isolata come qualsiasi altra. **Nessuna** precondizione della migrazione deve dipendere dalla sua assenza.
- La pulizia Auth (revoca sessioni, remediation dei 28 oggetti Storage, verifica, delete) è una **missione separata**, fuori da MC2.

---

## 2. Verdetto architetturale: **A — `profiles.couple_id`**

| Criterio | A: `profiles.couple_id` | B: `couple_members` |
|---|---|---|
| 1 utente → 1 coppia attiva | PK `profiles.id`: **strutturale** | Serve un unique su `user_id` (o su `user_id WHERE active`) |
| Max 2 per coppia | Indice unico `(couple_id, role)` + CHECK 2 valori: **strutturale, senza race** | Serve uno slot `smallint ∈ {1,2}` + unique, oppure un trigger di conteggio (soggetto a race) |
| Resolver tenant | Invariato (`current_couple_id()`) | Da riscrivere, e con lui ogni policy, i 2 actor helper, le Edge e il client che leggono `profiles.couple_id` |
| Blast radius | 1 tabella esistente estesa, 5 RPC nuove | Riconvalida di tutte le policy RLS e Storage e dei definer |
| Sincronizzazione | Una sola sorgente | Due sorgenti (`profiles.couple_id` e `couple_members`) da tenere coerenti, o una migrazione big-bang |
| Cosa abilita in più | — | Storico membership, più coppie per account, leave/rejoin |

Il prodotto attuale e la seconda coppia reale non richiedono nessuna delle capacità in più di B. B aumenterebbe la superficie di autorizzazione proprio nella missione in cui vogliamo meno cambiamenti. **Scegliere A.**

**Quando rivalutare B:** quando arriva un flusso "lascia la coppia / cambia coppia", lo storico delle membership, un account in più coppie o più di 2 membri.
**Vincolo per il futuro:** la normalizzazione dei role-slot (missione separata) deve **sostituire** il cap con un equivalente, per esempio `slot smallint check (slot in (1,2))` unico per `couple_id`. Va scritto nella missione di normalizzazione.

---

## 3. Modello dati

### 3.1 Invarianti (fail-closed)

- **I1** `profiles` esiste ⇔ l'utente è membro di una coppia. `profiles.couple_id IS NOT NULL` per ogni riga creata da MC2. Le RPC rifiutano, con `profile_state_unsupported`, un profilo esistente con `couple_id NULL`.
- **I2** Un account ha al massimo una coppia (PK).
- **I3** Una coppia ha al massimo 2 membri (indice unico `(couple_id, role)` + CHECK).
- **I4** Lo slot (`role`) è assegnato **solo** dal server: il creatore prende `'francesco'`, l'invitato lo slot libero (in pratica `'beatrice'`). È un token interno legacy. L'identità visibile è `display_name`.
- **I5** Per ogni (coppia, slot) esiste al massimo una riga invito (unique già esistente). Per una coppia che crea inviti c'è quindi al massimo un invito attivo.
- **I6** Il codice in chiaro non è mai salvato né restituito dopo la creazione. Nessuna RPC restituisce `code_hash`, `id` dell'invito o `couple_id` di un'altra coppia.
- **I7** Nessuna RPC accetta `couple_id`, `invite_id`, `user_id` o `role` come input.

### 3.2 Modifiche a `couple_invites` (forward)

```sql
alter table public.couple_invites
  add column expires_at  timestamptz,
  add column revoked_at  timestamptz,
  add column created_by  uuid references public.profiles(id) on delete set null;

-- backfill delle righe legacy (pre-check: tutte usate)
update public.couple_invites set expires_at = coalesce(used_at, created_at) where expires_at is null;
alter table public.couple_invites alter column expires_at set not null;

alter table public.couple_invites
  add constraint couple_invites_used_xor_revoked check (used_at is null or revoked_at is null),
  add constraint couple_invites_used_by_implies_used_at check (used_by is null or used_at is not null), -- used_by può tornare NULL per FK SET NULL
  add constraint couple_invites_expiry_after_create check (expires_at >= created_at),
  add constraint couple_invites_code_hash_shape check (code_hash ~ '^[0-9a-f]{64}$');
```

Note:
- `couple_invites_used_by_implies_used_at` impedisce che `used_by` sia valorizzato con `used_at` nullo. Il contrario (`used_at` valorizzato, `used_by` NULL) è ammesso, perché `used_by` torna NULL quando l'account viene cancellato (FK `SET NULL`).
- Non si aggiungono tabelle, né colonne `status` (lo stato è **derivato**, §4), né cron.
- `role` resta il nome della colonna: è lo slot riservato all'invitato.

### 3.3 Nessuna modifica a `profiles` o `couples` nello schema

Cambiano solo i grant su `profiles` (§6). `couples` è invariato. Il default `started_on='2026-04-21'` resta (le RPC passano sempre la data esplicitamente); toglierlo è un follow-up (§13).

---

## 4. Stato dell'invito (derivato, nessun campo `status`)

```
            create/rotate                       accept (atomico)
 (nessuna) ───────────────► PENDING ────────────────────────────► USED   (terminale)
                              │  │
                    revoke    │  │ now() >= expires_at
                              ▼  ▼
                         REVOKED  EXPIRED
                              │  │
                              └──┴── rotate (solo se lo slot è libero) ──► PENDING (nuovo codice)
```

| Stato | Condizione |
|---|---|
| USED | `used_at IS NOT NULL` |
| REVOKED | `used_at IS NULL AND revoked_at IS NOT NULL` |
| EXPIRED | `used_at IS NULL AND revoked_at IS NULL AND now() >= expires_at` |
| PENDING | `used_at IS NULL AND revoked_at IS NULL AND now() < expires_at` |

- Scadenza: **48 ore**, costante server (`interval '48 hours'`), mai scelta dal client (D3).
- *Rotate* = nuovo codice sulla **stessa riga** (couple, slot): reset di `code_hash`, `created_by`, `created_at`, `expires_at`, `revoked_at`, `used_*`. È ammesso **solo se nessun profilo occupa lo slot**, verificato sotto lock. Una rotazione invalida immediatamente il codice precedente.
- USED è terminale finché lo slot è occupato. Se l'account dell'invitato viene cancellato (cascade del profilo), lo slot torna libero e il creatore può ruotare.

### 4.1 Formato del token

- Generazione: `extensions.gen_random_bytes(16)` (128 bit) → **Crockford Base32, 26 caratteri** (alfabeto `0-9A-HJKMNP-TV-Z`). Mostrato a gruppi, es. `7K3Q-…`.
- Normalizzazione in input: rimuovere spazi e `-`, maiuscolo, `O→0`, `I/L→1`. Poi deve combaciare con `^[0-9A-HJKMNP-TV-Z]{26}$`, altrimenti `invite_invalid` **senza** lookup.
- Salvato: `encode(extensions.digest(normalized, 'sha256'), 'hex')` in `code_hash`. Con 128 bit di entropia SHA-256 basta (nessun pepper). La forza bruta online su 2^128 non è praticabile, quindi nessun rate limiter in MC2 (vedi T6).
- Il formato legacy (hash di `upper(trim(code))`) non serve: le righe legacy sono USED.

---

## 5. RPC / API

Convenzioni comuni (stile `20261006200000_native_notifications_v1.sql` e `m11a_actor*`):
- `LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''`, nomi tutti qualificati, owner `postgres`.
- `revoke all on function … from public, anon; grant execute … to authenticated;`. Serve per SEC-08: i nuovi oggetti in `public` nascono eseguibili da `anon` (`SEC_RLS_AUDIT.md:62`). L'ACL deve passare il controllo di `tests/f1b-rpc-grant-hardening.test.js:183-203` (`anon` no, `authenticated` sì, `PUBLIC` no).
- Errori: `raise exception using errcode = …, message = '<token>'`. `42501` per autorizzazione, `22023` per input non valido, `P0001` per stato. I messaggi sono token snake_case stabili, già usati dal client esistente (es. `think_partner_missing`).
- **Ordine di lock globale** (identico in ogni RPC di scrittura):
  1. `pg_advisory_xact_lock(hashtextextended('us.mc2.membership:' || auth.uid()::text, 0))`, per utente chiamante;
  2. riga `couple_invites` `FOR UPDATE`;
  3. (solo letture successive, nessun lock sulla riga `couples`).
- Helper privati (non definer, `revoke all … from public, anon, authenticated`, schema `private`):
  - `private.mc2_require_account()`: `auth.uid()` non nullo; `auth.users` con `is_anonymous = false`, `email IS NOT NULL`, `email_confirmed_at IS NOT NULL`, `banned_until` nullo o passato. Altrimenti `42501 account_not_eligible`.
  - `private.mc2_lock_user()`: advisory lock (passo 1).
  - `private.mc2_clean_display_name(text)`: `btrim`, 1..40 caratteri, niente caratteri di controllo (`~ '[[:cntrl:]]'`). Altrimenti `22023 display_name_invalid`.
  - `private.mc2_normalize_code(text) returns text`: NULL se il formato è invalido.
  - `private.mc2_new_code() returns text`: 26 caratteri Base32.

### 5.1 `public.create_couple(p_display_name text, p_started_on date, p_couple_name text default null) returns jsonb`

| | |
|---|---|
| Chi | account idoneo **senza profilo** |
| Output ok | `{"status":"created","couple_id":"<uuid>"}`; retry o già membro: `{"status":"already_member","couple_id":"<propria coppia>"}` |
| Errori | `42501 authentication_required`, `42501 account_not_eligible`, `22023 display_name_invalid`, `22023 started_on_invalid` (null, < 1900-01-01 o > data odierna Europe/Rome), `22023 couple_name_invalid` (1..40 caratteri dopo trim; default `'US.'`), `42501 profile_state_unsupported` |

Passi: `mc2_require_account` → validazioni → `mc2_lock_user` → se esiste un profilo: `couple_id` non nullo ⇒ `already_member` senza scritture; nullo ⇒ `profile_state_unsupported`. Altrimenti `insert into couples(id, name, started_on, created_at, bond_xp)` con `gen_random_uuid()`, quindi `insert into profiles(id, display_name, couple_id, role, created_at) values (uid, name, new_id, 'francesco', now())`. Un `unique_violation` (non atteso dopo il lock) viene catturato e rimappato su `already_member` dopo una nuova lettura.

Idempotenza: la creazione è limitata a 1 per account per costruzione (I2). Un retry dopo una risposta persa restituisce `already_member` con la stessa coppia. Nessun `request_id`.

### 5.2 `public.create_partner_invite() returns jsonb`

| | |
|---|---|
| Chi | membro della coppia (`private.m11a_actor_locked()`: profilo + coppia + slot, `FOR SHARE`) |
| Output | `{"code":"XXXX-XXXX-…","expires_at":"<timestamptz>"}`, **unica** volta in cui il codice esce dal DB |
| Errori | `42501 authentication_required` / `couple membership required` (dall'actor), `P0001 couple_full` |

Passi: actor → `mc2_lock_user` → `slot :=` il valore di `('francesco','beatrice')` diverso dallo slot del chiamante → `select … from couple_invites where couple_id = c and role = slot for update` → **dopo il lock** `if exists (select 1 from profiles where couple_id = c and role = slot) then couple_full` → genera il codice → `insert … on conflict (couple_id, role) do update set code_hash=…, created_by=uid, created_at=now(), expires_at=now()+48h, revoked_at=null, used_at=null, used_by=null`.

Idempotenza: ogni chiamata **ruota** il codice. Un retry dopo una risposta persa produce un codice nuovo, e quello perso non vale più. Comportamento sicuro e deterministico. La Coppia A (piena) riceve sempre `couple_full`.

### 5.3 `public.revoke_partner_invite() returns jsonb`

| | |
|---|---|
| Chi | membro della coppia |
| Output | `{"revoked":true}` se c'era un invito PENDING, altrimenti `{"revoked":false}` (idempotente) |
| Errori | solo quelli dell'actor |

Passi: actor → `mc2_lock_user` → riga invito dello slot libero `FOR UPDATE` → se PENDING: `revoked_at = now()`.

### 5.4 `public.accept_partner_invite(p_code text, p_display_name text) returns jsonb`

| | |
|---|---|
| Chi | account idoneo |
| Output ok | `{"status":"joined","couple_id":"<uuid>"}`; retry dello stesso utente: `{"status":"already_joined","couple_id":"<uuid>"}` |
| Errori | `42501 authentication_required`, `42501 account_not_eligible`, `22023 display_name_invalid`, `P0001 invite_invalid` (**unico errore generico** per: formato non valido, non trovato, scaduto, revocato, usato da altri, coppia piena, coppia senza membro attivo), `P0001 already_in_couple`, `42501 profile_state_unsupported` |

Passi (un'unica transazione, la funzione):
1. `mc2_require_account`; `mc2_clean_display_name`; `norm := mc2_normalize_code(p_code)`. Se `norm` è NULL ⇒ `invite_invalid`.
2. `mc2_lock_user`.
3. `inv :=` `select … from couple_invites where code_hash = sha256(norm) for update`. In READ COMMITTED, dopo l'attesa del lock si rilegge la versione **committata** della riga.
4. Profilo del chiamante:
   - esiste, con `couple_id = inv.couple_id` e `inv.used_by = uid` ⇒ **`already_joined`** (nessuna scrittura);
   - esiste con un altro stato ⇒ `already_in_couple` (`profile_state_unsupported` se `couple_id` è NULL).
5. `inv` NULL, o non PENDING ⇒ `invite_invalid`.
6. `select count(*) from profiles where couple_id = inv.couple_id`: deve essere **esattamente 1**, e lo slot `inv.role` libero. Altrimenti `invite_invalid` (copre "coppia piena" e "creatore cancellato").
7. `insert into profiles(id, display_name, couple_id, role, created_at) values (uid, name, inv.couple_id, inv.role, now())`. Un `unique_violation` ⇒ rilettura e `invite_invalid` / `already_in_couple`.
8. `update couple_invites set used_by = uid, used_at = now() where id = inv.id`.
9. Ritorno.

Tutto avviene in una sola chiamata: o profilo + invito usato insieme, o nulla.

### 5.5 `public.get_couple_membership() returns jsonb` (STABLE, definer, sola lettura)

Output:
- senza profilo: `{"member":false}`;
- membro: `{"member":true,"couple_id":"…","partner_joined":bool,"invite":{"status":"none|pending|expired|revoked|used","expires_at":…|null}}`.

Mai codice, hash o id invito. Solo per la propria coppia. È definer solo perché `couple_invites` non ha grant client. Lo stato del proprio profilo e della propria coppia è già leggibile via RLS.

### 5.6 Cosa NON è RPC (resta tabella + RLS)

- Lettura di profilo, partner e coppia: le SELECT RLS esistenti (`profiles_select_same_couple`, `couples_select_own`), invariate.
- Modifica `couples.name/started_on/home_photo_path`: column grant esistenti, invariati (Settings V2 fuori scope).
- Nessuna policy INSERT/UPDATE/DELETE nuova su `profiles`, `couples`, `couple_invites`.

**Perché le 4 mutazioni devono essere definer:** devono scrivere in tabelle che il client **non deve** poter scrivere (`profiles` insert, `couples` insert, `couple_invites`). Inoltre l'autorizzazione dipende da uno stato che RLS non esprime atomicamente (token valido + monouso + slot libero + nessuna membership). Una policy INSERT su `profiles` riaprirebbe il caso "scelgo il mio `couple_id`".

---

## 6. Authorization model e modifiche RLS/grant

### 6.1 Modello

- **Identità:** solo `auth.uid()` (JWT). Mai `raw_user_meta_data` (vedi SEC-10, `SEC_RLS_AUDIT.md:64`).
- **Tenant:** solo `profiles.couple_id` del chiamante, via `current_couple_id()` / `m11a_actor*`. Invariato.
- **Ingresso in un tenant:** solo `create_couple` (tenant nuovo, generato dal server) o `accept_partner_invite` (tenant derivato dal **segreto**, non da un id).
- **Uscita / cambio tenant:** non esiste in MC2. La membership è immutabile dopo l'ingresso.

### 6.2 Grant (nella migrazione MC2)

```sql
-- profiles: i client leggono (RLS) e aggiornano avatar_path; nient'altro.
revoke insert, delete, truncate, references, trigger, maintain on table public.profiles from anon, authenticated;
-- (SELECT e UPDATE(avatar_path) invariati: toglierli cambierebbe il boot, che va contro il contratto Boot/Auth)

-- couples: nessuna modifica (anon già senza grant, authenticated SELECT + 3 colonne)
-- couple_invites: nessuna modifica (nessun grant client) – aggiungere FORCE? NO (vedi sotto)

revoke all on function public.create_couple(text, date, text)           from public, anon;
revoke all on function public.create_partner_invite()                    from public, anon;
revoke all on function public.revoke_partner_invite()                    from public, anon;
revoke all on function public.accept_partner_invite(text, text)          from public, anon;
revoke all on function public.get_couple_membership()                    from public, anon;
grant execute on function … (le 5) to authenticated;
revoke all on function private.mc2_* from public, anon, authenticated;
```

- `MAINTAIN` esiste solo da PG17. La produzione è PG 17.6, il PGlite dei test è PG 18 (`server_version_num` 180003, verificato) e il server delle race test può essere 15 o 16. La migrazione deve funzionare ovunque: revocare `maintain` in un blocco condizionale su `server_version_num >= 170000`.
- **Non** usare `FORCE ROW LEVEL SECURITY` su `profiles`: `current_couple_id()` è definer e legge `profiles` come owner. Con FORCE sarebbe soggetta alla policy che la chiama, cioè ricorsione o null. `couple_invites` può restare senza FORCE: nessun ruolo client ha grant.
- Nessuna modifica alle policy Storage: `<couple_id>/` è già il confine e un membro nuovo eredita l'accesso alla cartella della propria coppia.

---

## 7. Threat model

| ID | Minaccia | Vettore | Mitigazione | Test |
|---|---|---|---|---|
| T1 | Scegliere un `couple_id` arbitrario (brief 13) | INSERT/UPDATE diretto su `profiles`; parametro RPC | Nessuna policy INSERT, grant INSERT revocato (§6.2), UPDATE solo su `avatar_path` (F1C), nessuna RPC accetta `couple_id` | DB-07, DB-08 |
| T2 | Enumerare coppie o inviti (brief 14) | SELECT su `couples`/`profiles`/`couple_invites`; oracle negli errori; id sequenziali | RLS solo propria coppia; `couple_invites` senza grant; UUID v4; codice a 128 bit; **errore unico** `invite_invalid`; `get_couple_membership` limitato al chiamante | DB-09, DB-10 |
| T3 | Indovinare o forzare un codice | brute force via PostgREST | 2^128 combinazioni; formato validato prima del lookup; scadenza 48 h; rotazione | DB-11 (formato/entropia), statico |
| T4 | Codice trapelato usato da terzi | screenshot o messaggio inoltrato | Monouso, 48 h, revoca, rotazione. Il terzo deve **anche** avere un account US: con signup spento solo account creati da Francesco (D1, D2). Il terzo entra solo in una coppia con 1 membro | DB-04, DB-05 |
| T5 | Terzo membro / doppia accettazione (brief 8, 10) | due accept concorrenti | Lock riga invito + count = 1 + indice unico `(couple_id, role)` come ultima difesa | RACE-01, RACE-02 |
| T6 | Utente già in coppia che entra in un'altra (brief 11) | accept da membro | PK `profiles.id` + controllo esplicito → `already_in_couple` | DB-12 |
| T7 | Invito di un'altra coppia (brief 12) | membro di A usa il codice di B | Stesso esito di T6: nessuna coppia ha più di un membro per account; il codice non rivela la coppia | DB-13 |
| T8 | Profilo esistente sovrascritto o cancellato (bug storico di `claim_us_role`) | upsert sul profilo | Le RPC fanno solo `insert`, mai `on conflict do update`, mai `delete` | DB-14 |
| T9 | Account anonimo / legacy / non confermato | 8 anonimi **con sessioni vive** (§1.7), account email orfano | `mc2_require_account`: non anonimo **e** email non nulla **e** email confermata **e** non bannato, letti da `auth.users`, mai dai metadata. L'orfano confermato è idoneo per scelta (D4): può solo creare o entrare in una coppia isolata | DB-15, DB-23 |
| T10 | Creator escalation: revocare o ruotare l'invito di un'altra coppia | RPC senza parametri | Le RPC operano solo sulla coppia del chiamante via actor | DB-16 |
| T11 | Lettura dei dati di A da B (isolamento) | REST, Storage, Realtime, Edge | RLS e Storage invariati, basati su `current_couple_id()`. Matrice di isolamento | ISO-01…ISO-06 |
| T12 | Notifiche consegnate alla coppia sbagliata | token registrati prima del join | Nessuna registrazione possibile senza coppia; membership immutabile in MC2 | NOTIF-01, NOTIF-02 |
| T13 | Funzione nuova eseguibile da `anon` (SEC-08) | default privileges | `revoke … from public, anon` + post-check nella migrazione + test F1B | DB-17 |
| T14 | Search-path hijack nei definer | oggetti con lo stesso nome | `search_path = ''`, nomi qualificati | statico |
| T15 | DoS logico: rotazioni infinite, coppie vuote | spam di RPC | Ogni effetto resta confinato al proprio account o coppia. 1 coppia per account. Con signup spento gli account sono limitati | — |
| T16 | Metadata cross-tenant via Realtime DELETE | Supabase non applica RLS agli eventi DELETE (vecchio record solo PK) | Fuori MC2, segnalato (D6). Nessun contenuto, solo PK e tempistica | — |
| T17 | Codice in log o analytics | il client logga la risposta | Contratto: il client non persiste né logga `code`. Lato server il codice non è mai scritto | revisione UI futura |
| T18 | Web Push spostata su un'altra coppia (SEC-13) | endpoint segreto | Già accettato (richiede l'endpoint segreto). Invariato | — |

---

## 8. Race condition

| # | Scenario | Esito garantito |
|---|---|---|
| R1 | Due utenti diversi accettano lo stesso codice in contemporanea | Il secondo attende il `FOR UPDATE` e rilegge la riga con `used_at` valorizzato, quindi `invite_invalid`. Uno solo entra |
| R2 | Stesso utente, doppio tap su accept | Serializzato dall'advisory lock; il secondo vede il profilo e `used_by = uid`, quindi `already_joined` |
| R3 | Stesso utente: `create_couple` e `accept` in parallelo | Stesso advisory lock: il secondo trova il profilo, quindi `already_member` / `already_in_couple` |
| R4 | Accept mentre il creatore ruota il codice | Lock della stessa riga invito: se vince accept, la rotazione (dopo il lock) vede lo slot occupato e dà `couple_full`; se vince la rotazione, accept rilegge un `code_hash` diverso, quindi `invite_invalid` |
| R5 | Accept mentre il creatore revoca | Come R4: ordine deterministico; nessuno stato "usato e revocato" (CHECK `used_xor_revoked`) |
| R6 | Due `create_couple` paralleli dello stesso utente | Advisory lock; una sola coppia. Senza lock (difesa) il PK di `profiles` farebbe rollback dell'intera transazione, incluso l'insert in `couples` |
| R7 | Due `create_partner_invite` paralleli | Serializzati; vale l'ultimo codice |
| R8 | Account del creatore cancellato durante l'accept | Il count deve essere 1, altrimenti `invite_invalid` |
| R9 | Deadlock | Ordine unico user-lock → invite-row in ogni RPC; nessun lock su `couples`. Un `40P01` è comunque fail-closed (rollback) |

Il lock sul profilo dell'actor (`FOR SHARE` in `m11a_actor_locked`) è compatibile con l'ordine: viene preso dopo l'advisory lock e prima della riga invito.

---

## 9. Strategia di idempotenza

| RPC | Semantica al retry |
|---|---|
| `create_couple` | **Idempotente per stato**: `already_member` con la stessa coppia, nessuna scrittura |
| `create_partner_invite` | **Non idempotente, volutamente**: ogni chiamata ruota il codice. Sicuro: il codice perso diventa inutile |
| `revoke_partner_invite` | Idempotente (`revoked:false` al secondo colpo) |
| `accept_partner_invite` | Idempotente per lo stesso utente e lo stesso codice (`already_joined`). Per chiunque altro, errore generico |
| `get_couple_membership` | Sola lettura |

Il client deve trattare ogni errore di rete come "stato sconosciuto" e risolverlo con `get_couple_membership()`, mai ripetendo alla cieca le mutazioni non idempotenti.

---

## 10. Piano di migrazione forward-only

**File unico:** `supabase/migrations/<YYYYMMDDHHMMSS>_mc2_couple_invites.sql`, con versione **> `20261007160744`** (ultima su `main`), creato con la Supabase CLI (`AGENTS.md` §Supabase). `supabase/baseline/*` **non** si tocca (è generato), `supabase/migrations_history/` neppure.

Struttura (stile `20261004150000_sec_rls_hardening.sql` / `20261006200000_native_notifications_v1.sql`):

1. **`do $mc2_pre$` (fail-closed, abort se uno qualsiasi fallisce):**
   - `couple_invites` ha esattamente le 7 colonne baseline e i vincoli `couple_invites_code_hash_key`, `couple_invites_couple_id_role_key`, `couple_invites_role_check`;
   - **ogni** riga esistente di `couple_invites` ha `used_at IS NOT NULL`;
   - `profiles_one_role_per_couple` esiste ed è unique; `profiles_role_check` ammette solo i 2 slot;
   - 0 righe `profiles` con `couple_id IS NULL`;
   - nessuna coppia con più di 2 profili;
   - nessuna delle 5 funzioni pubbliche esiste già (collisione nomi);
   - `extensions.gen_random_bytes(int)` ed `extensions.digest(text,text)` esistono;
   - nessuna policy INSERT/DELETE su `profiles` per ruoli client.
2. **Schema `couple_invites`** (§3.2) + commenti.
3. **Helper privati** + revoke.
4. **5 RPC** + commenti + revoke/grant.
5. **Revoke su `profiles`** (§6.2).
6. **`do $mc2_post$`**: ACL delle 5 RPC (`anon` no, `authenticated` sì, `PUBLIC` no); helper privati non eseguibili da `anon`/`authenticated`; `has_table_privilege('authenticated','public.profiles','INSERT'/'DELETE')` falso; nessun grant client su `couple_invites`; vincoli nuovi presenti e validati; `search_path` delle 5 funzioni = `''`; `prosecdef` vero.

Rieseguibile senza effetti (`if not exists`, `drop constraint if exists`, `create or replace`).

**Rollout in produzione (lo esegue solo Francesco, non questa missione):**
1. Eseguire `MC2_PREFLIGHT_READONLY.sql` e salvare il JSON nel branch.
2. `supabase migration list --linked` e `supabase db push --dry-run --linked`. Attenzione al drift q10: `20261006200000` risulterà pendente. La sua gestione è una decisione separata di Francesco, fuori da MC2; la migrazione MC2 va applicata da sola, senza riapplicare `20261006200000`.
3. Applicare la migrazione.
4. Rieseguire il pack (q04-q06 e q09 mostrano il nuovo stato).
5. Verifica funzionale con **due account creati in modo controllato da Francesco** (la missione non crea utenti): create → invite → accept → isolamento. Una coppia solo di test va poi cancellata (§11.2); la beta couple reale resta.

La migrazione **non** tocca utenti legacy, sessioni o Storage (D4).

---

## 11. Rollback

### 11.1 Kill switch (preferito, istantaneo, nessuna perdita dati)

Una migrazione forward pronta nel repo ma **non** in `supabase/migrations/`, ad esempio `docs/mc2/MC2_KILL_SWITCH.sql`:

```sql
revoke execute on function public.create_couple(text, date, text),
  public.create_partner_invite(), public.revoke_partner_invite(),
  public.accept_partner_invite(text, text) from authenticated;
update public.couple_invites set revoked_at = now()
  where used_at is null and revoked_at is null;  -- invalida i codici PENDING
```

La Coppia A non è toccata (i suoi inviti sono USED). Le coppie già create restano isolate e funzionanti.

### 11.2 Rimozione di una coppia di test o di B (solo Francesco, irreversibile)

`delete from public.couples where id = '<B>'` (cascade su `profiles`, inviti e tutte le tabelle tenant), poi rimozione degli oggetti Storage `us-media/<B>/…` e degli `auth.users` di B. Un pre-check obbligatorio verifica che `<B>` non sia la coppia di Francesco e Beatrice.

### 11.3 Rollback di schema completo (sconsigliato)

Migrazione forward: `drop function` delle 5 RPC e degli helper, poi `drop constraint` / `drop column` delle 3 colonne di `couple_invites`. Il revoke su `profiles` **non** va annullato (è hardening). Le colonne aggiunte sono innocue anche se lasciate.

---

## 12. Test matrix

Harness: `scripts/supabase-baseline/rebuild.cjs` `newDb()` + **tutte** le migrazioni reali (pattern `tests/native-notifications-v1-db.test.js:44-66`, helper `as(db, uid, sql)`). Per le race: server PostgreSQL reale, `tests/helpers/game-v2-pg.js`, con skip motivato se non disponibile (pattern `tests/m12b-4-daily-question-keepsakes-race.test.js`). Seed: Coppia A (F, B), utenti senza profilo U1-U4, un anonimo, un account non confermato, un account bannato.

### 12.1 DB (PGlite, `tests/mc2-couple-invites-db.test.js`)

| ID | Caso | Atteso |
|---|---|---|
| DB-01 | U1 `create_couple` | `created`; profilo slot `francesco`; coppia con `started_on`/`name` passati |
| DB-02 | U1 `create_couple` di nuovo | `already_member`, stessa coppia, 0 righe nuove |
| DB-03 | U1 `create_partner_invite` → U2 `accept` | `joined`; U2 slot `beatrice`; invito USED; U1 e U2 si vedono via RLS |
| DB-04 | Riuso del codice da U3 dopo DB-03 | `invite_invalid` |
| DB-05 | Codice scaduto (`expires_at` forzato nel passato), codice revocato, codice ruotato (vecchio) | `invite_invalid` per tutti e 3 |
| DB-06 | U2 `accept` di nuovo con lo stesso codice | `already_joined` |
| DB-07 | Client `insert into profiles(... couple_id=A ...)` come U3 | `42501` (privilegio) |
| DB-08 | Client `update profiles set couple_id`/`role` | `42501` (regressione F1C) |
| DB-09 | Client `select * from couple_invites` / `couples` di altri / `profiles` di altri | `42501` / 0 righe / 0 righe |
| DB-10 | Codice malformato, inesistente, scaduto, usato, coppia piena: messaggio d'errore | identico (`invite_invalid`) |
| DB-11 | Formato del codice: 26 caratteri Base32; 1000 codici generati tutti diversi; hash 64 hex; in tabella **nessun** valore uguale al codice in chiaro | ok |
| DB-12 | F (Coppia A) usa un codice valido di un'altra coppia | `already_in_couple`; invito ancora PENDING |
| DB-13 | Membro di B usa il codice della coppia C | `already_in_couple` |
| DB-14 | Nessun percorso RPC modifica o cancella un profilo esistente (diff di `profiles` prima e dopo ogni caso d'errore) | invariato |
| DB-15 | Anonimo, non confermato, bannato, `auth.uid()` nullo → ogni RPC di scrittura | `account_not_eligible` / `authentication_required` |
| DB-16 | Coppia A: `create_partner_invite` | `couple_full`; `revoke_partner_invite` → `revoked:false`; inviti legacy invariati |
| DB-17 | ACL: le 5 RPC sono `authenticated` sì, `anon` no, `PUBLIC` no; `private.mc2_*` non eseguibili dai client; `prosecdef`, `proconfig = {search_path=""}` | ok |
| DB-18 | Precondizioni: la migrazione **abortisce** con un invito legacy non usato, un profilo con `couple_id` NULL, una coppia con 3 profili (forzati come superuser), una funzione con lo stesso nome | abort, nulla applicato |
| DB-19 | Riapplicazione della migrazione | nessun errore, nessun cambiamento |
| DB-20 | Coppia con 0 membri (creatore cancellato) + codice PENDING | `invite_invalid` |
| DB-21 | `get_couple_membership` per non-membro, membro con invito pending, membro di coppia piena | shape corretta, mai `code`/`code_hash`/id invito |
| DB-22 | Profilo con `couple_id` NULL forzato (superuser) → create/accept | `profile_state_unsupported` |
| DB-23 | Utente anonimo legacy **con sessione** (`is_anonymous = true`, `email` NULL) → le 4 RPC di scrittura e `get_couple_membership`. Varianti: anonimo con `email` valorizzata e confermata; `raw_user_meta_data.is_anonymous = false` falsificato | sempre `account_not_eligible` (per la lettura: `{"member":false}`), nessuna riga scritta |
| DB-24 | **Hardening grant `profiles`, fail-closed:** dopo la migrazione `has_table_privilege` è falso per `anon`/`authenticated` su INSERT, DELETE, TRUNCATE (MAINTAIN se PG ≥ 17). Poi, come superuser, si crea una policy **permissiva** `for all to authenticated using (true) with check (true)` su `profiles`: insert con `couple_id` di A, delete del profilo di F e `truncate` come client falliscono **comunque** con `42501`. SELECT e UPDATE(`avatar_path`) restano funzionanti | ok |
| DB-25 | Account email confermato senza profilo (forma dell'orfano reale, con sessione) → `create_couple` | `created`, coppia isolata; la Coppia A non vede nulla (riusa ISO-01) |

### 12.2 Race (PostgreSQL reale, `tests/mc2-couple-invites-race.test.js`)

| ID | Caso | Atteso |
|---|---|---|
| RACE-01 | U2 e U3 `accept` dello stesso codice, sessione 1 in attesa sul lock | 1 `joined`, 1 `invite_invalid`, 2 profili nella coppia |
| RACE-02 | Due codici diversi forzati per lo stesso slot (stato impossibile simulato come superuser) | indice unico → 1 solo ingresso |
| RACE-03 | `accept` contro `create_partner_invite` (rotazione) in parallelo | nessuno stato "pending con slot occupato"; esito R4 |
| RACE-04 | `accept` contro `revoke` | esito R5; CHECK sempre rispettato |
| RACE-05 | Stesso utente: `create_couple` contro `accept` | un solo profilo |
| RACE-06 | Stesso utente: doppio `accept` | `joined` + `already_joined` |

### 12.3 Isolamento Coppia A / Coppia B (`tests/mc2-tenant-isolation.test.js`, PGlite + migrazioni reali)

Coppia B creata **via RPC MC2** (non con seed), poi:

| ID | Caso | Atteso |
|---|---|---|
| ISO-01 | Per **ogni** tabella `public` con grant SELECT client (lista ricavata dal catalogo, non hardcoded): ciascun membro di B vede 0 righe di A e viceversa | ok |
| ISO-02 | Per ogni tabella con policy INSERT: un membro di B che inserisce con `couple_id = A` | rifiutato |
| ISO-03 | Storage `us-media`: B non legge, scrive, aggiorna o cancella `A/...`; B scrive in `B/<uid>/...` | ok |
| ISO-04 | Smoke delle RPC client principali come B (`get_daily_state`, `get_progression_v1`, `get_game_v2_home`, `ensure_bond_week`, `get_or_create_daily_question`, `list_couple_questions`): nessun errore e nessuna riga con `couple_id = A` | ok |
| ISO-05 | Coppia con **un solo** membro (prima dell'accept): stesse RPC → funzionano o falliscono con un errore pulito, mai dati di A | ok |
| ISO-06 | Definer surface: nessuna RPC `authenticated` accetta un `couple_id` usato senza confronto con l'actor (test statico su `pg_proc` + lettura delle firme) | report |

### 12.4 Notifiche (punto 20)

| ID | Caso | Atteso |
|---|---|---|
| NOTIF-01 | Utente senza profilo: `register_native_push_device`, `register_web_push_subscription` | rifiutati (`couple membership required` / `Profile not linked`) |
| NOTIF-02 | Dopo l'accept: le registrazioni portano `couple_id` = B; il dispatcher (`notification-core.mjs`) con `coupleId = A` non include device di B | ok |

### 12.5 Regressione

`npm test` completo (base vs head nello stesso ambiente, numeri reali). In particolare `tests/f1b-rpc-grant-hardening.test.js`, `tests/sec-rls-hardening.test.js` (inventario dei definer: aggiornare solo dove pinna la superficie), `tests/multicouple-foundation-v1.test.js` (deve restare verde: niente `couple_members`), `tests/native-notifications-v1-db.test.js`, `tests/f2a2-ledger-reconciliation.test.js` (migrazioni forward), `tests/native-boot-auth-safety.test.js`. Poi `npm run build:cloudflare-pages` e `git diff --check`.

---

## 13. Acceptance criteria

1. Una sola migrazione forward, versione > `20261007160744`, con pre-check e post-check fail-closed. DB-18 e DB-19 verdi.
2. `couple_members` non esiste. `profiles.couple_id` resta l'unica autorità.
3. Le 5 RPC esistono con la firma esatta del §5, `SECURITY DEFINER`, `search_path=''`, ACL solo `authenticated`. Nessun parametro di tipo `couple_id`/`invite_id`/`user_id`/`role`.
4. `authenticated` e `anon` non hanno INSERT/DELETE/TRUNCATE su `profiles`. SELECT e UPDATE(`avatar_path`) invariati.
5. Il codice in chiaro non compare mai in tabelle, log o output, tranne il ritorno di `create_partner_invite`.
6. Tutti i test del §12 verdi. Le race verdi o skippate **con motivazione**, ed eseguite almeno una volta in un ambiente dove il server PostgreSQL è disponibile.
7. La Coppia A è invariata: profili, slot, coppia e inviti legacy identici prima e dopo (test dedicato con seed della forma reale). Nessun suo dato è leggibile da B (ISO-01…04).
8. Nessuna modifica a: `app.js`/UI, `settings*.js`, Edge Functions, `config.toml`, `supabase/baseline/*`, `migrations_history/`.
9. Suite completa: numeri reali base vs head; nessun nuovo fallimento.
10. La migrazione non legge né scrive `auth.sessions`, gli utenti legacy o `storage.objects` (D4). Gli anonimi con sessione restano esclusi dalle RPC (DB-23). Il revoke su `profiles` è provato fail-closed anche con una policy permissiva (DB-24).
11. Documenti aggiornati: `docs/missions/us-mc2-couple-invite-backend.md` (spec + report), `docs/DECISIONS.md` (decisioni MC2), `docs/ARCHITECTURE.md` (riga "Membership / inviti").

---

## 14. File del repository previsti

| File | Azione |
|---|---|
| `supabase/migrations/<ts>_mc2_couple_invites.sql` | **nuovo** |
| `tests/mc2-couple-invites-db.test.js` | **nuovo** |
| `tests/mc2-couple-invites-race.test.js` | **nuovo** |
| `tests/mc2-tenant-isolation.test.js` | **nuovo** |
| `docs/missions/us-mc2-couple-invite-backend.md` | **nuovo** (spec + report finale) |
| `docs/mc2/MC2_PREFLIGHT_READONLY.sql` | **nuovo** (copia del pack di questa cartella, versionato) |
| `docs/mc2/MC2_KILL_SWITCH.sql` | **nuovo** (fuori da `supabase/migrations/`) |
| `docs/mc2/MC2_ROLLOUT.md` | **nuovo** (passi §10/§11 per Francesco) |
| `docs/DECISIONS.md`, `docs/ARCHITECTURE.md` | aggiornati |
| `tests/sec-rls-hardening.test.js`, `tests/f1b-rpc-grant-hardening.test.js` | **solo se** pinnano la superficie dei definer e falliscono per le 5 RPC nuove; nessun allentamento delle asserzioni esistenti |
| `docs/CURRENT_STATE.md` | solo dopo il merge (non nel branch) |

**Non toccare:** `app.js`, `index.html`, `settings.js`, `settings.css`, `settings2.css`, `auth-first-run.js`, `supabase/functions/**`, `supabase/config.toml`, `supabase/baseline/**`, `supabase/migrations_history/**`, migrazioni esistenti, `android/`, `ios/`.

---

## 15. Fuori scope esplicito

- UI di onboarding (crea coppia, mostra o condividi codice, inserisci codice, "in attesa del partner").
- Signup pubblico, captcha, conferma email self-service, recupero password, leaked-password protection (SEC-16).
- Lascia/cambia coppia, rimozione del partner, cancellazione account self-service, trasferimento dati.
- Pulizia Auth legacy (D4): revoca sessioni degli 8 anonimi, remediation dei 28 oggetti Storage, eventuale delete dell'orfano. Missione separata.
- Normalizzazione `francesco|beatrice` (constraint, colonne nominali, 17 funzioni).
- Rimozione dei nomi "Francesco/Bea" hardcoded: `app.js:988, 1787, 2103, 2286, 2427, 2448, 2774, 3756`, `games.js:23`, `home-cleanup.js:11`, `widget-hub.js:45`, marker F/B in `calendar.js:34-50`, `private.game_v2_render`/`game_v2_role_label` (`30_functions.sql:1077-1095`), `ROLE_LABEL` in `supabase/functions/_shared/game-v2-push-core.mjs:35`.
- Settings V2.
- `couple_members`.
- Toglimento del default `couples.started_on = '2026-04-21'` (consigliato come micro-follow-up).
- Filtro per `couple_id` anche sul ramo Web Push del dispatcher (servirà quando la membership diventerà mutabile).
- Realtime DELETE (T16), SEC-05/SEC-08 su tabelle diverse da `profiles`.
- Notifica "il partner si è unito": eventuale `event_type` futuro via `notification-core`.
- Qualsiasi azione in produzione, deploy, creazione di utenti.

---

## 16. Rischi e decisioni umane richieste

| ID | Decisione | Raccomandazione | Perché |
|---|---|---|---|
| **D1** | Come nascono gli account della seconda coppia | **APPROVATO (2026-10-07):** signup resta disabilitato; account creati in modo controllato; signup pubblico fuori scope | Riduce T4/T9/T15 a un insieme di account noti |
| **D2** | Invito al portatore o legato a un'email | **APPROVATO:** bearer invite non legato all'email; token a 128 bit, solo SHA-256 nel DB, monouso, non enumerabile (§4.1) | Con signup spento chi può accettare è già limitato. Lo schema resta pronto per un futuro `invitee_email_hash` |
| **D3** | Durata dell'invito | **APPROVATO:** 48 ore, costante server | Meno esposizione; rigenerare costa un tap |
| **D4** | Utenti legacy (8 anonimi, 1 email orfano) | **MODIFICATO:** **non** cancellarli ora. La pulizia Auth è una missione separata, in quest'ordine: revoca sessioni → remediation dell'ownership dei 28 oggetti Storage → verifica → delete. L'account email orfano si elimina solo dopo aver verificato che non serva alla beta couple | MC2 deve essere sicura **con** questi utenti presenti: gate di idoneità (DB-23), nessuna precondizione sulla loro assenza, nessuna RPC che li tocchi |
| **D5** | Lancio reale della Coppia B | **APERTO (fuori MC2, non blocca l'implementazione).** Raccomandazione: non lanciare la Coppia B prima di una missione UI che sostituisca i nomi hardcoded per slot (§15) e aggiunga l'onboarding | Non è un problema di sicurezza, ma la Coppia B vedrebbe "Francesco/Bea" e domande Game V2 con quei nomi |
| **D6** | Realtime DELETE cross-tenant (solo PK + tempistica) | **APERTO (fuori MC2).** Raccomandazione: accettarlo in MC2 e aprire un follow-up | Nessun contenuto esposto; la correzione tocca il client realtime, fuori scope |
| R1 | Stato di produzione diverso dal repo | **Chiuso per i punti di §1.7** (pack del 2026-10-07). q10 noto: Native Notifications applicata ma assente dal ledger, drift che MC2 non ripara. Resta aperta solo la deriva tra pack e rollout | La migrazione abortisce comunque se le precondizioni non tengono al momento dell'applicazione |
| R2 | Le race non sono eseguibili in PGlite | Server PG reale (harness esistente) | Se la sessione cloud non ha `postgres`, la race va eseguita altrove prima della review |
| R3 | Funzioni esistenti che assumono 2 membri (coppia "a metà" prima dell'accept) | ISO-05 ne fa l'inventario; nessun rischio cross-tenant, solo errori funzionali | Esempi: `send_think` → `think_partner_missing` (`30_functions.sql:4300`) |

---

## Appendice A — verifica del pack

`MC2_PREFLIGHT_READONLY.sql` è stato eseguito senza errori su un PGlite ricostruito da tutte le migrazioni di `4dcfa45`. Lo stub di piattaforma è stato completato con `auth.users.banned_until`, `auth.sessions` e `supabase_migrations.schema_migrations`, che esistono su Supabase reale. Quella esecuzione prova solo la sintassi e i nomi del catalogo. Il 2026-10-07 Francesco ha eseguito il pack in produzione (read-only); i valori sono in §1.7.

## Appendice B — `MC2_PREFLIGHT_READONLY.sql` (testo integrale)

```sql
-- MC2 — Couple Creation + Invite Backend: production PREFLIGHT (READ-ONLY)
-- Base repo: origin/main 4dcfa4580e0d43789325271291647e948ca21dd6
--
-- Run by Francesco only (Supabase SQL editor / connector). Every statement is a
-- SELECT inside a READ ONLY transaction that is rolled back. No secrets, no
-- invite hashes, no emails are returned: counts and catalog facts only.
-- Save the output as JSON next to MC2_BLUEPRINT.md (or in the MC2 branch).

begin transaction read only;

-- q01 couple_invites: shape and state (no code_hash values)
select 'q01_columns' as q, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'couple_invites'
order by ordinal_position;

select 'q01_constraints' as q, conname, pg_get_constraintdef(oid) as def
from pg_constraint where conrelid = 'public.couple_invites'::regclass order by conname;

select 'q01_states' as q,
  count(*) as total,
  count(*) filter (where used_at is not null) as used,
  count(*) filter (where used_at is null) as unused,
  count(*) filter (where used_by is null and used_at is not null) as used_by_deleted,
  count(distinct couple_id) as couples_with_invites,
  count(*) filter (where code_hash !~ '^[0-9a-f]{64}$') as non_sha256_hex_hashes
from public.couple_invites;

-- q02 profiles / couples invariants
select 'q02_profiles' as q,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.profiles where couple_id is null) as profiles_without_couple,
  (select count(*) from public.couples) as couples,
  (select count(*) from (select couple_id from public.profiles where couple_id is not null
     group by couple_id having count(*) > 2) x) as couples_over_two,
  (select count(*) from (select couple_id from public.profiles where couple_id is not null
     group by couple_id having count(*) = 1) x) as couples_with_one_member,
  (select count(*) from public.couples c where not exists
     (select 1 from public.profiles p where p.couple_id = c.id)) as couples_without_members;

select 'q02_roles' as q, role, count(*) from public.profiles group by role order by role;

select 'q02_index' as q, indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename = 'profiles' order by indexname;

select 'q02_profile_constraints' as q, conname, pg_get_constraintdef(oid) as def
from pg_constraint where conrelid = 'public.profiles'::regclass order by conname;

select 'q02_couples_defaults' as q, column_name, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'couples' order by ordinal_position;

-- q03 auth account classes (counts only) — decision D4
select 'q03_auth_classes' as q,
  count(*) as auth_users,
  count(*) filter (where coalesce(u.is_anonymous, false)) as anonymous,
  count(*) filter (where not coalesce(u.is_anonymous, false) and p.id is null) as non_anonymous_without_profile,
  count(*) filter (where not coalesce(u.is_anonymous, false) and u.email_confirmed_at is null) as unconfirmed_non_anonymous,
  count(*) filter (where u.banned_until is not null and u.banned_until > now()) as banned
from auth.users u left join public.profiles p on p.id = u.id;

select 'q03_live_sessions_without_profile' as q,
  count(distinct s.user_id) as users_with_sessions_without_profile
from auth.sessions s left join public.profiles p on p.id = s.user_id
where p.id is null;

-- q04 table ACLs on the membership tables
select 'q04_table_acl' as q, table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('profiles', 'couples', 'couple_invites')
  and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
group by table_name, grantee order by table_name, grantee;

select 'q04_column_acl' as q, table_name, column_name, grantee, privilege_type
from information_schema.role_column_grants
where table_schema = 'public' and table_name in ('profiles', 'couples', 'couple_invites')
  and grantee in ('anon', 'authenticated')
  and privilege_type in ('UPDATE', 'INSERT')
order by table_name, column_name, grantee;

-- q05 RLS flags and policies on the membership tables
select 'q05_rls' as q, c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as force_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('profiles', 'couples', 'couple_invites');

select 'q05_policies' as q, tablename, policyname, cmd, roles::text, qual, with_check
from pg_policies where schemaname = 'public' and tablename in ('profiles', 'couples', 'couple_invites')
order by tablename, policyname;

-- q06 name collisions with the planned MC2 functions
select 'q06_collisions' as q, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'public' and p.proname in ('create_couple', 'create_partner_invite', 'revoke_partner_invite',
        'accept_partner_invite', 'get_couple_membership'))
   or (n.nspname = 'private' and p.proname like 'mc2\_%');

-- q07 crypto helpers available to a search_path='' definer
select 'q07_pgcrypto' as q, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.proname in ('gen_random_bytes', 'digest') order by 2, 3, 4;
select 'q07_ext' as q, extname, extversion, extnamespace::regnamespace from pg_extension
where extname in ('pgcrypto', 'uuid-ossp');

-- q08 migration ledger tail (MC2 version must be newer)
select 'q08_ledger' as q, version, name
from supabase_migrations.schema_migrations order by version desc limit 10;

-- q09 tenant resolver and actor helpers unchanged
select 'q09_resolvers' as q, n.nspname, p.proname, p.prosecdef, p.proconfig::text, md5(p.prosrc) as body_md5
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private' and p.proname in ('current_couple_id', 'm11a_actor', 'm11a_actor_locked');

select 'q09_claim_us_role_acl' as q, p.proacl::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'claim_us_role';

-- q10 Native Notifications V1 applied? (point 20)
select 'q10_device_push_tokens' as q, column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'device_push_tokens'
  and column_name in ('installation_id', 'provider', 'apns_environment', 'token_updated_at', 'couple_id');
select 'q10_native_rpcs' as q, p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('register_native_push_device', 'unregister_native_push_device',
  'register_web_push_subscription', 'register_push_token');
select 'q10_push_rows' as q,
  (select count(*) from public.push_subscriptions) as web_push_rows,
  (select count(*) from public.push_subscriptions s join public.profiles p on p.id = s.user_id
     where s.couple_id is distinct from p.couple_id) as web_push_couple_mismatch,
  (select count(*) from public.device_push_tokens) as native_rows,
  (select count(*) from public.device_push_tokens d join public.profiles p on p.id = d.user_id
     where d.couple_id is distinct from p.couple_id) as native_couple_mismatch;

-- q11 storage policies on us-media (tenant boundary must stay current_couple_id())
select 'q11_storage_policies' as q, policyname, cmd, roles::text, qual, with_check
from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname;
select 'q11_media_outside_couple_folder' as q, count(*) as objects_outside
from storage.objects o
where o.bucket_id = 'us-media'
  and not exists (select 1 from public.couples c where (storage.foldername(o.name))[1] = c.id::text);

-- q12 hidden triggers on auth.users / membership tables
select 'q12_triggers' as q, event_object_schema, event_object_table, trigger_name, action_statement
from information_schema.triggers
where (event_object_schema = 'auth' and event_object_table = 'users')
   or (event_object_schema = 'public' and event_object_table in ('profiles', 'couples', 'couple_invites'))
order by 2, 3, 4;

-- q13 default privileges for new functions in public (SEC-08)
select 'q13_default_acl' as q, defaclrole::regrole, defaclnamespace::regnamespace, defaclobjtype, defaclacl::text
from pg_default_acl where defaclnamespace = 'public'::regnamespace;

-- q14 realtime publication (point 20 / T16)
select 'q14_realtime' as q, schemaname, tablename from pg_publication_tables
where pubname = 'supabase_realtime' order by tablename;

-- q15 server version (MAINTAIN privilege exists only from PG17)
select 'q15_version' as q, current_setting('server_version_num') as server_version_num;

rollback;

-- Not coverable by SQL (check separately, read-only):
--   * Auth settings: GET https://iiakdfsxpywdkxravqjh.supabase.co/auth/v1/settings with the publishable key
--     -> expect disable_signup=true, anonymous_users=false (decision D1).
```
