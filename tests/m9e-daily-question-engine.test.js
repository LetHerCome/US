// M9E — permanent Daily Question engine, backend behavior.
// Runs the REAL migration SQL against an embedded Postgres (@electric-sql/pglite).
//
// Fixture scope: daily_questions / daily_answers / profiles / couples with the
// columns, constraints and RLS read from production (docs/milestones/
// us-vnext-m3-daily-question.md §10). get_daily_state is production-only (not in
// the repo); the fixture reproduces its documented contract so the tests can
// prove a materialized question plugs into the unchanged answer/reveal flow.
// The two M3 migrations (outcomes + reveal authority) are applied as-is.
// Concurrency across real sessions lives in m9e-daily-question-concurrency.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
const M9E = 'supabase/migrations/20260930045233_m9e_daily_question_engine.sql';
const M3 = ['supabase/migrations/20260901192817_daily_question_outcomes.sql', 'supabase/migrations/20260902101619_daily_question_reveal_authority.sql'];
const uuid = () => crypto.randomUUID();
const THEMES = ['noi_adesso', 'scoprirsi', 'ricordi', 'desideri', 'vicinanza', 'gioco', 'profonda'];

const FIXTURE_SQL = `
  create role authenticated; create role anon;
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
    id uuid primary key default gen_random_uuid(),
    question_date date not null unique,
    question text not null,
    category text not null default 'daily',
    created_at timestamptz not null default now()
  );
  alter table public.daily_questions enable row level security;
  grant select on public.daily_questions to authenticated;
  create policy daily_questions_read on public.daily_questions for select to authenticated using (true);

  create table public.daily_answers (
    id uuid primary key default gen_random_uuid(),
    question_id uuid not null references public.daily_questions(id) on delete cascade,
    user_id uuid not null,
    couple_id uuid not null references public.couples(id) on delete cascade,
    answer text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (question_id, user_id)
  );
  alter table public.daily_answers enable row level security;
  grant select, insert, update on public.daily_answers to authenticated;
  create policy daily_answers_select_own on public.daily_answers for select to authenticated using (user_id = auth.uid());
  create policy daily_answers_insert_own on public.daily_answers for insert to authenticated
    with check (user_id = auth.uid() and couple_id = private.current_couple_id());
  create policy daily_answers_update_own on public.daily_answers for update to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid() and couple_id = private.current_couple_id());

  -- Documented contract of the production reveal authority (fixture only).
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

// 31 historical rows seeded before M9E: 2026-08-18 .. 2026-09-17.
const HISTORY_START = '2026-08-18';
function historySql() {
  const rows = [];
  for (let i = 0; i < 31; i += 1) {
    const d = new Date(`${HISTORY_START}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    // Day 0 (a Tuesday) reuses, verbatim, the text of scoprirsi-01.
    const text = i === 0 ? 'Qual è il tuo modo preferito di passare una mattina senza impegni?' : `Domanda storica ${iso}`;
    rows.push(`('${iso}', '${text}', 'daily')`);
  }
  return `insert into public.daily_questions (question_date, question, category) values ${rows.join(',')};`;
}

async function freshDb({ history = true } = {}) {
  const db = new PGlite();
  await db.exec(FIXTURE_SQL);
  if (history) await db.exec(historySql());
  const before = history ? await snapshotHistory(db) : null;
  await db.exec(read(M9E));
  for (const f of M3) await db.exec(read(f));
  return { db, before };
}
const snapshotHistory = async (db) => (await db.query(`
  select md5(string_agg(id::text || '|' || question_date || '|' || question || '|' || category || '|' || created_at, ',' order by question_date)) as h, count(*)::int as n
    from public.daily_questions where question_date between '2026-08-18' and '2026-09-17'`)).rows[0];
