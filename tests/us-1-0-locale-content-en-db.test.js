// US 1.0 language migration on a real Postgres (PGlite): the repository chain
// up to the content migration, couples with rounds already played, then
// 20261014230000 (twice). Each person reads content in their own language
// (profiles.locale, set through set_my_locale), Italian callers read exactly
// what they read before, and E se…? prompts reach Confrontatevi rounds while
// an older app can still start 'e_se'. Nothing here touches a real Supabase project.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { newDb } = require('../scripts/supabase-baseline/rebuild.cjs');
const { PLATFORM, as } = require('./helpers/mc2-db');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'supabase/migrations');
const CONTENT_FILE = '20261014220000_content_1_0.sql';
const FILE = '20261014230000_us_1_0_locale_content_en.sql';
const read = (file) => fs.readFileSync(path.join(DIR, file), 'utf8');
const LOCALE = read(FILE);

const uid = (n) => `dddddddd-0000-4000-8000-${String(n).padStart(12, '0')}`;
const C1 = uid(101), C2 = uid(102);
const C3 = uid(103);
const F = uid(1), B = uid(2), X = uid(3), Y = uid(4), LONER = uid(5), S = uid(6);
const NAMES = { [C1]: { francesco: 'Alex', beatrice: 'Sam' }, [C2]: { francesco: 'Noa', beatrice: 'Rin' }, [C3]: { francesco: 'Ale', beatrice: 'Partner 2' } };
const SEED = `
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
  ('${F}','f@example.test',now(),false),('${B}','b@example.test',now(),false),('${X}','x@example.test',now(),false),
  ('${Y}','y@example.test',now(),false),('${LONER}','l@example.test',now(),false),('${S}','s@example.test',now(),false);
insert into public.couples(id,name,started_on) values ('${C1}','Noi','2026-01-01'),('${C2}','Altri','2026-02-01'),('${C3}','In attesa','2026-03-01');
insert into public.profiles(id,display_name,couple_id,role) values
  ('${F}','Alex','${C1}','francesco'),('${B}','Sam','${C1}','beatrice'),
  ('${X}','Noa','${C2}','francesco'),('${Y}','Rin','${C2}','beatrice'),('${S}','Ale','${C3}','francesco');
-- Real-life sources for the context recipes (the game clock is 2026-10-14).
insert into public.calendar_entries(couple_id,entry_type,created_by,title,is_all_day,start_date,end_date) values
  ('${C1}','shared','${F}','Cena da Marta',true,'2026-10-24','2026-10-24'),
  ('${C1}','shared','${F}','Concerto al parco',true,'2026-09-01','2026-09-01');
insert into public.bucket_items(couple_id,created_by,title,status) values ('${C1}','${F}','Corso di ceramica','idea');
insert into public.moments(couple_id,created_by,storage_path,caption,moment_date) values
  ('${C1}','${F}','couple/${C1}/a.jpg','Gita al lago','2026-07-05'),
  ('${C1}','${F}','couple/${C1}/b.jpg','Pranzo in terrazza','2025-08-10');`;

async function chain({ upto = FILE } = {}) {
  const db = await newDb();
  try {
    await db.exec(PLATFORM);
    for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.sql') && f < upto).sort()) await db.exec(read(file));
    await db.exec(SEED);
    return db;
  } catch (error) { await db.close(); throw error; }
}

const setClock = (db, iso) => db.exec(`create or replace function private.game_v2_clock() returns timestamptz
  language sql stable set search_path = '' as $$ select '${iso}'::timestamptz $$;`);
const week = (n) => new Date(Date.UTC(2026, 9, 14 + 7 * n, 10)).toISOString();
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const rows = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const start = (db, user, family, request = randomUUID()) =>
  as(db, user, 'select public.start_game_round($1::text,$2::uuid) r', [family, request]);
const startSwipe = (db, user) => as(db, user, 'select public.start_swipe_round($1::uuid) r', [randomUUID()]);
const session = (db, user, sid) => as(db, user, 'select public.get_game_session($1::uuid) r', [sid]);
const daily = (db, user) => as(db, user, 'select public.get_or_create_daily_question() r');
const setLocale = (db, user, locale) => as(db, user, 'select public.set_my_locale($1) r', [locale]);
async function playSide(db, user, sid) {
  const state = await session(db, user, sid);
  for (const item of state.items) {
    const choice = item.answer_kind === 'choice';
    await as(db, user, 'select public.save_game_session_answer($1::uuid,$2::uuid,$3::text,$4::smallint) r',
      [sid, item.id, choice ? null : `Risposta ${item.position}`, choice ? 0 : null]);
  }
  return as(db, user, 'select public.complete_game_session_side($1::uuid) r', [sid]);
}
const stored = async (db, sid) => new Map((await rows(db, `select id, question_text, options, predict_text, subject_role, context,
  source_type, source_ref, source_version, recipe_id, recipe_version from public.game_session_items where session_id = $1`, [sid])).map((r) => [r.id, r]));

