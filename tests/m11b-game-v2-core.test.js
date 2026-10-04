// M11B — Game V2 core domain against the real migrations in an isolated
// PGlite database: rounds, prediction, weekly question, sealed questions,
// Per voi basic selector, reveal privacy, re-pair survival, READ ONLY RPCs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/game-v2-db');

const { createDb, couple, setClock, as, readOnly, rpc, id, playSide, startRound, createWeekly } = h;
const M11B = path.join(h.ROOT, 'supabase/migrations_history/20260930153745_m11b_game_v2_core.sql');
const WED = '2026-09-30T10:00:00Z'; // week of Monday 2026-09-28 -> francesco

async function world(clock = WED) {
  const db = await createDb();
  const p = await couple(db);
  await setClock(db, clock);
  return { db, ...p };
}
const get = (db, uid, sid) => as(db, uid, () => rpc(db, 'select public.get_game_session($1::uuid) r', [sid]));
const code = (e) => e.code;

test('M11B security: unauthenticated, outsiders and direct table access are rejected', async () => {
  const { db, f } = await world();
  await assert.rejects(as(db, '', () => rpc(db, 'select public.get_game_v2_home() r')), /authentication required/);
  const stranger = id();
  await db.exec(`insert into public.profiles(id, couple_id, role) values ('${stranger}', null, 'francesco')`);
  await assert.rejects(startRound(db, stranger, 'per_voi'), /couple membership required/);
  for (const table of ['game_v2_catalog', 'game_v2_cooldowns', 'couple_questions', 'game_sessions', 'game_session_items', 'game_session_answers', 'game_session_sides']) {
    await assert.rejects(as(db, f, () => db.query(`select * from public.${table}`)), /permission denied/, table);
  }
  await assert.rejects(as(db, f, () => db.query(`insert into public.game_session_answers(item_id, actor_role, answer_index) values ('${id()}','francesco',0)`)), /permission denied/);
  // Unrestricted creation and single-question sessions are no longer public.
  await assert.rejects(as(db, f, () => rpc(db, `select public.create_couple_question($1::uuid,'X?','open','[]'::jsonb) r`, [id()])), /permission denied/);
  await assert.rejects(as(db, f, () => rpc(db, 'select public.start_custom_game_session($1::uuid,$2::uuid) r', [id(), id()])), /permission denied/);
  await assert.rejects(startRound(db, f, 'arcade'), /invalid family/);
});

test('M11B security: another couple cannot read, answer or finalize a round', async () => {
  const { db, f } = await world();
  const other = await couple(db);
  const s = await startRound(db, f, 'scopritevi');
  await assert.rejects(get(db, other.f, s.id), /session unavailable/);
  await assert.rejects(as(db, other.b, () => rpc(db, `select public.save_game_session_answer($1::uuid,$2::uuid,'x',null::smallint) r`, [s.id, s.items[0].id])), /session unavailable/);
  await assert.rejects(as(db, other.b, () => rpc(db, 'select public.complete_game_session_side($1::uuid) r', [s.id])), /session unavailable/);
  const home = await as(db, other.f, () => rpc(db, 'select public.get_game_v2_home() r'));
  assert.deepEqual(home.open_rounds, []);
});

test('M11B round: five immutable items, private answers until both complete, personal receipts', async () => {
  const { db, f, b } = await world();
  const s = await startRound(db, f, 'confrontatevi');
  assert.equal(s.items.length, 5);
  assert.equal(s.engine_version, 2);
  assert.ok(s.items.every((i) => i.family === 'confrontatevi' && i.mechanic === 'reciprocal'));
  const fromB = await get(db, b, s.id);
  assert.deepEqual(fromB.items.map((i) => i.id), s.items.map((i) => i.id), 'same snapshot for both partners');

  await playSide(db, f, s.id);
  const waiting = await get(db, b, s.id);
  assert.equal(waiting.partner_complete, true);
  assert.equal(waiting.reveal_ready, false);
  assert.ok(waiting.items.every((i) => i.partner_answer_text === null && i.partner_answer_index === null), 'no partner answer before reveal');
  const myView = await get(db, f, s.id);
  assert.ok(myView.items.every((i) => i.my_answer_text !== null || i.my_answer_index !== null));
  // Locked side: a different answer after finalizing is refused.
  const open = s.items.find((i) => i.answer_kind === 'open') || s.items[0];
  await assert.rejects(as(db, f, () => rpc(db, 'select public.save_game_session_answer($1::uuid,$2::uuid,$3::text,$4::smallint) r',
    [s.id, open.id, open.answer_kind === 'open' ? 'altro' : null, open.answer_kind === 'open' ? null : 1])), /answer locked/);

  const done = await playSide(db, b, s.id, () => 1);
  assert.equal(done.reveal_ready, true);
  assert.ok(done.items.some((i) => i.partner_answer_text !== null || i.partner_answer_index !== null));
  const seen = await as(db, b, () => rpc(db, 'select public.mark_game_session_reveal_seen($1::uuid) r', [s.id]));
  assert.ok(seen.my_reveal_seen_at);
  assert.equal((await get(db, f, s.id)).my_reveal_seen_at, null, 'receipts are personal');
  // Duplicate finalize keeps the original timestamps.
  const again = await as(db, b, () => rpc(db, 'select public.complete_game_session_side($1::uuid) r', [s.id]));
  assert.equal(again.completed_at, done.completed_at);

  await assert.rejects(db.query(`update public.game_session_items set question_text = 'x' where session_id = '${s.id}'`), /immutable/);
});

