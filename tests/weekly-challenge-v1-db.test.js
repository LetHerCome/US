// La sfida della settimana (founder, 03/11/2026): one challenge a week per
// couple (Monday to Sunday, Europe/Rome), chosen by the server from «Come vi
// vedete», one change a week. A photo of one of the two closes it (couples
// apart: one photo each, from two places; one alone by Sunday is worth 30).
// 60 points to the couple through the progression events, 100 more every 4
// weeks in a row. The old weekly missions are no longer created. Full repo
// schema in disposable PGlite; the private helpers take the time so the week
// can be moved.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_weekly_challenge_v1\.sql$/.test(f));
const CRON = fs.readdirSync(DIR).find((f) => /_weekly_challenge_job_cron\.sql$/.test(f));

// A Wednesday in the week of Monday 9 November 2026 (Rome is UTC+1).
const WEEK = '2026-11-09';
const WED = '2026-11-11T12:00:00+01:00';

let db;
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const one = async (sql, p = []) => (await q(sql, p))[0];
const mode = (m) => q('update public.couples set distance_mode = $1 where id = $2', [m, h.A]);
const state = (user, when = WED) => one('select private.weekly_challenge_state($1, $2::timestamptz) r', [user, when]).then((r) => r.r);
const addPhoto = (user, challenge, moment, photo = null, when = WED) =>
  one('select private.weekly_challenge_add_photo($1, $2, $3, $4, $5::timestamptz) r', [user, challenge, moment, photo, when]).then((r) => r.r);
const change = (user, challenge, when = WED) => one('select private.weekly_challenge_change($1, $2, $3::timestamptz) r', [user, challenge, when]).then((r) => r.r);
let momentSeq = 0;
async function moment(user, createdAt = WED, couple = h.A) {
  momentSeq += 1;
  const id = h.uid(70000 + momentSeq);
  await q(`insert into public.moments(id, couple_id, created_by, storage_path, thumbnail_path, caption, moment_date, created_at, place_lat, place_lon, place_label, place_source)
    values ($1, $2, $3, $4, $5, 'Sfida', ($6::timestamptz at time zone 'Europe/Rome')::date, $6::timestamptz, 45.07, 7.69, 'Torino', 'photo')`,
  [id, couple, user, `${couple}/${user}/${id}.webp`, `${couple}/${user}/derived-thumbnails/${id}.webp`, createdAt]);
  return id;
}
async function albumPhoto(user, momentId, createdAt = WED) {
  momentSeq += 1;
  const id = h.uid(80000 + momentSeq);
  await q(`insert into public.moment_photos(id, moment_id, couple_id, created_by, storage_path, position, created_at)
    values ($1, $2, $3, $4, $5, 1, $6::timestamptz)`, [id, momentId, h.A, user, `${h.A}/${user}/moment-albums/${momentId}/${id}.webp`, createdAt]);
  return id;
}
const bondXp = () => one('select bond_xp from public.couples where id = $1', [h.A]).then((r) => Number(r.bond_xp));
// Past weeks the couple already did, inserted directly (the streak).
async function pastWeeks(weeks, completed = true) {
  for (const week of weeks) {
    await q(`insert into public.couple_weekly_challenges(couple_id, week_start, template_key, title, short_title, two_places, completed_at, xp_awarded)
      select $1, $2::date, t.key, t.title, t.short_title, t.two_places, case when $3 then $2::date + 3 end, case when $3 then 60 else 0 end
      from public.bond_quest_templates t where t.challenge and not t.two_places order by t.key limit 1`, [h.A, week, completed]);
  }
}

test.beforeEach(async () => { db = await h.database(); momentSeq = 0; });
test.afterEach(async () => { await db?.close(); db = null; });

test('migrations exist and are listed in the cutoff; both tables have RLS and are in Realtime', async () => {
  assert.ok(FILE, 'missing supabase/migrations/*_weekly_challenge_v1.sql');
  assert.ok(CRON, 'missing supabase/migrations/*_weekly_challenge_job_cron.sql');
  const cutoff = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  for (const file of [FILE, CRON]) assert.ok(cutoff.executable_migrations.includes(file) && cutoff.forward_migrations.includes(file), file);
  for (const table of ['couple_weekly_challenges', 'couple_weekly_challenge_photos']) {
    assert.equal((await one(`select relrowsecurity r from pg_class where oid = 'public.${table}'::regclass`)).r, true, table);
    assert.equal((await one("select count(*)::int n from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = $1", [table])).n, 1, table);
  }
});

