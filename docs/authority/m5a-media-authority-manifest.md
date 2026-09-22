# M5A — Media Authority Manifest (local, NON-executable)

Stato: **snapshot authority dello stato remoto Supabase già verificato** (ristretto
read-only il 2026-09-22 dopo il merge mobile polish `84f7902`).

> ⚠️ **NOTA ESPLICITA: questo documento NON è una migration applicabile.**
> Non deve essere eseguito, applicato o referenziato da `supabase/migrations/`.
> È una canonizzazione locale read-only dello stato remoto esistente.
> Nessuna modifica remote è stata effettuata per produrlo.

Ambito: `stories`, `story_views`, `moments`, `moment_photos`, bucket Storage `us-media`.
Fuori ambito: Moments semantics, UI, Android, M5B (Lasciato per te).

---

## 1. `public.stories`

Schema:

| colonna | tipo | null | default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `couple_id` | uuid | NO | — |
| `author_id` | uuid | NO | — |
| `media_path` | text | NO | — |
| `caption` | text | YES | — |
| `duration_seconds` | smallint | NO | `10` |
| `created_at` | timestamptz | NO | `now()` |
| `expires_at` | timestamptz | NO | `now() + interval '24 hours'` |

Constraints:

- PK `stories_pkey (id)`
- FK `stories_couple_id_fkey`: `couple_id → couples(id) ON DELETE CASCADE`
- FK `stories_author_id_fkey`: `author_id → profiles(id) ON DELETE CASCADE`
- CHECK `stories_duration_seconds_check`: `duration_seconds BETWEEN 1 AND 10`

Indexes:

- `stories_pkey` UNIQUE btree `(id)`
- `stories_author_created_idx` btree `(author_id, created_at DESC)`
- `stories_couple_expires_idx` btree `(couple_id, expires_at DESC)`

RLS: ENABLED (not forced).

Policies (permissive, role `authenticated`):

- `stories_select_same_couple` SELECT USING `couple_id = private.current_couple_id()`
- `stories_insert_own` INSERT WITH CHECK
  `couple_id = private.current_couple_id() AND author_id = auth.uid() AND expires_at <= now() + interval '24:05' AND expires_at > now()`
- `stories_delete_own` DELETE USING `couple_id = private.current_couple_id() AND author_id = auth.uid()`

Nessuna policy UPDATE.

Grants: `ALL` (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN) a
`anon`, `authenticated`, `service_role`, `postgres` (grants standard Supabase; la
selettività è affidata interamente a RLS).

Realtime: **in** `supabase_realtime` publication.

---

## 2. `public.story_views`

Schema:

| colonna | tipo | null | default |
|---|---|---|---|
| `story_id` | uuid | NO | — |
| `viewer_id` | uuid | NO | — |
| `viewed_at` | timestamptz | NO | `now()` |

Constraints:

- PK `story_views_pkey (story_id, viewer_id)`
- FK `story_views_story_id_fkey`: `story_id → stories(id) ON DELETE CASCADE`
- FK `story_views_viewer_id_fkey`: `viewer_id → profiles(id) ON DELETE CASCADE`

Indexes:

- `story_views_pkey` UNIQUE btree `(story_id, viewer_id)`
- `story_views_viewer_idx` btree `(viewer_id, viewed_at DESC)`

RLS: ENABLED (not forced).

Policies (permissive, `authenticated`):

- `story_views_select_same_couple` SELECT USING
  `EXISTS (SELECT 1 FROM stories s WHERE s.id = story_id AND s.couple_id = private.current_couple_id())`
- `story_views_insert_self` INSERT WITH CHECK
  `viewer_id = auth.uid() AND EXISTS (SELECT 1 FROM stories s WHERE s.id = story_id AND s.couple_id = private.current_couple_id() AND s.expires_at > now())`

Nessuna policy UPDATE/DELETE.

Grants: `ALL` a `anon`, `authenticated`, `service_role`, `postgres` (standard Supabase).

Realtime: **in** `supabase_realtime` publication.

---

## 3. `public.moments`

Schema:

| colonna | tipo | null | default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `couple_id` | uuid | NO | — |
| `created_by` | uuid | NO | — |
| `storage_path` | text | NO | — |
| `caption` | text | YES | — |
| `moment_date` | date | NO | `CURRENT_DATE` |
| `created_at` | timestamptz | NO | `now()` |

Constraints:

- PK `moments_pkey (id)`
- FK `moments_couple_id_fkey`: `couple_id → couples(id) ON DELETE CASCADE`
- FK `moments_created_by_fkey`: `created_by → profiles(id) ON DELETE CASCADE`
- UNIQUE `moments_storage_path_key (storage_path)`

Indexes:

- `moments_pkey` UNIQUE btree `(id)`
- `moments_storage_path_key` UNIQUE btree `(storage_path)`

RLS: ENABLED (not forced).

Policies (permissive, `authenticated`):

- `moments_select_same_couple` SELECT USING `couple_id = private.current_couple_id()`
- `moments_insert_own` INSERT WITH CHECK
  `couple_id = private.current_couple_id() AND created_by = auth.uid()`
- `moments_update_own` UPDATE USING/WITH CHECK
  `couple_id = private.current_couple_id() AND created_by = auth.uid()`
- `moments_delete_own` DELETE USING
  `couple_id = private.current_couple_id() AND created_by = auth.uid()`