// The English the server must produce, computed independently from the
// content tables: same version only, the couple's own names, English labels.
const MONTHS_IT = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function labelEn(label) {
  if (label == null) return null;
  let m = /^(\d{1,2}) ([a-z]+)$/.exec(label);
  if (m && MONTHS_IT.includes(m[2])) return `${MONTHS_EN[MONTHS_IT.indexOf(m[2])]} ${Number(m[1])}`;
  m = /^(a|ad) ([a-z]+)( \d{4})?$/.exec(label);
  if (m && MONTHS_IT.includes(m[2])) return `in ${MONTHS_EN[MONTHS_IT.indexOf(m[2])]}${m[3] || ''}`;
  return undefined;
}
const fill = (t, s) => t.replaceAll('{title}', s.title ?? '').replaceAll('{date}', s.date ?? '').replaceAll('{when}', s.when ?? '')
  .replaceAll('{previous_question}', s.previous_question ?? '');
const named = (t, subject, names) => (t == null ? null : t.replaceAll('{subject}', subject ? names[subject] : '{subject}')
  .replaceAll('{francesco}', names.francesco).replaceAll('{beatrice}', names.beatrice));
async function contentTables(db) {
  const byId = async (sql) => new Map((await rows(db, sql)).map((r) => [r.id, r]));
  return {
    catalog: await byId('select id, version, question_text_en, predict_text_en, options_en from public.game_v2_catalog'),
    swipe: await byId('select id, version, question_text_en, options_en from private.game_swipe_v1_catalog'),
    recipes: await byId('select id, version, adapter, options, question_text_en, kind_label_en, options_en from public.game_v2_recipes'),
  };
}
function expectedEn(item, t, names) {
  if (item.source_ref?.startsWith('swipe:')) {
    const c = t.swipe.get(item.source_ref.slice(6));
    return c.version === item.source_version ? { question_text: c.question_text_en, options: c.options_en, predict_text: null } : null;
  }
  if (item.source_type === 'curated') {
    const c = t.catalog.get(item.source_ref);
    if (!c || c.version !== item.recipe_version) return null;
    return { question_text: named(c.question_text_en, item.subject_role, names), options: c.options_en.map((o) => named(o, item.subject_role, names)),
      predict_text: item.subject_role ? named(c.predict_text_en, item.subject_role, names) : null };
  }
  if (item.recipe_id && item.context?.kind && item.context.kind !== 'longitudinal') {
    const r = t.recipes.get(item.recipe_id);
    if (r.version !== item.recipe_version) return null;
    const when = labelEn(item.context.when);
    const src = { title: item.context.title, when, date: when };
    return { question_text: fill(r.question_text_en, src), options: r.options_en, predict_text: null, kind_label: fill(r.kind_label_en, src), when };
  }
  return null;
}
// Checks one caller's state against the stored Italian snapshot: English when
// the caller reads English and the item has English, else the Italian as stored.
function assertLanguage(state, items, t, names, english, label) {
  let translated = 0;
  for (const item of state.items) {
    const s = items.get(item.id);
    const en = english ? expectedEn(s, t, names) : null;
    const q = en ? en.question_text : s.question_text;
    const p = en ? en.predict_text : s.predict_text;
    assert.equal(item.question_text, q, `${label} ${s.source_ref} question`);
    assert.deepEqual(item.options, en ? en.options : s.options, `${label} ${s.source_ref} options`);
    assert.equal(item.predict_text, p, `${label} ${s.source_ref} predictor`);
    assert.equal(item.my_prompt, item.my_item_role === 'predictor' ? p : q, `${label} ${s.source_ref} my prompt`);
    if (en?.kind_label) {
      assert.equal(item.context.kind_label, en.kind_label, `${label} ${s.source_ref} kind label`);
      if (en.when) assert.equal(item.context.when, en.when);
    } else assert.deepEqual(item.context, s.context, `${label} ${s.source_ref} context`);
    if (en) {
      translated += 1;
      assert.notEqual(item.question_text, s.question_text, `${label} ${s.source_ref} really changed language`);
      for (const text of [item.question_text, item.predict_text || '', ...item.options]) {
        assert.doesNotMatch(text, /\{(francesco|beatrice|subject|title|when|date)\}/, `${label}: no raw token`);
      }
    }
  }
  return translated;
}

