// The forward-migration boundary (F2A.1 Phase G), computed from the repo
// migration files and the production ledger captured in F2A (b01). It only
// describes the plan F2A.2 executes; it moves no file and touches no ledger.
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./evidence.cjs');

const MIGRATIONS = path.join(ROOT, 'supabase/migrations');

// Same migration, recorded in the ledger under another version (F2A, matched
// by name; effect present in production).
const ALTERNATE_LEDGER_VERSION = {
  20260831131130: '20260831212415',
  20260831213000: '20260831213824',
  20260923180800: '20260923200535',
  20260923210000: '20260924072631',
  20260924160000: '20260928050608',
  20260924194500: '20260925143951',
  20261001133906: '20261001144011',
  20261002181500: '20261002171243',
  20261002181501: '20261002171949',
  20261002190000: '20261002181136',
};

// What replaying the file on top of production would do today (F2A replay
// analysis + F2A.1 drift resolution from the captured definitions). A file is only safe to keep executable
// if replaying it is impossible or a no-op.
const REPLAY_HAZARDS = {
  20260831213000: 'succeeds and downgrades public.widget_send_think_internal to its 2026-08-31 body',
  20260923210000: 'succeeds and downgrades get/set_notification_preference(s) to their pre-M11D bodies',
  20260924160000: 'mostly re-runnable; overwrites public.claim_left_for_you_cleanup (same logic, comments restored)',
  20261002181500: 'partly re-runnable; downgrades public.get_progression_v1 and public.equip_progression_reward',
  20261002181501: 'succeeds and downgrades public.equip_progression_reward (superseded by Rewards V2)',
  20260922120726: 'succeeds and replaces public.set_think_reaction with a body that fails at run time (alias "message" collides with the record variable)',
  20260922120945: 'succeeds and changes the send_think unresolved-conflict errcode from P0001 back to 23505',
  20260928210000: 'cannot apply: calendar_reminders_allday_offset_check uses a sub-query in CHECK (production uses calendar_reminder_offset_valid)',
  20260930105724: 're-grants functions that F1B revoked',
};

function repoMigrations() {
  return fs.readdirSync(MIGRATIONS).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
}

function buildCutoff(f2a) {
  const ledger = f2a.f2a_01_ledger.ledger;
  const ledgerVersions = new Map(ledger.map((r) => [r.v, r.n]));
  const files = repoMigrations();
  const byLedgerVersion = new Map();
  const repo = files.map((file) => {
    const version = file.slice(0, 14);
    let recordedAs = null;
    let match = null;
    if (ledgerVersions.has(version)) { recordedAs = version; match = 'same_version'; }
    else if (ALTERNATE_LEDGER_VERSION[version] && ledgerVersions.has(ALTERNATE_LEDGER_VERSION[version])) {
      recordedAs = ALTERNATE_LEDGER_VERSION[version]; match = 'alternate_version';
    }
    if (!recordedAs) throw new Error(`${file} is not in the production ledger: it would be a forward migration`);
    byLedgerVersion.set(recordedAs, file);
    return {
      file, version, recorded_as: recordedAs, match,
      after_f2a2: 'history_only',
      replay_hazard: REPLAY_HAZARDS[version] || null,
    };
  });
  const ledgerRows = ledger.map((r) => ({
    version: r.v, name: r.n,
    repo_file: byLedgerVersion.get(r.v) || null,
    class: byLedgerVersion.has(r.v)
      ? (repo.find((x) => x.recorded_as === r.v).match === 'same_version' ? 'repo_same_version' : 'repo_alternate_version')
      : 'pre_repo_base',
    after_f2a2: 'reverted_in_ledger_after_export',
  }));
  const tip = ledger[ledger.length - 1].v;
  return {
    generated_by: 'scripts/build-supabase-baseline.mjs',
    source: 'supabase/migrations + docs/us-2.0/F2A_PRODUCTION_RESULTS_01_05.json (b01 ledger)',
    production_ledger_tip: tip,
    baseline_represents: `production schema at ledger tip ${tip} (F1C), captured read-only in F2A.1`,
    baseline_version: 'chosen in F2A.2: one new 14-digit version greater than every ledger version',
    forward_migrations: repo.filter((r) => r.after_f2a2 === 'forward').map((r) => r.file),
    counts: {
      repo_files: repo.length,
      repo_same_version: repo.filter((r) => r.match === 'same_version').length,
      repo_alternate_version: repo.filter((r) => r.match === 'alternate_version').length,
      ledger_rows: ledgerRows.length,
      ledger_pre_repo_base: ledgerRows.filter((r) => r.class === 'pre_repo_base').length,
      replay_hazards: repo.filter((r) => r.replay_hazard).length,
    },
    repo,
    ledger: ledgerRows,
  };
}

module.exports = { buildCutoff, repoMigrations, ALTERNATE_LEDGER_VERSION, REPLAY_HAZARDS };
