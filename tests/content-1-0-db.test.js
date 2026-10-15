// US 1.0 content migration on a real Postgres (PGlite): the repository chain
// up to the content migration, a couple with game history, then the content
// migration (twice). Counts, nothing deleted, idempotency, next rounds still
// start, and role tokens render with the couple's own names. Nothing here
// touches a real Supabase project.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { newDb } = require('../scripts/supabase-baseline/rebuild.cjs');
const { PLATFORM, as } = require('./helpers/mc2-db');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'supabase/migrations');
const FILE = '20261014220000_content_1_0.sql';
const read = (file) => fs.readFileSync(path.join(DIR, file), 'utf8');
const CONTENT = read(FILE);
const RETIRED = ['swipe-004', 'swipe-016', 'swipe-019', 'swipe-029', 'swipe-030'];
const uid = (n) => `cccccccc-0000-4000-8000-${String(n).padStart(12, '0')}`;
const C1 = uid(101), C2 = uid(102), C3 = uid(103);
const F = uid(1), B = uid(2), X = uid(3), Y = uid(4), S = uid(5);
const TABLES = {
  'public.game_v2_catalog': 'id', 'private.game_swipe_v1_catalog': 'id', 'public.daily_question_templates': 'id',
  'public.game_v2_recipes': 'id', 'public.bond_quest_templates': 'key',
};
const SEED = `
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
  ('${F}','f@example.test',now(),false),('${B}','b@example.test',now(),false),('${X}','x@example.test',now(),false),
  ('${Y}','y@example.test',now(),false),('${S}','s@example.test',now(),false);
insert into public.couples(id,name,started_on) values ('${C1}','Noi','2026-01-01'),('${C2}','Altri','2026-02-01'),('${C3}','In attesa','2026-03-01');
insert into public.profiles(id,display_name,couple_id,role) values
  ('${F}','Alex','${C1}','francesco'),('${B}','Sam','${C1}','beatrice'),
  ('${X}','Noa','${C2}','francesco'),('${Y}','Rin','${C2}','beatrice'),
  ('${S}','Ale','${C3}','francesco');`;

async function beforeContent() {
  const db = await newDb();
  try {
    await db.exec(PLATFORM);
    for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.sql') && f < FILE).sort()) await db.exec(read(file));
    await db.exec(SEED);
    return db;
  } catch (error) { await db.close(); throw error; }
}

const setClock = (db, iso) => db.exec(`create or replace function private.game_v2_clock() returns timestamptz
  language sql stable set search_path = '' as $$ select '${iso}'::timestamptz $$;`);
// One round per week keeps the weekly allowance out of the way.
const week = (n) => new Date(Date.UTC(2026, 8, 29 + 7 * n, 10)).toISOString();
const start = (db, user, family) => as(db, user, 'select public.start_game_round($1::text,$2::uuid) r', [family, randomUUID()]);
const startSwipe = (db, user) => as(db, user, 'select public.start_swipe_round($1::uuid) r', [randomUUID()]);
const session = (db, user, sid) => as(db, user, 'select public.get_game_session($1::uuid) r', [sid]);
async function playSide(db, user, sid) {
  const state = await session(db, user, sid);
  for (const item of state.items) {
    const choice = item.answer_kind === 'choice';
    await as(db, user, 'select public.save_game_session_answer($1::uuid,$2::uuid,$3::text,$4::smallint) r',
      [sid, item.id, choice ? null : `Risposta ${item.position}`, choice ? 0 : null]);
  }
  return as(db, user, 'select public.complete_game_session_side($1::uuid) r', [sid]);
}
const items = async (db, sid) => (await db.query(`select position, source_ref, question_text, options, predict_text, subject_role, fingerprint
  from public.game_session_items where session_id = $1 order by position`, [sid])).rows;