test('set_my_locale: own row only, it|en only, idempotent, never anon, column not client-writable', { timeout: 300000 }, async () => {
  const db = await chain();
  try {
    await db.exec(LOCALE);
    assert.deepEqual(await setLocale(db, F, 'en'), { locale: 'en' });
    assert.deepEqual(await setLocale(db, F, 'en'), { locale: 'en' }, 'the same value again');
    const locales = async () => Object.fromEntries((await rows(db, 'select id, locale from public.profiles')).map((r) => [r.id, r.locale]));
    assert.deepEqual(await locales(), { [F]: 'en', [B]: null, [X]: null, [Y]: null, [S]: null }, 'only the caller row changes');
    assert.deepEqual(await setLocale(db, B, 'it'), { locale: 'it' });
    assert.deepEqual(await setLocale(db, F, 'it'), { locale: 'it' });
    for (const bad of ['fr', 'EN', 'en-US', '', ' it', null]) {
      await assert.rejects(setLocale(db, X, bad), /invalid locale/, String(bad));
    }
    assert.equal((await locales())[X], null, 'a rejected value writes nothing');
    await assert.rejects(setLocale(db, LONER, 'en'), /profile required/, 'an account without a profile');
    await assert.rejects(as(db, '', "select public.set_my_locale('en') r", [], 'anon'), /permission denied/);
    await assert.rejects(as(db, '', "select public.set_my_locale('en') r", []), /authentication required/);
    await assert.rejects(as(db, F, "update public.profiles set locale = 'en' where id = auth.uid()"), /permission denied/);
    await assert.rejects(db.query("update public.profiles set locale = 'fr' where id = $1", [F]), /profiles_locale_check/);

    for (const [sig, client, definer] of [
      ['public.set_my_locale(text)', true, true],
      ['public.title_localized(public.bond_weekly_quests)', true, true],
      ['public.question_text_localized(public.daily_question_keepsakes)', true, true],
      ['private.us_caller_locale()', false, false],
      ['private.us_profile_locale(uuid,text)', false, false],
      ['private.game_v2_item_en(public.game_session_items,uuid)', false, false],
      ['private.game_v2_label_en(text)', false, false],
      ['private.game_v2_family_pool(text)', false, false],
    ]) {
      const fn = await one(db, `select prosecdef, proconfig::text cfg, pg_get_userbyid(proowner) own,
        coalesce((select bool_or(a.grantee = 0) from aclexplode(coalesce(proacl, acldefault('f', proowner))) a where a.privilege_type = 'EXECUTE'), false) pub
        from pg_proc where oid = $1::regprocedure`, [sig]);
      assert.deepEqual(fn, { prosecdef: definer, cfg: '{"search_path=\\"\\""}', own: 'postgres', pub: false }, sig);
      for (const role of ['anon', 'authenticated', 'service_role']) {
        assert.equal((await one(db, "select has_function_privilege($1, $2::regprocedure, 'execute') r", [role, sig])).r,
          role === 'authenticated' && client, `${sig} ${role}`);
      }
    }
  } finally { await db.close(); }
});

