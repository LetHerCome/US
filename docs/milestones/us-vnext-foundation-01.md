# US vNext — Foundation 01

**Status:** specification / not implemented
**Repository:** `F:\AI\US`
**Expected baseline:** `86d0282c9cb4139d2bcf083a2e598c40db498718`
**Implementation branch:** `codex/us-vnext-foundation-01`

This document is the persistent, milestone-specific authority for US vNext
Foundation 01. It must be read together with the repository `AGENTS.md`, which
remains the permanent project authority for implementation, visual assets,
icons, native constraints, and sensitive surfaces. General development routing
and adaptive compute selection are governed by the Hermes skills
`development-orchestrator` and `adaptive-compute-routing`; they are not
repeated here.

## 1. Product objective

US is a private couple app for exactly two people. Its product direction is:

> US is the private space where what one person leaves changes the other
> person's day, and what they do together becomes their shared history.

The core interaction model is:

`leave → receive → respond → resolve/preserve`

Do not optimize this foundation milestone for artificial engagement, generic
gamification, streaks, or social-network behavior.

Foundation 01 establishes product contracts and the vNext information
architecture while preserving existing behavior and internal identifiers. It is
not a whole-product vNext implementation.

## 2. M0 — product contracts

Create the canonical documentation for these conceptual contracts. They are
contracts for future work, not runtime data models; do not create a JavaScript
module merely to represent them.

### Interaction states

- `available`
- `waiting_for_me`
- `waiting_for_partner`
- `ready_to_reveal`
- `completed`
- `preserved`

### Trace sources

- `question`
- `quiz`
- `signal`
- `event`
- `quest`
- `decision`
- `left_for_you`

### Outcomes

- `response`
- `reveal`
- `decision`
- `moment`

Core rule:

> Every meaningful interaction in US should eventually affect the partner, the
> couple, or their shared memory.

The M0 documentation must also describe the M1 visible-destination to internal
route mapping defined below.

## 3. M1 — information architecture and navigation

### Visible destinations and preserved internal routes

The current primary navigation is `Home / Moments / Quiz / Bond / Settings`.
The target primary navigation is exactly:

| Visible destination | Existing internal page ID |
|---|---|
| Oggi | `home` |
| Noi | `bond` |
| Ricordi | `moments` |
| Gioca | `quiz` |
| Settings | `settings` |

Settings is secondary and is opened through the dedicated Settings entry in the
header. The avatar/profile control opens the user's personal Stories, which must
remain accessible from the avatar. Preserve all current internal page IDs. Do
not mass-rename DOM IDs, tables, RPCs,
storage identifiers, or other legacy identifiers.

`Ti penso` remains global. Events belongs under `Noi`. Existing systems are not
to be removed merely because their destination label changes.

### Navigation authority and order

Reuse the existing navigation architecture. `go()` remains the single page
navigation authority. Extend the current history, back, layer, and directional
animation behavior in `navigation.js`; do not introduce another router or
navigation state machine.

The primary page/swipe sequence must be exactly:

`home → bond → moments → quiz`

Settings remains routable but is outside the primary swipe sequence. All
routable pages may still include Settings internally. Directional animations
must remain correct when entering or leaving Settings.

### Bottom navigation

The bottom navigation must contain exactly four visible primary destinations in
this order:

1. Oggi → `home`
2. Noi → `bond`
3. Ricordi → `moments`
4. Gioca → `quiz`

Remove Settings from the bottom navigation, but do not delete the Settings page
or make it unreachable.

### Avatar and Settings

Keep the avatar's primary action opening the user's personal Stories and update
its accessible label accordingly. Settings is opened through the dedicated
header entry point, not through the avatar.

The existing profile-photo editing capability must remain reachable inside
Settings/Profile through a visible accessible action such as `Cambia foto
profilo`. Reuse the existing photo picker/upload flow. There must remain one
authority for profile-photo editing: do not duplicate file inputs, upload code,
storage logic, or avatar persistence logic.

### Noi and Events

The existing `bond` page becomes `Noi`. Do not redesign Bond in this
milestone. Preserve XP, quests, level, badges, and their internals as legacy
content temporarily living inside Noi.

Add Events as a first-class entry inside Noi by reusing the existing Events
overlay/system and `openEvents()` behavior. Do not build a second Events
implementation. Once Events is accessible inside Noi, remove the duplicate
global/top calendar destination so the same system is not exposed twice. Event
data and behavior must remain unchanged.

### Ricordi

The existing `moments` page becomes `Ricordi`. Keep the existing Moments
implementation and data model. Do not migrate tables, RPCs, internal
identifiers, storage, or introduce a memory engine.

### Gioca

The existing `quiz` page becomes `Gioca`. Keep the existing Quiz hub
functional. Do not change scoring, synchronization, XP rewards, weekly quiz
sets, Supabase RPCs, the question database, or the content engine. Future
game/reveal work is out of scope.

