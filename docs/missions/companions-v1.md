# Mission — Compagni V1 (Maudit, la capretta, il gufetto, il draghetto)

**Status:** IN BRANCH, su staging dopo i test
**Branch:** `claude/payred-app-comparison-b2594e`
**Origine:** richiesta del founder del 22/10/2026 («proponimi dei pet, io voglio sicuro un draghetto che svolazza e si ripoggia sempre dove sta Maudit… un sistema di sblocco dei pet, non di crescita»; poi «ne metterei semplicemente tre… Maudit, una capretta, un gufetto e il draghetto»; infine «all'inizio non hai nessun animaletto… a livello due o tre sblocchi Maudit, poi il gufetto, poi la capretta e infine il draghetto», con i livelli Sintonia 3, 5, 8, 11). Eccezione D5 nello stesso giorno ([DECISIONS](../DECISIONS.md)).

## Goal

All'inizio la coppia non ha nessun compagno. Arrivano salendo di **livello Sintonia**, lo stesso che sblocca temi ed effetti di Oggi: Maudit, poi il gufetto, la capretta e il draghetto. Il compagno non cresce: niente evoluzioni, barre proprie o compagni da nutrire. Arriva una volta e resta per sempre.

## I compagni

Tutti stanno nel posto di Maudit (sopra l'estremità destra della barra in basso, riquadro 54 × 48), con gli stessi stati di base di `pet.js`: `idle`, `sleep`, `curious`, `pet`, `happy`. Ognuno ha un gesto suo.

| Compagno | Gesto suo | Si sblocca quando |
|---|---|---|
| **Maudit** (2.0) | Respira, sbatte le palpebre, muove la coda | **Livello 3** di Sintonia |
| **Milo**, il gufetto | Stringe e rilassa le ali; da curioso si piega | **Livello 5** |
| **Bea**, la capretta | Dondola le orecchie a pendaglio; da felice fa un saltello | **Livello 8** |
| **Firix**, il draghetto | Vola e torna sempre al suo posto | **Livello 11** |

I livelli 2, 4, 6, 7, 10, 12 e 13 danno già un tema o un effetto di Oggi: i compagni stanno nei livelli liberi, così ogni livello porta una sola sorpresa.

Nomi scelti dal founder (25/10): Milo il gufetto, Bea la capretta, Firix il draghetto. Nell'app compare il nome proprio («È arrivato Firix»).

### Il volo del draghetto

- **Quando:** da sveglio, ogni 25–45 secondi a caso, e quando lo tocchi.
- **Come:** decolla, fa un giro largo e basso sopra la barra (al massimo circa 140 × 90 px dal suo posto, senza uscire dallo schermo), torna e si posa. Dura 3–4 secondi; all'atterraggio fa un piccolo sbuffo di fumo.
- **Mai d'intralcio:** lo strato del volo non prende tocchi (`pointer-events: none`); vola solo sopra lo sfondo e la barra, sotto schede e avvisi. Niente volo con tastiera aperta, scheda aperta, Focus Photo o porta d'ingresso: lì si spegne come Maudit (`is-off`).
- **Sonno:** dopo 30 secondi senza tocchi si acciambella e non vola più finché non lo svegli.
- **Riduci animazioni:** non vola; muove solo le ali, piano.
- **In background** l'animazione si ferma, come per Maudit.

## Sblocchi

- **Collezione di coppia:** gli sblocchi appartengono alla coppia. Quando arriva un compagno, lo trovate tutti e due.
- **Fonte:** il livello Sintonia della coppia (`private.progression_level` di `couples.bond_xp`), letto ogni volta che l'app chiede i compagni (apertura e ritorno in primo piano).
- **Coppie che ci sono già:** chi ha già il livello trova subito i compagni. Chi è sotto il livello 3, da questa versione **non vede più Maudit** finché non ci arriva.
- **Mai persi:** uno sblocco non si toglie.
- **Annuncio, una volta sola per persona:** su Oggi compare «È arrivato Maudit», poi «È arrivato il gufetto», e così via, con «Guardalo».
- **Scelta personale, su questo telefono:** ognuno sceglie quale compagno sbloccato sta sul proprio schermo, come oggi l'interruttore di Maudit nelle impostazioni. Quando arriva il primo, compare Maudit da solo. Se il compagno scelto non è sbloccato per la coppia (per esempio dopo una separazione), si torna a Maudit, o a nessuno se la coppia è sotto il livello 3.

## Esperienza

- **In Sintonia, tra gli sbloccabili** (founder, 23/10: «deve rientrare dentro a Sintonia come sbloccabili»): in Gioca › Sintonia, «I vostri sblocchi» ha la categoria **Compagni** accanto a temi, effetti e countdown, con le stesse schede.
  - Sbloccato: il compagno vero, «Sbloccato» o «In uso»; un tocco lo mette sopra la barra («Il gufetto · con te sopra la barra»).
  - Ancora chiuso: la sagoma scura e «Livello 11»; un tocco dice «Si sblocca al livello 11 di Sintonia».
  - **Prossimo sblocco** nomina il compagno quando il suo livello viene prima del prossimo premio.
- In Noi non c'è più una riga a parte; l'avviso di Oggi («Guardalo») apre Sintonia sulla categoria Compagni.
- **Testi** in italiano inclusivo, come il resto dell'app; inglese in `i18n-en.js`.

## Server (solo staging)

- **Una tabella nuova**, `couple_companion_unlocks (couple_id, companion_id, unlocked_at)`, chiave `(couple_id, companion_id)`: solo RPC, RLS attiva, grant scritti per intero (dal 30/10/2026 le tabelle nuove non sono più esposte di default).
- **Non si usano** `progression_reward_catalog` e `couple_reward_unlocks`: sono i premi di Sintonia, legati ai livelli.
- **RPC** `get_companions_v1()`: `SECURITY DEFINER`, `search_path ''`, coppia da `private.m11a_actor()`, grant solo ad `authenticated`. Prima registra gli sblocchi raggiunti (`private.companion_sync`, idempotente), poi restituisce i quattro compagni con `id`, `unlocked`, `unlocked_at`. Nessun conteggio e nessuna soglia nella risposta.
- **Ciclo di vita:** le righe vanno con la coppia (FK `ON DELETE CASCADE`); una coppia nuova riparte da Maudit. Nessun dato personale sul server: la scelta del compagno resta sul telefono, quindi l'export non cambia.

## Client

- `pet.js` diventa multi-compagno: la stessa macchina a stati, un renderer per compagno. Il volo del draghetto è del suo renderer: parte quando è felice e, da sveglio, ogni 25–45 secondi; la macchina a stati non cambia. Restano `?us-pet=off` e `?us-pet=preview`.
- Un file `companions.js` per gli sblocchi, la scelta e l'annuncio; `progression.js` disegna il gruppo Compagni e il prossimo sblocco; agganci in Oggi (`refreshTodayPriorities`), reset al logout, precache, build.
- **Disegni:** le immagini del founder (22/10/2026), Maudit 2.0 compreso, in `assets/source/pet/`. I pezzi ritagliati (corpo, parti che si muovono, pose dorme e felice) stanno in `assets/derived/pet/`, tutti nello stesso riquadro da 192 px per compagno, registrati in `ASSET_MANIFEST.json` con la loro origine. Maudit 1.0 (SVG) resta su disco, ritirato.
- **Animazione a pezzi**, senza librerie: respiro e battito di ciglia per tutti; coda di Maudit, orecchie della capretta, ali del gufetto e del draghetto; il draghetto vola il suo giro (Web Animations) e torna al suo posto. Con riduci animazioni niente movimento, restano le pose.

## Ordine

1. Spec ed eccezione D5.
2. Bozze dei tre disegni, approvate dal founder.
3. Server e test (PGlite).
4. Collezione, scelta e annuncio.
5. I gesti dei compagni e il volo del draghetto.
6. Prova nel browser con il backend finto, poi solo staging (SQL, anteprima web, APK).

## Fuori scope

Compagni che crescono o cambiano, accessori, compagni a pagamento, compagni che camminano per l'app, più di un compagno sullo schermo, altri compagni oltre questi tre.

## Acceptance

- Test SQL: nessuno all'inizio, livelli esatti (appena sotto no, al livello sì), sblocchi idempotenti e solo per la propria coppia, scelta rifiutata per un compagno chiuso, annuncio una sola volta per persona, rifiuto di `anon` e di chi non ha una coppia, cancellazione ed export.
- Test client: stati e renderer per ogni compagno, volo spento con riduci animazioni, tastiera e schede, testi escapati, agganci.
- `npm test`, `npm run build:cloudflare-pages`, `git diff --check`.
