// US content 1.2 on a real Postgres (PGlite): the repository chain up to Play
// Us, then the content 1.2 migration (twice). Counts, ids, English, options,
// nothing that repeats the catalog, and the US Plus rule: a couple without
// Plus never gets a plus prompt or card (Gioca rounds, Per voi, Questo o
// quello, Play Us), a couple with Plus does. Nothing here touches a real
// Supabase project.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const h = require('./helpers/mc2-db');

const ROOT = path.resolve(__dirname, '..');
const FILE = '20261128104908_contenuti_1_2.sql';
const PREVIOUS = '20261128101816_play_us_punti.sql';
const MIGRATION = fs.readFileSync(path.join(ROOT, 'supabase/migrations', FILE), 'utf8');
const load = () => import(pathToFileURL(path.join(ROOT, 'supabase/game-v2/content-1-2-contract.mjs')).href);
const FAMILIES = ['quanto_mi_conosci', 'ridete', 'scopritevi', 'confrontatevi', 'rivivete'];
const P = 'cccccccc-0000-4000-8000-000000000201'; // the couple with Plus: U1 + U2
const NO_PLUS = h.A; // Francesco + Beatrice, no entitlement
const SEED = `
insert into public.couples(id,name,started_on) values ('${P}','Plus','2026-03-01');
insert into public.profiles(id,display_name,couple_id,role) values ('${h.U1}','Alex','${P}','francesco'),('${h.U2}','Sam','${P}','beatrice');
insert into public.plus_entitlements(user_id,source,product,status) values ('${h.U1}','beta','us_plus','active');
-- An expired entitlement gives nothing.
insert into public.plus_entitlements(user_id,source,product,status,expires_at) values ('${h.F}','play','us_plus','active',now() - interval '1 day');`;

const norm = (q) => q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const words = (q) => new Set(norm(q).split(' ').filter((w) => w.length > 3));
const similarity = (a, b) => {
  const x = words(a), y = words(b);
  return [...x].filter((w) => y.has(w)).length / Math.max(1, Math.min(x.size, y.size));
};
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const setClock = (db, iso) => db.exec(`create or replace function private.game_v2_clock() returns timestamptz
  language sql stable set search_path = '' as $$ select '${iso}'::timestamptz $$;`);
const week = (n) => new Date(Date.UTC(2027, 0, 4 + 7 * n, 10)).toISOString();
const start = (db, user, family) => h.as(db, user, 'select public.start_game_round($1::text,$2::uuid) r', [family, randomUUID()]);
const startSwipe = (db, user) => h.as(db, user, 'select public.start_swipe_round($1::uuid) r', [randomUUID()]);
const refs = async (db, sid) => (await all(db, 'select source_ref from public.game_session_items where session_id = $1 order by position', [sid])).map((r) => r.source_ref);
async function finish(db, users, sid) {
  for (const user of users) {
    const state = await h.as(db, user, 'select public.get_game_session($1::uuid) r', [sid]);
    for (const item of state.items) {
      const choice = item.answer_kind === 'choice';
      await h.as(db, user, 'select public.save_game_session_answer($1::uuid,$2::uuid,$3::text,$4::smallint) r',
        [sid, item.id, choice ? null : 'Risposta', choice ? 0 : null]);
    }
    await h.as(db, user, 'select public.complete_game_session_side($1::uuid) r', [sid]);
  }
}
// One Play Us game started and left at once: the 5 prompts it picked.
async function playUs(db, inviter, answerer) {
  const inv = await h.as(db, inviter, 'select public.play_us_invite() r');
  try {
    const st = await h.as(db, answerer, 'select public.play_us_answer($1::uuid, true) r', [inv.id]);
    return st.items;
  } finally {
    await h.as(db, inviter, 'select public.play_us_abandon($1::uuid) r', [inv.id]);
  }
}

let shared;
async function world() {
  if (shared) return shared;
  const db = await h.database({ until: PREVIOUS });
  await db.exec(SEED);
  const fingerprint = async () => (await one(db, `select md5(string_agg(x, '|' order by x)) h from (
    select c::text x from public.game_v2_catalog c union all select s::text from private.game_swipe_v1_catalog s) z`)).h;
  const before = {
    games: (await one(db, 'select count(*)::int n from public.game_v2_catalog')).n,
    swipe: (await one(db, 'select count(*)::int n from private.game_swipe_v1_catalog where active')).n,
    rows: await all(db, 'select id, question_text, question_text_en from public.game_v2_catalog union all select id, question_text, question_text_en from private.game_swipe_v1_catalog where active'),
    fingerprint: await fingerprint(),
  };
  await db.exec(MIGRATION);
  const after = await fingerprint();
  await db.exec(MIGRATION);
  shared = { db, before, after, again: await fingerprint() };
  return shared;
}
test.after(async () => { if (shared) await shared.db.close(); });

