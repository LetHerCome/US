// M12B.3 — Living Loop provenance foundation and Event completion history.
// Real repo SQL on embedded Postgres (pglite): the M7A/M7C/M7D/M12B.2 Da vivere
// migrations, the M11A.1 locked actor, and the three M12B.3 migrations, over
// production-shaped stand-ins for moments (M5A manifest) and the Eventi
// authority (tests/helpers/m12b-3-events-fixture.js). Partner races run on a
// real server in m12b-3-living-provenance-race.test.js; the Game V2 grouping
// rule in m12b-3-game-v2-living-origin.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const { EVENTS_FIXTURE, M12B3 } = require('./helpers/m12b-3-events-fixture');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
const DA_VIVERE = ['20260929121350_m7a_da_vivere_bucket_items_domain', '20260929190126_m7c_da_vivere_calendar_unschedule',
  '20260929190145_m7d_da_vivere_reciprocal_lived', '20260930225935_m12b_2_da_vivere_archived_link_release']
  .map((n) => `supabase/migrations/${n}.sql`);
const M11A1 = 'supabase/migrations/20260930121312_m11a_1_game_rpc_readonly_actor.sql';
const uuid = () => crypto.randomUUID();

// The production actor helper, taken verbatim from the M11A.1 migration.
const ACTOR_LOCKED = read(M11A1).match(/create function private\.m11a_actor_locked\(\)[\s\S]*?\$\$;\n/)[0];

const BASE_FIXTURE = `
  create role authenticated; create role anon;
  grant usage on schema public to authenticated, anon;
  create schema auth;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  create schema private;
  create table public.couples (id uuid primary key);
  create table public.profiles (id uuid primary key, couple_id uuid not null references public.couples(id), role text);
  grant select on public.profiles to authenticated;
  create table public.calendar_entries (
    id uuid primary key default gen_random_uuid(), couple_id uuid not null,
    entry_type text not null check (entry_type in ('personal', 'shared')), created_by uuid,
    title text not null default 'Evento', starts_at timestamptz, start_date date
  );
  alter table public.calendar_entries enable row level security;
  create policy calendar_entries_all on public.calendar_entries for all
    using (couple_id = (select p.couple_id from public.profiles p where p.id = auth.uid()))
    with check (couple_id = (select p.couple_id from public.profiles p where p.id = auth.uid()));
  grant select, insert, update, delete on public.calendar_entries to authenticated;
  create table public.bucket_items (
    id uuid primary key default gen_random_uuid(), couple_id uuid not null, created_by uuid not null,
    title text not null, completed boolean not null default false, completed_at timestamptz,
    created_at timestamptz not null default now()
  );
  alter table public.bucket_items enable row level security;
  create policy bucket_items_all on public.bucket_items for all
    using (couple_id = (select p.couple_id from public.profiles p where p.id = auth.uid()))
    with check (couple_id = (select p.couple_id from public.profiles p where p.id = auth.uid()));
  grant select, insert, update, delete on public.bucket_items to authenticated;
`;

// public.moments exactly as the M5A manifest records production (photo-backed).
const MOMENTS_FIXTURE = `
  create table public.moments (
    id uuid primary key default gen_random_uuid(),
    couple_id uuid not null references public.couples(id) on delete cascade,
    created_by uuid not null references public.profiles(id) on delete cascade,
    storage_path text not null unique, caption text,
    moment_date date not null default current_date, created_at timestamptz not null default now()
  );
  alter table public.moments enable row level security;
  create policy moments_select_same_couple on public.moments for select to authenticated using (couple_id = private.current_couple_id());
  create policy moments_insert_own on public.moments for insert to authenticated with check (couple_id = private.current_couple_id() and created_by = auth.uid());
  create policy moments_update_own on public.moments for update to authenticated using (couple_id = private.current_couple_id() and created_by = auth.uid()) with check (couple_id = private.current_couple_id() and created_by = auth.uid());
  create policy moments_delete_own on public.moments for delete to authenticated using (couple_id = private.current_couple_id() and created_by = auth.uid());
  grant select, insert, update, delete on public.moments to authenticated, anon;
`;