test('the catalog: curated challenges with short titles in both languages, one pool per way of seeing each other', async () => {
  const rows = await q('select key, mode, active, challenge, two_places, title, title_en, short_title, short_title_en from public.bond_quest_templates where challenge');
  for (const r of rows) {
    assert.ok(r.active, r.key);
    for (const field of ['title', 'title_en', 'short_title', 'short_title_en']) assert.ok(r[field] && r[field].trim().length > 2, `${r.key}.${field}`);
    assert.ok(r.short_title.length <= 40, `${r.key} short title fits the card`);
    if (r.two_places) assert.equal(r.mode, 'far', `${r.key}: two places only for couples apart`);
  }
  const far = rows.filter((r) => r.two_places), near = rows.filter((r) => !r.two_places && ['near', 'any'].includes(r.mode)), any = rows.filter((r) => !r.two_places && r.mode === 'any');
  assert.ok(far.length >= 10, `far pool ${far.length}`);
  assert.ok(near.length >= 16, `near pool ${near.length}`);
  // The hug, the hidden message and the perfect day need to be together: near only since the text review of 14/11.
  assert.ok(any.length >= 7, `any pool ${any.length}`);
  // The founder's example, from the approved board SfidaDistanza.
  const sky = rows.find((r) => r.key === 'far-same-sky');
  assert.ok(sky && sky.two_places && /cielo/.test(sky.title) && sky.short_title === 'Lo stesso cielo');
  // Missions that cannot end in a photo are not challenges.
  for (const key of ['any-appreciate', 'far-song-sync', 'near-walk', 'any-no-phone']) assert.equal(rows.some((r) => r.key === key), false, key);
  await assert.rejects(q("update public.bond_quest_templates set two_places = true where key = 'near-sunset'"), /two_places/);
});

test('one challenge per couple and week, the same for both, created on first read', async () => {
  await mode('near');
  const f = await state(h.F), b = await state(h.B);
  assert.equal(f.id, b.id);
  assert.equal(f.week_start, WEEK);
  assert.equal(f.ends_at.slice(0, 19), '2026-11-15T22:59:59', 'Sunday 23:59:59 in Rome');
  assert.equal(f.points, 60);
  assert.equal(f.partial_points, 30);
  assert.equal(f.changes_left, 1);
  assert.equal(f.two_places, false);
  assert.equal(f.completed_at, null);
  assert.deepEqual(f.photos, []);
  assert.equal(f.streak, 0);
  assert.equal((await one('select count(*)::int n from public.couple_weekly_challenges')).n, 1);
  // Same week, any time until Sunday night, from any phone: still that one.
  assert.equal((await state(h.B, '2026-11-15T23:30:00+01:00')).id, f.id);
  assert.equal((await state(h.F, '2026-11-09T00:05:00+01:00')).id, f.id);
  // Monday after: a new one.
  const next = await state(h.F, '2026-11-16T00:01:00+01:00');
  assert.notEqual(next.id, f.id);
  assert.equal(next.week_start, '2026-11-16');
});

test('«Come vi vedete» picks the pool: near, far (two places) and not answered yet', async () => {
  const pick = async (m) => {
    await q('delete from public.couple_weekly_challenges');
    await mode(m);
    const s = await state(h.F);
    return (await one('select t.mode, t.two_places from public.bond_quest_templates t join public.couple_weekly_challenges c on c.template_key = t.key where c.id = $1', [s.id]));
  };
  for (let i = 0; i < 3; i += 1) {
    const near = await pick('near');
    assert.ok(['near', 'any'].includes(near.mode) && !near.two_places);
    const far = await pick('far');
    assert.equal(far.two_places, true);
    const unknown = await pick(null);
    assert.ok(unknown.mode === 'any' && !unknown.two_places);
  }
  await mode('far');
  await q('delete from public.couple_weekly_challenges');
  assert.equal((await state(h.F)).two_places, true);
});