test('content 1.2: applies on the chain, twice, and only adds rows', async () => {
  const { db, before, after, again } = await world();
  const { drafts } = await load();
  const d = drafts();
  assert.notEqual(after, before.fingerprint);
  assert.equal(again, after, 're-applying changes nothing');
  assert.equal((await one(db, 'select count(*)::int n from public.game_v2_catalog')).n, before.games + d.games.new.length);
  assert.equal((await one(db, 'select count(*)::int n from private.game_swipe_v1_catalog where active')).n, before.swipe + d.swipe.new.length);
  const newIds = new Set([...d.games.new, ...d.swipe.new].map((r) => r.id));
  assert.equal(newIds.size, d.games.new.length + d.swipe.new.length, 'ids unique in the drafts');
  for (const id of newIds) assert.ok(!before.rows.some((r) => r.id === id), `${id} is new`);
  // Existing rows: never plus, and exactly as they were.
  assert.equal((await one(db, `select count(*)::int n from public.game_v2_catalog where plus and id <> all ($1::text[])`, [[...newIds]])).n, 0);
  assert.equal((await one(db, `select count(*)::int n from private.game_swipe_v1_catalog where plus and id <> all ($1::text[])`, [[...newIds]])).n, 0);
  assert.equal((await one(db, 'select count(*)::int n from public.game_v2_catalog where plus')).n, d.games.new.filter((r) => r.plus).length);
  assert.equal((await one(db, 'select count(*)::int n from private.game_swipe_v1_catalog where plus')).n, d.swipe.new.filter((r) => r.plus).length);
  // Server-only as before: clients read neither catalog nor the private functions.
  await assert.rejects(h.as(db, h.F, 'select count(*) r from private.game_swipe_v1_catalog'), /permission denied/);
  await assert.rejects(h.as(db, h.F, 'select count(*) r from public.game_v2_catalog'), /permission denied/);
  await assert.rejects(h.as(db, h.F, `select count(*) r from private.game_v2_candidates('${NO_PLUS}', 'ridete', now())`), /permission denied/);
});

test('content 1.2: ids, English and options of every new row as stored', async () => {
  const { db } = await world();
  const { drafts } = await load();
  const ids = drafts().games.new.map((r) => r.id);
  const rows = await all(db, 'select * from public.game_v2_catalog where id = any ($1::text[]) order by id', [ids]);
  assert.equal(rows.length, ids.length);
  for (const r of rows) {
    assert.match(r.id, /^(quanto_mi_conosci|ridete|scopritevi|confrontatevi|rivivete)-\d{3}$/, r.id);
    assert.ok(r.active && r.version === 1 && r.source_type === 'curated' && !r.longitudinal, r.id);
    assert.ok(r.question_text_en?.trim(), `${r.id} English question`);
    assert.equal(Boolean(r.predict_text), Boolean(r.predict_text_en), `${r.id} English prediction`);
    assert.equal(r.options_en.length, r.options.length, `${r.id} English options`);
    for (const o of [...r.options, ...r.options_en]) assert.ok(typeof o === 'string' && o.trim().length > 0, `${r.id} no empty option`);
    if (r.answer_kind === 'choice') assert.ok(r.options.length >= 2 && r.options.length <= 4, r.id);
    // Only the tokens game_v2_render fills.
    for (const t of [r.question_text, r.predict_text || '', ...r.options, r.question_text_en, r.predict_text_en || '', ...r.options_en]) {
      for (const token of t.match(/\{[^}]*\}/g) || []) assert.ok(['{subject}', '{francesco}', '{beatrice}'].includes(token), `${r.id} token ${token}`);
    }
  }
  const cards = await all(db, `select * from private.game_swipe_v1_catalog where id = any ($1::text[])`, [drafts().swipe.new.map((r) => r.id)]);
  assert.equal(cards.length, drafts().swipe.new.length);
  for (const c of cards) {
    assert.match(c.id, /^swipe-\d{3}$/);
    assert.ok(c.question_text_en?.trim() && c.options_en.length === 2, `${c.id} English`);
    for (const o of [...c.options, ...c.options_en]) assert.ok(o.trim().length > 0, `${c.id} no empty option`);
  }
});

test('content 1.2: nothing repeats what the catalog already asks', async () => {
  const { before } = await world();
  const { drafts } = await load();
  const fresh = [...drafts().games.new, ...drafts().swipe.new];
  const clashes = [];
  for (const lang of ['question_text', 'question_text_en']) {
    const old = before.rows.map((r) => [r.id, r[lang]]).filter(([, t]) => t);
    const mine = fresh.map((r) => [r.id, r[lang]]);
    const seen = new Set(old.map(([, t]) => norm(t)));
    for (const [id, t] of mine) {
      if (seen.has(norm(t))) clashes.push(`${id} same wording (${lang})`);
      seen.add(norm(t));
    }
    if (lang === 'question_text') for (const [id, t] of mine) for (const [otherId, other] of [...old, ...mine]) {
      if (otherId !== id && words(t).size >= 4 && similarity(t, other) >= 0.8) clashes.push(`${id} ≈ ${otherId}: «${t}» / «${other}»`);
    }
  }
  assert.deepEqual(clashes, []);
});

