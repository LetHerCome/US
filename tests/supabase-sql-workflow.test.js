// "Supabase SQL (manual)": one reviewed migration file, applied only on a
// button press, behind the founder's approval, PRODUZIONE for production, and
// a check that can read only content and cron tables.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/supabase-sql-apply.yml'), 'utf8');
const has = (text) => assert.ok(wf.includes(text), text);

test('supabase sql workflow: manual only, approved, confirmed, pinned', () => {
  assert.match(wf, /^on:\n  workflow_dispatch:\n/m);
  assert.doesNotMatch(wf, /^\s*(push|pull_request|schedule):/m);
  has('environment: supabase-deploy');
  has('permissions:\n  contents: read');
  has('if [ "$CONFIRM" != "PRODUZIONE" ]');
  has('production)');
  has('echo "PROJECT_REF=iiakdfsxpywdkxravqjh"');
  has('echo "PROJECT_REF=dugmhngrfkuieeletatb"');
  has('uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2');
  has('persist-credentials: false');
  has('echo "::add-mask::${SUPABASE_ACCESS_TOKEN}"');
});

test('supabase sql workflow: only a migration file that exists on the ref, never free SQL', () => {
  has('if ! [[ "$MIGRATION" =~ ^[0-9]{14}_[a-z0-9_]+\\.sql$ ]] || [ ! -f "supabase/migrations/$MIGRATION" ]; then');
  has('readFileSync("supabase/migrations/" + process.env.MIGRATION, "utf8")');
  has('https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query');
  assert.doesNotMatch(wf, /schema_migrations/, 'the migration ledger is not touched');
});

test('supabase sql workflow: the check reads only content and cron tables', () => {
  has('if (!/^select\\s/i.test(sql) || /;|--|\\/\\*/.test(sql))');
  for (const table of ['public.daily_question_templates', 'public.daily_questions', 'public.game_v2_catalog', 'cron.job']) has(`"${table}"`);
  for (const table of ['profiles', 'moments', 'shared_messages', 'daily_answers', 'auth.users']) assert.ok(!wf.includes(`"public.${table}"`) && !wf.includes(`"${table}"`), table);
});

test('supabase sql workflow: the check logic accepts content reads and refuses everything else', () => {
  const start = wf.indexOf("node -e '\n") + "node -e '\n".length;
  const script = wf.slice(start, wf.indexOf("\n            '\n", start));
  const { spawnSync } = require('node:child_process');
  const run = (sql) => spawnSync(process.execPath, ['-e', script], { env: { ...process.env, CHECK_SQL: sql } }).status;
  assert.equal(run("select id, question from public.daily_question_templates where id in ('profonda-03') order by id"), 0);
  assert.equal(run('select jobname, active from cron.job'), 0);
  for (const sql of [
    'select * from public.profiles',
    'select 1',
    'select * from public.daily_questions q, public.profiles p',
    'select * from public.daily_questions; drop table x',
    'update public.game_v2_catalog set active = false',
    'select * from (select * from public.moments) m',
    'select * from public.daily_questions join auth.users on true'
  ]) assert.notEqual(run(sql), 0, sql);
});
