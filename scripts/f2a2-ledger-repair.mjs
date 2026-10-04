// US 2.0 F2A.2 step 5–6: the production migration-ledger repair.
//
//   node scripts/f2a2-ledger-repair.mjs --expect-head <sha>            dry run: checks, prints the commands
//   node scripts/f2a2-ledger-repair.mjs --expect-head <sha> --execute  runs them
//
// It runs only `supabase migration list|repair` and `supabase db push --dry-run`,
// all with --linked. `migration repair` writes supabase_migrations.schema_migrations
// rows and nothing else: it never executes migration SQL.
//
// Guards before any write:
//   * the working tree is clean and HEAD is the reviewed commit (--expect-head),
//     so the baseline row recorded as applied is the committed file;
//   * supabase/baseline/LEDGER_REPAIR.json is what the generator prints;
//   * `migration list --linked` shows exactly the expected 83 remote versions
//     and only the baseline as a local file. Anything else aborts.
// After the write it requires: one row, baseline local = remote, and a
// `db push --dry-run` that reports nothing to push.
//
// SUPABASE_CLI overrides the command (e.g. "npx supabase").
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ROOT, loadCapture } = require('./supabase-baseline/evidence.cjs');
const { repairSet, parseMigrationList } = require('./supabase-baseline/repair.cjs');

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const expectHead = args[args.indexOf('--expect-head') + 1];
const cli = (process.env.SUPABASE_CLI || 'supabase').split(' ');

function fail(message) {
  console.error(`ABORT: ${message}`);
  process.exit(1);
}

function run(command, commandArgs, { capture = false } = {}) {
  const res = spawnSync(command, commandArgs, {
    cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (res.error) fail(`${command} ${commandArgs.join(' ')}: ${res.error.message}`);
  if (capture) process.stdout.write(`${res.stdout}${res.stderr}`);
  if (res.status !== 0) fail(`${command} ${commandArgs.join(' ')} exited ${res.status}`);
  return capture ? `${res.stdout}\n${res.stderr}` : '';
}
const supabase = (commandArgs, options) => {
  console.log(`\n$ ${cli.join(' ')} ${commandArgs.join(' ')}`);
  return run(cli[0], [...cli.slice(1), ...commandArgs], options);
};

// 1. The reviewed commit, clean.
if (!expectHead || expectHead.startsWith('--')) fail('pass --expect-head <reviewed commit sha>');
const head = run('git', ['rev-parse', 'HEAD'], { capture: true }).trim().split('\n')[0];
if (!head.startsWith(expectHead)) fail(`HEAD is ${head}, expected ${expectHead}`);
if (run('git', ['status', '--porcelain'], { capture: true }).trim()) fail('working tree is not clean');

// 2. The committed repair set is the generated one.
const set = repairSet(loadCapture());
const committed = fs.readFileSync(path.join(ROOT, 'supabase/baseline/LEDGER_REPAIR.json'), 'utf8');
if (committed !== `${JSON.stringify(set, null, 2)}\n`) fail('supabase/baseline/LEDGER_REPAIR.json is stale');
if (!fs.existsSync(path.join(ROOT, set.apply.file))) fail(`${set.apply.file} is missing`);
const [listCmd, revertCmd, applyCmd, , dryRunCmd] = set.commands;

console.log(`Project ${set.project_ref}: revert ${set.revert.length} ledger versions, record ${set.apply.version} as applied.`);
for (const c of set.commands) console.log(`  ${cli.join(' ')} ${c.join(' ')}`);
if (!execute) {
  console.log('Dry run only. Re-run with --execute to perform the repair.');
  process.exit(0);
}

// 3. Production is what the repair set expects, right before the write.
const before = parseMigrationList(supabase(listCmd, { capture: true }));
const remote = before.filter((r) => r.remote).map((r) => r.remote).sort();
const local = before.filter((r) => r.local).map((r) => r.local).sort();
if (JSON.stringify(remote) !== JSON.stringify([...set.revert].sort())) fail('remote ledger differs from the expected 83 versions');
if (JSON.stringify(local) !== JSON.stringify([set.apply.version])) fail(`local migrations are ${local.join(', ')}, expected only ${set.apply.version}`);

// 4. The only production writes: ledger rows.
supabase(revertCmd);
supabase(applyCmd);

// 5. Prove it is clean.
const after = parseMigrationList(supabase(listCmd, { capture: true }));
if (after.length !== 1 || after[0].local !== set.apply.version || after[0].remote !== set.apply.version) {
  fail(`migration list after repair is ${JSON.stringify(after)}`);
}
const dry = supabase(dryRunCmd, { capture: true });
if (!/up to date/i.test(dry)) fail('db push --dry-run did not report "up to date"');
console.log('F2A.2 ledger repair complete: one ledger row, local = remote, db push --dry-run is a no-op.');