test('a near couple: the photo of one closes it, 60 points once, through the progression events', async () => {
  await mode('near');
  const s = await state(h.F);
  const m = await moment(h.B);
  // A new Ricordo earns its own points (progression 'moment'): counted from here.
  const before = await bondXp();
  const done = await addPhoto(h.B, s.id, m);
  assert.ok(done.completed_at);
  assert.equal(done.xp_awarded, 60);
  assert.equal(done.streak, 1);
  assert.equal(await bondXp(), before + 60);
  const events = await q("select source_kind, source_key, xp_awarded from public.progression_events where couple_id = $1 and source_kind = 'challenge'", [h.A]);
  assert.deepEqual(events, [{ source_kind: 'challenge', source_key: s.id, xp_awarded: 60 }]);
  // Both phones see it done, with the photo and who took it.
  const seenByF = await state(h.F);
  assert.ok(seenByF.completed_at);
  assert.equal(seenByF.photos.length, 1);
  assert.equal(seenByF.photos[0].mine, false);
  assert.equal(seenByF.photos[0].moment_id, m);
  assert.match(seenByF.photos[0].path, /derived-thumbnails/);
  assert.equal(seenByF.photos[0].place_label, 'Torino');
  // A second photo, by either, changes nothing.
  const extra = await moment(h.F);
  const settled = await bondXp();
  const again = await addPhoto(h.F, s.id, extra);
  assert.equal(again.xp_awarded, 60);
  assert.equal(await bondXp(), settled);
  const activity = await q("select type, payload->>'xp' xp from public.activity where couple_id = $1 and type = 'weekly_challenge_completed'", [h.A]);
  assert.deepEqual(activity, [{ type: 'weekly_challenge_completed', xp: '60' }]);
});

test('a couple apart: one photo each, the second added to the album of the first Ricordo', async () => {
  await mode('far');
  const s = await state(h.F);
  assert.equal(s.two_places, true);
  const m = await moment(h.B);
  const photo = await albumPhoto(h.F, m);
  const second = await moment(h.B);
  const before = await bondXp();
  const first = await addPhoto(h.B, s.id, m);
  assert.equal(first.completed_at, null);
  assert.equal(first.photos.length, 1);
  assert.equal(first.waiting_for, 'partner');
  assert.equal((await state(h.F)).waiting_for, 'me', 'the other one is told: only yours is missing');
  assert.equal(await bondXp(), before);
  // The same person again: still one photo.
  await addPhoto(h.B, s.id, second);
  assert.equal((await state(h.B)).photos.length, 1);
  // F adds their photo to B's Ricordo (its album).
  const done = await addPhoto(h.F, s.id, m, photo);
  assert.ok(done.completed_at);
  assert.equal(done.xp_awarded, 60);
  assert.equal(done.waiting_for, null);
  assert.equal(done.photos.length, 2);
  assert.deepEqual(done.photos.map((p) => p.mine).sort(), [false, true]);
  assert.match(done.photos.find((p) => p.mine).path, /moment-albums/);
  assert.equal(await bondXp(), before + 60);
});

test('only my own photo of this week, of this couple, for this week\'s challenge', async () => {
  await mode('near');
  const s = await state(h.F);
  const bea = await moment(h.B);
  await assert.rejects(addPhoto(h.F, s.id, bea), /challenge_photo_not_own/);
  await assert.rejects(addPhoto(h.F, s.id, bea, await albumPhoto(h.B, bea)), /challenge_photo_not_own/);
  await assert.rejects(addPhoto(h.F, s.id, await moment(h.F, '2026-11-08T23:00:00+01:00')), /challenge_photo_too_old/);
  await assert.rejects(addPhoto(h.F, s.id, h.uid(99999)), /challenge_photo_not_found/);
  await assert.rejects(addPhoto(h.F, h.uid(99998), await moment(h.F)), /challenge_not_found/);
  await assert.rejects(addPhoto(null, s.id, await moment(h.F)), /challenge_auth_required/);
  await assert.rejects(addPhoto(h.U1, s.id, await moment(h.F)), /challenge_auth_required/);
  // Opened on Sunday night, saved on Monday: last week's is closed, the photo stays a Ricordo.
  const late = await moment(h.F, '2026-11-16T00:02:00+01:00');
  await assert.rejects(addPhoto(h.F, s.id, late, null, '2026-11-16T00:02:00+01:00'), /challenge_closed/);
  assert.equal((await one('select count(*)::int n from public.couple_weekly_challenge_photos')).n, 0);
});

