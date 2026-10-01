// M12B.4 — Daily Question → Conserva (Living Archive).
// Real repo SQL on embedded Postgres (pglite): the Da vivere migrations, the
// M11A.1 locked actor, the three applied M12B.3 migrations, then the M12B.4
// migration, over production-shaped stand-ins for the Daily authority
// (tests/helpers/m12b-4-daily-fixture.js), moments and Eventi. Concurrent
// keeps run on a real server in m12b-4-daily-question-keepsakes-race.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const { EVENTS_FIXTURE, M12B3 } = require('./helpers/m12b-3-events-fixture');
const { DAILY_FIXTURE, M12B4 } = require('./helpers/m12b-4-daily-fixture');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const DA_VIVERE = ['20260929121350_m7a_da_vivere_bucket_items_domain', '20260929190126_m7c_da_vivere_calendar_unschedule',
  '20260929190145_m7d_da_vivere_reciprocal_lived', '20260930225935_m12b_2_da_vivere_archived_link_release']
  .map((n) => `supabase/migrations/${n}.sql`);
const M11A1 = 'supabase/migrations/20260930121312_m11a_1_game_rpc_readonly_actor.sql';
const uuid = () => crypto.randomUUID();
const ACTOR_LOCKED = read(M11A1).match(/create function private\.m11a_actor_locked\(\)[\s\S]*?\$\$;\n/)[0];

const BASE_FIXTURE = `
  create role authenticated; create role anon;
  grant usage on schema public to authenticated, anon;
  create schema auth;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  create schema private;
  create table public.couples (id uuid primary key);
  create table public.profiles (id uuid primary key, couple_id uuid not null references public.couples(id), role text);
  grant select on public.profiles to authenticated;
  create table public.calendar_entries (
    id uuid primary key default gen_random_uuid(), couple_id uuid not null,
    entry_type text not null check (entry_type in ('personal', 'shared')), created_by uuid,
    title text not null default 'Evento', starts_at timestamptz, start_date date
  );
  alter table public.calendar_entries enable row level security;
  create policy calendar_entries_all on public.calendar_entries for all
    using (couple_id = (select p.couple_id from public.profiles p where p.id = auth.uid()))
    with check (couple_id = (select p.couple_id from public.profiles p where p.id = auth.uid()));
  grant select, insert, update, delete on public.calendar_entries to authenticated;
  create table public.bucket_items (
    id uuid primary key default gen_random_uuid(), couple_id uuid not null, created_by uuid not null,
    title text not null, completed boolean not null default false, completed_at timestamptz,
    created_at timestamptz not null default now()
  );
  alter table public.bucket_items enable row level security;
  create policy bucket_items_all on public.bucket_items for all
    using (couple_id = (select p.couple_id from public.profiles p where p.id = auth.uid()))
    with check (couple_id = (select p.couple_id from public.profiles p where p.id = auth.uid()));
  grant select, insert, update, delete on public.bucket_items to authenticated;
  create table public.moments (
    id uuid primary key default gen_random_uuid(),
    couple_id uuid not null references public.couples(id) on delete cascade,
    created_by uuid not null references public.profiles(id) on delete cascade,
    storage_path text not null unique, caption text,
    moment_date date not null default current_date, created_at timestamptz not null default now()
  );
  alter table public.moments enable row level security;
  create policy moments_select_same_couple on public.moments for select to authenticated using (couple_id = (select p.couple_id from public.profiles p where p.id = auth.uid()));
  create policy moments_insert_own on public.moments for insert to authenticated with check (created_by = auth.uid());
  grant select, insert on public.moments to authenticated;
`;

// Catalog fingerprint of everything M12B.3 owns: must be identical before and
// after M12B.4 is applied.
const M12B3_FINGERPRINT = `
  select coalesce(string_agg(x, E'\\n' order by x), '') as f from (
    select 'con ' || conname || ' ' || pg_get_constraintdef(oid) as x from pg_constraint where conrelid = 'public.living_provenance'::regclass
    union all select 'fn ' || p.oid::regprocedure::text || ' ' || md5(pg_get_functiondef(p.oid)) from pg_proc p
      where p.oid in ('public.link_moment_to_source(uuid,text,uuid)'::regprocedure, 'private.living_provenance_guard_update()'::regprocedure,
        'private.shared_event_completions_title_snapshot()'::regprocedure)
    union all select 'view ' || md5(pg_get_viewdef('public.relationship_event_history'::regclass))
    union all select 'pol ' || polname || ' ' || pg_get_expr(polqual, polrelid) from pg_policy where polrelid = 'public.living_provenance'::regclass
    union all select 'trg ' || tgname from pg_trigger where tgrelid in ('public.living_provenance'::regclass, 'public.shared_event_completions'::regclass) and not tgisinternal
  ) s`;