const materialize = async (db, iso) => (await db.query(`select (private.materialize_daily_question('${iso}'::date)).*`)).rows[0];
const themeOf = async (db, templateId) => (await db.query('select theme, weekday_slot, sequence from public.daily_question_templates where id = $1', [templateId])).rows[0];
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const isoDate = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v));
async function asUser(db, uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid || ''}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
async function couple(db) {
  const c = uuid(); const f = uuid(); const b = uuid();
  await db.exec(`insert into public.couples values ('${c}'); insert into public.profiles values ('${f}','${c}','francesco'),('${b}','${c}','beatrice');`);
  return { c, f, b };
}
const romeToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const rpc = (db) => db.query('select public.get_or_create_daily_question() as q').then((r) => r.rows[0].q);

test('M9E: oggi senza riga pre-esistente → il RPC materializza una sola istanza', async () => {
  const { db } = await freshDb();
  const { f } = await couple(db);
  const today = romeToday();
  assert.equal((await db.query(`select count(*)::int n from public.daily_questions where question_date = $1`, [today])).rows[0].n, 0);
  const q = await asUser(db, f, () => rpc(db));
  assert.equal(q.question_date, today);
  assert.equal(q.day_timezone, 'Europe/Rome');
  assert.ok(q.id && q.question);
  const iso = new Date(`${today}T12:00:00Z`).getUTCDay() || 7;
  assert.equal(q.theme, THEMES[iso - 1]);
  const rows = (await db.query(`select id, template_id, category from public.daily_questions where question_date = $1`, [today])).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, q.id);
  assert.match(rows[0].template_id, new RegExp(`^${q.theme}-\\d{2}$`));
  assert.equal(rows[0].category, 'daily', 'category keeps the existing default');
});

test('M9E: seconda chiamata nello stesso giorno (anche dal partner) → stesso question ID, nessuna nuova riga', async () => {
  const { db } = await freshDb();
  const { f, b } = await couple(db);
  const first = await asUser(db, f, () => rpc(db));
  const again = await asUser(db, f, () => rpc(db));
  const partner = await asUser(db, b, () => rpc(db));
  assert.equal(again.id, first.id);
  assert.equal(partner.id, first.id);
  assert.equal(partner.question, first.question);
  assert.equal((await db.query('select count(*)::int n from public.daily_questions where template_id is not null')).rows[0].n, 1);
  // A day that already has a row (seeded or earlier materialized) is returned as-is.
  const hist = await materialize(db, '2026-09-01');
  assert.equal(hist.question, 'Domanda storica 2026-09-01');
  assert.equal(hist.template_id, null);
});

test('M9E: giorno dopo → istanza diversa; ogni weekday usa la sua famiglia tematica', async () => {
  const { db } = await freshDb();
  const monday = '2026-10-05';
  const seen = [];
  for (let i = 0; i < 14; i += 1) {
    const iso = addDays(monday, i);
    const row = await materialize(db, iso);
    const t = await themeOf(db, row.template_id);
    assert.equal(isoDate(row.question_date), iso);
    assert.equal(t.theme, THEMES[i % 7], `${iso} → ${THEMES[i % 7]}`);
    assert.equal(t.weekday_slot, (i % 7) + 1);
    seen.push(row);
  }
  assert.notEqual(seen[0].id, seen[1].id);
  assert.notEqual(seen[0].template_id, seen[1].template_id);
  assert.equal(new Set(seen.map((r) => r.id)).size, 14);
  // Second week advances the editorial sequence of every family.
  assert.equal((await themeOf(db, seen[0].template_id)).sequence + 1, (await themeOf(db, seen[7].template_id)).sequence);
});

test('M9E: nessun template si ripete prima di aver esaurito il ciclo di 26 settimane (182 giorni)', async () => {
  const { db } = await freshDb({ history: false });
  const start = '2026-10-01'; // a Thursday: the cycle need not start on Monday
  const ids = [];
  for (let i = 0; i < 182; i += 1) ids.push((await materialize(db, addDays(start, i))).template_id);
  assert.equal(new Set(ids).size, 182, 'all 182 distinct');
  const bank = (await db.query('select count(*)::int n from public.daily_question_templates where active')).rows[0].n;
  assert.equal(bank, 182);
  // Day 183 reopens the family with its least recently used template.
  const next = await materialize(db, addDays(start, 182));
  assert.equal(next.template_id, ids[0]);
  // Order inside a family is the editorial sequence.
  const thursdays = ids.filter((id) => id.startsWith('desideri-'));
  assert.deepEqual(thursdays, Array.from({ length: 26 }, (_, i) => `desideri-${String(i + 1).padStart(2, '0')}`));
});