const rows = async (db, table) => (await db.query(`select to_jsonb(t) r from ${table} t order by t.${TABLES[table]}`)).rows.map((x) => x.r);
const snapshot = async (db) => Object.fromEntries(await Promise.all(Object.keys(TABLES).map(async (t) => [t, await rows(db, t)])));
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const render = async (db, template, subject, couple) =>
  (await one(db, 'select private.game_v2_render($1, $2, $3::uuid) r', [template, subject, couple])).r;

async function accessState(db) {
  const tables = Object.keys(TABLES).map((t) => `'${t}'::regclass`).join(', ');
  return {
    tables: (await db.query(`select oid::regclass::text t, relacl::text acl, relrowsecurity, relforcerowsecurity
      from pg_class where oid in (${tables}) order by 1`)).rows,
    policies: (await db.query(`select schemaname, tablename, policyname, cmd, roles::text, qual, with_check from pg_policies
      where schemaname || '.' || tablename in (${Object.keys(TABLES).map((t) => `'${t}'`).join(', ')}) order by 1, 2, 3`)).rows,
    start: await one(db, `select proacl::text acl, prosecdef, proconfig::text cfg from pg_proc where oid = 'public.start_game_round(text,uuid)'::regprocedure`),
  };
}

test('content 1.0 migration: counts, nothing deleted, fixes versioned, retired kept, English everywhere, idempotent', { timeout: 300000 }, async () => {
  const db = await beforeContent();
  try {
    const before = await snapshot(db);
    const access = await accessState(db);
    assert.deepEqual(Object.values(before).map((r) => r.length), [62, 32, 182, 13, 33]);

    await db.exec(CONTENT);
    const after = await snapshot(db);
    assert.deepEqual(Object.values(after).map((r) => r.length), [212, 72, 182, 13, 33]);
    for (const [table, key] of Object.entries(TABLES)) {
      const kept = new Set(after[table].map((r) => r[key]));
      for (const row of before[table]) assert.ok(kept.has(row[key]), `${table} ${row[key]} is kept`);
    }
    const swipe = after['private.game_swipe_v1_catalog'];
    assert.deepEqual(swipe.filter((r) => !r.active).map((r) => r.id), RETIRED);
    assert.ok(after['public.game_v2_catalog'].every((r) => r.active));
    const version = (table, id) => after[table].find((r) => (r.id || r.key) === id).version;
    for (const id of ['ridete-001', 'ridete-003', 'ridete-005', 'ridete-008', 'confrontatevi-002', 'confrontatevi-008', 'e_se-006', 'rivivete-007']) {
      assert.equal(version('public.game_v2_catalog', id), 2, id);
    }
    assert.equal(version('public.game_v2_catalog', 'ridete-002'), 1);
    assert.equal(version('private.game_swipe_v1_catalog', 'swipe-003'), 2);
    assert.equal(version('private.game_swipe_v1_catalog', 'swipe-001'), 1);
    assert.equal(version('public.game_v2_recipes', 'calendar_past-002'), 2);
    assert.match(after['public.game_v2_recipes'].find((r) => r.id === 'calendar_past-002').question_text, /che non mi hai mai raccontato\?$/);
    assert.equal(after['public.bond_quest_templates'].find((r) => r.key === 'far-playlist').title, 'Createvi a vicenda una playlist di 5 canzoni.');
    assert.equal(after['public.daily_question_templates'].find((r) => r.id === 'gioco-15').question, 'Chi di noi resisterebbe di più su un’isola deserta, e perché?');

    for (const r of after['public.game_v2_catalog']) {
      assert.ok(r.question_text_en && Array.isArray(r.options_en) && r.options_en.length === r.options.length, r.id);
      assert.equal(r.predict_text_en === null, r.predict_text === null, r.id);
    }
    for (const r of swipe) assert.equal(Boolean(r.question_text_en && r.options_en), r.active, r.id);
    assert.ok(after['public.daily_question_templates'].every((r) => r.question_en));
    assert.ok(after['public.game_v2_recipes'].every((r) => r.question_text_en));
    assert.ok(after['public.bond_quest_templates'].every((r) => r.title_en));

    await db.exec(CONTENT);
    assert.deepEqual(await snapshot(db), after, 're-applying changes nothing (no second version bump, no new rows)');
    assert.deepEqual(await accessState(db), access, 'RLS, policies and grants are exactly as before');
  } finally { await db.close(); }
});

