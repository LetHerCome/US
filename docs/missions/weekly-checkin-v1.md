# Mission — Check-in settimanale di coppia V1

**Status:** AUDIT FATTO il 22/10/2026 ([report](weekly-checkin-v1-audit.md)); prossimo passo: SQL in TDD su staging
**Branch:** `claude/payred-app-comparison-b2594e` (worktree di questa missione)
**Origine:** confronto con Paired 26.41.0 (APK analizzato il 22/10/2026), flusso `weekly-check-in.*`.

## Gate di governance (prima di tutto)

- **D5:** il founder ha concesso un'**eccezione esplicita** il 22/10/2026 ([DECISIONS](../DECISIONS.md)): la missione si fa adesso, prima della 1.0 Store. L'eccezione vale solo per questa missione.
- **D4:** gratis per entrambi. Niente paywall, prove o limiti a pagamento.
- **Product restraint (04/10):** nessuna nuova tab, niente XP, streak, valute o premi per aver fatto il check-in.
- SQL ed Edge **solo su staging** finché il founder non autorizza a parte la produzione. Merge e pubblicazione Store hanno ciascuno un proprio gate.

## Goal

Una volta a settimana i due rispondono, ciascuno per conto proprio, a quattro domande brevi: vicinanza, energia, apprezzamento, supporto. Le risposte restano sigillate finché non hanno risposto tutti e due. Poi diventano un esito condiviso: quanto vi sentite vicini, cosa avete apprezzato, cosa vi chiedete per la settimana che inizia.

## Perché è in linea con la vision

Il ciclo è `lascia → ricevi → rispondi → esito → eventuale Ricordo`:
- l'apprezzamento di A **arriva** a B come un fatto ricevuto, non come un punteggio;
- la richiesta di supporto di A resta visibile a B **per tutta la settimana**, e il check-in successivo chiede ad A se l'ha ricevuto: è una conseguenza reale e verificabile;
- l'apprezzamento si può **conservare** in Ricordi.
Nessuna percentuale di compatibilità e nessun voto alla coppia.

## Esperienza

### Settimana
- Una sola tornata per coppia per **settimana ISO Europe/Rome**, da lunedì a domenica (`private.bond_week_start_rome`).
- Si può rispondere in qualunque giorno della settimana. Quando arriva lunedì, la tornata precedente si chiude: se ha risposto uno solo, quella risposta resta sigillata e non viene mai mostrata all'altro (vedi Lifecycle).
- Ciascuno può modificare le proprie risposte **finché l'altro non ha risposto**. Dopo il reveal non si modificano più.

### I quattro passi
Un foglio a passi, aperto con le primitive di `ui-foundation` e sul layer di `navigation.js`, con back nativo.

1. **Vicinanza.** «Quanto ti sei sentito/a vicino/a a [nome] questa settimana?» Cursore a 5 livelli: *Lontani · Un po' distanti · A metà · Vicini · Vicinissimi*. Poi «Vuoi dire perché?», facoltativo, massimo 280 caratteri. Lo spunto sotto il campo cambia in base al livello scelto (lontano, a metà, vicino), come in Paired.
2. **Energia.** «Come stai di energia?» Cursore a 5 livelli e nota facoltativa (280). Riguarda la persona, non la coppia: aiuta l'altro a capire la settimana.
3. **Apprezzamento.** «Cosa ha fatto [nome] questa settimana che hai apprezzato?» Testo, massimo 500 caratteri. **Obbligatorio** per chiudere il check-in, perché è la parte che arriva all'altro. Sotto il campo, 3 o 4 spunti a rotazione.
4. **Supporto.**
   - Se la settimana scorsa l'altro ti aveva chiesto qualcosa: «La settimana scorsa ti aveva chiesto: “…”. Sei riuscito/a ad esserci?» Le risposte sono *Sì · In parte · Non ancora*. Questa domanda appare solo se quella richiesta esiste.
   - «Questa settimana ti aiuterebbe se [nome]…», facoltativo, massimo 280 caratteri.

Ogni passo ha *Salta* tranne l'apprezzamento. «Invia» sigilla il check-in.