test('one change a week, never after a photo, never the same challenge', async () => {
  await mode('near');
  const s = await state(h.F);
  const changed = await change(h.B, s.id);
  assert.equal(changed.id, s.id);
  assert.equal(changed.changes_left, 0);
  assert.notEqual(changed.title, s.title);
  assert.equal((await state(h.F)).title, changed.title, 'the partner sees the new one');
  await assert.rejects(change(h.F, s.id), /challenge_change_used/);

  await q('delete from public.couple_weekly_challenges');
  const fresh = await state(h.F);
  await mode('far');
  const far = await change(h.F, fresh.id);
  assert.equal(far.two_places, true, 'a change follows «Come vi vedete» as it is now');
  await q('update public.couple_weekly_challenges set changes_used = 0');
  await addPhoto(h.F, fresh.id, await moment(h.F));
  await assert.rejects(change(h.F, fresh.id), /challenge_has_photo/);
});

test('apart with one photo by Sunday: closed with 30 points when the new week starts', async () => {
  await mode('far');
  const s = await state(h.F);
  await addPhoto(h.B, s.id, await moment(h.B));
  const before = await bondXp();
  const monday = await state(h.F, '2026-11-16T09:00:00+01:00');
  assert.notEqual(monday.id, s.id);
  const last = await one('select completed_at, xp_awarded from public.couple_weekly_challenges where id = $1', [s.id]);
  assert.equal(last.xp_awarded, 30);
  assert.equal(new Date(last.completed_at).toISOString(), '2026-11-15T22:59:59.000Z');
  assert.equal(await bondXp(), before + 30);
  assert.equal(monday.streak, 1, 'closed with one photo still counts for the weeks in a row');
  // Nothing at all: expired, no points, no penalty.
  await state(h.F, '2026-11-23T09:00:00+01:00');
  assert.equal((await one('select completed_at from public.couple_weekly_challenges where id = $1', [monday.id])).completed_at, null);
  assert.equal(await bondXp(), before + 30);
  assert.equal((await state(h.F, '2026-11-23T09:00:00+01:00')).streak, 0);
});

test('weeks in a row: visible, and 100 more points every 4', async () => {
  await mode('near');
  await pastWeeks(['2026-10-19', '2026-10-26', '2026-11-02']);
  const s = await state(h.F);
  assert.equal(s.streak, 3, 'three weeks in a row before this one');
  assert.equal(s.bonus_every, 4);
  const m = await moment(h.F);
  const before = await bondXp();
  const done = await addPhoto(h.F, s.id, m);
  assert.equal(done.streak, 4);
  assert.equal(done.bonus_xp, 100);
  assert.equal(await bondXp(), before + 160);
  assert.deepEqual((await q("select source_key, xp_awarded from public.progression_events where source_kind = 'challenge' order by xp_awarded")).map((r) => r.xp_awarded), [60, 100]);
  // A gap resets it.
  await q('delete from public.couple_weekly_challenges');
  await pastWeeks(['2026-10-19', '2026-11-02']);
  assert.equal((await state(h.F)).streak, 1);
});

test('deleting the Ricordo takes the photo off an open challenge; a closed one stays closed', async () => {
  await mode('far');
  const s = await state(h.F);
  const m = await moment(h.B);
  await addPhoto(h.B, s.id, m);
  await q('delete from public.moments where id = $1', [m]);
  assert.deepEqual((await state(h.F)).photos, []);
  const m2 = await moment(h.B);
  await addPhoto(h.B, s.id, m2);
  await addPhoto(h.F, s.id, m2, await albumPhoto(h.F, m2));
  await q('delete from public.moments where id = $1', [m2]);
  const after = await state(h.F);
  assert.ok(after.completed_at);
  assert.equal(after.xp_awarded, 60);
});

