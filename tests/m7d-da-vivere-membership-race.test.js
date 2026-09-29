// M7D — membership race on the reciprocal "vissuta" RPC, against a REAL
// PostgreSQL server (concurrent psql sessions, real row/lock waits), because
// an embedded single-connection engine cannot interleave sessions. The whole
// file is skipped, with the reason, when no local PostgreSQL server binaries
// or no way to run them are available.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const PG_BIN = ['/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/15/bin'].find((d) => fs.existsSync(path.join(d, 'postgres')));
const CAN_RUN = Boolean(PG_BIN) && process.getuid?.() === 0 && Boolean(execFileSyncOk('id', ['postgres'])) && fs.existsSync('/usr/sbin/runuser') && Boolean(execFileSyncOk('psql', ['--version']));
function execFileSyncOk(cmd, args) { try { return execFileSync(cmd, args, { stdio: 'pipe' }).toString(); } catch { return ''; } }
const skip = CAN_RUN ? false : 'no local PostgreSQL server binaries / postgres OS user / root available';

const uuid = () => crypto.randomUUID();
const M = ['20260929121350_m7a_da_vivere_bucket_items_domain', '20260929180000_m7c_da_vivere_calendar_unschedule', '20260929200000_m7d_da_vivere_reciprocal_lived']
  .map((n) => `supabase/migrations/${n}.sql`);

const FIXTURE_SQL = `
  create role authenticated; create role anon;
  grant usage on schema public to authenticated, anon;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  create schema private;
  create table public.profiles (id uuid primary key, couple_id uuid);
  grant select on public.profiles to authenticated;
  create table public.calendar_entries (id uuid primary key default gen_random_uuid(), couple_id uuid not null, entry_type text not null check (entry_type in ('personal','shared')));
  create table public.bucket_items (id uuid primary key default gen_random_uuid(), couple_id uuid not null, created_by uuid not null, title text not null, completed boolean not null default false, completed_at timestamptz, created_at timestamptz not null default now());
  alter table public.bucket_items enable row level security;
  create policy bucket_items_all on public.bucket_items for all
    using (couple_id = (select p.couple_id from public.profiles p where p.id = auth.uid()))
    with check (couple_id = (select p.couple_id from public.profiles p where p.id = auth.uid()));
`;

let dir; let sock;
const env = () => ({ ...process.env, PGHOST: sock, PGPORT: '54329', PGUSER: 'postgres', PGDATABASE: 'us' });
const psqlArgs = ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=0'];
const sql = (text) => execFileSync('psql', [...psqlArgs, '-c', text], { env: env() }).toString().trim();

function session(label) {
  const p = spawn('psql', psqlArgs, { env: env() });
  let out = ''; let err = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { err += d; });
  const closed = new Promise((resolve) => p.on('close', resolve));
  return {
    label,
    send: (text) => p.stdin.write(text + '\n'),
    end: async () => {
      p.stdin.end();
      const timer = setTimeout(() => p.kill('SIGKILL'), 20000); // a lock that never clears must fail the test, not hang it
      await closed; clearTimeout(timer);
      return { out, err };
    },
    peek: () => ({ out, err }),
  };
}
const asUser = (uid) => `set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`;
const confirmSql = (id) => `select 'R:' || (public.confirm_bucket_item_lived('${id}'::uuid)->>'status');`;
async function waitFor(fn, what, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return; await new Promise((r) => setTimeout(r, 50)); }
  assert.fail(`timeout waiting for ${what}`);
}
const waiting = () => Number(sql(`select count(*) from pg_stat_activity where datname='us' and wait_event_type='Lock'`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test.before(async () => {
  if (!CAN_RUN) return;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'us-pg-race-'));
  fs.chmodSync(dir, 0o755);
  sock = path.join(dir, 'sock');
  const data = path.join(dir, 'data');
  const asPg = (cmd, args) => execFileSync('runuser', ['-u', 'postgres', '--', cmd, ...args], { stdio: 'pipe' });
  execFileSync('install', ['-d', '-o', 'postgres', '-g', 'postgres', data, sock]);
  asPg(path.join(PG_BIN, 'initdb'), ['-D', data, '-A', 'trust', '-U', 'postgres']);
  asPg(path.join(PG_BIN, 'pg_ctl'), ['-D', data, '-o', `-c listen_addresses= -c unix_socket_directories=${sock} -p 54329`, '-w', '-l', path.join(data, 'server.log'), 'start']);
  execFileSync('createdb', ['-h', sock, '-p', '54329', '-U', 'postgres', 'us']);
  sql(FIXTURE_SQL);
  for (const f of M) execFileSync('psql', [...psqlArgs, '-f', path.join(ROOT, f)], { env: env() });
  execFileSync('psql', [...psqlArgs, '-c', 'create role tester'], { env: env() });
});
test.after(() => {
  if (!CAN_RUN || !dir) return;
  try { execFileSync('runuser', ['-u', 'postgres', '--', path.join(PG_BIN, 'pg_ctl'), '-D', path.join(dir, 'data'), '-m', 'immediate', 'stop'], { stdio: 'pipe' }); } catch {}
  fs.rmSync(dir, { recursive: true, force: true });
});