test('content 1.0 migration: an active couple keeps its history and its next rounds start with real names', { timeout: 300000 }, async () => {
  const db = await beforeContent();
  try {
    await setClock(db, week(0));
    const played = await start(db, F, 'ridete');
    await playSide(db, F, played.id);
    await playSide(db, B, played.id);
    await setClock(db, week(1));
    const open = await start(db, B, 'scopritevi');
    await playSide(db, B, open.id);
    const history = (await db.query('select to_jsonb(i) r from public.game_session_items i order by session_id, position')).rows;

    await db.exec(CONTENT);
    assert.deepEqual((await db.query('select to_jsonb(i) r from public.game_session_items i order by session_id, position')).rows, history,
      'items of earlier rounds are never rewritten');
    const done = await playSide(db, F, open.id);
    assert.equal(done.reveal_ready, true, 'the round open across the migration completes');

    const catalog = new Map((await db.query('select id, options from public.game_v2_catalog')).rows.map((r) => [r.id, r.options]));
    const swipeIds = new Set();
    let named = 0;
    let whoWould = 0;
    const families = ['quanto_mi_conosci', 'ridete', 'confrontatevi', 'rivivete', 'scopritevi', 'e_se'];
    for (const [i, family] of families.entries()) {
      await setClock(db, week(2 + i));
      const round = await start(db, i % 2 ? B : F, family);
      assert.equal(round.resumed, false, family);
      const got = await items(db, round.id);
      assert.ok(got.length >= 5, `${family} has a full round`);
      for (const item of got) {
        const texts = [item.question_text, item.predict_text || '', ...item.options];
        for (const t of texts) {
          assert.doesNotMatch(t, /\{(francesco|beatrice|subject)\}/, `${family}: no raw role token`);
          assert.doesNotMatch(t, /\b(Francesco|Bea|Noa|Rin)\b/, `${family}: never a hardcoded or foreign name`);
        }
        if (item.subject_role) {
          assert.match(item.predict_text, item.subject_role === 'francesco' ? /\bAlex\b/ : /\bSam\b/, 'subject named');
          named += 1;
        }
        (catalog.get(item.source_ref) || []).forEach((o, k) => {
          if (o === '{francesco}') { assert.equal(item.options[k], 'Alex'); whoWould += 1; }
          if (o === '{beatrice}') assert.equal(item.options[k], 'Sam');
        });
      }
      await playSide(db, F, round.id);
      await playSide(db, B, round.id);
    }
    for (let i = 0; i < 4; i += 1) {
      await setClock(db, week(10 + i));
      const round = await startSwipe(db, F);
      const got = await items(db, round.id);
      assert.equal(got.length, 8);
      for (const item of got) {
        const id = item.source_ref.replace(/^swipe:/, '');
        assert.ok(!RETIRED.includes(id), `${id} is retired`);
        swipeIds.add(id);
      }
      await playSide(db, F, round.id);
      await playSide(db, B, round.id);
    }
    assert.ok(named >= 5 && whoWould >= 1, `names rendered (${named} subjects, ${whoWould} who-would choices)`);
    assert.ok([...swipeIds].some((id) => Number(id.slice(6)) >= 33), 'new Swipe cards reach the couple');

    // Another couple renders with its own names only.
    await setClock(db, week(2));
    const theirs = await items(db, (await start(db, X, 'quanto_mi_conosci')).id);
    for (const item of theirs) {
      assert.match(item.predict_text, item.subject_role === 'francesco' ? /\bNoa\b/ : /\bRin\b/);
      assert.doesNotMatch([item.question_text, item.predict_text, ...item.options].join(' '), /\b(Alex|Sam)\b/);
    }
    // A partner who has not joined yet: neutral fallback, the round still starts.
    const waiting = await items(db, (await start(db, S, 'quanto_mi_conosci')).id);
    for (const item of waiting) assert.match(item.predict_text, item.subject_role === 'francesco' ? /\bAle\b/ : /\bPartner 2\b/);
  } finally { await db.close(); }
});