test('public RPCs: the caller\'s couple only, writes only through them, English for an English reader', async () => {
  await mode('near');
  const mine = await h.as(db, h.F, 'select public.get_weekly_challenge() r');
  assert.ok(mine.id);
  await assert.rejects(h.as(db, h.U1, 'select public.get_weekly_challenge() r'), /challenge_auth_required/);
  await assert.rejects(h.as(db, null, 'select public.get_weekly_challenge() r'), /challenge_auth_required/);
  // Another couple sees nothing of this one.
  await h.create(db, h.U1);
  const theirs = await h.as(db, h.U1, 'select public.get_weekly_challenge() r');
  assert.notEqual(theirs.id, mine.id);
  assert.deepEqual(await h.as(db, h.U1, 'select id from public.couple_weekly_challenges where couple_id = $1', [h.A]), []);
  await assert.rejects(h.as(db, h.U1, 'select public.change_weekly_challenge($1) r', [mine.id]), /challenge_not_found/);
  for (const sql of [
    "insert into public.couple_weekly_challenges(couple_id, week_start, template_key, title, short_title, two_places) values ($1, current_date, 'near-sunset', 'x', 'x', false)",
    'update public.couple_weekly_challenges set completed_at = now() where couple_id = $1',
    'delete from public.couple_weekly_challenges where couple_id = $1',
  ]) await assert.rejects(h.as(db, h.F, sql, [h.A]), /permission denied/);
  await assert.rejects(h.as(db, h.F, 'select private.weekly_challenge_complete($1, 60, now(), null)', [mine.id]), /permission denied/);
  await assert.rejects(h.as(db, h.F, 'select public.weekly_challenge_for_job($1) r', [h.A]), /permission denied/);

  // The add RPC with the real clock.
  const m = await moment(h.F, new Date().toISOString());
  const done = await h.as(db, h.F, 'select public.add_weekly_challenge_photo($1, $2, null) r', [mine.id, m]);
  assert.ok(done.completed_at);

  await q("update public.profiles set locale = 'en' where id = $1", [h.B]);
  const en = await h.as(db, h.B, 'select public.get_weekly_challenge() r');
  const t = await one('select t.title_en, t.short_title_en from public.bond_quest_templates t join public.couple_weekly_challenges c on c.template_key = t.key where c.id = $1', [mine.id]);
  assert.equal(en.title, t.title_en);
  assert.equal(en.short_title, t.short_title_en);
});

test('the weekly job reads each couple through a service-role function', async () => {
  await mode('far');
  const job = (await one('select public.weekly_challenge_for_job($1) r', [h.A])).r;
  assert.ok(job.id && job.title && job.title_en && job.short_title && job.short_title_en);
  assert.equal(job.two_places, true);
  assert.equal(job.completed, false);
  assert.deepEqual(job.posted_by, []);
  const grants = await q("select grantee from information_schema.routine_privileges where routine_schema = 'public' and routine_name in ('weekly_challenge_for_job', 'get_internal_weekly_challenge_cron_key') and privilege_type = 'EXECUTE'");
  assert.deepEqual([...new Set(grants.map((g) => g.grantee))].filter((g) => g !== 'postgres').sort(), ['service_role']);
  const sql = fs.readFileSync(path.join(DIR, CRON), 'utf8');
  assert.match(sql, /us-weekly-challenge-hourly/);
  assert.match(sql, /\/functions\/v1\/weekly-challenge-job/);
  assert.match(sql, /us_weekly_challenge_cron_key/);
  assert.match(sql, /us_project_url not provisioned/);
});

test('the old weekly missions are no longer created; their history stays', async () => {
  const r = await h.as(db, h.F, 'select public.ensure_bond_week() r');
  assert.equal(r.quest_count, 0);
  assert.equal((await one('select count(*)::int n from public.bond_weekly_quests')).n, 0);
  assert.equal((await one("select count(*)::int n from pg_class where relname in ('bond_weekly_quests', 'bond_weekly_state', 'bond_quest_templates')")).n, 3);
});

test('export and account deletion: my challenge photos are exported and go with me', async () => {
  await mode('near');
  const s = await state(h.F);
  const m = await moment(h.F);
  await addPhoto(h.F, s.id, m);
  const exported = (await one('select public.s32_export_user_data($1) r', [h.F])).r;
  assert.equal(exported.created.weekly_challenge_photos.length, 1);
  assert.equal(exported.created.weekly_challenge_photos[0].moment_id, m);
  assert.equal(exported.created.weekly_challenge_photos[0].user_id, undefined, 'ids of people stripped as everywhere');
  assert.equal(exported.created.weekly_challenge_photos[0].challenge, s.short_title);
  const fk = await one(`select confdeltype d from pg_constraint where conrelid = 'public.couple_weekly_challenge_photos'::regclass and confrelid = 'public.profiles'::regclass`);
  assert.equal(fk.d, 'c');
});
