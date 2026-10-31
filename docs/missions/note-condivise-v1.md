# Note condivise V1

**Fonte:** founder, 30/10/2026 («In noi inserire le note condivise come couple joy») e grill del 31/10/2026 (D7, D8, D16), riepilogo confermato.
**Branch:** `claude/note-condivise`. Prima staging, poi produzione solo con il via del founder.

## Cosa

In Noi, sotto il calendario, un quarto collegamento **Note** accanto a Lavagna, Missioni ed Eventi. Apre un Foglio con le note della coppia.

- Una nota ha un **titolo**, un **testo** e, volendo, una **lista a spunta** (spesa, valigia, film da vedere).
- **Tutti e due** possono creare, modificare, spuntare ed eliminare ogni nota.
- Sotto ogni nota: chi l'ha modificata per ultimo e quando («Bea · ieri»).
- Niente foto né allegati in V1.

## Quadratini (founder, 31/10/2026)

«Le note intendo come un quadratino dove si possano vedere senza entrarci e scrivere lì sopra.»

- Le note sono una **griglia di quadratini** a due colonne, il primo è «Nuova nota». Ogni quadratino mostra il titolo, il testo oppure le prime tre voci ancora da fare, chi l'ha toccata per ultimo e quante voci sono fatte («1 di 7»), con il colore di quella persona.
- Le voci si **spuntano sul quadratino**, senza aprirlo, e si salvano subito.
- Toccando il quadratino **ci scrivi sopra**: si allarga a tutta riga sul posto, con il cursore dove hai toccato (titolo, testo o voce). «Fatto» lo richiude.
- In più, un **widget sulla home** con una nota scelta: affidato alla sessione dei widget (spunta sul widget, matita che apre una finestrella di scrittura sopra la home).

## Due persone che scrivono insieme (D8)

Vince l'ultimo salvataggio. Se l'altra persona modifica la nota che hai aperta, compare un avviso: «Bea l'ha appena modificata». Senza modifiche tue in sospeso la nota si aggiorna da sola; con modifiche tue in sospeso l'avviso offre di caricare la sua versione. Niente scrittura contemporanea in tempo reale.

## Scelte tecniche

- **Tabella `public.couple_notes`:** `couple_id` (cascade con la coppia), `title`, `body`, `items` (jsonb, lista di `{id, text, done}`), `created_by` e `updated_by` (profili), `created_at`, `updated_at`, `revision`.
- **RLS stessa coppia** con `private.current_couple_id()`, come `bucket_items`. Un trigger scrive `updated_by`, `updated_at` e `revision` dal server (mai dal client); `couple_id` e `created_by` non cambiano. Limiti: titolo 80 caratteri, testo 4000, lista 100 voci da 200 caratteri, 300 note per coppia, niente note vuote.
- **Account e coppia (S3.2):** `created_by`/`updated_by` sono contenuto condiviso: FK verso `profiles` NO ACTION, staccati (null) da `private.s32_close_membership` quando una persona lascia la coppia o elimina l'account. Le note restano all'altra persona. Classificate in `tests/s32-fk-resolution.test.js`.
- **Export dei dati:** le note scritte da te entrano in `s3-2-export-core.mjs`.
- **Tempo reale:** la tabella entra in `supabase_realtime`; l'app ascolta i cambi della coppia. Niente `replica identity full`: le cancellazioni arrivano solo con l'id.
- **Client:** modulo `couple-notes.js` + `couple-notes.css` (come `year-recap.js`), Foglio in `index.html`, chiusura con il tasto indietro in `navigation.js`. Salvataggio automatico dopo una breve pausa e alla chiusura.

## Fatto quando

Test del database (stessa coppia sì, altra coppia no, limiti, autore dal server, uscita dalla coppia), test del client, `npm test`, `npm run build:cloudflare-pages`, `git diff --check`; prova nel browser a misura di telefono; migrazione su staging con il workflow, approvata dal founder.