test('content 1.0 names: rendered from profiles of the given couple only, with safe fallbacks', { timeout: 300000 }, async () => {
  const db = await beforeContent();
  try {
    await db.exec(CONTENT);
    const tpl = '{francesco}|{beatrice}|{subject}';
    assert.equal(await render(db, tpl, 'beatrice', C1), 'Alex|Sam|Sam');
    assert.equal(await render(db, tpl, 'francesco', C2), 'Noa|Rin|Noa');
    assert.equal(await render(db, tpl, 'beatrice', C3), 'Ale|Partner 2|Partner 2', 'missing partner');
    assert.equal(await render(db, tpl, null, C1), 'Alex|Sam|{subject}', 'no subject keeps its token, as before');
    assert.equal(await render(db, tpl, 'beatrice', null), 'Partner 1|Partner 2|Partner 2');
    assert.equal(await render(db, tpl, 'beatrice', uid(999)), 'Partner 1|Partner 2|Partner 2', 'unknown couple reads nothing');
    assert.equal(await render(db, null, 'beatrice', C1), null, 'no predictor text stays null');
    assert.deepEqual((await one(db, `select private.game_v2_render_options('["{francesco}","{beatrice}","Noi due"]'::jsonb, null, $1::uuid) r`, [C1])).r,
      ['Alex', 'Sam', 'Noi due']);
    await db.query("update public.profiles set display_name = $2 where id = $1", [B, '  alex ']);
    assert.equal(await render(db, tpl, 'francesco', C1), 'Alex 1|alex 2|Alex 1', 'equal names stay distinguishable');
    await db.query("update public.profiles set display_name = $2 where id = $1", [B, '   ']);
    assert.equal(await render(db, tpl, 'beatrice', C1), 'Alex|Partner 2|Partner 2', 'blank name falls back');
    await db.query("update public.profiles set display_name = $2 where id = $1", [B, 'S'.repeat(60)]);
    assert.equal((await render(db, '{beatrice}', null, C1)).length, 40, 'names are bounded');

    for (const sig of ['private.game_v2_render(text,text)', 'private.game_v2_render_options(jsonb,text)', 'private.game_v2_role_label(text)']) {
      assert.equal((await one(db, 'select to_regprocedure($1) r', [sig])).r, null, `${sig} is gone`);
    }
    for (const sig of ['private.game_v2_role_label(uuid,text)', 'private.game_v2_render(text,text,uuid)', 'private.game_v2_render_options(jsonb,text,uuid)']) {
      const fn = await one(db, `select prosecdef, provolatile, proconfig::text cfg from pg_proc where oid = $1::regprocedure`, [sig]);
      assert.deepEqual(fn, { prosecdef: false, provolatile: 's', cfg: '{"search_path=\\"\\""}' }, sig);
      for (const role of ['public', 'anon', 'authenticated', 'service_role']) {
        const ok = role === 'public'
          ? (await one(db, `select coalesce(bool_or(a.grantee = 0), false) r from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid = $1::regprocedure and a.privilege_type = 'EXECUTE'`, [sig])).r
          : (await one(db, "select has_function_privilege($1, $2::regprocedure, 'execute') r", [role, sig])).r;
        assert.equal(ok, false, `${sig} not executable by ${role}`);
      }
    }
    const body = (await one(db, "select prosrc from pg_proc where oid = 'public.start_game_round(text,uuid)'::regprocedure")).prosrc;
    assert.equal(body.match(/, actor\.caller_couple\)/g).length, 3, 'every render call passes the caller couple');
    const hardcoded = (await db.query(`select p.oid::regprocedure::text f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private') and p.proname like 'game_v2%' and p.prosrc ~ '''(Francesco|Bea)'''`)).rows;
    assert.deepEqual(hardcoded, [], 'no game function hardcodes a partner name');
  } finally { await db.close(); }
});

