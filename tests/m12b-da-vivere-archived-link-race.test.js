// M12B.2 — partner races around archiving a scheduled Da vivere idea, against
// a REAL PostgreSQL server (concurrent psql sessions, real row/lock waits),
// because an embedded single-connection engine cannot interleave sessions.
// Skipped, with the reason, when no local PostgreSQL server can be run.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PG_BIN = ['/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/15/bin'].find((d) => fs.existsSync(path.join(d, 'postgres')));
function ok(cmd, args) { try { return execFileSync(cmd, args, { stdio: 'pipe' }).toString(); } catch { return ''; } }
const CAN_RUN = Boolean(PG_BIN) && process.getuid?.() === 0 && Boolean(ok('id', ['postgres'])) && fs.existsSync('/usr/sbin/runuser') && Boolean(ok('psql', ['--version']));
const skip = CAN_RUN ? false : 'no local PostgreSQL server binaries / postgres OS user / root available';

const uuid = () => crypto.randomUUID();
const M = ['20260929121350_m7a_da_vivere_bucket_items_domain', '20260929190126_m7c_da_vivere_calendar_unschedule',
  '20260929190145_m7d_da_vivere_reciprocal_lived', '20260930230000_m12b_2_da_vivere_archived_link_release']
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
  alter table public.calendar_entries enable row level security;
  create policy calendar_entries_all on public.calendar_entries for all
    using (couple_id = (select p.couple_id from public.profiles p where p.id = auth.uid()))
    with check (couple_id = (select p.couple_id from public.profiles p where p.id = auth.uid()));
  grant select, insert, update, delete on public.calendar_entries to authenticated;
  create table public.bucket_items (id uuid primary key default gen_random_uuid(), couple_id uuid not null, created_by uuid not null, title text not null, completed boolean not null default false, completed_at timestamptz, created_at timestamptz not null default now());
  alter table public.bucket_items enable row level security;
  create policy bucket_items_all on public.bucket_items for all
    using (couple_id = (select p.couple_id from public.profiles p where p.id = auth.uid()))
    with check (couple_id = (select p.couple_id from public.profiles p where p.id = auth.uid()));
  grant select, insert, update, delete on public.bucket_items to authenticated;
