# S1-A — M1 audit e proposta di integrazione

Data: 2026-10-10. **Candidate branch — non pubblicare senza QA.**

## Provenienza
- main (post-Phase0) 3e243acb7ef383683670d90a17a5a29152cf1f86
- draft PR #170 b58fb08af50d4246de91375d15f84aa175c46831
- merge-base 0e23e703dd6c6fff75cf5b68180b740044677456
- candidate mission/us-store-s1-android-integration-20261010
- 41 file da #170, 7 overlap, 34 independent.

## Conflitti risolti nel candidato
- `app.js`: applicati sei hunk della PR #170 tramite confronto *esatto* con main V6. Mantiene tutto il resto del file main; rimuove solo global page swipe, aggiunge motion timer guards e snapshot dei widget.
- `styles.css`: due hunk esatti su fade e durata Native Android, resto main invariato.
- `modal-center.css`: hunk esatto per fade uniforme.
- `index.html`: solo hunk esatto per eliminare vecchia guida manuale; mantieni tutte le nuove risorse/script V6.
- `manifest.webmanifest`, `index.html`, `service-worker.js`, `version.json`: marker coerente `us-store-s1-widget-motion-20261010-1`, non riportare i marker di build vecchi della #170.
- 34 file disgiunti recuperati come blob esatti dal branch #170; unicamente la workflow APK signed ha il trigger spostato al branch candidato per poter generare un artefatto QA.

## Funzioni richieste / delibere
- Ti Penso auto-ready dopo successo con rolling 24h locale; nessun numero fake.
- Noi widget coppia light con avatar+distanza, senza CTA GIOCA, conserva ID dei widget.
- Foto e Noi segue l'ultima foto effettivamente dipinta in Oggi.
- Assenza swipe fra tab; resta edge Back, giochi e carousel Ricordi.
- Nessuna nuova feature, nessuna modifica SQL/progressione, D4 ancora aperta.

## Test e rischi (non ancora certficati)
- A causa dell'accesso GitHub via connector, questa generazione ha verificato il match esatto degli hunk, ma non ha eseguito `npm test`/Gradle in ambiente locale.
- È obbligatorio attendere e leggere CI, controlli Android/iOS, il signed APK artefact e il test di installazione sopra l'app corrente su device Xiaomi. Mantenere P0/P1 a zero.
- `main` è avanzata di 105 commit dal merge base; controllare prima di ulteriori push e aggiornare il report dei 40 fallimenti ereditati.
- Il body di PR #170 è stale; `docs/UI_WIDGET_FEEDBACK_V2.md` è il riferimento per il codice approvato.
- QA manuale non può essere dichiarata superata solo con CI.

**Release:** niente merge, niente deploy di produzione, niente migrazioni, niente firma differente.
