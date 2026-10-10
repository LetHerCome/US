# US Store 1.0 — Baseline tecnica e matrice di stato

**Rilevazione:** 2026-10-10, lettura GitHub e Supabase; non equivale a test end-to-end della produzione.
**main HEAD (verificato):** b0c9f82d7830f13a0310016067e36da961855d23, merge di PR #176 (Daily Reveal V6).
**Branch del piano:** mission/us-store-v1-phase0-lock-20261010 — solo documentazione.
**Fonti di autorità:** GitHub main/PR/Actions, Supabase project US; confrontare con snapshot fresco prima di ogni missione.

## 1. Ambiente e distribuzione

| Layer | Verificato | Limite dell'evidenza |
|---|---|---|
| Repo | LetHerCome/US, public, default main | Main non protetto da branch protection; richiede disciplina del merge |
| Frontend | Vanilla HTML/CSS/JS, PWA, build Cloudflare Pages | Check deploy green non certifica tutte le esperienze online |
| Android | Capacitor 8, appId com.usapp.us, compile/target API 36, min API 26 | Build CI riuscita; test di upgrade e regressione fisica non certificati per ultima V6 |
| iOS | Capacitor 8 Swift Package Manager, target iOS 16 | Simulatore CI green, nessun signoff su iPhone fisico/App Store |
| Auth | Email/password; onboarding MC3 e inviti MC2 nel codice | Public signup OFF; beta multitenant non autorizzata fino al closing sicurezza |
| Backend | Supabase US, PostgreSQL 17 (eu-west-3) ACTIVE_HEALTHY | RLS/permessi e comportamento notifiche richiedono QA mirata |
| DB | 58 tabelle public, tutte con RLS; 9 migrazioni registrate | Attenzione a eventuale drift delle migrazioni SQL |
| Edge | 14 Edge Functions segnalate ACTIVE | ACTIVE non prova delivery end-to-end |
| Popolamento | Una coppia e due profili applicativi al momento audit | Nessuna seconda coppia reale provata sul server |

## 2. Versione integrata, componenti e debiti

| Superficie | Presenza in main | Note di rilascio |
|---|---|---|
| Oggi | Foto, Countdown, Ti Penso, Lasciato per te, Daily, temi/effetti V3 | Migrazione cosmetici V3 proposta ma non registrata su Supabase |
| Noi | Calendario unico mese/elenco/settimana V4 | Rimuovere scaffolding legacy solo dopo QA, non nella S1 |
| Ricordi | Feed e carousel inline, thumbnails WebP, Conserva/Rivivi | Verificare performance foto reali e gesture su Android |
| Gioca | Daily hero V4, bento, Game V2, Sintonia in seconda tab, V6 Daily Reveal | Settimana server reale non ancora presente in main |
| Shell | Barra completa solo su Oggi, popup centrali, edge-to-edge native, feedback sonoro/aptico | QA fisica viewport/safe area, tastiera e motion |
| Maudit | Mascotte base animata | Collezione Compagni è un blueprint NON runtime |
| Widget Android | Provider/widget V1 in main | Widget V2 + premium motion su draft #170, non integrati |
| Notifiche | Web Push + codice integrazione nativa | Device push tokens 0 nella tabella applicativa al 10/10; non attribuire stato di delivery certa |
| Account | MC2/MC3 integrati | Autoregistrazione, recupero completo, eliminazione/separazione e isolamento push da finire |

## 3. PR attive — non confondere green con merge

- **#170** https://github.com/LetHerCome/US/pull/170 — draft, HEAD b58fb08af50d4246de91375d15f84aa175c46831; include widget e premium motion. Il **codice aggiornato** di questo branch comprende il feedback del 9/10: Ti Penso pronto subito con contatore locale 24 h, Noi 2×1 con ritratti+distanza, niente CTA GIOCA, swipe globale tab rimosso, guida statica rimossa. La PR *body* è precedente e non descrive fedelmente HEAD. Diverse CI di integrazione verdi e APK QA firmato generato; mancano rebase/reconciliation con main V6 e signoff fisico.
- **#177** https://github.com/LetHerCome/US/pull/177 — draft, HEAD d9a6a1066b8039a9d6be4c0271cb70da9d9aa16f; settimana reale dalla prova di partecipazione Daily + stessa sessione completata in data Europe/Rome, XP ledger autoritativo e RPC sicura. Linux PG17, mobile Chromium, Android/iOS e UI CI finali verdi. Migrazione NON applicata al DB produzione; non autorizzati merge, deploy, APK.
- **#167/#168/#169** — branch draft sorgenti di #170; non mergiare separatamente sopra #170. **#144**, **#67** — draft/storici, decidere chiusura o mantenimento dopo audit; nessuna presunzione di rilascio.