test('M9E: le righe storiche restano identiche e il loro testo non viene riproposto subito', async () => {
  const { db, before } = await freshDb();
  assert.equal(before.n, 31);
  assert.deepEqual(await snapshotHistory(db), before, 'migration leaves history byte-identical');
  assert.equal((await db.query('select count(*)::int n from public.daily_questions where template_id is not null')).rows[0].n, 0, 'no backfill');
  const tuesday = await materialize(db, '2026-09-29');
  assert.equal(tuesday.template_id, 'scoprirsi-02', 'scoprirsi-01 was already asked verbatim on 2026-08-18');
  for (let i = 0; i < 40; i += 1) await materialize(db, addDays('2026-09-18', i));
  assert.deepEqual(await snapshotHistory(db), before, 'materialization never touches history');
  const migration = read(M9E);
  assert.doesNotMatch(migration, /update\s+public\.daily_questions|delete\s+from\s+public\.daily_questions|truncate/i);
});

test('M9E: risposte e reveal esistenti funzionano sulla domanda materializzata; il partner resta nascosto finché entrambi non rispondono', async () => {
  const { db } = await freshDb();
  const { c, f, b } = await couple(db);
  const q = await asUser(db, f, () => rpc(db));
  const answer = (uid, text) => asUser(db, uid, () => db.query('insert into public.daily_answers (question_id, user_id, couple_id, answer) values ($1,$2,$3,$4)', [q.id, uid, c, text]));
  const state = (uid) => asUser(db, uid, () => db.query('select public.get_daily_state($1) s', [q.id]).then((r) => r.rows[0].s));

  await answer(f, 'RISPOSTA-F');
  const sb1 = await state(b);
  assert.equal(sb1.partner_has_answer, true);
  assert.equal(sb1.both_answered, false);
  assert.equal(sb1.partner_answer, null, 'partner answer hidden before both answered');
  const rawB = await asUser(db, b, () => db.query('select answer from public.daily_answers where question_id = $1', [q.id]));
  assert.equal(rawB.rows.length, 0, 'RLS: B cannot read F answer directly');

  await answer(b, 'RISPOSTA-B');
  const sf = await state(f);
  assert.equal(sf.both_answered, true);
  assert.equal(sf.partner_answer, 'RISPOSTA-B');
  // M3 outcome authority still works on top of the materialized question.
  const saved = await asUser(db, f, () => db.query('select public.save_daily_question_outcome($1, $2, $3) r', [q.id, 'Bello scoprirlo', uuid()]).then((r) => r.rows[0].r));
  assert.equal(saved.status, 'saved');
  // The engine never read or wrote answers: a new call returns the same row.
  assert.equal((await asUser(db, b, () => rpc(db))).id, q.id);
  assert.equal((await db.query('select count(*)::int n from public.daily_answers')).rows[0].n, 2);
});