let db;
let fingerprintBefore;
let legacyQuestion; // a fully answered Daily that exists before M12B.4 is applied
test.before(async () => {
  db = new PGlite();
  await db.exec(BASE_FIXTURE);
  for (const f of DA_VIVERE) await db.exec(read(f));
  await db.exec(EVENTS_FIXTURE);
  await db.exec(ACTOR_LOCKED);
  await db.exec(read(M12B3.provenance));
  await db.exec(read(M12B3.history));
  await db.exec(DAILY_FIXTURE);
  fingerprintBefore = (await db.query(M12B3_FINGERPRINT)).rows[0].f;
  legacyQuestion = await question('2026-09-20', 'Domanda di ieri');
  const p = await couple();
  legacyQuestion.couple = p;
  await answer(p.f, legacyQuestion.id, 'Vecchia F'); await answer(p.b, legacyQuestion.id, 'Vecchia B');
  await su();
  await db.exec(read(M12B4));
});
test.after(async () => { await db.close(); });

async function as(uid) {
  await db.exec('set role authenticated');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid || '']);
}
async function su() {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
}
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const code = (c) => (e) => e.code === c;
let day = 0;
async function question(date, text = 'Quale momento nostro rivivresti identico?') {
  await su();
  const d = date || new Date(Date.UTC(2026, 9, 1 + (day++))).toISOString().slice(0, 10);
  return (await q('insert into public.daily_questions (question_date, question) values ($1, $2) returning id, question_date, question', [d, text]))[0];
}
async function couple() {
  const c = uuid(); const f = uuid(); const b = uuid();
  await su();
  await q('insert into public.couples (id) values ($1)', [c]);
  await q(`insert into public.profiles (id, couple_id, role) values ($1, $3, 'francesco'), ($2, $3, 'beatrice')`, [f, b, c]);
  return { c, f, b };
}
async function answer(uid, questionId, text) {
  await as(uid);
  await q(`insert into public.daily_answers (question_id, user_id, couple_id, answer) values ($1, $2, private.current_couple_id(), $3)
    on conflict (question_id, user_id) do update set answer = excluded.answer, updated_at = now()`, [questionId, uid, text]);
}
async function keep(uid, questionId) {
  await as(uid);
  return (await q('select public.keep_daily_question($1) as r', [questionId]))[0].r;
}
const keepsakes = async (where = 'true', params = []) => { await su(); return q(`select * from public.daily_question_keepsakes where ${where}`, params); };
async function revealed() {
  const p = await couple(); const dq = await question();
  await answer(p.f, dq.id, 'Il mare a Sperlonga'); await answer(p.b, dq.id, 'La prima cena da noi');
  return { ...p, dq };
}

test('A — refused before the reveal: nobody, then only one partner answered', async () => {
  const p = await couple(); const dq = await question();
  await assert.rejects(keep(p.f, dq.id), (e) => e.code === '42501' && /daily_question_reveal_not_ready/.test(e.message));
  await answer(p.f, dq.id, 'Solo io');
  await assert.rejects(keep(p.f, dq.id), /daily_question_reveal_not_ready/);
  await assert.rejects(keep(p.b, dq.id), /daily_question_reveal_not_ready/, 'the partner who did not answer cannot keep either');
  assert.equal((await keepsakes('couple_id = $1', [p.c])).length, 0, 'nothing written');
});

test('B — auth, couple membership and arguments are enforced; unknown question is not found', async () => {
  const p = await revealed();
  await assert.rejects(keep(null, p.dq.id), /authentication required/);
  await assert.rejects(keep(uuid(), p.dq.id), /couple membership required/, 'a user without a couple profile');
  await assert.rejects(keep(p.f, null), code('22004'));
  await assert.rejects(keep(p.f, uuid()), (e) => e.code === 'P0002' && /daily_question_not_found/.test(e.message));
  await as(null);
  await assert.rejects(q('select public.keep_daily_question($1)', [p.dq.id]), /authentication required/);
  await su();
  const grants = await q(`select has_function_privilege('anon', 'public.keep_daily_question(uuid)', 'execute') as anon,
    has_function_privilege('authenticated', 'public.keep_daily_question(uuid)', 'execute') as auth`);
  assert.deepEqual(grants[0], { anon: false, auth: true });
});

