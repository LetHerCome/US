// M12B.3 — Game V2 grouping rule: a Moment kept from a lived fact is the same
// real-life source as that fact. Real M11A..M11F Game V2 migrations plus the
// three M12B.3 migrations in an isolated PGlite (tests/helpers/game-v2-db.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/game-v2-db');
const { EVENTS_FIXTURE, M12B3 } = require('./helpers/m12b-3-events-fixture');

const { createDb, couple, setClock, as, rpc, startRound, playSide } = h;
const NOW = '2026-09-30T10:00:00Z';
const days = (n) => new Date(new Date(NOW).getTime() + n * 86400000).toISOString();
const q = async (db, sql, params = []) => (await db.query(sql, params)).rows;

async function world() {
  const db = await createDb();
  await db.exec(EVENTS_FIXTURE);
  for (const f of Object.values(M12B3)) await db.exec(fs.readFileSync(path.join(h.ROOT, f), 'utf8'));
  const p = await couple(db);
  await setClock(db, NOW);
  return { db, ...p };
}
const candidates = (db, c, family = 'rivivete') =>
  q(db, `select candidate_key, source_type, source_ref, context from private.game_v2_context_candidates($1::uuid, $2::text, private.game_v2_clock())`, [c, family]);
const scored = (db, c, family = 'rivivete') =>
  q(db, `select candidate_key, source_type, source_ref, cooled from private.game_v2_scored_candidates($1::uuid, $2::text, private.game_v2_clock(), 0)`, [c, family]);
async function lived(db, c, title, at) {
  return (await q(db, `insert into public.bucket_items(couple_id, title, status, completed, completed_at) values ($1, $2, 'lived', true, $3) returning id`, [c, title, at]))[0].id;
}
async function moment(db, c, uid, caption, day) {
  return (await q(db, `insert into public.moments(couple_id, created_by, storage_path, caption, moment_date) values ($1, $2, $3, $4, $5) returning id`,
    [c, uid, `couple/${c}/${uid}/${h.id()}.jpg`, caption, day]))[0].id;
}
const link = (db, uid, m, kind, ref) => as(db, uid, () => rpc(db, 'select public.link_moment_to_source($1, $2, $3) r', [m, kind, ref]));

test('G — a Moment and the lived Da vivere item it came from share ONE Rivivete source', async () => {
  const { db, c, f, b } = await world();
  const item = await lived(db, c, 'Weekend Roma', days(-60));
  const m = await moment(db, c, f, 'Noi a Roma', days(-60).slice(0, 10));
  const plain = await moment(db, c, f, 'Tramonto a Trieste', days(-120).slice(0, 10));
  await link(db, f, m, 'da_vivere', item);

  const rows = await candidates(db, c);
  const fromMoment = rows.filter((r) => r.context.kind === 'moment' && r.context.title === 'Noi a Roma');
  const fromItem = rows.filter((r) => r.context.kind === 'da_vivere_lived');
  assert.ok(fromMoment.length >= 1 && fromItem.length >= 1, 'both adapters still offer the experience');
  for (const r of [...fromMoment, ...fromItem]) assert.deepEqual([r.source_type, r.source_ref], ['da_vivere', item], r.candidate_key);
  assert.ok(!rows.some((r) => r.source_ref === m), 'the linked Moment is never a second, independent source');
  const unlinked = rows.filter((r) => r.context.title === 'Tramonto a Trieste');
  assert.ok(unlinked.length >= 1);
  for (const r of unlinked) assert.deepEqual([r.source_type, r.source_ref], ['moment', plain], 'an unlinked Moment is unchanged (M11C)');

  // One real experience at most once per round, whichever adapter wins.
  const s = await startRound(db, f, 'rivivete');
  const same = s.items.filter((i) => i.source_type === 'da_vivere' && i.context.source_id === item);
  assert.ok(same.length <= 1, `one experience per round (${same.length})`);
  // Deterministic cooldown check: the lived item was played 3 days ago through
  // the Da vivere adapter. The shared source cooldown then covers the Moment too.
  const [sess] = await q(db, `insert into public.game_sessions(couple_id, game_family, content_source, started_by_role,
    create_request_id, engine_version, started_at, completed_at) values ($1, 'rivivete', 'mixed', 'francesco', $2, 2, $3, $3) returning id`,
  [c, h.id(), days(-3)]);
  await q(db, `insert into public.game_session_items(session_id, position, question_text, answer_kind, mechanic, family,
    source_type, source_ref, recipe_id, topic, fingerprint, options) values ($1, 1, 'Com’era Roma?', 'open', 'reciprocal', 'rivivete',
    'da_vivere', $2, 'da_vivere_lived-001', 'ricordi', $3, '[]')`, [sess.id, item, `recipe:da_vivere_lived-001:da_vivere:${item}`]);
  const after = (await scored(db, c)).filter((r) => r.source_ref === item);
  assert.ok(after.some((r) => r.candidate_key.startsWith('recipe:moment-')), 'the Moment candidate is scored under the same source');
  for (const r of after) assert.equal(r.cooled, true, `${r.candidate_key} is cooled with its source`);
});

