// Sintonia events guard — completions of the same couple at the same moment,
// on a REAL PostgreSQL server (two psql sessions, real lock waits; an
// embedded single-connection engine cannot interleave sessions). The schema is
// the real chain: platform skeleton + every supabase/migrations file in
// timestamp order, so the guard runs on the production baseline. Skipped, with
// the reason, when no local PostgreSQL server can be run, like the other race
// tests. A throwaway cluster on a unix socket, removed afterwards.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = '54371';
const BIN = [18, 17, 16, 15].map((v) => `/usr/lib/postgresql/${v}/bin`).find((d) => fs.existsSync(path.join(d, 'postgres')));
const works = (cmd, args) => { try { execFileSync(cmd, args, { stdio: 'pipe' }); return true; } catch { return false; } };
const CAN_RUN = Boolean(BIN) && process.getuid?.() === 0 && works('id', ['postgres']) && fs.existsSync('/usr/sbin/runuser');
const SKIP = CAN_RUN ? false : 'no local PostgreSQL server binaries / postgres OS user / root available';

function startServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'us-pg-sintonia-'));
  fs.chmodSync(dir, 0o755);
  const data = path.join(dir, 'data');
  const sock = path.join(dir, 'sock');
  const asPg = (cmd, args) => execFileSync('runuser', ['-u', 'postgres', '--', path.join(BIN, cmd), ...args], { stdio: 'pipe' });
  const stop = () => {
    try { asPg('pg_ctl', ['-D', data, '-m', 'immediate', 'stop']); } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  };
  const env = { ...process.env, PGHOST: sock, PGPORT: PORT, PGUSER: 'postgres', PGDATABASE: 'postgres' };
  const args = ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'];
  const sql = (text) => execFileSync(path.join(BIN, 'psql'), [...args, '-c', text], { env, stdio: 'pipe' }).toString().trim();
  const file = (text) => {
    const f = path.join(dir, 'apply.sql');
    fs.writeFileSync(f, text);
    execFileSync(path.join(BIN, 'psql'), [...args, '-f', f], { env, stdio: 'pipe' });
  };
  try {
    execFileSync('install', ['-d', '-o', 'postgres', '-g', 'postgres', data, sock]);
    asPg('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres']);
    asPg('pg_ctl', ['-D', data, '-o', `-c listen_addresses= -c unix_socket_directories=${sock} -p ${PORT}`, '-w', '-l', path.join(data, 'server.log'), 'start']);
    // MAINTAIN is a PostgreSQL 17 privilege (production runs 17.6). An older
    // local server gets the same grants without it; locking is the same.
    const pg17 = Number(sql('show server_version_num')) >= 170000;
    const compatible = (text) => (pg17 ? text : text.replace(/,\s*maintain\b/gi, ''));
    file(fs.readFileSync(path.join(ROOT, 'supabase/baseline/platform/pglite-platform.sql'), 'utf8'));
    const dirMigrations = path.join(ROOT, 'supabase/migrations');
    for (const f of fs.readdirSync(dirMigrations).filter((n) => n.endsWith('.sql')).sort()) {
      file(compatible(fs.readFileSync(path.join(dirMigrations, f), 'utf8')));
    }
  } catch (error) {
    stop();
    throw error;
  }
  function session() {
    const p = spawn(path.join(BIN, 'psql'), ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=0'], { env });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    const closed = new Promise((resolve) => p.on('close', resolve));
    return {
      send: (text) => p.stdin.write(`${text}\n`),
      peek: () => ({ out, err }),
      end: async () => {
        p.stdin.end();
        const timer = setTimeout(() => p.kill('SIGKILL'), 20000);
        await closed;
        clearTimeout(timer);
        return { out, err };
      },
    };
  }
  const lockWaiters = () => Number(sql("select count(*) from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'"));
  return { sql, session, stop, lockWaiters };
}

const asUser = (uid) => `set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`;
async function waitFor(fn, what, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error(`timeout waiting for ${what}`);
}

let pg;
test.before(() => {
  if (SKIP) return;
  pg = startServer();
});
test.after(() => { pg?.stop(); });

