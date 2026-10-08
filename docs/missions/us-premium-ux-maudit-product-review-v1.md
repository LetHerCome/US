# US — Premium UX, Apple-like refinement & Maudit Rewards · Product Audit V1

**Status:** DESIGN / PRODUCT AUDIT ONLY — NOT AN IMPLEMENTATION MISSION  
**Owner:** Claude Opus 5.5 (single lead reviewer; cost-conscious, no extra agents unless explicitly approved)  
**Independent branch:** `mission/us-premium-ux-maudit-audit-v1`  
**Baseline:** `main` @ `df7760b9b7519cfc148d064f2d01629ce8f763dc` (D5 merged).  
**Concurrent work:** MC3 onboarding in Codex's **separate local worktree**. Do not check out or touch MC3's branch/worktree, files, WIP or planned changes.  
**Allowed:** read-only repo audit, local/browser previews with synthetic data, documented UX blueprints, optional isolated HTML/CSS concept prototypes in `docs/ux-concepts/` (never production runtime).  
**Forbidden:** edits to runtime/source CSS/JS/HTML, SQL, migrations, rewards catalog, Supabase/Auth/Edge, assets in production, GitHub PR/merge/deploy, real accounts, secrets or user data.

## Executive creative direction

Take US from a personal project to a **deliberate, commercially appealing, emotionally engaging couples product** with a design language informed by Apple's Human Interface Guidelines, not an Apple clone. Think premium iOS spatial hierarchy and native-feeling gestures, restrained translucent materials, legibility, meaningful transitions, generous spacing and calm visual rhythm. Preserve US's distinctive romantic identity and ensure excellent Android as well as iOS/PWA ergonomics.

**Hard product decision:** Maudit, the existing white/gray blue-eyed kitten, is the ONLY pet/mascot. Do **not** invent other mascots, collectible pet species, gacha characters, pets to swap or extra companions. Turn the **existing Maudit** into a recognizable emotional feature and a major purpose of rewards: unlock the same cat's accessories, skins, animations, resting places and cosmetic interactions, never replacing its identity.

Treat this as a critical product review, not a list of fashionable visual effects: challenge weak UX, shallow or redundant rewards, inconsistent sheets and unnecessary chrome. Tell the owner what to remove, not merely what to add. Do not sacrifice clarity, performance, readability or authenticity for glassmorphism.

## Existing source audit: grounded facts (read these sources first)

- `index.html`: shell with Oggi, Noi, Ricordi, Gioca; top row `.top.us-premium-top` with `#thinkButton`, US brand, envelope and connection badge; bottom nav at `#usPetLayer` and numerous overlays.
- `styles.css`: `.app` padded by safe top, `.top` occupies an 18px top / 12px bottom padded row + controls; premium bottom nav fixed. Verify *actual rendered dimensions* instead of assuming the bar is sticky or fixed.
- `ui-foundation.css` / `ui-foundation.js`: shared premium tokens, sheet/modal/backdrop/motion/focus conventions; `settings2.css`, `settings.js`, `navigation.js`, `fix4.css`: current modal/navigational/keyboard patterns.
- `pet.js` / `pet.css`: **Maudit V1 already running**. Approved kitten V0 renderer. Tappable, hold/drag by scruff, gravity/snap to safe card/nav surfaces, device-local position + on/off preference, states idle/walk/rest/react/pet/held/fall/snap; reaction event `USPet.react(reason)` supports `think`, `left-for-you`, `reward`, `streak`, `daily-question`. Respect its hit target, planes and reduced motion.
- `docs/missions/us-pet-asset-spec-v1.md`: approved **one** white/gray kitten with blue eyes. Art/version approval applies to any later skin or outfit; do not overwrite approved asset in-place.
- `progression.js` / `progression.css`: 7 existing cosmetic slots (frame/sticker/badge/ring/theme/accent/effect), client equip prefs per profile+couple and server-owned unlock eligibility; `get_progression_v1`, `ack_progression_unlock`; `#usProgressionUnlock` modal and Sintonia collection. Pet already reacts on completing unlock sequence.
- `docs/missions/us-rewards-countdown-pet-foundation-v1.md`: previous detailed problem analysis and proposed rewards/countdown/pet integration; **build on this**, don't independently invent a second reward economy.
- `countdown.js` / `countdown.css`: premium Countdown cosmetic entitlements already exist.
- `index.html` `#usSettingsOverlay`, `#usWidgetHub`, `#usProgressionUnlock`, `#thinkArrival`; `ui-foundation.css` `[data-us-motion-surface]`; `settings2.css` — dozens of sheets have distinct treatments. Review hierarchy and reusability.
- `docs/missions/us-d5-generic-ui-identity-v1-report.md`: multicouple identity display is already generalized. No visible names or roles hardcoded to Francesco/Beatrice in new proposals.
- MC3's profileless onboarding is *currently being implemented in another worktree*: do not base product design on its unfinished code; propose principles for onboarding visual styling as a **future downstream** application only.