let db;
let legacy; // a completion that already exists when the migration is applied
test.before(async () => {
  db = new PGlite();
  await db.exec(BASE_FIXTURE);
  for (const f of DA_VIVERE) await db.exec(read(f));
  await db.exec(EVENTS_FIXTURE);
  await db.exec(MOMENTS_FIXTURE);
  await db.exec(ACTOR_LOCKED);
  legacy = await couple();
  legacy.event = await event(legacy, 'Anniversario', '2025-10-04');
  legacy.completion = (await complete(legacy.f, legacy.event, '2025-10-04')).id;
  legacy.rowBefore = await completionRow(legacy.completion);
  await su();
  await db.exec(read(M12B3.provenance));
  await db.exec(read(M12B3.history));
});
test.after(async () => { await db.close(); });

async function as(uid) {
  await db.exec('set role authenticated');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid || '']);
}
async function su() {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
}
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
async function couple() {
  const c = uuid(); const f = uuid(); const b = uuid();
  await su();
  await q('insert into public.couples (id) values ($1)', [c]);
  await q(`insert into public.profiles (id, couple_id, role) values ($1, $3, 'francesco'), ($2, $3, 'beatrice')`, [f, b, c]);
  return { c, f, b };
}
async function event(p, title, date) {
  await as(p.f);
  return (await q('insert into public.shared_events (couple_id, created_by, title, event_date) values ($1, $2, $3, $4) returning id', [p.c, p.f, title, date]))[0].id;
}
async function complete(uid, eventId, date) {
  await as(uid);
  return (await q('select public.complete_shared_event($1, $2) as r', [eventId, date]))[0].r;
}
async function moment(p, uid = p.f, caption = 'Una foto') {
  await as(uid);
  return (await q('insert into public.moments (couple_id, created_by, storage_path, caption) values ($1, $2, $3, $4) returning id',
    [p.c, uid, `couple/${p.c}/${uid}/${uuid()}.jpg`, caption]))[0].id;
}
async function link(uid, momentId, kind, ref) {
  await as(uid);
  return (await q('select public.link_moment_to_source($1, $2, $3) as r', [momentId, kind, ref]))[0].r;
}
const history = async (uid) => { await as(uid); return q('select * from public.relationship_event_history order by completed_at'); };
const provenance = async (where = 'true', params = []) => { await su(); return q(`select * from public.living_provenance where ${where}`, params); };
const completionRow = async (id) => { await su(); return (await q('select * from public.shared_event_completions where id = $1', [id]))[0]; };
const code = (c) => (e) => e.code === c;

async function livedIdea(p, day = '2026-08-15') {
  await as(p.f);
  const item = (await q('insert into public.bucket_items (couple_id, created_by, title) values ($1, $2, $3) returning id', [p.c, p.f, 'Cena al lago']))[0].id;
  const entry = (await q(`insert into public.calendar_entries (couple_id, entry_type, created_by, title, start_date) values ($1, 'shared', $2, 'Cena al lago', $3) returning id`, [p.c, p.f, day]))[0].id;
  await q(`update public.bucket_items set status = 'scheduled', calendar_entry_id = $2 where id = $1`, [item, entry]);
  await as(p.b); await q('select public.confirm_bucket_item_lived($1)', [item]);
  await as(p.f); await q('select public.confirm_bucket_item_lived($1)', [item]);
  return { item, entry };
}

