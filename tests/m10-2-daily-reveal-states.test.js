// M10.2 — canonical, per-person Daily reveal state (receipt / dismissed notice /
// reaction). Runs the REAL migration SQL against embedded Postgres (PGlite).
//
// Fixture scope mirrors m9e-daily-question-engine.test.js: production-shaped
// profiles / couples / daily_questions / daily_answers, the production reveal
// authority contract (get_daily_state, fixture only: it is production-only) and
// the two applied M3 migrations that provide private.daily_question_reveal_ready.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const MIGRATION = 'supabase/migrations_history/20260930080452_m10_2_daily_reveal_states.sql';
const M3 = ['supabase/migrations_history/20260901192817_daily_question_outcomes.sql', 'supabase/migrations_history/20260902101619_daily_question_reveal_authority.sql'];
const uuid = () => crypto.randomUUID();

const FIXTURE_SQL = `
  create role authenticated; create role anon; create role service_role;
  grant usage on schema public to authenticated, anon;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  create schema private;
  grant usage on schema private to authenticated;

  create table public.couples (id uuid primary key);
  create table public.profiles (id uuid primary key, couple_id uuid references public.couples(id), role text);
  grant select on public.profiles to authenticated;
  create function private.current_couple_id() returns uuid language sql stable security definer set search_path = '' as $$
    select p.couple_id from public.profiles p where p.id = auth.uid()
  $$;
  grant execute on function private.current_couple_id() to authenticated;

  create table public.daily_questions (
    id uuid primary key default gen_random_uuid(), question_date date not null unique, question text not null,
    category text not null default 'daily', created_at timestamptz not null default now());
  alter table public.daily_questions enable row level security;
  grant select on public.daily_questions to authenticated;
  create policy daily_questions_read on public.daily_questions for select to authenticated using (true);

  create table public.daily_answers (
    id uuid primary key default gen_random_uuid(),
    question_id uuid not null references public.daily_questions(id) on delete cascade,
    user_id uuid not null, couple_id uuid not null references public.couples(id) on delete cascade,
    answer text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    unique (question_id, user_id));
  alter table public.daily_answers enable row level security;
  grant select, insert, update on public.daily_answers to authenticated;
  create policy daily_answers_select_own on public.daily_answers for select to authenticated using (user_id = auth.uid());

  create function public.get_daily_state(target_question_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = '' as $$
  declare me uuid := auth.uid(); c uuid; mine text; partner text; answered integer;
  begin
    if me is null then raise exception 'authentication required'; end if;
    select p.couple_id into c from public.profiles p where p.id = me;
    select a.answer into mine from public.daily_answers a where a.question_id = target_question_id and a.user_id = me;
    select count(*) into answered from public.daily_answers a where a.question_id = target_question_id and a.couple_id = c;
    select a.answer into partner from public.daily_answers a where a.question_id = target_question_id and a.couple_id = c and a.user_id <> me limit 1;
    return jsonb_build_object('my_answer', mine, 'partner_has_answer', partner is not null, 'both_answered', answered >= 2,
      'partner_answer', case when answered >= 2 then partner end);
  end $$;
  grant execute on function public.get_daily_state(uuid) to authenticated;
`;

async function freshDb() {
  const db = new PGlite();
  await db.exec(FIXTURE_SQL);
  for (const f of M3) await db.exec(read(f));
  await db.exec(read(MIGRATION));
  return db;
}
async function asUser(db, uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid || ''}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
async function seed(db) {
  const c = uuid(); const f = uuid(); const b = uuid();
  const q = (await db.query(`insert into public.daily_questions (question_date, question) values ('2026-10-05', 'Domanda di test') returning id`)).rows[0].id;
  await db.exec(`insert into public.couples values ('${c}'); insert into public.profiles values ('${f}','${c}','francesco'),('${b}','${c}','beatrice');`);
  const answer = (uid, text) => db.exec(`insert into public.daily_answers (question_id, user_id, couple_id, answer) values ('${q}','${uid}','${c}','${text}')`);
  return { c, f, b, q, answer };
}
const call = (db, name, ...args) => db.query(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args).then((r) => r.rows[0].r);
const rejects = (promise, pattern) => assert.rejects(promise, pattern);

