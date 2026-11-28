// US content 1.4 «domande a scelta» on a real Postgres (PGlite): the
// repository chain up to content 1.3, a round played with prompts that are
// still open, then the content 1.4 migration (twice). Final counts (open
// only for the longitudinal prompts and about 25 in Rivivete), every
// converted prompt with 3–4 options and English, version + 1 and nothing
// else changed, the old round still readable, new rounds and Play Us still
// working, and the preflight that stops on a prompt that is not the expected
// one. Nothing here touches a real Supabase project.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const h = require('./helpers/mc2-db');

const ROOT = path.resolve(__dirname, '..');
const FILE = '20261128122730_domande_a_scelta.sql';
const PREVIOUS = '20261128115152_contenuti_hot.sql';
const MIGRATION = fs.readFileSync(path.join(ROOT, 'supabase/migrations', FILE), 'utf8');
const load = () => import(pathToFileURL(path.join(ROOT, 'supabase/game-v2/content-1-4-contract.mjs')).href);
const FAMILIES = ['ridete', 'scopritevi', 'confrontatevi', 'rivivete'];

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const setClock = (db, iso) => db.exec(`create or replace function private.game_v2_clock() returns timestamptz
  language sql stable set search_path = '' as $$ select '${iso}'::timestamptz $$;`);
const week = (n) => new Date(Date.UTC(2027, 0, 4 + 7 * n, 10)).toISOString();
const start = (db, user, family) => h.as(db, user, 'select public.start_game_round($1::text,$2::uuid) r', [family, randomUUID()]);
const session = (db, user, sid) => h.as(db, user, 'select public.get_game_session($1::uuid) r', [sid]);
async function finish(db, users, sid) {
  for (const user of users) {
    const state = await session(db, user, sid);
    for (const item of state.items) {
      const choice = item.answer_kind === 'choice';
      await h.as(db, user, 'select public.save_game_session_answer($1::uuid,$2::uuid,$3::text,$4::smallint) r',
        [sid, item.id, choice ? null : 'Risposta scritta', choice ? 0 : null]);
    }
    await h.as(db, user, 'select public.complete_game_session_side($1::uuid) r', [sid]);
  }
}
async function playUs(db, inviter, answerer) {
  const inv = await h.as(db, inviter, 'select public.play_us_invite() r');
  try {
    return (await h.as(db, answerer, 'select public.play_us_answer($1::uuid, true) r', [inv.id])).items;
  } finally {
    await h.as(db, inviter, 'select public.play_us_abandon($1::uuid) r', [inv.id]);
  }
}
const catalogText = async (db) => (await all(db, 'select c::text x, c.id from public.game_v2_catalog c order by id'));
const digest = async (db, table) => (await one(db, `select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) h from ${table} t`)).h;

let shared;
async function world() {
  if (shared) return shared;
  const { drafts } = await load();
  const d = drafts();
  const ids = d.convert.map((r) => r.id);
  const db = await h.database({ until: PREVIOUS });
  // A round of Ridete played before the migration, with open prompts only.
  await setClock(db, week(0));
  const choiceRidete = (await all(db, `select id from public.game_v2_catalog where family = 'ridete' and active and answer_kind = 'choice'`)).map((r) => r.id);
  await db.query('update public.game_v2_catalog set active = false where id = any ($1::text[])', [choiceRidete]);
  const old = await start(db, h.F, 'ridete');
  await db.query('update public.game_v2_catalog set active = true where id = any ($1::text[])', [choiceRidete]);
  await finish(db, [h.F, h.B], old.id);
  const before = {
    rows: new Map((await all(db, 'select * from public.game_v2_catalog')).map((r) => [r.id, r])),
    catalog: await catalogText(db),
    daily: await digest(db, 'public.daily_question_templates'),
    custom: await digest(db, 'public.couple_questions'),
    swipe: await digest(db, 'private.game_swipe_v1_catalog'),
    items: await digest(db, 'public.game_session_items'),
    oldState: await session(db, h.F, old.id),
    playUsPool: (await one(db, `select count(*)::int n from public.game_v2_catalog where active and mechanic = 'reciprocal' and answer_kind = 'choice'
      and char_length(question_text) <= 70 and strpos(question_text, '{') = 0`)).n,
  };
  await db.exec(MIGRATION);
  const after = await catalogText(db);
  await db.exec(MIGRATION);
  shared = { db, d, ids, old, before, after, again: await catalogText(db) };
  return shared;
}
test.after(async () => { if (shared) await shared.db.close(); });

