# Premi Sintonia V2, Fase 2: immagini da generare con ChatGPT

Decisione del 29/10 (`docs/DECISIONS.md`, «Nuova scala dei premi Sintonia», punto 9): Claude scrive i prompt, il founder genera le immagini con ChatGPT e le approva. Lo stile deve essere identico al foglio dei Compagni; le icone partono dal logo approvato.

## Cosa serve un'immagine e cosa no

| Premio | Livello | Immagine? |
|---|---|---|
| Accessori I: sciarpina | 9 | **Sì**, prompt A1 |
| Accessori II: coroncina di fiori | 12 | **Sì**, prompt A2 |
| Corona per i Compagni | 19 | **Sì**, prompt A3 |
| Abiti «Gala» (Plus) | 10 | **Sì**, prompt A4 |
| Icona «Notte» | 13 | **Sì**, prompt B1 |
| Icona d'oro | 18 | **Sì**, prompt B2 |
| Icona «Neon» (Plus) | 7 | **Sì**, prompt B3 |
| Ti penso «lettera» | 15 | **Sì**, prompt C1 |
| Widget «Notte» e «Oro» | 6, 17 | No: colori e sfumature nel codice Android |
| Istantanea, Filo d'oro | 7, 14 | No: cornici disegnate nel CSS |
| Drago che vola | 16 | No: il volo c'è già nel codice, si sblocca e basta |

In tutto **8 immagini** (più le varianti che ChatGPT propone).

## Regole per tutte

