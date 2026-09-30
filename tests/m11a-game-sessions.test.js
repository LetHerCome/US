// M11A contract tests execute the candidate migration in an isolated PGlite
// database. No production rows or functions are changed by this suite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = path.join(ROOT, 'supabase/migrations/20260930140000_m11a_game_sessions_custom_questions.sql');
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

async function fixture() {
  const db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(fs.readFileSync(MIGRATION, 'utf8'));
  return db;
}

async function couple(db) {
  const c = id(), f = id(), b = id();
  await db.exec(`insert into public.couples values ('${c}');
    insert into public.profiles values ('${f}','${c}','francesco'),('${b}','${c}','beatrice');`);
  return { c, f, b };
}

async function asUser(db, uid, fn, role = 'authenticated') {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false);`);
  try { return await fn(); }
  finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}

function rpc(db, name, casts, values = []) {
  const args = casts.map((cast, i) => `$${i + 1}::${cast}`).join(', ');
  return db.query(`select public.${name}(${args}) r`, values).then(({ rows }) => rows[0].r);
}
const create = (db, op, text, kind = 'open', options = []) =>
  rpc(db, 'create_couple_question', ['uuid', 'text', 'text', 'jsonb'], [op, text, kind, JSON.stringify(options)]);
const edit = (db, q, version, text, kind = 'open', options = []) =>
  rpc(db, 'update_couple_question', ['uuid', 'integer', 'text', 'text', 'jsonb'], [q, version, text, kind, JSON.stringify(options)]);
const archive = (db, q) => rpc(db, 'archive_couple_question', ['uuid'], [q]);
const library = (db) => rpc(db, 'list_couple_questions', []);
const start = (db, q, op = id()) => rpc(db, 'start_custom_game_session', ['uuid', 'uuid'], [q, op]);
const state = (db, s) => rpc(db, 'get_game_session', ['uuid'], [s]);
const sessions = (db) => rpc(db, 'list_game_sessions', []);
const save = (db, s, item, text = null, index = null) =>
  rpc(db, 'save_game_session_answer', ['uuid', 'uuid', 'text', 'smallint'], [s, item, text, index]);
const complete = (db, s) => rpc(db, 'complete_game_session_side', ['uuid'], [s]);
const seen = (db, s) => rpc(db, 'mark_game_session_reveal_seen', ['uuid'], [s]);
const count = async (db, table) => (await db.query(`select count(*)::int n from public.${table}`)).rows[0].n;

test('M11A: auth and role come only from the current profile; client tables are closed', async () => {
  const db = await fixture(); const { f } = await couple(db);
  await asUser(db, null, async () => {
    await assert.rejects(create(db, id(), 'Una domanda'), /authentication required/);
    await assert.rejects(library(db), /authentication required/);
  });
  await asUser(db, null, async () => {
    await assert.rejects(library(db), /permission denied/);
  }, 'anon');
  const q = await asUser(db, f, () => create(db, id(), 'Una domanda'));
  assert.equal(q.author_role, 'francesco');
  await asUser(db, f, async () => {
    for (const table of ['couple_questions', 'game_sessions', 'game_session_items', 'game_session_sides', 'game_session_answers']) {
      await assert.rejects(db.query(`select * from public.${table}`), /permission denied/);
    }
    await assert.rejects(db.query(`update public.couple_questions set author_role='beatrice' where id='${q.id}'`), /permission denied/);
  });
});

test('M11A: open and choice questions are validated, normalized, and couple-private', async () => {
  const db = await fixture(); const a = await couple(db); const other = await couple(db);
  const open = await asUser(db, a.f, () => create(db, id(), '  Cosa ricordi di Roma?  '));
  const choice = await asUser(db, a.b, () => create(db, id(), ' Cosa rifaresti? ', 'choice', [' Cena ', 'Passeggiata', 'Mattina']));
  assert.equal(open.question_text, 'Cosa ricordi di Roma?');
  assert.equal(open.answer_kind, 'open');
  assert.deepEqual(choice.options, ['Cena', 'Passeggiata', 'Mattina']);
  assert.equal(choice.author_role, 'beatrice');
  assert.deepEqual((await asUser(db, a.f, () => library(db))).map(q => q.id), [choice.id, open.id]);
  assert.deepEqual(await asUser(db, other.f, () => library(db)), []);
  await asUser(db, other.f, async () => {
    await assert.rejects(edit(db, open.id, 1, 'Intrusione'), /question unavailable/);
    await assert.rejects(archive(db, open.id), /question unavailable/);
    await assert.rejects(start(db, open.id), /question unavailable/);
  });
  await asUser(db, a.f, async () => {
    for (const bad of ['', '  ', 'x'.repeat(301)]) await assert.rejects(create(db, id(), bad), /invalid question/);
    for (const options of [[], ['Solo'], ['a', 'b', 'c', 'd', 'e'], ['a', '  '], ['a', 'x'.repeat(121)]]) {
      await assert.rejects(create(db, id(), 'Scelta?', 'choice', options), /invalid options/);
    }
  });
});

test('M11A: create retry and session retry keep one row, even after question edit', async () => {
  const db = await fixture(); const { f } = await couple(db);
  const createOp = id(), sessionOp = id();
  const q = await asUser(db, f, () => create(db, createOp, 'Prima domanda'));
  const again = await asUser(db, f, () => create(db, createOp, 'Prima domanda'));
  assert.equal(again.id, q.id);
  await asUser(db, f, () => assert.rejects(create(db, createOp, 'Diversa'), /request already used/));
  const s = await asUser(db, f, () => start(db, q.id, sessionOp));
  await asUser(db, f, () => edit(db, q.id, 1, 'Domanda nuova'));
  const retried = await asUser(db, f, () => start(db, q.id, sessionOp));
  assert.equal(retried.id, s.id);
  assert.equal(retried.items[0].question_text, 'Prima domanda');
  assert.equal(await count(db, 'game_sessions'), 1);
  await asUser(db, f, () => assert.rejects(start(db, id(), sessionOp), /request already used/));
});

test('M11A: reciprocal open answer is hidden until both complete; side and reveal receipt are personal', async () => {
  const db = await fixture(); const { f, b } = await couple(db);
  const q = await asUser(db, f, () => create(db, id(), 'Cosa pensavi quella sera a Roma?'));
  const started = await asUser(db, f, () => start(db, q.id));
  const item = started.items[0].id;
  assert.equal(started.started_by_role, 'francesco');
  assert.equal(started.content_source, 'couple_custom');
  assert.equal((await asUser(db, b, () => sessions(db)))[0].id, started.id);
  await asUser(db, f, () => save(db, started.id, item, 'Segreto F'));
  await asUser(db, f, () => save(db, started.id, item, 'Pensavo a noi'));
  const waiting = await asUser(db, f, () => complete(db, started.id));
  assert.equal(waiting.my_complete, true);
  assert.equal(waiting.partner_complete, false);
  assert.equal(waiting.reveal_ready, false);
  assert.equal(waiting.items[0].my_answer_text, 'Pensavo a noi');
  assert.equal(waiting.items[0].partner_answer_text, null);
  const partnerBefore = await asUser(db, b, () => state(db, started.id));
  assert.equal(partnerBefore.partner_complete, true);
  assert.equal(JSON.stringify(partnerBefore).includes('Pensavo a noi'), false);
  await asUser(db, f, async () => {
    await assert.rejects(save(db, started.id, item, 'Riscrivo'), /answer locked/);
    await assert.rejects(seen(db, started.id), /reveal not ready/);
  });
  await asUser(db, b, () => save(db, started.id, item, 'Pensavo la stessa cosa'));
  const revealed = await asUser(db, b, () => complete(db, started.id));
  assert.equal(revealed.reveal_ready, true);
  assert.ok(revealed.completed_at);
  assert.equal(revealed.items[0].partner_answer_text, 'Pensavo a noi');
  const fSeen = await asUser(db, f, () => seen(db, started.id));
  assert.ok(fSeen.my_reveal_seen_at);
  assert.equal((await asUser(db, b, () => state(db, started.id))).my_reveal_seen_at, null);
  assert.equal((await asUser(db, f, () => seen(db, started.id))).my_reveal_seen_at, fSeen.my_reveal_seen_at);
  assert.equal((await asUser(db, b, () => seen(db, started.id))).reveal_ready, true);
  assert.equal((await asUser(db, f, () => complete(db, started.id))).completed_at, revealed.completed_at);
  assert.equal(await count(db, 'game_session_answers'), 2);
});

test('M11A: choice state reveals actual selections only after completion, without score or XP', async () => {
  const db = await fixture(); const { f, b } = await couple(db);
  const q = await asUser(db, b, () => create(db, id(), 'Quale rifaresti?', 'choice', ['Cena', 'Passeggiata']));
  for (const [fAnswer, bAnswer, same] of [[0, 0, true], [0, 1, false]]) {
    const s = await asUser(db, b, () => start(db, q.id)); const item = s.items[0].id;
    await asUser(db, f, () => save(db, s.id, item, null, fAnswer));
    await asUser(db, f, () => complete(db, s.id));
    const before = await asUser(db, b, () => state(db, s.id));
    assert.equal(before.items[0].partner_answer_index, null);
    assert.equal(JSON.stringify(before).includes('score'), false);
    await asUser(db, b, () => save(db, s.id, item, null, bAnswer));
    const after = await asUser(db, b, () => complete(db, s.id));
    assert.equal(after.items[0].partner_answer_index, fAnswer);
    assert.equal(after.items[0].my_answer_index === after.items[0].partner_answer_index, same);
    assert.equal(JSON.stringify(after).includes('xp_awarded'), false);
  }
  await asUser(db, b, async () => {
    const s = await start(db, q.id); const item = s.items[0].id;
    for (const index of [-1, 2]) await assert.rejects(save(db, s.id, item, null, index), /invalid answer/);
    await assert.rejects(complete(db, s.id), /answer required/);
  });
});

test('M11A: author can edit and archive after play; snapshots and answers never change', async () => {
  const db = await fixture(); const { f, b } = await couple(db);
  const q = await asUser(db, f, () => create(db, id(), 'Quale giorno rivivresti?', 'choice', ['Roma', 'Casa']));
  const s = await asUser(db, f, () => start(db, q.id)); const item = s.items[0].id;
  await asUser(db, f, () => save(db, s.id, item, null, 0));
  await asUser(db, f, () => complete(db, s.id));
  await asUser(db, b, () => save(db, s.id, item, null, 1));
  await asUser(db, b, () => complete(db, s.id));
  await asUser(db, b, () => assert.rejects(edit(db, q.id, 1, 'Non mia'), /author only/));
  const revised = await asUser(db, f, () => edit(db, q.id, 1, 'Quale viaggio rivivresti?', 'choice', ['Parigi', 'Londra']));
  assert.equal(revised.version, 2);
  await asUser(db, f, () => assert.rejects(edit(db, q.id, 1, 'Stale'), /version conflict/));
  await asUser(db, f, () => archive(db, q.id));
  await asUser(db, f, () => archive(db, q.id));
  assert.deepEqual(await asUser(db, b, () => library(db)), []);
  await asUser(db, f, () => assert.rejects(start(db, q.id), /question unavailable/));
  const history = await asUser(db, b, () => state(db, s.id));
  assert.equal(history.items[0].question_text, 'Quale giorno rivivresti?');
  assert.deepEqual(history.items[0].options, ['Roma', 'Casa']);
  assert.equal(history.items[0].source_version, 1);
  assert.equal(history.items[0].my_answer_index, 1);
});

test('M11A: other couples cannot inspect or mutate a session, and re-pair preserves role-owned state', async () => {
  const db = await fixture(); const a = await couple(db); const other = await couple(db);
  const q = await asUser(db, a.f, () => create(db, id(), 'Domanda nostra'));
  const s = await asUser(db, a.f, () => start(db, q.id)); const item = s.items[0].id;
  await asUser(db, a.f, () => save(db, s.id, item, 'Mia'));
  await asUser(db, a.f, () => complete(db, s.id));
  await asUser(db, other.f, async () => {
    await assert.rejects(state(db, s.id), /session unavailable/);
    await assert.rejects(save(db, s.id, item, 'Intrusione'), /session unavailable/);
    await assert.rejects(complete(db, s.id), /session unavailable/);
    await assert.rejects(seen(db, s.id), /session unavailable/);
    assert.deepEqual(await sessions(db), []);
  });
  const replacement = id();
  await db.exec(`delete from public.profiles where id='${a.f}';
    insert into public.profiles values ('${replacement}','${a.c}','francesco');`);
  const after = await asUser(db, replacement, () => state(db, s.id));
  assert.equal(after.my_complete, true);
  assert.equal(after.items[0].my_answer_text, 'Mia');
  assert.equal((await asUser(db, replacement, () => library(db)))[0].author_role, 'francesco');
});

test('M11A: partner draft is private, open answers have hard limits, and every item is required', async () => {
  const db = await fixture(); const { f, b } = await couple(db);
  const q = await asUser(db, f, () => create(db, id(), 'Prima domanda'));
  const s = await asUser(db, f, () => start(db, q.id));
  const first = s.items[0].id;
  const second = id();
  // A future family will add all of its items during creation. This fixture
  // supplies a second immutable item to prove the generic completion contract.
  await db.exec(`insert into public.game_session_items(id, session_id, position, question_text, answer_kind, options)
    values ('${second}', '${s.id}', 2, 'Seconda domanda', 'open', '[]');`);
  await asUser(db, f, async () => {
    await assert.rejects(save(db, s.id, first, ' '), /invalid answer/);
    await assert.rejects(save(db, s.id, first, 'x'.repeat(1001)), /invalid answer/);
    await assert.rejects(save(db, s.id, first, 'Mia', 0), /invalid answer/);
    await save(db, s.id, first, 'Mia');
    await assert.rejects(complete(db, s.id), /answer required/);
    await save(db, s.id, second, 'Seconda mia');
    await complete(db, s.id);
  });
  await asUser(db, b, () => save(db, s.id, first, 'Bozza segreta'));
  const fBefore = await asUser(db, f, () => state(db, s.id));
  assert.equal(fBefore.partner_complete, false);
  assert.equal(JSON.stringify(fBefore).includes('Bozza segreta'), false);
  await asUser(db, b, () => save(db, s.id, second, 'Seconda sua'));
  await asUser(db, b, () => complete(db, s.id));
  const fAfter = await asUser(db, f, () => state(db, s.id));
  assert.equal(fAfter.items.length, 2);
  assert.equal(fAfter.items[0].partner_answer_text, 'Bozza segreta');
});

test('M11A: re-pair keeps a personal reveal receipt and author permissions', async () => {
  const db = await fixture(); const { c, f, b } = await couple(db);
  const q = await asUser(db, f, () => create(db, id(), 'Prima di re-pair'));
  const s = await asUser(db, f, () => start(db, q.id)); const item = s.items[0].id;
  await asUser(db, f, () => save(db, s.id, item, 'F'));
  await asUser(db, f, () => complete(db, s.id));
  await asUser(db, b, () => save(db, s.id, item, 'B'));
  await asUser(db, b, () => complete(db, s.id));
  await asUser(db, f, () => seen(db, s.id));
  const replacement = id();
  await db.exec(`delete from public.profiles where id='${f}'; insert into public.profiles values ('${replacement}','${c}','francesco');`);
  const after = await asUser(db, replacement, () => state(db, s.id));
  assert.ok(after.my_reveal_seen_at);
  assert.equal(after.items[0].my_answer_text, 'F');
  assert.equal((await asUser(db, replacement, () => edit(db, q.id, 1, 'Dopo re-pair'))).version, 2);
  assert.equal((await asUser(db, b, () => state(db, s.id))).my_reveal_seen_at, null);
});

test('M11A: migration stays additive and no AI, weekly quiz, push or XP authority is replaced', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
  assert.doesNotMatch(sql, /\b(drop|truncate)\b/i);
  assert.doesNotMatch(sql, /create or replace function public\.(get_quiz_state|save_quiz_answer|get_weekly_quiz_sets|get_weekly_game_sets|claim_us_role)/i);
  assert.doesNotMatch(sql, /\b(quiz_responses|weekly_quiz_rewards|bond_xp|send-web-push|net\.http)\b/i);
  assert.doesNotMatch(sql, /\b(openai|anthropic|generate_question|llm)\b/i);
});

test('M11A: public RPC signatures cannot accept a client couple, role or UID', async () => {
  const db = await fixture();
  const rows = (await db.query(`select p.proname, pg_get_function_arguments(p.oid) args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'create_couple_question', 'list_couple_questions', 'update_couple_question',
      'archive_couple_question', 'start_custom_game_session', 'list_game_sessions',
      'get_game_session', 'save_game_session_answer', 'complete_game_session_side',
      'mark_game_session_reveal_seen')`)).rows;
  assert.equal(rows.length, 10);
  for (const row of rows) assert.doesNotMatch(row.args, /couple_id|actor_role|user_id|author_role/i, row.proname);
  const tables = (await db.query(`select relname, relrowsecurity, relforcerowsecurity
    from pg_class where relname in ('couple_questions','game_sessions','game_session_items','game_session_sides','game_session_answers')`)).rows;
  assert.equal(tables.length, 5);
  assert.ok(tables.every(table => table.relrowsecurity && table.relforcerowsecurity));
});
