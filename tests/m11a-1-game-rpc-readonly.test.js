// M11A.1 — read-side game RPCs must run inside a READ ONLY transaction (as
// PostgREST runs STABLE functions) and must not depend on a locking statement.
// Applies M11A then the M11A.1 hotfix in an isolated PGlite database; no
// production rows or functions are touched.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');

const ROOT = path.resolve(__dirname, '..');
const M11A = path.join(ROOT, 'supabase/migrations_history/20260930105724_m11a_game_sessions_custom_questions.sql');
const HOTFIX = path.join(ROOT, 'supabase/migrations_history/20260930121312_m11a_1_game_rpc_readonly_actor.sql');
const id = () => randomUUID();

const FIXTURE = `
  create role authenticated; create role anon;
  grant usage on schema public to authenticated, anon;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  create schema private;
  create table public.couples (id uuid primary key);
  create table public.profiles (
    id uuid primary key, couple_id uuid references public.couples(id), role text,
    unique (couple_id, role)
  );
`;

async function fixture({ hotfix = true } = {}) {
  const db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(fs.readFileSync(M11A, 'utf8'));
  if (hotfix) await db.exec(fs.readFileSync(HOTFIX, 'utf8'));
  const c = id(), f = id(), b = id();
  await db.exec(`insert into public.couples values ('${c}');
    insert into public.profiles values ('${f}','${c}','francesco'),('${b}','${c}','beatrice');`);
  return { db, c, f, b };
}
const as = (db, uid) => db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
const reset = (db) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
const call = async (db, sql, params = []) => (await db.query(sql, params)).rows[0].r;

async function readOnly(db, uid, fn) {
  await as(db, uid);
  await db.exec('begin read only');
  try { return await fn(); } finally { await db.exec('rollback'); await reset(db); }
}

async function seed(db, f) {
  await as(db, f);
  const q = await call(db, `select public.create_couple_question($1::uuid,'Cosa ricordi?','open','[]'::jsonb) r`, [id()]);
  const s = await call(db, `select public.start_custom_game_session($1::uuid,$2::uuid) r`, [q.id, id()]);
  await reset(db);
  return { q, s };
}

test('M11A.1: sanity — the M11A baseline fails read RPCs in a READ ONLY transaction (SQLSTATE 25006)', async () => {
  const { db, f } = await fixture({ hotfix: false });
  await assert.rejects(
    readOnly(db, f, () => call(db, 'select public.list_couple_questions() r')),
    (e) => e.code === '25006' || /read-only transaction/i.test(e.message));
});

test('M11A.1: list/get RPCs work inside a READ ONLY transaction for both partners', async () => {
  const { db, f, b } = await fixture();
  const { q, s } = await seed(db, f);
  for (const uid of [f, b]) {
    const lib = await readOnly(db, uid, () => call(db, 'select public.list_couple_questions() r'));
    assert.equal(lib.length, 1);
    assert.equal(lib[0].id, q.id);
    const list = await readOnly(db, uid, () => call(db, 'select public.list_game_sessions() r'));
    assert.equal(list.length, 1);
    const st = await readOnly(db, uid, () => call(db, 'select public.get_game_session($1::uuid) r', [s.id]));
    assert.equal(st.id, s.id);
  }
});

test('M11A.1: read helper keeps membership/auth validation and reveal privacy in READ ONLY', async () => {
  const { db, f, b } = await fixture();
  const { s } = await seed(db, f);
  await assert.rejects(readOnly(db, '', () => call(db, 'select public.list_couple_questions() r')), /authentication required/);
  const stranger = id();
  await db.exec(`insert into public.profiles values ('${stranger}', null, 'francesco')`);
  await assert.rejects(readOnly(db, stranger, () => call(db, 'select public.list_game_sessions() r')), /couple membership required/);
  const otherC = id(), other = id();
  await db.exec(`insert into public.couples values ('${otherC}'); insert into public.profiles values ('${other}','${otherC}','francesco')`);
  await assert.rejects(readOnly(db, other, () => call(db, 'select public.get_game_session($1::uuid) r', [s.id])), /session unavailable/);
  assert.deepEqual(await readOnly(db, other, () => call(db, 'select public.list_game_sessions() r')), []);
  const st = await readOnly(db, b, () => call(db, 'select public.get_game_session($1::uuid) r', [s.id]));
  assert.equal(st.items[0].partner_answer_text, null);
});

