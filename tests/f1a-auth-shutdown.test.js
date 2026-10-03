// US 2.0 F1A — Legacy auth shutdown regression tests.
//
// 1. Frontend: the shipped runtime exposes email + password login only; no
//    anonymous sign-in, OTP/Magic Link, SMS, signup, pairing or
//    anonymous -> email upgrade path remains.
// 2. Auth config (supabase/config.toml, applied with `supabase config push`):
//    signup, anonymous sign-ins, manual linking and Twilio SMS are declared
//    off, and site_url/redirects point at the canonical Cloudflare Pages
//    origin only.
// 3. claim_us_role: the F1A migration is exercised against an embedded
//    Postgres (@electric-sql/pglite) seeded with the production ACL, and must
//    leave the function intact but not executable by anon/authenticated.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const F1A_MIGRATION = 'supabase/migrations/20261003160000_f1a_revoke_claim_us_role.sql';
const CLAIM_ROLE_LATEST = 'supabase/migrations/20260929121430_m7a_claim_us_role_bucket_items_transfer.sql';
const CANONICAL_ORIGIN = 'https://us-a33.pages.dev';

function runtimeFiles() {
  const script = read('scripts/build-cloudflare-pages.mjs');
  const list = script.match(/const RUNTIME_FILES = \[([\s\S]*?)\];/)[1];
  return [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((f) => /\.(js|html)$/.test(f));
}

// ------------------------------------------------------------- frontend

test('F1A: the shipped runtime never invokes a legacy auth entry point', () => {
  const files = runtimeFiles();
  assert.ok(files.includes('app.js') && files.includes('settings.js') && files.includes('index.html'));
  const forbidden = [
    [/signInAnonymously/, 'anonymous sign-in'],
    [/signInWithOtp|verifyOtp|shouldCreateUser|emailRedirectTo|magic\s*link/i, 'OTP / Magic Link'],
    [/\.signUp\s*\(/, 'self signup'],
    [/signInWithIdToken|signInWithOAuth|linkIdentity|signInWithSSO/, 'other providers / identity linking'],
    [/sb\.auth\.\w+\(\{[^}]*\bphone\b/, 'SMS / phone auth'],
    // calendar.js keeps a historical comment naming claim_us_role; only calls count.
    [/rpc\(\s*['"`]claim_us_role|from\(\s*['"`]couple_invites|pairCode|pairBtn|authPair/, 'invite pairing'],
    [/updateUser\(\{\s*email/, 'anonymous -> email upgrade'],
    [/us:account-upgrade|requestAccountEmailUpgrade/, 'anonymous -> email upgrade state'],
  ];
  for (const file of files) {
    const src = read(file);
    for (const [pattern, label] of forbidden) {
      assert.doesNotMatch(src, pattern, `${file}: ${label}`);
    }
  }
});

test('F1A: the login overlay is exactly email + password', () => {
  const html = read('index.html');
  const overlay = html.match(/<div class="auth-overlay" id="authOverlay">[\s\S]*?\n<\/div>\n/)[0];
  const steps = [...overlay.matchAll(/class="auth-step[^"]*" id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(steps, ['authLogin'], 'one auth step only');
  const inputs = [...overlay.matchAll(/<input[^>]*>/g)].map((m) => m[0]);
  assert.equal(inputs.length, 2);
  assert.match(inputs[0], /id="loginEmail"[^>]*type="email"/);
  assert.match(inputs[1], /id="loginPassword"[^>]*type="password"/);
  assert.doesNotMatch(overlay, /registr|sign ?up|crea (un )?account|codice|invito|magic|\bsms\b|numero di telefono/i);

  const app = read('app.js');
  const signIns = [...app.matchAll(/sb\.auth\.(signIn\w*)\(/g)].map((m) => m[1]);
  assert.deepEqual(signIns, ['signInWithPassword'], 'signInWithPassword is the only sign-in call');
  assert.match(app, /sb\.auth\.signInWithPassword\(\{email,password\}\)/);
  // A permanent account without a US profile stays on the login step.
  assert.match(app, /never fall back to anonymous pairing\. The front door is password-only\.\s*\n\s*showAuthStep\('authLogin'\)/);
});

test('F1A: Settings no longer carries the anonymous account upgrade row', () => {
  const html = read('index.html');
  const settings = read('settings.js');
  assert.doesNotMatch(html, /data-us-setting="account-upgrade"|usAccountUpgradeRow|Proteggi il tuo account/);
  assert.doesNotMatch(settings, /account-upgrade|accountUpgradeModal|is_anonymous/);
});

// ----------------------------------------------------------- auth config

function authConfig() {
  const toml = read('supabase/config.toml');
  const auth = toml.match(/^\[auth\]\n([\s\S]*?)(?=^\[)/m)?.[1] || '';
  const twilio = toml.match(/^\[auth\.sms\.twilio\]\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m)?.[1] || '';
  return { toml, auth, twilio };
}

test('F1A: Auth config declares signup, anonymous, manual linking and Twilio off', () => {
  const { auth, twilio } = authConfig();
  assert.match(auth, /^enable_signup = false$/m);
  assert.match(auth, /^enable_anonymous_sign_ins = false$/m);
  assert.match(auth, /^enable_manual_linking = false$/m);
  assert.match(twilio, /^enabled = false$/m);
  // config push only writes declared properties: never declare secrets here.
  assert.doesNotMatch(auth + twilio, /auth_token|secret|password|account_sid/i);
});

test('F1A: Auth URLs point only at the canonical Cloudflare Pages origin', () => {
  const { toml, auth } = authConfig();
  assert.match(auth, new RegExp(`^site_url = "${CANONICAL_ORIGIN.replace(/\./g, '\\.')}"$`, 'm'));
  const redirects = JSON.parse(auth.match(/^additional_redirect_urls = (\[.*\])$/m)[1]);
  assert.deepEqual(redirects, [CANONICAL_ORIGIN]);
  assert.doesNotMatch(toml, /vercel\.app|127\.0\.0\.1|localhost/);
  // The canonical origin is the one the repo already treats as production.
  assert.match(read('docs/cloudflare-pages-migration.md'), new RegExp(`production frontend: ${CANONICAL_ORIGIN.replace(/\./g, '\\.')}`));
  assert.match(read('integrations/widgets/scriptable/US-Noi.js'), new RegExp(`APP_URL = "${CANONICAL_ORIGIN.replace(/\./g, '\\.')}/"`));
});

// --------------------------------------------------------- claim_us_role

test('F1A migration: revoke-only, no drop, no data or definer change', () => {
  const sql = read(F1A_MIGRATION);
  const code = sql.replace(/--.*$/gm, '').replace(/'[^']*'/g, "''");
  assert.match(code, /revoke execute on function public\.claim_us_role\(text, text\) from public, anon, authenticated;/);
  assert.doesNotMatch(code, /\bdrop\b|\bdelete\b|\binsert\b|\bupdate\b|\btruncate\b|\bgrant\b/i);
  assert.doesNotMatch(code, /create (or replace )?function|security definer|alter (table|function)|policy/i);
  assert.doesNotMatch(code, /service_role/);
});

async function claimRoleFixture() {
  const { PGlite } = require('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    grant usage on schema public to anon, authenticated, service_role;
    create schema auth;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    set check_function_bodies = off;
  `);
  // The real, latest production definition (verified byte-identical to the
  // live prosrc during F1A, modulo CRLF).
  await db.exec(read(CLAIM_ROLE_LATEST));
  // Production ACL before F1A: {postgres=X, authenticated=X, service_role=X}.
  await db.exec(`
    revoke execute on function public.claim_us_role(text, text) from public;
    grant execute on function public.claim_us_role(text, text) to authenticated, service_role;
    set check_function_bodies = on;
  `);
  return db;
}

const can = async (db, role) => (await db.query(
  `select has_function_privilege($1, 'public.claim_us_role(text, text)', 'execute') as ok`, [role],
)).rows[0].ok;

const definition = async (db) => (await db.query(
  `select md5(prosrc) as src, prosecdef as secdef, proconfig::text as cfg
     from pg_proc where oid = 'public.claim_us_role(text, text)'::regprocedure`,
)).rows[0];

test('F1A: claim_us_role is not executable by anon or authenticated after the migration', async () => {
  const db = await claimRoleFixture();
  try {
    assert.equal(await can(db, 'authenticated'), true, 'fixture reproduces the exploitable production ACL');
    const before = await definition(db);

    await db.exec(read(F1A_MIGRATION));

    assert.equal(await can(db, 'anon'), false);
    assert.equal(await can(db, 'authenticated'), false);
    assert.equal(await can(db, 'service_role'), true, 'internal role left unaffected');
    await db.exec('create role probe_public');
    assert.equal(await can(db, 'probe_public'), false, 'no PUBLIC grant either');

    const after = await definition(db);
    assert.deepEqual(after, before, 'body, SECURITY DEFINER flag and search_path untouched');
    assert.equal(after.secdef, true);

    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, ['00000000-0000-4000-8000-000000000001']);
      await assert.rejects(
        db.query(`select public.claim_us_role('ANY-CODE', 'francesco')`),
        /permission denied for function claim_us_role/,
        `${role} must be refused before the body runs`,
      );
      await db.exec('reset role');
    }

    // Re-applying is harmless (idempotent revoke + self-check).
    await db.exec(read(F1A_MIGRATION));
    assert.equal(await can(db, 'authenticated'), false);
  } finally {
    await db.close();
  }
});

test('F1A: the migration self-check aborts if a client grant survives', async () => {
  const db = await claimRoleFixture();
  try {
    const sql = read(F1A_MIGRATION);
    const selfCheck = sql.slice(sql.indexOf('do $$'));
    await assert.rejects(db.exec(selfCheck), /still executable by a client role/);
  } finally {
    await db.close();
  }
});