test('A — a completed Event with no Moment is relationship history on its own', async () => {
  const p = await couple();
  const ev = await event(p, 'Weekend Roma', '2026-05-16');
  const done = await complete(p.b, ev, '2026-05-16');
  for (const uid of [p.f, p.b]) {
    const rows = await history(uid);
    assert.equal(rows.length, 1, 'both partners see it');
    const [h] = rows;
    assert.equal(h.source_kind, 'shared_event_completion');
    assert.equal(h.source_ref, done.id);
    assert.equal(h.source_key, `shared_event_completion:${done.id}`);
    assert.equal(h.event_id, ev);
    assert.equal(h.occurrence_date.toISOString().slice(0, 10), '2026-05-16');
    assert.ok(h.completed_at);
    assert.equal(h.completed_by, p.b);
    assert.equal(h.title, 'Weekend Roma');
    assert.equal(h.title_source, 'snapshot');
    assert.equal(h.moment_id, null, 'no Moment is ever created by a completion');
  }
  await su();
  assert.equal((await q('select count(*)::int n from public.moments where couple_id = $1', [p.c]))[0].n, 0);
  assert.equal((await provenance('couple_id = $1', [p.c])).length, 0, 'no provenance row without a derived artifact');
});

test('B — a completion later gets one explicitly linked Moment, with a server-written snapshot', async () => {
  const p = await couple();
  const ev = await event(p, 'Weekend Roma', '2026-05-16');
  const done = await complete(p.f, ev, '2026-05-16');
  const m = await moment(p, p.f, 'Noi due al Pincio');
  const r = await link(p.f, m, 'shared_event_completion', done.id);
  assert.equal(r.status, 'linked');
  assert.equal(r.moment_id, m);
  assert.equal(r.source_key, `shared_event_completion:${done.id}`);
  assert.equal(r.source_title, 'Weekend Roma');
  assert.equal(r.source_date, '2026-05-16');
  const [row] = await provenance('id = $1', [r.id]);
  assert.equal(row.couple_id, p.c);
  assert.equal(row.source_event_completion_id, done.id);
  assert.equal(row.source_bucket_item_id, null);
  assert.equal(row.target_kind, 'moment');
  assert.equal(row.target_moment_id, m);
  assert.equal(row.linked_by_role, 'francesco', 'couple + role, never a profile UID');
  assert.equal((await history(p.b))[0].moment_id, m, 'the partner sees the link');
  await as(p.b);
  assert.equal((await q('select count(*)::int n from public.living_provenance'))[0].n, 1, 'the partner can read the provenance row');
  await su();
  const mm = (await q('select storage_path, caption from public.moments where id = $1', [m]))[0];
  assert.ok(mm.storage_path, 'the Moment stays photo-backed');
  assert.equal(mm.caption, 'Noi due al Pincio', 'the Moment itself is not rewritten');
});

test('C — repeated link requests are idempotent; one Moment per source and one source per Moment', async () => {
  const p = await couple();
  const ev = await event(p, 'Concerto', '2026-04-10');
  const done = await complete(p.f, ev, '2026-04-10');
  const other = await complete(p.f, ev, '2026-04-11');
  const m = await moment(p);
  const first = await link(p.f, m, 'shared_event_completion', done.id);
  const again = await link(p.f, m, 'shared_event_completion', done.id);
  assert.equal(again.status, 'existing');
  assert.equal(again.id, first.id);
  assert.equal((await provenance('couple_id = $1', [p.c])).length, 1);
  const partnerMoment = await moment(p, p.b);
  await assert.rejects(link(p.b, partnerMoment, 'shared_event_completion', done.id), (e) => e.code === '23505' && /source_already_kept/.test(e.message),
    'a second Moment from the same completion is refused (more photos go into its album)');
  await assert.rejects(link(p.f, m, 'shared_event_completion', other.id), (e) => e.code === '23505' && /moment_already_linked/.test(e.message),
    'a Moment never changes source');
  assert.equal((await provenance('couple_id = $1', [p.c])).length, 1);
});