test('M10.2 receipts: nulla prima del reveal — meta vuota, seen/dismiss/reazione rifiutati', async () => {
  const db = await freshDb(); const { f, q, answer } = await seed(db);
  await answer(f, 'Mia');
  await asUser(db, f, async () => {
    assert.deepEqual(await call(db, 'get_daily_reveal_meta', q), {
      question_id: q, both_answered: false, my_reveal_seen_at: null, my_notice_dismissed_at: null, my_reaction: null, partner_reaction: null });
    await rejects(call(db, 'mark_daily_reveal_seen', q), /reveal is not ready/);
    await rejects(call(db, 'dismiss_daily_reveal_notice', q), /reveal is not ready/);
    await rejects(call(db, 'set_daily_answer_reaction', q, 'heart'), /reveal is not ready/);
  });
  assert.equal((await db.query('select count(*)::int n from public.daily_question_reveal_states')).rows[0].n, 0, 'no row written');
});

test('M10.2 receipts: auth obbligatoria, membro di coppia obbligatorio, reazione invalida rifiutata', async () => {
  const db = await freshDb(); const { f, b, q, answer } = await seed(db);
  await answer(f, 'A'); await answer(b, 'B');
  await asUser(db, null, async () => {
    for (const fn of ['get_daily_reveal_meta', 'mark_daily_reveal_seen', 'dismiss_daily_reveal_notice']) await rejects(call(db, fn, q), /authentication required|permission denied/);
  });
  const stranger = uuid();
  await db.exec(`insert into public.profiles values ('${stranger}', null, 'beatrice')`);
  await asUser(db, stranger, async () => {
    await rejects(call(db, 'get_daily_reveal_meta', q), /couple membership required/);
    await rejects(call(db, 'mark_daily_reveal_seen', q), /couple membership required/);
  });
  await asUser(db, f, async () => {
    for (const bad of ['love', '❤️', 'HEART', '', 'like']) await rejects(call(db, 'set_daily_answer_reaction', q, bad), /invalid daily reaction/);
    await rejects(call(db, 'get_daily_reveal_meta', null), /question id required/);
  });
  assert.equal((await db.query('select count(*)::int n from public.daily_question_reveal_states')).rows[0].n, 0);
});

test('M10.2 receipts: seen e dismissed restano distinti, idempotenti e personali', async () => {
  const db = await freshDb(); const { f, b, q, answer } = await seed(db);
  await answer(f, 'A'); await answer(b, 'B');

  const dismissed = await asUser(db, f, () => call(db, 'dismiss_daily_reveal_notice', q));
  assert.equal(dismissed.both_answered, true);
  assert.ok(dismissed.my_notice_dismissed_at);
  assert.equal(dismissed.my_reveal_seen_at, null, 'dismiss is NOT a read receipt');
  const again = await asUser(db, f, () => call(db, 'dismiss_daily_reveal_notice', q));
  assert.equal(again.my_notice_dismissed_at, dismissed.my_notice_dismissed_at, 'idempotent: first timestamp kept');

  // Francesco's dismiss leaves Beatrice untouched.
  const beatrice = await asUser(db, b, () => call(db, 'get_daily_reveal_meta', q));
  assert.equal(beatrice.my_notice_dismissed_at, null);
  assert.equal(beatrice.my_reveal_seen_at, null);

  const seen = await asUser(db, f, () => call(db, 'mark_daily_reveal_seen', q));
  assert.ok(seen.my_reveal_seen_at);
  assert.equal(seen.my_notice_dismissed_at, dismissed.my_notice_dismissed_at, 'seen does not rewrite dismissed');
  const seenAgain = await asUser(db, f, () => call(db, 'mark_daily_reveal_seen', q));
  assert.equal(seenAgain.my_reveal_seen_at, seen.my_reveal_seen_at, 'idempotent: first timestamp kept');

  // Beatrice opens without dismissing.
  const bSeen = await asUser(db, b, () => call(db, 'mark_daily_reveal_seen', q));
  assert.ok(bSeen.my_reveal_seen_at);
  assert.equal(bSeen.my_notice_dismissed_at, null);
  const rows = (await db.query('select actor_role, reveal_seen_at is not null seen, notice_dismissed_at is not null dismissed from public.daily_question_reveal_states order by actor_role')).rows;
  assert.deepEqual(rows, [{ actor_role: 'beatrice', seen: true, dismissed: false }, { actor_role: 'francesco', seen: true, dismissed: true }]);
});