test('M9E: il giorno canonico è Europe/Rome — confini di mezzanotte, ora legale e solare', async () => {
  const { db } = await freshDb({ history: false });
  const day = async (ts) => isoDate((await db.query(`select private.daily_question_day('${ts}'::timestamptz) d`)).rows[0].d);
  // Summer (CEST, UTC+2): midnight Rome = 22:00Z.
  assert.equal(await day('2026-09-30 21:59:59.999+00'), '2026-09-30');
  assert.equal(await day('2026-09-30 22:00:00+00'), '2026-10-01');
  // Winter (CET, UTC+1): midnight Rome = 23:00Z.
  assert.equal(await day('2026-12-31 22:59:59+00'), '2026-12-31');
  assert.equal(await day('2026-12-31 23:00:00+00'), '2027-01-01');
  // DST end (2026-10-25) and start (2027-03-28) days.
  assert.equal(await day('2026-10-24 21:59:59+00'), '2026-10-24');
  assert.equal(await day('2026-10-24 22:00:00+00'), '2026-10-25');
  assert.equal(await day('2026-10-25 22:59:59+00'), '2026-10-25');
  assert.equal(await day('2026-10-25 23:00:00+00'), '2026-10-26');
  assert.equal(await day('2027-03-27 22:59:59+00'), '2027-03-27');
  assert.equal(await day('2027-03-27 23:00:00+00'), '2027-03-28');
  assert.equal(await day('2027-03-28 21:59:59+00'), '2027-03-28');
  assert.equal(await day('2027-03-28 22:00:00+00'), '2027-03-29');
  // Two partners on devices set to different timezones at 23:30 Rome both get
  // the SAME day: the server never takes a date from the client.
  assert.equal(await day('2026-09-30 23:30:00+02'), await day('2026-09-30 17:30:00-04'));
  const args = (await db.query(`select pronargs from pg_proc where proname = 'get_or_create_daily_question'`)).rows[0].pronargs;
  assert.equal(args, 0, 'RPC takes no client date');
  assert.match(read(M9E), /today date := private\.daily_question_day\(now\(\)\)/);
});

test('M9E: banca vuota / esaurita / non valida fallisce in modo onesto, senza creare righe', async () => {
  const { db } = await freshDb({ history: false });
  await db.exec(`update public.daily_question_templates set active = false where weekday_slot = 2`);
  await assert.rejects(materialize(db, '2026-10-06'), /daily_question_template_bank_empty/);
  assert.equal((await db.query(`select count(*)::int n from public.daily_questions where question_date = '2026-10-06'`)).rows[0].n, 0);
  // Other weekdays are unaffected.
  assert.ok((await materialize(db, '2026-10-05')).template_id.startsWith('noi_adesso-'));

  // A fully empty bank (only never-used templates can be deleted).
  await db.exec(`delete from public.daily_question_templates where id not in (select template_id from public.daily_questions where template_id is not null)`);
  await assert.rejects(materialize(db, '2026-10-08'), /daily_question_template_bank_empty/);
  await assert.rejects(db.exec(`delete from public.daily_question_templates`), /foreign key|violates/, 'used templates cannot be deleted');

  const bad = (sql) => assert.rejects(db.exec(sql), /violates|check|unique|duplicate/);
  await bad(`insert into public.daily_question_templates (id, weekday_slot, sequence, question, theme) values ('gioco-90', 1, 90, 'Domanda nel giorno sbagliato?', 'gioco')`);
  await bad(`insert into public.daily_question_templates (id, weekday_slot, sequence, question, theme) values ('ricordi-90', 6, 90, 'Prefisso che non combacia?', 'gioco')`);
  await bad(`insert into public.daily_question_templates (id, weekday_slot, sequence, question, theme) values ('nuovo-01', 1, 91, 'Tema inesistente?', 'nuovo')`);
  await bad(`insert into public.daily_question_templates (id, weekday_slot, sequence, question, theme) values ('noi_adesso-91', 1, 91, '   ', 'noi_adesso')`);
  await bad(`insert into public.daily_question_templates (id, weekday_slot, sequence, question, theme) values ('noi_adesso-92', 1, 1, 'Sequenza duplicata?', 'noi_adesso')`);
  await assert.rejects(db.query('select private.materialize_daily_question(null)'), /daily_question_date_required/);

  // The authenticated RPC surfaces the same honest failure.
  const { f } = await couple(db);
  await db.exec(`update public.daily_question_templates set active = false`);
  const today = romeToday();
  await db.exec(`delete from public.daily_questions where question_date = '${today}'`);
  await assert.rejects(asUser(db, f, () => rpc(db)), /daily_question_template_bank_empty/);
});