test('D — cross-couple links are rejected and nothing crosses couples; clients cannot forge provenance', async () => {
  const p = await couple();
  const x = await couple();
  const ev = await event(p, 'Weekend Roma', '2026-05-16');
  const done = await complete(p.f, ev, '2026-05-16');
  const mine = await moment(p);
  const theirs = await moment(x, x.f);
  await assert.rejects(link(x.f, theirs, 'shared_event_completion', done.id), code('P0002'), 'another couple\'s source is invisible');
  await assert.rejects(link(p.f, theirs, 'shared_event_completion', done.id), code('P0002'), 'another couple\'s Moment is invisible');
  const { item } = await livedIdea(x);
  await assert.rejects(link(p.f, mine, 'da_vivere', item), code('P0002'));
  await assert.rejects(link(p.b, mine, 'shared_event_completion', done.id), code('42501'), 'only the Moment\'s creator links it');
  await assert.rejects(link(null, mine, 'shared_event_completion', done.id), code('42501'), 'authentication required');
  const r = await link(p.f, mine, 'shared_event_completion', done.id);
  assert.equal((await history(x.f)).length, 0, 'the other couple sees no history');
  await as(x.f);
  assert.equal((await q('select count(*)::int n from public.living_provenance'))[0].n, 0, 'nor provenance');
  // No client write path at all, even for the couple itself.
  for (const [uid, sql, params] of [
    [p.f, `insert into public.living_provenance (couple_id, source_kind, source_ref, source_event_completion_id, target_kind, target_ref, target_moment_id, linked_by_role) values ($1, 'shared_event_completion', $2, $2, 'moment', $3, $3, 'francesco')`, [p.c, done.id, mine]],
    [p.f, 'update public.living_provenance set source_title = $2 where id = $1', [r.id, 'Falso']],
    [p.f, 'delete from public.living_provenance where id = $1', [r.id]],
    [p.f, 'update public.shared_event_completions set event_title_snapshot = $2 where id = $1', [done.id, 'Falso']],
    [p.f, 'insert into public.relationship_event_history (source_kind) values ($1)', ['x']],
  ]) {
    await as(uid);
    // 42501 permission denied; 55000 for the view (a join is never updatable).
    await assert.rejects(q(sql, params), (e) => ['42501', '55000'].includes(e.code), sql);
  }
  await as(null);
  await db.exec('set role anon');
  await assert.rejects(q('select * from public.living_provenance'), code('42501'));
  await assert.rejects(q('select * from public.relationship_event_history'), code('42501'));
  await assert.rejects(q('select public.link_moment_to_source($1, $2, $3)', [mine, 'shared_event_completion', done.id]), code('42501'));
  await su();
  assert.equal((await provenance('id = $1', [r.id]))[0].source_title, 'Weekend Roma');
});

test('E — deleting the Moment removes only its provenance; the completion and its history stay', async () => {
  const p = await couple();
  const ev = await event(p, 'Weekend Roma', '2026-05-16');
  const done = await complete(p.f, ev, '2026-05-16');
  const before = await completionRow(done.id);
  const m = await moment(p);
  await link(p.f, m, 'shared_event_completion', done.id);
  await as(p.f);
  await q('delete from public.moments where id = $1', [m]);
  assert.deepEqual(await completionRow(done.id), before, 'the completion row is untouched');
  assert.equal((await provenance('couple_id = $1', [p.c])).length, 0);
  const [h] = await history(p.b);
  assert.equal(h.source_ref, done.id);
  assert.equal(h.title, 'Weekend Roma');
  assert.equal(h.moment_id, null, 'back to "Evento vissuto" without a photo');
  await su();
  assert.equal((await q('select count(*)::int n from public.shared_events where id = $1', [ev]))[0].n, 1);
  const again = await link(p.f, await moment(p), 'shared_event_completion', done.id);
  assert.equal(again.status, 'linked', 'the same lived occurrence can be kept again');
});

