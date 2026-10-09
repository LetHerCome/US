# US — Decisions

Only durable decisions belong here. New missions should not reopen them without an explicit product decision.

## 2026-10-04

- Production frontend is **Cloudflare Pages**. Vercel is legacy/out of scope.
- `main` is production.
- US 2.0 backend foundation is complete; do not reopen broad backend-cleanup work without a concrete product need.
- Agent context belongs in repository docs, not repeated in large prompts.
- One meaningful mission uses one branch/worktree through audit, implementation, fixes and review.

### Gioca

- Gioca should become a strong return loop, not only a questionnaire catalog.
- Questionnaire/Game V2 content refreshes on a weekly rhythm.
- Planned questionnaire allowance: **5 sessions/week** instead of 3.
- “Crea domanda” stays, but its UX becomes: **write → seal → partner discovers it while playing**.
- Add a distinct **Arcade** area for non-verbal/touch minigames.
- First live arcade game: **Pulse**.
- Planned order: **Pulse → Stack Together → Relay → Duo Maze**.
- Live arcade uses the already-known partner: no room codes, usernames, public lobbies or matchmaking.
- First Pulse mission does **not** consume the Game V2 weekly questionnaire allowance.
- Build one reusable live-game invitation/lobby/reconnect/rematch foundation, then reuse it rather than rebuilding multiplayer per game.

### Product restraint

- Do not add new top-level navigation tabs for these features.
- Do not add fake currencies, energy systems or grind loops.
- Engagement should come from partner consequence, anticipation, live play and meaningful shared outcomes.

## 2026-10-06

### Native iOS (M15)

- iOS is a Capacitor 8 target in `ios/` (Swift Package Manager) sharing the Android web bundle; bundle id `com.usapp.us`, deployment target **iOS 16.0**.
- Shared product JS stays platform-neutral; iOS specifics live in `ios/` and native-only glue in `native-entry.mjs` / `app-links.mjs`.
- iOS Back = left-edge swipe into `UsNavigation.handleNativeBack()`; never exits the app.
- Public URL scheme `com.usapp.us`; reserved App Group `group.com.usapp.us.shared` for all future extensions; refresh tokens never go in the App Group.
- WebView data (session) is excluded from iOS backups, mirroring Android `allowBackup=false`.
- The iOS WebView origin (`capacitor://localhost`) is frozen: changing it orphans stored sessions.

### Native Security V1

- Biometrics gate access to the existing Supabase session on this phone; they never create an identity, replace email + password, or revive an expired/revoked session.
- The Supabase session stays in the WebView store; only a protection record (no credential) goes to Android Keystore-encrypted prefs / iOS Keychain `ThisDeviceOnly`.
- Android accepts only **class 3 (strong)** biometrics, bound to a Keystore key invalidated by a new enrollment. iOS uses Face ID / Touch ID only (no passcode shortcut) and checks the enrollment hash.
- Locked on cold start and after **60 s** in background; shorter interruptions never re-prompt.
- Off by default, device-local, never a couple setting. Any end of the session removes it; recovery is always the email + password login.

### Native Notifications V1

- One notification domain: producers authorize and apply preferences, then hand ONE canonical notification (`_shared/notification-core.mjs`) to one dispatcher; Web Push, FCM and APNs only serialize it. No per-transport business rules.
- Dedupe stays logical: one `push_event_log` claim per event covers every transport; released when nothing was delivered.
- iOS uses direct APNs (token auth), not FCM-for-iOS: no Firebase SDK in the iOS app.
- Native registration is per app installation (random UUID, rotated at logout), only through authenticated RPCs; logout removes only this installation.
- Payloads carry an allow-listed target and an optional UUID, never a URL; navigation waits for the session and the app lock. Notification actions never mutate data.
- Native credentials live only in Supabase Edge secrets; unset = native transport off, Web Push unchanged.


## 2026-10-07

### Multi-couple foundation

- US is a single-couple UX on a multi-couple architecture.
- `couple_id` is the tenant boundary for shared state and authorization.
- V1 keeps `profiles.id = auth.users.id` plus `profiles.couple_id` as the active membership authority.
- A separate `couple_members` table is deferred until an account needs multiple simultaneous or historical couple memberships.
- Relationship age is data-driven from `couples.started_on`; no private-couple date belongs in runtime logic.
- Legacy `francesco | beatrice` values remain compatibility slot tokens for now. Their database-wide normalization is a separate atomic migration.
- Any auth/bootstrap change must pass the dedicated Boot/Auth safety contract and a signed Android candidate must be tested before merge.

### MC2 couple creation and invites (review candidate)

- Membership remains `auth.users.id → profiles.id → profiles.couple_id → couples.id`; one active couple/account, two server-assigned legacy slots. No `couple_members` or role normalization.
- Public signup remains OFF. Bearer invites use server-generated 128-bit Crockford Base32 codes, SHA-256 only at rest, fixed 48-hour expiry, revocation and single use.
- No legacy Auth/session/Storage cleanup. Confirmed eligible permanent orphans may create/join an isolated couple; anonymous accounts are denied regardless of user metadata.
- Membership writes are restricted to the four MC2 mutation RPCs; profile client INSERT/DELETE/TRUNCATE and other legacy write privileges are revoked. SELECT and avatar UPDATE stay intact.
- The migration accepts exact legacy, verifies/no-ops exact target, and refuses partial/unknown states without repair. Lock order is user advisory → actor → invite → membership checks/locks.
- `list_couple_questions()` stays retired with client `42501`; MC2 does not restore its grant. Native Notifications ledger drift remains outside scope.
- Repository validation and review do not authorize production rollout or a real Couple B launch; onboarding and legacy UI copy are separate work.

## 2026-10-09 — UI Refinement & Personalization V3 (review candidate)

- Oggi personalisation is two device-local slots of the existing cosmetics system: **Tema di Oggi** and **Effetto di Oggi**. `data-us-theme` stays the global atmosphere; Oggi themes only define `--oggi-*` tokens scoped to Oggi.
- Frames and stickers are no longer rewards. Badges and rings are retired with them (no visible place since Noi V2). Unlock history and stored choices are kept; nothing is deleted.
- Rewards that entitle Countdown styles stay active and are presented as Countdown styles.
- Server catalog changes go through a reviewed migration; until it is applied the client hides looks the server does not know (no fake rewards).
- Gioca keeps two tabs; games are one grid (no sideways deck), rounds waiting for you are shown directly.
- Noi "Lavagna" = the existing Calendar Week view.