test('M9E: sicurezza — banca server-only, RPC solo autenticato e membro di coppia, niente scritture dirette', async () => {
  const { db } = await freshDb({ history: false });
  const { f } = await couple(db);
  const loner = uuid();
  await db.exec(`insert into public.profiles values ('${loner}', null, null)`);
  await assert.rejects(asUser(db, f, () => db.query('select * from public.daily_question_templates')), /permission denied/);
  await assert.rejects(asUser(db, f, () => db.query(`insert into public.daily_question_templates (id, weekday_slot, sequence, question, theme) values ('gioco-99', 6, 99, 'Iniettata dal client?', 'gioco')`)), /permission denied/);
  await assert.rejects(asUser(db, f, () => db.query(`update public.daily_question_templates set active = false`)), /permission denied/);
  await assert.rejects(asUser(db, f, () => db.query(`select private.materialize_daily_question('2030-01-01')`)), /permission denied/);
  await assert.rejects(asUser(db, f, () => db.query(`insert into public.daily_questions (question_date, question) values ('2030-01-01', 'arbitraria')`)), /permission denied|row-level security/);
  await assert.rejects(asUser(db, null, () => rpc(db)), /authentication required/);
  await assert.rejects(asUser(db, loner, () => rpc(db)), /couple membership required/);
  await db.exec('set role anon');
  await assert.rejects(db.query('select public.get_or_create_daily_question()'), /permission denied/);
  await db.exec('reset role');
  const rls = (await db.query(`select relrowsecurity, relforcerowsecurity from pg_class where oid = 'public.daily_question_templates'::regclass`)).rows[0];
  assert.deepEqual(rls, { relrowsecurity: true, relforcerowsecurity: true });
  assert.equal((await db.query(`select count(*)::int n from pg_policies where tablename = 'daily_question_templates'`)).rows[0].n, 0);
  const secdef = (await db.query(`select prosecdef, proconfig from pg_proc where proname = 'get_or_create_daily_question'`)).rows[0];
  assert.equal(secdef.prosecdef, true);
  assert.deepEqual(secdef.proconfig, ['search_path=""']);
});

test('M9E: la migration non tocca le authority esistenti di risposte e reveal', () => {
  const sql = read(M9E);
  const body = sql.replace(/^\s*--.*$/gm, '').replace(/comment on [\s\S]*?';\n/g, '');
  assert.doesNotMatch(body, /daily_answers/, 'engine never references answers');
  assert.doesNotMatch(body, /get_daily_state|daily_question_reveal_ready|daily_question_outcomes|claim_us_role/);
  assert.doesNotMatch(body, /grant\s+[^;]*on\s+(table\s+)?public\.daily_question_templates\s+to/i);
  assert.match(body, /revoke all on public\.daily_question_templates from public, anon, authenticated;/);
  assert.match(body, /on conflict \(question_date\) do nothing/);
  assert.match(body, /pg_advisory_xact_lock/);
  assert.match(body, /references public\.daily_question_templates\(id\) on delete restrict/);
  assert.match(body, /on conflict \(id\) do nothing;\s*$/, 'seed is idempotent');
});

test('M9E: il cron di pre-materializzazione è idempotente e opzionale (solo con pg_cron)', async () => {
  const sql = read(M9E);
  assert.match(sql, /if exists \(select 1 from pg_extension where extname = 'pg_cron'\)/);
  assert.match(sql, /if not exists \(select 1 from cron\.job where jobname = 'us-daily-question-materialize'\)/);
  assert.match(sql, /'1 \* \* \* \*'/);
  assert.match(sql, /\$cron\$select private\.materialize_daily_question\(private\.daily_question_day\(now\(\)\)\)\$cron\$/);
  // Applying the migration twice is safe.
  const { db } = await freshDb({ history: false });
  await db.exec(read(M9E));
  assert.equal((await db.query('select count(*)::int n from public.daily_question_templates')).rows[0].n, 182);
});
