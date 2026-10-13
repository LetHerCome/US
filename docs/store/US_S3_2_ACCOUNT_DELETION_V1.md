# US 1.0 — Eliminazione account v1 (S3.2)

**Data:** 2026-10-13 · **Branch:** `mission/us-store-s3-2-lifecycle-design-20261012` (PR #190) · **Stato:** implementato e testato in locale/CI; **non applicato** a staging né a produzione.

Questa è la prima implementazione eseguibile del piano consolidato `docs/store/US_S3_2_ACCOUNT_DELETION_PLAN_2026-10-13.md` (branch della roadmap). Il piano resta il riferimento per le estensioni post-1.0; qui sono descritte solo le scelte effettivamente implementate.

## 1. Cosa fa

| Caso | Risultato |
|---|---|
| Un membro elimina l'account, il partner resta | Dati personali di chi esce cancellati. Il contenuto condiviso che ha creato resta al partner **senza autore** (Policy A, approvata dal fondatore). Lo spazio di coppia viene chiuso: nessuno può più entrarci. |
| L'ultimo membro elimina l'account | Viene cancellato l'intero spazio di coppia, compresi i ricordi lasciati da chi era uscito prima, e tutti i media sotto `<coppia>/`. |
| Utente senza coppia | Vengono cancellati solo i suoi dati. |
| Qualsiasi altro percorso (dashboard, `DELETE` diretto, cascata) | **Fallisce** senza cambiare nulla: le FK del contenuto condiviso sono `NO ACTION`. |

**Cancellati sempre:** profilo e avatar, risposte giornaliere, umore, risposte quiz, posizione, preferenze notifiche, dispositivi e token push/widget, storie, appuntamenti personali, attività registrate, promemoria, "lasciati per te" che il partner non ha conservato, messaggi programmati non ancora consegnati, i Conservati fatti da chi esce.

**Restano al partner, anonimi:** Momenti e foto, messaggi consegnati (in entrambe le direzioni), voci condivise del calendario, eventi e loro completamenti, desideri, "lasciati per te" conservati dal partner, keepsake e storia di coppia per ruolo, XP. Il partner può cancellare Momenti, foto e voci di calendario rimasti senza autore (nuove policy RLS di sola DELETE/UPDATE sugli orfani).

## 2. Flusso

1. **Richiesta.** In app (Impostazioni → Privacy e dati → Elimina account) o dalla pagina pubblica `/elimina-account.html`. L'utente reinserisce la password e scrive `ELIMINA`.
2. **Edge `delete-account`** (`verify_jwt=true`). Inerte se `US_ACCOUNT_DELETION_ENABLED` non è `true` (503). Controlla origine, corpo, e che il JWT contenga un `amr` `password` di meno di 10 minuti. L'identità viene solo da `auth.getUser(jwt)`.
3. **Revoca sessioni:** `auth.admin.signOut(jwt,'global')`.
4. **Database, una transazione:** `public.s32_delete_account_data(uid, channel)` (solo `service_role`). Lock consultivo per utente e per coppia, così due cancellazioni contemporanee nella stessa coppia vengono serializzate: la seconda trova un solo membro e cancella l'intera coppia. Scrive la ricevuta in `private.account_deletions`.
5. **Storage via API:** elenca `<coppia>/<utente>/` (o `<coppia>/` se ultimo membro), rimuove tutto tranne i path ancora referenziati dal contenuto conservato (`keep_paths`), ricontrolla l'elenco. Se fallisce, l'utente **non** viene cancellato da Auth, così un nuovo tentativo ritrova i file.
6. **Auth:** `auth.admin.deleteUser`. In caso di errore: ban permanente e stato registrato per l'operatore.
7. **Ricevuta:** `completed`. La ricevuta contiene solo uid, coppia, modalità, canale, stato, date e codice d'errore.

**Ripresa:** l'Edge `account-deletion-worker` (`verify_jwt=false`, chiave cron in Vault `us_account_deletion_cron_key`, inerte senza il flag) riprende le richieste rimaste in `db_done`/`storage_done`, dalla più vecchia; dopo 10 tentativi falliti la richiesta resta all'operatore. Nella stessa esecuzione cancella le ricevute completate da più di 12 mesi. La pianificazione cron va registrata solo dopo il collaudo su staging.

Risposte: 200 `deleted`; 202 `pending_cleanup` (dati già separati, pulizia da completare); 401 `reauth_required`; 503 `deletion_disabled`; 500 `deletion_failed` (nessuna modifica).

## 3. Sicurezza e isolamento

- Le tre RPC sono eseguibili solo da `service_role`; `anon` e `authenticated` non le possono chiamare e non leggono le ricevute (test).
- Un trigger su `profiles` impedisce di ricreare un profilo con l'uid cancellato (`account_deleted`) e di entrare in una coppia chiusa (`couple_closed`); un trigger su `couple_invites` impedisce nuovi inviti per una coppia chiusa. Valgono anche per un access token ancora valido fino alla scadenza.
- `get_couple_membership` restituisce al partner rimasto `partner_joined:true` e `partner_departed:true`: anche le app già installate lo tengono nell'app con l'archivio invece di mandarlo alla schermata "invita la tua persona".
- I log dell'Edge contengono solo nomi dei passi e codici d'errore.

## 4. Test

| Test | Cosa prova |
|---|---|
| `tests/s32-account-deletion-db.test.js` | Schema reale in PGlite, due coppie sintetiche: Policy A riga per riga; nessuna riga pubblica cita più l'utente (eccetto i path dei media conservati); righe del partner invariate; altra coppia identica bit per bit; ogni altro percorso di cancellazione fallisce; partner nell'app e coppia chiusa; account cancellato senza accesso; ultimo membro; idempotenza e macchina a stati; permessi |
| `tests/s32-fk-resolution.test.js` | Ognuna delle 37 FK verso `auth.users`/`profiles` ha un esito dichiarato; una FK nuova non classificata fa fallire la CI |
| `tests/s32-account-deletion-core.test.mjs` | Orchestrazione Edge con client finti: flag, origine, corpo, `amr`, ordine dei passi, `keep_paths` mai rimossi, path fuori prefisso rifiutati, ripresa da ogni stato, log senza dati personali |
| `tests/s32-account-deletion-client.test.js` | Flusso in app e pagina pubblica |

## 5. Scelte prese per default (da ratificare in `docs/DECISIONS.md`)

Il fondatore ha approvato Policy A. Le altre voci del piano (D-1…D-19) non hanno ancora una risposta esplicita; sono state implementate così:

| Voce | Implementato |
|---|---|
| D-1/D-6 | Policy A senza scelta per chi esce: il contenuto condiviso resta sempre al partner. Più semplice e coerente con "l'eliminazione unilaterale non cancella la storia del partner" |
| D-3 | **Nessun periodo di grazia**: cancellazione immediata dopo password + `ELIMINA`. Elimina la necessità di bloccare ~40 funzioni durante la grazia. Completamento dichiarato "entro 30 giorni" per i casi `pending_cleanup` |
| D-4 | Nessuna push al partner; il client mostra già "La tua persona" quando manca il profilo. Etichetta "Account eliminato" nelle schede: rinviata |
| D-5 | Coppia chiusa per sempre; il partner rimasto non può invitare nessuno. Per un nuovo partner deve eliminare il proprio account. **Chiesta al fondatore come decisione separata** (13/10) |
| D-7 | Copia dei dati su richiesta via email entro 30 giorni, preparata dall'operatore. L'export in app (`export-my-data`) resta parziale e disattivato: non va presentato come export completo |
| D-13 | I Conservati del partner restano |
| D-15 | Messaggi programmati non consegnati cancellati |
| D-16 | Nessuna mappatura conservata: dopo la cancellazione non si può più risalire a cosa aveva creato chi è uscito |
| D-17 | Ricevuta minima cancellata 12 mesi dopo il completamento dal worker (valore da ratificare) |

## 6. Cosa manca prima della produzione

1. **Staging:** applicare la migrazione, distribuire `delete-account` con `US_ACCOUNT_DELETION_ENABLED=true` e `US_ALLOWED_ORIGINS` dell'anteprima, poi provare con **4 account sintetici dichiarati usa-e-getta** (mai gli account del collaudo push): uscita di un membro, ultimo membro, partner che vede l'archivio, Storage ripulito. Verifica P-1: `deleteUser` riesce anche se restano oggetti posseduti dall'utente (in caso contrario: azzerare `owner`/`owner_id` degli oggetti conservati prima di `deleteUser`). Nessun agente in questa sessione ha credenziali di staging.
2. **Indirizzo email di supporto/privacy e nome dello sviluppatore** come nella scheda Play (segnaposto nel codice).
3. **Revisione legale** di Policy A, informativa e pagina (D-10).
4. **Pulizia cache altrui:** URL firmate già emesse (6 h; 24 h per il widget) e cache media del service worker restano valide fino alla scadenza (residuo dichiarato).
5. Etichetta "Account eliminato" e banner per il partner.
6. Registrare il cron del worker e la chiave in Vault, dopo il collaudo su staging.
