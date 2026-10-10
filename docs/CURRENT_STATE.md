# US — Current State

**Status:** OPERATIONAL STATUS AUTHORITY
**Verified snapshot:** 2026-10-10
**Verified main SHA:** b0c9f82d7830f13a0310016067e36da961855d23

## US Store 1.0 — current authority

- D1/D2/D3/D5 approved. D4 monetization remains undecided. No pricing, paywall or billing authorized.
- Product V1: Oggi, Noi, Ricordi, Gioca. Sintonia remains in Gioca; Noi is the single calendar; full topbar only on Oggi.
- No new Arcade, extra mascots, full Diary/Scrapbook or broad redesign before V1. Signup, data privacy, security, reliability and compliance remain necessary release work.
- Main includes Daily Reveal V6 and MC3 onboarding code. Public self-signup and complete native shared-account notification isolation are NOT launch-ready.
- PR #170 widget V2 + motion is draft, not merged. Last code includes Ti Penso ready and 24h count, Noi portrait+distance, no GIOCA CTA, no global tab swipe. Its PR description is stale.
- PR #177 server-backed weekly participation is draft, not merged and SQL not applied to production.
- Main Android signed CI and iOS simulator CI were green on 9 October. Real Android signed-upgrade QA, privacy/account deletion and Play listing remain open.
- Full suite has about 40 baseline failures reported; triage required. N3.7 global sizing remains frozen.
- Never conflate designed / committed / merged / deployed / physically tested states. Merge, production SQL and store submission each need separate authorization.

**Working plan:** [Carta Store](store/US_STORE_1_0_CHARTER.md) · [Baseline](store/US_STORE_1_0_BASELINE.md) · [Execution](store/US_STORE_1_0_EXECUTION.md) · [Quality Gates](store/US_STORE_1_0_QUALITY_GATES.md) · [First Mission](missions/us-store-s1-android-release-baseline-v1.md).

## Historical operating snapshot (2026-10-04, superseded for current status)

**Status:** OPERATIONAL STATUS AUTHORITY  
**Snapshot:** 2026-10-04  
**Production main at snapshot:** `33aef370837f152ba9d338745fdd4ec1fe5b0c58`

This file is intentionally short. Update it after meaningful merges. For current implementation status it overrides stale status tables in older roadmap/milestone documents.

## Foundation

**US 2.0 backend foundation: COMPLETE.**

Closed and merged:
- F2A.1 production capture;
- F2A.2 migration baseline;
- F2C Edge/Cron source of truth;
- Security/RLS hardening;
- F2A.3 retention/operations.

Operational retention and Left-for-You cleanup are active. Product work is the priority.

## Live product

Primary navigation:
- Oggi
- Noi
- Ricordi
- Gioca

Important live capabilities:
- email + password login;
- Oggi hero, Daily Question, calendar insight, Ti penso and Lasciato per te;
- Noi with Sintonia, Ritmo, rewards/unlocks, Quest, Calendar and Events;
- Ricordi with Moments/albums, Conservati, chapters and contextual Rivivi;
- Gioca Game V2 with Per voi, Swipe, six game families, sealed rounds/reveal and weekly custom question;
- calendar month/week, start/end time and quick presets;
- Stories and archive;
- Web Push (Native Notifications V1 — FCM/APNs through the same dispatcher — is a review candidate, not live: needs Firebase/APNs configuration and the rollout in `docs/native/NATIVE_NOTIFICATIONS_V1_ROLLOUT.md`);
- PWA + existing Capacitor/native support.

## Current product focus: Gioca

Decided next work:
1. Live Game Foundation + Pulse V1.
2. Then Stack Together.
3. Then Relay.
4. Then Duo Maze once the live layer is proven.
5. Separately: move questionnaire/game weekly allowance from 3 to 5.
6. Weekly content refresh and larger Gioca catalog.
7. Redesign “Crea domanda” to be obvious: write → seal → partner discovers it while playing.

Arcade does not consume the questionnaire Game V2 weekly allowance in the first live-games mission.

## Secondary follow-ups

- password recovery/change-password UX;
- Rivivi resurfacing beyond anniversary-only cases;
- simplify Noi/Sintonia presentation;
- absorb or retire the hidden Da vivere surface;
- frontend/CSS consolidation without redesign;
- future productization: remove hardcoded couple-specific assumptions and add onboarding.