## Work package A — Full UX/product audit

Visually inspect the real app locally if feasible (with synthetic data; do not request production credentials). If no running preview, inspect code and pre-existing test screenshots or request just the minimum missing screenshots; **never claim a screen was visually inspected without actually seeing it**.

Scope: initial launch/login, Oggi (photo/empty/countdown/think), Noi main screen, Sintonia/collection/unlock, Ricordi/Stories, Gioca/Swipe, Calendar/Event, Settings, dialogs, notifications and states (empty/loading/error, landscape, lock, onboarding after MC3).

For each page and important popup provide:
- Current strengths, weak points and usability/sellability bottlenecks;
- Specific visual changes with before/after layouts **described concretely**, not generic “add Apple styling”;
- Layout hierarchy, typography/size hierarchy, color/material/contrast, touch target 44px minimum, motion policy, dark mode, accessible labels, focus/back/keyboard handling;
- Relative user value, implementation cost and mobile/PWA/Capacitor risk;
- What to *delete*, simplify or merge. Guard against overdecorated glass and nested cards;
- Distinguish audited facts from aesthetic judgments/hypotheses.

Provide a compact scorecard by screen for: clarity, polish, emotional value, retention, performance, implementation complexity. Define measurable acceptance criteria (e.g. screenshot states, taps to action, nav occlusion, scroll area, render cost), not fabricated market conversion percentages.

## Work package B — Top bar that gives screen space back

The top row currently includes Think, centered US mark, envelope and online connection state. It has real functional affordances, so do not just set `display:none`.

**Design and compare THREE concrete alternatives**:
1. **Compact always-on bar**: reduced height with fewer visual containers; what remains and what moves where.
2. **Scroll-aware hide/reveal**: collapses or moves offscreen on intentional downward content scroll, returns on upward scroll/near top/focus/interaction; detail hysteresis and how to avoid flicker.
3. **Contextual immersive Home**: Oggi photograph begins much higher / under minimal controls; compact overlay/auto-hide only on Oggi, different behavior on scroll-heavy Noi/Stories/Gioca.

For each: ASCII wireframe or a small isolated annotated prototype, estimated pixels of vertical space recovered at 320×568 and 390×844 **only when measured against real CSS/browser**, effect on thumb reach, readability, reliability, nav/scroll and touch targets. Where is Think? Where do you find the envelope? What becomes of online badge (e.g. status only on error)? Does the US brand need to be ever-present? Consider tap-to-reveal, scroll reversal, route/page switch, keyboard opening, modal/immersive photo, app lock, notification arrivals, back navigation, iOS notch/Dynamic Island safe area, Android cutouts and landscape.

Recommend ONE default and clear fallbacks. Avoid pointless animation/sensors, JS loops and hide/show oscillation. Include behavioral truth table covering home/not-home/top/scroll down/up/focused/keyboard/modal/accessibility/reduced-motion.

## Work package C — One Maudit, a rewards ecosystem

We do **not** need more mascots. Review current Sintonia and its 7 cosmetic categories: which rewards visibly matter, which are effectively imperceptible and should be consolidated, which are useful in daily use.

Design a **coherent Maudit meta-progression** that uses the SAME server-authoritative Sintonia/unlocks, with proposed cosmetic families:
- Maudit's collar/outfit/accessories;
- same-cat coat/skin variations (never replace the approved Maudit identity);
- unlockable poses/gestures and reactions to real couple milestones;
- small restful spots/objects or ambient details that live *with* Maudit, if compatible with the existing safe-plane drag/snap design;
- seasonal/relationship milestones with low-pressure discovery.

Specify example 10–15 unlocks with **name, emotional meaning, trigger/level or mapped existing reward, visual result, location, preview moment and progression authority**. These are *proposals*; do not fabricate existing database entitlements. Distinguish what can be achieved with current 7 categories/client settings versus what would require a later additive migration/constraint/category and explicit backend approval.