Grants: `ALL` a `anon`, `authenticated`, `service_role`, `postgres` (standard Supabase).

Realtime: **in** `supabase_realtime` publication.

Nota: Moments semantics restano intoccate (scope M5A).

---

## 4. `public.moment_photos`

Schema:

| colonna | tipo | null | default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `moment_id` | uuid | NO | — |
| `couple_id` | uuid | NO | — |
| `created_by` | uuid | NO | — |
| `storage_path` | text | NO | — |
| `caption` | text | YES | — |
| `position` | smallint | NO | `1` |
| `created_at` | timestamptz | NO | `now()` |

Constraints:

- PK `moment_photos_pkey (id)`
- FK `moment_photos_moment_id_fkey`: `moment_id → moments(id) ON DELETE CASCADE`
- FK `moment_photos_couple_id_fkey`: `couple_id → couples(id) ON DELETE CASCADE`
- FK `moment_photos_created_by_fkey`: `created_by → profiles(id) ON DELETE CASCADE`
- UNIQUE `moment_photos_storage_path_key (storage_path)`
- CHECK `moment_photos_position_positive`: `position >= 1`
- CHECK `moment_photos_caption_len`: `caption IS NULL OR char_length(caption) <= 180`

Indexes:

- `moment_photos_pkey` UNIQUE btree `(id)`
- `moment_photos_storage_path_key` UNIQUE btree `(storage_path)`
- `moment_photos_couple_idx` btree `(couple_id)`
- `moment_photos_moment_position_idx` btree `(moment_id, "position", created_at)`

RLS: ENABLED (not forced).

Policies (permissive, `authenticated`):

- `moment_photos_select_same_couple` SELECT USING
  `couple_id = private.current_couple_id() AND EXISTS (SELECT 1 FROM moments m WHERE m.id = moment_id AND m.couple_id = private.current_couple_id())`
- `moment_photos_insert_own` INSERT WITH CHECK
  `couple_id = private.current_couple_id() AND created_by = auth.uid() AND EXISTS (SELECT 1 FROM moments m WHERE m.id = moment_id AND m.couple_id = private.current_couple_id())`
- `moment_photos_update_own` UPDATE USING/WITH CHECK
  `couple_id = private.current_couple_id() AND created_by = auth.uid()`
- `moment_photos_delete_own` DELETE USING
  `couple_id = private.current_couple_id() AND created_by = auth.uid()`

Grants: `ALL` a `anon`, `authenticated`, `service_role`, `postgres` (standard Supabase).

Realtime: **in** `supabase_realtime` publication.

---

## 5. Storage bucket `us-media`

Bucket:

- `id` / `name`: `us-media`
- `public`: **false** (privato; accesso via signed URL)
- `file_size_limit`: 8 388 608 byte (8 MiB)
- `allowed_mime_types`: `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif`
- creato: 2026-08-18T23:38:50Z (non aggiornato successivamente)

RLS su `storage.objects`: ENABLED.

Policies (permissive, `authenticated`, tutte con `bucket_id = 'us-media'`):

- `us_media_select_same_couple` SELECT USING
  `storage.foldername(name)[1] = private.current_couple_id()::text`
- `us_media_insert_own_folder` INSERT WITH CHECK
  `foldername(name)[1] = private.current_couple_id()::text AND foldername(name)[2] = auth.uid()::text`
- `us_media_update_own` UPDATE USING/WITH CHECK
  `owner_id = auth.uid()::text AND foldername(name)[1] = private.current_couple_id()::text`
  (WITH CHECK aggiunge `foldername(name)[2] = auth.uid()::text`)
- `us_media_delete_own` DELETE USING
  `owner_id = auth.uid()::text AND foldername(name)[1] = private.current_couple_id()::text`

Layout path atteso dal frontend: `couple_id/user_id/<nome-file>`.

---

## 6. Realtime (sintesi)

Publication `supabase_realtime` (solo tabella-based, public schema):

- `stories` ✔
- `story_views` ✔
- `moments` ✔
- `moment_photos` ✔

---

## 7. Migration remote note (provenienza)

Storico remoto tracciato (`supabase_migrations`), voci rilevanti:

- `20260820160643 add_moment_album_photos` — lineage album photos (moments/moment_photos).
- `20260820163727 performance1_enable_targeted_realtime` — iscrizione Realtime mirata.
- Nessuna migration tracciata nomina esplicitamente `stories` / `story_views`
  né la creazione del bucket `us-media` con le sue policies: tali strutture sono
  state create/evolute **fuori dallo storico tracciato** (dashboard/SQL manuale)
  e sono attestate unicamente dallo stato live del database, che questo
  manifest canonizza.

È per questo che il manifest è l'authority locale: il repo non contiene migration
capaci di ricostruire fedelmente questo stato, e **nessuna migration va applicata**
per produrre questo stato (già esistente in remoto).

---

## 8. Verifica e data

- Verifica remota: **ristretta read-only via Supabase MCP (progetto US, us-read)**,
  2026-09-22, dall'integrità di commit `main 84f7902` (post-merge mobile polish).
- Compatibilità con audit M5 precedente: confermata (nessuna drift rilevata).
- Data di validità dello snapshot: 2026-09-22.
- Prossimo stadio: M5B (Lasciato per te) partirà DOPO approvazione di questo
  manifest; non è ancora iniziato.