### Attesa e reveal
- **Dopo il mio invio, con l'altro che non ha ancora risposto:** «Hai fatto il tuo check-in. Lo vedrete insieme quando risponde anche [nome].» Non si vede nessun dato dell'altro, nemmeno il livello di vicinanza.
- **Con l'altro che ha già risposto:** su Oggi compare la card priority «Tocca a te», categoria `waiting_for_me`.
- **Quando avete risposto tutti e due:** su Oggi compare «Risposte pronte» (`answers_ready`), con una notifica a entrambi.
- **Risultati:**
  - Vicinanza: i due livelli affiancati, con le note. Sotto c'è l'**andamento delle ultime 8 settimane**: due linee, nessuna media e nessun voto.
  - Energia: i due livelli, con le note.
  - Apprezzamento: «[nome] ha apprezzato…». Si può reagire riusando le reazioni esistenti (cuore, «piango») e si può **Conservare in Ricordi**.
  - Supporto: «Questa settimana [nome] ti chiede…». La richiesta resta visibile in Noi fino a domenica.
- **Se la vicinanza è «Lontani» per entrambi due settimane di fila:** una frase calma che invita a parlarne di persona. Niente diagnosi, niente AI, niente rimandi clinici automatici.

### Dove vive
- **Noi:** una riga «Il punto della settimana» con lo stato (da fare, in attesa, pronto) e, dopo il reveal, la richiesta di supporto dell'altro. Non è una nuova tab.
- **Oggi:** solo tramite la card priority esistente, con le regole di ordine e limite in vigore. Nessuna card fissa.
- Il nome «Il punto della settimana» è provvisorio (decisione 2).

## In scope

- Tabella, RPC e test SQL su staging.
- Modulo client `weekly-checkin.js` / `weekly-checkin.css` in IT ed EN, con le voci nuove nel glossario.
- Integrazione nella card priority di Oggi e nella riga di Noi.
- Due notifiche: «[nome] ha fatto il check-in» e «Risposte pronte».
- Conservazione dell'apprezzamento in Ricordi.
- Eliminazione dell'account, uscita dalla coppia ed export.
- Build web e native, precache del Service Worker.

## Out of scope

- Insights o riassunti generati con AI (Paired li ha; da noi sono un tema separato per costi e privacy).
- Streak, protezioni, obiettivi settimanali, badge, XP o premi Sintonia.
- Promemoria a orario (per esempio la domenica sera): da valutare in una V2 sul worker cron esistente.
- Statistiche oltre le 8 settimane, esportazione dei grafici, confronto con altre coppie.
- Widget Android/iOS e Live Activity.
- Terapia, contatti clinici, contenuti di esperti.
- Qualsiasi monetizzazione (D4).

## Existing authorities to reuse

