// M9E — both partners opening US at the same instant must resolve ONE
// concrete daily_questions row. Runs the real migration against a REAL
// PostgreSQL server with concurrent psql sessions (an embedded single-connection
// engine cannot interleave sessions). Skipped, with the reason, when no local
// PostgreSQL server binaries or no way to run them are available.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PG_BIN = ['/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/15/bin'].find((d) => fs.existsSync(path.join(d, 'postgres')));
function execFileSyncOk(cmd, args) { try { return execFileSync(cmd, args, { stdio: 'pipe' }).toString(); } catch { return ''; } }
const CAN_RUN = Boolean(PG_BIN) && process.getuid?.() === 0 && Boolean(execFileSyncOk('id', ['postgres'])) && fs.existsSync('/usr/sbin/runuser') && Boolean(execFileSyncOk('psql', ['--version']));
const skip = CAN_RUN ? false : 'no local PostgreSQL server binaries / postgres OS user / root available';
const MIGRATION = path.join(ROOT, 'supabase/migrations_history/20260930045233_m9e_daily_question_engine.sql');
const uuid = () => crypto.randomUUID();

const FIXTURE_SQL = `
  create role authenticated; create role anon;
  grant usage on schema public to authenticated, anon;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  create schema private;
  grant usage on schema private to authenticated;
  create table public.profiles (id uuid primary key, couple_id uuid, role text);
  create table public.daily_questions (id uuid primary key default gen_random_uuid(), question_date date not null unique, question text not null, category text not null default 'daily', created_at timestamptz not null default now());
  alter table public.daily_questions enable row level security;
  grant select on public.daily_questions to authenticated;
  create policy daily_questions_read on public.daily_questions for select to authenticated using (true);
`;

let dir; let sock;
const PORT = '54339';
const env = () => ({ ...process.env, PGHOST: sock, PGPORT: PORT, PGUSER: 'postgres', PGDATABASE: 'us' });
const psqlArgs = ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=0'];
const sql = (text) => execFileSync('psql', [...psqlArgs, '-c', text], { env: env() }).toString().trim();
function session() {
  const p = spawn('psql', psqlArgs, { env: env() });
  let out = ''; let err = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { err += d; });
  const closed = new Promise((resolve) => p.on('close', resolve));
  return {
    send: (text) => p.stdin.write(text + '\n'),
    end: async () => {
      p.stdin.end();
      const timer = setTimeout(() => p.kill('SIGKILL'), 20000);
      await closed; clearTimeout(timer);
      return { out, err };
    },
    peek: () => ({ out, err }),
  };
}
const asUser = (uid) => `set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`;
const CALL = `select 'ID:' || (public.get_or_create_daily_question()->>'id');`;
const today = () => sql(`select private.daily_question_day(now())`);
const rowsToday = () => Number(sql(`select count(*) from public.daily_questions where question_date = private.daily_question_day(now())`));
const lockWaiters = () => Number(sql(`select count(*) from pg_stat_activity where datname='us' and wait_event_type='Lock'`));
const ids = (out) => [...out.matchAll(/ID:([0-9a-f-]{36})/g)].map((m) => m[1]);
async function waitFor(fn, what, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return; await new Promise((r) => setTimeout(r, 50)); }
  assert.fail(`timeout waiting for ${what}`);
}
function couple() {
  const c = uuid(); const a = uuid(); const b = uuid();
  sql(`insert into public.profiles values ('${a}','${c}','francesco'),('${b}','${c}','beatrice')`);
  return { a, b };
}
const resetToday = () => sql(`delete from public.daily_questions where question_date = private.daily_question_day(now())`);

