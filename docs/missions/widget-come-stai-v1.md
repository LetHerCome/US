# Widget «Come stai» V1 — disegno, prima del codice

**Fonte:** founder, 02/11/2026: widget 5 della famiglia «Pastello», tavola approvata (`Stato.dc.html`, https://claude.ai/artifact/PvmHiSaPhF27JhLr1DzBg4). È una funzione nuova anche nell'app: «Fallo per ULTIMO: prima scrivi un breve disegno».
**Branch:** `claude/gallant-ardinghelli-bb2acf`. Solo Android per il widget. Prima staging; la produzione solo con il via del founder.
**Stato:** disegno scritto il 02/11/2026; il founder ha risposto lo stesso giorno, tutte le risposte come la proposta (`docs/DECISIONS.md`). Codice nel branch; la migrazione su staging la lancia la sessione principale col workflow approvato dal founder.

## Cosa mostra la tavola

- **2×2:** la foto (o l'iniziale) e il nome di chi ami, la sua emoji grande, sotto «innamorata · da 1 ora».
- **4×2:** metà rosa per te («Tu», 😴, «stanco · da 20 min»), metà lilla per chi ami (🥰, «innamorata · da 1 ora»), un cuore nel mezzo.
- Carte Pastello: rosa `#ffd6df → #ffeef2`, lilla `#e3d8ff → #f4efff`, inchiostro `#1a1020`, testo secondario `#5b4a63`.

## Proposta

### Dove si sceglie lo stato

- **Nell'app, in Oggi:** una riga «Come stai?» vicino alla pillola della batteria del partner (la stessa zona di Noi). Un tocco apre un foglio con la griglia di emoji; un tocco su un'emoji salva e chiude. «Togli» lo cancella.
- **Dal widget:** il tocco apre US in Oggi, direttamente su quel foglio.
- **Niente scrittura dal widget in V1.** Scegliere lo stato sopra la Home (una finestrella come il cuore di Ti penso) chiederebbe un nuovo permesso di scrittura per il widget: un token del dispositivo con uno scope suo, un'Edge e un'RPC con il controllo di coppia, come il disegno di sicurezza della Nota. Si può fare in un secondo momento.

### Gli stati

- **Una lista fissa**, niente testo libero: niente da moderare e niente da nascondere nei widget. Proposta di 12:
  🥰 innamorato/a · 😊 felice · 😴 stanco/a · 😔 giù · 😤 nervoso/a · 🤒 non sto bene · 🥳 in festa · 💼 al lavoro · 📚 studio · 🏋️ in palestra · 🚗 in viaggio · 🍝 a tavola.
- **Le parole al maschile o al femminile** non si deducono dal nome né dal ruolo: ognuno sceglie in Impostazioni › Tu › «Come stai». Senza scelta, la parola non declinata: «in amore», «senza energie», «nervi tesi».

### Quanto dura

- Lo stato **sparisce dopo 12 ore**, o prima se lo cambi o lo togli. Riscegliere lo stesso stato mentre si vede ancora non cambia l'ora; scaduto, riparte. Il widget mostra «da 20 min», «da 1 ora» (a passi di 5 minuti nella prima ora) e si ridisegna da solo quando scade.

### Dati

- **Tabella nuova `public.member_status`**, una riga per persona:
  - `user_id` (chiave), `couple_id`, `status` (una delle chiavi della lista, con un vincolo `check`), `form` (`m`, `f` o niente), `set_at`, `expires_at`;
  - scritture con `set_member_status(p_status)` e `set_member_form(p_form)`;
  - `set_at` e `expires_at` li scrive un trigger del server, mai il telefono (l'ora del telefono può essere sbagliata);
  - cambiare stato sovrascrive la riga: **niente storico**.
- La vecchia `public.moods` (una riga per persona e giorno, oggi non usata dall'app) non va bene: tiene lo storico e non ha l'ora del cambio. Resta com'è.
- **RLS:**
  - lettura: solo chi è nella stessa coppia (`couple_id` uguale a quello del proprio profilo);
  - inserimento e modifica: solo la propria riga, e solo con il proprio `couple_id`;
  - cancellazione: solo la propria riga.
- **Eliminazione dell'account, uscita dalla coppia ed export dei dati:** `user_id` va in cascata dal profilo, come la batteria; la tabella è nell'export (`s3-2-export-core.mjs`).
- **Tempo reale:** la tabella entra nel canale Realtime unico dell'app (`startUsRealtime`), come la batteria: lo stato dell'altro arriva senza ricaricare.
- **Migrazione** solo su staging, con il workflow «Supabase SQL (manual)» approvato dal founder. Mai `db push`, mai produzione senza il suo via.

### Widget

- Lo snapshot riceve per ognuno dei due solo `status`, `form`, `at` e `until`. Le parole e le emoji stanno nell'app e nel widget, dalla stessa lista.
- 2×2: chi ami. 4×2: tu e chi ami, il cuore nel mezzo. Senza stato: «＋ Come stai?» sulla tua metà, «… ancora niente» su quella dell'altro.
- Avatar come gli altri widget Pastello: la foto rotonda con l'anello del colore della persona, altrimenti l'iniziale sul colore.
- Il widget non va in rete: legge solo lo snapshot che l'app scrive.

### Privacy

- Nella privacy, IT ed EN: lo stato che scegli lo vede solo chi ami, nell'app e nel widget; si cancella dopo 12 ore o quando lo togli; nessuno storico.

## Domande per il founder (risposte del 02/11/2026: tutte come la proposta)

1. **Dove si sceglie:** solo nell'app (Oggi, e il widget apre lì), come propongo? Oppure vuoi già in V1 la scelta sopra la Home dal widget, che chiede un permesso di scrittura nuovo e più lavoro di sicurezza?
2. **Parole al maschile o al femminile** («innamorata», «stanco»): ognuno sceglie la forma nel profilo, oppure parole che non cambiano («innamoramento», «stanchezza», «giù di morale»)?
3. **Gli stati:** vanno bene i 12 proposti, o ne vuoi altri? Uno con testo libero è escluso di proposito.
4. **Quanto dura:** 12 ore, fino a mezzanotte, o finché non lo cambi?
5. **Avvisare l'altro:** una notifica quando cambi stato, o solo widget e app (proposta: niente notifica)?
