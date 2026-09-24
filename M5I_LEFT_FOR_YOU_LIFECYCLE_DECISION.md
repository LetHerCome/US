# M5I — Lasciato per te: Lifecycle Decision

**Status:** Decision document (read-only audit). No implementation code, migration, or schema change is included in this mission.
**Investigator:** Claude Sonnet 5 (`claude-sonnet-5`), single-agent, read-only.
**Date:** 2026-09-24.

## Evidence provenance and inspection scope

- **Repository branch inspected:** `mission/us-m5h-spotify-search-share`, working tree clean at the start of this audit.
- **origin/main SHA inspected:** `eab65edee0fdac65bcdb4335ff1f1a7e6e3f106f` (PR #27, "M5H — Spotify search and sharing"), fetched via `git fetch origin main`.
- **Local HEAD SHA:** `551a1a0c41dd3f77f3ba1aa2a0856e8e000374f2`. `git merge-base --is-ancestor HEAD origin/main` returns false — PR #27 was a **squash merge**, so the commit graphs diverge. However `git diff HEAD origin/main` (full repo, `--stat`) is **empty**: the working tree is byte-identical to origin/main. Every file cited below is therefore valid evidence for the current origin/main state, not just the local branch.
- **No mutation was made** to any file other than this document. No branch/commit/PR operation was performed.
- **Remote Supabase inspection: UNAVAILABLE.** No Supabase access token (`supabase projects list` fails with `LegacyPlatformAuthRequiredError`), no service-role key, no Supabase MCP tool is registered in this session (`ToolSearch` for "supabase" returns nothing). `docs/authority/m5a-media-authority-manifest.md` records that a "Supabase MCP (us-read)" tool *was* used for a prior, unrelated audit (stories/moments baseline, dated 2026-09-22) — that tool is not available here and that manifest predates `left_for_you` entirely, so it says nothing about this feature's live schema.
- **Everything below about "current state" is proven from migration files and application code in the repository, not from a live database read.** Where the migration history itself documents uncertainty about what was actually applied remotely (see §1.6), that uncertainty is preserved rather than resolved by guessing.

---

## 1. CURRENT STATE — what code/database actually do today

### 1.1 Schema (`public.left_for_you`)

Defined by `supabase/migrations/20260922180436_left_for_you_v1.sql`, extended by `20260922182210`, `20260923100236`, `20260923110119`:

| column | type | notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `couple_id` | uuid NOT NULL | FK → `couples(id)` **ON DELETE CASCADE** |
| `sender_id` | uuid NOT NULL | FK → `profiles(id)` **ON DELETE CASCADE** |
| `recipient_id` | uuid NOT NULL | FK → `profiles(id)` **ON DELETE CASCADE** |
| `kind` | text NOT NULL | check `in ('text','photo','audio','video','music')` (M5C extended the original `('text','photo')`) |
| `body` | text | per-kind length/nullability contract |
| `media_path` | text | storage path (photo/audio/video) or external `https://` URL (music); **UNIQUE** |
| `created_at` | timestamptz NOT NULL | `now()` |
| `seen_at` | timestamptz | NULL until the recipient's RPC sets it |

No `deleted_at`, no `expires_at`, no `consumed_at` column exists. **No column or mechanism marks an item "conserved"** — that fact lives only in a separate table (§1.3).

Indexes: `left_for_you_recipient_created_idx (recipient_id, created_at desc)`, `left_for_you_couple_created_idx (couple_id, created_at desc)`, and a partial index `left_for_you_recipient_unseen_idx (recipient_id, created_at desc) WHERE seen_at IS NULL` — **this partial index exists but nothing in the client queries against `seen_at IS NULL`** (see §1.4), so it is currently unused by any query in the codebase.

### 1.2 RLS / grants / RPCs on `left_for_you`

- RLS enabled and **forced**. SELECT policy: both `sender_id` and `recipient_id` of the couple can read (`left_for_you_select_participants`).
- INSERT policy (`left_for_you_insert_own`, current form from `20260923110119`): sender-only, same-couple, `seen_at IS NULL` required (hardened in `20260923100236` after an audit found the original INSERT policy didn't constrain `seen_at`, so a client could otherwise forge an already-seen row), photo/audio/video path must be namespaced `couple_id/sender_id/...`, music must be an external `https://` URL that is *not* namespaced into the bucket.
- **No UPDATE or DELETE policy exists for `left_for_you`, ever, in any migration.** Grants (`20260922182210`): `authenticated` has `SELECT, INSERT` only; `UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN` are explicitly revoked from `authenticated`; `anon` has nothing.
- `mark_left_item_seen(target_item_id uuid)` — `SECURITY DEFINER`, `search_path = ''`, recipient-only (`entry.recipient_id = auth.uid()` inside the same-couple scope), idempotent one-way `NULL → now()` transition with a `FOR UPDATE` row lock and a defensive re-read if a concurrent transition raced the `UPDATE`. Revoked from `public/anon/authenticated`, `EXECUTE` granted to `authenticated` only. **There is no `unmark`/`revoke seen` path.**
- No RPC or trigger deletes rows from `left_for_you`. `tests/m5b-left-for-you-backend.test.js` and `tests/m5d-conserva-contribution.test.js` both assert, by grepping the migration SQL, that no DELETE policy and no `DELETE FROM public.left_for_you` statement exists anywhere in the tracked migrations.

**Conclusion: `left_for_you` rows are permanent by construction today.** Nothing in the schema, RLS, grants, or RPC surface can ever remove or expire a row. This is a documented, deliberate M5B decision, not an oversight (see the V1 migration's header comment: *"V1: nessuna DELETE client... Forward-only... nessuna scadenza"*).

### 1.3 `conserva_contributions` (M5D)

`supabase/migrations/20260923112331_m5d_conserva_contribution.sql` + `20260923112428_harden_conserva_contribution_grants.sql`:

```
conserva_contributions(
  id uuid PK,
  couple_id uuid NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  source_item_id uuid NOT NULL REFERENCES left_for_you(id) ON DELETE CASCADE,  -- ← load-bearing for §9/§10
  source_sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  conserved_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_item_id)
)
```

No payload columns (no `body`, `media_path`, `kind` copy) — deliberately, per the migration's own comment: duplicating the payload "introdurrebbe una seconda fonte di verità," and the FK to `left_for_you` was judged sufficient because `left_for_you` was, at the time, unconditionally permanent.

RLS: SELECT for both couple members; **no INSERT/UPDATE/DELETE policy for the client at all.** Grants: `authenticated` has `SELECT` only (hardened in the second migration to `revoke all ... grant select`).

`conserve_left_for_you(target_item_id uuid)` — `SECURITY DEFINER`, `search_path = ''`, recipient-only, idempotent via `ON CONFLICT (source_item_id) DO NOTHING` + a fallback read of the existing row (same `id`/`created_at` returned on retry — status `'existing'` vs `'created'`). It never mutates `left_for_you` (no `UPDATE`, no `seen_at` touch) and never writes to `moments`/`moment_photos`.

**Critical structural fact for this decision:** `source_item_id ... ON DELETE CASCADE` means that if a `left_for_you` row is ever physically deleted while a `conserva_contributions` row still points to it, **the conservation record is destroyed along with it** — the couple's "kept" provenance silently disappears. Nothing in the current schema prevents this; it has simply never mattered because nothing ever deletes a `left_for_you` row. Any lifecycle design that introduces physical deletion **must** treat this as a hard constraint (see §7, §9).

### 1.4 Client query and receiver flow (`left-for-you.js`)

`fetchItems()` (`left-for-you.js:160-172`):

```js
const { data, error } = await client.from('left_for_you')
  .select('id,sender_id,recipient_id,kind,body,media_path,created_at,seen_at')
  .eq('recipient_id', window.usProfile.id)
  .order('created_at', { ascending: false });
```

This is **unfiltered by `seen_at` and has no time bound** — it fetches every item ever sent to this recipient, every time it runs (on boot, on `us-auth-resolved`, on every `open()`, on every realtime INSERT, on the `left-for-you-refresh` custom event). `unseenCount` is derived client-side as `items.filter(isUnseen).length`; the "closed/open" envelope state (`applyEnvelopeState`, `left-for-you.js:105-129`) depends only on that count, not on which specific item is shown.

`load()` → `fetchItems()` → `const firstUnseen = items.findIndex(isUnseen); if (firstUnseen >= 0) currentIndex = firstUnseen;` (`left-for-you.js:221-222`). **If there is no unseen item, `currentIndex` is left unchanged** — a module-level variable that starts at `0` on every fresh page load. Because `items` is sorted `created_at desc`, index `0` is the *most recently sent* item, seen or not.

`renderCurrent()` unconditionally calls `markSeen(item)` at the end (`left-for-you.js:205`), but `markSeen` is a no-op for an already-seen item (`if (!item || item.seen_at || !client) return;`), so this does not corrupt state — it just silently re-displays old content as if new.

### 1.5 Two entry points into the receiver view — and an asymmetry

- `tap()` (`left-for-you.js:265-270`), bound to the envelope button's `onclick` (`index.html`, `usEnvelopeTap()`): **gated** — `if (unseenCount > 0) { open(); return; } openComposer();`. When there is nothing unseen, tapping the envelope *never* calls `open()`; it goes straight to the composer.
- `window.openLeftForYou = open` (`left-for-you.js:1016`), called **unconditionally** from `app.js:545-548` (`performPushNavigation`) whenever a push notification's `target === 'left_for_you'` is clicked, and from `service-worker.js:127-141` (`notificationclick` → `postMessage({type:'US_PUSH_NAVIGATE', target})` → `performPushNavigation`). This path **bypasses the closed/open gate entirely.**

### 1.6 Media / storage

- Bucket `us-media` (private, signed-URL access only). `20260923110119` (M5C) raised the size ceiling to 25 MiB and widened the MIME allowlist for audio/video; `20260923180800` (M5G2) would raise it to 40 MiB but is explicitly annotated **"This migration is prepared only. Do not apply it remotely as part of M5G2."**
- Upload path convention (`left-for-you.js:805`): `${couple_id}/${me.id}/left/${Date.now()}-${crypto.randomUUID()}.${ext}` — sender-owned namespace, matching the `us_media_insert_own_folder` storage policy family documented in `docs/authority/m5a-media-authority-manifest.md` (`foldername(name)[1]=couple_id, [2]=sender_id`).
- **`media_path` is UNIQUE per `left_for_you` row** — no two rows can reference the same storage object, so a storage object's owning row is always unambiguous (relevant to §5: safe to delete the object when its one owning row is deleted, no reference-count needed).
- **No trigger, RPC, cron, or client path ever deletes a storage object for `left_for_you` media.** Since no row is ever deleted (§1.2), no object is ever orphaned either — but nothing is ever reclaimed.
- Existing precedent elsewhere in the codebase for *coupled* row+storage deletion: `moments-albums.js:265-274` (`deleteAlbumPhoto`) does client-side `sb.from('moment_photos').delete().eq('id',id).eq('created_by', me.id)` then `sb.storage.from('us-media').remove([path])`, treating the DB delete as authoritative and the storage removal as best-effort (its failure is only `console.warn`'d, not surfaced to the user, not retried). This pattern is directly reusable for §5, with one caveat: it deletes the *uploader's own* object under the `us_media_delete_own` storage policy (`owner_id = auth.uid()`). In `left_for_you`, the object is owned by the **sender**, but the party who would trigger cleanup (recipient view, or a scheduled job) is not the sender — so this client-side pattern **cannot be reused as-is**; cleanup must be server-side (see §7).

### 1.7 Realtime

`subscribeRealtime()` (`left-for-you.js:283-299`) subscribes only to:
```js
{ event: 'INSERT', schema: 'public', table: 'left_for_you', filter: `recipient_id=eq.${me.id}` }
```
**No `UPDATE` and no `DELETE` events are subscribed.** A second device open on the same account will not learn that an item was marked seen, conserved, or (if introduced) deleted, until it independently re-runs `fetchItems()` (app relaunch, the `left-for-you-refresh` custom event, or a fresh `INSERT`).

### 1.8 Conserva UI state is session-local, not server-derived

`conserve()` (`left-for-you.js:244-261`) sets `item.conserved = true` **in the in-memory `items` array only**, after a successful `conserve_left_for_you` RPC call. `fetchItems()` never joins or queries `conserva_contributions`, so `item.conserved` is `undefined` on every fresh `fetchItems()` call (page reload, other device, realtime-triggered refetch). The RPC itself is safely idempotent (a second click returns `status:'existing'` and the UI updates to "✓ Già conservato"), so this is not a correctness bug for the RPC, but it **is** a real gap for any lifecycle design that needs the client to reliably know "is this item already kept" without re-invoking the RPC speculatively — see §8.

### 1.9 Observed local/remote drift risk (adjacent, not part of this decision)

`20260923180800` (M5G2, 40 MiB bucket ceiling) and `20260923210000` (M5G3, `notification_preferences.left_for_you` column + `get/set_notification_preferences`) are both explicitly annotated **"prepared only; do not apply remotely."** Yet the client (`left-for-you.js` accepts video up to 40 MB) and the edge function (`supabase/functions/send-web-push/index.ts`, which `select`s `notification_preferences.left_for_you`) already assume these changes are live, and `tests/m5g3-production-hotfix.test.js` explicitly title-asserts *"keeps the dedicated notification preference migration prepared but unapplied."* This is a **known, test-enforced project convention** (ship code ahead of an unapplied migration, apply it in a later, separate step) rather than a discovery unique to this audit — but it means I **cannot verify from the repository alone** whether the 40 MiB ceiling or the `left_for_you` notification-preference column are live on origin's remote Supabase project right now. It is out of scope for the `left_for_you` row/storage lifecycle question this document answers, but any M5I-B rollout should apply its own migrations with the same "prepared, verify, then apply" discipline, and should not assume M5G2/M5G3 are already live.

---

## 2. ROOT CAUSE — why historical items reappear

Two independent facts compound:

1. **`fetchItems()` always fetches full history, unfiltered by `seen_at`** (§1.4). The client holds every item the recipient has ever received, forever, in `items`.
2. **`window.openLeftForYou` (used by the push-notification deep link) calls `open()` unconditionally**, without the `unseenCount > 0` gate that the in-app envelope tap enforces (§1.5). When `open()` runs and finds no unseen item, `currentIndex` is left at whatever it last was — `0` on a fresh page load, i.e. **the most recently sent item, which may already be seen.**

**Reproduction (proven from code, not from a live incident report):** a user receives an item, opens it in-app (marks it seen via the envelope tap, which is correctly gated). Later — a duplicate/retried push delivery, a delayed push arriving after the user already saw the item in-app, or simply the user tapping an old notification still sitting in their OS notification tray — triggers `notificationclick` → `performPushNavigation('left_for_you')` → `window.openLeftForYou()` → `open()` → `fetchItems()` (returns the same already-seen item at index 0, since nothing newer exists) → renders it in the full-screen receiver view exactly as if it were new. `markSeen` no-ops silently, so there is no error, no log, nothing to distinguish this from a genuine new arrival other than that the content is stale.

This is a **client dispatch bug** (`openLeftForYou` bypassing the closed/open gate), not a database defect — the row itself is not duplicated or reinserted; it is the *same* row, re-rendered because the query and the entry point both lack a "what's actually new" boundary. It must be fixed at the client regardless of what DB-level lifecycle (§3 onward) is chosen, because no server-side deletion policy protects against a client that opens a stale index into an otherwise-correct dataset.

---

## 3. PRODUCT CONTRACT — exact lifecycle

This section defines the contract M5I-B should implement. It resolves the product questions posed for this audit.

1. **Definition of "new" = `seen_at IS NULL`.** This is already the server-authoritative signal (`mark_left_item_seen` is the only writer, one-way `NULL → now()`, RLS-enforced recipient-only). No new column is needed for "new."
2. **An item leaves the *ordinary* envelope (the unseen badge / closed-state / auto-opened queue) the instant `mark_left_item_seen` transitions its `seen_at`.** This already works correctly today via `unseenCount`. What does **not** work today is that a *seen* item can still be surfaced by the receiver-view entry point outside the badge (§2) — that must stop: any call into the receiver view when there is nothing unseen must behave exactly like the tap-gate already does (route to the composer / a neutral "nothing new" state), never silently open a historical item. This is a client fix, independent of persistence policy.
3. **Physical deletion vs query exclusion, decided per §7:** neither "keep forever, never filter" (current state) nor "keep forever, filter client-side" is acceptable as the permanent answer, because the table has no bound and every photo/audio/video byte is retained forever regardless of whether either partner still wants it. The recommended contract (Option B′, §7) is: seen + non-conserved items remain fully readable/query-excluded-from-the-unseen-badge indefinitely (query exclusion, cheap, reversible), and are **only** physically deleted, along with their storage object, after both (a) a conservative grace period past `seen_at` and (b) confirmation they were never conserved.
4. **Conserved source items are permanently exempt from deletion.** A `left_for_you` row with a matching `conserva_contributions.source_item_id` is never a physical-deletion candidate, full stop — this is required by the `ON DELETE CASCADE` dependency (§1.3) and by the explicit "no future Moment should lose its source" requirement. This also means the M5D "no payload snapshot" decision remains valid and does not need to be revisited by M5I: as long as conserved rows are never deleted, the FK-to-source model keeps working exactly as M5D designed it.
5. **Media cleanup runs only when the owning DB row is deleted, is scoped to `kind IN ('photo','audio','video')` (never `music`, which stores an external URL, not a bucket path), and is best-effort** (row deletion is authoritative; a storage-removal failure is logged and retried, not treated as blocking or as reason to resurrect the row) — matching the existing `moments-albums.js` precedent (§1.6).
6. **No future Moment/Ricordi feature can ever be starved of source material by M5I**, because conserved rows are excluded from deletion by construction (point 4), not by a best-effort scan.
7. **Conserva-vs-cleanup race is closed structurally, not by locking discipline alone:** cleanup's deletion predicate re-checks "not conserved" as part of the same statement, and is additionally protected by a grace period generous enough (see §7) that the realistic race window (user conserves within the same session they viewed the item) is not actually reachable — locking is a defense-in-depth, not the sole guarantee.
8. **Realtime**, per §8: the existing INSERT-only subscription is preserved for "new item arrived," and is extended to also react to seen-transitions and (once introduced) deletions, so a second device does not show a stale closed/open state or attempt to render a row that a first device or the cleanup job already removed.
9. **RLS/RPC/security boundaries are unchanged in spirit:** every new lifecycle-mutating action (physical delete) must be `SECURITY DEFINER`, `search_path` pinned, and either recipient/sender-scoped or `service_role`-only (for the scheduled cleanup), exactly like `mark_left_item_seen` and `conserve_left_for_you` already are. No new client-facing UPDATE/DELETE grant should ever be added to `left_for_you`.
10. **Existing user-visible M5 semantics remain unchanged:** the envelope closed/open visual contract, the one-item-at-a-time receiver, the composer, and Conserva's button behavior are all preserved as-is. M5I is additive (a client dispatch fix + a bounded server-side cleanup job) and touches no HTML/CSS contract already locked down by `tests/m5f-unified-envelope.test.js`.
11. **"Seen" and "consumed" stay one state.** The only real lifecycle problem this audit found — the conserve-vs-cleanup race — is fully addressed by "conserved rows are permanently exempt from deletion" (point 4) without needing a distinct "consumed" state. Introducing a `consumed_at` or similar would duplicate what `conserva_contributions` existence already tells you and would need its own race analysis for no product benefit. Do not add it.

---

## 4. CONSERVA CONTRACT — technical/product meaning

Unchanged from M5D, reaffirmed here because M5I depends on it: Conserva does not create a finished Moment. It creates a durable, couple-visible, immutable-to-the-client `conserva_contributions` row that references its `left_for_you` source by FK. It is recipient-only, idempotent, and never mutates the source row. **M5I's one addition to this contract is negative, not additive: it guarantees the source row conserva points to will never be deleted**, which is a guarantee M5D's own design assumed but could not itself enforce (nothing in M5D prevented a future migration from deleting `left_for_you` rows out from under it). M5I closes that gap by making "is conserved" a hard exclusion predicate in the only thing that will ever delete a `left_for_you` row.

A future Moment/Ricordi consumption flow (explicitly out of scope, §12) will read `conserva_contributions` joined to `left_for_you` to get the actual payload — exactly as M5D intended, still valid after M5I.

---

## 5. MEDIA LIFECYCLE

- **Photo/audio/video:** one storage object per row (enforced by `media_path UNIQUE`). Deleting the row is the only trigger for deleting the object. Delete the object *after* the row delete commits (or in the same server-side transaction/RPC, storage call after the row's deletion is durable), matching the `moments-albums.js` row-then-storage order. Storage failure is logged, not retried synchronously, not blocking — a fully orphaned object (row gone, file remains) is a bounded, low-cost failure mode (private bucket, no PII exposure beyond what RLS already permitted the couple), acceptable to leave for a periodic best-effort sweep rather than engineering a fully transactional two-phase delete.
- **Music:** `media_path` is an external `https://open.spotify.com/track/...` URL, never a bucket path (enforced by `left_for_you_music_contract_check` + the INSERT policy's `NOT starts_with(...)` clause). Cleanup must **never** call `storage.remove()` for a `music` row — gate the storage-removal step on `kind IN ('photo','audio','video')` explicitly, not on "has `media_path`."
- **Text:** no media at all, nothing to clean up.
- **Conserved items:** never deleted (§3.4), so their media is never a cleanup candidate either — this is a direct, automatic consequence of the row-deletion exclusion, not a separate mechanism to build.
- **Orphan prevention going forward:** because `media_path` is unique and every insert is namespaced sender-owned, there is currently zero risk of two rows sharing one object; the only orphan risk the M5I cleanup job itself introduces is "row deleted, object removal failed" (addressed above, acceptable, boundable by an optional future best-effort storage sweep — explicitly deferred, not part of the M5I-B bounded steps in §11).

---

## 6. STATE MODEL

Two durable states on `left_for_you`, unchanged in count from today:

- **Unseen** (`seen_at IS NULL`) — "new," drives the envelope badge, eligible for the receiver's auto-advance queue.
- **Seen** (`seen_at IS NOT NULL`) — everything else. Not further subdivided.

One derived, cross-table fact, not a state on the row itself:

- **Conserved** = `EXISTS (SELECT 1 FROM conserva_contributions WHERE source_item_id = left_for_you.id)`. This determines deletion eligibility (never, if true) but is not a `left_for_you` column and should not become one — it already has a single source of truth in `conserva_contributions`, and duplicating it onto `left_for_you` would reintroduce exactly the "second source of truth" problem M5D's own design comment explicitly rejected for the payload.

One lifecycle action with no state representation, because it is instantaneous and irreversible:

- **Deleted** — the row (and, for photo/audio/video, its storage object) is gone. There is deliberately no tombstone/`deleted_at` row kept around: nothing in the product contract needs "show that something used to be here," and keeping a tombstone would reintroduce unbounded row growth for a table whose entire M5I purpose is to bound growth.

This directly answers product question 11: no third *state* is needed. "Conserved" is a fact about a different table, not a new state on `left_for_you`, and it is the only additional concept the lifecycle contract needs beyond seen/unseen.

---

## 7. DATABASE / RPC DESIGN

**Recommendation: Option B′ — bounded, conserve-aware physical deletion**, not plain Option A (query-only forever) and not Option C (payload snapshot).

Why not A alone: query-only exclusion (just adding `AND seen_at IS NULL` to the ordinary envelope's badge query — which is a client fix, needed regardless, see §9) does nothing about unbounded storage/row growth. It is necessary but not sufficient as a permanent architecture; the "current code/database" already effectively behaves like an unfiltered version of A today, and that is the status quo this audit was commissioned to move past.

Why not C: C (snapshot the payload into `conserva_contributions` so the source can be deleted unconditionally) directly reverses M5D's explicit, deliberate, test-enforced decision (`tests/m5d-conserva-contribution.test.js` asserts the contribution table has *no* `body`/`media_path`/`kind` columns) to avoid a second source of truth. Nothing in this audit's evidence shows that decision has become wrong — it becomes unnecessary once deletion simply never touches conserved rows (§3.4). Reversing it would be a strictly larger schema/RPC change (new columns, a copy step inside `conserve_left_for_you`, a media-copy-or-re-namespace step for photo/audio/video) for no lifecycle benefit B′ doesn't already provide. Do not pursue C unless a future mission surfaces a *different* reason to decouple (e.g., the source `left_for_you` row needing to be mutable or user-deletable in ways that would conflict with a conserved reference — no such requirement exists today).

**Design sketch (for the IMPLEMENTATION PLAN in §11 — not applied by this audit):**

- A new `SECURITY DEFINER`, `search_path = ''`, `service_role`-only function, e.g. `private.cleanup_left_for_you_items()`, following the exact idiom of `mark_left_item_seen`/`conserve_left_for_you`:
  ```sql
  delete from public.left_for_you as item
  using (
    select l.id, l.media_path, l.kind
    from public.left_for_you as l
    where l.seen_at is not null
      and l.seen_at < now() - interval '<grace period>'
      and not exists (
        select 1 from public.conserva_contributions as c
        where c.source_item_id = l.id
      )
    for update skip locked
  ) as candidate
  where item.id = candidate.id
  returning item.id, item.media_path, item.kind;
  ```
  `FOR UPDATE SKIP LOCKED` in the candidate CTE means a row a `conserve_left_for_you` call is concurrently holding a lock on (its own `SELECT ... FOR ... ` lookups don't take row locks, but this is defense-in-depth regardless) is simply skipped this run and picked up next run, never partially deleted.
- The function returns the deleted rows' `id, media_path, kind` so the caller (an Edge Function invoked on a schedule, since Postgres itself cannot call `storage.remove()`) can perform the storage cleanup step for `kind IN ('photo','audio','video')` rows, using the `service_role` storage client (not subject to the `us_media_delete_own` ownership-match RLS that blocks a recipient from deleting a sender-owned object — see §1.6).
- No new client-facing grant, policy, or RPC is added to `left_for_you`. Grants/RLS as they exist today (§1.2) are already correctly restrictive for this design; the only new privileged surface is the `service_role`-only cleanup function plus the scheduled Edge Function that calls it (analogous in privilege shape to `send-web-push`, which already runs with the `admin`/service-role client).
- `conserva_contributions` schema, RLS, grants, and `conserve_left_for_you` are **unchanged**. No migration touches M5D.

---

## 8. CLIENT QUERY / REALTIME DESIGN

- **`fetchItems()` must stop being the single query used for both "what's the badge count" and "what does the receiver view page through."** Recommended split:
  - Badge/closed-state query: `WHERE recipient_id = me AND seen_at IS NULL` (this is exactly what the existing-but-currently-unused `left_for_you_recipient_unseen_idx` partial index was built for — §1.1).
  - Receiver-view query (paging through "what's here right now"): can remain broader than just-unseen for the duration of one open session (so a user can still page back through same-session-recent items without a second round trip), but **must never be reached by a dispatcher that doesn't first check there's something unseen** — this is the §2 fix: make `window.openLeftForYou` apply the same `unseenCount > 0` gate `tap()` already applies, or fold the deep-link path through `tap()`'s logic directly.
- **Conserved-state must become server-derived, not session-memory-derived** (§1.8): extend the receiver-view fetch (not the lightweight badge query) to also fetch the set of `source_item_id`s the couple has conserved (`select source_item_id from conserva_contributions where couple_id = me.couple_id` — already permitted by the existing SELECT-same-couple RLS policy, no new grant needed) and mark `item.conserved` from that, not only from an in-session RPC response. This fixes the reload/second-device "Conserva button forgets it was already pressed" gap identified in §1.8, and becomes load-bearing once deletion exists: a client that doesn't know an item is conserved has no way to explain to the user why it's still around after other seen items have disappeared.
- **Realtime subscription should extend from INSERT-only to also include UPDATE** (so a second device's badge closes the moment the first device marks an item seen, not only on next full refetch) **and, once deletion ships, DELETE** (so a second device that has an item open when the cleanup job removes it — only possible for a seen, non-conserved, grace-period-expired item, i.e. never something currently being viewed as "new," but possible if the user reopens an old push notification per §2's exact bug — gets a clean "no longer here" state instead of a broken signed-URL fetch). This is a bounded, mechanical change to the existing `.on('postgres_changes', {...})` call in `subscribeRealtime()`.
- Second-device / reconnect behavior for **arrivals** is already correct today (INSERT realtime + `handleIncoming()` re-running `fetchItems()`, §1.4/§1.7) and needs no change.

---

## 9. RACE / FAILURE HANDLING

- **Conserve vs. cleanup:** closed by construction (§7's `NOT EXISTS`/`FOR UPDATE SKIP LOCKED` predicate) plus a grace period (recommend **30 days** past `seen_at`) that makes the theoretical race practically unreachable — real Conserva taps happen within the same viewing session, seconds to minutes after `seen_at`, not weeks later. The grace period is the primary defense; the SQL-level guard is defense-in-depth for the theoretical case of a cleanup job with an unusually short or misconfigured grace period.
- **Mark-seen vs. cleanup:** not a race — `mark_left_item_seen` only ever transitions `seen_at` from `NULL` to `now()` on an unseen row, so it can never mutate a row the cleanup job's `seen_at IS NOT NULL` predicate already matched. No ordering dependency exists between them.
- **Two devices, one marks seen while the other has the envelope open:** currently silently stale until next refetch (§1.7) — closed by the realtime UPDATE subscription extension in §8.
- **Push notification deep link into a stale/removed item:** this is exactly §2's bug, and remains possible in principle even after cleanup ships (a very old push notification, clicked after its item's grace period expired and it was deleted) — the client fix in §8 (gate `openLeftForYou` the same way `tap()` is gated, and handle "target row no longer exists" as a benign empty/neutral state rather than an error) covers both the pre-existing bug and the new deletion case with the same fix.
- **Storage removal failure during cleanup:** non-fatal, logged, matches existing `moments-albums.js` precedent (§1.6) — the DB row deletion is authoritative and is not rolled back or retried because a storage call failed.
- **Cleanup job running concurrently with itself (e.g., overlapping schedule runs):** `FOR UPDATE SKIP LOCKED` makes concurrent executions safe — each run only claims rows the other isn't currently holding.

---

## 10. MIGRATION STRATEGY for existing historical rows

Any row already `seen_at IS NOT NULL` as of the day M5I-B's cleanup ships will, by definition, already be older than any reasonable grace period the day the first cleanup run executes — because the feature has been live since 2026-09-22 and this audit is dated 2026-09-24, essentially every currently-seen row is already "old." Running the cleanup job's stated grace-period rule (§7/§9, 30 days) verbatim on day one would therefore delete most of the couple's entire seen-and-unconserved history in a single first run, which is a much bigger, more sudden behavior change than "introduce a bounded lifecycle" implies and gives users no warning that unconserved content they might still want to look back on is about to disappear.

Recommended one-time transition, to be executed as an explicit, separate, bounded step (not folded silently into the first scheduled run):

1. Ship the client fixes (§2, §8) and the `conserve_left_for_you`-aware cleanup **function** (§7) in the same M5I-B release, but do **not** attach it to a schedule yet.
2. Compute, read-only, how many currently-seen/non-conserved rows exist and their `media_path` storage footprint, so the actual blast radius of first-run cleanup is known before it runs (this is a read-only reporting query, not a migration).
3. Communicate/allow a one-time grace window (e.g., "unconserved items older than 30 days will be cleared starting <date>") if the product owner decides users should get a heads-up — this is a product decision, not a technical one, and is explicitly left to the M5I-B implementer/product owner rather than decided here.
4. Attach the cleanup function to its schedule only after that window, so the *first* scheduled run behaves identically to every subsequent run (grace period measured from `seen_at`, same predicate, no special-casing of "old" vs "new" seen rows) — avoiding a permanent, special-cased "backfill mode" in the cleanup function itself.

No schema migration is required to support this transition — it is purely a matter of *when* the already-designed cleanup function is first put on a schedule.

---

## 11. IMPLEMENTATION PLAN for bounded M5I-B steps

In dependency order. None of this is applied by this audit; it is the plan for the next, separate implementation mission.

1. **Client dispatch fix (no schema change):** make `window.openLeftForYou` respect the same `unseenCount > 0` gate `tap()` already enforces, so a push-notification deep link into an already-fully-seen inbox routes to a neutral/composer state instead of re-rendering the most recent historical item. This alone fixes the reported root cause (§2) and should ship independently of everything else below.
2. **Badge/receiver query split (no schema change):** point the badge/closed-state derivation at a `seen_at IS NULL`-filtered query (using the already-existing `left_for_you_recipient_unseen_idx`); keep the receiver-view fetch as-is for now.
3. **Conserved-state surfaced to the client (no schema change):** extend the receiver-view load to also fetch the couple's `conserva_contributions.source_item_id` set and populate `item.conserved` from it, fixing §1.8's reload/second-device gap.
4. **Realtime extension (no schema change):** add `UPDATE` (and, after step 6, `DELETE`) to the existing `postgres_changes` subscription.
5. **New migration, `service_role`-only, additive:** `private.cleanup_left_for_you_items()` per §7's sketch. Ship unscheduled first, per §10.
6. **New Edge Function (or extend an existing scheduled one) that calls step 5's function and performs the storage cleanup** for `kind IN ('photo','audio','video')` rows it returns, per §5.
7. **Attach the schedule** (pg_cron or an external scheduler calling the Edge Function) only after the one-time transition consideration in §10 is resolved.

Steps 1–4 are independently valuable and address the audited bug and gaps even if steps 5–7 (physical deletion) are deferred to a later mission — they do not depend on deletion existing.

---

## 12. NON-GOALS

- Moment/Ricordi creation UI or the future flow that will consume `conserva_contributions` — untouched, unspecified beyond "the FK-based provenance model M5D already built remains valid" (§4).
- Any redesign of `conserva_contributions`'s schema (e.g., payload snapshotting, Option C) — explicitly rejected for now (§7).
- M6 or any feature beyond `left_for_you`.
- Android/Capacitor — frozen per mission authority; this document assumes web/PWA is the only live surface and does not audit `dist/capacitor/*`.
- Resolving the M5G2 (40 MiB bucket ceiling) / M5G3 (`notification_preferences.left_for_you` column) "prepared but unapplied" ambiguity noted in §1.9 — flagged for awareness, not addressed, since it is orthogonal to row/media lifecycle.
- A fully transactional (non-best-effort) row+storage delete — the best-effort posture matches existing project precedent (§1.6/§5) and a stronger guarantee was not found to be product-required by this audit.
- Any change to `mark_left_item_seen`, `conserve_left_for_you`, or their existing RLS/grants — both are correct as audited and are treated as fixed points this design builds around, not modifies.
