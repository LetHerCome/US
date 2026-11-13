// Couple sync V1 (audit 05/11/2026, punto 2): Realtime drops DELETE events
// filtered by couple_id, so a deletion moves a row of public.couple_sync that
// the other phone hears as an UPDATE (the lavagna pattern), and every change
// of the calendar does the same. Full repo schema in disposable PGlite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const DIR = path.join(__dirname, '../supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_couple_sync_v1\.sql$/.test(f));

let db, C2;
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const sync = async (couple) => Object.fromEntries((await q('select kind, revision::int r from public.couple_sync where couple_id = $1 order by kind', [couple])).map((x) => [x.kind, x.r]));
const ins = async (sql, p) => (await q(sql + ' returning id', p))[0].id;

test.beforeEach(async () => {
  db = await h.database();
  const c = await h.create(db, h.U1, 'Other', '2026-02-02'); C2 = c.couple_id;
  const inv = await h.invite(db, h.U1); await h.accept(db, h.U2, inv.code, 'Other partner');
});
test.afterEach(async () => { await db?.close(); db = null; });

test('migration is listed, couple_sync is in Realtime, nobody but the triggers writes it', async () => {
  assert.ok(FILE, 'missing supabase/migrations/*_couple_sync_v1.sql');
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
  const pub = await q("select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'couple_sync'");
  assert.equal(pub.length, 1);
  for (const role of ['anon', 'authenticated']) {
    for (const right of ['insert', 'update', 'delete']) {
      assert.equal((await q('select has_table_privilege($1, \'public.couple_sync\', $2) r', [role, right]))[0].r, false, `${role} ${right}`);
    }
    assert.equal((await q("select has_function_privilege($1, 'private.couple_sync_bump()', 'execute') r", [role]))[0].r, false);
  }
  assert.equal((await q("select has_table_privilege('anon', 'public.couple_sync', 'select') r"))[0].r, false);
  const fn = (await q("select prosecdef, proconfig from pg_proc where proname = 'couple_sync_bump'"))[0];
  assert.equal(fn.prosecdef, true);
  assert.deepEqual(fn.proconfig, ['search_path=""']);
  await assert.rejects(h.as(db, h.F, "insert into public.couple_sync(couple_id, kind) values ($1, 'moments')", [h.A]), /permission denied/);
});

test('a partner deleting a Ricordo, a photo, a post-it, an event or a story moves the couple signal once per statement', async () => {
  const m1 = await ins('insert into public.moments(couple_id, created_by, storage_path) values ($1, $2, $3)', [h.A, h.F, `${h.A}/${h.F}/m1.webp`]);
  const m2 = await ins('insert into public.moments(couple_id, created_by, storage_path) values ($1, $2, $3)', [h.A, h.F, `${h.A}/${h.F}/m2.webp`]);
  const photo = await ins('insert into public.moment_photos(moment_id, couple_id, created_by, storage_path, position) values ($1, $2, $3, $4, 1)', [m1, h.A, h.B, `${h.A}/${h.B}/p.webp`]);
  const note = await ins("insert into public.couple_notes(couple_id, title, created_by, updated_by) values ($1, 'Spesa', $2, $2)", [h.A, h.B]);
  const event = await ins("insert into public.shared_events(couple_id, created_by, title, event_date) values ($1, $2, 'Cena', '2026-12-01')", [h.A, h.F]);
  const story = await ins('insert into public.stories(couple_id, author_id, media_path) values ($1, $2, $3)', [h.A, h.B, `${h.A}/${h.B}/s.webp`]);
  assert.deepEqual(await sync(h.A), {}, 'creating things moves nothing: inserts already reach the other phone');

  await h.as(db, h.B, 'delete from public.moment_photos where id = $1', [photo]);
  await h.as(db, h.F, 'delete from public.moments where id = any($1::uuid[])', [[m1, m2]]);
  await h.as(db, h.F, 'delete from public.couple_notes where id = $1', [note]);
  await h.as(db, h.B, 'delete from public.shared_events where id = $1', [event]);
  await h.as(db, h.B, 'delete from public.stories where id = $1', [story]);
  assert.deepEqual(await sync(h.A), { events: 1, moments: 2, notes: 1, stories: 1 }, 'two moments in one statement are one signal');
  assert.deepEqual(await sync(C2), {}, 'the other couple is untouched');
});