test('F — editing the Event later rewrites neither the history title nor the Moment snapshot', async () => {
  const p = await couple();
  const ev = await event(p, 'Weekend Roma', '2026-05-16');
  const done = await complete(p.f, ev, '2026-05-16');
  const m = await moment(p);
  const r = await link(p.f, m, 'shared_event_completion', done.id);
  await as(p.f);
  await q(`update public.shared_events set title = 'Roma (rinominato)', event_date = '2026-07-01' where id = $1`, [ev]);
  const [h] = await history(p.b);
  assert.equal(h.title, 'Weekend Roma', 'history keeps the title it was lived with');
  assert.equal(h.title_source, 'snapshot');
  assert.equal(h.current_title, 'Roma (rinominato)', 'the live title stays available, labelled as such');
  assert.equal(h.occurrence_date.toISOString().slice(0, 10), '2026-05-16', 'the lived day is the completion\'s, not the event\'s new date');
  const [row] = await provenance('id = $1', [r.id]);
  assert.equal(row.source_title, 'Weekend Roma');
  assert.equal(row.source_date.toISOString().slice(0, 10), '2026-05-16');
  // Server-side writes cannot rewrite history either.
  await su();
  await q(`update public.shared_event_completions set event_title_snapshot = 'Riscritto', xp_awarded = xp_awarded where id = $1`, [done.id]);
  assert.equal((await completionRow(done.id)).event_title_snapshot, 'Weekend Roma', 'the completion snapshot is frozen');
  await assert.rejects(q(`update public.living_provenance set source_title = 'Riscritto' where id = $1`, [r.id]), (e) => /living_provenance_immutable/.test(e.message));
  await assert.rejects(q(`update public.living_provenance set source_ref = gen_random_uuid() where id = $1`, [r.id]), (e) => /living_provenance_immutable/.test(e.message));
  await assert.rejects(q(`update public.living_provenance set target_ref = gen_random_uuid(), target_moment_id = null where id = $1`, [r.id]), /living_provenance_immutable|violates check/);
  // Worst case: the event row is deleted (the stand-in cascades to completions).
  // The Moment survives and still says where it came from.
  await q('delete from public.shared_events where id = $1', [ev]);
  const [kept] = await provenance('id = $1', [r.id]);
  assert.equal(kept.source_event_completion_id, null, 'typed FK released with the source');
  assert.equal(kept.source_key, `shared_event_completion:${done.id}`, 'canonical identity kept');
  assert.equal(kept.source_title, 'Weekend Roma');
  assert.equal((await q('select count(*)::int n from public.moments where id = $1', [m]))[0].n, 1);
});

test('H — the lived Da vivere chain stays traceable: item -> Calendario -> Moment, reusing the existing link', async () => {
  const p = await couple();
  const { item, entry } = await livedIdea(p, '2026-08-15');
  const m = await moment(p, p.b, 'Il lago al tramonto');
  const r = await link(p.b, m, 'da_vivere', item);
  assert.equal(r.status, 'linked');
  assert.equal(r.source_key, `da_vivere:${item}`, 'same key as the Game V2 Da vivere source');
  assert.equal(r.source_title, 'Cena al lago');
  assert.equal(r.source_date, '2026-08-15', 'the day comes from the Calendario entry, the date authority');
  await as(p.f);
  const [chain] = await q(`
    select b.id item, b.status, b.calendar_entry_id entry, e.start_date, p.source_key, p.target_moment_id moment
    from public.bucket_items b
    join public.calendar_entries e on e.id = b.calendar_entry_id
    join public.living_provenance p on p.source_kind = 'da_vivere' and p.source_ref = b.id
    where b.id = $1`, [item]);
  assert.deepEqual([chain.item, chain.status, chain.entry, chain.moment], [item, 'lived', entry, m]);
  // No second scheduling relation: provenance carries no Calendario column.
  const cols = (await q(`select column_name from information_schema.columns where table_name = 'living_provenance'`)).map((c) => c.column_name);
  assert.ok(!cols.some((c) => /calendar|schedule|event_date|starts_at/.test(c)), cols.join(','));
  // lived -> archived keeps the chain (M12B.2: lived history keeps its event).
  await as(p.f);
  await q(`update public.bucket_items set status = 'archived' where id = $1`, [item]);
  await su();
  assert.equal((await q('select calendar_entry_id from public.bucket_items where id = $1', [item]))[0].calendar_entry_id, entry);
  assert.equal((await provenance('id = $1', [r.id]))[0].source_bucket_item_id, item);
  await as(p.f);
  await assert.rejects(q('delete from public.calendar_entries where id = $1', [entry]), code('23001'), 'the Calendario event of a lived item stays');
  // Only lived facts can be kept: a scheduled idea and a pending proposal are refused.
  await as(p.f);
  const idea = (await q('insert into public.bucket_items (couple_id, created_by, title) values ($1, $2, $3) returning id', [p.c, p.f, 'Mai fatta']))[0].id;
  await assert.rejects(link(p.f, await moment(p), 'da_vivere', idea), (e) => e.code === '22023' && /not_lived/.test(e.message));
  await as(p.f); await q('select public.confirm_bucket_item_lived($1)', [idea]);
  await assert.rejects(link(p.f, await moment(p), 'da_vivere', idea), (e) => e.code === '22023' && /not_lived/.test(e.message), 'one-sided proposal is not lived');
});

