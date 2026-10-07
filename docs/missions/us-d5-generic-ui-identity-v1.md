# D5 — Generic UI Identity V1 (US multi-couple readiness)

**Status:** READY FOR IMPLEMENTATION (audit/spec only; NOT implemented)  
**Base:** `main` @ `dfeb05a4dd04a283b7f1db275df15354a37b8829` (MC2 merged, migration applied remotely after separate authorization).  
**Mission branch:** `mission/us-d5-generic-ui-identity-v1`  
**Owner:** Codex. Start with GPT-6 Luna; escalate to GPT-6.1 Sol only for difficult identity lifecycle / concurrency / privacy review. No Opus required by default.

## Purpose

Make the existing US interface and outgoing game notifications identify **each couple's actual members**. Couple A (Francesco / Beatrice) must preserve its current displayed identities, while an independent Couple B (e.g. Alex / Sam) must see **only** Alex / Sam. The internal compatibility role values `francesco` and `beatrice` remain exactly as they are and do **not** imply real-world name, gender, initials or partner identity.

**No signup, onboarding or MC2 backend change in D5.** This mission is the presentation-layer prerequisite for the 4-person beta.

## Authority and invariants

1. Read `AGENTS.md`, `docs/CURRENT_STATE.md`, `docs/DECISIONS.md` and this mission. Reuse `window.usProfile` and MC1 `window.UsCoupleContext` in `app.js`; do not create a parallel profile cache or source of tenant truth.
2. Tenant is always the signed-in user's `profiles.couple_id`. Partner = profile within the *same* couple whose `id !== window.usProfile.id`, not opposite gender or guessed slot. Display names come from `profiles.display_name`. The legacy role serves only as an internal slot/order key for backward-compatible RPCs/columns/UI selectors.
3. A missing profile, missing partner, network failure, app lock, offline boot, logout or account switch must render **neutral text** such as `La tua persona`, `Tu`, `Voi due`, `In attesa del partner`, never another couple's name or stale prior session data. Failure to load should not block the first Home paint. Avoid leaking names before authentication.
4. Guard asynchronous identity hydration against account/couple changes. Reset identity-derived state, cached fallback and rendered labels on logout/account switch. Refresh already-mounted views when names arrive (Gioca, Daily, Noi, calendar, widget previews). No infinite fetch/render loops.
5. User-controlled display names are **escaped** before HTML/template insertion. `textContent` where feasible; use existing `escapeHtml`/`esc` where HTML generation is necessary. Never authorize based on a display name or raw metadata.
6. No gender grammar from a role: replace forms that assume `francesco` is male and `beatrice` female with naturally neutral Italian.
7. No SQL migration; no changing `francesco_answer` / `beatrice_answer` persisted columns, no altered RPC signatures, no RLS changes, no data backfill, no Auth/Storage cleanup, no Settings UX redesign. Preserve progression's legacy one-time migration behavior.

## Repo audit — verified on 2026-10-08

**Urgent visible hardcoded names**
- `index.html:18,155`: document title and signed-out login/ARIA copy use Francesco + Beatrice.
- `index.html:306–319`: Noi avatars/placeholders + ARIA have F/B and personal names. IDs `pairAvatarFrancesco`/`pairAvatarBeatrice` and `data-noi-couple-role` are *internal compatibility selectors*; keep unless a separate safe refactor is justified.
- `index.html:555–561`: couple card `F/B` and `Francesco + Beatrice` fallback.
- `games.js:23–26`: `label(role)` hardcodes Francesco/Bea; used throughout Gioca for assigned turn, waiting, hints, predictions, reveal and summaries.
- `games.js:705–710`: outcome agreement assumes gender from role.
- `app.js:988`: distance waiting label guesses partner by role.
- `app.js:1784–1787`: `dailyRitualPartnerName` has static role fallback.
- `app.js:2103,2286,2427,2448`: daily outcome/reveal role-based Francesco/Bea labels.
- `app.js:2774`: Daily Keepsakes hardcodes `Francesco`/`Bea` next to `francesco_answer` and `beatrice_answer` columns; retain columns but map display labels from corresponding real profiles.
- `app.js:3755–3757`: Noi Ideas fallback is static by role.
- `widget-hub.js:45,70`: Ti penso preview falls back to Beatrice, Noi preview to Francesco + Beatrice.