### Oggi

The existing `home` page becomes `Oggi`. Preserve current Home behavior,
including the photo hero, photo rotation, intentional empty state,
distance/context widget, push opt-in, Stories access, `Ti penso`, and existing
Home loading/error behavior. Do not replace Home with fake dashboard cards or
redesign it in this milestone.

### Daily Question

Preserve Daily Question functionality completely, including its backend and
reciprocal logic. Change visible presentation/copy where necessary so it is
clearly identified as `Domanda del giorno`, rather than appearing to be a
second destination named Oggi. Daily Question v2 is later scope.

## 4. M2 preparation only

Add one empty structural anchor to the Home/Oggi surface:

```html
id="usTodayPriorityRegion"
```

It must initially be `hidden`, have `aria-live="polite"`, contain no fake
content, no hardcoded future cards, and no visible placeholder copy. Current
Home/photo-hero behavior must remain unchanged when the region is empty.

Document the future priority order only; do not implement the cards or engine:

1. something received / reveal ready;
2. something waiting for me;
3. contextual couple memory/event/quest.

## 5. Explicitly excluded scope

Do not implement any of the following in Foundation 01:

- Pending Action Engine;
- intelligent Oggi/Home cards;
- Daily Question v2;
- Save to Memory;
- Event → Moment;
- XP removal;
- narrative progression;
- `Lasciato per te`;
- Content Engine;
- Reveal Engine;
- Shared Play;
- large quiz database;
- relationship chapters;
- weekly recap;
- time capsules;
- widgets;
- new native screens;
- Foundation 01 itself on `main`.

## 6. Engineering constraints

Preserve the existing vanilla HTML/CSS/JavaScript architecture, Supabase
behavior, PWA behavior, native shell constraints, approved assets, and Phosphor
icon authority. In particular, do not:

- add React, Tailwind, another framework, or unnecessary dependencies;
- change Supabase schema, migrations, RPCs, RLS, Auth, pair/device state, Push,
  private storage, Service Worker/cache behavior, or `us-private-media-v1`;
- add Capacitor plugins, native product screens, duplicate native/web UI, or
  work on iOS;
- regenerate, redraw, recolor, crop, optimize, replace, or invent approved
  assets or custom SVG icons;
- introduce another icon library;
- perform a large `app.js` refactor or broad CSS cleanup;
- introduce another router or navigation state machine;
- duplicate the profile-photo uploader or Events system;
- change the visual identity or redesign Home, Bond, Moments, or Quiz.

Implementation must use the existing navigation/history/layer authority and
preserve mobile-first behavior, safe areas, reduced motion, native back,
loading/error states, and existing regression surfaces.

## 7. Regression requirements

Protect the existing behavior of:

- Auth;
- pair/device state;
- Supabase synchronization;
- private media and profile images;
- Moments;
- Stories;
- Events;
- Quiz;
- Bond, quests, XP, levels, and badges;
- `Ti penso`;
- Daily Question;
- distance widget;
- push opt-in;
- online/offline feedback;
- update bar;
- navigation history, layers, directional transitions, and native back;
- safe areas and reduced motion;
- Android widget functionality;
- Service Worker/cache behavior.

When existing tests fail, classify each failure as an intended contract change,
a regression, or a brittle implementation detail. Change expectations only for
intended product-contract changes; fix regressions in implementation and call
out brittle assumptions explicitly.

## 8. Acceptance criteria

Foundation 01 is acceptable only when all of these are true:

1. M0 contracts are documented, including interaction states, trace sources,
   outcomes, core rule, and M1 destination mapping.
2. Bottom navigation has exactly four entries in visible order:
   `Oggi / Noi / Ricordi / Gioca`.
3. The four entries map to `home / bond / moments / quiz`.
4. Settings is absent from bottom navigation but remains routable.
5. Avatar opens personal Stories and has the updated accessible label.
6. Profile-photo editing remains reachable from Settings through an accessible
   `Cambia foto profilo`-type action and still uses the existing single flow.
7. Events is reachable from Noi through the existing Events implementation and
   `openEvents()` behavior.
8. The duplicate global/top calendar destination is removed without changing
   Event data or behavior.
9. Home remains the underlying page for Oggi and its existing hero/behavior is
   preserved.
10. Daily Question remains reachable and is presented as `Domanda del giorno`.
11. `usTodayPriorityRegion` exists, starts hidden, is `aria-live="polite"`,
    and has no fake cards, placeholder text, or visible content.
12. The documented future priority order is present only as documentation.
13. Quiz remains functional through Gioca.
14. Primary swipe order is exactly `home → bond → moments → quiz`.
15. Settings is outside primary swipe navigation.
16. Open layers still close before page navigation.
17. Native back behavior remains valid for primary pages, Settings, open layers,
    and root back behavior.