Provide two incremental rollout paths: **(A) zero-SQL cosmetics using existing authority** and **(B) future catalog expansion with migration**, with benefit/risk comparisons. Do not introduce XP farming, multiple reward economies, pay-to-win, manipulative streak shame or new pets. Shared unlocks vs per-device equipped appearance must be explained and re-use existing identity namespace; no cross-couple cosmetics leakage.

Create first-run discovery of Maudit, “your cat” identity, an understandable equip/unlock preview, coherent Sintonia placement, and a natural relationship with “Ti penso”, Daily, milestones and gifts. Note that Maudit can be disabled locally (no nudging or guilt). Recommend when he reacts and **when he stays quiet**. Review actual accessibility, performance, reduced motion and touch occlusion at 320px wide.

## Work package D — Native-feeling sheets, windows and unlock moments

Design a unified sheet/popup behavior using existing `UsUiFoundation` authority rather than creating a new modal runtime. Define:
- One hierarchy: confirmation alert vs contextual bottom sheet vs immersive detail vs celebratory unlock card;
- Appropriate radius, spacing, typography, subtle background and backdrop values, drag handle/close affordance, physical spring feel without bouncing all over; stable positioning above keyboard;
- iOS-style visual clarity without copying protected Apple assets or creating a platform-inconsistent Android experience;
- content-first readable states, safe area, escape/back, focus trap/return, external taps, aria, reduced motion;
- better premium reward unlock with a large real preview, item meaning, exactly where it is applied, “Usa” and “Non ora” and optional Maudit reaction.
- Prioritize current high-traffic dialogs: Think received, Daily/answer/reveal, countdown settings, photo/story viewer, Game V2, Settings, Sintonia unlock.
- Give one visual spec with token changes `current → proposed`, and a modal-inventory table mapping existing selectors to desired sheet type.

## Work package E — Commercial appeal, positioning, prioritization

Judge what would make US feel **valuable to an unfamiliar couple** with no context of Francesco/Beatrice. Propose product narrative, first-use “aha” moments, 3 screenshots worth featuring in an app-store listing, and retention rooted in emotional usefulness rather than noise. Do NOT implement subscriptions, ads, new monetization dependencies or invasive analytics. Identify what is immediately high-value vs cosmetic churn. Compare investment in Maudit/outfits versus core onboarding quality/photos/performance.

Give a phased, **dependency-aware and MC3-safe** roadmap:
- P0 safety/accessibility/nonbreaking corrections,
- P1 shell/topbar/modal foundation after MC3 stabilizes,
- P2 Maudit reward UX + no-SQL cosmetic experiments,
- P3 optional server catalog extension with separate design/approval,
- P4 screenshots/app-store presentation and device QA.

For each increment: exact file likely affected, prerequisite, estimated effort in engineer-days or complexity bands, user-visible acceptance tests, regression and release gate, whether SQL / Edge / native build is involved.

## Outputs — committed only on this design branch

1. `docs/ux/US_PREMIUM_UX_AUDIT.md` — critical per-screen audit / evidence, recommendation shortlist and sellability notes.
2. `docs/ux/US_TOPBAR_OPTIONS.md` — 3 alternatives, tradeoffs, detailed behavior truth table, one recommendation with real CSS measurements or clearly marked estimates.
3. `docs/ux/MAUDIT_REWARDS_VISION.md` — one mascot only, 10–15 sample rewards, economics/entitlements reuse and zero-SQL vs additive migration.
4. `docs/ux/US_NATIVE_SHEETS_DESIGN_SYSTEM.md` — concrete unified sheet/modal inventory and tokens/interaction rules.
5. `docs/ux/US_PREMIUM_UX_ROADMAP.md` — prioritized dependency-safe engineering plan, definition-of-done and risks.
6. Optional **isolated** non-shipping wireframes/prototypes in `docs/ux-concepts/` (static HTML/CSS or screenshots) if locally easy; clearly distinguish concepts from UI implemented in production. Never modify actual runtime components.
7. A short executive verdict: “If we could change only 3 things, change these.”

Do not mark the mission finished based only on reading CSS; it must include concrete reasoning, practical alternatives, testing gates and a roadmap tied to current architecture. If available, cite Apple's official Human Interface Guidelines (layout, navigation, sheets, motion) as inspiration and justify adaptations for US.

**No implementation now.** End with `US_PREMIUM_UX_BLUEPRINT_READY_FOR_REVIEW`, branch, HEAD, files added, inspected evidence, optional concept-preview paths, proposed sequencing and decisions required of the owner. No merge, PR or deploy. Keep Codex MC3 entirely undisturbed.
