// F2A.2 ledger repair set (step 5): computed from the production ledger the
// F2A.1 capture recorded (c01). The repair reverts exactly these versions and
// records the baseline as applied. It deletes ledger rows only, never schema.
const { BASELINE_VERSION, BASELINE_NAME, BASELINE_FILE } = require('./migration.cjs');

function repairSet(capture) {
  const ledger = capture.f2a1_c01_meta.ledger;
  const versions = ledger.map((r) => r.v);
  if (new Set(versions).size !== versions.length) throw new Error('duplicate ledger version');
  if (!versions.every((v) => v < BASELINE_VERSION)) throw new Error(`a ledger version is not older than ${BASELINE_VERSION}`);
  return {
    generated_by: 'scripts/build-supabase-baseline.mjs',
    source: 'docs/us-2.0/F2A_1_PRODUCTION_CAPTURE_C01_C06.json (c01 ledger), re-verified by the F2A.2 preflight',
    project_ref: 'iiakdfsxpywdkxravqjh',
    expected_before: ledger.map((r) => ({ version: r.v, name: r.n, statements: r.stmts, md5: r.md5 })),
    revert: versions,
    apply: { version: BASELINE_VERSION, name: BASELINE_NAME, file: `supabase/migrations/${BASELINE_FILE}` },
    expected_after: [{ version: BASELINE_VERSION, name: BASELINE_NAME }],
    commands: [
      ['migration', 'list', '--linked'],
      ['migration', 'repair', '--linked', '--status', 'reverted', ...versions],
      ['migration', 'repair', '--linked', '--status', 'applied', BASELINE_VERSION],
      ['migration', 'list', '--linked'],
      ['db', 'push', '--dry-run', '--linked'],
    ],
  };
}

// Rows of `supabase migration list` as { local, remote } (blank = null).
function parseMigrationList(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 2) continue;
    const [local, remote] = cells;
    if (!/^\d{14}$/.test(local) && !/^\d{14}$/.test(remote)) continue;
    rows.push({ local: local || null, remote: remote || null });
  }
  return rows;
}

module.exports = { repairSet, parseMigrationList };

// F2A.2 step 3: the exported ledger (masked in the database) as history-only
// files under supabase/migrations_history/ledger/, one per version, plus an
// index. They record what production ran; nothing ever executes them.
function ledgerHistoryFiles(exported) {
  const rows = Object.keys(exported).filter((k) => /^f2a2_l\d\d_ledger$/.test(k)).sort()
    .flatMap((k) => exported[k] || []);
  const files = {};
  for (const r of rows) {
    files[`${r.v}_${r.n}.sql`] = [
      `-- Production ledger ${r.v} ${r.n}: the SQL supabase_migrations.schema_migrations`,
      '-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.',
      `-- ${r.stmts} statement(s); unmasked md5 ${r.md5}; ${r.redacted} secret-shaped value(s) masked in the database.`,
      '-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.',
      '',
      ...(r.statements || []).map((st) => `${st.replace(/\s+$/, '')};\n`),
    ].join('\n');
  }
  const index = rows.map(({ statements, ...rest }) => rest);
  files['LEDGER.json'] = `${JSON.stringify(index, null, 2)}\n`;
  return { rows, files };
}

module.exports.ledgerHistoryFiles = ledgerHistoryFiles;
