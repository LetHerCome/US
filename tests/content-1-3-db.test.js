// US content 1.3 «hot» on a real Postgres (PGlite): the repository chain up to
// US Plus in vetrina, then the content 1.3 migration (twice). Counts, ids,
// English, options, nothing that repeats the catalog, every row plus, and the
// US Plus rule: a couple without Plus never gets a piccante/desideri prompt
// or card (Gioca rounds, Per voi, Questo o quello, Play Us), a couple with
// Plus does, and public.get_plus_preview_v1 shows them. Nothing here touches
// a real Supabase project.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const h = require('./helpers/mc2-db');

const ROOT = path.resolve(__dirname, '..');
const FILE = '20261128115152_contenuti_hot.sql';
const PREVIOUS = '20261128113629_contenuti_plus_vetrina.sql';
const MIGRATION = fs.readFileSync(path.join(ROOT, 'supabase/migrations', FILE), 'utf8');
const load = () => import(pathToFileURL(path.join(ROOT, 'supabase/game-v2/content-1-3-contract.mjs')).href);
const FAMILIES = ['quanto_mi_conosci', 'ridete', 'scopritevi', 'confrontatevi', 'rivivete'];
const P = 'cccccccc-0000-4000-8000-000000000301'; // the couple with Plus: U1 + U2
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
    swipe: (await one(db, 'select count(*)::int n from private.game_swipe_v1_catalog')).n,
    plus: (await one(db, 'select (select count(*) from public.game_v2_catalog where plus) + (select count(*) from private.game_swipe_v1_catalog where plus) n')).n,
    rows: await all(db, 'select id, question_text, question_text_en from public.game_v2_catalog union all select id, question_text, question_text_en from private.game_swipe_v1_catalog where active'),
    fingerprint: await fingerprint(),
    old: await all(db, 'select c::text x from public.game_v2_catalog c union all select s::text from private.game_swipe_v1_catalog s'),
  };
  await db.exec(MIGRATION);
  const after = await fingerprint();
  await db.exec(MIGRATION);
  shared = { db, before, after, again: await fingerprint() };
  return shared;
}
test.after(async () => { if (shared) await shared.db.close(); });

test('content 1.3: applies on the chain, twice, and only adds plus rows', async () => {
  const { db, before, after, again } = await world();
  const { drafts } = await load();
  const d = drafts();
  assert.notEqual(after, before.fingerprint);
  assert.equal(again, after, 're-applying changes nothing');
  assert.equal((await one(db, 'select count(*)::int n from public.game_v2_catalog')).n, before.games + d.games.new.length);
  assert.equal((await one(db, 'select count(*)::int n from private.game_swipe_v1_catalog')).n, before.swipe + d.swipe.new.length);
  const newIds = [...d.games.new, ...d.swipe.new].map((r) => r.id);
  assert.equal(new Set(newIds).size, newIds.length, 'ids unique in the drafts');
  for (const id of newIds) assert.ok(!before.rows.some((r) => r.id === id), `${id} is new`);
  // Existing rows exactly as they were.
  const now = new Set((await all(db, 'select c::text x from public.game_v2_catalog c union all select s::text from private.game_swipe_v1_catalog s')).map((r) => r.x));
  assert.ok(before.old.every((r) => now.has(r.x)), 'no existing row changed');
  // Every new row is plus.
  const plusNow = (await one(db, 'select (select count(*) from public.game_v2_catalog where plus) + (select count(*) from private.game_swipe_v1_catalog where plus) n')).n;
  assert.equal(Number(plusNow), Number(before.plus) + newIds.length);
  assert.equal((await one(db, `select count(*)::int n from (select id from public.game_v2_catalog where not plus and id = any ($1::text[])
    union all select id from private.game_swipe_v1_catalog where not plus and id = any ($1::text[])) z`, [newIds])).n, 0);
  await assert.rejects(h.as(db, h.F, 'select count(*) r from public.game_v2_catalog'), /permission denied/);
  await assert.rejects(h.as(db, h.F, 'select count(*) r from private.game_swipe_v1_catalog'), /permission denied/);
});

