// US 2.0 Security / RLS hardening — audit invariants and the SEC-01..03 fixes.
//
// Everything runs on an empty embedded PostgreSQL rebuilt from
// supabase/migrations (the F2A.2 baseline + F2C = the audited production
// state, proven by the F2A.1/F2C fingerprint tests), with two couples seeded:
// C1 = Francesco + Beatrice, C2 = a foreign couple. "base" is production
// today; "head" adds 20261004150000_sec_rls_hardening.sql.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT } = require('../scripts/supabase-baseline/evidence.cjs');
const { newDb } = require('../scripts/supabase-baseline/rebuild.cjs');
const { parsePack } = require('../scripts/supabase-baseline/queries.cjs');

const MIGRATIONS = path.join(ROOT, 'supabase/migrations');
const SEC_FILE = '20261004150000_sec_rls_hardening.sql';
const F2C_FILE = '20261004110718_f2c_edge_cron_source_of_truth.sql';
const PACK = path.join(ROOT, 'docs/us-2.0/SEC_RLS_AUDIT_READONLY.sql');
const PROD_RESULTS = path.join(ROOT, 'docs/us-2.0/SEC_RLS_AUDIT_PRODUCTION.json');
const read = (file) => fs.readFileSync(file, 'utf8');
const SEC = read(path.join(MIGRATIONS, SEC_FILE));

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const F = 'aaaaaaaa-0000-4000-8000-00000000000f';
const B = 'aaaaaaaa-0000-4000-8000-00000000000b';
const X = 'bbbbbbbb-0000-4000-8000-00000000000a'; // foreign couple, member 1
const Y = 'bbbbbbbb-0000-4000-8000-00000000000b'; // foreign couple, member 2
const LONER = 'cccccccc-0000-4000-8000-000000000000'; // email user without profile (exists in production)
const ENTRY1 = 'eeeeeeee-0000-4000-8000-000000000001';
const ENTRY2 = 'eeeeeeee-0000-4000-8000-000000000002'; // C2, shared, all-day
const DQ = 'dddddddd-0000-4000-8000-000000000001';

const SEED = `
  -- Supabase platform grants on storage.objects (RLS decides), absent from the test skeleton.
  grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
  insert into auth.users (id, email, is_anonymous) values
    ('${F}', 'f@example.test', false), ('${B}', 'b@example.test', false),
    ('${X}', 'x@example.test', false), ('${Y}', 'y@example.test', false),
    ('${LONER}', 'l@example.test', false);
  insert into public.couples (id, name) values ('${C1}', 'US.'), ('${C2}', 'Altri');
  insert into public.profiles (id, display_name, couple_id, role) values
    ('${F}', 'Francesco', '${C1}', 'francesco'), ('${B}', 'Beatrice', '${C1}', 'beatrice'),
    ('${X}', 'X', '${C2}', 'francesco'), ('${Y}', 'Y', '${C2}', 'beatrice');
  insert into public.daily_questions (id, question_date, question, category) values ('${DQ}', '2026-10-04', 'Domanda?', 'test');
  insert into public.calendar_entries (id, couple_id, entry_type, owner_id, created_by, title, is_all_day, starts_at, ends_at, start_date, end_date) values
    ('${ENTRY1}', '${C1}', 'shared', null, '${F}', 'Cena', false, '2026-10-10 19:00+00', '2026-10-10 21:00+00', null, null),
    ('${ENTRY2}', '${C2}', 'shared', null, '${X}', 'Privato C2', true, null, null, '2026-10-11', '2026-10-11');
  insert into public.moments (couple_id, created_by, storage_path, moment_date) values
    ('${C1}', '${F}', '${C1}/${F}/m1.jpg', '2026-10-01'), ('${C2}', '${X}', '${C2}/${X}/m2.jpg', '2026-10-01');
  insert into public.shared_events (couple_id, created_by, title, event_date) values
    ('${C1}', '${F}', 'Anniversario', '2026-04-21'), ('${C2}', '${X}', 'Loro', '2026-05-01');
  insert into public.daily_answers (question_id, user_id, couple_id, answer) values
    ('${DQ}', '${B}', '${C1}', 'risposta B'), ('${DQ}', '${X}', '${C2}', 'risposta X');
  insert into public.shared_messages (couple_id, sender_id, recipient_id, body) values
    ('${C1}', '${F}', '${B}', 'ciao'), ('${C2}', '${X}', '${Y}', 'segreto');
  insert into public.left_for_you (couple_id, sender_id, recipient_id, kind, body) values
    ('${C1}', '${B}', '${F}', 'text', 'per te'), ('${C2}', '${Y}', '${X}', 'text', 'per loro');
  insert into public.bucket_items (couple_id, created_by, title) values ('${C1}', '${F}', 'Idea'), ('${C2}', '${X}', 'Idea C2');
  insert into public.activity (couple_id, actor_id, type) values ('${C1}', '${F}', 'x'), ('${C2}', '${X}', 'x');
  insert into storage.objects (bucket_id, name, owner_id) values
    ('us-media', '${C1}/${F}/m1.jpg', '${F}'), ('us-media', '${C2}/${X}/m2.jpg', '${X}');
`;