test('M10.2 reactions: heart/angry/cry salvati, la seconda sostituisce la prima, null la toglie', async () => {
  const db = await freshDb(); const { f, b, q, answer } = await seed(db);
  await answer(f, 'A'); await answer(b, 'B');
  for (const reaction of ['heart', 'angry', 'cry']) {
    const meta = await asUser(db, f, () => call(db, 'set_daily_answer_reaction', q, reaction));
    assert.equal(meta.my_reaction, reaction);
    assert.equal(meta.partner_reaction, null, 'my reaction is never reported as the partner\'s');
  }
  const same = await asUser(db, f, () => call(db, 'set_daily_answer_reaction', q, 'cry'));
  assert.equal(same.my_reaction, 'cry', 'idempotent');
  assert.equal((await db.query('select count(*)::int n from public.daily_question_reveal_states')).rows[0].n, 1, 'one row per person and question');
  const cleared = await asUser(db, f, () => call(db, 'set_daily_answer_reaction', q, null));
  assert.equal(cleared.my_reaction, null);
  assert.equal((await db.query(`select count(*)::int n from public.daily_question_reveal_states where reaction is not null`)).rows[0].n, 0);
  assert.equal((await db.query(`select count(*)::int n from pg_constraint where conrelid = 'public.daily_question_reveal_states'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%heart%'`)).rows[0].n, 1, 'reaction stored as a code, checked by the table');
});

test('M10.2 reactions: il partner vede la reazione sulla PROPRIA risposta, non può reagire alla propria; persiste', async () => {
  const db = await freshDb(); const { f, b, q, answer } = await seed(db);
  await answer(f, 'A'); await answer(b, 'B');
  await asUser(db, f, () => call(db, 'set_daily_answer_reaction', q, 'heart'));
  const beatrice = await asUser(db, b, () => call(db, 'get_daily_reveal_meta', q));
  assert.equal(beatrice.partner_reaction, 'heart', 'Beatrice sees Francesco reacted to her answer');
  assert.equal(beatrice.my_reaction, null, 'and has not reacted herself');
  const reply = await asUser(db, b, () => call(db, 'set_daily_answer_reaction', q, 'cry'));
  assert.equal(reply.my_reaction, 'cry');
  assert.equal(reply.partner_reaction, 'heart');
  const francesco = await asUser(db, f, () => call(db, 'get_daily_reveal_meta', q));
  assert.equal(francesco.my_reaction, 'heart');
  assert.equal(francesco.partner_reaction, 'cry');
  // A fresh session (reload) reads the same server state.
  assert.deepEqual(await asUser(db, f, () => call(db, 'get_daily_reveal_meta', q)), francesco);
  // The RPC contract has no user/couple/target parameter to spoof.
  const signatures = (await db.query(`select p.proname, pg_get_function_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('get_daily_reveal_meta','mark_daily_reveal_seen','dismiss_daily_reveal_notice','set_daily_answer_reaction') order by 1`)).rows;
  assert.deepEqual(signatures.map((s) => s.args), ['target_question_id uuid', 'target_question_id uuid', 'target_question_id uuid', 'target_question_id uuid, target_reaction text']);
});