**Other necessary surfaces**
- `app.js:105–142`: MC1 couple context already hydrates profile IDs/roles/names, guarded against replaced profile object; good shared authority. Review first-login latency, offline cases and named-view rerender/event behavior.
- `app.js:1171–1191`: avatar binding to legacy role selectors; fallback initials must derive from actual display_name, including no-data state.
- `calendar.js:13,34–44,56–63`: lane role order may stay fixed, but personal markers `F` and `B` and `F+B` cannot stand for actual users. Show actual initials or safe distinct per-person labels; handle both names starting with the same letter, and keep stable lane order/color/accessibility.
- `settings.js`, `stories.js`, `left-for-you.js` already predominantly use `display_name`; inspect fallbacks.
- `widgets.js` / native widget bridge: audit cached semantic snapshots, installed widgets and logout/reset; avoid old name on account change.
- `supabase/functions/_shared/game-v2-push-core.mjs:35,82`: `ROLE_LABEL` overrides the sender's real `display_name` in **outgoing** Game V2 notifications. Use sanitized/validated `sender.display_name` from the same tenant with neutral fallback. Preserve recipient resolution by role, event dedupe keys, preferences, Web Push/FCM/APNs payload contracts and push transport logic. This server-side code is a separate Edge deployment gate.
- Audit other user-visible hardcoded identity/name/gender copy in runtime and production notification templates. Do **not** blanket-replace role tokens inside SQL, JavaScript predicates, enum names, storage keys, tests, or backend event payloads.
- Existing regression tests may assert F/B as user-visible strings: update only contracts legitimately superseded by D5 and record baseline/head failures.

## Suggested implementation

1. Create a **small, pure, testable identity presentation resolver** consuming `{viewerId,coupleId,profiles}` from the existing MC1 snapshot and/or `usBondProfiles`, with utilities `ownName`, `partnerName`, `nameForRole`, `initialForRole`, `pairLabel`. Never infer a partner from role alone; after asynchronous hydrate, emit one scoped update or rerender existing views safely.
2. Replace public/static name fallbacks (auth, aria, head/title, empty widgets) with generic text. Populate per-couple names after session/profile validation only.
3. Update Game V2, Daily/Keepstakes/Noi ideas, distance, calendar, widgets and any remaining **display** labels to consume the resolver. Keep locale Italian and graceful single-member couple semantics.
4. Patch Game V2 push senderName source; keep transport/dedupe/security behavior unchanged. Record separately that changed Edge source is **not** live until an authorized Edge deploy.
5. Implement tests using synthetic Couple A (Francesco/Beatrice) and Couple B (Alex/Sam), including both roles reversed relative to apparent name/gender, two members with the same initials, one-member couple, logged-out/auth-pending state, asynchronous late arrival, offline/error, user switching and HTML-injection display names.
6. Validate Game V2 existing business contracts, Daily Keepsakes, calendar ownership, widget previews, notification-core/native transport payload, existing auth/MC1 checks, entire suite vs untouched main and web/Capacitor builds as relevant.

## Acceptance criteria

- **NO stray `Francesco` or `Bea` appears for Couple B** in rendered Gioca, Oggi/Daily, Noi, calendar, Settings, Ricordi, widgets, push or login screen. Internal role tokens/column keys are exempt.
- Couple A still shows the correct names from profiles (not hardcoded). An empty/failed profile query must never leak A into B or show stale names from a previous account.
- No hardcoded F/B initials masquerading as member identity; accessible text matches real owner names. Neutral copy is natural regardless of the users' genders.
- The two participants of a couple never see another couple's private names or data; no tenant authorization changed.
- Push tests confirm senderName uses the appropriate person's profile `display_name`; no accidental extra notifications, dedupe changes, secret leakage, preference bypass or cross-tenant recipient.
- No backend migration or Auth/Storage mutation. Web/mobile layout and perf remain acceptable.

## Delivery and gates

Work on **this single branch** until `D5_READY_FOR_REVIEW`; no PR, merge, deploy, production SQL or Edge deploy without separate authorization. If blocked by backend API that cannot supply the necessary identity, stop and provide a precise reason instead of inventing new privileges.

Final report: branch/base/HEAD, source and test files changed, synthetic-couple scenario matrix, focused/full test counts with untouched-main comparison, web/Capacitor builds, diff/secret check, exact Edge deploy impact, risks and whether production/PR/merge were touched. 