test('C — a revealed Daily is kept once, with its canonical source and a server-side snapshot', async () => {
  const p = await revealed();
  await su();
  const answers = await q('select user_id, created_at from public.daily_answers where question_id = $1', [p.dq.id]);
  const r = await keep(p.b, p.dq.id);
  assert.equal(r.status, 'kept');
  assert.equal(r.source_key, `daily_question:${p.dq.id}`);
  assert.equal(r.kept_by_role, 'beatrice');
  assert.equal(r.question_text, 'Quale momento nostro rivivresti identico?');
  assert.equal(r.question_date, p.dq.question_date.toISOString().slice(0, 10));
  for (const key of ['francesco_answer', 'beatrice_answer', 'my_answer', 'partner_answer']) assert.ok(!(key in r), `no answer text in the RPC result (${key})`);
  const [row] = await keepsakes('id = $1', [r.id]);
  assert.equal(row.couple_id, p.c);
  assert.equal(row.question_id, p.dq.id);
  assert.equal(row.source_kind, 'daily_question');
  assert.equal(row.francesco_answer, 'Il mare a Sperlonga', 'mapped to roles, not to the keeper');
  assert.equal(row.beatrice_answer, 'La prima cena da noi');
  const latest = Math.max(...answers.map((a) => a.created_at.getTime()));
  assert.equal(row.revealed_at.getTime(), latest, 'revealed_at = when the second answer arrived');
  assert.ok(row.kept_at >= row.revealed_at);
});

test('D — keeping again (retry, double tap, the partner) returns the same experience, never a duplicate', async () => {
  const p = await revealed();
  const first = await keep(p.f, p.dq.id);
  const again = await keep(p.f, p.dq.id);
  const partner = await keep(p.b, p.dq.id);
  assert.equal(first.status, 'kept');
  assert.equal(again.status, 'existing'); assert.equal(partner.status, 'existing');
  assert.equal(again.id, first.id); assert.equal(partner.id, first.id);
  assert.equal(partner.kept_by_role, 'francesco', 'the first keeper stays recorded');
  assert.equal((await keepsakes('couple_id = $1', [p.c])).length, 1);
  await su();
  await assert.rejects(q(`insert into public.daily_question_keepsakes (couple_id, question_id, question_text, question_date,
    francesco_answer, beatrice_answer, revealed_at, kept_by_role) select couple_id, question_id, 'x', question_date, 'a', 'b', now(), 'beatrice'
    from public.daily_question_keepsakes where id = $1`, [first.id]), code('23505'), 'unique per couple + question even for the owner');
});

test('E — completed is not archived: answering both never creates a keepsake by itself', async () => {
  const p = await revealed();
  await answer(p.f, p.dq.id, 'Ho cambiato idea');
  assert.equal((await keepsakes('couple_id = $1', [p.c])).length, 0);
  assert.equal((await keepsakes('couple_id = $1', [legacyQuestion.couple.c])).length, 0, 'no backfill of Dailies answered before M12B.4');
  await su();
  const triggers = await q(`select tgname from pg_trigger where tgrelid in ('public.daily_answers'::regclass, 'public.daily_questions'::regclass) and not tgisinternal`);
  assert.deepEqual(triggers, []);
});