test('language per caller: Italian unchanged, English for Daily, Game V2 with names, recipes, Swipe, quests and kept Daily', { timeout: 300000 }, async () => {
  const db = await chain();
  try {
    // Before the migration: today's Daily and two open rounds, read in Italian.
    await setClock(db, week(0));
    const before = { daily: await daily(db, F) };
    const rivivete = await start(db, F, 'rivivete');
    const swipe = await startSwipe(db, F);
    for (const [k, sid] of [['rivivete', rivivete.id], ['swipe', swipe.id]]) {
      before[k] = { [F]: await session(db, F, sid), [B]: await session(db, B, sid) };
    }
    assert.ok(before.rivivete[F].items.some((i) => i.context.kind), 'the rivivete round has context prompts');

    await db.exec(LOCALE);
    // Nobody chose a language yet: everything reads exactly as before.
    assert.deepEqual(await daily(db, F), before.daily);
    for (const k of ['rivivete', 'swipe']) for (const u of [F, B]) assert.deepEqual(await session(db, u, before[k][F].id), before[k][u], `${k} unchanged`);
    await setLocale(db, B, 'it');
    for (const k of ['rivivete', 'swipe']) assert.deepEqual(await session(db, B, before[k][F].id), before[k][B], `${k} unchanged for it`);

    // F reads English, B (same couple) reads Italian: same rows, own language.
    await setLocale(db, F, 'en');
    const t = await contentTables(db);
    const today = await daily(db, F);
    const template = await one(db, `select t.question, t.question_en from public.daily_questions q
      join public.daily_question_templates t on t.id = q.template_id where q.id = $1`, [today.id]);
    assert.deepEqual(today, { ...before.daily, question: template.question_en }, 'English Daily, same shared question');
    assert.notEqual(template.question_en, before.daily.question);
    assert.deepEqual(await daily(db, B), before.daily, 'the partner keeps the Italian of the same Daily');

    let translated = 0;
    for (const k of ['rivivete', 'swipe']) {
      const items = await stored(db, before[k][F].id);
      const en = await session(db, F, before[k][F].id);
      translated += assertLanguage(en, items, t, NAMES[C1], true, `${k} en`);
      assert.deepEqual({ ...en, items: null }, { ...before[k][F], items: null }, 'only item text changes');
      assert.deepEqual(await session(db, B, before[k][F].id), before[k][B]);
    }
    assert.ok(translated >= 13, `rounds played before the migration read in English too (${translated})`);
    const recipeItems = [...(await stored(db, rivivete.id)).values()].filter((i) => i.recipe_id && i.context.kind);
    assert.ok(recipeItems.length >= 2, 'context recipe prompts are covered');

    for (const sid of [rivivete.id, swipe.id]) { await playSide(db, F, sid); await playSide(db, B, sid); }
    const revealed = await session(db, F, rivivete.id);
    assert.ok(revealed.reveal_ready && revealed.items.every((i) => i.partner_answer_text || i.partner_answer_index !== null));

    // New rounds after the migration: names and predictor wording per caller.
    let predictions = 0;
    for (const [n, family, starter] of [[1, 'quanto_mi_conosci', B], [2, 'confrontatevi', F], [3, 'scopritevi', B]]) {
      await setClock(db, week(n));
      const round = await start(db, starter, family);
      const items = await stored(db, round.id);
      const enState = await session(db, F, round.id);
      assertLanguage(enState, items, t, NAMES[C1], true, `${family} en`);
      assertLanguage(await session(db, B, round.id), items, t, NAMES[C1], false, `${family} it`);
      for (const item of enState.items.filter((i) => i.mechanic === 'prediction')) {
        predictions += 1;
        if (item.my_item_role === 'predictor') assert.match(item.my_prompt, /\bSam\b/, 'English predictor prompt names the partner');
        assert.doesNotMatch(item.my_prompt, /\b(Francesco|Bea)\b/);
      }
      await playSide(db, F, round.id);
      await playSide(db, B, round.id);
    }
    assert.ok(predictions >= 5, `English prediction prompts (${predictions})`);

    // Another couple renders with its own names, never this couple's.
    await setLocale(db, X, 'en');
    const theirs = await start(db, X, 'quanto_mi_conosci');
    assertLanguage(await session(db, X, theirs.id), await stored(db, theirs.id), t, NAMES[C2], true, 'other couple');
    assert.doesNotMatch(JSON.stringify((await session(db, X, theirs.id)).items), /\b(Alex|Sam)\b/);
    // A partner who has not joined yet: the neutral English-safe fallback.
    await setLocale(db, S, 'en');
    const waiting = await start(db, S, 'quanto_mi_conosci');
    const waitingState = await session(db, S, waiting.id);
    assertLanguage(waitingState, await stored(db, waiting.id), t, NAMES[C3], true, 'waiting couple');
    assert.ok(waitingState.items.some((i) => i.my_item_role === 'predictor' && /\bPartner 2\b/.test(i.my_prompt)));

    // Weekly quests: Italian snapshot, translated at read time from the template.
    await as(db, F, 'select public.ensure_bond_week() r');
    const quests = (who) => as(db, who, `select q.id, q.slot, q.title, q.template_key, public.title_localized(q) shown
      from public.bond_weekly_quests q order by q.slot`);
    const titles = new Map((await rows(db, 'select key, title, title_en from public.bond_quest_templates')).map((r) => [r.key, r]));
    const mine = await quests(F);
    assert.equal(mine.length, 3);
    for (const q of mine) {
      assert.equal(q.shown, titles.get(q.template_key).title_en, q.template_key);
      assert.equal(q.title, titles.get(q.template_key).title, 'the stored title stays Italian');
    }
    for (const q of await quests(B)) assert.equal(q.shown, q.title, 'Italian partner');
    const row = (await one(db, 'select to_jsonb(q) r from public.bond_weekly_quests q where q.couple_id = $1 limit 1', [C1])).r;
    assert.equal(await as(db, X, 'select public.title_localized(jsonb_populate_record(null::public.bond_weekly_quests, $1::jsonb)) r', [row]),
      row.title, 'another couple, even English, never gets a translation of this couple');

    // Kept Daily: the answer RPC and the Ricordi read, each in the reader's language.
    await db.query(`insert into public.daily_answers(question_id, user_id, couple_id, answer) values ($1, $2, $4, 'Il mare'), ($1, $3, $4, 'La neve')`,
      [today.id, F, B, C1]);
    const kept = await as(db, F, 'select public.keep_daily_question($1::uuid) r', [today.id]);
    assert.equal(kept.status, 'kept');
    assert.equal(kept.question_text, template.question_en);
    assert.equal((await as(db, B, 'select public.keep_daily_question($1::uuid) r', [today.id])).question_text, before.daily.question);
    const ricordi = (who) => as(db, who, 'select k.question_text, public.question_text_localized(k) shown from public.daily_question_keepsakes k');
    assert.deepEqual(await ricordi(F), [{ question_text: before.daily.question, shown: template.question_en }]);
    assert.deepEqual(await ricordi(B), [{ question_text: before.daily.question, shown: before.daily.question }]);
  } finally { await db.close(); }
});