test('M11B round: request retries and concurrent taps resume the single open round per mode', async () => {
  const { db, f, b } = await world();
  const rid = id();
  const first = await startRound(db, f, 'per_voi', rid);
  const retry = await startRound(db, f, 'per_voi', rid);
  assert.equal(retry.id, first.id);
  assert.equal(retry.resumed, true);
  const partnerTap = await startRound(db, b, 'per_voi');
  assert.equal(partnerTap.id, first.id, 'partner tapping Per voi opens the same round');
  await assert.rejects(startRound(db, f, 'ridete', rid), /request already used/);
  const other = await startRound(db, f, 'ridete');
  assert.notEqual(other.id, first.id, 'another mode is a different round');
  const count = (await db.query(`select count(*)::int n from public.game_sessions where engine_version = 2`)).rows[0].n;
  assert.equal(count, 2);
});

test('M11B prediction: subject answers about self, predictor guesses, match only at reveal', async () => {
  const { db, f, b } = await world();
  const s = await startRound(db, b, 'quanto_mi_conosci');
  assert.equal(s.items.length, 5);
  assert.ok(s.items.every((i) => i.mechanic === 'prediction' && i.answer_kind === 'choice'));
  const subjects = s.items.map((i) => i.subject_role);
  const heavy = s.subject_heavy_role;
  assert.equal(subjects.filter((r) => r === heavy).length, 3, 'deterministic 3/2 split');
  assert.equal(subjects.filter((r) => r !== heavy).length, 2);

  const fView = await get(db, f, s.id);
  for (const item of fView.items) {
    if (item.subject_role === 'francesco') {
      assert.equal(item.my_item_role, 'subject');
      assert.equal(item.my_prompt, item.question_text);
    } else {
      assert.equal(item.my_item_role, 'predictor');
      assert.equal(item.my_prompt, item.predict_text);
      assert.match(item.predict_text, /Bea/);
      assert.doesNotMatch(item.predict_text, /\{subject\}/);
    }
  }
  // Bea (subject on some items) answers first; Francesco must not see her self answers.
  await playSide(db, b, s.id, () => 1);
  const before = await get(db, f, s.id);
  assert.ok(before.items.every((i) => i.partner_answer_index === null && i.prediction_matched === null));
  // Francesco predicts index 1 on the first two items and 0 on the rest.
  const done = await playSide(db, f, s.id, (item) => (item.position <= 2 ? 1 : 0));
  for (const item of done.items) {
    assert.equal(item.partner_answer_index, 1);
    assert.equal(item.prediction_matched, item.position <= 2);
  }
  // The next prediction round hands the heavier subject role to the other partner.
  const next = await startRound(db, f, 'quanto_mi_conosci');
  assert.notEqual(next.subject_heavy_role, heavy);
  assert.equal(next.items.filter((i) => i.subject_role === next.subject_heavy_role).length, 3);
});

