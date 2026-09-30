// Real PostgreSQL server for Game V2 two-connection tests (an embedded
// single-connection engine cannot interleave sessions). Same approach as the
// M9E/M7D race tests: a throwaway cluster under /usr/lib/postgresql via
// runuser, unix socket only, removed afterwards. Callers skip, with the
// reason, when no server binaries / postgres user / root are available.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const { FIXTURE, GAME_MIGRATIONS, ROOT } = require('./game-v2-db');

const PG_BIN = ['/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/15/bin'].find((d) => fs.existsSync(path.join(d, 'postgres')));
function ok(cmd, args) { try { return execFileSync(cmd, args, { stdio: 'pipe' }).toString(); } catch { return ''; } }
const CAN_RUN = Boolean(PG_BIN) && process.getuid?.() === 0 && Boolean(ok('id', ['postgres'])) && fs.existsSync('/usr/sbin/runuser') && Boolean(ok('psql', ['--version']));
const SKIP = CAN_RUN ? false : 'no local PostgreSQL server binaries / postgres OS user / root available';

function startServer(port) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'us-pg-game-v2-'));
  fs.chmodSync(dir, 0o755);
  const sock = path.join(dir, 'sock');
  const data = path.join(dir, 'data');
  const asPg = (cmd, args) => execFileSync('runuser', ['-u', 'postgres', '--', cmd, ...args], { stdio: 'pipe' });
  execFileSync('install', ['-d', '-o', 'postgres', '-g', 'postgres', data, sock]);
  asPg(path.join(PG_BIN, 'initdb'), ['-D', data, '-A', 'trust', '-U', 'postgres']);
  asPg(path.join(PG_BIN, 'pg_ctl'), ['-D', data, '-o', `-c listen_addresses= -c unix_socket_directories=${sock} -p ${port}`, '-w', '-l', path.join(data, 'server.log'), 'start']);
  execFileSync('createdb', ['-h', sock, '-p', String(port), '-U', 'postgres', 'us']);
  const env = { ...process.env, PGHOST: sock, PGPORT: String(port), PGUSER: 'postgres', PGDATABASE: 'us' };
  const args = ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=0'];
  const sql = (text) => execFileSync('psql', [...args, '-c', text], { env }).toString().trim();
  const file = (f) => execFileSync('psql', [...args, '-v', 'ON_ERROR_STOP=1', '-f', f], { env });
  sql(FIXTURE);
  for (const f of GAME_MIGRATIONS) file(path.join(ROOT, 'supabase/migrations', f));
  function session() {
    const p = spawn('psql', args, { env });
    let out = ''; let err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    const closed = new Promise((resolve) => p.on('close', resolve));
    return {
      send: (text) => p.stdin.write(text + '\n'),
      peek: () => ({ out, err }),
      end: async () => {
        p.stdin.end();
        const timer = setTimeout(() => p.kill('SIGKILL'), 20000);
        await closed; clearTimeout(timer);
        return { out, err };
      },
    };
  }
  const stop = () => {
    try { execFileSync('runuser', ['-u', 'postgres', '--', path.join(PG_BIN, 'pg_ctl'), '-D', data, '-m', 'immediate', 'stop'], { stdio: 'pipe' }); } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  };
  const lockWaiters = () => Number(sql(`select count(*) from pg_stat_activity where datname='us' and wait_event_type='Lock'`));
  return { sql, session, stop, lockWaiters };
}

const asUser = (uid) => `set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`;
async function waitFor(fn, what, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return; await new Promise((r) => setTimeout(r, 40)); }
  throw new Error(`timeout waiting for ${what}`);
}

module.exports = { CAN_RUN, SKIP, startServer, asUser, waitFor };
