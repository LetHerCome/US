// Keystore recovery (workflow + scripts/android-signing-recovery.sh). The
// repository is public: the workflow must never start on its own, and key
// material may leave the runner only sealed for the founder's own certificate.
// The end-to-end cases use a throwaway keystore and certificate created here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'scripts/android-signing-recovery.sh');
const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/android-signing-recovery.yml'), 'utf8');
const script = fs.readFileSync(SCRIPT, 'utf8');
const TOOL = path.join(ROOT, 'scripts/windows/US-recupero-keystore.cmd');
const pwsh = ['pwsh', process.env.US_TEST_PWSH].filter(Boolean).find((bin) => spawnSync(bin, ['-NoProfile', '-Command', '1'], { stdio: 'ignore' }).status === 0);
const toolsAvailable = ['keytool', 'openssl', 'jq', 'python3'].every((tool) => spawnSync('sh', ['-c', `command -v ${tool}`]).status === 0);
const javaEnv = { ...process.env, JAVA_TOOL_OPTIONS: '' };

test('recovery runs only by hand, from main, for the owner, with a typed confirmation', () => {
  const on = workflow.slice(workflow.indexOf('\non:'), workflow.indexOf('\npermissions:'));
  assert.match(on, /workflow_dispatch:/);
  for (const trigger of ['push:', 'pull_request', 'schedule:', 'workflow_run:', 'repository_dispatch:']) {
    assert.ok(!on.includes(trigger), `unexpected trigger ${trigger}`);
  }
  assert.match(on, /recipient_certificate:\n\s+description: .*\n\s+required: true/);
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main' && github\.actor == github\.repository_owner && inputs\.confirm == 'RECUPERA-KEYSTORE-US'/);
  assert.match(workflow, /permissions:\n  contents: read\n  actions: read\n/);
});

test('only the sealed file is uploaded, for one day, and the runner is wiped', () => {
  assert.equal((workflow.match(/actions\/upload-artifact@v4/g) || []).length, 1);
  assert.match(workflow, /path: \$\{\{ runner\.temp \}\}\/recovery\/out\/US-signing-recovery\.p7m/);
  assert.match(workflow, /retention-days: 1\n/);
  assert.match(workflow, /if: always\(\)\n\s+run: rm -rf "\$RUNNER_TEMP\/recovery"/);
  assert.ok(!/ARTIFACT_PASSWORD|7z /.test(workflow), 'no shared archive password, no fallback');
  assert.match(script, /openssl cms -encrypt -binary -aes-256-cbc/);
});

test('the signing certificate is pinned and cross-checked with the newest and oldest signed runs', () => {
  assert.match(workflow, /PINNED_CERT_SHA256: f5e17f8e0bd82f2aca64e352e87e312f036c3436c4227461c4cc1336ba7eb782\n/);
  assert.match(workflow, /--workflow android-internal-release\.yml --branch main --status success --limit 100/);
  assert.match(workflow, /newest=.*head -1/);
  assert.match(workflow, /oldest=.*tail -1/);
  assert.match(workflow, /certificate SHA-256 digest:/);
});