test('content 1.4: applies on the chain, twice, and only converts the planned prompts', async () => {
  const { db, d, ids, before, after, again } = await world();
  assert.deepEqual(again, after, 're-applying changes nothing');
  assert.equal(after.length, before.catalog.length, 'nothing inserted or deleted');
  const changed = after.filter((r, i) => r.x !== before.catalog[i].x).map((r) => r.id).sort();
  assert.deepEqual(changed, [...ids].sort(), 'only the planned prompts change');
  assert.equal(await digest(db, 'public.daily_question_templates'), before.daily, 'question of the day untouched');
  assert.equal(await digest(db, 'public.couple_questions'), before.custom, 'couple questions untouched');
  assert.equal(await digest(db, 'private.game_swipe_v1_catalog'), before.swipe, 'Questo o quello untouched');
  assert.equal(await digest(db, 'public.game_session_items'), before.items, 'played rounds keep their copy');
  assert.equal(d.convert.length, 141);
});

test('content 1.4: open only for the longitudinal prompts and about 25 in Rivivete', async () => {
  const { db, d } = await world();
  const open = await all(db, `select family, id, longitudinal from public.game_v2_catalog
    where active and answer_kind = 'open' and family = any ($1::text[]) order by id`, [FAMILIES]);
  const notLongitudinal = open.filter((r) => !r.longitudinal).map((r) => r.id);
  assert.deepEqual(notLongitudinal, [...d.keep_open].sort(), 'besides longitudinal, only the Rivivete memories');
  const byFamily = Object.fromEntries(FAMILIES.map((f) => [f, open.filter((r) => r.family === f).length]));
  assert.deepEqual(byFamily, { ridete: 0, scopritevi: 13, confrontatevi: 7, rivivete: 25 });
  // Every longitudinal prompt is still open (25, with the two of e_se).
  const longitudinal = await one(db, `select count(*)::int n, count(*) filter (where answer_kind = 'open')::int open
    from public.game_v2_catalog where active and longitudinal`);
  assert.deepEqual(longitudinal, { n: 25, open: 25 });
  // e_se as it was.
  const eSe = await one(db, `select count(*) filter (where answer_kind = 'open')::int open from public.game_v2_catalog where family = 'e_se' and active`);
  assert.equal(eSe.open, 6);
});

test('content 1.4: every converted prompt as stored, version + 1, the rest of the row unchanged', async () => {
  const { db, d, before } = await world();
  const rows = new Map((await all(db, 'select * from public.game_v2_catalog where id = any ($1::text[])', [d.convert.map((r) => r.id)])).map((r) => [r.id, r]));
  for (const r of d.convert) {
    const now = rows.get(r.id), was = before.rows.get(r.id);
    assert.equal(was.answer_kind, 'open', `${r.id} was open`);
    assert.equal(was.version, r.from.version, `${r.id} from version`);
    assert.equal(was.question_text, r.from.question_text, `${r.id} from text`);
    assert.equal(now.answer_kind, 'choice', r.id);
    assert.equal(now.version, was.version + 1, `${r.id} version + 1`);
    assert.equal(now.question_text, r.question_text, r.id);
    assert.equal(now.question_text_en, r.question_text_en, r.id);
    assert.deepEqual(now.options, r.options, r.id);
    assert.deepEqual(now.options_en, r.options_en, r.id);
    assert.ok(now.options.length >= 3 && now.options.length <= 4, `${r.id} 3-4 options`);
    assert.equal(now.options_en.length, now.options.length, `${r.id} English options`);
    for (const o of [...now.options, ...now.options_en]) assert.ok(typeof o === 'string' && o.trim().length > 0, `${r.id} option`);
    assert.ok(now.question_text_en.trim().length > 0, `${r.id} English question`);
    for (const k of ['family', 'mechanic', 'topic', 'depth', 'cooldown_class', 'longitudinal', 'active', 'plus', 'source_type', 'predict_text', 'predict_text_en']) {
      assert.deepEqual(now[k], was[k], `${r.id} ${k} unchanged`);
    }
    assert.equal(r.from.plus, was.plus, `${r.id} draft plus`);
  }
});

test('content 1.4: the round played before stays readable, with the open answers', async () => {
  const { db, old, before } = await world();
  const state = await session(db, h.F, old.id);
  assert.ok(state.items.length >= 3, 'a full round');
  assert.deepEqual(state.items.map((i) => [i.question_text, i.answer_kind, i.options]),
    before.oldState.items.map((i) => [i.question_text, i.answer_kind, i.options]), 'the same copy as before');
  for (const item of state.items) {
    assert.equal(item.answer_kind, 'open');
    assert.equal(item.my_answer_text, 'Risposta scritta');
    assert.equal(item.partner_answer_text, 'Risposta scritta');
  }
  const refs = (await all(db, 'select source_ref, recipe_version from public.game_session_items where session_id = $1', [old.id]));
  const now = new Map((await all(db, 'select id, version, answer_kind from public.game_v2_catalog where id = any ($1::text[])', [refs.map((r) => r.source_ref)])).map((r) => [r.id, r]));
  for (const r of refs) {
    assert.equal(now.get(r.source_ref).answer_kind, 'choice', `${r.source_ref} is a choice now`);
    assert.equal(now.get(r.source_ref).version, r.recipe_version + 1, `${r.source_ref} played at the old version`);
  }
  // An English reader still reads the round: the item keeps its own words.
  await db.query(`update public.profiles set locale = 'en' where id = $1`, [h.B]);
  try {
    const en = await session(db, h.B, old.id);
    for (const [i, item] of en.items.entries()) {
      assert.ok(item.question_text && item.question_text.trim().length > 0, 'question shown');
      assert.equal(item.answer_kind, 'open');
      assert.equal(item.my_answer_text, 'Risposta scritta');
      assert.equal(item.question_text, state.items[i].question_text, 'Italian copy of the version played');
    }
  } finally {
    await db.query(`update public.profiles set locale = 'it' where id = $1`, [h.B]);
  }
});