`;

let dir; let sock;
const PORT = '54331';
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
    peek: () => ({ out, err }),
    end: async () => {
      p.stdin.end();
      const timer = setTimeout(() => p.kill('SIGKILL'), 20000); // a lock that never clears must fail, not hang
      await closed; clearTimeout(timer);
      return { out, err };
    },
  };
}
const asUser = (uid) => `set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`;
const waiting = () => Number(sql(`select count(*) from pg_stat_activity where datname='us' and wait_event_type='Lock'`));
async function waitFor(fn, what, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return; await new Promise((r) => setTimeout(r, 40)); }
  assert.fail(`timeout waiting for ${what}`);
}

test.before(() => {
  if (!CAN_RUN) return;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'us-pg-m12b-'));
  fs.chmodSync(dir, 0o755);
  sock = path.join(dir, 'sock');
  const data = path.join(dir, 'data');
  const asPg = (cmd, args) => execFileSync('runuser', ['-u', 'postgres', '--', cmd, ...args], { stdio: 'pipe' });
  execFileSync('install', ['-d', '-o', 'postgres', '-g', 'postgres', data, sock]);
  asPg(path.join(PG_BIN, 'initdb'), ['-D', data, '-A', 'trust', '-U', 'postgres']);
  asPg(path.join(PG_BIN, 'pg_ctl'), ['-D', data, '-o', `-c listen_addresses= -c unix_socket_directories=${sock} -p ${PORT}`, '-w', '-l', path.join(data, 'server.log'), 'start']);
  execFileSync('createdb', ['-h', sock, '-p', PORT, '-U', 'postgres', 'us']);
  sql(FIXTURE_SQL);
  for (const f of M) execFileSync('psql', [...psqlArgs, '-v', 'ON_ERROR_STOP=1', '-f', path.join(ROOT, f)], { env: env() });
});
test.after(() => {
  if (!CAN_RUN || !dir) return;
  try { execFileSync('runuser', ['-u', 'postgres', '--', path.join(PG_BIN, 'pg_ctl'), '-D', path.join(dir, 'data'), '-m', 'immediate', 'stop'], { stdio: 'pipe' }); } catch {}
  fs.rmSync(dir, { recursive: true, force: true });
});

function scheduled() {
  const c = uuid(); const a = uuid(); const b = uuid(); const item = uuid(); const entry = uuid();
  sql(`insert into public.profiles values ('${a}','${c}'),('${b}','${c}')`);
  sql(`insert into public.calendar_entries (id, couple_id, entry_type) values ('${entry}','${c}','shared')`);
  sql(`insert into public.bucket_items (id, couple_id, created_by, title) values ('${item}','${c}','${a}','Provare quel ristorante')`);
  sql(`update public.bucket_items set status='scheduled', calendar_entry_id='${entry}' where id='${item}'`);
  return { c, a, b, item, entry };
}
const itemState = (item) => sql(`select status || '|' || coalesce(calendar_entry_id::text,'-') || '|' || coalesce(completed_at::text,'-') from public.bucket_items where id='${item}'`);
const entryCount = (entry) => Number(sql(`select count(*) from public.calendar_entries where id='${entry}'`));
const confirmSql = (id) => `select 'R:' || (public.confirm_bucket_item_lived('${id}'::uuid)->>'status');`;

test('E1 — A archives while B deletes the event: B waits, then the delete succeeds; nothing is left pinned', { skip }, async () => {
  const { a, b, item, entry } = scheduled();
  const archiver = session();
  archiver.send(`${asUser(a)} begin; update public.bucket_items set status='archived' where id='${item}'; select 'ARCHIVED';`);
  await waitFor(() => archiver.peek().out.includes('ARCHIVED'), 'A holding the archive');
  const deleter = session();
  deleter.send(`${asUser(b)} delete from public.calendar_entries where id='${entry}' returning 'DELETED';`);
  await waitFor(() => waiting() >= 1, 'B waiting on the bucket_items row');
  archiver.send('commit;');
  const ra = await archiver.end(); const rb = await deleter.end();
  assert.equal(ra.err, ''); assert.equal(rb.err, '', rb.err);
  assert.match(rb.out, /DELETED/);
  assert.equal(entryCount(entry), 0);
  assert.equal(itemState(item), 'archived|-|-');
});

test('E2 — B deletes the event while A archives: A waits, then archives the idea that is back to idea', { skip }, async () => {
  const { a, b, item, entry } = scheduled();
  const deleter = session();
  deleter.send(`${asUser(b)} begin; delete from public.calendar_entries where id='${entry}'; select 'DELETED';`);
  await waitFor(() => deleter.peek().out.includes('DELETED'), 'B holding the delete');
  const archiver = session();
  archiver.send(`${asUser(a)} update public.bucket_items set status='archived' where id='${item}' returning 'ARCHIVED';`);
  await waitFor(() => waiting() >= 1, 'A waiting on the bucket_items row');
  deleter.send('commit;');
  const rb = await deleter.end(); const ra = await archiver.end();
  assert.equal(rb.err, ''); assert.equal(ra.err, '', ra.err);
  assert.match(ra.out, /ARCHIVED/);
  assert.equal(entryCount(entry), 0);
  assert.equal(itemState(item), 'archived|-|-');
});

test('E3 — both partners archive at once: both succeed, one final state', { skip }, async () => {
  const { a, b, item, entry } = scheduled();
  const first = session();
  first.send(`${asUser(a)} begin; update public.bucket_items set status='archived' where id='${item}'; select 'A1';`);
  await waitFor(() => first.peek().out.includes('A1'), 'A holding the archive');
  const second = session();
  second.send(`${asUser(b)} update public.bucket_items set status='archived' where id='${item}' returning 'B1';`);
  await waitFor(() => waiting() >= 1, 'B waiting');
  first.send('commit;');
  const r1 = await first.end(); const r2 = await second.end();
  assert.equal(r1.err, ''); assert.equal(r2.err, '', r2.err);
  assert.match(r2.out, /B1/);
  assert.equal(itemState(item), 'archived|-|-');
  assert.equal(entryCount(entry), 1, 'archiving never deletes the Calendario event');
});

test('E4 — B confirms "lived" while A archives: whichever wins, lived history keeps its event', { skip }, async () => {
  // A proposes first, so B's call is the finalizing confirmation.
  const x = scheduled();
  execFileSync('psql', [...psqlArgs, '-c', `${asUser(x.a)} ${confirmSql(x.item)}`], { env: env() });
  const confirmer = session();
  confirmer.send(`${asUser(x.b)} begin; ${confirmSql(x.item)}`);
  await waitFor(() => confirmer.peek().out.includes('R:lived'), 'B holding the confirmation');
  const archiver = session();
  archiver.send(`${asUser(x.a)} update public.bucket_items set status='archived' where id='${x.item}' returning 'ARCHIVED';`);
  await waitFor(() => waiting() >= 1, 'A waiting on the row');
  confirmer.send('commit;');
  const rc = await confirmer.end(); const ra = await archiver.end();
  assert.equal(rc.err, ''); assert.equal(ra.err, '', ra.err);
  const [status, link, livedAt] = itemState(x.item).split('|');
  assert.equal(status, 'archived');
  assert.equal(link, x.entry, 'lived -> archived keeps the day it happened');
  assert.notEqual(livedAt, '-');
  const del = spawnSyncDelete(x.b, x.entry);
  assert.match(del, /violates RESTRICT|23001|foreign key/i);
  assert.equal(entryCount(x.entry), 1);

  // Opposite order: A archives first, then B's confirmation finds an archived idea and is refused.
  const y = scheduled();
  execFileSync('psql', [...psqlArgs, '-c', `${asUser(y.a)} ${confirmSql(y.item)}`], { env: env() });
  const archiver2 = session();
  archiver2.send(`${asUser(y.a)} begin; update public.bucket_items set status='archived' where id='${y.item}'; select 'ARCHIVED';`);
  await waitFor(() => archiver2.peek().out.includes('ARCHIVED'), 'A holding the archive');
  const confirmer2 = session();
  confirmer2.send(`${asUser(y.b)} ${confirmSql(y.item)}`);
  await waitFor(() => waiting() >= 1, 'B waiting on the row');
  archiver2.send('commit;');
  await archiver2.end(); const rc2 = await confirmer2.end();
  assert.match(rc2.err, /bucket_items_lived_not_allowed_from: archived|bucket_items_lived_proposal_changed_retry/);
  assert.equal(itemState(y.item), 'archived|-|-');
  assert.equal(entryCount(y.entry), 1);
});

function spawnSyncDelete(uid, entry) {
  try {
    execFileSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-c', `${asUser(uid)} delete from public.calendar_entries where id='${entry}';`], { env: env(), stdio: 'pipe' });
    return 'deleted';
  } catch (error) {
    return String(error.stderr || error.message);
  }
}