test('content 1.3: ids, English and options of every new row as stored', async () => {
  const { db } = await world();
  const { drafts, THEMES } = await load();
  const d = drafts();
  const rows = await all(db, 'select * from public.game_v2_catalog where id = any ($1::text[]) order by id', [d.games.new.map((r) => r.id)]);
  assert.equal(rows.length, d.games.new.length);
  for (const r of rows) {
    assert.match(r.id, /^(quanto_mi_conosci|ridete|scopritevi|confrontatevi|rivivete)-\d{3}$/, r.id);
    assert.ok(r.active && r.plus && r.version === 1 && r.source_type === 'curated' && !r.longitudinal, r.id);
    assert.ok(THEMES.includes(r.topic.split('_')[0]), `${r.id} theme`);
    assert.ok(r.question_text_en?.trim(), `${r.id} English question`);
    assert.equal(Boolean(r.predict_text), Boolean(r.predict_text_en), `${r.id} English prediction`);
    assert.equal(r.options_en.length, r.options.length, `${r.id} English options`);
    for (const o of [...r.options, ...r.options_en]) assert.ok(typeof o === 'string' && o.trim().length > 0 && !o.includes('{'), `${r.id} option`);
    if (r.answer_kind === 'choice') assert.ok(r.options.length >= 2 && r.options.length <= 4, r.id);
    for (const t of [r.question_text, r.predict_text || '', r.question_text_en, r.predict_text_en || '']) {
      for (const token of t.match(/\{[^}]*\}/g) || []) assert.equal(token, '{subject}', `${r.id} token ${token}`);
    }
  }
  const cards = await all(db, 'select * from private.game_swipe_v1_catalog where id = any ($1::text[])', [d.swipe.new.map((r) => r.id)]);
  assert.equal(cards.length, d.swipe.new.length);
  for (const c of cards) {
    assert.match(c.id, /^swipe-\d{3}$/);
    assert.ok(c.active && c.plus, c.id);
    assert.ok(THEMES.includes(c.topic.split('_')[0]), `${c.id} theme`);
    assert.ok(c.question_text_en?.trim() && c.options_en.length === 2 && c.options.length === 2, `${c.id} English`);
  }
});

test('content 1.3: nothing repeats what the catalog already asks', async () => {
  const { before } = await world();
  const { drafts } = await load();
  const fresh = [...drafts().games.new, ...drafts().swipe.new];
  const clashes = [];
  for (const lang of ['question_text', 'question_text_en']) {
    const old = before.rows.map((r) => [r.id, r[lang]]).filter(([, t]) => t);
    const seen = new Set(old.map(([, t]) => norm(t)));
    for (const r of fresh) {
      if (seen.has(norm(r[lang]))) clashes.push(`${r.id} same wording (${lang})`);
      seen.add(norm(r[lang]));
    }
    if (lang === 'question_text') for (const r of fresh) for (const [otherId, other] of [...old, ...fresh.map((x) => [x.id, x[lang]])]) {
      if (otherId !== r.id && words(r[lang]).size >= 4 && similarity(r[lang], other) >= 0.8) clashes.push(`${r.id} ≈ ${otherId}: «${r[lang]}» / «${other}»`);
    }
  }
  assert.deepEqual(clashes, []);
});