test('passwords are masked, go to keytool through the environment, never to later steps', () => {
  for (const name of ['OLD_STORE', 'OLD_KEY', 'NEW_PASS']) {
    assert.ok(script.indexOf(`mask "$${name}"`) > 0 && script.indexOf(`mask "$${name}"`) < script.indexOf(`:env ${name}`), `${name} masked before use`);
  }
  assert.ok(!/set -x|set -o xtrace/.test(script + workflow));
  assert.ok(!/GITHUB_ENV/.test(script + workflow));
  assert.ok(!/-storepass "\$|-storepass \$/.test(script));
  assert.ok(!/-genkeypair|-genkey\b|gh secret/.test(script + workflow), 'never a new signing key, never a secret write');
});

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'us-recovery-test-'));
  const run = (cmd, args) => execFileSync(cmd, args, { cwd: dir, env: javaEnv, stdio: ['ignore', 'pipe', 'ignore'] });
  run('keytool', ['-genkeypair', '-keystore', 'old.jks', '-storetype', 'JKS', '-storepass', 'oldstorepass', '-keypass', 'oldkeypass', '-alias', 'us-internal', '-keyalg', 'RSA', '-keysize', '2048', '-dname', 'CN=test', '-validity', '1']);
  const pinned = execFileSync('sh', ['-c', 'keytool -exportcert -alias us-internal -keystore old.jks -storepass oldstorepass 2>/dev/null | sha256sum | cut -d" " -f1'], { cwd: dir, env: javaEnv }).toString().trim();
  const bundle = Buffer.from(JSON.stringify({ keystoreBase64: fs.readFileSync(path.join(dir, 'old.jks')).toString('base64'), storePassword: 'oldstorepass', keyAlias: 'us-internal', keyPassword: 'oldkeypass' })).toString('base64');
  const recipient = (bits, name) => {
    run('openssl', ['req', '-x509', '-newkey', `rsa:${bits}`, '-nodes', '-keyout', `${name}.key`, '-out', `${name}.pem`, '-days', '2', '-subj', '/CN=US signing recovery']);
    run('openssl', ['x509', '-in', `${name}.pem`, '-outform', 'DER', '-out', `${name}.der`]);
    return fs.readFileSync(path.join(dir, `${name}.der`)).toString('base64');
  };
  return { dir, pinned, bundle, recipient4096: recipient(4096, 'r4096'), recipient2048: recipient(2048, 'r2048') };
}

function recover(fx, overrides = {}) {
  const work = path.join(fx.dir, `work-${Math.random().toString(36).slice(2)}`);
  const env = { ...javaEnv, SIGNING_BUNDLE_B64: fx.bundle, RECIPIENT_CERT_B64: fx.recipient4096, PINNED_CERT_SHA256: fx.pinned, REFERENCE_CERT_SHA256: `${fx.pinned} ${fx.pinned}`, WORK_DIR: work, GITHUB_ACTIONS: '', ...overrides };
  const result = spawnSync('bash', [SCRIPT], { env, encoding: 'utf8' });
  const out = path.join(work, 'out');
  return { ...result, work, files: fs.existsSync(out) ? fs.readdirSync(out) : [] };
}

test('end to end: same certificate, new password, sealed for the recipient only, minimal payload', { skip: !toolsAvailable }, () => {
  const fx = fixture();
  const result = recover(fx);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(result.files, ['US-signing-recovery.p7m']);
  assert.ok(!result.stdout.includes('oldstorepass') && !result.stdout.includes('oldkeypass'));
  assert.deepEqual(fs.readdirSync(result.work).sort(), ['out', 'recipient.der', 'recipient.pem'], 'no plaintext key material left behind');

  const opened = path.join(fx.dir, 'opened');
  execFileSync('openssl', ['cms', '-decrypt', '-binary', '-inform', 'DER', '-in', path.join(result.work, 'out/US-signing-recovery.p7m'), '-inkey', path.join(fx.dir, 'r4096.key'), '-out', path.join(fx.dir, 'payload.zip')]);
  execFileSync('python3', ['-m', 'zipfile', '-e', path.join(fx.dir, 'payload.zip'), opened]);
  assert.deepEqual(fs.readdirSync(opened).sort(), ['LEGGIMI.txt', 'NUOVO-VALORE-ANDROID_SIGNING_BUNDLE_B64.txt', 'us-internal-signing.p12']);
  const secret = JSON.parse(Buffer.from(fs.readFileSync(path.join(opened, 'NUOVO-VALORE-ANDROID_SIGNING_BUNDLE_B64.txt'), 'utf8'), 'base64').toString());
  assert.equal(secret.keyAlias, 'us-internal');
  assert.equal(secret.storePassword.length, 32);
  assert.notEqual(secret.storePassword, 'oldstorepass');
  fs.writeFileSync(path.join(fx.dir, 'new.p12'), Buffer.from(secret.keystoreBase64, 'base64'));
  const rotated = execFileSync('sh', ['-c', 'keytool -exportcert -alias us-internal -keystore new.p12 -storepass:env P 2>/dev/null | sha256sum | cut -d" " -f1'], { cwd: fx.dir, env: { ...javaEnv, P: secret.storePassword } }).toString().trim();
  assert.equal(rotated, fx.pinned);
  assert.ok(!fs.readFileSync(path.join(opened, 'LEGGIMI.txt'), 'utf8').includes('oldstorepass'));
  fs.rmSync(fx.dir, { recursive: true, force: true });
});

