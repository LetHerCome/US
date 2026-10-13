# US — Current State

**Status:** OPERATIONAL STATUS AUTHORITY
**Verified snapshot:** 2026-10-10
**Verified main SHA:** 0682a9b4db45c44914cbcfba9d29c09356d82353 (Store S1-A #179 merged)

## US Store 1.0 — current authority

- D1/D2/D3/D5 approved. D4 monetization remains undecided. No pricing, paywall or billing authorized.
- Product V1: Oggi, Noi, Ricordi, Gioca. Sintonia remains in Gioca; Noi is the single calendar; full topbar only on Oggi.
- No new Arcade, extra mascots, full Diary/Scrapbook or broad redesign before V1. Signup, data privacy, security, reliability and compliance remain necessary release work.
- Main includes Daily Reveal V6 and MC3 onboarding code. Public self-signup and complete native shared-account notification isolation are NOT launch-ready.
- **Store S1-A widget V2 + Premium Motion is MERGED in main** via PR #179 on 2026-10-10. Includes Ti Penso ready/24h count, Noi portrait+distance without GIOCA CTA, Foto & Noi follows Oggi, no global tab swipe and static guide removed. **PRs #167–#170 were closed as superseded**, not merged separately. Main CI signed Android and iOS simulator are green; this does not certify physical Xiaomi QA.
- **Store S2 week participation is OPEN DRAFT PR #180** (latest candidate HEAD c5602b6a097fdaed66dc3b5b6b61f79bcfce726d; 9/9 focused CI), rebased/reconciled on Store S1-A. Source PR #177 remains unmerged. Proposed PostgreSQL migration `20261009185803_us_v6_week_participation.sql` is **NOT applied to production**; production server RPC is absent, while isolated US-STAGING has the S2 candidate installed and tested. Git V3 cosmetics SQL is also not applied to production. Full independent/security + hosted staging gate remains before production SQL approval.
- Main S1-A post-merge Android signed APK, iOS simulator, widget, motion and Daily/mobile CI are green on 10 October; physical Android signed-upgrade QA, native cross-account push security, privacy/account deletion and Play listing remain open. S3/P0 native notification isolation is tracked as GitHub issue #181.
- **S3 native Android data-only FCM / account owner gate:** [DRAFT PR #187](https://github.com/LetHerCome/US/pull/187) latest candidate `c8ab600c2025a9ae24747914bc40262a9d6f7304`, **5/5 CI PASS** including Android merged-manifest single guarded receiver, iOS Simulator, signed QA APK (signature matches approved S1-A); **not merged or deployed**. Existing production Edge emits incompatible legacy personalized alerts; phone A→B/offline/queued FCM QA and iOS/APNs privacy are NOT proven. Old draft #186 closed as superseded; P0 issue #181 open.
- **US-STAGING** (Supabase `dugmhngrfkuieeletatb`, Free $0/month) now has **source schema parity, plus candidate S2 SQL applied to STAGING ONLY**. Hosted postflight: sealed Daily receipt, private helper, public authenticated RPC, locked-down client grants; 7/7 RLS and 9/9 US cron jobs **inactive**. Ephemeral synthetic multi-couple + FCM token ownership smoke PASS, with 0 fake Auth users/profiles/couples/device tokens remaining. Production S2 RPC/receipt still absent and untouched. The migration ledger uses **11 staging-specific versions**, not the repo's numeric timestamps, so never blindly `db push`. [Evidence](store/US_STAGING_STATUS.md) · [Repeatable smoke](store/US_STAGING_S2_S3_SYNTHETIC_SMOKE.sql).
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
