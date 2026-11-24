# Missione — Il redesign definitivo

**Stato:** Fase 0 unita in staging (PR #280); tavola approvata dal founder il 23/11 («Concordo», https://claude.ai/artifact/QguykctqxueyKRwAVupf11); Fase 2 unita in staging (PR #281); Fase 3 unita in staging (PR #282); mascotte, domanda fuori da Gioca e «Il vostro angolo» in staging (PR #283); Fase 4 (personaggi al posto dei cerchi, reazioni, guardaroba) in staging (PR #284); scala dei premi decisa dal founder il 24/11 (proposta A, Simbolo US tenuto) in staging (PR #285); Fase 5 (Oggi senza schede di suggerimento, D9) in staging (PR #286); founder 24/11: fasi 6–8 di fila, poi un controllo insieme; Fase 6 (Gioca con i gettoni, D10–D11) sul ramo `claude/redesign-fase6-gioca`; Fase 7 (intro con i personaggi, D14) sul ramo `claude/redesign-fase7-intro`
**Ramo fisso:** `mission/us-store-s3-1-public-auth-staging-20261011` (staging); un ramo corto `claude/*` per fase
**Fonte:** founder, 23/11/2026: «dobbiamo buttare il progetto staging, dobbiamo riprendere il progetto principale che al momento è su main e riportarlo su staging» con le richieste qui sotto; «concordo» a tutte le risposte consigliate D1–D14.
**Decisione:** [DECISIONS.md, 23/11](../DECISIONS.md)

## Obiettivo

Ripartire dall'app di produzione (`main`) e farne il redesign definitivo, in fasi brevi su staging, ognuna provata sul telefono prima della successiva.

## Cosa c'era prima (letto nel codice il 23/11)

- **Oggi su main:** Ti penso in alto a sinistra, busta di Lasciato per te in alto a destra, foto a tutto schermo, countdown, dock sopra la barra (didascalia, pillole evento/distanza/Come stai, una scheda della zona priorità, invito alle notifiche, domanda del giorno). Nessun cerchio con le iniziali su Oggi: i cerchi sono l'anello della domanda (due cerchi che si fondono, `app.js` `renderDailyRitual`), il simbolo a due cerchi della Sintonia e del passo del colore (`onboarding.js` `drawVenn`), gli avatar della scheda coppia.
- **Barra su main:** quattro schede a pillola (58 px), colori fissi per scheda (`ui-foundation.css`: Oggi corallo, Noi orchidea, Ricordi ambra, Gioca menta), transizione «Marea» (`due-colori.js`).
- **Impostazioni su main:** solo dalla rotella di Noi (`index.html` `go('settings')`).
- **Sintonia su main:** scheda dentro Gioca; premi in `progression.js` (Atmosfere, Colore di Noi, Temi ed Effetti di Oggi, Simbolo US, Ti penso, accessori dei Compagni, icona dell'app, stili del countdown, Compagni).
- **Compagni su main:** Maudit, Milo, Bea, Firix (`companions.js`, `pet.js`), seduti sopra la barra in ogni scheda.
- **Gioca su main:** domanda di oggi, sfida della settimana, striscia dei 7 giorni, griglia dei giochi, riga Plus, «La vostra domanda», «Da continuare». Nessun gioco con le foto: con le foto c'è solo «La sfida della settimana» (`weekly-challenge.js`). Nessuna moneta: il contatore «Ancora N su 3 oggi» con tre pallini (`games.js`).
- **Ricordi su main:** griglia mese per mese a due colonne, Rivivi, mappa MapLibre (`ricordi-place.js`, un posto per Ricordo arrotondato a ~100 m), album = copertina in `moments` più `moment_photos`; miniature a 720 px solo per le copertine.
- **Staging prima della ripartenza:** main 1.5.1 più «Il diario, ma pulito» e le PR #266–#278. Archiviato nell'etichetta `archivio/staging-diario-pulito-20261123` (commit `6c7aa160`).

## Decisioni (D1–D14, founder 23/11: «concordo»)

1. **D1 — Ripartenza.** Staging torna uguale a `main` con un commit normale, senza push forzato. Restano: la versione nuova a ogni pubblicazione di staging (#278) e la pagina segnaposto dei rami di prova (#256); le due migrazioni dei personaggi (`20261115183900`, `20261120232852`), già sul database di staging, con la loro tavolozza; testo grande del telefono (#271), tastiera ed emoji (#269). La freccia indietro delle Impostazioni (#270) arriva con la Fase 2, quando le Impostazioni si aprono da ogni pagina. Tutto il resto del diario pulito si archivia, compresa la foto del giorno (#272). Le PR #279 (facce) e #260 restano ferme e si rifanno sulla nuova base.
2. **D2 — Gli omini al posto dei cerchi:** l'anello della domanda del giorno (i due personaggi si avvicinano quando avete risposto tutti e due), il simbolo della Sintonia, il passo del colore all'iscrizione, la scheda coppia; in più nell'angolo della foto di Oggi.
3. **D3 — La Sintonia si chiama «Il vostro angolo».** Si apre toccando i personaggi, non è una scheda.
4. **D4 — Nell'angolo restano:** livello e avanzamento; «La vostra home» (temi ed effetti della foto di Oggi, stile del countdown); il guardaroba dei personaggi; lo stile del cuore del Ti penso; l'icona dell'app. Escono Compagni, Atmosfere e Colore di Noi. Aurora (extra Plus) resta; la Gala passa ai personaggi. *Cambiata dal founder il 24/11/2026:* il Simbolo US (il logo in alto su Oggi) resta, con i suoi effetti ai livelli 6, 9 e 13. Gli ultimi quattro accessori del guardaroba vanno sui livelli rimasti vuoti: gala al livello 8 (4550 punti), cuffie all'11 (8750), coroncina al 14 (14300), corona al 19 (26550); i primi cinque restano a 150, 400, 700, 1000 e 1350 punti.
5. **D5 — Compagni in pensione per tutti,** con una riga nelle Novità («al loro posto, accessori per i vostri personaggi»). Gli accessori già presi passano ai personaggi. È un'eccezione esplicita a «niente si toglie mai» (29/10).
6. **D6 — Profilo in alto a destra** su tutte e quattro le pagine: il proprio personaggio apre il Profilo (personaggio, nome, colore, forma, Come stai; sotto le Impostazioni a gruppi; «Cambia look» porta al guardaroba). La busta di Lasciato per te in alto a sinistra, solo su Oggi. Via la rotella da Noi.
7. **D7 — La regola dei colori:** le quattro pagine sono quattro passi dal proprio colore a quello dell'altra persona (Oggi il tuo, Noi a un terzo, Ricordi a due terzi, Gioca il suo). La transizione scivola tra i passi; icone e scritte di ogni pagina prendono il suo colore; ciò che fa ognuno resta nel suo colore; i tasti principali sono la sfumatura dei due. Ogni colore ha una versione per le scritte sempre leggibile. I due telefoni vedono l'ordine opposto (ognuno parte dal suo).
8. **D8 — Tavolozza:** quella di staging (rosa, lilla, blu, salvia, pesca, prugna, menta, perla). Prima dell'uscita si conta in sola lettura chi in produzione ha oro, cielo o rubino (la migrazione li sposta).
9. **D9 — Oggi senza suggerimenti:** via la zona delle schede (priorità) e i passi della prima settimana. Ogni cosa vera ha il suo posto: Ti penso ricevuto → occhi a cuore dei personaggi e un avviso breve; Lasciato per te → pallino sulla busta; tocca a te → pallino su Gioca; mesiversario → festa dei personaggi; notifiche → l'intro, poi il Profilo. Oggi resta: foto con i personaggi, countdown, riga evento/distanza/Come stai, domanda del giorno.
10. **D10 — Il gioco delle foto è «La sfida della settimana»:** esce da Gioca e da Oggi; dati e database restano, si nasconde soltanto.
11. **D11 — Gettoni:** tre gettoni grandi in cima a Gioca; quando una partita parte un gettone vola nel gioco, al posto della finestra di conferma; a zero «Domani altre 3» con l'ora del rinnovo e la riga di Plus solo lì. In alto i giochi dove l'altra persona vi aspetta, poi la griglia con tre stati: pronto, giocato, domani. La domanda di oggi esce da Gioca (resta su Oggi).
12. **D12 — Ricordi:** si apre sulla raccolta a polaroid mese per mese (nastro del colore di chi ha caricato, didascalia scritta a mano). L'interruttore «Bacheca» mostra la lavagna da detective: i posti sono cartellini appuntati, messi come su una cartina vera (nord in alto); le polaroid del posto intorno; un filo rosso unisce i posti in ordine di tempo; toccando un posto si apre la mappa lì, toccando una polaroid il Ricordo; i Ricordi senza posto in un angolo «Da appuntare» con «Aggiungi il posto». Si dispone da sola: nessun dato nuovo. Il centraggio delle facce (#279) serve ai ritagli delle polaroid.
13. **D13 — Ordine e permessi:** Fase 0, poi la tavola completa, poi le fasi 2–8. Ogni push e ogni unione a staging solo col sì del founder in chat.
14. **D14 — Intro con i personaggi:** il giro prima dell'accesso diventa tre scene con i due personaggi; all'iscrizione tutti e due creano il personaggio (forma e colore) al posto del passo coi cerchi; nell'attesa il proprio personaggio aspetta da solo; quando l'altra persona entra si incontrano e fanno festa. Da ricontrollare: su main il passo del colore lo fa solo chi crea, chi entra lo fa dopo.

## Fasi

| Fase | Cosa | Finita quando |
|---|---|---|
| 0 | Ripartenza (D1) | il sito di staging mostra l'app di produzione; i test danno gli stessi risultati di `main` |
| 1 | Tavola di tutte le schermate, con tre coppie di colori | il founder la approva |
| 2 | Struttura: cuore al centro della barra (al tocco, con lo scoppio), busta in alto a sinistra, personaggio in alto a destra → Profilo con le Impostazioni, via la rotella da Noi, freccia indietro alla pagina di partenza (#270) | provata sul telefono |
| 3 | Colori della coppia (D7, D8): via i colori fissi delle schede, Atmosfere e Colore di Noi | provata con tre coppie di colori, contrasto 4,5:1 |
| 4 | Personaggi (D2–D5): omini al posto dei cerchi, «Il vostro angolo» con il guardaroba, via i Compagni, scala dei premi nuova (numeri mostrati prima, regola D19 del 20/11) | provata sul telefono |
| 5 | Oggi pulita (D9) | Oggi senza schede di suggerimento |
| 6 | Gioca (D10, D11) | gettoni e giochi provati |
| 7 | Intro con i personaggi (D14) | iscrizione completa provata con due account di prova |
| 8 | Ricordi: polaroid, bacheca, mappa (D12) | provata con molti Ricordi (prestazioni e traffico) |
| 9 | Uscita: test, APK di staging (US · Android), TestFlight (US · Apple), testi inglesi, nota della patch; produzione solo col via (US · Produzione) | in produzione |

## Da portare dai personaggi di staging (archivio `6c7aa160`)

- Disegno: `diario.js` 39–255 (forme, accessori, facce, `character()`), autonomo; il contorno `#14120E` va provato sullo scuro di main.
- Reazioni: `reactionOf` (festa, cuore per 3 ore dopo un Ti penso, saluta, sera 22–6), festa dello sblocco con «Mettilo».
- Database: `character_shape`, `character_head`, `character_face`, `set_my_character_shape`, `set_my_character_look`, `my_character_unlocks` (già su staging).
- Da riscrivere su main: il foglio dell'angolo e il guardaroba (CSS), il passo del personaggio all'iscrizione, la riga nelle Impostazioni.

## Fuori dalla missione

- Pagamenti e US Plus in vendita; widget «Voi due» (fase 4 dei personaggi, chat Android e Apple).

## Condizioni di stop

Fermarsi e chiedere prima di push, unioni, SQL su staging o produzione, deploy, e prima di allargare una fase oltre la sua riga.