test('I — existing completions keep working unchanged and become history without a backfill', async () => {
  const after = await completionRow(legacy.completion);
  assert.deepEqual({ ...after, event_title_snapshot: undefined }, { ...legacy.rowBefore, event_title_snapshot: undefined }, 'no existing column changed');
  assert.equal(after.event_title_snapshot, null, 'we do not know the historical title: nothing invented');
  const [h] = await history(legacy.b);
  assert.equal(h.source_ref, legacy.completion);
  assert.equal(h.title, 'Anniversario');
  assert.equal(h.title_source, 'live', 'the reader is told the title is the live one');
  assert.equal((await provenance('couple_id = $1', [legacy.c])).length, 0, 'no provenance fabricated for history');
  // complete_shared_event is unchanged: idempotent on event_id + occurrence_date.
  const again = await complete(legacy.b, legacy.event, '2025-10-04');
  assert.equal(again.already_completed, true);
  assert.equal(again.id, legacy.completion);
  const next = await complete(legacy.b, legacy.event, '2026-10-04');
  assert.equal(next.already_completed, false);
  assert.equal((await completionRow(next.id)).event_title_snapshot, 'Anniversario', 'new completions get their snapshot');
  await su();
  assert.equal((await q('select count(*)::int n from public.shared_event_completions where event_id = $1', [legacy.event]))[0].n, 2);
  // A forged snapshot from any writer is replaced by the couple's own event title.
  await q(`insert into public.shared_event_completions (couple_id, event_id, occurrence_date, event_title_snapshot) values ($1, $2, '2027-10-04', 'Forged')`, [legacy.c, legacy.event]);
  assert.equal((await q(`select event_title_snapshot t from public.shared_event_completions where event_id = $1 and occurrence_date = '2027-10-04'`, [legacy.event]))[0].t, 'Anniversario');
  const x = await couple();
  await q(`insert into public.shared_event_completions (couple_id, event_id, occurrence_date) values ($1, $2, '2028-10-04')`, [x.c, legacy.event]);
  assert.equal((await q(`select event_title_snapshot t from public.shared_event_completions where event_id = $1 and occurrence_date = '2028-10-04'`, [legacy.event]))[0].t, null,
    'never another couple\'s title');
});

test('J — no Daily Question data is reachable: no daily source kind, no daily table read', async () => {
  const p = await couple();
  const m = await moment(p);
  await assert.rejects(link(p.f, m, 'daily_question_reveal', uuid()), (e) => e.code === '22023' && /unsupported_source_kind/.test(e.message));
  await su();
  await assert.rejects(q(`insert into public.living_provenance (couple_id, source_kind, source_ref, target_kind, target_ref, target_moment_id, linked_by_role)
    values ($1, 'daily_question_reveal', gen_random_uuid(), 'moment', $2, $2, 'francesco')`, [p.c, m]), code('23514'), 'the CHECK refuses it even for the server');
  for (const f of Object.values(M12B3)) {
    const code = read(f).replace(/--[^\n]*/g, '');
    assert.doesNotMatch(code, /daily_answers|daily_questions|daily_question_|get_daily_state|left_for_you|conserva_contributions/i, f);
  }
  const cols = (await q(`select column_name from information_schema.columns where table_name = 'relationship_event_history'`)).map((c) => c.column_name);
  assert.deepEqual(cols.sort(), ['completed_at', 'completed_by', 'couple_id', 'current_title', 'event_id', 'moment_id', 'occurrence_date',
    'source_key', 'source_kind', 'source_ref', 'title', 'title_source'].sort());
});