test('content 1.3: get_plus_preview_v1 shows every piccante and desideri question to a couple without Plus', async () => {
  const { db } = await world();
  const { drafts, THEMES } = await load();
  const d = drafts();
  const free = await h.as(db, h.F, 'select public.get_plus_preview_v1() r');
  const paid = await h.as(db, h.U1, 'select public.get_plus_preview_v1() r');
  assert.equal(free.has_plus, false);
  assert.equal(paid.has_plus, true);
  const hot = free.items.filter((i) => THEMES.includes(i.theme));
  assert.equal(hot.length, d.games.new.length + d.swipe.new.length);
  for (const tema of THEMES) assert.ok(hot.filter((i) => i.theme === tema).length >= 22, tema);
  const shown = new Set(hot.map((i) => i.q));
  for (const r of [...d.games.new, ...d.swipe.new]) assert.ok(shown.has(r.question_text), `${r.id} in the preview`);
  assert.ok(hot.some((i) => i.family === 'swipe'), 'Questo o quello too');
  assert.ok(hot.every((i) => Object.keys(i).length === 3), 'only family, theme and the words');
  // In English for an English reader.
  await db.query(`update public.profiles set locale = 'en' where id = $1`, [h.U1]);
  try {
    const en = await h.as(db, h.U1, 'select public.get_plus_preview_v1() r');
    const shownEn = new Set(en.items.map((i) => i.q));
    for (const r of [...d.games.new, ...d.swipe.new]) assert.ok(shownEn.has(r.question_text_en), `${r.id} English preview`);
  } finally {
    await db.query(`update public.profiles set locale = 'it' where id = $1`, [h.U1]);
  }
});

test('content 1.3: a couple without Plus never gets a hot prompt, one with Plus does', async () => {
  const { db } = await world();
  const { drafts } = await load();
  const d = drafts();
  const hotGames = new Set(d.games.new.map((r) => r.id));
  const hotCards = new Set(d.swipe.new.map((r) => r.id));
  const hasPlus = async (couple) => (await one(db, 'select private.couple_has_plus($1::uuid) r', [couple])).r;
  assert.equal(await hasPlus(NO_PLUS), false, 'an expired entitlement is not Plus');
  assert.equal(await hasPlus(P), true);

  // The candidate pool of every family and of Per voi.
  for (const family of ['per_voi', ...FAMILIES]) {
    const pool = async (couple) => new Set((await all(db, `select g.id from private.game_v2_candidates($1::uuid, $2::text, now()) c
      join public.game_v2_catalog g on c.candidate_key = 'catalog:' || g.id`, [couple, family])).map((r) => r.id));
    const free = await pool(NO_PLUS), paid = await pool(P);
    const mine = [...hotGames].filter((id) => family === 'per_voi' || id.startsWith(`${family}-`));
    assert.ok(mine.length >= 4, family);
    assert.ok(mine.every((id) => !free.has(id)), `${family}: no hot candidate without Plus`);
    assert.ok(mine.every((id) => paid.has(id)), `${family}: every hot candidate with Plus`);
  }

  // Only the hot content left: with Plus it is played, without Plus there is none.
  await db.query('update public.game_v2_catalog set active = false where id <> all ($1::text[])', [[...hotGames]]);
  await db.query('update private.game_swipe_v1_catalog set active = false where id <> all ($1::text[])', [[...hotCards]]);
  let n = 0;
  for (const family of ['per_voi', ...FAMILIES]) {
    await setClock(db, week(n++));
    const r = await start(db, h.U1, family);
    const got = await refs(db, r.id);
    assert.ok(got.length >= 4, `${family}: ${got.length}`);
    assert.ok(got.every((ref) => hotGames.has(ref)), `${family} round with Plus: ${got}`);
    await finish(db, [h.U1, h.U2], r.id);
    await assert.rejects(start(db, h.F, family), /not enough content/, `${family} without Plus`);
  }
  await setClock(db, week(n++));
  const card = await startSwipe(db, h.U2);
  const cards = await refs(db, card.id);
  assert.equal(cards.length, 8);
  assert.ok(cards.every((ref) => hotCards.has(ref.replace(/^swipe:/, ''))), 'swipe with Plus');
  await assert.rejects(startSwipe(db, h.B), /not enough swipe content/, 'swipe without Plus');
  for (let i = 0; i < 4; i += 1) {
    const items = await playUs(db, h.U2, h.U1);
    assert.ok(items.length === 5 && items.every((it) => hotGames.has(it.id)), 'Play Us with Plus');
  }
  await assert.rejects(playUs(db, h.B, h.F), /not enough content/, 'Play Us without Plus');
});