test('every failure leaves nothing to upload', { skip: !toolsAvailable }, () => {
  const fx = fixture();
  const other = 'a'.repeat(64);
  const cases = {
    'pinned fingerprint mismatch': { PINNED_CERT_SHA256: other, REFERENCE_CERT_SHA256: other },
    'signed-run fingerprint mismatch': { REFERENCE_CERT_SHA256: `${fx.pinned} ${other}` },
    'no signed-run reference': { REFERENCE_CERT_SHA256: '' },
    'missing recipient': { RECIPIENT_CERT_B64: '' },
    'weak recipient key': { RECIPIENT_CERT_B64: fx.recipient2048 },
    'invalid recipient certificate': { RECIPIENT_CERT_B64: Buffer.from('not a certificate').toString('base64') },
    'incomplete signing bundle': { SIGNING_BUNDLE_B64: Buffer.from('{"keyAlias":"us-internal"}').toString('base64') },
    'missing signing bundle': { SIGNING_BUNDLE_B64: '' },
  };
  const shim = path.join(fx.dir, 'failing-cms');
  fs.mkdirSync(shim);
  const realOpenssl = execFileSync('sh', ['-c', 'command -v openssl']).toString().trim();
  fs.writeFileSync(path.join(shim, 'openssl'), `#!/bin/sh\n[ "$1" = cms ] && exit 1\nexec ${realOpenssl} "$@"\n`, { mode: 0o755 });
  cases['encryption failure'] = { PATH: `${shim}:${process.env.PATH}` };
  for (const [name, overrides] of Object.entries(cases)) {
    const result = recover(fx, overrides);
    assert.notEqual(result.status, 0, `${name} must fail`);
    assert.deepEqual(result.files, [], `${name}: nothing to upload`);
    assert.match(result.stdout, /::error::/, `${name}: explains the failure`);
    if (fs.existsSync(result.work)) {
      assert.ok(!fs.readdirSync(result.work).some((f) => /keystore|bundle|payload/.test(f)), `${name}: no plaintext left`);
    }
  }
  fs.rmSync(fx.dir, { recursive: true, force: true });
});