test('M11A.1: mutating RPCs still work (locked helper) and remain rejected in READ ONLY', async () => {
  const { db, f, b } = await fixture();
  const { q, s } = await seed(db, f);
  await as(db, f);
  const item = s.items[0].id;
  await call(db, `select public.save_game_session_answer($1::uuid,$2::uuid,'ciao',null::smallint) r`, [s.id, item]);
  const done = await call(db, 'select public.complete_game_session_side($1::uuid) r', [s.id]);
  assert.equal(done.my_complete, true);
  await reset(db);
  await as(db, b);
  await call(db, `select public.save_game_session_answer($1::uuid,$2::uuid,'anche io',null::smallint) r`, [s.id, item]);
  const both = await call(db, 'select public.complete_game_session_side($1::uuid) r', [s.id]);
  assert.equal(both.reveal_ready, true);
  assert.equal((await call(db, 'select public.mark_game_session_reveal_seen($1::uuid) r', [s.id])).my_reveal_seen_at !== null, true);
  await reset(db);
  await as(db, f);
  assert.equal((await call(db, `select public.update_couple_question($1::uuid,1,'Nuova','open','[]'::jsonb) r`, [q.id])).version, 2);
  await call(db, 'select public.archive_couple_question($1::uuid) r', [q.id]);
  await reset(db);
  // A write RPC inside READ ONLY must still fail: the write guard is not weakened.
  await assert.rejects(readOnly(db, f, () => call(db, `select public.create_couple_question($1::uuid,'X','open','[]'::jsonb) r`, [id()])), /read-only transaction/i);
});

test('M11A.1: migration source — read RPCs use no row lock, mutators use the locked helper', () => {
  const clean = (t) => t.replace(/--[^\n]*/g, '');
  const m11a = clean(fs.readFileSync(M11A, 'utf8'));
  const fix = clean(fs.readFileSync(HOTFIX, 'utf8'));
  const fn = (sql, re) => (sql.match(re) || [''])[0];
  const actor = fn(fix, /create or replace function private\.m11a_actor\(\)[\s\S]*?\n\$\$;/);
  const locked = fn(fix, /create function private\.m11a_actor_locked\(\)[\s\S]*?\n\$\$;/);
  assert.ok(actor && locked);
  assert.doesNotMatch(actor, /\bfor\s+(share|update|no key update|key share)\b/i);
  assert.match(locked, /\bfor share;/i);
  assert.match(locked, /security definer set search_path = ''/);
  assert.match(actor, /security definer set search_path = ''/);
  // Hotfix only recreates the 7 mutators; the 3 readers are untouched and lock-free.
  const changed = [...fix.matchAll(/create or replace function public\.(\w+)/g)].map((m) => m[1]).sort();
  assert.deepEqual(changed, ['archive_couple_question', 'complete_game_session_side', 'create_couple_question',
    'mark_game_session_reveal_seen', 'save_game_session_answer', 'start_custom_game_session', 'update_couple_question']);
  for (const name of changed) {
    const body = fn(fix, new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`));
    assert.match(body, /private\.m11a_actor_locked\(\)/, name);
    assert.doesNotMatch(body, /private\.m11a_actor\(\)/, name);
    // identical to the M11A body except for the helper name
    const orig = fn(m11a, new RegExp(`create function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`))
      .replace('create function', 'create or replace function').replace('m11a_actor()', 'm11a_actor_locked()');
    assert.equal(body, orig, name);
  }
  for (const name of ['list_couple_questions', 'list_game_sessions', 'get_game_session']) {
    assert.doesNotMatch(fix, new RegExp(`function public\\.${name}\\b`));
    const body = fn(m11a, new RegExp(`create function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`));
    assert.match(body, /\bstable\b/);
    assert.doesNotMatch(body, /\bfor\s+(share|update)\b/i);
  }
  assert.doesNotMatch(fix, /\b(drop|truncate|alter table|create table)\b/i);
  assert.doesNotMatch(fix, /\b(quiz_responses|weekly_quiz|bond_xp|daily_questions|send-web-push|net\.http)\b/i);
});

test('M11A.1: grants and hardening are unchanged after the hotfix', async () => {
  const { db } = await fixture();
  const rows = (await db.query(`select n.nspname, p.proname, p.prosecdef, p.proconfig,
      has_function_privilege('authenticated', p.oid, 'execute') auth_x,
      has_function_privilege('anon', p.oid, 'execute') anon_x
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.proname like 'm11a_actor%' or (n.nspname = 'public' and p.proname in (
      'create_couple_question','list_couple_questions','update_couple_question','archive_couple_question',
      'start_custom_game_session','list_game_sessions','get_game_session','save_game_session_answer',
      'complete_game_session_side','mark_game_session_reveal_seen'))`)).rows;
  assert.equal(rows.length, 12);
  for (const r of rows) {
    assert.equal(r.prosecdef, true, r.proname);
    assert.deepEqual(r.proconfig, ['search_path=""'], r.proname);
    assert.equal(r.anon_x, false, r.proname);
    assert.equal(r.auth_x, r.nspname === 'public', r.proname);
  }
});