test('M11B weekly: assigned role, once per week, idempotent retry, no client bypass', async () => {
  const { db, f, b } = await world();
  const bState = await as(db, b, () => rpc(db, 'select public.get_weekly_question_state() r'));
  assert.equal(bState.assigned_role, 'francesco');
  assert.equal(bState.my_turn, false);
  assert.equal(bState.next_unlock, '2026-10-05');
  await assert.rejects(createWeekly(db, b), (e) => code(e) === '42501' && /not your turn/.test(e.message));
  const rid = id();
  const created = await createWeekly(db, f, { requestId: rid, kind: 'choice', options: ['Il mare', 'La città'], families: ['quanto_mi_conosci', 'confrontatevi'] });
  assert.equal(created.created_by_me, true);
  assert.equal(created.replayed, false);
  assert.deepEqual(created.my_question.families, ['confrontatevi', 'quanto_mi_conosci']);
  const replay = await createWeekly(db, f, { requestId: rid, kind: 'choice', options: ['Il mare', 'La città'], families: ['confrontatevi', 'quanto_mi_conosci'] });
  assert.equal(replay.replayed, true);
  assert.equal(replay.question_id, created.question_id);
  await assert.rejects(createWeekly(db, f), /weekly question already created/);
  await assert.rejects(createWeekly(db, f, { requestId: rid, text: 'Altro testo?' }), /request already used/);
  await assert.rejects(createWeekly(db, f, { kind: 'open', families: ['quanto_mi_conosci'] }), /prediction needs choices/);
  await assert.rejects(createWeekly(db, f, { families: ['arcade'] }), /invalid families/);
  // Even a server-side insert that skips the RPC cannot break the contract.
  await assert.rejects(db.query(`insert into public.couple_questions(couple_id, author_role, create_request_id, question_text, answer_kind, origin, week_start, families)
    select couple_id, 'beatrice', gen_random_uuid(), 'X?', 'open', 'weekly', '2026-09-28', '{scopritevi}' from public.profiles where id = '${b}'`), /violates check constraint/);
  const n = (await db.query(`select count(*)::int n from public.couple_questions where origin = 'weekly'`)).rows[0].n;
  assert.equal(n, 1);
});

test('M11B weekly: Monday 00:00 Europe/Rome boundary, DST, alternation and missed weeks', async () => {
  const { db, f, b } = await world();
  const at = async (iso) => { await setClock(db, iso); return as(db, f, () => rpc(db, 'select public.get_weekly_question_state() r')); };
  // Sunday 23:59:59 Rome (CEST, UTC+2) is still Francesco's week.
  assert.equal((await at('2026-10-04T21:59:59Z')).assigned_role, 'francesco');
  const monday = await at('2026-10-04T22:00:00Z');
  assert.equal(monday.week_start, '2026-10-05');
  assert.equal(monday.assigned_role, 'beatrice', 'missed week does not roll over');
  assert.equal(monday.next_unlock, '2026-10-12');
  // Autumn DST: Monday 2026-10-26 00:00 Rome is 2026-10-25T23:00Z (CET, UTC+1).
  assert.equal((await at('2026-10-25T22:59:59Z')).week_start, '2026-10-19');
  const afterDst = await at('2026-10-25T23:00:00Z');
  assert.equal(afterDst.week_start, '2026-10-26');
  assert.equal(afterDst.assigned_role, 'francesco');
  // Spring DST: Monday 2027-03-29 00:00 Rome is 2027-03-28T22:00Z.
  assert.equal((await at('2027-03-28T21:59:59Z')).week_start, '2027-03-22');
  assert.equal((await at('2027-03-28T22:00:00Z')).week_start, '2027-03-29');
  const roles = [];
  for (let w = 0; w < 6; w += 1) roles.push((await at(new Date(Date.parse('2026-09-30T10:00:00Z') + w * 7 * 864e5).toISOString())).assigned_role);
  assert.deepEqual(roles, ['francesco', 'beatrice', 'francesco', 'beatrice', 'francesco', 'beatrice']);
  // Beatrice can create in her week; the retry of Francesco's old request after
  // the boundary is not a second creation.
  await setClock(db, '2026-09-30T10:00:00Z');
  const rid = id();
  await createWeekly(db, f, { requestId: rid });
  await setClock(db, '2026-10-05T08:00:00Z');
  const replay = await createWeekly(db, f, { requestId: rid });
  assert.equal(replay.replayed, true);
  assert.equal(replay.week_start, '2026-10-05');
  const mine = await createWeekly(db, b, { text: 'Cosa ti ha sorpreso di me questo mese?' });
  assert.equal(mine.created_by_me, true);
  assert.equal((await db.query(`select count(*)::int n from public.couple_questions where origin = 'weekly'`)).rows[0].n, 2);
});