test('content 1.2: a couple without Plus never gets a plus prompt, one with Plus does', async () => {
  const { db } = await world();
  const plusIds = new Set((await all(db, 'select id from public.game_v2_catalog where plus union all select id from private.game_swipe_v1_catalog where plus')).map((r) => r.id));
  const hasPlus = async (couple) => (await one(db, 'select private.couple_has_plus($1::uuid) r', [couple])).r;
  assert.equal(await hasPlus(NO_PLUS), false, 'an expired entitlement is not Plus');
  assert.equal(await hasPlus(P), true);

  // The candidate pool of every family and of Per voi.
  for (const family of ['per_voi', ...FAMILIES]) {
    const pool = async (couple) => one(db, `select count(*) filter (where g.plus)::int plus, count(*)::int n
      from private.game_v2_candidates($1::uuid, $2::text, now()) c join public.game_v2_catalog g on c.candidate_key = 'catalog:' || g.id`, [couple, family]);
    const free = await pool(NO_PLUS), paid = await pool(P);
    assert.equal(free.plus, 0, `${family}: no plus candidate without Plus`);
    assert.ok(paid.plus > 0, `${family}: plus candidates with Plus`);
    assert.equal(paid.n - paid.plus, free.n, `${family}: the free pool is the same for both`);
  }

  // Real rounds with the whole catalog: never a plus item without Plus.
  let n = 0;
  for (const family of ['per_voi', ...FAMILIES]) {
    await setClock(db, week(n++));
    const r = await start(db, h.F, family);
    const got = await refs(db, r.id);
    assert.equal(got.length, 5, family);
    assert.ok(got.every((ref) => !plusIds.has(ref)), `${family} round without Plus: ${got}`);
    await finish(db, [h.F, h.B], r.id);
  }
  await setClock(db, week(n++));
  const sw = await startSwipe(db, h.F);
  assert.ok((await refs(db, sw.id)).every((ref) => !plusIds.has(ref.replace(/^swipe:/, ''))), 'swipe without Plus');
  await finish(db, [h.F, h.B], sw.id);
  for (let i = 0; i < 12; i += 1) {
    const items = await playUs(db, h.F, h.B);
    assert.equal(items.length, 5);
    assert.ok(items.every((it) => !plusIds.has(it.id)), `Play Us without Plus: ${items.map((it) => it.id)}`);
    assert.ok(items.every((it) => !it.o.some((o) => o.includes('{'))), 'Play Us never sends a raw token');
  }

  // Only plus content left: with Plus it is played, without Plus there is none.
  await db.exec('update public.game_v2_catalog set active = false where not plus');
  await db.exec('update private.game_swipe_v1_catalog set active = false where not plus');
  for (const family of ['ridete', 'per_voi']) {
    await setClock(db, week(n++));
    const r = await start(db, h.U1, family);
    const got = await refs(db, r.id);
    assert.equal(got.length, 5, family);
    assert.ok(got.every((ref) => plusIds.has(ref)), `${family} round with Plus: ${got}`);
    await finish(db, [h.U1, h.U2], r.id);
    await assert.rejects(start(db, h.F, family), /not enough content/, `${family} without Plus`);
  }
  await setClock(db, week(n++));
  const card = await startSwipe(db, h.U2);
  const cards = await refs(db, card.id);
  assert.equal(cards.length, 8);
  assert.ok(cards.every((ref) => plusIds.has(ref.replace(/^swipe:/, ''))), 'swipe with Plus');
  await assert.rejects(startSwipe(db, h.B), /not enough swipe content/, 'swipe without Plus');
  const items = await playUs(db, h.U2, h.U1);
  assert.ok(items.length === 5 && items.every((it) => plusIds.has(it.id)), 'Play Us with Plus');
  await assert.rejects(playUs(db, h.B, h.F), /not enough content/, 'Play Us without Plus');
});

test('content 1.2: an unknown body of the functions it replaces aborts before any change', async () => {
  const db = await h.database({ seed: false, until: PREVIOUS });
  try {
    await db.exec(`create or replace function public.play_us_answer(p_session uuid, p_accept boolean) returns jsonb
      language sql security definer set search_path = '' as $$ select '{}'::jsonb $$;`);
    await assert.rejects(db.exec(MIGRATION), /content 1\.2: public\.play_us_answer\(uuid,boolean\) is not the audited version/);
    assert.equal((await one(db, `select count(*)::int n from information_schema.columns where table_name = 'game_v2_catalog' and column_name = 'plus'`)).n, 0);
  } finally { await db.close(); }
});