test('migration preconditions: a production shape mismatch fails before any change', async () => {
  const other = new PGlite();
  try {
    await other.exec(BASE_FIXTURE);
    await other.exec('create table public.moments (id uuid primary key, couple_id uuid, created_by uuid)');
    await assert.rejects(other.exec(read(M12B3.provenance)), /m12b_3 precondition failed, nothing changed: .*shared_event_completions\.id uuid/);
    assert.equal((await other.query(`select to_regclass('public.living_provenance') r`)).rows[0].r, null);
  } finally { await other.close(); }
});

test('M12B.3 migrations: later ledger versions, additive, pinned search_path, explicit grants', () => {
  const files = fs.readdirSync(path.join(ROOT, 'supabase/migrations')).sort();
  const last = files.indexOf('20260930225935_m12b_2_da_vivere_archived_link_release.sql');
  // M12B.4 and later batches may follow; the three M12B.3 files come right after M12B.2, in order.
  assert.deepEqual(files.slice(last + 1, last + 4), Object.values(M12B3).map((f) => path.basename(f)), 'the three M12B.3 files follow the production ledger, in order');
  for (const f of Object.values(M12B3)) {
    const sql = read(f);
    const code = sql.replace(/--[^\n]*/g, '');
    // Each file states its production state: "NOT applied in production" before the rollout,
    // "Applied to production as ledger migration <version>" once the ledger is reconciled.
    assert.match(sql, /(NOT applied in|Applied to) production/, `${f}: states its production ledger status`);
    assert.doesNotMatch(code, /\bdrop\s+(table|column|view|function|policy)\b|\btruncate\b|\bdelete\s+from\b|\bupdate\s+public\./i, `${f}: additive, no row rewritten`);
    assert.doesNotMatch(code, /alter table public\.(moments|moment_photos|bucket_items|calendar_entries|shared_events)\b/i, `${f}: those authorities keep their schema`);
    assert.doesNotMatch(code, /claim_us_role|net\.http|us-private-media|storage\.objects|openai|anthropic/i);
    for (const [whole, name] of code.matchAll(/create (?:or replace )?function ([\w.]+)\([\s\S]*?\$\$[\s\S]*?\$\$;/g)) {
      assert.match(whole.slice(0, whole.indexOf('$$')), /set search_path = ''/, `${name} pins search_path`);
      assert.match(code, new RegExp(`revoke all on function ${name.replace('.', '\\.')}\\(`), `${name} revokes default EXECUTE`);
    }
  }
  const prov = read(M12B3.provenance).replace(/--[^\n]*/g, '');
  assert.match(prov, /alter table public\.shared_event_completions add column if not exists event_title_snapshot text;/);
  assert.equal((prov.match(/alter table public\.shared_event_completions/g) || []).length, 1, 'one additive column on the completion authority');
  assert.match(prov, /force row level security/);
  assert.match(prov, /revoke all on public\.living_provenance from public, anon, authenticated;\s*grant select on public\.living_provenance to authenticated;/);
  assert.match(prov, /grant execute on function public\.link_moment_to_source\(uuid, text, uuid\) to authenticated;/);
  assert.doesNotMatch(prov, /grant (insert|update|delete|all)/i);
  const hist = read(M12B3.history);
  assert.match(hist, /security_invoker = true/);
  assert.match(hist, /where c\.couple_id = private\.current_couple_id\(\)/);
  assert.match(read('service-worker.js'), /us-private-media-v1/, 'private media cache name unchanged');
});