test('the Windows tool keeps the private key non-exportable and needs no password', () => {
  const tool = fs.readFileSync(TOOL, 'utf8');
  assert.ok(tool.includes('\r\n'), 'CRLF line endings for cmd.exe');
  assert.match(tool, /^<# : /);
  assert.match(tool, /-Type DocumentEncryptionCert/);
  assert.match(tool, /-KeyAlgorithm RSA -KeyLength 4096 -KeyExportPolicy NonExportable/);
  assert.match(tool, /-CertStoreLocation Cert:\\CurrentUser\\My/);
  assert.match(tool, /\$encoded = \[Convert\]::ToBase64String\(\$cert\.RawData\)/);
  assert.match(tool, /Set-Clipboard -Value \$encoded/);
  assert.match(tool, /\$answer -cne 'BACKUP FATTO'/);
  assert.ok(!/Export-PfxCertificate|\.Export\(|PrivateKey\.Export|Read-Host -AsSecureString/.test(tool));
  assert.match(tool, /Remove-Item -Path "Cert:\\CurrentUser\\My\\\$\(\$_\.Thumbprint\)" -DeleteKey/);
});

test('end to end: the Windows tool opens the sealed artifact', { skip: !toolsAvailable || !pwsh }, () => {
  const fx = fixture();
  const result = recover(fx);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const downloads = path.join(fx.dir, 'Downloads');
  fs.mkdirSync(downloads);
  execFileSync('python3', ['-m', 'zipfile', '-c', path.join(downloads, 'US-signing-recovery-sealed.zip'), path.join(result.work, 'out/US-signing-recovery.p7m')]);
  execFileSync('openssl', ['pkcs12', '-export', '-inkey', path.join(fx.dir, 'r4096.key'), '-in', path.join(fx.dir, 'r4096.pem'), '-out', path.join(fx.dir, 'r4096.pfx'), '-passout', 'pass:']);
  const destination = path.join(fx.dir, 'Desktop-recovered');
  const command = `$f='${TOOL}'; Invoke-Expression ((Get-Content -LiteralPath $f -Raw) -replace '(?s)^.*?#>\\r?\\n', '')`;
  const opened = spawnSync(pwsh, ['-NoProfile', '-Command', command], { encoding: 'utf8', env: { ...process.env, US_RECOVERY_NONINTERACTIVE: '1', US_RECOVERY_DOWNLOADS: downloads, US_RECOVERY_DESTINATION: destination, US_RECOVERY_TEST_PFX: path.join(fx.dir, 'r4096.pfx') } });
  assert.equal(opened.status, 0, opened.stdout + opened.stderr);
  assert.deepEqual(fs.readdirSync(destination).sort(), ['LEGGIMI.txt', 'NUOVO-VALORE-ANDROID_SIGNING_BUNDLE_B64.txt', 'us-internal-signing.p12']);
  assert.deepEqual(fs.readdirSync(downloads), ['US-signing-recovery-sealed.zip'], 'nothing is deleted before the backups');
  const cleanup = (confirm) => spawnSync(pwsh, ['-NoProfile', '-Command', command], { encoding: 'utf8', env: { ...process.env, US_RECOVERY_NONINTERACTIVE: '1', US_RECOVERY_DOWNLOADS: downloads, US_RECOVERY_DESTINATION: destination, US_RECOVERY_TEST_PFX: path.join(fx.dir, 'r4096.pfx'), US_RECOVERY_CONFIRM: confirm } });
  assert.equal(cleanup('si').status, 0);
  assert.ok(fs.existsSync(destination), 'clean-up needs the exact confirmation');
  assert.equal(cleanup('BACKUP FATTO').status, 0);
  assert.ok(!fs.existsSync(destination));
  assert.deepEqual(fs.readdirSync(downloads), []);
  fs.rmSync(fx.dir, { recursive: true, force: true });
});

test('a secret-free Windows smoke test covers the real certificate store and the double-click path', () => {
  const smoke = fs.readFileSync(path.join(ROOT, '.github/workflows/android-signing-recovery-windows-smoke.yml'), 'utf8');
  assert.ok(!/secrets\./.test(smoke), 'the smoke test never references a secret');
  assert.ok(!/upload-artifact/.test(smoke), 'the smoke test uploads nothing');
  assert.match(smoke, /runs-on: windows-latest/);
  assert.match(smoke, /branches-ignore: \[main\]/);
  assert.equal((smoke.match(/cmd \/c scripts\\windows\\US-recupero-keystore\.cmd/g) || []).length, 4);
  assert.match(smoke, /ExportParameters\(\$true\)/);
  assert.match(smoke, /1\.3\.6\.1\.4\.1\.311\.80\.1/);
  assert.match(smoke, /keystore bytes differ from the secret value/);
  assert.match(smoke, /sealed file deleted before the backups/);
  assert.match(smoke, /if: always\(\)/);
});

test('the documented SHA-256 of the Windows tool matches the file', async () => {
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256').update(fs.readFileSync(TOOL)).digest('hex');
  const doc = fs.readFileSync(path.join(ROOT, 'docs/native/ANDROID_SIGNING_RECOVERY.md'), 'utf8');
  assert.ok(doc.includes(hash), `update the hash in ANDROID_SIGNING_RECOVERY.md to ${hash}`);
});
