// Personaggi: il guardaroba (20/11/2026). Runs the REAL migrations against
// embedded Postgres (PGlite): the shape (20261115183900) and the wardrobe.
// Each person dresses only their own character, with unlocked accessories of
// the right place; unlocks come from the couple's own points and moments.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const SHAPE = 'supabase/migrations/20261115183900_personaggi_forma_e_colori.sql';
const LOOK = 'supabase/migrations/20261120232852_personaggi_guardaroba.sql';
const uuid = () => crypto.randomUUID();

const FIXTURE = `
  create role authenticated; create role anon; create role service_role;
  grant usage on schema public to authenticated, anon;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  create schema private;
  create table public.couples (id uuid primary key, bond_xp integer not null default 0, created_at timestamptz not null default now());
  create table public.profiles (id uuid primary key, couple_id uuid references public.couples(id), role text, person_color text, created_at timestamptz not null default now());
  grant select on public.profiles to authenticated;
  create table public.moments (id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id), created_by uuid not null, storage_path text not null, moment_date date not null default current_date, created_at timestamptz not null default now());
`;

async function db() {
  const pg = new PGlite();
  await pg.exec(FIXTURE);
  await pg.exec(read(SHAPE));
  await pg.exec(read(LOOK));
  return pg;
}
async function as(pg, userId, sql, params = []) {
  await pg.exec(`reset role; select set_config('request.jwt.claim.sub', '${userId}', false); set role authenticated;`);
  try { return await pg.query(sql, params); } finally { await pg.exec('reset role;'); }
}
async function seed(pg, { xp = 0, ageDays = 0, moments = 0 } = {}) {
  const c = uuid(), a = uuid(), b = uuid();
  await pg.query(`insert into public.couples (id, bond_xp, created_at) values ($1, $2, now() - ($3 || ' days')::interval)`, [c, xp, String(ageDays)]);
  await pg.query(`insert into public.profiles (id, couple_id, role) values ($1, $2, 'francesco'), ($3, $2, 'beatrice')`, [a, c, b]);
  for (let i = 0; i < moments; i += 1) await pg.query(`insert into public.moments (couple_id, created_by, storage_path) values ($1, $2, $3)`, [c, a, `c/${uuid()}.webp`]);
  return { c, a, b };
}
const look = (pg, id) => pg.query('select character_head as head, character_face as face from public.profiles where id = $1', [id]).then((r) => r.rows[0]);

test('guardaroba: I dress my own character with what my couple unlocked', async () => {
  const pg = await db();
  const { a, b } = await seed(pg, { xp: 450 });
  const r = await as(pg, a, `select public.set_my_character_look('cappello', 'occhiali') as out`);
  assert.deepEqual(r.rows[0].out.unlocked.sort(), ['cappello', 'occhiali']);
  assert.deepEqual(await look(pg, a), { head: 'cappello', face: 'occhiali' });
  assert.deepEqual(await look(pg, b), { head: null, face: null }, 'the partner is untouched');
  // Null takes it off.
  await as(pg, a, `select public.set_my_character_look(null, 'occhiali')`);
  assert.deepEqual(await look(pg, a), { head: null, face: 'occhiali' });
});

test('guardaroba: locked, wrong place and unknown accessories are refused', async () => {
  const pg = await db();
  const { a } = await seed(pg, { xp: 450 });
  await assert.rejects(as(pg, a, `select public.set_my_character_look('corona', null)`), /locked/);
  await assert.rejects(as(pg, a, `select public.set_my_character_look('occhiali', null)`), /invalid head/);
  await assert.rejects(as(pg, a, `select public.set_my_character_look(null, 'cappello')`), /invalid face/);
  await assert.rejects(as(pg, a, `select public.set_my_character_look('mantello', null)`), /invalid head/);
  assert.deepEqual(await look(pg, a), { head: null, face: null });
});

test('guardaroba: real moments unlock the macchinetta, the 100 days and the first year', async () => {
  const pg = await db();
  const young = await seed(pg, { xp: 0, ageDays: 10 });
  assert.deepEqual((await as(pg, young.a, `select public.my_character_unlocks() as u`)).rows[0].u, []);
  const old = await seed(pg, { xp: 3000, ageDays: 400, moments: 1 });
  const u = (await as(pg, old.a, `select public.my_character_unlocks() as u`)).rows[0].u;
  assert.deepEqual([...u].sort(), ['cappello', 'cento', 'corona', 'coroncina', 'cuffie', 'festa', 'fiocco', 'gala', 'macchinetta', 'occhiali', 'sciarpina', 'sole']);
  await as(pg, old.b, `select public.set_my_character_look('festa', 'macchinetta')`);
  assert.deepEqual(await look(pg, old.b), { head: 'festa', face: 'macchinetta' });
});

test('guardaroba: another couple\'s points never unlock mine; no couple, no wardrobe', async () => {
  const pg = await db();
  const rich = await seed(pg, { xp: 5000, moments: 2 });
  const poor = await seed(pg, { xp: 0 });
  await assert.rejects(as(pg, poor.a, `select public.set_my_character_look('corona', null)`), /locked/);
  await assert.rejects(as(pg, poor.a, `select public.set_my_character_look(null, 'macchinetta')`), /locked/);
  const lonely = uuid();
  await pg.query(`insert into public.profiles (id, couple_id, role) values ($1, null, 'francesco')`, [lonely]);
  await assert.rejects(as(pg, lonely, `select public.set_my_character_look(null, null)`), /no couple/);
  assert.equal((await look(pg, rich.a)).head, null);
});

test('guardaroba: only the two public functions are callable, the unlock rule stays private', async () => {
  const pg = await db();
  const { a } = await seed(pg, { xp: 450 });
  await assert.rejects(as(pg, a, `select private.character_unlocks($1::uuid)`, [uuid()]), /permission denied/);
  const sql = read(LOOK);
  assert.match(sql, /grant execute on function public\.set_my_character_look\(text, text\) to authenticated;/);
  assert.match(sql, /revoke all on function private\.character_unlocks\(uuid\) from public, anon, authenticated, service_role;/);
  for (const fn of sql.matchAll(/create or replace function [^\n]+\n[\s\S]*?\$\$;/g)) assert.match(fn[0], /set search_path = ''/);
});