test('M10.2 isolamento: un\'altra coppia non legge né scrive; nessun client accede alla tabella', async () => {
  const db = await freshDb(); const { f, b, q, answer } = await seed(db);
  await answer(f, 'A'); await answer(b, 'B');
  await asUser(db, f, () => call(db, 'set_daily_answer_reaction', q, 'heart'));
  await asUser(db, f, () => call(db, 'dismiss_daily_reveal_notice', q));

  // A second couple answered the SAME (global) daily question.
  const c2 = uuid(); const f2 = uuid(); const b2 = uuid();
  await db.exec(`insert into public.couples values ('${c2}'); insert into public.profiles values ('${f2}','${c2}','francesco'),('${b2}','${c2}','beatrice');`);
  const other = await asUser(db, f2, () => call(db, 'get_daily_reveal_meta', q));
  assert.equal(other.both_answered, false);
  assert.deepEqual([other.my_reaction, other.partner_reaction, other.my_notice_dismissed_at], [null, null, null]);
  await asUser(db, f2, async () => {
    await rejects(call(db, 'mark_daily_reveal_seen', q), /reveal is not ready/);
    await rejects(call(db, 'set_daily_answer_reaction', q, 'angry'), /reveal is not ready/);
  });
  // Once couple 2 unlocks, its state is its own: couple 1 rows never leak.
  await db.exec(`insert into public.daily_answers (question_id, user_id, couple_id, answer) values ('${q}','${f2}','${c2}','x'),('${q}','${b2}','${c2}','y')`);
  const unlocked = await asUser(db, b2, () => call(db, 'get_daily_reveal_meta', q));
  assert.deepEqual([unlocked.both_answered, unlocked.partner_reaction, unlocked.my_notice_dismissed_at], [true, null, null]);
  await asUser(db, b2, () => call(db, 'set_daily_answer_reaction', q, 'cry'));
  const c1 = await asUser(db, f, () => call(db, 'get_daily_reveal_meta', q));
  assert.equal(c1.partner_reaction, null, 'couple 2 reaction is invisible to couple 1');
  assert.equal(c1.my_reaction, 'heart');

  // Direct table access is closed to every client role (RLS forced, no grants).
  await asUser(db, f, async () => {
    await rejects(db.query('select * from public.daily_question_reveal_states'), /permission denied/);
    await rejects(db.query(`insert into public.daily_question_reveal_states (couple_id, question_id, actor_role, reaction) values ('${c2}','${q}','francesco','heart')`), /permission denied/);
    await rejects(db.query(`update public.daily_question_reveal_states set reaction = 'cry'`), /permission denied/);
    await rejects(db.query(`delete from public.daily_question_reveal_states`), /permission denied/);
  });
  await db.exec('set role anon');
  await rejects(call(db, 'get_daily_reveal_meta', q), /permission denied/);
  await db.exec('reset role');
  const rls = (await db.query(`select relrowsecurity, relforcerowsecurity from pg_class where oid = 'public.daily_question_reveal_states'::regclass`)).rows[0];
  assert.deepEqual(rls, { relrowsecurity: true, relforcerowsecurity: true });
  assert.equal((await db.query(`select count(*)::int n from pg_policies where tablename = 'daily_question_reveal_states'`)).rows[0].n, 0);
});

test('M10.2 reveal-meta: mai testo di risposta né domanda; ownership per ruolo (nessun user_id spoofabile)', async () => {
  const db = await freshDb(); const { f, b, q, answer } = await seed(db);
  await answer(f, 'SEGRETO-F'); await answer(b, 'SEGRETO-B');
  const meta = await asUser(db, f, () => call(db, 'set_daily_answer_reaction', q, 'angry'));
  const raw = JSON.stringify(meta);
  assert.doesNotMatch(raw, /SEGRETO|Domanda di test/);
  assert.deepEqual(Object.keys(meta).sort(), ['both_answered', 'my_notice_dismissed_at', 'my_reaction', 'my_reveal_seen_at', 'partner_reaction', 'question_id']);
  const columns = (await db.query(`select column_name from information_schema.columns where table_name = 'daily_question_reveal_states' order by 1`)).rows.map((r) => r.column_name);
  assert.ok(!columns.includes('user_id') && !columns.includes('answer'));
  // Re-pair keeps the state: the profile UID changes, role and couple do not.
  const replacement = uuid();
  await db.exec(`update public.profiles set couple_id = null where id = '${f}'; insert into public.profiles values ('${replacement}', (select couple_id from public.profiles where id = '${b}'), 'francesco');
    update public.daily_answers set user_id = '${replacement}' where user_id = '${f}'; delete from public.profiles where id = '${f}';`);
  const after = await asUser(db, replacement, () => call(db, 'get_daily_reveal_meta', q));
  assert.equal(after.my_reaction, 'angry');
  assert.equal(await asUser(db, b, () => call(db, 'get_daily_reveal_meta', q)).then((m) => m.partner_reaction), 'angry');
});

test('M10.2 migrazione: additiva, nessuna modifica a migration/authority esistenti, nessuna push di reazione', () => {
  const sql = read(MIGRATION);
  const code = sql.replace(/--[^\n]*/g, '');
  assert.doesNotMatch(code, /\b(drop|truncate|alter\s+table\s+public\.(daily_questions|daily_answers|profiles|couples))\b/i);
  assert.doesNotMatch(code, /create or replace function public\.(get_daily_state|claim_us_role)/i);
  assert.doesNotMatch(code, /net\.http|send-web-push|push_event_log|push_subscriptions/i);
  assert.match(code, /private\.daily_question_reveal_ready\(target_question_id\)/, 'reveal semantics stay with get_daily_state');
  const migrations = fs.readdirSync(path.join(ROOT, 'supabase/migrations_history')).sort();
  assert.equal(migrations.filter(name => name.includes('m10_2_daily_reveal_states')).length, 1,
    'M10.2 keeps one unchanged migration as later milestones add theirs');
});