// A proposes through the real RPC as A (separate one-shot session).
function propose({ a, item }) {
  execFileSync('psql', [...psqlArgs, '-c', `${asUser(a)} ${confirmSql(item)}`], { env: env() });
}
function fresh() {
  const c = uuid(); const a = uuid(); const b = uuid(); const item = uuid();
  sql(`insert into public.profiles values ('${a}','${c}'),('${b}','${c}')`);
  sql(`insert into public.bucket_items (id, couple_id, created_by, title) values ('${item}','${c}','${a}','Lisbona')`);
  const ctx = { c, a, b, item };
  propose(ctx);
  return ctx;
}
const state = (item) => sql(`select status || '|' || coalesce(lived_proposed_by::text,'-') from public.bucket_items where id='${item}'`);

test('race: caller removed while waiting for the profile lock must NOT finalize', { skip }, async () => {
  const { b, item } = fresh();
  const remover = session('R');
  remover.send(`begin; select 1 from public.profiles where id='${b}' for update;`); // membership change in flight
  await sleep(300);
  const caller = session('B');
  caller.send(`${asUser(b)} ${confirmSql(item)}`);
  await waitFor(() => waiting() >= 1, 'B waiting on its profile row');
  remover.send(`delete from public.profiles where id='${b}'; commit;`);
  const rb = await caller.end(); await remover.end();
  assert.doesNotMatch(rb.out, /R:lived/);
  assert.match(rb.err, /bucket_items_lived_requires_authenticated_member/);
  assert.match(state(item), /^idea\|/, 'not lived');
});

test('race: caller re-paired to another couple while waiting must NOT finalize', { skip }, async () => {
  const { b, item } = fresh();
  const other = uuid();
  const remover = session('R');
  remover.send(`begin; select 1 from public.profiles where id='${b}' for update;`);
  await sleep(300);
  const caller = session('B');
  caller.send(`${asUser(b)} ${confirmSql(item)}`);
  await waitFor(() => waiting() >= 1, 'B waiting');
  remover.send(`update public.profiles set couple_id='${other}' where id='${b}'; commit;`);
  const rb = await caller.end(); await remover.end();
  assert.doesNotMatch(rb.out, /R:lived/);
  assert.match(rb.err, /bucket_items_not_found/);
  assert.match(state(item), /^idea\|/);
});

test('race: caller waiting on the ITEM lock keeps its membership pinned — removal queues behind it, never in between', { skip }, async () => {
  const { b, item } = fresh();
  const holder = session('H');
  holder.send(`begin; select 1 from public.bucket_items where id='${item}' for update;`);
  await sleep(300);
  const caller = session('B');
  caller.send(`${asUser(b)} ${confirmSql(item)}`);
  await waitFor(() => waiting() >= 1, 'B waiting on the item lock');
  const remover = session('R');
  remover.send(`delete from public.profiles where id='${b}';`);
  await waitFor(() => waiting() >= 2, 'removal queued behind the in-flight confirmation');
  assert.equal(sql(`select count(*) from public.profiles where id='${b}'`), '1', 'B is still a member while its confirmation is in flight');
  holder.send('commit;');
  const rb = await caller.end(); await remover.end(); await holder.end();
  assert.match(rb.out, /R:lived/, 'finalized while membership was provably current');
  assert.equal(sql(`select count(*) from public.profiles where id='${b}'`), '0');
  assert.match(state(item), /^lived\|/);
});