test.before(() => {
  if (!CAN_RUN) return;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'us-pg-m9e-'));
  fs.chmodSync(dir, 0o755);
  sock = path.join(dir, 'sock');
  const data = path.join(dir, 'data');
  const asPg = (cmd, args) => execFileSync('runuser', ['-u', 'postgres', '--', cmd, ...args], { stdio: 'pipe' });
  execFileSync('install', ['-d', '-o', 'postgres', '-g', 'postgres', data, sock]);
  asPg(path.join(PG_BIN, 'initdb'), ['-D', data, '-A', 'trust', '-U', 'postgres']);
  asPg(path.join(PG_BIN, 'pg_ctl'), ['-D', data, '-o', `-c listen_addresses= -c unix_socket_directories=${sock} -p ${PORT}`, '-w', '-l', path.join(data, 'server.log'), 'start']);
  execFileSync('createdb', ['-h', sock, '-p', PORT, '-U', 'postgres', 'us']);
  sql(FIXTURE_SQL);
  execFileSync('psql', [...psqlArgs, '-v', 'ON_ERROR_STOP=1', '-f', MIGRATION], { env: env() });
});
test.after(() => {
  if (!CAN_RUN || !dir) return;
  try { execFileSync('runuser', ['-u', 'postgres', '--', path.join(PG_BIN, 'pg_ctl'), '-D', path.join(dir, 'data'), '-m', 'immediate', 'stop'], { stdio: 'pipe' }); } catch {}
  fs.rmSync(dir, { recursive: true, force: true });
});

test('M9E concurrency: il secondo partner aspetta il primo e riceve la stessa riga', { skip }, async () => {
  resetToday();
  const { a, b } = couple();
  const first = session();
  first.send(`${asUser(a)} begin; ${CALL}`); // holds the advisory lock + an uncommitted row
  await waitFor(() => /ID:/.test(first.peek().out), 'A materialized inside its transaction');
  const second = session();
  second.send(`${asUser(b)} ${CALL}`);
  await waitFor(() => lockWaiters() >= 1, 'B waiting on the materialization lock');
  first.send('commit;');
  const ra = await first.end(); const rb = await second.end();
  assert.equal(ra.err, ''); assert.equal(rb.err, '');
  assert.equal(ids(ra.out).length, 1);
  assert.deepEqual(ids(rb.out), ids(ra.out), 'same question id for both partners');
  assert.equal(rowsToday(), 1);
});

test('M9E concurrency: 12 aperture simultanee → una sola riga concreta, un solo id', { skip }, async () => {
  resetToday();
  const { a, b } = couple();
  const sessions = Array.from({ length: 12 }, (_, i) => { const s = session(); s.send(`${asUser(i % 2 ? b : a)} ${CALL}`); return s; });
  const results = await Promise.all(sessions.map((s) => s.end()));
  const all = results.flatMap((r) => ids(r.out));
  assert.equal(results.map((r) => r.err).join(''), '');
  assert.equal(all.length, 12);
  assert.equal(new Set(all).size, 1);
  assert.equal(rowsToday(), 1);
  assert.equal(sql(`select question_date from public.daily_questions where id = '${all[0]}'`), today());
});

test('M9E concurrency: anche un writer fuori dal lock non produce doppioni (unique + ON CONFLICT)', { skip }, async () => {
  resetToday();
  const { a } = couple();
  const outsider = session();
  outsider.send(`begin; insert into public.daily_questions (question_date, question) values (private.daily_question_day(now()), 'Riga scritta fuori dal motore'); select 'INS';`);
  await waitFor(() => /INS/.test(outsider.peek().out), 'outsider row pending');
  const caller = session();
  caller.send(`${asUser(a)} ${CALL}`);
  await waitFor(() => lockWaiters() >= 1, 'caller waiting on the unique index');
  outsider.send('commit;');
  const ro = await outsider.end(); const rc = await caller.end();
  assert.equal(ro.err, ''); assert.equal(rc.err, '');
  const id = ids(rc.out)[0];
  assert.equal(sql(`select question from public.daily_questions where id = '${id}'`), 'Riga scritta fuori dal motore');
  assert.equal(rowsToday(), 1);
});
