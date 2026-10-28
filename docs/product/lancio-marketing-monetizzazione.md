# US — Lancio pubblico: marketing e monetizzazione

**Tipo:** ricerca e proposta. **Le decisioni sono nella nuova D4** del 28/10/2026 in [`docs/DECISIONS.md`](../DECISIONS.md); dove questo documento e la delibera non coincidono, vale la delibera.
**Data della ricerca:** 28/10/2026. Prezzi e pagine lette in quella data.
**Governance:** la nuova D4 approva la direzione e il lavoro su staging ([missione](../missions/plus-v1-staging.md)). Ogni passo resta da approvare uno per uno: prodotti su Play Console, account RevenueCat, SQL ed Edge su staging, merge, patch in produzione, prezzo finale, pubblicazione dei video.

**Legenda.** Ogni affermazione importante ha un'etichetta:

- **[F]** fatto verificato su una fonte linkata, letta il 28/10/2026;
- **[F2]** fatto riportato da una fonte secondaria (newsletter, analisi di terzi), non confermato dall'azienda;
- **[S]** stima o ragionamento mio;
- **[N]** non verificato: va controllato prima di decidere.

---

## Sintesi

1. **Couple Joy** non è cresciuta con un account del brand. È cresciuta con account di creator «ambasciatori», soprattutto ragazze, soprattutto in spagnolo: 3 secondi di faccia o di momento di coppia, poi la registrazione dello schermo con il widget. Nessun invito esplicito a scaricare. [F2] Anche Couple Joy l'hanno fondata due persone in coppia. [F]
2. **Per Bea** il formato si adatta bene: video brevi e muti con testo sullo schermo, dal punto di vista di lei, dove l'app si vede sempre. Proposta: 4–5 video a settimana, partendo 2–3 settimane prima della produzione su Play. Prima va fatto un accordo scritto con Bea su volto, voce, cosa si mostra della coppia e come si smette.
3. **Prezzi:** le app simili costano tra 9,99 € e 16,49 € al mese e tra circa 18 € e 75 € all'anno. Paired e Between dichiarano che un abbonamento copre tutti e due i partner. Couple Joy, Agapé e Lovewick non lo dicono nelle schede.
4. **Google Play:** dentro l'app Android un abbonamento digitale deve passare da Google Play Billing. Stripe dentro l'app non è ammesso, salvo un programma di fatturazione alternativa nello SEE, che per un abbonamento piccolo non fa risparmiare in modo significativo. Dal 30/6/2026, nello SEE, gli abbonamenti su Play pagano il **10% di commissione di servizio più il 5% di commissione di fatturazione**. Stripe va bene per il web, fuori dall'app.
5. **Proposta per D4:** un abbonamento **per coppia** (paga uno, sbloccano tutti e due), con il cuore dell'app gratis e i contenuti in più a pagamento. Fascia indicativa: **3,99 €/mese o 24,99 €/anno, con 7 giorni di prova sull'annuale**. Implementazione proposta: RevenueCat, con il diritto di accesso della coppia salvato su Supabase. Prima di tutto si chiede alle coppie della beta, con il questionario del §4.6.

---

## 1. Marketing: cosa ha fatto Couple Joy e cosa può fare US

### 1.1 Couple Joy: i fatti

| Cosa | Dettaglio | Fonte |
|---|---|---|
| Chi | App rumena di HEARTBIT SRL, fondata da **Ioana Moraru** (marketing e business) e **Cosmin-Andrei Anghel** (CTO), che avevano bisogno di uno spazio digitale per la loro coppia. Ioana ha lasciato un lavoro da Mobile Software Engineer a YouTube e dall'estate 2024 si dedica al progetto. | [F] [Forbes România, 14/10/2025](https://www.forbes.ro/?p=469987); [F] [sito](https://couplejoyapp.com) |
| Numeri dichiarati | Oltre 5 milioni di utenti registrati, circa 2 milioni di attivi al mese, oltre 100.000 recensioni (media 4,9), circa 3 milioni di dollari di ricavi nel primo semestre 2025. | [F] Forbes România (numeri dichiarati dai fondatori, non certificati) |
| Ricavi e download stimati | Circa 300.000 $ di ricavi ricorrenti al mese; 400.000 download al mese in un punto dell'articolo, 700.000 in un altro (incoerente). | [F2] [Social Growth Engineers, 17/06/2025](https://www.socialgrowthengineers.com/couplejoy-well-see-each-other-tomorrow) |
| Quando è partito TikTok | Circa due anni dopo l'uscita dell'app, nell'estate 2024. Subito con gli ambasciatori, senza passare da un account del brand. L'account ufficiale @couplejoy non pubblicava da marzo 2025 e aveva 3,2 milioni di visualizzazioni in totale. | [F2] SGE |
| Account migliori | @marlivesaway (spagnolo): 48,4 milioni di visualizzazioni da gennaio 2025. @guacouplejoy (spagnolo). @nessyandruby, gestito da lei: 18,8 milioni in 137 video. @rubyandnessy1, gestito da lui: 798.600 in 115 video. | [F2] SGE |
| Regola fissa | In ogni video l'app si vede, ma non viene mai nominata né «venduta». Nessun invito esplicito a scaricare. | [F2] SGE |
| Struttura | Circa 3 secondi di contenuto emotivo o personale, poi la registrazione dello schermo con l'app, quasi sempre un widget sulla schermata Home. | [F2] SGE |
| Hook | Due famiglie che rendono uguale: **consapevolezza** (es. «sono in una relazione a distanza da due anni e…») e **azione** (un consiglio pratico per chi vive a distanza). | [F2] SGE |
| Formati | (1) Primo piano: lei sorride vicina alla camera, spesso con la mano sulla bocca, 3 s, poi la demo. (2) Carosello di 3–4 foto che alterna immagini di coppia e immagini senza volto, es. «Idee per appuntamenti a distanza» (2,9 milioni di visualizzazioni), «Ti vedo domani?» (4 milioni). (3) Momento romantico di 3 s con il partner (dal vivo o in videochiamata), poi la demo. | [F2] SGE |
| Video muti | Clip di 12–16 s senza voce, testo sovrapposto, faccia emotiva e poi tutorial del widget. Un video di @tweetyandkevin del 10/08/2025: circa 5,3 milioni di visualizzazioni, circa 18.000 volte la mediana dell'account, 22.000 salvataggi e 17.000 condivisioni. | [F2] [Handler, outlier](https://gethandler.ai/outliers/relationship-apps-tiktok-silent-ugc-17966x/) |
| Cosa non ha funzionato | Gli account senza volto, solo registrazioni del widget, si sono fermati a fine 2024. Un tentativo in francese con caroselli di quiz senza volto si è fermato a circa 1 milione di visualizzazioni totali. | [F2] SGE |
| Cadenza | Non dichiarata. 137 e 115 video in circa sei mesi corrispondono a circa **5 video a settimana per account**. | [S] calcolo su dati SGE |

