const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('M5G3 release coherency versions the composer assets and shell without touching private media cache', () => {
  const html = read('index.html');
  const version = JSON.parse(read('version.json')).version;
  const worker = read('service-worker.js');
  const build = html.match(/meta name="us-build" content="([^"]+)"/)?.[1];
  assert.ok(build);
  assert.equal(version, build);
  assert.ok(html.includes(`/left-for-you.css?v=${build}`));
  assert.ok(html.includes(`/left-for-you.js?v=${build}`));
  assert.ok(worker.includes(`const BUILD_ID = "${build}";`));
  assert.ok(worker.includes('const CACHE_NAME = `${SHELL_CACHE_PREFIX}${BUILD_ID}`;'));
  assert.match(worker, /const MEDIA_CACHE_NAME = "us-private-media-v1"/);
  assert.match(worker, /versioned\("\/left-for-you\.css"\)/);
  assert.match(worker, /versioned\("\/left-for-you\.js"\)/);
});

test('M5G3 camera button remains explicitly bound and opens the existing camera flow', () => {
  const html = read('index.html');
  const source = read('left-for-you.js');
  assert.match(html, /id="leftForYouComposerPhotoCamera"/);
  assert.match(source, /getElementById\('leftForYouComposerPhotoCamera'\)\?\.addEventListener\('click', openCamera\)/);
  assert.match(source, /composer\.cameraOpen = true/);
  assert.match(source, /getUserMedia\(\{ video: \{ facingMode: facing \}, audio: false \}\)/);
  assert.match(source, /NotAllowedError/);
});

test('M5G3 left_for_you send requests push only after the inserted row succeeds', () => {
  const source = read('left-for-you.js');
  assert.match(source, /const \{ data: inserted, error \} = await client\.from\('left_for_you'\)\.insert/);
  assert.match(source, /if \(inserted\?\.id\) window\.sendWebPushEvent\?\.\('\left_for_you', inserted\.id\)\.catch\?\./);
});

test('M5G3 Edge Function validates sender-owned left_for_you references and hides content', () => {
  const edge = read('supabase/functions/send-web-push/index.ts');
  assert.match(edge, /"left_for_you"/);
  assert.match(edge, /reference_id required|Missing left_for_you reference/);
  assert.match(edge, /row\.sender_id.*sender\.id|sender\.id.*row\.sender_id/);
  assert.match(edge, /row\.couple_id.*sender\.couple_id|sender\.couple_id.*row\.couple_id/);
  assert.match(edge, /row\.recipient_id.*partner\.id|partner\.id.*row\.recipient_id/);
  // M9A: payload e dedupe vivono nel core condiviso con il worker di recupero.
  // N2: the copy lives in the shared notification catalogue.
  const core = read('supabase/functions/_shared/left-for-you-push-core.mjs');
  const catalogue = read('supabase/functions/_shared/notification-core.mjs');
  assert.match(edge, /dispatchLeftForYouPush/);
  assert.match(core, /left-for-you:/);
  assert.match(catalogue, /left_for_you: \(a\) => \(\{[^\n]*ti ha lasciato qualcosa/);
  assert.doesNotMatch(catalogue, /left_for_you: \(a\) => \(\{[^\n]*a\.body/);
  assert.doesNotMatch(edge, /notificationBody\s*=\s*.*body\./);
  assert.doesNotMatch(core, /body:\s*`[^`]*row\.body/);
});

test('M5G3 push navigation routes left_for_you to Home and the existing recipient surface', () => {
  const app = read('app.js');
  assert.match(app, /target==='left_for_you'/);
  assert.match(app, /openLeftForYou/);
});

test('M5G3 keeps the dedicated notification preference migration prepared but unapplied', () => {
  const migration = read('supabase/migrations_history/20260923210000_m5g3_left_for_you_notification_preference.sql');
  assert.match(migration, /add column if not exists left_for_you boolean not null default true/);
  assert.match(migration, /set_notification_preference/);
  assert.match(migration, /get_notification_preferences/);
});

test('M5G3 left_for_you Edge Function preserves think_reaction and suppresses disabled preference', () => {
  const edge = read('supabase/functions/send-web-push/index.ts');
  const settings = read('settings.js');
  assert.match(edge, /\[\"test\", \"think\", \"think_reaction\", \"daily_answer\", \"quest_confirmed\", \"left_for_you\"\]/);
  // M9A: la preferenza left_for_you è applicata dal core condiviso.
  const core = read('supabase/functions/_shared/left-for-you-push-core.mjs');
  assert.match(core, /\.select\('left_for_you'\)/);
  assert.match(core, /preference\.left_for_you === false/);
  assert.match(core, /disabled-by-preference/);
  assert.match(edge, /disabled-by-preference/);
  assert.match(settings, /left_for_you:true/);
  assert.match(settings, /preferenceToggle\('left_for_you','Lasciato per te'/);
  assert.match(settings, /Quando la tua persona ti lascia qualcosa/);
});
