# Countdown Oggi V1 — report candidato

Branch `codex/countdown-oggi-v1`, base `f15d441`, worktree `C:\Users\Francesco\.codex\worktrees\c8c3\US`, repository originale `F:\AI\US`.

## Risultato

Tempo direttamente sulla foto corrente, un solo countdown condiviso scelto dalla coppia. Giorni di calendario Europe/Rome, oppure conto reale ore/minuti/secondi; oltre 24 ore numero dei giorni e clock residuo. Scadenza a zero. Automatico “Insieme da” deriva da `couples.started_on`; la data continua a essere modificata tramite le impostazioni esistenti. Entry discreta in basso, foto Focus compatibile, Daily Question in una banda propria (laterale in landscape). Nessuna nuova foto, asset, icona custom, valuta, XP o sistema reward. Nessuna modifica ad Arcade o al dominio/calendario.

Foglio canonico foundation: crea/modifica/elimina, seleziona/nascondi, anteprima degli stili anche quando bloccati. Massimo 12 countdown, titoli 32 caratteri. Scritture soltanto confermate dal server, conflitti di versione espliciti; bozza conservata in caso di errore. Nessun dato countdown scritto in localStorage o cache media.

| Stile | Trattamento | Disponibilità |
|---|---|---|
| Editoriale | Newsreader grande, filetto sottile | Subito |
| Segnale | Monospace, cifre tecniche, cambio cifre breve | Subito |
| Vetro | Lente trasparente, blur e profondità | Subito |
| Aurora | Gradiente lento dentro le cifre | Unlock esistente `frame_aurora`, Sintonia 4 |
| Orbita | Doppio filo circolare, un punto in orbita | Unlock esistente `ring_orbit`, Sintonia 9 |
| Cromo | Tipografia scolpita, riflessi metallici | Unlock esistente `frame_chrome`, Sintonia 12 |

Gli unlock sono controllati dal server tramite `couple_reward_unlocks` e catalogo attivo; usare uno stile non equipaggia né rimuove altri reward. Motion ridotta rispettata; animazioni sospese a pagina nascosta, fuori Oggi e in Focus Photo. Tick soltanto dove visibile, interval sospeso in background, niente haptic al secondo. Feedback di azione/salvataggio riusa UsFeedback.

## Verifica

- Dominio/SQL: 8/8. Calendario DST, veri istanti, expiry, invalid/missing target, RLS/grants, membership e isolamento coppie, read-only RPC, CRUD dei partner, version conflict, entitlement e bounds.
- Browser locale: 7/7 test, 18 combinazioni stili × viewport; altre 18 combinazioni clock/titolo massimo dalla review indipendente. Base 320×568, 390×844, 844×390; safe top24/bottom20, relazione a cinque cifre, titolo lungo, assenza/selezione countdown e foto vuota, reduced motion, tastiera simulata tramite viewport ridotto, back/focus, CRUD, errori/offline, logout e owner switch durante save. Nessun pageerror nei casi verificati. Tutta la rete esterna bloccata, Supabase sostituito da fixture.
- Gate PWA e regressioni correlate: 42/42 test mirati. Precache countdown JS/CSS, marker/cache/version coerenti, upgrade precedente, offline reload shell, fallimento precache con worker precedente valido, cache media privata conservata, push/notificationclick, logout e rewards.
- Build finali: `node scripts/build-cloudflare-pages.mjs` 143 file; `node scripts/build-capacitor-web.mjs` 141 file, bundle SHA256 `a5646d3f68f53042d1b751b537301c236bb944872da5d113dc75338e61a73b7e`. Usati direttamente gli script di staging, senza prebuild che rigenera asset APPROVED.
- Syntax JS e `git diff --check`: PASS. SHA dei 16 asset APPROVED invariati.
- Review indipendente finale: READY come candidato locale, nessun P1/P2 residuo. Finding risolti con RED/GREEN: titolo vuoto, round-trip DST/secondi, retry senza backend, scrittura lenta, landscape entry e form dopo cambio identità.