**Caso simile, Flamme** [F2] ([StartupTalky](https://community.startuptalky.com/discussions/post/this-couples-app-pulled-50m-organic-views-from-tiktok-accounts-with-I3cyceC6JAOK7wR)): oltre 50 milioni di visualizzazioni organiche da account con meno di 100 follower. Formato: lei in camera sua racconta un momento triste di coppia, poi mostra la funzione dell'app e la risposta del partner sullo schermo. La variante che vince più spesso è il «diario della relazione a distanza». Ogni pagina ha un nome personale, un solo tema e una bio che dice cosa cercare nello store.

### 1.2 Cosa ha funzionato, in breve [S]

1. **La persona, non il brand.** L'account di lei rende più di quello di lui sugli stessi contenuti (18,8 milioni contro 0,8 milioni). La faccia e l'emozione dei primi 3 secondi contano più della funzione.
2. **L'app come prova, non come pubblicità.** La demo arriva dopo l'emozione e risponde a un bisogno già detto nell'hook.
3. **Il widget è l'eroe visivo.** È la parte dell'app che si capisce in un secondo, sulla schermata Home, senza aprire nulla.
4. **Tema stretto.** Couple Joy e Flamme partono dalla relazione a distanza: un problema chiaro, molto condivisibile, salvabile.
5. **Volume.** Circa 5 video a settimana per account, con formati ripetuti e hook che cambiano.
6. **Lingua e mercato.** I risultati migliori sono in spagnolo, non in inglese. Il mercato si sceglie, non si dà per scontato.

### 1.3 Cosa ha US da mostrare [F, dal codice e da CURRENT_STATE]

US ha già quello che serve a questi formati: il widget Android «Due colori», «Ti penso», «Lasciato per te», «La domanda di oggi», il calendario e il countdown, i Ricordi, Gioca con Sintonia, i Compagni (Maudit e gli altri) e «Il vostro anno». Le notifiche dicono cosa è successo. **Il widget e «Ti penso» sono gli equivalenti diretti della demo di Couple Joy.** [S]

US non ha la relazione a distanza come tema dichiarato. Bea e Francesco vivono a distanza? Se sì, è l'angolo più forte; se no, va scelto un altro tema stretto, per esempio «i piccoli gesti quando siamo stanchi o lontani per la giornata». **Da decidere con Bea.** [N]

### 1.4 Piano proposto per Bea [S]

**Principi**

- Account personale di Bea, non «US Official». Nome e bio personali, con la bio che dice cosa cercare su Play.
- Video muti di 10–20 s con testo grande sullo schermo, così Bea può decidere quanto mostrarsi e non deve parlare.
- In ogni video si vede US, senza nominarla nel testo parlato e senza «scaricala ora».
- Lingua: **italiano** per i primi 30 video, perché l'app oggi parla italiano e il test chiuso è in un solo paese. Un test in inglese o spagnolo si valuta dopo, sui dati.
- Etichetta TikTok obbligatoria (vedi §1.6).

**Cinque formati**

| # | Formato | Struttura | Cosa si vede di Bea |
|---|---|---|---|
| A | **Reazione** | 2–3 s di faccia di Bea (sorriso, mano sulla bocca), testo con l'hook, poi lo schermo del telefono con il widget o la notifica | Volto, niente voce |
| B | **Solo mani** | Telefono in mano, notifica di «Ti penso» o widget che cambia, testo POV | Mani e telefono |
| C | **Carosello** | 3–5 foto: idee, domande, «cose che facciamo quando…», l'ultima foto è US | Facoltativo |
| D | **Diario** | Clip della giornata (treno, scrivania, divano), testo «giorno X di…», chiusura sullo schermo di US | Facoltativo, anche senza volto |
| E | **Domanda di oggi** | La domanda vera sullo schermo, «lui ha risposto così», reazione di Bea | Volto o mani |

**I primi 10 video (bozza dei testi sovrapposti)**

| # | Formato | Hook sullo schermo | Cosa mostra US |
|---|---|---|---|
| 1 | A | «POV: lui è in ufficio e il mio telefono fa così» | Notifica «Ti penso» e widget che cambia colore |
| 2 | B | «La cosa più piccola che mi fa sorridere tutto il giorno» | «Ti penso» ricevuto |
| 3 | E | «Gli ho chiesto [domanda di oggi] e la sua risposta…» | La domanda di oggi con le due risposte |
| 4 | C | «5 cose da fare in coppia quando siete stanchi morti» | Gioca e la domanda di oggi |
| 5 | A | «Quando trovi un messaggio che ti ha lasciato la mattina presto» | «Lasciato per te» |
| 6 | D | «Giorno 1 a contare i giorni al nostro viaggio» | Countdown nel calendario |
| 7 | B | «Abbiamo un gatto. Si chiama Maudit. Vive nel telefono.» | Compagni, Maudit |
| 8 | E | «Abbiamo fatto lo stesso quiz senza guardarci» | Gioca, risultato di Sintonia |
| 9 | C | «Cose che non sapevo di lui dopo [N] anni» | Domande passate (solo quelle che Bea accetta di mostrare) |
| 10 | A | «Il nostro anno in 15 secondi» | «Il vostro anno» (solo con dati che Bea approva) |

**Cadenza e tempi**

| Fase | Quando | Cadenza | Obiettivo |
|---|---|---|---|
| 0. Accordo con Bea | Subito | — | Accordo scritto (§1.5), nome dell'account, tema stretto |
| 1. Rodaggio | Dal 2–3 novembre, durante il test chiuso | 3 video a settimana | Imparare i formati senza invito a scaricare. L'app non è ancora pubblica, quindi niente «cerca US su Play». |
| 2. Pre-lancio | Dalla richiesta di produzione (dal 9/11 circa, se i 12 tester ci sono dal 26/10) all'approvazione di Google | 4–5 a settimana | Trovare i 2–3 hook che rendono di più |
| 3. Lancio | Dal giorno in cui US è in produzione su Play | 5 a settimana | Bio con «cerca US su Google Play», ripetere i formati vincenti |
| 4. Rivalutazione | Dopo 30 video | — | Decidere se aggiungere un secondo account (lui, o una seconda creator) o una seconda lingua |

Le date della fase 2 e 3 dipendono dalla revisione di Google, che da qui non si può prevedere. [N]

**Cosa misurare** (dati di TikTok Studio, settimana per settimana): visualizzazioni a 48 ore, percentuale di chi guarda fino in fondo, salvataggi e condivisioni ogni 1.000 visualizzazioni, visite al profilo. Dopo il lancio: installazioni dalla scheda Play nei giorni dei video migliori. Couple Joy e Handler indicano salvataggi e condivisioni come il segnale che separa i video virali. [F2]

### 1.5 Cosa va concordato con Bea, prima di girare

Il volto, la voce e la vita di coppia sono di Bea. Questo elenco è una base per un accordo scritto e breve tra voi due. Non è un parere legale.

1. **Consenso esplicito** per ogni tipo di contenuto: volto, voce, mani, casa, nomi veri, foto vecchie della coppia.
2. **Cosa resta fuori sempre:** dati di altre persone, luoghi riconoscibili (casa, lavoro), posizione, litigi, contenuti intimi, le risposte vere alle domande se Bea non vuole.
3. **Dati nell'app:** le registrazioni dello schermo mostrano i vostri contenuti veri. In alternativa si gira con una coppia di prova su staging, con testi scritti apposta. Va deciso caso per caso. [S]
4. **Chi pubblica e chi approva:** Bea ha l'ultima parola su ogni video prima della pubblicazione.
5. **Commenti:** chi li legge e li modera, e cosa si fa con commenti offensivi o molesti verso Bea.
6. **Proprietà dell'account e uscita:** di chi è l'account, cosa succede ai video se Bea vuole smettere o se la coppia si separa. Bea può far cancellare i video in qualsiasi momento.
7. **Compenso o riconoscimento:** se Bea riceve qualcosa in cambio (soldi, quota, rimborso), va scritto. Cambia anche l'etichetta da usare (§1.6).
8. **Tempo:** quante ore a settimana Bea è disposta a dare. 5 video a settimana sono tanti: si può usare un formato senza volto (B, C, D) per metà dei video.

### 1.6 Obblighi di trasparenza

- **TikTok** [F] ([guida ufficiale](https://ads.tiktok.com/help/article/how-to-turn-on-the-commercial-content-disclosure-setting-in-tiktok)): chi promuove un marchio, un prodotto o un servizio deve attivare l'impostazione per i contenuti commerciali. «Il tuo brand» mette l'etichetta «Contenuto promozionale»; «Contenuto brandizzato» mette «Partnership retribuita». Bea promuove l'app del suo compagno: per me [S] si usa almeno «Il tuo brand». Se Bea viene pagata, si usa «Contenuto brandizzato». TikTok non permette di rendere privati i post con contenuto brandizzato. [F2]
- **Italia, Digital Chart IAP** [F2] ([regolamento](https://www.iap.it/wp-content/uploads/2020/06/Regolamento-Digital-Chart.pdf)): la comunicazione commerciale deve essere riconoscibile, con diciture come «#adv» o «Pubblicità» ben visibili all'inizio. Il legame personale con il fondatore è un interesse da dichiarare. [S] Una riga in bio, tipo «io e il mio ragazzo abbiamo fatto US», rende la cosa trasparente e funziona anche come storia. [S]
- **AGCOM, linee guida influencer** (delibera 197/25/CONS, FAQ del 15/03/2026) [F2] ([Allegato A](https://www.agcom.it/sites/default/files/media/allegato/2026/Allegato%20A%20-%20Quadro%20normativo%20e%20profili%20procedurali%20-%20Influencer.pdf)): gli obblighi pieni e l'iscrizione all'elenco valgono sopra 500.000 follower o 1 milione di visualizzazioni medie al mese su una piattaforma. Sotto soglia la trasparenza pubblicitaria resta raccomandata. Il testo completo del codice di condotta non l'ho letto. [N]

---

## 2. Modelli a pagamento delle app di coppia

Prezzi presi dalle schede **App Store Italia** il 28/10/2026, perché lì sono elencati in euro. Le schede elencano tutte le varianti attive, comprese promozioni e test A/B, e spesso non dicono la durata. Le schede Google Play non si sono lette da qui (risposta 404), quindi i prezzi su Android **possono essere diversi**. [N]

| App | Gratis | A pagamento | Prezzi in € (App Store IT) | Prova gratuita | Copre tutti e due? |
|---|---|---|---|---|---|
| **Couple Joy** ([IT](https://apps.apple.com/it/app/id1624758651), [US](https://apps.apple.com/us/app/couple-joy-relationship-app/id1624758651)) | Contatore e conversazioni del giorno [F, risposta dello sviluppatore]; un quiz per categoria [F2, recensione] | Domande e quiz illimitati, widget, niente pubblicità [F2] | «Premium» 6,99 · 17,99 · 22,99 (durate non indicate); «Ripara la serie» 0,49–1,99 [F] | Non indicata [F] | Non indicato. Una recensione parla di un addebito «per coppia». [N] |
| **Paired** ([IT](https://apps.apple.com/it/app/id1469609343), [FAQ](https://www.paired.com/frequently-asked-questions), [aiuto](https://support.paired.com/en/articles/164633-what-s-paired-premium)) | Una domanda al giorno da fare insieme [F] | Oltre 1.000 domande, quiz e giochi, percorsi, consigli di esperti, analisi settimanali [F] | Mensile 14,99; annuale 29,99 · 39,99 · 59,99 · 74,99 (più varianti) [F]. FAQ: 79,99 $ all'anno per coppia [F] | 7 giorni sul piano annuale [F] | **Sì**: «Only one partner needs to subscribe» [F] |
| **Agapé** ([IT](https://apps.apple.com/it/app/id1507907556)) | Migliaia di domande gratis [F] | Categorie di domande premium [F] | Mensile 16,49; annuale da 22,99 a 110,99; a vita 229,99 [F] | Non indicata [F] | Non indicato [N] |
| **Lovewick** ([IT](https://apps.apple.com/it/app/id1516199115)) | Domande con limite giornaliero [F] | Set di domande premium, nessun limite giornaliero [F] | 9,99/mese · 14,99/3 mesi · 29,99/anno [F] | Non indicata [F] | Non indicato [N] |
| **Between** ([US](https://apps.apple.com/us/app/id458035189); la scheda italiana risponde 404) | Chat privata, calendario, ricordi [F2] | Temi, lettere, video e messaggi vocali più lunghi, niente pubblicità; vende anche «cuori» [F] | In dollari: 2,99/mese · 24,99/anno · 26,99 a vita [F] | Citata, durata non indicata [F] | **Sì**, «per te e il tuo partner» [F] |

**Cosa se ne ricava** [S]

- **Il modello comune** è un freemium con abbonamento: l'uso di tutti i giorni è gratis, si paga per la quantità di contenuti (domande, quiz, giochi) e per qualche extra (widget, temi, analisi).
- **Fascia di prezzo:** mensile 9,99–16,49 €; annuale di solito 20–75 €. L'annuale è il prodotto vero: il mensile serve a far sembrare conveniente l'annuale.
- **Per coppia:** chi lo dichiara (Paired, Between) ne fa un argomento di vendita: «79,99 $ per coppia, 3,33 $ a persona al mese».
- **Cose da non copiare in US:** «Ripara la serie» di Couple Joy fa pagare una serie. US ha deciso di non avere serie né valute (product restraint del 04/10 e principi in `us-vnext-vision.md`). Lo stesso vale per i «cuori» di Between.

---

## 3. Pagamenti su Google Play

### 3.1 La regola di base [F]

La [policy Pagamenti di Google Play](https://support.google.com/googleplay/android-developer/answer/9858738?hl=it) dice che le app che fanno pagare funzioni o servizi dentro l'app, **abbonamenti compresi**, devono usare il sistema di fatturazione di Google Play. Le eccezioni sono i beni e servizi fisici, le bollette, i pagamenti tra persone, le donazioni e poco altro: un abbonamento digitale come quello di US non rientra. L'app non può nemmeno portare l'utente a pagare altrove (pulsanti, link, webview, testi), salvo nei paesi e nei programmi previsti dalle sezioni 8 e 9 della stessa policy. La policy chiede anche che il prezzo mostrato nell'app sia uguale a quello dell'interfaccia di pagamento di Play.

**Quindi Stripe dentro l'app Android non è ammesso**, salvo l'iscrizione a uno dei programmi del §3.3.

### 3.2 Commissioni dal 30 giugno 2026 [F]

Google ha cambiato le commissioni il 4/3/2026 ([annuncio](https://android-developers.googleblog.com/2026/03/a-new-era-for-choice-and-openness.html)) e ha dato i dettagli il 24/6/2026 ([annuncio](https://android-developers.googleblog.com/2026/06/play-expanded-billing.html)). Dal **30/6/2026** nello SEE, nel Regno Unito e negli Stati Uniti:

| Transazione | Commissione di servizio | Commissione di fatturazione (solo con Play Billing) |
|---|---|---|
| **Abbonamenti con rinnovo automatico** | **10%** | **5%** |
| Altri acquisti, nuove installazioni | 20% (10% sul primo milione di dollari l'anno) | 5% |
| Altri acquisti, installazioni esistenti | 25% | 5% |

Fonte della tabella per lo SEE: [Condizioni generali di accesso a Google Play nello SEE](https://support.google.com/googleplay/android-developer/answer/14659200?hl=it). La tabella sul primo milione è resa male nella pagina: il 10% per gli abbonamenti vale comunque. Per un abbonamento di US: **15% in tutto** con Play Billing.

### 3.3 Le alternative nello SEE [F]

Dalla stessa [pagina SEE](https://support.google.com/googleplay/android-developer/answer/14659200?hl=it):

| Programma | Cosa permette | Commissione per gli abbonamenti | Obblighi |
|---|---|---|---|
| **Fatturazione a scelta dell'utente** | Play Billing e un sistema alternativo (es. Stripe) uno accanto all'altro; sceglie l'utente | Ridotta rispetto alla standard; il valore esatto per questo programma non si legge bene nella pagina [N] | Iscrizione, segnalare ogni transazione con le API di Google, rispettare i requisiti di UX |
| **Solo fatturazione alternativa (SEE)** | Solo il sistema alternativo, senza Play Billing | Standard meno 3 punti, quindi circa **7%**, senza il 5% di fatturazione | Come sopra |
| **Offerte esterne** | Link dall'app a un'offerta sul proprio sito; il pagamento avviene fuori | **10%** sui link ad abbonamenti con rinnovo automatico | Avvisare l'utente che esce dalla protezione di Play; segnalare le transazioni |

**Quanto si risparmia davvero** [S], su 3,99 €/mese pagati con una carta SEE:

- Play Billing: 15% → circa 0,49 € al mese su 3,27 € al netto dell'IVA.
- Solo alternativa + Stripe: 7% a Google + 1,5% + 0,25 € a Stripe + 0,7% di Stripe Billing ([listino Stripe](https://stripe.com/it/pricing)) → circa 0,57 € al mese. **Costa di più di Play Billing** sui prezzi bassi, per colpa della quota fissa di 0,25 €.
- Offerte esterne + Stripe: 10% + Stripe → circa 0,66 €. Anche qui di più.

C'è poi il resto: con Stripe il venditore è Francesco, quindi IVA (anche OSS per i clienti di altri paesi UE), rimborsi, contestazioni e assistenza sono suoi. Con Google Play, Google raccoglie e versa l'IVA per gli acquisti dei clienti UE ([aiuto Play Console](https://support.google.com/googleplay/android-developer/answer/138000?hl=it)). [F2] **Per US la fatturazione alternativa non conviene.** [S]

### 3.4 Web e PWA [S, sulla base della policy F]

- La policy Pagamenti vale per le app distribuite da Google Play. **Il sito web di US** (Cloudflare Pages), usato dal browser, **non è un'app di Play**: lì Stripe è ammesso. [S]
- US però usa lo stesso codice per il web e per l'app Android (Capacitor). Se un giorno si vende sul web, l'app Android **non deve mostrare né linkare** l'acquisto web, salvo l'iscrizione alle Offerte esterne. Serve un controllo di piattaforma nel codice, testato.
- Il diritto di accesso deve essere uno solo: chi paga sul web sblocca anche Android e viceversa. Su Android si può mostrare che l'abbonamento è attivo, ma non dove comprarlo. Il punto preciso va verificato sulla policy prima di farlo. [N]
- **Proposta:** al primo lancio **solo Play Billing**. Il web con Stripe si valuta dopo, se ci sono utenti che usano solo il browser. iPhone e App Store hanno regole loro, fuori da questo documento.

### 3.5 Vincoli tecnici [F]

- Ogni app nuova o aggiornata deve usare **Play Billing Library 8 o successiva** dal 31/08/2026; la proroga si poteva chiedere fino all'1/11/2026 ([Google](https://developer.android.com/google/play/billing/deprecation-faq)). US oggi non ha la libreria; quando la aggiunge, deve essere la 8 o più recente.
- Le prove si fanno con i **tester con licenza**, che pagano con carte di prova. Gli abbonamenti si rinnovano in fretta (1 mese = 5 minuti, 1 anno = 30 minuti) e la prova gratuita dura 3 minuti. **Il nome del pacchetto dell'app deve corrispondere a un'app configurata su Play** ([Google, test](https://developer.android.com/google/play/billing/test)).
- I cambi di stato degli abbonamenti (rinnovo, disdetta, rimborso, periodo di tolleranza, sospensione) arrivano al server tramite **notifiche in tempo reale** via Cloud Pub/Sub. A ogni notifica il server deve chiedere lo stato completo con `purchases.subscriptionsv2.get` ([Google, RTDN](https://developer.android.com/google/play/billing/rtdn-reference)).
- Il pacchetto di staging è `com.usapp.us.staging` (`android/app/build.gradle`). Dai documenti del repo non risulta un'app con quel pacchetto su Play Console. [N] Per provare i pagamenti su staging serve un'app separata su Play Console con quel pacchetto (§4.5).

### 3.6 RevenueCat o integrazione diretta

| | **RevenueCat** | **Play Billing diretto** |
|---|---|---|
| Lato app | SDK ufficiale `@revenuecat/purchases-capacitor` [F] ([doc](https://www.revenuecat.com/docs/getting-started/installation/capacitor)) | Plugin Capacitor da scrivere in Kotlin, oppure `cordova-plugin-purchase` (dichiara Billing 8.3) [F2] ([iaptic](https://www.iaptic.com/blog/20260407-capacitor-native-plugin)) |
| Verifica degli acquisti | La fa RevenueCat [F] | Edge Function con account di servizio di Google Cloud e Play Developer API |
| Notifiche di stato | Webhook di RevenueCat verso una Edge Function [F] ([eventi](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields)) | Progetto Google Cloud, argomento Pub/Sub, sottoscrizione push verso una Edge Function |
| Costo | Gratis fino a 2.500 $ di ricavi tracciati al mese, poi 1% [F] ([prezzi](https://www.revenuecat.com/pricing/)) | Nessun costo di terzi; tempo di sviluppo e manutenzione |
| Web con Stripe, iPhone | Già supportati dallo stesso diritto di accesso [F2] | Tutto da rifare per ogni store |
| Privacy | Nuovo fornitore che tratta dati: aggiornare l'informativa e la sezione Sicurezza dei dati di Play [S] | Nessun nuovo fornitore oltre a Google |
| Rischio | Dipendenza da un servizio esterno; se è giù, c'è un diritto temporaneo di 24 ore [F] | Più codice delicato (rinnovi, sospensioni, rimborsi) da scrivere e testare da soli |

**Proposta** [S]: **RevenueCat**, perché Francesco lavora da solo, perché iPhone e web prima o poi arriveranno e perché fino a 2.500 $ al mese è gratis. **Supabase resta l'unica autorità per l'app**: RevenueCat è la fonte degli eventi, Supabase decide chi vede cosa. È il principio «una sola autorità per ogni fatto» della vision.

### 3.7 Il diritto di accesso per coppia su Supabase (schema, non codice) [S]

- **Chi compra:** un utente. L'ID utente di RevenueCat è l'ID Supabase dell'utente, non quello della coppia, perché la coppia può chiudersi (Esci dalla coppia, eliminazione dell'account). Con l'integrazione diretta lo stesso legame si fa con `obfuscatedAccountId`.
- **Cosa si salva:** una tabella con l'abbonamento dell'utente (fonte, prodotto, stato, scadenza, ultimo evento) e una funzione che risponde «questa coppia ha accesso?» se **almeno uno dei due** ha un abbonamento attivo.
- **Chi scrive:** solo la Edge Function del webhook, con verifica della firma e la chiave di servizio. Il client legge e basta, tramite RPC. RLS: ognuno vede solo la propria riga e lo stato della propria coppia.
- **Accessi senza pagamento:** fonte `beta` o `manuale` per le coppie della beta e per i test, con una scadenza.
- **Casi da decidere** (domande per D4):
  1. Se la coppia si chiude, l'abbonamento resta a chi l'ha comprato; il partner perde l'accesso alla fine del periodo pagato o subito?
  2. Se chi paga elimina l'account, l'abbonamento su Play **non si disdice da solo**: va detto chiaramente prima dell'eliminazione, con il link alla gestione degli abbonamenti di Play. [S]
  3. Se pagano tutti e due per errore: si avvisa il secondo prima dell'acquisto (la coppia ha già accesso) e si spiega come chiedere il rimborso.
  4. Cosa succede ai contenuti creati con le funzioni a pagamento quando l'abbonamento scade: **restano visibili** (proposta), si blocca solo la creazione di nuovi.

---

## 4. Proposta per la nuova delibera D4

> **Decisa il 28/10/2026.** Cosa cambia rispetto alla proposta qui sotto:
> - Gioca gratis passa a **una partita al giorno** già dal lancio, non «una al giorno per tipo»;
> - gli stili del widget restano fuori da Plus per ora;
> - Plus aggiunge pacchetti a tema;
> - se la coppia si chiude, il partner perde l'accesso **subito**;
> - il partner di chi paga vede «Plus attivo, grazie a [nome]» al posto del pulsante d'acquisto.
>
> Il lancio in produzione è gratis; Plus arriva 4–6 settimane dopo.

### 4.1 Principi proposti

1. **Il cuore di US resta gratis per sempre:** il gesto che arriva all'altro (Ti penso, Lasciato per te, la domanda di oggi, il widget, il calendario) è il prodotto. Se si blocca, US smette di funzionare per la coppia.
2. **Si paga per avere di più, non per non perdere qualcosa:** niente serie da riparare, niente valute, niente ricordi presi in ostaggio.
3. **Un abbonamento per coppia:** paga uno, sbloccano tutti e due. È coerente con la natura di US e con Paired e Between.
4. **Chi è nella beta non vede pagamenti** (già deciso). Proposta in più: le coppie della beta ricevono un periodo premium gratuito come «coppie fondatrici», per esempio 6 mesi dopo il lancio, con la fonte `beta`.

### 4.2 Cosa resta gratis e cosa si blocca (proposta)

| Area | Gratis | Con l'abbonamento |
|---|---|---|
| Oggi, Ti penso, Lasciato per te, notifiche | Tutto | — |
| La domanda di oggi | La domanda del giorno | Archivio delle domande passate e possibilità di rispondere a quelle perse |
| Widget Android | Il widget «Due colori» | Altri stili e colori del widget |
| Noi: calendario e countdown | Tutto | — |
| Ricordi | Ricordi con un limite di spazio (da misurare) | Spazio più ampio e qualità originale delle foto. Le foto sono anche il costo principale di Supabase (egress). |
| Gioca e Sintonia | Una partita al giorno per tipo | Partite illimitate e pacchetti di giochi in più |
| Compagni | Maudit e quelli sbloccati con il livello | Da decidere: oggi si sbloccano con il livello e D5 vieta nuovi compagni. Proposta: lasciarli gratis. |
| Il vostro anno | Una versione breve | Il riepilogo completo |

È una proposta da provare con le coppie della beta, non una scelta. I limiti esatti (quanti ricordi, quante partite) si scelgono con i dati di uso reali, che da qui non ho letto. [N]

### 4.3 Fascia di prezzo (stima)

| Piano | Prezzo proposto | Al netto di IVA (22%) e Play (15%) [S] | Confronto |
|---|---|---|---|
| Mensile | **3,99 €** | circa 2,78 € | Sotto Lovewick (9,99) e Paired (14,99): US è all'inizio e senza recensioni |
| Annuale | **24,99 €** con 7 giorni di prova | circa 17,41 € | Vicino a Couple Joy (17,99–22,99) e Lovewick (29,99), sotto Paired (29,99–74,99) |
| Per persona | circa 1,04 € al mese sull'annuale | — | Argomento di vendita alla Paired |

Fascia da testare: **mensile 2,99–4,99 €, annuale 19,99–29,99 €**. Il calcolo del netto presume che la commissione di Google si calcoli sul prezzo senza IVA: da verificare. [N]

Prima di vendere servono anche verifiche fiscali e amministrative, da fare con un commercialista [N]:
- se Francesco può incassare come persona fisica o gli serve la partita IVA;
- quali dati di contatto Google Play mostra pubblicamente per chi vende nell'UE (obblighi del Digital Services Act per i «trader»). Sull'App Store e sul Chrome Web Store indirizzo e telefono diventano pubblici ([Chrome Web Store, FAQ trader](https://developer.chrome.com/docs/webstore/program-policies/trader-verification-faq)); per Google Play non l'ho verificato. L'account sviluppatore oggi è personale.

### 4.4 Come si sceglie il prezzo

1. Questionario alle coppie della beta (§4.6), con le domande di prezzo.
2. Prova su staging (§4.5) per vedere la schermata e tutto il percorso, senza soldi veri.
3. Al lancio, un solo prezzo. Play permette di cambiare il prezzo dopo; i vecchi abbonati restano al loro prezzo salvo un aumento comunicato. [N]

### 4.5 Come provarlo su staging (dopo la delibera, non ora)

Tutto richiede l'approvazione esplicita di Francesco passo per passo (creazione dell'app su Play Console, account RevenueCat, SQL su staging).

1. **App di staging su Play Console** con il pacchetto `com.usapp.us.staging`, solo nel test interno, con i soli tester con licenza (Francesco e Bea). Così i prodotti di prova non toccano mai `com.usapp.us` né i tester del test chiuso.
2. **Prodotti di prova:** un abbonamento con base mensile e annuale, offerta di prova di 7 giorni.
3. **RevenueCat** in modalità di prova, con il webhook verso una Edge Function di **US-STAGING**.
4. **Supabase staging:** tabella degli abbonamenti, RPC di lettura, RLS e test (pgTAP o quelli del repo) per «la coppia ha accesso se almeno uno ha un abbonamento attivo», chiusura della coppia, eliminazione dell'account, rimborso.
5. **App:** schermata di presentazione dell'abbonamento e blocchi solo dietro un interruttore lato server, **spento in produzione**. La build di produzione non deve contenere percorsi di acquisto attivi finché non c'è il via.
6. **Scenari da provare** con le carte di prova: acquisto, rinnovo, disdetta, carta rifiutata, periodo di tolleranza, rimborso, il partner che vede l'accesso, la coppia che si chiude, l'eliminazione dell'account, reinstallazione e «ripristina acquisti».

### 4.6 Domande per le coppie della beta

Da mandare a ciascuna persona separatamente (non alla coppia insieme), dopo almeno una settimana d'uso. Formato breve, 3–4 minuti.

**Uso e valore**
1. Quali tre cose di US usate di più? (scelta multipla con l'elenco delle funzioni)
2. Se domani sparisse una funzione, quale vi mancherebbe di più? Perché?
3. C'è qualcosa che vorreste fare con US e oggi non potete?
4. Avete già pagato un'app per coppie? Quale e quanto?
5. Chi dei due, nella vostra coppia, di solito paga gli abbonamenti digitali? (io / lui o lei / dividiamo / dipende)

**Prezzo** (le quattro domande del metodo Van Westendorp, per un abbonamento **per tutti e due**, al mese)
6. A che prezzo US sarebbe così economica da farti dubitare della qualità?
7. A che prezzo sarebbe un buon affare?
8. A che prezzo inizierebbe a sembrarti cara, ma la prenderesti comunque?
9. A che prezzo sarebbe troppo cara per prenderla?
10. Preferiresti pagare al mese, all'anno (con uno sconto) o una volta sola per sempre?

**Cosa si paga**
11. Per quali di queste cose pagheresti? (archivio delle domande, giochi illimitati, più spazio per le foto, stili del widget, «Il vostro anno» completo, nessuna)
12. C'è qualcosa che, se diventasse a pagamento, ti farebbe smettere di usare US?

**Passaparola** (utile anche per il marketing)
13. Come descriveresti US a un'amica o a un amico in una frase?
14. Ci saremmo potuti trovare su TikTok? Che tipo di video ti avrebbe convinto?

### 4.7 Cosa doveva decidere Francesco per chiudere D4 (deciso il 28/10)

1. Freemium per coppia sì o no.
2. Elenco gratis / a pagamento (§4.2), anche solo come direzione.
3. Fascia di prezzo da testare (§4.3).
4. RevenueCat o integrazione diretta (§3.6).
5. Le quattro regole sui casi limite (§3.7).
6. Periodo gratuito per le coppie della beta: sì o no, e quanto.
7. Via libera alla prova su staging (§4.5), passo per passo.

---

## Fonti

**Couple Joy e marketing**
- Forbes România, 14/10/2025, intervista ai fondatori: https://www.forbes.ro/?p=469987
- Social Growth Engineers, «Couplejoy: we'll see each other tomorrow?», 17/06/2025: https://www.socialgrowthengineers.com/couplejoy-well-see-each-other-tomorrow
- Handler, outlier Couple Joy (@tweetyandkevin, 10/08/2025): https://gethandler.ai/outliers/relationship-apps-tiktok-silent-ugc-17966x/
- The Playkit Report, «Couple Joy: Faceless Slideshow Growth», 02/07/2025 (in gran parte a pagamento, non usata per i numeri): https://playkit.substack.com/p/couple-joy-faceless-slideshow-growth
- StartupTalky, caso Flamme: https://community.startuptalky.com/discussions/post/this-couples-app-pulled-50m-organic-views-from-tiktok-accounts-with-I3cyceC6JAOK7wR
- Sito di Couple Joy: https://couplejoyapp.com
- TikTok, impostazione per i contenuti commerciali: https://ads.tiktok.com/help/article/how-to-turn-on-the-commercial-content-disclosure-setting-in-tiktok
- IAP, Regolamento Digital Chart: https://www.iap.it/wp-content/uploads/2020/06/Regolamento-Digital-Chart.pdf
- AGCOM, Allegato A sugli influencer (2026): https://www.agcom.it/sites/default/files/media/allegato/2026/Allegato%20A%20-%20Quadro%20normativo%20e%20profili%20procedurali%20-%20Influencer.pdf

**Prezzi delle app di coppia** (lette il 28/10/2026)
- Couple Joy, App Store IT: https://apps.apple.com/it/app/id1624758651 · US: https://apps.apple.com/us/app/couple-joy-relationship-app/id1624758651
- Paired, App Store IT: https://apps.apple.com/it/app/id1469609343 · FAQ: https://www.paired.com/frequently-asked-questions · Premium: https://support.paired.com/en/articles/164633-what-s-paired-premium
- Agapé, App Store IT: https://apps.apple.com/it/app/id1507907556
- Lovewick, App Store IT: https://apps.apple.com/it/app/id1516199115
- Between, App Store US: https://apps.apple.com/us/app/id458035189

**Google Play e pagamenti**
- Policy Pagamenti di Google Play: https://support.google.com/googleplay/android-developer/answer/9858738
- Condizioni generali di accesso a Google Play nello SEE (programmi e commissioni): https://support.google.com/googleplay/android-developer/answer/14659200
- Android Developers Blog, 04/03/2026, «A new era for choice and openness»: https://android-developers.googleblog.com/2026/03/a-new-era-for-choice-and-openness.html
- Android Developers Blog, 24/06/2026, «Expanded billing choice and lower fees on Google Play»: https://android-developers.googleblog.com/2026/06/play-expanded-billing.html
- Play Billing Library, FAQ sul ritiro delle versioni: https://developer.android.com/google/play/billing/deprecation-faq
- Play Billing, test: https://developer.android.com/google/play/billing/test
- Play Billing, notifiche in tempo reale: https://developer.android.com/google/play/billing/rtdn-reference
- Play Console, tasse: https://support.google.com/googleplay/android-developer/answer/138000
- Stripe, prezzi Italia: https://stripe.com/it/pricing
- RevenueCat, prezzi: https://www.revenuecat.com/pricing/ · SDK Capacitor: https://www.revenuecat.com/docs/getting-started/installation/capacitor · eventi webhook: https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
- iaptic, plugin Capacitor nativo con Billing 8.3: https://www.iaptic.com/blog/20260407-capacitor-native-plugin
- Chrome Web Store, FAQ sullo stato di trader (DSA): https://developer.chrome.com/docs/webstore/program-policies/trader-verification-faq