- **Allega sempre il riferimento** indicato nel prompt: lo trovi nel repo, al percorso scritto.
- **Sfondo trasparente**, PNG, formato quadrato 1024 × 1024.
- **Niente scritte**, niente firme, niente ombre sul pavimento.
- Se ChatGPT cambia lo stile (linee più dure, colori diversi, 3D), chiedi «rifallo più fedele al riferimento».
- Salva i file con il nome indicato in una cartella tua (es. `D:\US-immagini\fase2\`) e dimmi dove sono. Io li taglio, li metto in `assets/` come `APPROVED` solo dopo il tuo ok esplicito, e ti faccio vedere l'anteprima nell'app.

## A. Accessori dei Compagni

Gli accessori stanno **sopra** il Compagno come un adesivo, uno solo per tutti e quattro (Maudit, capra, gufo, drago). Io li posiziono su ogni Compagno e su ogni posa. Per questo servono **da soli**, senza animale.

**Riferimenti da allegare:** `assets/source/pet/us-pet-companions-sheet-v1.webp` e `assets/source/pet/us-pet-maudit-sheet-v2.webp`.

### A1 · Sciarpina (livello 9) — `accessorio-sciarpina.png`

```
Usa esattamente lo stile dei personaggi nelle immagini allegate: illustrazione kawaii morbida, colori pastello, contorni sottili e arrotondati, ombreggiatura leggera e piatta.
Disegna SOLO un accessorio, senza nessun animale: una piccola sciarpa di lana morbida, rosa antico con una riga lilla, annodata davanti con le due punte che scendono. Deve sembrare fatta per stare al collo dei personaggi allegati, stessa scala.
Vista frontale, centrata, sfondo trasparente, nessun testo, nessuna ombra a terra. Quadrato 1024x1024.
```

### A2 · Coroncina di fiori (livello 12) — `accessorio-fiori.png`

```
Stesso stile esatto dei personaggi allegati: kawaii morbido, pastello, contorni sottili arrotondati, ombre piatte leggere.
Disegna SOLO un accessorio, senza animali: una coroncina di piccoli fiori (margherite bianche, roselline rosa, foglioline verde salvia), vista frontale e leggermente dall'alto, pensata per stare in cima alla testa dei personaggi allegati, tra le orecchie o le corna. Larghezza circa metà della testa del gatto.
Centrata, sfondo trasparente, nessun testo, nessuna ombra a terra. Quadrato 1024x1024.
```

### A3 · Corona (livello 19) — `accessorio-corona.png`

```
Stesso stile esatto dei personaggi allegati: kawaii morbido, contorni sottili arrotondati, ombre piatte leggere.
Disegna SOLO una piccola corona d'oro, senza animali: cinque punte arrotondate con una pallina in cima, tre piccole gemme (rosa, lilla, menta) sul cerchio, riflessi dorati morbidi, nessun effetto metallico realistico. Leggermente inclinata, pensata per stare in cima alla testa dei personaggi allegati.
Centrata, sfondo trasparente, nessun testo. Quadrato 1024x1024.
```

### A4 · Abiti «Gala» (livello 10, US Plus) — `accessorio-gala.png`

È un extra Plus: deve sembrare **più curato** degli altri.

```
Stesso stile esatto dei personaggi allegati: kawaii morbido, contorni sottili arrotondati, ombre piatte leggere, ma più prezioso e curato.
Disegna SOLO un accessorio da sera, senza animali: un colletto da smoking bianco con un papillon di velluto nero bordato d'oro, al centro una piccola spilla a forma di cuore dorata, e un minuscolo fiore all'occhiello rosa. Vista frontale, pensato per stare al collo e sul petto dei personaggi allegati, stessa scala.
Centrato, sfondo trasparente, nessun testo, nessuna ombra a terra. Quadrato 1024x1024.
```

## B. Icone dell'app

Il logo **non va ridisegnato**: cambia solo il materiale e lo sfondo. Se ChatGPT altera la forma delle lettere, scarta l'immagine.

**Riferimento da allegare:** `assets/source/brand/app-icon/us-adaptive-foreground-v1.png` (il logo).

Per ognuna servono due file: il logo da solo su trasparente (`-logo.png`) e lo sfondo pieno senza logo (`-sfondo.png`). Chiedili in due messaggi separati.

### B1 · Icona «Notte» (livello 13) — `icona-notte-logo.png`, `icona-notte-sfondo.png`

```
Prendi il logo allegato e mantieni ESATTAMENTE la sua forma, le proporzioni e lo spessore delle linee: non ridisegnare le lettere.
Cambia solo il materiale: argento lunare con un leggero bagliore lilla, come illuminato dalla luna. Sfondo trasparente. Quadrato 1024x1024, logo centrato che occupa circa il 60% della larghezza.
```
```
Ora solo lo sfondo, senza logo: blu notte profondo (#0E0B24) che sfuma verso il viola scuro in basso, con poche stelline piccolissime e una luce lunare morbida in alto. Quadrato 1024x1024, nessun testo.
```

### B2 · Icona d'oro (livello 18) — `icona-oro-logo.png`, `icona-oro-sfondo.png`

```
Prendi il logo allegato e mantieni ESATTAMENTE la sua forma, le proporzioni e lo spessore delle linee: non ridisegnare le lettere.
Cambia solo il materiale: oro caldo lucido con riflessi morbidi, elegante, non giallo acceso. Sfondo trasparente. Quadrato 1024x1024, logo centrato che occupa circa il 60% della larghezza.
```
```
Ora solo lo sfondo, senza logo: prugna scurissimo (#1A1020) con una luce calda dorata appena accennata al centro. Quadrato 1024x1024, nessun testo.
```

### B3 · Icona «Neon» (livello 7, US Plus) — `icona-neon-logo.png`, `icona-neon-sfondo.png`

È un extra Plus: deve essere la più spettacolare delle tre.

```
Prendi il logo allegato e mantieni ESATTAMENTE la sua forma, le proporzioni e lo spessore delle linee: non ridisegnare le lettere.
Trasformalo in un'insegna al neon: tubo luminoso rosa (#FF7C96) che sfuma in lilla (#A98BFF), con un alone luminoso morbido intorno. Sfondo trasparente. Quadrato 1024x1024, logo centrato che occupa circa il 60% della larghezza.
```
```
Ora solo lo sfondo, senza logo: quasi nero (#0B0910) con un leggero riflesso rosa e lilla al centro, come un muro illuminato da un'insegna al neon. Quadrato 1024x1024, nessun testo.
```

## C. Ti penso «lettera» (livello 15)

Quando arriva un Ti penso, al posto dei cuori si apre una letterina. Servono due pose.

**Riferimento da allegare:** `assets/source/pet/us-pet-companions-sheet-v1.webp` (solo per lo stile).

### C1 · Lettera chiusa e aperta — `lettera-chiusa.png`, `lettera-aperta.png`

```
Usa esattamente lo stile dei personaggi allegati: kawaii morbido, pastello, contorni sottili arrotondati, ombre piatte leggere. Non disegnare animali.
Disegna una piccola busta da lettera color crema, chiusa, con un sigillo di ceralacca rosa a forma di cuore al centro. Vista frontale, leggermente inclinata, centrata, sfondo trasparente, nessun testo. Quadrato 1024x1024.
```
```
Ora la stessa busta, identica, ma aperta: il lembo alzato e un foglietto rosa chiaro che esce per metà, con sopra solo un piccolo cuore disegnato (nessuna scritta). Stessa vista, stessa scala, sfondo trasparente. Quadrato 1024x1024.
```

## Dopo

Quando le immagini ci sono:
1. Me le passi.
2. Ti faccio vedere ogni premio nell'app su staging.
3. Le segno `APPROVED` nel manifest solo dopo il tuo ok.

La Fase 2 parte su staging come la Fase 1 e va in produzione nella patch dopo la patch unica.

## A bis. Accessori indossati (founder, 29/10: gli adesivi sopra i Compagni «messi malissimo»)

Gli accessori singoli (A1–A4) incollati sopra i Compagni non funzionano: sembrano adesivi. Ogni accessorio va invece **disegnato addosso** al Compagno, su un foglio identico all'originale, poi tagliato nelle pose come i fogli di ottobre. Il primo foglio (Gala su capra, gufo e drago) è approvato.

**Riferimenti:** il foglio dei Compagni `assets/source/pet/us-pet-companions-sheet-v1.webp` oppure quello di Maudit `assets/source/pet/us-pet-maudit-sheet-v2.webp`, più l'immagine dell'accessorio (`assets/source/rewards/us-acc-*-v1.png`).

Prompt, uguale per tutti cambiando solo l'accessorio e il foglio:

```
Rifai ESATTAMENTE il foglio allegato con i personaggi nelle stesse tre pose (sveglio, dorme, felice), stesse posizioni, stesse dimensioni, stesso stile, stessi colori, stesso sfondo bianco.
L'unica differenza: ogni personaggio indossa [ACCESSORIO] dell'altra immagine allegata, disegnato come se lo indossasse davvero ([DOVE]), che segue la forma del corpo e si piega con la posa.
Quando il personaggio dorme sdraiato, l'accessorio si vede solo in parte, coperto dal corpo, oppure resta appoggiato in modo naturale.
Non cambiare nient'altro: né le facce, né le pose, né le proporzioni, né la posizione delle orecchie, delle corna e delle ali. Togli le scritte sotto i personaggi.
```

| File | Foglio | [ACCESSORIO] | [DOVE] |
|---|---|---|---|
| `foglio-gala-compagni.png` (fatto) | Compagni | il colletto da smoking con il papillon | al collo |
| `foglio-sciarpina-compagni.png` | Compagni | la sciarpina di lana rosa con la riga lilla | annodata al collo |
| `foglio-fiori-compagni.png` | Compagni | la coroncina di fiori | in cima alla testa, tra le orecchie o le corna |
| `foglio-corona-compagni.png` | Compagni | la piccola corona d'oro | in cima alla testa, un po' inclinata |
| `foglio-gala-maudit.png` | Maudit | il colletto da smoking con il papillon | al collo |
| `foglio-sciarpina-maudit.png` | Maudit | la sciarpina di lana rosa con la riga lilla | annodata al collo |
| `foglio-fiori-maudit.png` | Maudit | la coroncina di fiori | in cima alla testa, tra le orecchie |
| `foglio-corona-maudit.png` | Maudit | la piccola corona d'oro | in cima alla testa, tra le orecchie |

Salva tutto in PNG nella stessa cartella delle altre immagini.