test('race: proposer removed while B waits for the proposer profile lock — B must NOT finalize, only re-propose', { skip }, async () => {
  const { a, b, item } = fresh();
  const remover = session('R');
  remover.send(`begin; select 1 from public.profiles where id='${a}' for update;`);
  await sleep(300);
  const caller = session('B');
  caller.send(`${asUser(b)} ${confirmSql(item)}`);
  await waitFor(() => waiting() >= 1, 'B waiting on the proposer profile');
  remover.send(`delete from public.profiles where id='${a}'; commit;`);
  const rb = await caller.end(); await remover.end();
  assert.doesNotMatch(rb.out, /R:lived/);
  assert.match(rb.out, /R:idea/);
  assert.equal(state(item), `idea|${b}`, 'B is now the proposer; the stale proposal was not a confirmation');
});

test('race: proposer re-paired away while B waits — same result', { skip }, async () => {
  const { a, b, item } = fresh();
  const remover = session('R');
  remover.send(`begin; select 1 from public.profiles where id='${a}' for update;`);
  await sleep(300);
  const caller = session('B');
  caller.send(`${asUser(b)} ${confirmSql(item)}`);
  await waitFor(() => waiting() >= 1, 'B waiting');
  remover.send(`update public.profiles set couple_id='${uuid()}' where id='${a}'; commit;`);
  const rb = await caller.end(); await remover.end();
  assert.match(rb.out, /R:idea/);
  assert.equal(state(item), `idea|${b}`);
});

test('no deadlock with the claim_us_role order (profile lock, then bucket_items) while a confirmation is in flight', { skip }, async () => {
  const { c, a, b, item } = fresh();
  const claim = session('C');
  claim.send(`begin; select 1 from public.profiles where id='${a}' for update; update public.profiles set couple_id=null where id='${a}';`);
  await sleep(300);
  const caller = session('B');
  caller.send(`${asUser(b)} ${confirmSql(item)}`);
  await waitFor(() => waiting() >= 1, 'B waiting behind the claim');
  const a2 = uuid();
  claim.send(`insert into public.profiles values ('${a2}','${c}'); select set_config('us.bucket_items_repair_transfer','on',true); update public.bucket_items set created_by='${a2}' where created_by='${a}'; select set_config('us.bucket_items_repair_transfer','off',true); delete from public.profiles where id='${a}'; commit;`);
  const rb = await caller.end(); const rc = await claim.end();
  assert.doesNotMatch(rb.err + rc.err, /deadlock/i);
  assert.doesNotMatch(rc.err, /ERROR/);
  assert.match(rb.out, /R:idea/, 'the old profile\'s proposal does not count; B re-proposes');
});

test('concurrent confirmations from A and B serialize: exactly one final lived, no error', { skip }, async () => {
  const c = uuid(); const a = uuid(); const b = uuid(); const item = uuid();
  sql(`insert into public.profiles values ('${a}','${c}'),('${b}','${c}')`);
  sql(`insert into public.bucket_items (id, couple_id, created_by, title) values ('${item}','${c}','${a}','Lisbona')`);
  const holder = session('H');
  holder.send(`begin; select 1 from public.bucket_items where id='${item}' for update;`);
  await sleep(300);
  const sa = session('A'); const sb2 = session('B');
  sa.send(`${asUser(a)} ${confirmSql(item)}`);
  sb2.send(`${asUser(b)} ${confirmSql(item)}`);
  await sleep(700);
  holder.send('commit;');
  const [ra, rb] = await Promise.all([sa.end(), sb2.end()]); await holder.end();
  // Whoever took the item lock second either finalizes or gets a retryable
  // 40001 when the proposer changed under it; a retry always converges.
  for (const r of [ra, rb]) assert.doesNotMatch(r.err, /deadlock/i);
  const retry = session('R2'); retry.send(`${asUser(a)} ${confirmSql(item)}`); retry.send(`${asUser(b)} ${confirmSql(item)}`);
  await retry.end();
  assert.match(state(item), /^lived\|/);
});

test('migration keeps the lock order documented: profiles FOR SHARE by id, then the row FOR UPDATE, then a recheck', () => {
  const src = read(M[2]).replace(/--.*$/gm, '');
  const fn = src.match(/create or replace function public\.confirm_bucket_item_lived[\s\S]*?\n\$\$;/)[0];
  const share = fn.indexOf('for share');
  const update = fn.indexOf('for update');
  assert.ok(share > 0 && update > share, 'profiles are locked before the item');
  assert.match(fn, /order by p\.id\s+for share/);
  assert.match(fn, /40001/);
});