test('content 1.4: new rounds of every game and Play Us still work', async () => {
  const { db, ids, before } = await world();
  const converted = new Set(ids);
  let n = 1;
  for (const family of ['per_voi', ...FAMILIES, 'quanto_mi_conosci']) {
    await setClock(db, week(n++));
    const r = await start(db, h.F, family);
    const state = await session(db, h.F, r.id);
    assert.ok(state.items.length >= 3, `${family}: ${state.items.length}`);
    for (const item of state.items) {
      if (item.answer_kind === 'choice') assert.ok(item.options.length >= 2 && item.options.length <= 4, `${family} options`);
      else assert.equal(item.options.length, 0);
    }
    if (family === 'ridete') assert.ok(state.items.every((i) => i.answer_kind === 'choice'), 'Ridete is all choice');
    await finish(db, [h.F, h.B], r.id);
    const done = await session(db, h.B, r.id);
    assert.ok(done.items.every((i) => i.my_answer_index !== null || i.my_answer_text), `${family} answered`);
  }
  // A converted prompt in a round: choice, its options, its English.
  await setClock(db, week(n++));
  const keep = await all(db, `select id from public.game_v2_catalog where family = 'scopritevi' and active and id <> all ($1::text[])`, [ids]);
  await db.query('update public.game_v2_catalog set active = false where id = any ($1::text[])', [keep.map((r) => r.id)]);
  try {
    await db.query(`update public.profiles set locale = 'en' where id = $1`, [h.F]);
    const r = await start(db, h.F, 'scopritevi');
    const state = await session(db, h.F, r.id);
    const rows = await all(db, 'select source_ref from public.game_session_items where session_id = $1 order by position', [r.id]);
    assert.ok(rows.every((x) => converted.has(x.source_ref)), 'only converted prompts');
    for (const [i, item] of state.items.entries()) {
      const c = await one(db, 'select question_text_en, options_en from public.game_v2_catalog where id = $1', [rows[i].source_ref]);
      assert.equal(item.answer_kind, 'choice');
      assert.equal(item.question_text, c.question_text_en, 'English question');
      assert.deepEqual(item.options, c.options_en, 'English options');
    }
  } finally {
    await db.query('update public.game_v2_catalog set active = true where id = any ($1::text[])', [keep.map((r) => r.id)]);
    await db.query(`update public.profiles set locale = 'it' where id = $1`, [h.F]);
  }
  // Play Us draws from a larger pool, converted prompts included.
  const pool = (await one(db, `select count(*)::int n from public.game_v2_catalog where active and mechanic = 'reciprocal' and answer_kind = 'choice'
    and char_length(question_text) <= 70 and strpos(question_text, '{') = 0`)).n;
  assert.ok(pool > before.playUsPool + 50, `Play Us pool ${before.playUsPool} → ${pool}`);
  let seen = false;
  for (let i = 0; i < 12 && !seen; i += 1) {
    const items = await playUs(db, h.F, h.B);
    assert.equal(items.length, 5, 'Play Us round');
    for (const it of items) assert.ok(it.o.length >= 2 && it.o.length <= 4 && ![it.q, ...it.o].join(' ').includes('{'), 'Play Us item');
    seen = items.some((it) => converted.has(it.id));
  }
  assert.ok(seen, 'Play Us draws converted prompts too');
});

test('content 1.4: a prompt that is not the expected one stops the migration before any change', async () => {
  const db = await h.database({ until: PREVIOUS });
  try {
    const { drafts } = await load();
    const target = drafts().convert[0];
    await db.query(`update public.game_v2_catalog set question_text = question_text || ' (rivista)', version = version + 1 where id = $1`, [target.id]);
    const before = await catalogText(db);
    await assert.rejects(db.exec(MIGRATION), new RegExp(`content 1\\.4: ${target.id} is not the expected prompt`));
    assert.deepEqual(await catalogText(db), before, 'nothing changed');
    // A missing prompt stops it too.
    await db.query('delete from public.game_v2_catalog where id = $1', [target.id]);
    await assert.rejects(db.exec(MIGRATION), new RegExp(`content 1\\.4: ${target.id} is missing`));
  } finally {
    await db.close();
  }
});