async function database({ hardened }) {
  const db = await newDb();
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    // These before/after assertions describe the SEC mission's exact state.
    // Later missions test their own additions without rewriting this audit.
    if (file > SEC_FILE) continue;
    if (file === SEC_FILE && !hardened) continue;
    await db.exec(read(path.join(MIGRATIONS, file)));
  }
  await db.exec(SEED);
  return db;
}

// Runs `sql` as `uid` with `role`, in a transaction that is always rolled back.
async function as(db, uid, sql, role = 'authenticated', setup = '') {
  await db.exec('begin');
  try {
    if (setup) await db.exec(setup);
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid || '']);
    await db.exec(`set local role ${role}`);
    const res = await db.query(sql);
    return { ok: true, rows: res.rows.length || res.affectedRows || 0, data: res.rows };
  } catch (error) {
    return { ok: false, code: error.code, message: error.message };
  } finally {
    await db.exec('rollback');
  }
}

let base;
let head;
test.before(async () => {
  [base, head] = await Promise.all([database({ hardened: false }), database({ hardened: true })]);
});
test.after(async () => {
  await base?.close();
  await head?.close();
});

// ------------------------------------------------------------ migration source

test('SEC migration: follows F2C, permits later migrations, no data or function change', () => {
  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  assert.deepEqual(files.slice(0, 3), ['20261004000000_us_2_0_baseline.sql', F2C_FILE, SEC_FILE]);
  for (const later of files.slice(3)) assert.ok(later.slice(0, 14) > SEC_FILE.slice(0, 14), `${later}: strictly newer than SEC`);
  assert.ok(SEC_FILE.slice(0, 14) > F2C_FILE.slice(0, 14));
  const cutoff = JSON.parse(read(path.join(ROOT, 'supabase/baseline/MIGRATION_CUTOFF.json')));
  assert.ok(cutoff.forward_migrations.includes(SEC_FILE), 'run node scripts/build-supabase-baseline.mjs');
  const code = SEC.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n').replace(/'(?:[^']|'')*'/g, "''");
  assert.doesNotMatch(code, /\b(insert\s+into|update\s+public\.|delete\s+from|truncate)\b/i, 'no data change');
  assert.doesNotMatch(code, /create\s+(or\s+replace\s+)?function|security\s+definer|\bgrant\b/i, 'no function or grant added');
  assert.doesNotMatch(code, /cron\.|storage\.|auth\.users/i);
});

test('SEC migration: re-applying it on the hardened state changes nothing', async () => {
  const snapshot = async (db) => (await db.query(`
    select (select count(*) from pg_policy where polrelid = 'public.calendar_reminders'::regclass) as policies,
           (select pg_get_constraintdef(oid) from pg_constraint where conname = 'couples_home_photo_path_own_folder') as cons,
           (select proacl::text from pg_proc where oid = 'public.calendar_reminder_offset_valid(uuid,integer)'::regprocedure) as acl`)).rows[0];
  const before = await snapshot(head);
  await head.exec('begin');
  await head.exec(SEC);
  assert.deepEqual(await snapshot(head), before);
  await head.exec('rollback');
});

test('SEC migration: aborts without changing anything when production is not in the audited state', async () => {
  const db = await database({ hardened: false });
  await db.exec(`update public.couples set home_photo_path = '${C2}/${X}/m2.jpg' where id = '${C1}'`);
  await assert.rejects(db.exec(SEC), /home_photo_path outside the couple folder/);
  await db.exec(`update public.couples set home_photo_path = null where id = '${C1}'`);
  await db.exec('grant insert on public.calendar_reminders to authenticated');
  await assert.rejects(db.exec(SEC), /can INSERT into calendar_reminders again/);
  // Nothing was applied by the aborted runs.
  const { rows } = await db.query(`select
    (select count(*) from pg_constraint where conname = 'couples_home_photo_path_own_folder')::int as cons,
    has_function_privilege('authenticated', 'public.calendar_reminder_offset_valid(uuid,integer)', 'EXECUTE') as helper`);
  assert.deepEqual(rows[0], { cons: 0, helper: true });
  await db.close();
});

// ------------------------------------------------------------ SEC-01

test('SEC-01 home photo: before, a member can point the couple home photo at a foreign couple object', async () => {
  const foreign = `update public.couples set home_photo_path = '${C2}/${X}/m2.jpg' where id = '${C1}'`;
  const r = await as(base, F, foreign);
  assert.equal(r.ok, true);
  assert.equal(r.rows, 1, 'production accepts it; us-widget-state then signs it with the service key');
  // The signer really bypasses Storage RLS: the Edge Function uses the service key.
  const widget = read(path.join(ROOT, 'supabase/functions/us-widget-state/index.ts'));
  assert.match(widget, /admin\.storage\.from\("us-media"\)\.createSignedUrl\(couple\.home_photo_path/);
  // ...while the member cannot read that object directly (Storage RLS).
  const direct = await as(base, F, `select name from storage.objects where name = '${C2}/${X}/m2.jpg'`);
  assert.deepEqual(direct, { ok: true, rows: 0, data: [] });
});

test('SEC-01 home photo: after, only the couple own folder is accepted; legitimate edits still work', async () => {
  for (const bad of [`${C2}/${X}/m2.jpg`, `${C1}/../${C2}/${X}/m2.jpg`, 'm2.jpg', '', `https://example.test/${C1}/x.jpg`]) {
    const r = await as(head, F, `update public.couples set home_photo_path = '${bad}' where id = '${C1}'`);
    assert.equal(r.code, '23514', `${bad || '(empty)'} must be refused`);
  }
  for (const [who, sql] of [
    [B, `update public.couples set home_photo_path = '${C1}/${B}/home.jpg' where id = '${C1}'`],
    [F, `update public.couples set home_photo_path = null where id = '${C1}'`],
    [F, `update public.couples set name = 'Noi', started_on = '2026-04-21' where id = '${C1}'`],
  ]) assert.deepEqual(await as(head, who, sql), { ok: true, rows: 1, data: [] }, sql);
  // service_role is held by the same constraint.
  const svc = await as(head, null, `update public.couples set home_photo_path = '${C2}/${X}/m2.jpg' where id = '${C1}'`, 'service_role');
  assert.equal(svc.code, '23514');
});

// ------------------------------------------------------------ SEC-02

const ORACLES = [
  [`select public.calendar_reminder_recipient_in_couple('${C2}', '${X}') as v`, true],
  [`select public.calendar_reminder_offset_valid('${ENTRY2}', 10) as v`, false],
];

test('SEC-02 calendar helpers: before, any signed-in user reads foreign couple facts through them', async () => {
  for (const [sql, leaked] of ORACLES) {
    for (const who of [F, LONER]) {
      const r = await as(base, who, sql);
      assert.equal(r.ok, true, sql);
      assert.equal(r.data[0].v, leaked, `${sql} answers about couple C2`);
    }
  }
  // The same facts are invisible through RLS.
  assert.equal((await as(base, F, `select id from public.calendar_entries where id = '${ENTRY2}'`)).rows, 0);
  assert.equal((await as(base, F, `select id from public.profiles where id = '${X}'`)).rows, 0);
});

test('SEC-02 calendar helpers: after, client roles get 42501; the service_role reminder path is unchanged', async () => {
  for (const [sql] of ORACLES) {
    for (const [who, role] of [[F, 'authenticated'], [LONER, 'authenticated'], [null, 'anon']]) {
      assert.equal((await as(head, who, sql, role)).code, '42501', `${role}: ${sql}`);
    }
  }
  const insert = (recipient, entry, offset) => `insert into public.calendar_reminders (couple_id, entry_id, recipient_id, offset_minutes, requested_by)
    values ('${C1}', '${entry}', '${recipient}', ${offset}, '${F}')`;
  for (const db of [base, head]) {
    assert.deepEqual(await as(db, null, insert(B, ENTRY1, 30), 'service_role'), { ok: true, rows: 1, data: [] });
    // The CHECK constraints still do their job for the worker role.
    assert.equal((await as(db, null, insert(X, ENTRY1, 30), 'service_role')).code, '23514', 'recipient outside the couple');
    assert.equal((await as(db, null, insert(B, ENTRY2, 30), 'service_role')).code, '23514', 'all-day entry needs 1440');
    // The worker marks reminders sent (re-evaluates the CHECKs as service_role).
    const sent = await as(db, null, 'update public.calendar_reminders set sent_at = now()', 'service_role', `${insert(B, ENTRY1, 60)};`);
    assert.deepEqual(sent, { ok: true, rows: 1, data: [] }, sent.message);
  }
  // Browsers still only read their own couple reminders.
  assert.equal((await as(head, F, 'select * from public.calendar_reminders')).ok, true);
  assert.equal((await as(head, F, insert(B, ENTRY1, 30))).code, '42501');
});

// ------------------------------------------------------------ accepted: reminder INSERT tautology

test('accepted: the tautological reminder INSERT policy is not exploitable, even if the grant came back', async () => {
  const grant = 'grant insert on public.calendar_reminders to authenticated; grant execute on function public.calendar_reminder_offset_valid(uuid, integer), public.calendar_reminder_recipient_in_couple(uuid, uuid) to authenticated;';
  const insert = (entry, recipient) => `insert into public.calendar_reminders (couple_id, entry_id, recipient_id, offset_minutes, requested_by)
    values ('${C1}', '${entry}', '${recipient}', 1440, '${F}')`;
  for (const db of [base, head]) {
    // Today: refused by the missing grant (F1C).
    assert.equal((await as(db, F, insert(ENTRY2, B))).code, '42501');
    // With the grant back, the policy subqueries still run under the caller's
    // RLS: a foreign entry or a foreign recipient is invisible, so EXISTS fails.
    for (const [entry, recipient] of [[ENTRY2, B], [ENTRY1, X]]) {
      const r = await as(db, F, insert(entry, recipient), 'authenticated', grant);
      assert.equal(r.code, '42501', `${entry}/${recipient}: ${r.message}`);
    }
    // ...and an own-couple reminder would pass: the policy is wrong in text, not in effect.
    assert.deepEqual(await as(db, F, insert(ENTRY1, B).replace('1440', '30'), 'authenticated', grant), { ok: true, rows: 1, data: [] });
  }
  const policy = (await base.query(`select with_check from pg_policies where policyname = 'calendar_reminders_insert_couple'`)).rows[0].with_check;
  assert.match(policy, /p\.couple_id = p\.couple_id/);
});

// ------------------------------------------------------------ audit invariants (head)

const q = async (db, sql) => (await db.query(sql)).rows;

test('invariant: every public table has RLS; private tables are closed to client roles', async () => {
  const rows = await q(head, `select n.nspname, c.relname, c.relrowsecurity,
      has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as anon,
      has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as auth
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private') and c.relkind in ('r', 'p')`);
  assert.ok(rows.length >= 59);
  for (const r of rows) {
    if (r.nspname === 'public') assert.equal(r.relrowsecurity, true, `${r.relname} has RLS`);
    else assert.equal(r.anon || r.auth, false, `private.${r.relname} is not client-reachable`);
  }
});

test('invariant: anon executes no US function; authenticated executes exactly the reviewed RPC surface', async () => {
  const rows = await q(head, `select p.oid::regprocedure::text as f, p.prosecdef as definer, p.proconfig as cfg,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prokind = 'f'`);
  assert.deepEqual(rows.filter((r) => r.anon).map((r) => r.f), []);
  for (const r of rows.filter((x) => x.definer)) {
    assert.ok((r.cfg || []).some((c) => c.startsWith('search_path=')), `${r.f} pins search_path`);
  }
  const reviewed = [
    'ack_progression_unlock(text)', 'complete_game_session_side(uuid)', 'complete_shared_event(uuid,date)',
    'confirm_bond_quest(uuid)', 'confirm_bucket_item_lived(uuid)', 'conserve_left_for_you(uuid)',
    'create_weekly_question(uuid,text,text,jsonb,text[])', 'delete_daily_question_outcome(uuid,integer)',
    'dismiss_daily_reveal_notice(uuid)', 'ensure_bond_week()', 'equip_progression_reward(text)',
    'get_daily_reveal_meta(uuid)', 'get_daily_state(uuid)', 'get_game_session(uuid)', 'get_game_v2_home()',
    'get_notification_preferences()', 'get_or_create_daily_question()', 'get_progression_v1()',
    'get_weekly_question_state()', 'keep_daily_question(uuid)', 'link_moment_to_source(uuid,text,uuid)',
    'mark_daily_reveal_seen(uuid)', 'mark_game_session_reveal_seen(uuid)', 'mark_left_item_seen(uuid)',
    'private.confirm_bond_quest_internal(uuid)', 'private.current_couple_id()',
    'private.daily_question_reveal_ready(uuid)', 'private.ensure_bond_week_internal()',
    'private.reroll_bond_quest_internal(uuid,text)',
    'register_web_push_subscription(text,text,text,bigint,text)', 'remove_web_push_subscription(text)',
    'reroll_bond_quest(uuid,text)', 'save_daily_question_outcome(uuid,text,uuid,integer)',
    'save_game_session_answer(uuid,uuid,text,smallint)', 'send_think(uuid)', 'set_daily_answer_reaction(uuid,text)',
    'set_notification_preference(text,boolean)', 'set_think_reaction(uuid,text)', 'start_game_round(text,uuid)',
    'start_swipe_round(uuid)',
  ].sort();
  assert.deepEqual(rows.filter((r) => r.auth).map((r) => r.f).sort(), reviewed,
    'a new client-callable function needs a security review and an entry here');
});

test('invariant: policies — UPDATE has USING and WITH CHECK, no tautology, anon-reachable ones need an identity', async () => {
  const rows = await q(head, `select schemaname || '.' || tablename || '.' || policyname as p, cmd, roles::text[] as roles,
      coalesce(qual, '') as qual, coalesce(with_check, '') as chk from pg_policies where schemaname in ('public', 'storage')`);
  for (const r of rows) {
    if (r.cmd === 'UPDATE') assert.ok(r.qual && r.chk, `${r.p} has USING and WITH CHECK`);
    for (const expr of [r.qual, r.chk]) {
      for (const m of expr.matchAll(/\(([a-z_]+)\.([a-z_]+) = ([a-z_]+)\.([a-z_]+)\)/g)) {
        if (r.p === 'public.calendar_reminders.calendar_reminders_insert_couple') continue; // accepted, see above
        assert.ok(!(m[1] === m[3] && m[2] === m[4]), `${r.p}: tautology ${m[0]}`);
      }
    }
    if (r.roles.includes('public') || r.roles.includes('anon')) {
      assert.match(`${r.qual} ${r.chk}`, /auth\.uid\(\)|current_couple_id\(\)/, `${r.p} applies to anon: needs an identity`);
    }
    assert.doesNotMatch(`${r.qual} ${r.chk}`, /auth\.role\(\)|user_metadata|app_metadata|auth\.jwt\(\)/, `${r.p}: authorization from JWT claims`);
  }
  // Every SELECT policy on a couple-owned table is couple- or user-scoped.
  const scoped = await q(head, `select pol.schemaname || '.' || pol.tablename || '.' || pol.policyname as p, coalesce(pol.qual, '') as qual
    from pg_policies pol join information_schema.columns c
      on c.table_schema = pol.schemaname and c.table_name = pol.tablename and c.column_name = 'couple_id'
    where pol.schemaname = 'public' and pol.cmd in ('SELECT', 'ALL')`);
  assert.ok(scoped.length >= 25);
  for (const r of scoped) assert.match(r.qual, /current_couple_id\(\)|auth\.uid\(\)/, r.p);
});

test('invariant: auth.role() and user metadata appear only in the two documented service-side functions', async () => {
  const rows = await q(head, `select p.oid::regprocedure::text as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosrc ~* '(auth\\.role\\(\\)|user_metadata|raw_user_meta_data|raw_app_meta_data)'`);
  assert.deepEqual(rows.map((r) => r.f).sort(), ['claim_us_role(text,text)', 'get_internal_vapid_private_key()']);
  const svcOnly = await q(head, `select has_function_privilege('authenticated', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE') as client
    from unnest(array['public.claim_us_role(text,text)'::regprocedure, 'public.get_internal_vapid_private_key()'::regprocedure]) f`);
  assert.deepEqual(svcOnly.map((r) => r.client), [false, false]);
});

test('invariant: views run as the invoker; storage bucket private and couple-folder scoped', async () => {
  const views = await q(head, `select c.relname, c.reloptions, has_table_privilege('anon', c.oid, 'SELECT') as anon
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')`);
  assert.deepEqual(views.map((v) => v.relname), ['relationship_event_history']);
  for (const v of views) {
    assert.ok((v.reloptions || []).includes('security_invoker=true'), `${v.relname} is security_invoker`);
    assert.equal(v.anon, false);
  }
  assert.deepEqual(await q(head, 'select id, public from storage.buckets'), [{ id: 'us-media', public: false }]);
  const policies = await q(head, `select policyname, cmd, roles::text[] as roles, concat(qual, ' ', with_check) as expr
    from pg_policies where schemaname = 'storage' order by policyname`);
  assert.deepEqual(policies.map((p) => p.policyname), ['us_media_delete_own', 'us_media_insert_own_folder', 'us_media_select_same_couple', 'us_media_update_own']);
  for (const p of policies) {
    assert.deepEqual(p.roles, ['authenticated']);
    assert.match(p.expr, /\(storage\.foldername\(name\)\)\[1\] = \( SELECT \(private\.current_couple_id\(\)\)::text/);
  }
});

// ------------------------------------------------------------ isolation, dynamically

const COUPLE_TABLES = ['couples', 'profiles', 'calendar_entries', 'moments', 'shared_events', 'daily_answers',
  'shared_messages', 'left_for_you', 'bucket_items', 'activity'];
// Catalogs readable by every signed-in user on purpose (no couple data in them).
const SHARED_CATALOGS = ['bond_quest_templates', 'daily_questions', 'quiz_questions', 'quiz_sets'];

test('isolation: a couple never sees the foreign couple rows or media; partners keep their shared view', async () => {
  for (const db of [base, head]) {
    for (const t of COUPLE_TABLES) {
      const col = t === 'couples' ? 'id' : 'couple_id';
      for (const who of [F, B]) {
        const r = await as(db, who, `select ${col} from public.${t}`);
        assert.equal(r.ok, true, `${t}: ${r.message}`);
        assert.ok(r.data.every((row) => row[col] === C1), `${t}: ${who} sees only C1`);
      }
      const x = await as(db, X, `select ${col} from public.${t}`);
      assert.ok(x.data.every((row) => row[col] === C2), `${t}: X sees only C2`);
    }
    // Shared-couple access keeps working: both partners see the shared rows.
    for (const who of [F, B]) {
      assert.equal((await as(db, who, `select 1 from public.moments`)).rows, 1);
      assert.equal((await as(db, who, `select 1 from public.shared_events`)).rows, 1);
      assert.equal((await as(db, who, `select 1 from public.profiles`)).rows, 2);
      assert.equal((await as(db, who, `select 1 from storage.objects`)).rows, 1);
    }
    // Daily answers stay private until the reveal RPC says otherwise.
    assert.equal((await as(db, F, `select 1 from public.daily_answers`)).rows, 0);
    assert.equal((await as(db, B, `select 1 from public.daily_answers`)).rows, 1);
  }
});

test('isolation: anon and a signed-in user without profile read nothing but the shared catalogs', async () => {
  const tables = (await q(head, `select relname from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r', 'v') order by 1`)).map((r) => r.relname);
  for (const [who, role] of [[null, 'anon'], [LONER, 'authenticated']]) {
    for (const t of tables) {
      const r = await as(head, who, `select * from public.${t}`, role);
      if (!r.ok) { assert.equal(r.code, '42501', `${role} ${t}: ${r.message}`); continue; }
      if (role === 'authenticated' && SHARED_CATALOGS.includes(t)) continue;
      assert.equal(r.rows, 0, `${role} reads ${t}`);
    }
    assert.equal((await as(head, who, 'select * from storage.objects', role)).rows || 0, 0);
  }
  // The profile-less user sees today's question text (global catalog), never an answer.
  assert.equal((await as(head, LONER, 'select 1 from public.daily_questions')).rows, 1);
  assert.equal((await as(head, LONER, `select public.get_daily_state('${DQ}')`)).ok, false);
});

// ------------------------------------------------------------ production pack

const PACK_BLOCKS = parsePack(PACK, /^-- (s\d\d)\. /);

test('pack: read-only, one SELECT per block, no secret, runs on the rebuilt database', async () => {
  const text = read(PACK);
  assert.match(text, /^begin transaction read only;$/m);
  assert.match(text, /^rollback;\s*$/m);
  assert.deepEqual(Object.keys(PACK_BLOCKS), ['s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10', 's11']);
  for (const [label, sql] of Object.entries(PACK_BLOCKS)) {
    assert.match(sql, /^select /i, label);
    assert.doesNotMatch(sql, /;/, `${label} is one statement`);
    assert.doesNotMatch(sql, /\b(insert|update|delete|alter|create|drop|grant|revoke|truncate)\s/i, label);
    assert.doesNotMatch(sql, /decrypted_secret|\bsecret\b|encrypted_password|token_hash|\banswer\b|\bbody\b/i, label);
    assert.match(sql, new RegExp(`as sec_${label}_[a-z_]+`), label);
    const { rows } = await base.query(sql);
    assert.equal(rows.length, 1, label);
  }
});

const COMPARED = ['s02', 's03', 's04', 's05', 's06', 's07', 's08', 's09'];
// Production sorts text with its database collation, the rebuild with C:
// compare as sets (every array sorted), never by position.
const canonical = (v) => Array.isArray(v)
  ? v.map(canonical).sort((x, y) => (JSON.stringify(x) < JSON.stringify(y) ? -1 : 1))
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v;

test('pack vs production: the committed production run equals the audited repo state', async (t) => {
  if (!fs.existsSync(PROD_RESULTS)) {
    t.skip('docs/us-2.0/SEC_RLS_AUDIT_PRODUCTION.json not committed yet (Francesco runs the pack)');
    return;
  }
  const prod = JSON.parse(read(PROD_RESULTS)).blocks;
  const db = await newDb();
  for (const file of [fs.readdirSync(MIGRATIONS).find((f) => f.startsWith('20261004000000')), F2C_FILE]) await db.exec(read(path.join(MIGRATIONS, file)));
  for (const label of COMPARED) {
    const local = Object.values((await db.query(PACK_BLOCKS[label])).rows[0])[0];
    // Default privileges are platform-owned (the test skeleton only stands in
    // for them); production's are asserted on their own below (SEC-08).
    // The public schema ACL is platform-owned too (production also lists postgres=U).
    const strip = (v) => (label === 's08' ? { ...v, default_acl: null, schemas: v.schemas.filter((x) => x.s !== 'public') } : v);
    assert.deepEqual(canonical(strip(prod[label])), canonical(strip(local)), `${label}: production drifted from the repo`);
  }
  await db.close();
  // Data preconditions of SEC-01 and SEC-02.
  assert.equal(prod.s10.home_photo_path.outside, 0);
  assert.equal(prod.s10.calendar_reminders, 0);
  // The ledger holds exactly the baseline and F2C: SEC is the next push.
  assert.deepEqual(prod.s01.ledger.map((r) => r.v), ['20261004000000', F2C_FILE.slice(0, 14)]);
  // SEC-08 as accepted: new public functions start executable by anon (platform default).
  for (const role of ['postgres', 'supabase_admin']) {
    const f = prod.s08.default_acl.find((d) => d.role === role && d.objtype === 'f');
    assert.match(f.acl, /anon=X/, `${role} default function ACL`);
  }
  // Realtime private channels: the table exists with no policy, so every private channel is refused.
  assert.deepEqual(prod.s11, { policies: null, realtime_messages_exists: true });
});

const ADVISORS = path.join(ROOT, 'docs/us-2.0/SEC_RLS_AUDIT_ADVISORS.json');

test('advisors: the production security lints are exactly the classified ones', async (t) => {
  if (!fs.existsSync(ADVISORS)) {
    t.skip('docs/us-2.0/SEC_RLS_AUDIT_ADVISORS.json not committed yet');
    return;
  }
  const lints = Object.fromEntries(JSON.parse(read(ADVISORS)).lints.map((l) => [l.name, l]));
  assert.deepEqual(Object.keys(lints).sort(), ['auth_leaked_password_protection', 'authenticated_security_definer_function_executable', 'rls_enabled_no_policy']);
  const names = (lint) => lint.findings.map((f) => f.metadata.name).sort();
  // INFO rls_enabled_no_policy = the deny-all tables (RPC / service only).
  const noPolicy = (await q(base, `select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace
    and c.relkind = 'r' and not exists (select 1 from pg_policy p where p.polrelid = c.oid) order by 1`)).map((r) => r.relname);
  assert.deepEqual(names(lints.rls_enabled_no_policy), noPolicy);
  // WARN authenticated definer = the reviewed RPC surface in public, before SEC-02...
  const surface = async (db) => (await q(db, `select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.prosecdef and has_function_privilege('authenticated', p.oid, 'EXECUTE') order by 1`)).map((r) => r.proname);
  assert.deepEqual(names(lints.authenticated_security_definer_function_executable), await surface(base));
  // ...and SEC-02 removes exactly the two calendar helpers from it.
  const after = await surface(head);
  assert.equal(after.length, 32);
  assert.deepEqual((await surface(base)).filter((n) => !after.includes(n)), ['calendar_reminder_offset_valid', 'calendar_reminder_recipient_in_couple']);
  // WARN leaked password protection: auth config, accepted (SEC-16). No client flow sets a password.
  assert.equal(lints.auth_leaked_password_protection.count, 1);
  for (const file of fs.readdirSync(ROOT).filter((f) => f.endsWith('.js'))) {
    assert.doesNotMatch(read(path.join(ROOT, file)), /\.(updateUser|signUp|resetPasswordForEmail)\(/, `${file} sets a password`);
  }
});
