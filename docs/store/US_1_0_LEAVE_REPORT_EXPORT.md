# US 1.0 — Esci dalla coppia, Segnala, copia dei dati

**Data:** 2026-10-14 · **Branch:** `claude/us-store-leave-report-export` (sopra la PR #190) · **Stato:** implementato e testato in locale/CI; **non applicato** a staging né a produzione.

**Fonte:** risposte del fondatore all'audit di prodotto del 14/10: decisione 3 ("Esci dalla coppia" nella 1.0: chiude lo spazio come l'eliminazione, tiene gli account), Segnala (blocco Play UGC per le app 1:1) e decisione 8 (copia dei dati su richiesta, inviata per email; il tasto in app viene dopo).

## 1. Esci dalla coppia

| Caso | Risultato |
|---|---|
| Un membro esce, il partner resta | Stesse regole dell'eliminazione (Policy A, D-5): i dati personali di chi esce in quella coppia vengono cancellati, il contenuto condiviso che ha creato resta al partner **senza autore**, lo spazio viene chiuso e nessuno può più entrarci. **L'account resta**: profilo cancellato, l'app riapre l'onboarding (nuovo spazio o invito). |
| L'ultimo membro esce | Viene cancellato l'intero spazio di coppia con tutti i media sotto `<coppia>/`. L'account resta. |
| Chi non è in una coppia | 409 `not_in_couple`, nessuna modifica. |

**Flusso:** Impostazioni → Voi → Esci dalla coppia (anche da Privacy e dati). Password + `ESCI`. Edge `leave-couple` (`verify_jwt=true`, inerte senza `US_LEAVE_COUPLE_ENABLED=true`, stessi controlli di origine e `amr` password < 10 minuti dell'eliminazione) → `public.s32_leave_couple(uid,'app')` in una transazione → Storage `<coppia>/<utente>/` tranne `keep_paths` (o `<coppia>/` se ultimo) → ricevuta `completed` in `private.couple_departures`. Nessun logout, nessun ban, nessuna cancellazione Auth.

**Codice condiviso:** la chiusura della membership è una sola funzione, `private.s32_close_membership`, usata sia dall'eliminazione account sia dall'uscita. Una modifica alle regole di Policy A vale per entrambe.

**Ripresa:** il worker `account-deletion-worker` riprende le uscite rimaste in `db_done`/`storage_done` (se `US_LEAVE_COUPLE_ENABLED=true`). Uscire e poi eliminare l'account funziona: l'eliminazione trova un utente senza coppia.

Risposte: 200 `left`; 202 `pending_cleanup`; 409 `not_in_couple`; 401 `reauth_required`; 503 `leave_disabled`; 500 `leave_failed` (nessuna modifica).

## 2. Segnala un problema o un contenuto

Impostazioni → App e supporto → Segnala un problema o un contenuto. Quattro motivi (contenuto offensivo, comportamento di una persona, sicurezza di un minore, problema dell'app) e un testo di massimo 2000 caratteri.

- `public.user_reports`: RLS forzata, nessuna policy, nessun privilegio per `anon`/`authenticated`. Si scrive solo con `public.submit_user_report(category, details)` (unica funzione nuova concessa ad `authenticated`). Il partner non può leggere le segnalazioni: nessun percorso lato client.
- Limite: 5 segnalazioni per utente ogni 24 ore (default da ratificare).
- Eliminando l'account la segnalazione resta senza autore (`reporter_id` a null); viene cancellata 12 mesi dopo l'invio (default da ratificare).
- Procedura del team: [`US_MODERATION_PROCEDURE.md`](US_MODERATION_PROCEDURE.md).

## 3. Copia dei dati su richiesta

L'utente scrive al supporto dall'email del suo account (testo in Privacy e dati, in Elimina account e in Esci dalla coppia). L'operatore prepara la copia con l'Edge `export-user-data`:

- `verify_jwt=false`, inerte senza `US_DATA_EXPORT_ENABLED=true`. Chiave operatore nell'header `x-us-operator-key`, confrontata con il segreto Vault `us_operator_key`.
- Corpo `{"email":"…"}`. `public.s32_export_user_data(uid)` (solo `service_role`) restituisce profilo, coppia, risposte di Oggi con il testo della domanda, umore, risposte ai giochi, impegni personali, posizione, preferenze notifiche e ciò che l'utente ha creato nello spazio di coppia. Gli id del partner sono tolti; quello che ha scritto il partner non è incluso.
- Un file JSON nel bucket privato `us-exports` (`<uid>/<data>.json`), con link firmati alle foto dell'utente (solo quelle nella sua cartella). Link e foto valgono 7 giorni; il worker cancella i file più vecchi di 7 giorni. L'eliminazione account cancella anche le copie già pronte.
- **Senza provider email** (oggi): la risposta contiene `download_url`, che l'operatore manda a mano all'utente. **Con provider**: `US_EMAIL_PROVIDER=resend`, `US_EMAIL_FROM`, `US_EMAIL_API_KEY` (e `US_SUPPORT_EMAIL`): l'email parte da sola, la risposta è `sent` senza link. Aggiungere un altro provider è un ramo in `supabase/functions/_shared/us-email.mjs`.
- Dalla dashboard Supabase: Edge Functions → `export-user-data` → Test, metodo POST, header `x-us-operator-key`, corpo con l'email. Nessun terminale.

## 4. Test

| Test | Cosa prova |
|---|---|
| `tests/s32-leave-couple-db.test.js` | Schema reale in PGlite: permessi; uscita con Policy A riga per riga, account tenuto, partner `partner_departed`, coppia chiusa, nuovo spazio isolato; Storage dopo l'uscita; ripresa e macchina a stati; ultimo membro; uscita poi eliminazione; worker; segnalazioni (scrittura sola, limite, retention); export (solo dati propri, nessun id del partner) |
| `tests/s32-account-deletion-db.test.js` | L'eliminazione resta identica dopo l'estrazione di `s32_close_membership` |
| `tests/s32-fk-resolution.test.js` | La nuova FK `user_reports.reporter_id` ha un esito dichiarato; l'unico grant client della migrazione è `submit_user_report` |
| `tests/s32-leave-export-core.test.mjs` | Edge con client finti: flag, origine, `ESCI`, `amr`, identità da `getUser`, prefissi coerenti con la modalità, ripresa; export: chiave operatore, foto fuori cartella mai firmate, batch, fallback manuale; adattatore email |
| `tests/s32-leave-report-client.test.js` | Flusso in app, messaggi, segnalazioni |

## 5. Cosa manca prima della produzione

1. **Staging:** applicare la migrazione `20261014120000_s32_leave_couple_reports_export.sql` (dopo quella della #190), distribuire `leave-couple` ed `export-user-data`, attivare i flag, provare con account sintetici usa-e-getta (mai gli account del collaudo push): uscita, ultimo membro, segnalazione, copia dei dati.
2. **Email di supporto:** `moonee.team@gmail.com` (fondatore, 14/10). Quando ci sarà il dominio: il provider email per l’invio automatico.
3. Segreto Vault `us_operator_key` (staging e produzione separati).
4. **BUILD_ID:** va alzato al riallineamento dopo la #189, insieme alla #190, così le app installate ricevono le nuove schermate.
5. Testi in inglese: li prepara il thread del design dai testi elencati nella PR.