## 4. CI e stato QA

- Main V6: ultimo check Cloudflare Pages PASS; signed Android APK, iOS Simulator, Daily mobile e UI contract checks PASS su HEAD b0c9f82d.
- PR #170: job Android/iOS + motion/widget + signed QA APK PASS a SHA b58fb08; non dimostra compatibilità corrente con main più nuovo o correttezza sul telefono reale.
- PR #177: checks finali PASS a SHA d9a6a1; la full suite nel report termina con **40 failure ereditate**, 1642 pass, 111 skip su 1793 test. La full suite non è GREEN; la parità con baseline non è permesso permanente a ignorarla.
- Eseguire matrice manuale Android: update senza uninstall, 4 widget già installati, keyboard emoji, sign-in persistente, network interruptions, Ricordi multi-foto, motion e Back, diverse risoluzioni, lock/notification.
- N3.7 sizing globale è congelato per delibera precedente; riaprire solo con evidenza di blocker reale, non per estetica.

## 5. Sicurezza e privacy — verifiche aperte

Ultimo advisor Supabase, 10/10:
- 25 avvisi informativi RLS enabled/no policies (spesso accesso via RPC; **non** considerare automaticamente vulnerabilità);
- 42 funzioni SECURITY DEFINER eseguibili da utenti autenticati (review di grants, membership, search_path);
- protezione password compromesse disabilitata;
- 46 foreign key non indicizzate, 37 initplan warnings, 3 multiple permissive policies.

**Gate bloccante multi-coppia:** in MC3 l'isolamento completo dei push su device condiviso NON è dimostrato. Revoca server e unregister del provider possono fallire, lasciando notifiche del vecchio account. Testare FCM reale, process kill, offline/logout/cambio account, errore revoca e retry. Non attivare beta pubblica multi-coppia finché questo non è risolto.

**Gate privacy negoziale:** definire account deletion (in-app e Web), export, cancellazione media privati e gestione della proprietà condivisa senza lasciare accesso a ex partner. App Store/Google Play disclosures da compilare su comportamenti verificati, non desiderati.

## 6. Regole Play verificate e rischi

- API 36 richiesta per nuove submission Play dal 31/08/2026: Android US ha target 36.
  Fonte: https://developer.android.com/google/play/requirements/target-sdk
- Gli account *personali* Play creati dopo 13/11/2023 devono soddisfare test chiuso con almeno 12 tester iscritti per 14 giorni prima di chiedere accesso production. Applicabilità all'account da verificare.
  Fonte: https://support.google.com/googleplay/android-developer/answer/14151465
- Le app con account creati internamente richiedono richiesta eliminazione account sia in-app sia via risorsa Web, e Data Safety/privacy accurate.
  Fonte: https://support.google.com/googleplay/android-developer/answer/10144311
- Play App Signing/AAB: proteggere l'attuale certificato di firma e decidere se riusare la stessa app signing key per gli aggiornamenti da APK esterni. **Non** scegliere nuova key prima di misurare impatto sugli installati.
  Fonte: https://developer.android.com/studio/publish/app-signing

## 7. Semaforo operativo

- **GREEN — esistente:** backend attivo, 4 tab, prodotti core, build signed Android, simulator iOS, API 36.
- **AMBER — candidato:** PR #170 e #177, runtime onboarding MC3 da collaudare multi-coppia, performance/UX e packaging Android.
- **RED — gate pubblico:** signup pubblico governato, account deletion/Web, isolamento notifiche, Play Console/test track e signing continuity, privacy/legal listing, QA device generale.
- **GRAY — non deciso:** modello economico D4, date di go-live, UI premium oltre al polish e costo d'infrastruttura per coppia.

Nessuna sezione di questo baseline autorizza modifiche in produzione.