test('content 1.0 grants: English follows the Italian column, readable only where it was, never client-writable', { timeout: 300000 }, async () => {
  const db = await beforeContent();
  try {
    await db.exec(CONTENT);
    const columns = [
      ['public.game_v2_catalog', 'question_text', 'question_text_en'], ['public.game_v2_catalog', 'options', 'options_en'],
      ['public.game_v2_catalog', 'predict_text', 'predict_text_en'], ['private.game_swipe_v1_catalog', 'question_text', 'question_text_en'],
      ['private.game_swipe_v1_catalog', 'options', 'options_en'], ['public.daily_question_templates', 'question', 'question_en'],
      ['public.game_v2_recipes', 'question_text', 'question_text_en'], ['public.bond_quest_templates', 'title', 'title_en'],
    ];
    for (const [table, it, en] of columns) {
      for (const role of ['anon', 'authenticated']) {
        for (const priv of ['SELECT', 'INSERT', 'UPDATE']) {
          const q = "select has_column_privilege($1, $2::regclass, $3, $4) r";
          const italian = (await one(db, q, [role, table, it, priv])).r;
          assert.equal((await one(db, q, [role, table, en, priv])).r, italian, `${role} ${priv} ${table}.${en} like ${it}`);
          if (priv !== 'SELECT') assert.equal(italian, false, `${role} cannot ${priv} ${table}`);
        }
      }
    }
    const quests = await as(db, F, 'select key, title, title_en from public.bond_quest_templates order by key');
    assert.equal(quests.length, 33);
    assert.ok(quests.every((q) => q.title_en));
    await assert.rejects(as(db, F, 'select question_text_en from public.game_v2_catalog limit 1'), /permission denied/);
    await assert.rejects(as(db, F, "update public.bond_quest_templates set title_en = 'x'"), /permission denied/);
  } finally { await db.close(); }
});

test('content 1.0 preflight: an unknown start_game_round aborts the migration before any change', { timeout: 300000 }, async () => {
  const db = await beforeContent();
  try {
    const fns = fs.readFileSync(path.join(ROOT, 'supabase/baseline/30_functions.sql'), 'utf8');
    const at = fns.indexOf('CREATE OR REPLACE FUNCTION public.start_game_round(target_family text, request_id uuid)');
    const edited = fns.slice(at, fns.indexOf('\n$function$;', at) + '\n$function$;'.length)
      .replace('begin\n  select * into actor', 'begin\n  -- an unreviewed production edit\n  select * into actor');
    await db.exec(edited);
    const before = await snapshot(db);
    await assert.rejects(db.exec(CONTENT), /start_game_round is not the audited version/);
    assert.deepEqual(await snapshot(db), before);
    assert.equal((await one(db, `select count(*)::int n from information_schema.columns
      where table_schema = 'public' and table_name = 'game_v2_catalog' and column_name = 'question_text_en'`)).n, 0);
    assert.notEqual((await one(db, "select to_regprocedure('private.game_v2_render(text,text)') r")).r, null, 'old helpers untouched');
  } finally { await db.close(); }
});

test('content 1.0: start_game_round is the baseline function with only the three render calls changed', () => {
  const fns = fs.readFileSync(path.join(ROOT, 'supabase/baseline/30_functions.sql'), 'utf8');
  const extract = (sql) => {
    const at = sql.indexOf('CREATE OR REPLACE FUNCTION public.start_game_round(target_family text, request_id uuid)');
    return sql.slice(at, sql.indexOf('\n$function$;', at));
  };
  const migrated = extract(CONTENT);
  assert.ok(migrated.length > 1000);
  assert.equal(migrated.replace(/, subject, actor\.caller_couple\)/g, ', subject)'), extract(fns));
});
