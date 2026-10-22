# Mission — Il vostro anno V1 (riepilogo dell'anniversario)

**Status:** IN BRANCH, su staging dopo i test
**Branch:** `claude/payred-app-comparison-b2594e`
**Origine:** richiesta del founder del 22/10/2026 («facciamo riepilogo anniversario»), ispirata all'«Anniversary Wrapped» di Paired. Eccezione D5 nello stesso giorno ([DECISIONS](../DECISIONS.md)).

## Goal

Un racconto a schede del vostro anno insieme, fatto **solo con i vostri dati veri**: ricordi e foto, Ti penso, domande, giochi, missioni, eventi, Lasciato per te. Si vede nel giorno dell'anniversario e, in ogni altro momento, come «il vostro anno finora».

## Esperienza

- **Ingressi:**
  - **Oggi**, nel giorno dell'anniversario: la card che c'è già («Oggi è un anno ♡») apre il riepilogo con «Guarda il vostro anno».
  - **Noi**: una riga «Il vostro anno» sotto Il punto della settimana.
- **Schede a tutto schermo**, una alla volta, come le storie:
  - barre di avanzamento in alto, tocco a destra per avanti e a sinistra per indietro, X per chiudere, back nativo;
  - con «riduci animazioni» i passaggi sono istantanei.
- **Le schede**, saltando quelle che sarebbero a zero:
  1. **Apertura:** «Il vostro anno» oppure «I vostri primi N mesi», i giorni insieme, il periodo.
  2. **Ricordi:** quanti ricordi e quante foto, con la prima foto del periodo.
  3. **Il mese più vostro:** il mese con più ricordi.
  4. **Ti penso:** quanti in tutto e chi ne ha mandati di più, detto con leggerezza («{nome} ti ha pensato un po’ di più»).
  5. **Domande del giorno:** a quante avete risposto tutti e due, e quante ne avete conservate.
  6. **Insieme:** partite finite, missioni completate, eventi vissuti, cose lasciate l'uno all'altra.
  7. **Chiusura:** l'ultima foto del periodo e «Il prossimo anno comincia oggi».
- **Niente da condividere fuori da US** nella V1: resta uno spazio privato. Nessun punteggio, nessun voto alla coppia, nessuna classifica tra voi.

## Periodo

- **Anniversario:** stesso giorno e mese di `couples.started_on`. Chi ha iniziato il 29 febbraio lo festeggia il 28 negli anni non bisestili, come in Eventi.
- **Fine:** oggi, nel giorno civile Europe/Rome.
- **Inizio:** l'ultimo anniversario **prima** di oggi. Nel giorno dell'anniversario è quindi l'anno appena finito, intero; negli altri giorni è l'anno in corso, «finora».
- **Prima del primo anniversario:** dall'inizio della relazione a oggi, «I vostri primi N mesi».

## Server

- **Una sola RPC di lettura**, `get_couple_year_recap()`:
  - `SECURITY DEFINER`, `search_path ''`, coppia e ruolo dal profilo tramite `private.m11a_actor()`;
  - `grant` solo ad `authenticated`, `stable`;
  - funziona anche in una transazione di sola lettura.
- **Restituisce solo conteggi**, date e il riferimento a due foto (`storage_path` e `thumbnail_path` del primo e dell'ultimo ricordo). Mai testi scritti: niente risposte, messaggi o didascalie.
- **Fonti:** `moments`, `moment_photos`, `shared_messages` (`kind = 'think'`), `daily_answers` (domande con due risposte), `daily_question_keepsakes`, `game_sessions` completate, `bond_weekly_quests` completate, `shared_event_completions`, `left_for_you`.
- **Nessuna tabella nuova**, nessuna scrittura, niente cambi al ciclo di vita: è una lettura di dati che già ci sono.
- Le foto si firmano dal client con l'autorità che c'è già (`usGetSignedUrls`).

## Client

- `year-recap.js` e `year-recap.css`; primitive di `ui-foundation`; icone Phosphor; nessun asset nuovo.
- Agganci: la card dell'anniversario in Oggi, la riga in Noi, il back nativo (`navigation.js`), il reset al logout, la precache, l'inglese.

## Fuori scope

Condivisione esterna, immagine da salvare, riepilogo mensile, testi generati o scelti dal server, musica.

## Acceptance

- Test SQL: periodo (primo anno, giorno dell'anniversario, 29 febbraio), conteggi corretti e solo della propria coppia, rifiuto di `anon` e di chi non ha una coppia, nessun testo nella risposta, lettura in sola lettura.
- Test client: schede saltate quando sono a zero, plurali, Ti penso detto senza classifica, testi escapati, agganci.
- `npm test`, `npm run build:cloudflare-pages`, `git diff --check`; prova nel browser con il backend finto; poi solo staging (SQL, anteprima web, APK).