18. No excluded feature, new framework, schema change, duplicate system, or
    unrelated refactor is introduced.

## 9. Definition of Done

### Product

- Four primary destinations exist with the specified labels and mappings.
- Settings is secondary and accessible from the dedicated header entry point.
- Personal Stories remain accessible from the avatar.
- Events belongs under Noi without a duplicate global destination.
- Daily Question no longer competes with Oggi naming.
- Existing feature systems remain accessible.
- M0 documentation exists.
- The M2 priority anchor exists but renders nothing.

### Engineering

- Existing internal page IDs are preserved.
- Existing navigation/history authority is reused.
- No second router, framework, database/Auth/Push/Service Worker/native
  architecture change, duplicate uploader, duplicate Events system, or fake
  Home content exists.
- Repository-specific permanent constraints in `AGENTS.md` remain satisfied.

### Validation

- Focused Foundation 01 contract tests pass.
- Full `npm test` passes.
- `git diff --check` passes.
- Every changed JS/MJS file passes syntax validation.
- `npm run build:capacitor-web` passes.
- `npx cap sync android` passes.
- Android debug build passes and a fresh APK exists at
  `F:\AI\US\android\app\build\outputs\apk\debug\app-debug.apk`.
- Manual checks are reported only when actually performed.

For Android validation on this Windows machine, use JDK
`C:\\Users\\Francesco\\.jdks\\jbr-21.0.11` and the process-local temporary
directory `C:\\jtmp`. Set `JAVA_HOME`, prepend its `bin` to `Path`, and set
`TEMP`/`TMP` to `C:\\jtmp` only for the validation process; do not modify
machine-wide Java settings. Before the Gradle build, ensure `C:\\jtmp` exists,
run `gradlew.bat --stop`, then run `gradlew.bat clean assembleDebug` from
`F:\\AI\\US\\android`. Verify the fresh APK at the path above. If Windows
retains a resource mapping, stop Gradle and rerun the focused test before
classifying it as a product regression; do not change source to mask a transient
file lock.

## 10. Implementation entry point and validation authority

Before implementation, verify repository protection against the expected
baseline:

```text
git status --short
git branch --show-current
git rev-parse HEAD
git fetch origin
git rev-parse origin/main
```

The expected clean baseline and both local `HEAD` and `origin/main` are
`86d0282c9cb4139d2bcf083a2e598c40db498718`. If the tree is dirty or `main` has
unexpectedly moved, stop; never stash, reset, discard, or overwrite existing
work. If valid, switch to `main`, fast-forward with `git pull --ff-only origin
main`, and create the dedicated implementation branch
`codex/us-vnext-foundation-01`. Do not work directly on `main`.

Before editing, run the project baseline validation:

```text
npm test
npm run build:capacitor-web
```

The expected current test baseline is `148/148`. If baseline validation fails,
diagnose it before editing unrelated code.

Read at minimum these files:

- `AGENTS.md`
- `index.html`
- `app.js`
- `navigation.js`
- `styles.css`
- `identity.css`
- `ui-foundation.css`
- `ui-foundation.js`
- `settings.js`
- `settings.css`
- `events.js`
- `games.js`
- `moments-albums.js`
- `platform.js`
- `capacitor.config.json`
- `native-entry.mjs`
- `scripts/build-capacitor-web.mjs`

Inspect at minimum these relevant tests:

- `tests/m3-home-navigation.test.js`
- `tests/m5b-navigation-sheets.test.js`
- `tests/m6a-premium-shell.test.js`
- `tests/native-back-navigation.test.js`
- `tests/native-back-platform.test.js`
- `tests/native-foundation.test.js`
- `tests/native-web-staging.test.js`
- `tests/service-worker-static-runtime.test.js`
- `tests/ui-foundation.test.js`

Search the test suite for assumptions about five bottom-nav items, Settings in
navigation or swipe order, the global calendar trigger, and route ordering.

The preferred focused test file is:

```text
tests/vnext-foundation-01.test.js
```

Its assertions should cover the acceptance criteria above, including four-item
navigation, preserved route IDs, Settings/avatar/photo flow, Events placement,
Daily Question naming, empty priority anchor, swipe/back/layer behavior, and
native-back invariants.

Use the repository's existing scripts and `AGENTS.md` as the authority for
exact commands and environment handling. The generic development workflow,
worker delegation, adaptive tier selection, independent diff/status review,
and escalation policy are defined by Hermes skills and are intentionally not
duplicated in this milestone document.

Before commit, report status, diff stat, changed files, focused/full tests,
Capacitor web build/sync, Android build, APK path, and only actual manual
checks. The implementation commit message is:

```text
feat: establish US vNext foundation 01
```

Push the implementation branch after committing for independent review. Do not
merge to `main` and do not start M2.