test('G — the grouping is keyed by provenance, not by title: a same-titled unlinked Moment stays its own source', async () => {
  const { db, c, f } = await world();
  const item = await lived(db, c, 'Weekend Roma', days(-60));
  const unrelated = await moment(db, c, f, 'Weekend Roma', days(-400).slice(0, 10));
  const rows = await candidates(db, c);
  assert.ok(rows.some((r) => r.source_type === 'moment' && r.source_ref === unrelated));
  assert.ok(rows.some((r) => r.source_type === 'da_vivere' && r.source_ref === item));
});

test('G — a Moment kept from an Event completion carries the completion as its source', async () => {
  const { db, c, f } = await world();
  const [ev] = await q(db, `insert into public.shared_events(couple_id, title, event_date) values ($1, 'Concerto di Elisa', '2026-06-01') returning id`, [c]);
  const done = await as(db, f, () => rpc(db, `select public.complete_shared_event($1, '2026-06-01') r`, [ev.id]));
  const m = await moment(db, c, f, 'Sotto il palco', '2026-06-01');
  await link(db, f, m, 'shared_event_completion', done.id);
  const rows = (await candidates(db, c)).filter((r) => r.context.kind === 'moment');
  assert.ok(rows.length >= 1);
  for (const r of rows) {
    assert.deepEqual([r.source_type, r.source_ref], ['shared_event_completion', done.id]);
    assert.equal(r.context.title, 'Sotto il palco', 'the prompt uses the Moment caption, as in M11C');
  }
  // Another couple's provenance never reaches this couple's candidates.
  const other = await couple(db);
  await moment(db, other.c, other.f, 'Altra coppia', '2026-06-01');
  assert.ok(!JSON.stringify(await candidates(db, c)).includes('Altra coppia'));
});

test('G static: only the moment adapter is replaced, lock-free, pinned, behind the M11C privacy wall', () => {
  const sql = fs.readFileSync(path.join(h.ROOT, M12B3.gameV2), 'utf8');
  const code = sql.replace(/--[^\n]*/g, '');
  const fns = [...code.matchAll(/create (?:or replace )?function ([\w.]+)\(/g)].map((m) => m[1]);
  assert.deepEqual(fns, ['private.game_v2_ctx_moments']);
  assert.match(code, /language plpgsql stable set search_path = ''/);
  assert.doesNotMatch(code, /\bfor\s+(share|update|no key update|key share)\b|pg_advisory/i);
  assert.doesNotMatch(code, /daily_questions|daily_answers|daily_question_|left_for_you\b|\.body\b|bond_xp|net\.http|openai|anthropic/i);
  assert.doesNotMatch(code, /\binsert\b|\bupdate\b|\bdelete\b/i, 'reads only');
  assert.match(code, /t\.on_day between at_date - 730 and at_date - 14/, 'same M11C window');
  assert.match(code, /exception when others then/, 'same isolation guard');
});