test('M11B sealed weekly question: partner knows it exists, never its text, until it is played', async () => {
  const { db, f, b } = await world();
  const secret = 'Qual è la cosa che non ti ho mai detto grazie abbastanza?';
  await createWeekly(db, f, { text: secret });
  const bWeekly = await as(db, b, () => rpc(db, 'select public.get_weekly_question_state() r'));
  assert.equal(bWeekly.partner_left_question, true);
  assert.equal(bWeekly.my_question, null);
  const bHome = await as(db, b, () => rpc(db, 'select public.get_game_v2_home() r'));
  const bLib = await as(db, b, () => rpc(db, 'select public.list_couple_questions() r'));
  const bSessions = await as(db, b, () => rpc(db, 'select public.list_game_sessions() r'));
  for (const payload of [bWeekly, bHome, bLib, bSessions]) assert.doesNotMatch(JSON.stringify(payload), /non ti ho mai detto/);
  assert.equal(bLib[0].sealed, true);
  const fLib = await as(db, f, () => rpc(db, 'select public.list_couple_questions() r'));
  assert.equal(fLib[0].question_text, secret, 'the author always knows the question');
  // Per voi prefers the unplayed couple question; once in a round it is unsealed.
  const s = await startRound(db, b, 'per_voi');
  const item = s.items.find((i) => i.source_type === 'couple_custom');
  assert.ok(item, 'Per voi uses the eligible couple question');
  assert.equal(item.question_text, secret);
  const after = await as(db, b, () => rpc(db, 'select public.list_couple_questions() r'));
  assert.equal(after[0].sealed, false);
  assert.equal(after[0].question_text, secret);
});

test('M11B history: editing or archiving a played question never rewrites the round', async () => {
  const { db, f, b } = await world();
  const created = await createWeekly(db, f, { text: 'Qual è la canzone che ti fa pensare a noi?' });
  const s = await startRound(db, f, 'per_voi');
  const item = s.items.find((i) => i.source_type === 'couple_custom');
  await as(db, f, () => rpc(db, `select public.update_couple_question($1::uuid, 1, 'Testo cambiato dopo?', 'open', '[]'::jsonb) r`, [created.question_id]));
  await as(db, f, () => rpc(db, 'select public.archive_couple_question($1::uuid) r', [created.question_id]));
  const again = await get(db, b, s.id);
  assert.equal(again.items.find((i) => i.id === item.id).question_text, 'Qual è la canzone che ti fa pensare a noi?');
  // Archived questions leave the pool.
  await playSide(db, f, s.id); await playSide(db, b, s.id);
  // M11F: one Per voi per week, so the next one is next week's.
  await setClock(db, new Date(Date.parse(WED) + 7 * 864e5).toISOString());
  const next = await startRound(db, f, 'per_voi');
  assert.ok(!next.items.some((i) => i.source_question_id === created.question_id));
});

test('M11B re-pair: a new profile UID with the same role keeps rounds, answers, receipts and weekly history', async () => {
  const { db, c, f, b } = await world();
  await createWeekly(db, f);
  const s = await startRound(db, f, 'quanto_mi_conosci');
  await playSide(db, f, s.id);
  // claim_us_role replaces the profile row for the same stable role.
  const f2 = id();
  await db.exec(`delete from public.profiles where id = '${f}'; insert into public.profiles(id, couple_id, role) values ('${f2}', '${c}', 'francesco');`);
  const state = await get(db, f2, s.id);
  assert.equal(state.my_complete, true);
  assert.ok(state.items.every((i) => i.my_answer_index !== null));
  const weekly = await as(db, f2, () => rpc(db, 'select public.get_weekly_question_state() r'));
  assert.equal(weekly.created_by_me, true);
  await playSide(db, b, s.id);
  const seen = await as(db, f2, () => rpc(db, 'select public.mark_game_session_reveal_seen($1::uuid) r', [s.id]));
  assert.ok(seen.items.every((i) => typeof i.prediction_matched === 'boolean'));
});

