// Static guarantees of the manual keystore recovery workflow. The repository is
// public: the workflow must never start on its own, never print or upload key
// material in clear, and never change a secret.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/android-signing-recovery.yml'), 'utf8');

test('recovery runs only by hand, from main, for the owner, with a typed confirmation', () => {
  const on = workflow.slice(workflow.indexOf('\non:'), workflow.indexOf('\npermissions:'));
  assert.match(on, /workflow_dispatch:/);
  for (const trigger of ['push:', 'pull_request', 'schedule:', 'workflow_run:', 'repository_dispatch:']) {
    assert.ok(!on.includes(trigger), `unexpected trigger ${trigger}`);
  }
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main' && github\.actor == github\.repository_owner && inputs\.confirm == 'RECUPERA-KEYSTORE-US'/);
  assert.match(workflow, /permissions:\n  contents: read\n  actions: read\n/);
});

test('key material leaves the runner only inside a short-lived encrypted archive', () => {
  const uploads = workflow.match(/actions\/upload-artifact@v4/g) || [];
  assert.equal(uploads.length, 1);
  assert.match(workflow, /path: \$\{\{ runner\.temp \}\}\/recovery\/out\/US-signing-recovery\.7z/);
  assert.match(workflow, /retention-days: 1\n/);
  assert.match(workflow, /7z a -t7z -mhe=on "-p\$ARCHIVE_PASSWORD"/);
  assert.match(workflow, /"\$\{#ARCHIVE_PASSWORD\}" -lt 24/);
  assert.match(workflow, /wrong-password-check/);
  assert.match(workflow, /if: always\(\)\n\s+run: rm -rf "\$RUNNER_TEMP\/recovery"/);
});

test('passwords are masked before use and never echoed or exported', () => {
  for (const name of ['OLD_STORE', 'OLD_KEY', 'NEW_PASS']) {
    const mask = workflow.indexOf(`echo "::add-mask::$${name}"`);
    const firstUse = workflow.indexOf(`:env ${name}`);
    assert.ok(mask > 0 && firstUse > mask, `${name} must be masked before keytool uses it`);
    assert.ok(!new RegExp(`echo "[^"]*\\$${name}[^"]*" >> "\\$GITHUB_(ENV|OUTPUT)"`).test(workflow), `${name} must not leave the step`);
  }
  assert.ok(!/set -x|set -o xtrace/.test(workflow));
  assert.ok(!workflow.includes('GITHUB_ENV'), 'no recovery value may be exported to later steps');
  assert.ok(!/-storepass "\$|-storepass \$/.test(workflow), 'passwords go to keytool through :env, not argv');
});

test('the certificate must match the current internal APKs before and after re-wrapping', () => {
  assert.match(workflow, /--workflow android-internal-release\.yml --branch main --status success/);
  assert.match(workflow, /Signer #1 certificate SHA-256 digest/);
  assert.match(workflow, /\[ "\$original" != "\$EXPECTED" \]/);
  assert.match(workflow, /\[ "\$rotated" != "\$original" \]/);
  assert.ok(workflow.indexOf('"$original" != "$EXPECTED"') < workflow.indexOf('7z a -t7z'));
});

test('the workflow never generates a new signing key nor writes a secret', () => {
  assert.ok(!/-genkeypair|-genkey\b/.test(workflow));
  assert.ok(!/gh secret|secrets\/[A-Z_]+\s*-X|PUT .*secrets/.test(workflow));
  assert.match(workflow, /keytool -importkeystore -noprompt/);
});
