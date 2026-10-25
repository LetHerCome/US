// Compagni V1 (docs/missions/companions-v1.md), on the full repo schema in
// disposable PGlite with two synthetic couples: no companion at the start,
// then Maudit, the owl, the goat and the dragon at Sintonia levels 3, 5, 8
// and 11; unlocks recorded once and never lost; only the caller couple; the
// usual authorization. The companions never grow; no counts in the answer.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const DIR = path.join(__dirname, '../supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_companions_v1\.sql$/.test(f));

let db, C2;
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const get = (user) => h.as(db, user, 'select public.get_companions_v1() r');
const unlocked = async (user) => (await get(user)).companions.filter((c) => c.unlocked).map((c) => c.id);
// The least Sintonia XP for a level (the curve of private.progression_level_info).
const xpFor = (level) => { let floor = 0; for (let n = 1; n < level; n++) floor += 200 + (n - 1) * 150; return floor; };
const setXp = (couple, xp) => q('update public.couples set bond_xp = $2 where id = $1', [couple, xp]);

test.beforeEach(async () => {
  db = await h.database();
  const c = await h.create(db, h.U1, 'Other', '2025-06-01'); C2 = c.couple_id;
  const inv = await h.invite(db, h.U1); await h.accept(db, h.U2, inv.code, 'Other partner');
  await setXp(h.A, 0); await setXp(C2, 0);
});
test.afterEach(async () => { await db?.close(); db = null; });

test('migration exists, is listed in the cutoff, the table is RPC-only and the grants are explicit', async () => {
  assert.ok(FILE, 'missing supabase/migrations/*_companions_v1.sql');
  const sql = fs.readFileSync(path.join(DIR, FILE), 'utf8');
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
  assert.ok(sql.includes('alter table public.couple_companion_unlocks enable row level security;'));
  assert.ok(sql.includes('revoke all on table public.couple_companion_unlocks from public, anon, authenticated, service_role;'));
  assert.ok(sql.includes('revoke all on function public.get_companions_v1() from public, anon, authenticated, service_role;'));
  assert.ok(sql.includes('grant execute on function public.get_companions_v1() to authenticated;'));
  assert.match(sql, /private\.progression_level\(c\.bond_xp\)/, 'the Sintonia level is the only source');
  await assert.rejects(h.as(db, h.F, 'select count(*) r from public.couple_companion_unlocks'), /permission denied/);
});

test('couples that existed when Compagni shipped keep Maudit, dated at their start; later couples start with nobody', async () => {
  // h.A comes from the seed, before the migration: an existing couple.
  const started = (await q('select created_at from public.couples where id = $1', [h.A]))[0].created_at;
  const maudit = (await get(h.F)).companions.find((c) => c.id === 'maudit');
  assert.equal(maudit.unlocked, true, 'kept, below level 3 too');
  assert.equal(new Date(maudit.unlocked_at).toISOString(), new Date(started).toISOString(), 'dated at the couple start, so never announced as new');
  assert.deepEqual(await unlocked(h.F), ['maudit']);
  // C2 is created after the release: nobody.
  assert.deepEqual(await unlocked(h.U1), [], 'a couple created after the release is not kept');
  await db.exec(fs.readFileSync(path.join(DIR, FILE), 'utf8'));
  assert.deepEqual(await unlocked(h.U2), [], 're-applying keeps the same couples');
  assert.equal((await q("select count(*)::int n from public.couple_companion_unlocks where companion_id = 'maudit'"))[0].n, 1);
});

test('the curve the test uses is the server one', async () => {
  for (const level of [2, 3, 5, 8, 11]) {
    assert.equal((await q('select private.progression_level($1) l', [xpFor(level)]))[0].l, level);
    assert.equal((await q('select private.progression_level($1) l', [xpFor(level) - 1]))[0].l, level - 1);
  }
});

test('a new couple has no companion; the answer carries only id, unlocked and unlocked_at', async () => {
  const r = await get(h.U1);
  assert.deepEqual(r.companions.map((c) => c.id), ['maudit', 'owl', 'goat', 'dragon'], 'the order they arrive in');
  assert.deepEqual(await unlocked(h.U1), []);
  for (const c of r.companions) assert.deepEqual(Object.keys(c).sort(), ['id', 'unlocked', 'unlocked_at']);
  await setXp(C2, xpFor(2));
  assert.deepEqual(await unlocked(h.U2), [], 'level 2 is still nobody');
});

test('Maudit at level 3, the owl at 5, the goat at 8, the dragon at 11', async () => {
  for (const [level, expected] of [[3, ['maudit']], [5, ['maudit', 'owl']], [8, ['maudit', 'owl', 'goat']], [11, ['maudit', 'owl', 'goat', 'dragon']]]) {
    await setXp(C2, xpFor(level) - 1);
    assert.deepEqual(await unlocked(h.U1), expected.slice(0, -1), `just under level ${level}`);
    await setXp(C2, xpFor(level));
    assert.deepEqual(await unlocked(h.U2), expected, `level ${level}`);
  }
});

test('a couple that jumps levels gets everything up to its level at once', async () => {
  await setXp(C2, xpFor(9));
  assert.deepEqual(await unlocked(h.U1), ['maudit', 'owl', 'goat']);
  const r = await get(h.U1);
  assert.ok(r.companions.filter((c) => c.unlocked).every((c) => c.unlocked_at), 'each with its date');
});

test('an unlock is recorded once and never lost, and stays with this couple only', async () => {
  await setXp(C2, xpFor(5));
  const first = (await get(h.U1)).companions.find((c) => c.id === 'owl').unlocked_at;
  await setXp(C2, 0);
  const again = (await get(h.U2)).companions.find((c) => c.id === 'owl');
  assert.deepEqual([again.unlocked, again.unlocked_at], [true, first]);
  assert.equal((await q('select count(*)::int n from public.couple_companion_unlocks where couple_id = $1', [C2]))[0].n, 2);
  assert.deepEqual(await unlocked(h.F), ['maudit'], 'the other couple has nothing of ours');
});

test('the unlocks go with the couple', async () => {
  const fk = await q("select pg_catalog.pg_get_constraintdef(c.oid) d from pg_catalog.pg_constraint c where c.conrelid = 'public.couple_companion_unlocks'::regclass and c.contype = 'f'");
  assert.equal(fk.length, 1);
  assert.match(fk[0].d, /REFERENCES couples\(id\) ON DELETE CASCADE/);
});

test('RPC: only for a member of a couple; the private sync is not callable', async () => {
  await assert.rejects(get(null), /authentication required/);
  await assert.rejects(get(h.U3), /couple membership required/);
  await assert.rejects(h.as(db, null, 'select public.get_companions_v1() r', [], 'anon'), /permission denied/);
  await assert.rejects(h.as(db, h.F, 'select private.companion_sync($1) r', [h.A]), /permission denied/);
});