// A couple with `count` events dated today, created three days ago (planned).
function world(count = 2) {
  const w = { c: crypto.randomUUID(), f: crypto.randomUUID(), b: crypto.randomUUID(), events: [] };
  for (let i = 0; i < count; i += 1) w.events.push(crypto.randomUUID());
  pg.sql(`insert into auth.users (id, email, is_anonymous) values ('${w.f}', '${w.f}@example.test', false), ('${w.b}', '${w.b}@example.test', false);
    insert into public.couples (id, name) values ('${w.c}', 'US.');
    insert into public.profiles (id, display_name, couple_id, role) values ('${w.f}', 'Francesco', '${w.c}', 'francesco'), ('${w.b}', 'Beatrice', '${w.c}', 'beatrice');
    insert into public.shared_events (id, couple_id, created_by, title, event_date, created_at)
      select e, '${w.c}', '${w.f}', 'Evento', (now() at time zone 'Europe/Rome')::date, now() - interval '3 days'
      from unnest(array['${w.events.join("','")}']::uuid[]) as e;`);
  w.today = pg.sql("select (now() at time zone 'Europe/Rome')::date");
  return w;
}
// The answer's xp_reason; the already-completed answer has none.
const reasonSql = (w, ev) => `select 'reason=' || coalesce(public.complete_shared_event('${ev}', '${w.today}') ->> 'xp_reason', 'already');`;
const xpOf = (w) => Number(pg.sql(`select bond_xp from public.couples where id = '${w.c}'`));
const rows = (w) => pg.sql(`select string_agg(xp_awarded::text, ',' order by xp_awarded desc) from public.shared_event_completions where couple_id = '${w.c}'`);

test('both partners complete two planned events at the same moment: one earns, the other waits and gets daily_limit', { skip: SKIP }, async () => {
  const w = world();
  const one = pg.session();
  const two = pg.session();
  one.send(`${asUser(w.f)} begin; ${reasonSql(w, w.events[0])}`);
  await waitFor(() => one.peek().out.includes('reason=planned'), 'first completion inside its transaction');
  two.send(`${asUser(w.b)} ${reasonSql(w, w.events[1])}`);
  await waitFor(() => pg.lockWaiters() >= 1, 'second completion waiting on the progression lock');
  assert.ok(!two.peek().out.includes('reason='), 'it has not decided yet');
  one.send('commit;');
  const [a, b] = await Promise.all([one.end(), two.end()]);
  assert.equal(a.err + b.err, '');
  assert.match(a.out, /reason=planned/);
  assert.match(b.out, /reason=daily_limit/);
  assert.equal(xpOf(w), 35, 'awarded once');
  assert.equal(rows(w), '35,0', 'both completions are recorded');
});

test('a completion rolled back does not use up the day: the waiting one earns', { skip: SKIP }, async () => {
  const w = world();
  const one = pg.session();
  const two = pg.session();
  one.send(`${asUser(w.f)} begin; ${reasonSql(w, w.events[0])}`);
  await waitFor(() => one.peek().out.includes('reason=planned'), 'first completion inside its transaction');
  two.send(`${asUser(w.b)} ${reasonSql(w, w.events[1])}`);
  await waitFor(() => pg.lockWaiters() >= 1, 'second completion waiting');
  one.send('rollback;');
  const [a, b] = await Promise.all([one.end(), two.end()]);
  assert.equal(a.err + b.err, '');
  assert.match(b.out, /reason=planned/);
  assert.equal(xpOf(w), 35);
  assert.equal(rows(w), '35');
});

test('both partners complete the same occurrence at once: one completion, the other gets the existing one', { skip: SKIP }, async () => {
  const w = world(1);
  const one = pg.session();
  const two = pg.session();
  one.send(`${asUser(w.f)} begin; ${reasonSql(w, w.events[0])}`);
  await waitFor(() => one.peek().out.includes('reason=planned'), 'first completion inside its transaction');
  two.send(`${asUser(w.b)} ${reasonSql(w, w.events[0])}`);
  await waitFor(() => pg.lockWaiters() >= 1, 'second completion waiting on the event row');
  one.send('commit;');
  const [a, b] = await Promise.all([one.end(), two.end()]);
  assert.equal(a.err + b.err, '');
  assert.match(b.out, /reason=already/, 'already_completed answer, unchanged');
  assert.equal(xpOf(w), 35);
  assert.equal(rows(w), '35');
});