test('M11B Per voi: always a valid round from curated fallback, diverse, cooled down, never archived content', async () => {
  const { db, f, b } = await world();
  const seen = new Set();
  // M11F: one Per voi per week, so consecutive Per voi rounds are a week apart.
  for (let round = 0; round < 3; round += 1) {
    await setClock(db, new Date(Date.parse(WED) + round * 7 * 864e5).toISOString());
    const s = await startRound(db, round % 2 ? b : f, 'per_voi');
    assert.equal(s.items.length, 5);
    const families = s.items.map((i) => i.family);
    assert.ok(new Set(families).size >= 3, 'Per voi mixes modes');
    assert.ok(Math.max(...Object.values(families.reduce((m, x) => ({ ...m, [x]: (m[x] || 0) + 1 }), {}))) <= 2);
    assert.ok(s.items.some((i) => i.mechanic === 'prediction'), 'prediction appears when eligible');
    assert.ok(s.items[0].depth <= s.items[4].depth, 'lighter opening, strongest later');
    for (const i of s.items) { assert.ok(!seen.has(i.question_text), 'no exact repetition within cooldown'); seen.add(i.question_text); }
    await playSide(db, f, s.id); await playSide(db, b, s.id);
  }
  // Exhaust a single mode: it keeps producing valid rounds (cooldowns relax LRU).
  for (let round = 0; round < 4; round += 1) {
    await setClock(db, new Date(Date.parse(WED) + (3 + round) * 7 * 864e5).toISOString());
    const s = await startRound(db, f, 'rivivete');
    assert.equal(s.items.length, 5);
    await playSide(db, f, s.id); await playSide(db, b, s.id);
  }
});

test('M11B home: restrained Per voi state for each partner', async () => {
  const { db, f, b } = await world();
  const state = async (uid) => (await as(db, uid, () => rpc(db, 'select public.get_game_v2_home() r'))).per_voi.state;
  assert.equal(await state(f), 'idle');
  const s = await startRound(db, f, 'per_voi');
  assert.equal(await state(f), 'in_progress');
  assert.equal(await state(b), 'pending', 'partner started');
  await playSide(db, f, s.id);
  assert.equal(await state(f), 'waiting');
  assert.equal(await state(b), 'pending');
  await playSide(db, b, s.id);
  assert.equal(await state(f), 'reveal_ready');
  await as(db, f, () => rpc(db, 'select public.mark_game_session_reveal_seen($1::uuid) r', [s.id]));
  assert.equal(await state(f), 'played', 'M11F: this week\'s Per voi is played until Monday');
  assert.equal(await state(b), 'reveal_ready');
  const home = await as(db, f, () => rpc(db, 'select public.get_game_v2_home() r'));
  assert.equal(home.recent.length, 1);
  assert.doesNotMatch(JSON.stringify(home), /answer_text|answer_index|score|percent/);
});

test('M11B READ ONLY: every read RPC runs inside BEGIN READ ONLY (PostgREST STABLE path)', async () => {
  const { db, f, b } = await world();
  await createWeekly(db, f);
  const s = await startRound(db, f, 'per_voi');
  for (const uid of [f, b]) {
    await readOnly(db, uid, () => rpc(db, 'select public.get_game_v2_home() r'));
    await readOnly(db, uid, () => rpc(db, 'select public.get_weekly_question_state() r'));
    await readOnly(db, uid, () => rpc(db, 'select public.list_couple_questions() r'));
    await readOnly(db, uid, () => rpc(db, 'select public.list_game_sessions() r'));
    await readOnly(db, uid, () => rpc(db, 'select public.get_game_session($1::uuid) r', [s.id]));
  }
  await assert.rejects(readOnly(db, f, () => rpc(db, `select public.start_game_round('ridete', $1::uuid) r`, [id()])), /read-only transaction/);
});

test('M11B static: STABLE functions take no row locks; SECURITY DEFINER functions pin search_path', () => {
  const sql = fs.readFileSync(M11B, 'utf8');
  const fns = [...sql.matchAll(/create (?:or replace )?function ([\w.]+)\([\s\S]*?\$\$([\s\S]*?)\$\$;/g)];
  assert.ok(fns.length > 20);
  for (const [whole, name, body] of fns) {
    const header = whole.slice(0, whole.indexOf('$$'));
    if (/\bstable\b/.test(header)) assert.doesNotMatch(body, /\bfor\s+(share|update|no key update|key share)\b|pg_advisory/i, `${name} is STABLE and must not lock`);
    if (/security definer/.test(header)) assert.match(header, /set search_path = ''/, `${name} pins search_path`);
  }
  assert.doesNotMatch(sql, /\bdrop table\b|\btruncate\b|\bdelete from\b/i, 'additive only');
  assert.doesNotMatch(sql, /daily_questions|daily_answers|left_for_you|bond_xp|net\.http|openai|anthropic/i);
});