test('English context recipes: every recipe, real adapters, English dates and options; anything unknown stays Italian', { timeout: 300000 }, async () => {
  const db = await chain();
  try {
    await db.exec(LOCALE);
    await setClock(db, week(0));
    const t = await contentTables(db);
    const itemEn = async (item) => (await one(db, `select private.game_v2_item_en(jsonb_populate_record(null::public.game_session_items, $1::jsonb), $2::uuid) r`,
      [item, C1])).r;
    // Real candidates from the calendar, Da vivere and Ricordi adapters.
    const candidates = await rows(db, `select source_type, source_ref, recipe_id, recipe_version, options, question_text, context
      from private.game_v2_context_candidates($1::uuid, 'per_voi', private.game_v2_clock())`, [C1]);
    const kinds = new Set(candidates.map((c) => c.context.kind));
    for (const k of ['calendar_upcoming', 'calendar_past', 'da_vivere_idea', 'moment']) assert.ok(kinds.has(k), k);
    for (const c of candidates) {
      const want = expectedEn(c, t, NAMES[C1]);
      const got = await itemEn(c);
      assert.ok(want && got, c.recipe_id);
      assert.equal(got.question_text, want.question_text, c.recipe_id);
      assert.deepEqual(got.options, want.options, c.recipe_id);
      assert.equal(got.context.kind_label, want.kind_label, c.recipe_id);
      assert.ok(got.question_text.includes(`“${c.context.title}”`), 'the couple’s own title, untranslated');
    }
    const texts = candidates.map((c) => expectedEn(c, t, NAMES[C1]).question_text);
    assert.ok(texts.some((x) => x.includes('on October 24')), 'calendar date in English');
    assert.ok(texts.some((x) => x.includes('in July')) && texts.some((x) => x.includes('in August 2025')), 'months and years in English');

    // Every active recipe, with a synthetic item of its adapter's shape.
    for (const r of t.recipes.values()) {
      if (r.adapter === 'longitudinal') continue;
      const when = r.adapter === 'calendar_upcoming' ? '24 ottobre' : 'ad aprile 2025';
      const item = { source_type: 'calendar', recipe_id: r.id, recipe_version: r.version, options: r.options, question_text: 'x',
        context: { kind: r.adapter, title: 'Festa', when: r.adapter === 'conservati' ? null : when } };
      const got = await itemEn(item);
      const want = expectedEn(item, t, NAMES[C1]);
      assert.deepEqual(got, { question_text: want.question_text, options: want.options,
        context: { kind_label: want.kind_label, ...(want.when ? { when: want.when } : {}) } }, r.id);
      assert.equal(got.options.length, r.options.length, `${r.id} options one to one`);
      assert.doesNotMatch([got.question_text, got.context.kind_label, ...got.options].join(' | '), /\{|ottobre|aprile|Dal |Dai |Da vivere|L’avete/, r.id);
    }
    // Longitudinal resurfacing: the earlier prompt's English and an English chip.
    const prompt = await one(db, `select id, question_text, question_text_en from public.game_v2_catalog
      where active and longitudinal and mechanic = 'reciprocal' and answer_kind = 'open' order by id limit 1`);
    const longitudinal = { source_type: 'game_history', source_ref: prompt.id, recipe_id: 'longitudinal-001', recipe_version: 1,
      options: [], question_text: prompt.question_text,
      context: { kind: 'longitudinal', previous_played_at: '2026-03-20T09:00:00+00:00', captured_at: '2026-10-14T10:00:00+00:00' } };
    assert.deepEqual(await itemEn(longitudinal), { question_text: prompt.question_text_en, options: [],
      context: { kind_label: 'You already played this in March' } });
    assert.equal((await itemEn({ ...longitudinal, context: { ...longitudinal.context, previous_played_at: '2025-12-01T09:00:00+00:00' } })).context.kind_label,
      'You already played this in December 2025');

    // Unknown shapes or an older version: no English, the item stays Italian.
    const base = candidates.find((c) => c.context.kind === 'calendar_past');
    for (const odd of [{ ...base, recipe_version: base.recipe_version + 1 }, { ...base, context: { ...base.context, when: 'ieri' } },
      { ...base, recipe_id: 'nope-001' }, { ...longitudinal, question_text: 'Un’altra domanda?' },
      { source_type: 'couple_custom', source_ref: randomUUID(), options: [], question_text: 'Scritta da noi', context: {} },
      { source_type: 'curated', source_ref: 'ridete-001', recipe_id: 'ridete-001', recipe_version: 1, options: [], question_text: 'v1', context: {} },
      { source_type: 'curated', source_ref: 'swipe:swipe-003', source_version: 1, options: ['a', 'b'], question_text: 'v1', context: { swipe_v1: true } }]) {
      assert.equal(await itemEn(odd), null, JSON.stringify(odd).slice(0, 80));
    }
  } finally { await db.close(); }
});

test('E se…? inside Confrontatevi: merged pool, Confrontatevi label, old e_se requests and history keep working', { timeout: 300000 }, async () => {
  const db = await chain();
  try {
    await setClock(db, week(0));
    const legacy = await start(db, F, 'e_se');
    const legacyState = { [F]: await session(db, F, legacy.id), [B]: await session(db, B, legacy.id) };
    const catalogBefore = (await rows(db, 'select id, family, version, active from public.game_v2_catalog order by id'));
    await db.exec(LOCALE);
    assert.deepEqual(await rows(db, 'select id, family, version, active from public.game_v2_catalog order by id'), catalogBefore, 'nothing moved or deleted');
    for (const u of [F, B]) assert.deepEqual(await session(db, u, legacy.id), legacyState[u], 'an E se round of before reads as before');
    assert.ok(legacyState[F].items.every((i) => i.family === 'e_se'));
    await playSide(db, F, legacy.id);
    await playSide(db, B, legacy.id);

    await db.query(`insert into public.couple_questions(couple_id, author_role, create_request_id, question_text, answer_kind, families)
      values ($1, 'francesco', $2, 'E se domani partissimo?', 'open', '{e_se}')`, [C1, randomUUID()]);
    const candidates = (family) => rows(db, `select candidate_key, family, source_ref from private.game_v2_candidates($1::uuid, $2::text, private.game_v2_clock())`, [C1, family]);
    const conf = await candidates('confrontatevi');
    assert.equal(conf.filter((c) => /^catalog:e_se-/.test(c.candidate_key)).length, 10, 'the 10 E se prompts');
    assert.equal(conf.filter((c) => /^catalog:confrontatevi-/.test(c.candidate_key)).length, 40, 'the 40 Confrontatevi prompts');
    assert.ok(conf.some((c) => /^recipe:(calendar_upcoming-002|da_vivere_idea-00[13]):/.test(c.candidate_key)), 'E se context recipes');
    assert.ok(conf.some((c) => c.candidate_key.startsWith('custom:')), 'a couple question tagged E se');
    assert.ok(conf.every((c) => c.family === 'confrontatevi'), 'all presented as Confrontatevi');
    const byKey = (list) => [...list].sort((a, b) => a.candidate_key.localeCompare(b.candidate_key));
    assert.deepEqual(byKey(await candidates('e_se')), byKey(conf), 'an e_se request draws the same merged pool');
    const perVoi = await candidates('per_voi');
    assert.ok(perVoi.some((c) => /^catalog:e_se-/.test(c.candidate_key)) && !perVoi.some((c) => c.family === 'e_se'));
    for (const family of ['ridete', 'scopritevi', 'rivivete']) {
      assert.ok((await candidates(family)).every((c) => c.family === family && !/e_se|confrontatevi/.test(c.candidate_key)), family);
    }

    let reached = 0;
    for (let n = 1; n <= 8 && reached < 2; n += 1) {
      await setClock(db, week(n));
      const round = await start(db, n % 2 ? F : B, 'confrontatevi');
      assert.equal(round.game_family, 'confrontatevi');
      assert.ok(round.items.length >= 5 && round.items.every((i) => i.family === 'confrontatevi'));
      reached += [...(await stored(db, round.id)).values()].filter((i) => /^e_se-/.test(i.source_ref || '') || /^(calendar_upcoming-002|da_vivere_idea-00[13])$/.test(i.recipe_id || '')).length;
      await playSide(db, F, round.id);
      await playSide(db, B, round.id);
    }
    assert.ok(reached >= 2, `E se prompts reach Confrontatevi rounds (${reached})`);

    // An older app still asks for 'e_se': it gets a round from the merged pool.
    await setClock(db, week(9));
    const request = randomUUID();
    const old = await start(db, B, 'e_se', request);
    assert.equal(old.game_family, 'e_se');
    assert.equal(old.resumed, false);
    assert.ok(old.items.length >= 5 && old.items.every((i) => i.family === 'confrontatevi'));
    const again = await start(db, B, 'e_se', request);
    assert.equal(again.resumed, true);
    assert.equal(again.id, old.id);
    await assert.rejects(start(db, B, 'confrontatevi', request), /request already used/);
  } finally { await db.close(); }
});

test('re-applying changes nothing; unknown bodies or a missing content migration abort before any change', { timeout: 300000 }, async () => {
  const snapshot = async (db) => ({
    profiles: await rows(db, 'select to_jsonb(p) r from public.profiles p order by id'),
    recipes: await rows(db, 'select to_jsonb(r) r from public.game_v2_recipes r order by id'),
    functions: await rows(db, `select format('%s.%s(%s)', n.nspname, p.proname, oidvectortypes(p.proargtypes)) sig, md5(p.prosrc) body, p.proacl::text acl, p.prosecdef, p.provolatile, p.proconfig::text cfg,
        obj_description(p.oid, 'pg_proc') note
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'private') order by 1`),
    constraints: await rows(db, `select conrelid::regclass::text t, conname, pg_get_constraintdef(oid) d from pg_constraint
      where conrelid in ('public.profiles'::regclass, 'public.game_v2_recipes'::regclass) order by 1, 2`),
    columns: await rows(db, `select table_name, column_name, data_type, col_description(format('%I.%I', table_schema, table_name)::regclass, ordinal_position::int) note
      from information_schema.columns where table_schema = 'public' and table_name in ('profiles', 'game_v2_recipes', 'game_v2_catalog', 'daily_question_templates') order by 1, 2`),
  });
  const db = await chain();
  try {
    const access = async () => rows(db, `select oid::regclass::text t, relacl::text acl, relrowsecurity, relforcerowsecurity from pg_class
      where oid in ('public.profiles'::regclass, 'public.bond_weekly_quests'::regclass, 'public.daily_question_keepsakes'::regclass,
        'public.game_v2_recipes'::regclass, 'public.game_session_items'::regclass) order by 1`);
    const policies = async () => rows(db, `select tablename, policyname, cmd, roles::text, qual, with_check from pg_policies order by 1, 2`);
    const replaced = ['public.get_or_create_daily_question()', 'public.keep_daily_question(uuid)', 'public.start_game_round(text, uuid)',
      'public.start_swipe_round(uuid)', 'public.get_game_session(uuid)', 'private.m11a_session_state(uuid, uuid, text)',
      'private.daily_question_keepsake_json(daily_question_keepsakes, text)', 'private.game_v2_candidates(uuid, text, timestamp with time zone)',
      'private.game_v2_recipe_candidates(text, text, text, jsonb, timestamp with time zone)',
      'private.game_v2_ctx_longitudinal(uuid, text, timestamp with time zone)'];
    const before = { access: await access(), policies: await policies(), fns: await snapshot(db) };
    await db.exec(LOCALE);
    await setLocale(db, F, 'en');
    const after = await snapshot(db);
    await db.exec(LOCALE);
    assert.deepEqual(await snapshot(db), after, 're-applying changes nothing');
    assert.deepEqual(await access(), before.access, 'table grants and RLS unchanged');
    assert.deepEqual(await policies(), before.policies, 'policies unchanged');
    const sigs = (s) => new Map(s.functions.map((f) => [f.sig, f]));
    for (const sig of replaced) {
      const was = sigs(before.fns).get(sig);
      const now = sigs(after).get(sig);
      assert.ok(was && now, sig);
      assert.deepEqual({ ...now, body: null, provolatile: null }, { ...was, body: null, provolatile: null }, `${sig}: same grants, security and config`);
    }
  } finally { await db.close(); }

  // An unreviewed edit of a body this migration replaces aborts it untouched.
  const edited = await chain();
  try {
    const fns = fs.readFileSync(path.join(ROOT, 'supabase/baseline/30_functions.sql'), 'utf8');
    const at = fns.indexOf('CREATE OR REPLACE FUNCTION private.m11a_session_state(');
    await edited.exec(fns.slice(at, fns.indexOf('\n$function$;', at) + 12).replace("'my_role', caller_role,", "'my_role', caller_role, -- unreviewed\n"));
    const before = await snapshot(edited);
    await assert.rejects(edited.exec(LOCALE), /m11a_session_state\(uuid,uuid,text\) is not the audited version/);
    assert.deepEqual(await snapshot(edited), before);
    assert.equal((await one(edited, "select to_regprocedure('public.set_my_locale(text)') r")).r, null);
  } finally { await edited.close(); }

  // Without the content migration there is no English to serve: abort.
  const early = await chain({ upto: CONTENT_FILE });
  try {
    await assert.rejects(early.exec(LOCALE), /run 20261014220000_content_1_0 first/);
    assert.equal((await one(early, `select count(*)::int n from information_schema.columns where table_name = 'profiles' and column_name = 'locale'`)).n, 0);
  } finally { await early.close(); }
});

test('the replaced functions are the audited baseline with only the language and the merged family changed', () => {
  const fns = fs.readFileSync(path.join(ROOT, 'supabase/baseline/30_functions.sql'), 'utf8');
  const extract = (sql, head) => {
    const at = sql.indexOf(head);
    assert.ok(at >= 0, head);
    return sql.slice(at, sql.indexOf('\n$function$;', at));
  };
  const cases = [
    ['CREATE OR REPLACE FUNCTION public.get_or_create_daily_question()', [
      ['  question_theme text;\n  english_question text;\n', '  question_theme text;\n'],
      ['select t.theme, t.question_en into question_theme, english_question', 'select t.theme into question_theme'],
      [`'question', case when english_question is not null and private.us_caller_locale() = 'en'\n      then english_question else question_row.question end,`, `'question', question_row.question,`],
    ]],
    ['CREATE OR REPLACE FUNCTION private.daily_question_keepsake_json(k ', [
      ['(k public.daily_question_keepsakes,', '(k daily_question_keepsakes,'], [' STABLE\n', ' IMMUTABLE\n'],
      ["'question_text', public.question_text_localized(k),", "'question_text', k.question_text,"],
    ]],
    ['CREATE OR REPLACE FUNCTION private.m11a_session_state(', [
      ["coalesce(en.t->>'question_text', i.question_text)", 'i.question_text'], ["coalesce(en.t->'options', i.options)", 'i.options'],
      ["coalesce(en.t->>'predict_text', i.predict_text)", 'i.predict_text'],
      ["i.context || coalesce(en.t->'context', '{}'::jsonb)", 'i.context'],
      ["\n      left join lateral (select private.game_v2_item_en(i, s.couple_id) as t\n        where private.us_profile_locale(current_couple, caller_role) = 'en') en on true", ''],
    ]],
    ['CREATE OR REPLACE FUNCTION private.game_v2_candidates(', [
      ['private.game_v2_merged_family(c.family)', 'c.family'], ['c.family = any (private.game_v2_family_pool(target_family))', 'c.family = target_family'],
      ['select private.game_v2_merged_family(case when target_family = \'per_voi\' then q.families[1] else target_family end) as family',
        'select case when target_family = \'per_voi\' then q.families[1] else target_family end as family'],
      ['q.families && private.game_v2_family_pool(target_family)', 'target_family = any (q.families)'],
    ]],
    ['CREATE OR REPLACE FUNCTION private.game_v2_recipe_candidates(', [
      ['private.game_v2_merged_family(r.family)', 'r.family'], ['r.family = any (private.game_v2_family_pool(target_family))', 'r.family = target_family'],
    ]],
    ['CREATE OR REPLACE FUNCTION private.game_v2_ctx_longitudinal(', [
      ['private.game_v2_merged_family(c.family)', 'c.family'], ['c.family = any (private.game_v2_family_pool(target_family))', 'c.family = target_family'],
    ]],
  ];
  for (const [head, edits] of cases) {
    let body = extract(LOCALE, head);
    for (const [now, was] of edits) {
      assert.ok(body.includes(now), `${head}: ${now.slice(0, 50)}`);
      body = body.split(now).join(was);
    }
    assert.equal(body, extract(fns, head), head);
  }
  const code = LOCALE.replace(/--.*$/gm, '').replace(/'(?:[^']|'')*'/g, "''");
  assert.ok(!/\bdelete\s+from\b|\btruncate\b|\bdrop\s+(?:table|column|policy|schema|function)\b/i.test(code), 'nothing is dropped or deleted');
  assert.ok(!/\bpolicy\b|row level security|\bgrant\b(?! execute on function public\.(set_my_locale|title_localized|question_text_localized)\()/i.test(code),
    'the only grants are the three new client functions');
  assert.ok(!/start_game_round|start_swipe_round/.test(code), 'the round RPCs are not replaced');
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
  assert.ok(files.indexOf(FILE) > files.indexOf(CONTENT_FILE), 'runs after the content migration');
});