test('every change of the calendar is one signal; the other couple reads none of it', async () => {
  await h.as(db, h.F, "insert into public.calendar_entries(couple_id, entry_type, created_by, title, is_all_day, start_date, end_date) values ($1, 'shared', $2, 'Treno', true, '2026-12-03', '2026-12-03') returning id r", [h.A, h.F]);
  const id = (await q("select id from public.calendar_entries where title = 'Treno'"))[0].id;
  await h.as(db, h.F, "update public.calendar_entries set title = 'Treno delle 8' where id = $1 returning id r", [id]);
  await h.as(db, h.F, 'delete from public.calendar_entries where id = $1 returning id r', [id]);
  assert.deepEqual(await sync(h.A), { calendar: 3 });

  // Same couple reads its row; the other couple and anon do not.
  assert.deepEqual(await h.as(db, h.B, 'select coalesce(json_agg(kind), \'[]\'::json) r from public.couple_sync'), ['calendar']);
  assert.deepEqual(await h.as(db, h.U1, 'select coalesce(json_agg(kind), \'[]\'::json) r from public.couple_sync'), []);
  await assert.rejects(h.as(db, null, 'select count(*) r from public.couple_sync', [], 'anon'), /permission denied/);
});

test('a delete the other couple tries on this couple moves nothing; erasing a couple leaves no signal behind', async () => {
  const m = await ins('insert into public.moments(couple_id, created_by, storage_path) values ($1, $2, $3)', [h.A, h.F, `${h.A}/${h.F}/m.webp`]);
  await h.as(db, h.U1, 'delete from public.moments where id = $1', [m]);
  assert.deepEqual(await sync(h.A), {}, 'RLS hid the row: nothing deleted, no signal');
  assert.equal((await q('select count(*)::int n from public.moments where id = $1', [m]))[0].n, 1);

  // Couple B: a signal, then both members delete their accounts and the couple
  // is erased (cascade): its rows go with it and the cascade writes nothing new.
  await h.as(db, h.U1, "insert into public.calendar_entries(couple_id, entry_type, created_by, title, is_all_day, start_date, end_date) values ($1, 'shared', $2, 'Volo', true, '2026-12-04', '2026-12-04') returning id r", [C2, h.U1]);
  assert.deepEqual(await sync(C2), { calendar: 1 });
  for (const user of [h.U2, h.U1]) {
    const r = await h.as(db, null, 'select public.s32_delete_account_data($1, $2) r', [user, 'app'], 'service_role');
    assert.equal(r.status, 'db_done', user);
  }
  assert.equal((await q('select count(*)::int n from public.couples where id = $1', [C2]))[0].n, 0, 'the couple is erased');
  assert.deepEqual(await sync(C2), {}, 'no signal survives the couple');
});

test('account deletion in one couple signals only that couple', async () => {
  await ins('insert into public.stories(couple_id, author_id, media_path) values ($1, $2, $3)', [h.A, h.F, `${h.A}/${h.F}/s.webp`]);
  await ins('insert into public.stories(couple_id, author_id, media_path) values ($1, $2, $3)', [C2, h.U1, `${C2}/${h.U1}/s.webp`]);
  const r = await h.as(db, null, 'select public.s32_delete_account_data($1, $2) r', [h.F, 'app'], 'service_role');
  assert.equal(r.status, 'db_done');
  assert.equal((await sync(h.A)).stories, 1, 'the partner hears that the story went');
  assert.deepEqual(await sync(C2), {});
});