test('F — the snapshot is stable: later edits of the question or of an answer never rewrite it', async () => {
  const p = await revealed();
  const r = await keep(p.f, p.dq.id);
  const [before] = await keepsakes('id = $1', [r.id]);
  await su();
  await q(`update public.daily_questions set question = 'Testo riscritto' where id = $1`, [p.dq.id]);
  await answer(p.b, p.dq.id, 'Risposta modificata dopo il reveal');
  const [after] = await keepsakes('id = $1', [r.id]);
  assert.deepEqual(after, before);
  assert.equal((await keep(p.b, p.dq.id)).question_text, 'Quale momento nostro rivivresti identico?');
  await su();
  await assert.rejects(q(`update public.daily_question_keepsakes set beatrice_answer = 'x' where id = $1`, [r.id]), /daily_question_keepsake_immutable/);
  await as(p.f);
  await assert.rejects(q(`update public.daily_question_keepsakes set question_text = 'x' where id = $1`, [r.id]), /permission denied/);
  await assert.rejects(q(`delete from public.daily_question_keepsakes where id = $1`, [r.id]), /permission denied/);
  await assert.rejects(q(`insert into public.daily_question_keepsakes (couple_id, question_id, question_text, question_date, francesco_answer, beatrice_answer, revealed_at, kept_by_role)
    values ($1, $2, 'x', '2026-01-01', 'a', 'b', now(), 'francesco')`, [p.c, p.dq.id]), /permission denied/);
  await su();
  await assert.rejects(q('delete from public.daily_questions where id = $1', [p.dq.id]), code('23001'), 'a kept question cannot vanish under its keepsake');
});

test('G — couple boundary: another couple can neither keep, read nor infer this couple\'s Daily', async () => {
  const p = await revealed();
  const other = await couple();
  // Same global question of the day, the other couple has not answered.
  await assert.rejects(keep(other.f, p.dq.id), /daily_question_reveal_not_ready/);
  const mine = await keep(p.f, p.dq.id);
  await as(other.b);
  assert.deepEqual(await q('select * from public.daily_question_keepsakes'), [], 'RLS hides the other couple');
  assert.deepEqual(await q('select * from public.daily_question_keepsakes where id = $1', [mine.id]), []);
  await assert.rejects(keep(other.b, p.dq.id), /daily_question_reveal_not_ready/, 'still refused after the first couple kept it');
  // Once the other couple answers too, it keeps ITS OWN experience.
  await answer(other.f, p.dq.id, 'Altra F'); await answer(other.b, p.dq.id, 'Altra B');
  const theirs = await keep(other.b, p.dq.id);
  assert.equal(theirs.status, 'kept');
  assert.notEqual(theirs.id, mine.id);
  assert.equal(theirs.source_key, mine.source_key, 'same canonical source, unique per couple');
  await as(other.f);
  const visible = await q('select couple_id, francesco_answer, beatrice_answer from public.daily_question_keepsakes');
  assert.deepEqual(visible, [{ couple_id: other.c, francesco_answer: 'Altra F', beatrice_answer: 'Altra B' }]);
  await as(p.b);
  const ours = await q('select couple_id, francesco_answer, beatrice_answer from public.daily_question_keepsakes');
  assert.deepEqual(ours, [{ couple_id: p.c, francesco_answer: 'Il mare a Sperlonga', beatrice_answer: 'La prima cena da noi' }]);
  await su(); await db.exec('set role anon');
  await assert.rejects(q('select * from public.daily_question_keepsakes'), /permission denied/, 'anon reads nothing');
  await su();
});

test('H — the reveal authority stays the only gate and the browser still reads only its own answer', async () => {
  const p = await couple(); const dq = await question();
  await answer(p.f, dq.id, 'Segreta');
  await as(p.b);
  assert.deepEqual(await q('select answer from public.daily_answers where question_id = $1', [dq.id]), [], 'partner row hidden by RLS');
  const state = (await q('select public.get_daily_state($1) as s', [dq.id]))[0].s;
  assert.equal(state.partner_answer, null);
  await assert.rejects(keep(p.b, dq.id), /daily_question_reveal_not_ready/);
  await su();
  const body = (await q(`select pg_get_functiondef('public.keep_daily_question(uuid)'::regprocedure) as d`))[0].d;
  assert.ok(body.indexOf('public.get_daily_state(target_question_id)') < body.indexOf('from public.daily_answers'),
    'the only daily_answers read (timestamps) comes after the reveal gate');
  assert.doesNotMatch(body, /a\.answer\b/, 'answer text comes only from get_daily_state');
});

test('I — the kept Daily is queryable afterwards by both partners (state restored after a reload)', async () => {
  const p = await revealed();
  const r = await keep(p.f, p.dq.id);
  for (const uid of [p.f, p.b]) {
    await as(uid);
    const rows = await q('select id, source_key, question_text, question_date, kept_by_role from public.daily_question_keepsakes where question_id = $1', [p.dq.id]);
    assert.equal(rows.length, 1); assert.equal(rows[0].id, r.id); assert.equal(rows[0].kept_by_role, 'francesco');
  }
});

