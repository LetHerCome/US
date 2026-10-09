// US 2.0 F1B — RPC / SECURITY DEFINER grant hardening.
//
// MATRIX is the explicit function exposure manifest: every function in the
// exposed `public` schema plus every `private` function a client role can
// execute, with its production ACL before F1B (read live 2026-10-03) and the
// intended ACL after. Flags: a = anon, A = authenticated, S = service_role,
// P = PUBLIC.
//
// The tests derive their assertions from MATRIX instead of hand-writing one
// test per function:
//   - static parity: every RPC the shipped client calls is CLIENT_REQUIRED and
//     authenticated-executable; every RPC an Edge Function calls keeps
//     service_role; the migration revokes exactly the before != after rows;
//   - behaviour (pglite): each function is recreated with its production
//     signature and pre-F1B ACL, the real migration is applied, and the
//     resulting role matrix must equal MATRIX's `after` column exactly.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const F1B_MIGRATION = 'supabase/migrations_history/20261003180000_f1b_rpc_grant_hardening.sql';

const MATRIX = [
  ['private.confirm_bond_quest_internal(uuid)', '-AS-', '-AS-', 'INTERNAL_HELPER'],
  ['private.current_couple_id()', '-A--', '-A--', 'INTERNAL_HELPER'],
  ['private.daily_question_reveal_ready(uuid)', '-A--', '-A--', 'INTERNAL_HELPER'],
  ['private.ensure_bond_week_internal()', '-AS-', '-AS-', 'INTERNAL_HELPER'],
  ['private.reroll_bond_quest_internal(uuid,text)', '-AS-', '-AS-', 'INTERNAL_HELPER'],
  ['private.us_touch_updated_at()', 'aASP', '----', 'INTERNAL_HELPER'],
  ['public.ack_progression_unlock(text)', '-AS-', '-AS-', 'CLIENT_REQUIRED'],
  ['public.archive_couple_question(uuid)', '-AS-', '--S-', 'LEGACY_CANDIDATE'],
  ['public.award_relationship_milestone(uuid,date,integer,text,integer)', '--S-', '--S-', 'SERVER_REQUIRED'],
  ['public.calendar_reminder_offset_valid(uuid,integer)', '-AS-', '-AS-', 'INTERNAL_HELPER'],
  ['public.calendar_reminder_recipient_in_couple(uuid,uuid)', '-AS-', '-AS-', 'INTERNAL_HELPER'],
  ['public.claim_left_for_you_cleanup(integer)', '--S-', '--S-', 'SERVER_REQUIRED'],
  ['public.claim_us_role(text,text)', '--S-', '--S-', 'LEGACY_CANDIDATE'],
  ['public.complete_game_session_side(uuid)', '-AS-', '-AS-', 'CLIENT_REQUIRED'],
  ['public.complete_left_for_you_cleanup(uuid)', '--S-', '--S-', 'SERVER_REQUIRED'],
  ['public.complete_partner_knowledge_deck(smallint,jsonb)', 'aAS-', '--S-', 'LEGACY_CANDIDATE'],
  ['public.complete_shared_event(uuid,date)', 'aAS-', '-AS-', 'CLIENT_REQUIRED'],
  ['public.confirm_bond_quest(uuid)', '-AS-', '-AS-', 'CLIENT_REQUIRED'],
  ['public.confirm_bucket_item_lived(uuid)', '-AS-', '-AS-', 'CLIENT_REQUIRED'],
  ['public.conserve_left_for_you(uuid)', '-AS-', '-AS-', 'CLIENT_REQUIRED'],
  ['public.create_couple_question(uuid,text,text,jsonb)', '--S-', '--S-', 'LEGACY_CANDIDATE'],
  ['public.create_weekly_question(uuid,text,text,jsonb,text[])', '-AS-', '-AS-', 'CLIENT_REQUIRED'],
  ['public.delete_daily_question_outcome(uuid,integer)', '-AS-', '-AS-', 'CLIENT_REQUIRED'],
  ['public.delete_think_reaction(uuid)', '--S-', '--S-', 'LEGACY_CANDIDATE'],
  ['public.dismiss_daily_reveal_notice(uuid)', '-AS-', '-AS-', 'CLIENT_REQUIRED'],
  ['public.ensure_bond_week()', '-AS-', '-AS-', 'CLIENT_REQUIRED'],
  ['public.equip_progression_reward(text)', '-AS-', '-AS-', 'COMPATIBILITY'],
  ['public.finalize_left_for_you_cleanup(uuid)', '--S-', '--S-', 'SERVER_REQUIRED'],
  ['public.game_v2_pending_pushes()', '--S-', '--S-', 'SERVER_REQUIRED'],
  ['public.game_v2_push_for_session(uuid,uuid)', '--S-', '--S-', 'SERVER_REQUIRED'],
  ['public.game_v2_push_for_weekly(uuid,uuid)', '--S-', '--S-', 'SERVER_REQUIRED'],
  ['public.get_daily_reveal_meta(uuid)', '-AS-', '-AS-', 'CLIENT_REQUIRED'],
  ['public.get_daily_state(uuid)', '-AS-', '-AS-', 'CLIENT_REQUIRED'],
  ['public.get_game_session(uuid)', '-AS-', '-AS-', 'CLIENT_REQUIRED'],
  ['public.get_game_v2_home()', '-AS-', '-AS-', 'CLIENT_REQUIRED'],
  ['public.get_internal_calendar_reminders_cron_key()', '--S-', '--S-', 'SERVER_REQUIRED'],
  ['public.get_internal_daily_question_push_cron_key()', '--S-', '--S-', 'SERVER_REQUIRED'],
  ['public.get_internal_game_v2_push_cron_key()', '--S-', '--S-', 'SERVER_REQUIRED'],
  ['public.get_internal_left_for_you_push_cron_key()', '--S-', '--S-', 'SERVER_REQUIRED'],
  ['public.get_internal_monthiversary_cron_key()', '--S-', '--S-', 'SERVER_REQUIRED'],
  ['public.get_internal_vapid_private_key()', '--S-', '--S-', 'SERVER_REQUIRED'],
  ['public.get_notification_preferences()', 'aASP', '-AS-', 'CLIENT_REQUIRED'],
  ['public.get_or_create_daily_question()', '-AS-', '-AS-', 'CLIENT_REQUIRED'],
  ['public.get_partner_knowledge_hub()', 'aAS-', '--S-', 'LEGACY_CANDIDATE'],
  ['public.get_progression_v1()', '-AS-', '-AS-', 'CLIENT_REQUIRED'],
  ['public.get_quiz_state(uuid)', '-AS-', '--S-', 'LEGACY_CANDIDATE'],
  ['public.get_web_push_status()', '-AS-', '--S-', 'LEGACY_CANDIDATE'],
  ['public.get_weekly_game_sets()', 'aASP', '--S-', 'LEGACY_CANDIDATE'],
  ['public.get_weekly_question_state()', '-AS-', '-AS-', 'COMPATIBILITY'],
  ['public.get_weekly_quiz_sets()', 'aASP', '--S-', 'LEGACY_CANDIDATE'],
  ['public.keep_daily_question(uuid)', '-AS-', '-AS-', 'CLIENT_REQUIRED'],
  ['public.link_moment_to_source(uuid,text,uuid)', '-AS-', '-AS-', 'COMPATIBILITY'],
  ['public.list_couple_questions()', '-AS-', '--S-', 'LEGACY_CANDIDATE'],
  ['public.list_game_sessions()', '-AS-', '--S-', 'LEGACY_CANDIDATE'],
  ['public.mark_daily_reveal_seen(uuid)', '-AS-', '-AS-', 'CLIENT_REQUIRED'],
  ['public.mark_game_session_reveal_seen(uuid)', '-AS-', '-AS-', 'CLIENT_REQUIRED'],
  ['public.mark_left_item_seen(uuid)', '-AS-', '-AS-', 'CLIENT_REQUIRED'],
  ['public.register_push_token(text,text)', 'aAS-', '--S-', 'LEGACY_CANDIDATE'],
  ['public.register_web_push_subscription(text,text,text,bigint,text)', '-AS-', '-AS-', 'CLIENT_REQUIRED'],
  ['public.remove_web_push_subscription(text)', '-AS-', '-AS-', 'CLIENT_REQUIRED'],
  ['public.reroll_bond_quest(uuid,text)', '-AS-', '-AS-', 'CLIENT_REQUIRED'],
  ['public.save_daily_question_outcome(uuid,text,uuid,integer)', '-AS-', '-AS-', 'CLIENT_REQUIRED'],
  ['public.save_game_session_answer(uuid,uuid,text,smallint)', '-AS-', '-AS-', 'CLIENT_REQUIRED'],
  ['public.save_quiz_answer(uuid,smallint)', '-AS-', '--S-', 'LEGACY_CANDIDATE'],
  ['public.send_think(uuid)', '-AS-', '-AS-', 'CLIENT_REQUIRED'],
  ['public.set_daily_answer_reaction(uuid,text)', '-AS-', '-AS-', 'CLIENT_REQUIRED'],
  ['public.set_notification_preference(text,boolean)', 'aASP', '-AS-', 'CLIENT_REQUIRED'],
  ['public.set_think_reaction(uuid,text)', '-AS-', '-AS-', 'CLIENT_REQUIRED'],
  ['public.start_custom_game_session(uuid,uuid)', '--S-', '--S-', 'LEGACY_CANDIDATE'],
  ['public.start_game_round(text,uuid)', '-AS-', '-AS-', 'CLIENT_REQUIRED'],
  ['public.start_swipe_round(uuid)', '-AS-', '-AS-', 'CLIENT_REQUIRED'],
  ['public.update_couple_question(uuid,integer,text,text,jsonb)', '-AS-', '--S-', 'LEGACY_CANDIDATE'],
  ['public.widget_scriptable_exchange_internal(text,text,text,text)', '--S-', '--S-', 'SERVER_REQUIRED'],
  ['public.widget_scriptable_issue_code_internal(uuid,uuid,text,timestamp with time zone)', '--S-', '--S-', 'SERVER_REQUIRED'],
  ['public.widget_scriptable_revoke_internal(uuid)', '--S-', '--S-', 'SERVER_REQUIRED'],
  ['public.widget_send_think_internal(text,uuid)', '--S-', '--S-', 'SERVER_REQUIRED'],
].map(([signature, before, after, cls]) => ({ signature, before, after, cls, name: signature.match(/\.(\w+)\(/)[1] }));

const CLASSES = new Set(['CLIENT_REQUIRED', 'SERVER_REQUIRED', 'INTERNAL_HELPER', 'COMPATIBILITY', 'LEGACY_CANDIDATE', 'UNKNOWN']);
const ROLES = [['a', 'anon'], ['A', 'authenticated'], ['S', 'service_role'], ['P', 'f1b_public_probe']];
const byName = new Map(MATRIX.map((row) => [row.name, row]));
// V6 removes the unused frontend actions, not their historical server ACLs.
const RETIRED_DAILY_UI = new Set(['save_daily_question_outcome', 'delete_daily_question_outcome', 'set_daily_answer_reaction']);

function rpcNames(files) {
  const names = new Set();
  for (const file of files) {
    for (const m of read(file).matchAll(/\.rpc\(\s*['"`]([a-z_0-9]+)['"`]/g)) names.add(m[1]);
  }
  return names;
}

function runtimeFiles() {
  const script = read('scripts/build-cloudflare-pages.mjs');
  const list = script.match(/const RUNTIME_FILES = \[([\s\S]*?)\];/)[1];
  return [...list.matchAll(/'([^']+\.(?:js|html))'/g)].map((m) => m[1]);
}

function edgeFiles(dir = 'supabase/functions') {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...edgeFiles(rel));
    else if (/\.(ts|mjs|js)$/.test(e.name)) out.push(rel);
  }
  return out;
}

// ------------------------------------------------------------- manifest

test('F1B manifest: one row per function, valid flags and classes', () => {
  assert.equal(new Set(MATRIX.map((r) => r.signature)).size, MATRIX.length);
  for (const r of MATRIX) {
    assert.ok(CLASSES.has(r.cls), r.signature);
    assert.match(r.before, /^[a-][A-][S-][P-]$/, r.signature);
    assert.match(r.after, /^[a-][A-][S-][P-]$/, r.signature);
    assert.notEqual(r.cls, 'UNKNOWN', `${r.signature} must be classified before F1B ships`);
  }
});

test('F1B matrix: nothing in the exposed surface is executable by anon or PUBLIC', () => {
  for (const r of MATRIX) {
    assert.equal(r.after[0], '-', `${r.signature}: anon`);
    assert.equal(r.after[3], '-', `${r.signature}: PUBLIC`);
  }
});

test('F1B matrix: F1B only removes access, never adds it, and never touches service_role on public RPCs', () => {
  for (const r of MATRIX) {
    for (let i = 0; i < 4; i += 1) {
      if (r.after[i] !== '-') assert.equal(r.before[i], r.after[i], `${r.signature}: no new grant`);
    }
    if (r.signature.startsWith('public.')) assert.equal(r.after[2], r.before[2], `${r.signature}: service_role unchanged`);
  }
});

test('F1B matrix: only client-required RPCs and helpers the client path needs stay authenticated', () => {
  for (const r of MATRIX) {
    const authed = r.after[1] === 'A';
    if (r.cls === 'CLIENT_REQUIRED') assert.ok(authed, `${r.signature}: client needs it`);
    if (r.cls === 'SERVER_REQUIRED' || r.cls === 'LEGACY_CANDIDATE') assert.ok(!authed, `${r.signature}: not browser-callable`);
  }
});

// ------------------------------------------------------------- static parity

test('F1B parity: every RPC the shipped client calls is CLIENT_REQUIRED or a verified forward client RPC', async () => {
  const called = rpcNames(runtimeFiles());
  assert.ok(called.size >= 30, 'the scan sees the client RPCs');
  const added = [];
  for (const name of called) {
    const row = byName.get(name);
    if (!row) { added.push(name); continue; }
    assert.equal(row.cls, 'CLIENT_REQUIRED', name);
    assert.equal(row.after[1], 'A', `${name} must stay executable by authenticated`);
  }
  const declared = MATRIX.filter((r) => r.cls === 'CLIENT_REQUIRED').map((r) => r.name);
  for (const name of declared) {
    if (RETIRED_DAILY_UI.has(name)) assert.ok(!called.has(name), `${name}: retired Daily UI must not call it`);
    else assert.ok(called.has(name), `${name} is CLIENT_REQUIRED but the client no longer calls it`);
  }
  // Preserve F1B's historical matrix. Like later Edge RPCs below, new client
  // RPCs must exist in the real forward migrations and prove their ACLs.
  if (added.length) {
    const { newDb } = require('../scripts/supabase-baseline/rebuild.cjs');
    const db = await newDb();
    try {
      await db.exec('create role f1b_public_probe');
      for (const file of fs.readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
        await db.exec(read(`supabase/migrations/${file}`));
      }
      for (const name of added) {
        const functions = (await db.query(`select p.oid, p.oid::regprocedure::text as signature
          from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1`, [name])).rows;
        assert.ok(functions.length, `client calls ${name}, missing from F1B and forward migrations`);
        for (const fn of functions) {
          for (const role of ['anon', 'authenticated', 'f1b_public_probe']) {
            const allowed = (await db.query("select has_function_privilege($1,$2::oid,'execute') as allowed", [role, fn.oid])).rows[0].allowed;
            assert.equal(allowed, role === 'authenticated', `${fn.signature}: forward client RPC ACL (${role})`);
          }
        }
      }
    } finally { await db.close(); }
  }
});

test('F1B parity: every RPC an Edge Function calls keeps service_role', async () => {
  const files = edgeFiles();
  const called = rpcNames(files);
  // game-v2-push-core derives through `admin.rpc(fn, …)`; name those targets too.
  for (const file of files) for (const m of read(file).matchAll(/derive\(admin,\s*'([a-z_0-9]+)'/g)) called.add(m[1]);
  called.add('game_v2_pending_pushes');
  const added = [];
  for (const name of called) {
    const row = byName.get(name);
    if (row) assert.equal(row.after[2], 'S', `${name} must stay executable by service_role`);
    else added.push(name);
  }
  // F1B's captured matrix stays exact. Later RPCs must be implemented by the
  // real forward migrations and prove their ACLs, never a name allowlist.
  if (added.length) {
    const { newDb } = require('../scripts/supabase-baseline/rebuild.cjs');
    const db = await newDb();
    try {
      for (const file of fs.readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
        await db.exec(read(`supabase/migrations/${file}`));
      }
      for (const name of added) {
        const functions = (await db.query(`select p.oid, p.oid::regprocedure::text as signature
          from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1`, [name])).rows;
        assert.ok(functions.length, `edge calls ${name}, missing from both F1B and forward migrations`);
        for (const fn of functions) {
          for (const role of ['service_role', 'anon', 'authenticated']) {
            const allowed = (await db.query('select has_function_privilege($1,$2::oid,\'execute\') as allowed', [role, fn.oid])).rows[0].allowed;
            assert.equal(allowed, role === 'service_role', `${fn.signature}: later Edge RPC must be service-only (${role})`);
          }
        }
      }
    } finally { await db.close(); }
  }
});

test('F1B migration: revokes exactly the rows whose ACL changes, and nothing else', () => {
  const sql = read(F1B_MIGRATION);
  const code = sql.replace(/--.*$/gm, '').replace(/'[^']*'/g, "''");
  assert.doesNotMatch(code, /\bgrant\b|\bdrop\b|\bdelete\b|\binsert\b|\bupdate\b|\btruncate\b|\balter\b|create (or replace )?function|security definer|policy|service_role/i);
  const revoked = new Map();
  for (const m of sql.matchAll(/^revoke execute on function ([\w.]+)\(([^)]*)\) from ([\w, ]+);$/gm)) {
    const sig = `${m[1]}(${m[2].replace(/,\s*/g, ',')})`;
    assert.ok(!revoked.has(sig), `${sig} revoked twice`);
    revoked.set(sig, m[3].split(/,\s*/).sort().join(','));
  }
  const expected = MATRIX.filter((r) => r.before !== r.after);
  assert.deepEqual([...revoked.keys()].sort(), expected.map((r) => r.signature).sort());
  for (const r of expected) {
    const roles = revoked.get(r.signature).split(',');
    assert.ok(roles.includes('public') && roles.includes('anon'), `${r.signature}: public and anon`);
    assert.equal(roles.includes('authenticated'), r.after[1] === '-', `${r.signature}: authenticated revoked iff after drops it`);
  }
});

// ------------------------------------------------------------- behaviour (pglite)

const DEFAULT_ACL = new Set(['private.us_touch_updated_at()']);
const argTypes = (signature) => signature.slice(signature.indexOf('(') + 1, -1);

async function fixture() {
  const { PGlite } = require('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role; create role f1b_public_probe;
    create schema private;
    grant usage on schema public, private to anon, authenticated, service_role, f1b_public_probe;
  `);
  for (const r of MATRIX) {
    const isTrigger = r.name === 'us_touch_updated_at';
    await db.exec(isTrigger
      ? `create function ${r.signature} returns trigger language plpgsql security definer as $$ begin new.updated_at := now(); return new; end $$;`
      : `create function ${r.signature.replace(/\(.*$/, '')}(${argTypes(r.signature)}) returns void language plpgsql security definer as $$ begin end $$;`);
    // Production keeps the Postgres default ACL (owner + PUBLIC, no explicit
    // role grants) on this trigger helper: every role reaches it only via PUBLIC.
    if (DEFAULT_ACL.has(r.signature)) continue;
    await db.exec(`revoke all on function ${r.signature} from public;`);
    const grantees = ROLES.filter(([flag], i) => r.before[i] === flag && flag !== 'P').map(([, role]) => role);
    if (grantees.length) await db.exec(`grant execute on function ${r.signature} to ${grantees.join(', ')};`);
    if (r.before[3] === 'P') await db.exec(`grant execute on function ${r.signature} to public;`);
  }
  return db;
}

async function matrix(db) {
  const out = {};
  for (const r of MATRIX) {
    let flags = '';
    for (const [flag, role] of ROLES) {
      const { rows } = await db.query(`select has_function_privilege($1, $2, 'execute') as ok`, [role, r.signature]);
      flags += rows[0].ok ? flag : '-';
    }
    out[r.signature] = flags;
  }
  return out;
}

test('F1B behaviour: the real migration turns the production "before" matrix into exactly the "after" matrix', async () => {
  const db = await fixture();
  try {
    const before = await matrix(db);
    for (const r of MATRIX) assert.equal(before[r.signature], r.before, `fixture reproduces production for ${r.signature}`);

    await db.exec(read(F1B_MIGRATION));

    const after = await matrix(db);
    for (const r of MATRIX) assert.equal(after[r.signature], r.after, r.signature);

    // Idempotent: re-applying changes nothing and the self-check still passes.
    await db.exec(read(F1B_MIGRATION));
    assert.deepEqual(await matrix(db), after);
  } finally {
    await db.close();
  }
});

test('F1B behaviour: authenticated can call client RPCs and is refused retired ones; anon is refused both', async () => {
  const db = await fixture();
  try {
    await db.exec(read(F1B_MIGRATION));
    const call = (r) => {
      const args = argTypes(r.signature).split(',').filter(Boolean).map((t) => `null::${t}`).join(', ');
      return `select ${r.signature.replace(/\(.*$/, '')}(${args})`;
    };
    const client = MATRIX.filter((r) => r.cls === 'CLIENT_REQUIRED');
    const closed = MATRIX.filter((r) => r.after[1] === '-' && r.name !== 'us_touch_updated_at');
    await db.exec('set role authenticated');
    for (const r of client) await db.query(call(r));
    for (const r of closed) await assert.rejects(db.query(call(r)), /permission denied for function/, r.signature);
    await db.exec('reset role; set role anon');
    for (const r of [...client, ...closed]) await assert.rejects(db.query(call(r)), /permission denied for function/, r.signature);
    await db.exec('reset role');
  } finally {
    await db.close();
  }
});

test('F1B behaviour: the trigger helper still fires for authenticated and service_role writes', async () => {
  const db = await fixture();
  try {
    await db.exec(read(F1B_MIGRATION));
    await db.exec(`
      create table public.f1b_touch (id int primary key, note text, updated_at timestamptz);
      grant select, insert, update on public.f1b_touch to authenticated, service_role;
      create trigger f1b_touch_updated before insert or update on public.f1b_touch
        for each row execute function private.us_touch_updated_at();
    `);
    for (const [i, role] of [[1, 'authenticated'], [2, 'service_role']]) {
      await db.exec(`set role ${role}`);
      await db.query('insert into public.f1b_touch (id, note) values ($1, $2)', [i, 'x']);
      await db.query('update public.f1b_touch set note = $2 where id = $1', [i, 'y']);
      const { rows } = await db.query('select updated_at from public.f1b_touch where id = $1', [i]);
      assert.ok(rows[0].updated_at, `${role}: trigger ran`);
      await db.exec('reset role');
    }
  } finally {
    await db.close();
  }
});

test('F1B migration self-check aborts if a retired RPC is still client-executable', async () => {
  const db = await fixture();
  try {
    const sql = read(F1B_MIGRATION);
    await assert.rejects(db.exec(sql.slice(sql.indexOf('do $$'))), /F1B: .* (must be authenticated-only|is still executable by a client role)/);
  } finally {
    await db.close();
  }
});
