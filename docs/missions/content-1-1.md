# Mission — Contenuti 1.1 (ispirati a Paired, nel tono di US)

**Status:** IN BRANCH, su staging dopo i test
**Branch:** `claude/payred-app-comparison-b2594e`
**Origine:** richiesta del founder del 22/10/2026: rendere US «piena di contenuti» prendendo ispirazione da Paired, senza copiarne le funzioni e senza nulla di terapia ([DECISIONS](../DECISIONS.md), 22/10).

## Goal

Più contenuti nei formati che US ha già, scritti nel suo tono (leggero, intimo, giocoso, mai clinico), così che domande e giochi non si ripetano per mesi.

## Da Paired: i formati, non i testi

| Formato in Paired (APK 26.41.0) | Dove va in US | Nuovi |
|---|---|---|
| Domanda del giorno | banca `daily_question_templates`, 7 temi | +26 per tema = **182** (il ciclo passa da 26 a 52 settimane: un anno senza ripetizioni) |
| Quiz «quanto conosci l'altro», con punteggi | Gioca › `quanto_mi_conosci` (previsione) | **+24** |
| «You or Me», chi di noi due… | Gioca › `ridete`, risposte `{francesco}` / `{beatrice}` / noi due | **+20** |
| Pacchetti a tema (scoprirsi, scegliere insieme, ricordi) | Gioca › `scopritevi`, `confrontatevi`, `rivivete` | **+16, +12, +12** |
| Carte da scorrere, This or That | Swipe | **+30** |
| Missioni segrete, piccoli gesti («un abbraccio di 20 secondi») | Missioni di coppia (`bond_quest_templates`) | **+16** |

**Totale:** 312 contenuti, tutti in italiano e in inglese.

## Regole di scrittura

- Seconda persona, tono di US: tenerezza, gioco, curiosità. Niente linguaggio da terapia: niente «comunicazione», «bisogni», «conflitto», «lavorare sulla relazione».
- Niente che dia per scontata una durata, una convivenza, dei figli o il genere di chi legge (decisione del 19/10). Nomi solo tramite `{francesco}`, `{beatrice}` e `{subject}`.
- Intimità sì, esplicito no.
- Nessun doppione delle 182 domande del giorno e dei 212 + 67 contenuti di gioco esistenti; il test controlla anche le frasi quasi uguali.
- L'inglese segue il glossario (`docs/product/i18n-glossary.md`).

## Tecnica

- **Bozze leggibili** in `supabase/game-v2/content-1-1/`, generate in SQL da `scripts/build-content-1-1-sql.mjs` tra i marcatori `content-1-1:begin/end` della migrazione; `tests/content-1-1-catalog.test.js` fallisce se divergono. È lo stesso schema di Contenuti 1.0.
- **Solo inserimenti** (`on conflict do nothing`): nessuna cancellazione, nessun cambio a grant, RLS o funzioni. Riapplicare non cambia nulla.
- **Domande del giorno:** `sequence` da 27 a 52 per giorno della settimana. La scelta (`materialize_daily_question`) prende prima i modelli mai usati, quindi le nuove escono subito e la logica non cambia.
- **Missioni:** stesse categorie, rarità e XP delle esistenti (25, 40, 60, 100); entrano da sole nella scelta settimanale. L'XP è quella legacy, nessun premio nuovo.

## Fuori scope

Nuovi formati di gioco, famiglie nuove (`e_se` resta ritirata), insights, percorsi, check-in (resta su staging), nuovi compagni.

## Acceptance

- Test della banca contenuti verdi; migrazione applicata sullo schema completo in PGlite e riapplicata senza cambi.
- `npm test`, `npm run build:cloudflare-pages`, `git diff --check`.
- Applicata **solo su staging**; in produzione solo con approvazione del founder.