| Bisogno | Authority |
|---|---|
| Identità e coppia del chiamante | `private.m11a_actor()` / `m11a_actor_locked()` (`auth.uid()` → `profiles.couple_id`, `role`) |
| Settimana | `private.bond_week_start_rome()` |
| Sigillo fino a entrambe le risposte | lo **schema** di `get_daily_state` / `daily_reveal_context`, replicato in una RPC nuova: le funzioni della Daily sono legate a `question_id` (audit §3) |
| Reazioni | stesso vocabolario (`heart`, `angry`, `cry`) e stesso componente (`US_DAILY_REACTIONS`), salvati in una colonna della propria riga del check-in. `daily_question_reveal_states` non si tocca (audit §4) |
| Conservare in Ricordi | nuova tabella `weekly_checkin_keepsakes` con le regole di M12B.4 e un tipo `weekly_checkin:<id>` in `ricordiTimeline`. `daily_question_keepsakes` non si tocca (audit §5) |
| Oggi | `US_TODAY_PRIORITY_ORDER` e `renderTodayPriorities` in `app.js` (categorie `waiting_for_me`, `answers_ready`) |
| Notifiche | client `sendWebPushEvent('weekly_checkin_answer', week_start)` → `send-web-push` (nuovo tipo in `EVENT_TYPES`, controllo sul server, `prefKey: 'today'`) → testi `weekly_checkin_turn` / `weekly_checkin_reveal` in `notification-core.mjs`, `target: 'today'`. Android: `checkin_turn` e `checkin_ready` in `ANDROID_NOTICE_KINDS` e in `UsPushNotices.java` IT/EN. **Mai testo o nomi nel pacchetto** (decisione 16/10; audit §8) |
| Navigazione e foglio | `navigation.js` (layer, back nativo), `ui-foundation.js/css` |
| Lingua | `i18n.js`, `i18n-en.js`, `docs/product/i18n-glossary.md` |
| Ciclo di vita | già su `main` (#190, #196): FK in cascata per l'eliminazione; da ridefinire `s32_close_membership` e `s32_export_user_data` con preflight sull'md5; contratto `us-store-s3-2-lifecycle-contract-20261012.json` (audit §6) |
| Build e PWA | `scripts/build-cloudflare-pages.mjs`, `scripts/build-capacitor-web.mjs`, precache `versioned(...)` in `service-worker.js`, marker di versione in `index.html` (audit §10) |
| Rientro in primo piano | `usAfterForeground` (decisione 20/10): il check-in si aggiorna solo se è sullo schermo |
| Icone | solo Phosphor; nessun asset nuovo senza approvazione (`assets/ASSET_MANIFEST.json`) |

## Dati e server (confermati dall'audit)

```text
public.weekly_checkins
  id uuid pk
  couple_id uuid not null → couples on delete cascade
  user_id uuid not null → auth.users on delete cascade
  week_start date not null            -- lunedì Europe/Rome
  closeness smallint 1..5 null        -- null = saltato
  closeness_note text ≤280 null
  energy smallint 1..5 null
  energy_note text ≤280 null
  appreciation text 1..500 not null
  support_last smallint null          -- 1 sì, 2 in parte, 3 non ancora; solo se esisteva una richiesta
  support_request text ≤280 null
  appreciation_reaction text null     -- heart | angry | cry: la MIA reazione all'apprezzamento dell'altro, solo dopo il reveal
  version int not null default 1
  submitted_at, updated_at timestamptz
  unique (couple_id, week_start, user_id)

public.weekly_checkin_keepsakes       -- modello M12B.4, immutabile, scritto solo dal server
  id uuid pk
  couple_id uuid not null → couples on delete cascade
  source_kind text = 'weekly_checkin'
  checkin_id uuid not null            -- la riga dell'autore dell'apprezzamento
  source_key text generated ('weekly_checkin:' || checkin_id)
  week_start date not null
  author_role text not null           -- chi ha scritto l'apprezzamento
  appreciation text not null          -- istantanea
  revealed_at, kept_by_role, kept_at
  unique (couple_id, checkin_id)
```

- **Grant espliciti, sempre**, perché dal 30/10/2026 Supabase non espone più le tabelle nuove (audit §9):
  - `weekly_checkins`: RLS attiva, `revoke all` da `anon` e `authenticated`, `grant select` a `service_role` (lo usa l'Edge delle notifiche);
  - `weekly_checkin_keepsakes`: `grant select` ad `authenticated` con una policy RLS per la stessa coppia (Ricordi la legge direttamente, come `daily_question_keepsakes`), `grant select` a `service_role`;
  - RPC `SECURITY DEFINER` con `search_path ''`, `revoke all` da `public` e `anon`, `grant execute` ad `authenticated`, con il pattern coperto da `f1b-rpc-grant-hardening`.
- RPC:
  - `get_weekly_checkin_state(p_week_start date default null)`: restituisce il mio check-in, se l'altro ha risposto (sì o no), la sua risposta **solo** dopo il reveal, la richiesta di supporto della settimana precedente indirizzata a me, e la data della prossima tornata.
  - `submit_weekly_checkin(p_payload jsonb, p_expected_version int)`: inserisce o aggiorna con controllo di versione. Rifiuta la modifica dopo il reveal o su una settimana chiusa. Valida lunghezze e intervalli. È idempotente, così un doppio tocco non crea due righe.
  - `get_weekly_checkin_history(p_weeks int default 8)`: solo i livelli di vicinanza, solo delle settimane rivelate, solo della coppia del chiamante.
  - `set_weekly_checkin_reaction(p_week_start date, p_reaction text)`: solo dopo il reveal; `null` toglie la reazione.
  - `keep_weekly_appreciation(p_week_start date)`: conserva in Ricordi l'apprezzamento che l'altro ha scritto per me; è idempotente.
- La coppia e il ruolo vengono **sempre** da `profiles`. Mai da metadata modificabili dall'utente o da parametri del client.
- Dopo `submit` il client chiama `send-web-push` con `weekly_checkin_answer`. L'Edge conta le righe della settimana e manda `weekly_checkin_turn` all'altro oppure `weekly_checkin_reveal` a entrambi, con `tag` per settimana per la deduplica. Il deploy dell'Edge è un gate separato.
- Migrazione creata con la Supabase CLI. **Prima di implementare, verificare la documentazione e il changelog Supabase correnti** (`docs/agent/supabase-change.md`).

## Lifecycle e privacy

- **Eliminazione account:** le righe di `weekly_checkins` si cancellano in cascata con l'utente; se se ne va l'ultimo membro, in cascata con la coppia.
- **Esci dalla coppia:** l'account resta, quindi serve un `delete` esplicito in `s32_close_membership`. Sono dati personali, come `daily_answers`, quindi Policy A non li conserva.
- **Conservati:** un apprezzamento conservato in Ricordi è un ricordo condiviso e resta al partner, come i keepsake della Daily. Va aggiunto al contratto di lifecycle accanto a `daily-keepsakes`, che richiede già una review.
- **Export:** le proprie righe, con i testi, aggiunte a `s32_export_user_data`.
- **Nessuna retention:** F2A.3 è solo per dati tecnici (audit §7). Le tornate a cui ha risposto uno solo restano sigillate per sempre e si cancellano solo con il ciclo di vita.
- **Pagina Privacy:** aggiungere una riga sulla categoria di dato «check-in settimanale» (livelli e testi). Va aggiornata insieme alla bozza (decisione 17/10).
- **Play Data Safety:** nessuna categoria nuova, perché sono contenuti dell'utente già dichiarati. Verificarlo in audit.

## Acceptance

**Comportamento**
- A risponde; B vede «Tocca a te» su Oggi e riceve la notifica. Nessun dato di A è visibile a B, né nell'interfaccia, né nelle risposte RPC, né nel pacchetto di notifica.
- B risponde; entrambi vedono i risultati, ricevono «Risposte pronte» e possono reagire all'apprezzamento e conservarlo.
- La settimana dopo, il passo Supporto mostra la richiesta della settimana precedente e registra *Sì / In parte / Non ancora*.
- L'andamento mostra al massimo 8 settimane, solo quelle rivelate.
- Prima del reveal le risposte si modificano; dopo no, e il server lo rifiuta.

**Bordi**
- Cambio di settimana mentre il foglio è aperto, compreso il passaggio all'ora legale, in Europe/Rome.
- Invio di entrambi quasi nello stesso momento: un solo reveal e una sola notifica per persona.
- Offline: «Invia» non finge successo; la bozza resta sul dispositivo finché l'invio non va a buon fine.
- Risposta che arriva dopo un logout o un cambio di coppia: viene scartata dall'owner guard esistente.
- Viewport 320×568, 390×844 e orizzontale; testi lunghi; riduci animazioni; tastiera aperta; lettore di schermo sui cursori (valore annunciato a parole, non come numero).

**Sicurezza**
- Test SQL: un utente di un'altra coppia, `anon` e un utente senza coppia ricevono `42501`. Niente lettura della tabella diretta. Nessun `grant` a `anon` o `PUBLIC`.
- L'export e l'eliminazione coprono la nuova tabella. Il contratto di lifecycle e i test FK sono aggiornati.

**Gate**
- Test mirati (dominio settimana, RPC, client, notifiche, lifecycle).
- `npm test`.
- `npm run build:cloudflare-pages`.
- `git diff --check`.
- Prova su staging con due account QA, poi su un AAB firmato (regola Boot/Auth del 07/10).

## Piano di lavoro

1. ~~**Audit**, in sola lettura~~ **Fatto il 22/10/2026:** [report](weekly-checkin-v1-audit.md), con le correzioni già riportate in questa spec.
2. ~~**SQL in TDD**~~ **Fatto il 22/10/2026:**
   - [`20261022141913_weekly_checkin_v1.sql`](../../supabase/migrations/20261022141913_weekly_checkin_v1.sql), con i test in [`tests/weekly-checkin-v1-db.test.js`](../../tests/weekly-checkin-v1-db.test.js): 12/12 passano, partiti tutti RED.
   - Applicata **solo su staging**.
   - Diverso dall'audit: uscita dalla coppia ed eliminazione account **non** vengono ridefinite. Le righe hanno una FK verso `profiles` con cancellazione in cascata, come le Stories. Si ridefinisce solo l'export, con una preflight sull'md5.
3. ~~**Client**~~ e 4. ~~**Integrazione**~~ (senza notifiche) **fatti il 22/10/2026:**
   - [`weekly-checkin.js`](../../weekly-checkin.js) e [`weekly-checkin.css`](../../weekly-checkin.css): foglio a 4 passi, attesa, risultati con andamento, reazione, Conserva, IT/EN.
   - Agganci: la card priority di Oggi, la riga in Noi sopra il calendario, il tipo `weekly_checkin:` in Ricordi, il back nativo, il reset al logout, la precache.
   - Test: [`tests/weekly-checkin-v1-client.test.js`](../../tests/weekly-checkin-v1-client.test.js), 12/12, partiti RED.
   - Diverso dalla spec: la domanda sulla vicinanza è neutra rispetto al genere («Quanta vicinanza hai sentito con {name}…»).
   - Il limite della precache passa da 2,8 a 2,85 MB (circa 45 KB in più).
   - **Notifiche (fase 3), fatte il 22/10/2026:**
     - `send-web-push` accetta `weekly_checkin_answer`, rilegge il giro dal database e avvisa **solo l'altra persona**: «{nome} ha fatto il punto della settimana. Ora tocca a te.», oppure «Il vostro punto della settimana è pronto ♡». Come la Daily, chi fa scattare il reveal lo vede già nell'app.
     - Deduplica per settimana; rispetta l'interruttore notifiche di Oggi; mai testi scritti nel pacchetto.
     - Android: `checkin_turn` e `checkin_ready` con le frasi IT/EN in `UsPushNotices.java`. Arrivano con il prossimo AAB; fino ad allora compare la frase generica.
     - Test: [`tests/weekly-checkin-v1-push.test.js`](../../tests/weekly-checkin-v1-push.test.js), 8/8 partiti RED, e il JUnit delle frasi Android, 6/6.
     - Pubblicata solo su staging (v11).
5. **Verifica:** browser con fixture, suite completa, build, review indipendente, prova su staging.
   - **Prova su staging del 22/10/2026: QA_PASS, 11 passi su 11** ([script](weekly-checkin-v1-staging-qa.sql)). È un solo blocco annullato alla fine: due utenti sintetici e una coppia esistono solo dentro la transazione. Usa le RPC vere, come ciascun utente, e copre:
     - coppia MC2, stato vuoto, sigillo, modifica e conflitto;
     - reveal per entrambi, chiusura dopo il reveal, reazione;
     - Conserva idempotente e protetto, nessuna lettura diretta della tabella;
     - andamento, rifiuto di `anon`, export, uscita dalla coppia (il ricordo conservato resta).
   - Dopo la prova staging è rimasto com'era: 3 utenti, 3 profili, 3 coppie, 0 check-in, 0 utenti QA.
   - **Non coperte:** la notifica reale (serve una sessione vera, quindi la copre il test sull'Edge) e il giro dalle schermate con due account veri.
6. **Report** con il formato di `AGENTS.md`. Nessun merge, nessuna produzione.

## Decisioni del founder

Tutte decise dal founder il 22/10/2026.

1. **D5:** eccezione, si fa adesso.
2. **Nome:** «Il punto della settimana», provvisorio. In inglese, proposta da confermare nel glossario: «Weekly check-in».
3. **Apprezzamento:** obbligatorio.
4. **Andamento della vicinanza:** visibile a entrambi, solo per le settimane rivelate, al massimo 8.
5. **Promemoria della domenica:** in V2.
6. **Energia:** tenuta, quindi i passi restano quattro.

## Stop conditions

Fermarsi e riferire prima di: allargare lo scope (AI, streak, widget, promemoria), creare un secondo sistema di reazioni, notifiche o keepsake, toccare la produzione Supabase, fare deploy di Edge function, merge o pubblicazione. Fermarsi anche se l'audit trova che un'authority riusata non regge il caso settimanale senza cambi rischiosi.