Suite completa `npm test`: **1297 test, 1264 pass, 32 skip, 1 fail**. Eseguita con loader ESM Windows temporaneo esterno al repository: i test storici importano path assoluti Windows senza pathToFileURL. Unico fail: `Scriptable work does not add iOS, Xcode, WidgetKit, Android or Capacitor build changes` (`tests/scriptable-widgets.test.js`), che vede CRLF generati dalla suite in `android/brand-assets-manifest.json`. JSON e testo normalizzato identici al baseline; ripulito esclusivamente quel cambiamento generato e rieseguita la suite Scriptable: **23/23 PASS**. Non dichiarare la singola esecuzione completa interamente verde.

Baseline senza adattatore: 1282 test, 1193 pass, 56 fail, 33 skip; includeva restrizioni esbuild/sandbox, import Windows e lo stesso fail del manifest. Non sono stati modificati quei sottosistemi per questa missione.

Comandi mirati:
```powershell
node --test tests/countdown-oggi-v1.test.js tests/countdown-oggi-v1-db.test.js tests/service-worker-static-runtime.test.js tests/release-build-marker.test.js tests/logout-device-revocation.test.js tests/progression-rewards-v2.test.js
$env:PLAYWRIGHT_NODE_MODULES='C:\Users\Francesco\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:\Users\Francesco\AppData\Local\ms-playwright\chromium-1243\chrome-win64\chrome.exe'
node --test tests/countdown-oggi-v1-browser.test.js
```

Per riprodurre la suite completa su questa macchina, aggiungere al processo NODE_OPTIONS `--import=file:///C:/Users/Francesco/.codex/visualizations/2026/10/04/01a108a6-a8ec-7931-96c4-cee3d0f95ed5/windows-test-loader.mjs`. Il loader trasforma soltanto gli import ESM assoluti in file URL; non modifica la risoluzione CommonJS. Su ambienti che già supportano i test storici non serve.

## Screenshot ed evidenze

Directory: `C:\Users\Francesco\.codex\visualizations\2026\10\04\01a108a6-a8ec-7931-96c4-cee3d0f95ed5\countdown`.
`style-collection.png`, `before-390x844.png` e ogni stile nelle tre dimensioni (`editorial`, `signal`, `glass`, `aurora`, `orbit`, `chrome`). Lo sfondo foto è simulato dalla fixture, nessun media privato è stato letto. Il before rimuove countdown e sua entry dal rendering con la stessa fixture.
Log: directory `countdown-evidence` accanto agli screenshot; `countdown-final-suite.log` nella directory superiore. Candidato source e migrazione sono nel commit; screenshot/log restano locali.

## Rischi e limiti

- Migrazione `supabase/migrations/20261004204518_countdown_oggi_v1.sql` da applicare solo in un futuro rollout autorizzato, prima del frontend. Ora non applicata ad alcun database remoto. Backend mancante mostra errore recuperabile senza rompere Oggi.
- Countdown condivisi: il refresh dei cambiamenti del partner avviene al foreground/apertura foglio o, su Oggi visibile, entro circa un minuto. Nessun nuovo canale realtime o sistema Sync.
- Offline: un countdown già caricato continua a contare nella sessione; dopo reload offline senza dati in memoria resta nascosto. Creazione/modifica richiedono rete, nessuna coda di scrittura privata parallela.
- Senza foto il countdown scelto rimane conservato ma nascosto per lasciare spazio al primo ricordo. Nessuna foto alternativa aggiunta.
- Gli orari si editano nel fuso del dispositivo. La deadline UTC viene preservata se si cambia solo titolo/stile, inclusi secondi e seconda occorrenza DST. Un nuovo orario ambiguo segue la prima occorrenza locale del browser; orari inesistenti nel salto DST sono rifiutati.
- Tastiera e safe area in emulazione Chromium; iOS Safari, VoiceOver, haptics e dispositivo fisico nativo non verificati. Nessun deploy, push, merge o modifica production.
- `docs/CURRENT_STATE.md` è assente nel repository richiesto; sono state usate le authority disponibili e il codice corrente, senza inventare uno stato sostitutivo.

La migrazione segue il pattern RPC server-only esistente, con search_path vuoto e grants espliciti ([documentazione Supabase](https://supabase.com/docs/guides/database/functions)).