test('J — M12B.3 is untouched: same catalog, both source kinds still link, Daily is not a provenance kind', async () => {
  await su();
  assert.equal((await q(M12B3_FINGERPRINT))[0].f, fingerprintBefore);
  const p = await couple();
  await as(p.f);
  const ev = (await q(`insert into public.shared_events (couple_id, created_by, title, event_date) values ($1, $2, 'Weekend Roma', '2026-05-16') returning id`, [p.c, p.f]))[0].id;
  const done = (await q('select public.complete_shared_event($1, $2) as r', [ev, '2026-05-16']))[0].r.id;
  const moment = async () => (await q('insert into public.moments (couple_id, created_by, storage_path, caption) values ($1, $2, $3, $4) returning id',
    [p.c, p.f, `couple/${p.c}/${uuid()}.jpg`, 'Foto']))[0].id;
  const m1 = await moment();
  assert.equal((await q(`select public.link_moment_to_source($1, 'shared_event_completion', $2) as r`, [m1, done]))[0].r.status, 'linked');
  assert.equal((await q(`select public.link_moment_to_source($1, 'shared_event_completion', $2) as r`, [m1, done]))[0].r.status, 'existing');
  const item = (await q('insert into public.bucket_items (couple_id, created_by, title) values ($1, $2, $3) returning id', [p.c, p.f, 'Cena al lago']))[0].id;
  const entry = (await q(`insert into public.calendar_entries (couple_id, entry_type, created_by, title, start_date) values ($1, 'shared', $2, 'Cena al lago', '2026-08-15') returning id`, [p.c, p.f]))[0].id;
  await q(`update public.bucket_items set status = 'scheduled', calendar_entry_id = $2 where id = $1`, [item, entry]);
  await as(p.b); await q('select public.confirm_bucket_item_lived($1)', [item]);
  await as(p.f); await q('select public.confirm_bucket_item_lived($1)', [item]);
  const m2 = await moment();
  assert.equal((await q(`select public.link_moment_to_source($1, 'da_vivere', $2) as r`, [m2, item]))[0].r.source_key, `da_vivere:${item}`);
  const m3 = await moment();
  await assert.rejects(q(`select public.link_moment_to_source($1, 'daily_question', $2)`, [m3, legacyQuestion.id]), /living_provenance_unsupported_source_kind/);
  const hist = await q('select source_key, moment_id from public.relationship_event_history');
  assert.deepEqual(hist, [{ source_key: `shared_event_completion:${done}`, moment_id: m1 }]);
});

test('K — static: additive, versioned after M12B.3, ledger-declared, no Game V2 or Daily authority change', () => {
  const sql = read(M12B4);
  const file = path.basename(M12B4);
  const versions = fs.readdirSync(path.join(ROOT, 'supabase/migrations')).map((f) => f.slice(0, 14)).sort();
  assert.ok(versions.includes(file.slice(0, 14)), 'M12B.4 migration remains in the ledger');
  assert.equal(versions.filter((v) => v === file.slice(0, 14)).length, 1, 'M12B.4 migration is unique');
  assert.ok(file.slice(0, 14) > '20260930233506');
  assert.match(sql, /Applied to production/);
  const code = sql.replace(/--.*$/gm, '');
  assert.doesNotMatch(code, /living_provenance|relationship_event_history|game_v2|moments\b/i, 'no M12B.3 / Game V2 / moments object is touched');
  assert.doesNotMatch(code, /function public\.get_daily_state|alter table public\.daily_(answers|questions)|create trigger [\s\S]*? on public\.daily_(answers|questions)/i);
  assert.doesNotMatch(code, /\bdrop\b|\btruncate\b|delete from|update public\./i, 'additive only');
  assert.doesNotMatch(code, /cron\.schedule|net\.http/i, 'no automatic archiving, no network');
  for (const [header, name] of code.matchAll(/create (?:or replace )?function ([\w.]+)\([\s\S]*?\)\s*returns[\s\S]*?(?=as \$\$)/g)) {
    assert.match(header, /set search_path = ''/, `${name} pins search_path`);
  }
  assert.match(code, /revoke all on function public\.keep_daily_question\(uuid\) from public, anon, authenticated;/);
  assert.match(code, /force row level security/);
});
