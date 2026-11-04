// Come stai (founder, 02/11/2026): twelve states chosen in Oggi, words in the
// form chosen in Settings (or undeclined), twelve hours, no free text, no
// push. The same list in the app, the SQL and the Android widget.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const PLUGIN = 'native-plugins/us-widget-bridge/android/src/main';
const JAVA = `${PLUGIN}/java/com/usapp/widget`;
const status = require('../member-status.js');

const KEYS = ['innamorato', 'felice', 'stanco', 'giu', 'nervoso', 'malato', 'festa', 'lavoro', 'studio', 'palestra', 'viaggio', 'tavola'];

test('the founder\'s twelve, in the same order in the app, the SQL and the widget', () => {
  assert.deepEqual(status.STATUSES.map((s) => s.key), KEYS);
  const sql = read('supabase/migrations/20261102170000_member_status_v1.sql');
  for (const key of KEYS) assert.match(sql, new RegExp(`'${key}'`), key);
  const java = read(`${JAVA}/UsWidgetModels.java`);
  for (const s of status.STATUSES) {
    assert.ok(java.includes(`{ "${s.key}", "${s.emoji}", "${s.m}", "${s.f}", "${s.n}" }`), `widget row ${s.key}`);
  }
  assert.match(read(`${JAVA}/UsWidgetContract.java`), new RegExp(`\\^\\(${KEYS.join('\\|')}\\)\\$`));
  assert.match(read('platform.js'), new RegExp(`STATUS_KEYS = \\[${KEYS.map((k) => `'${k}'`).join(', ')}\\]`));
});

test('words in the chosen form, or undeclined', () => {
  assert.equal(status.word('innamorato', 'f'), 'innamorata');
  assert.equal(status.word('innamorato', 'm'), 'innamorato');
  assert.equal(status.word('innamorato', null), 'in amore');
  assert.equal(status.word('stanco', 'x'), 'senza energie');
  assert.equal(status.word('nope', 'f'), '');
});

test('model: twelve hours from the server time, then nothing', () => {
  const now = Date.parse('2026-11-02T12:00:00Z');
  const row = { status: 'stanco', form: 'm', set_at: '2026-11-02T11:40:00Z', expires_at: '2026-11-02T23:40:00Z' };
  assert.deepEqual(status.model(row, { now }), { key: 'stanco', emoji: '😴', form: 'm', word: 'stanco', since: 'da 20 min', at: '2026-11-02T11:40:00.000Z', until: '2026-11-02T23:40:00.000Z' });
  assert.equal(status.model({ ...row, set_at: '2026-11-02T10:55:00Z' }, { now }).since, 'da 1 ora');
  assert.equal(status.model(row, { now: Date.parse('2026-11-02T23:40:00Z') }), null);
  assert.equal(status.model({ ...row, status: 'arrabbiato' }, { now }), null);
  assert.equal(status.model({ ...row, status: null, set_at: null, expires_at: null }, { now }), null);
  assert.equal(status.model(null, { now }), null);
  assert.equal(status.since(30 * 1000), 'proprio ora');
  assert.equal(status.since(3 * 3600 * 1000), 'da 3 ore');
});

test('app: Oggi pill, the sheet, Settings, Realtime on the one channel, no push', () => {
  const html = read('index.html');
  assert.match(html, /id="usOggiStatus"[^>]*aria-haspopup="dialog"/);
  assert.match(html, /<div id="usStatusSheet" class="us-status-overlay" aria-hidden="true" data-us-modal data-us-motion-surface>/);
  for (const key of KEYS) assert.match(html, new RegExp(`data-status="${key}"`), key);
  assert.match(html, /data-us-setting="status-form"/);
  assert.match(html, /<script defer src="\/member-status\.js\?v=[^"]+"><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="\/member-status\.css\?v=[^"]+"\/>/);
  assert.match(read('settings.js'), /if\(name==='status-form'\)return window\.UsMemberStatus\?\.open\?\.\('form'\);/);
  assert.match(read('navigation.js'), /name:'status',\s*find:\(\)=>document\.getElementById\('usStatusSheet'\)/);
  const app = read('app.js');
  assert.match(app, /\.on\('postgres_changes',\{event:'\*',schema:'public',table:'member_status',filter:`couple_id=eq\.\$\{coupleId\}`\},payload=>window\.UsMemberStatus\?\.onChange\?\.\(payload\)\)/);
  assert.match(app, /status=document\.getElementById\('usOggiStatus'\)/);
  const module = read('member-status.js');
  assert.match(module, /db\.rpc\(rpc, args\)/);
  assert.match(module, /write\('set_member_status', \{ p_status: status \}/);
  assert.match(module, /write\('set_member_form', \{ p_form: validForm\(form\) \}/);
  assert.doesNotMatch(module, /\.channel\(|notif|sendPush/i);
  for (const build of ['scripts/build-capacitor-web.mjs', 'scripts/build-cloudflare-pages.mjs']) {
    assert.match(read(build), /'member-status\.js',/);
    assert.match(read(build), /'member-status\.css',/);
  }
  assert.match(read('service-worker.js'), /versioned\("\/member-status\.js"\)/);
});

test('widget: a new kind, both halves, the tap opens the twelve, never a write', () => {
  const provider = read(`${JAVA}/UsStatusWidgetProvider.java`);
  assert.match(provider, /return UsWidgets\.sized\(options, small, medium\);/);
  assert.match(provider, /UsWidgets\.open\(context, "status", 4801\)/);
  assert.doesNotMatch(provider, /HttpURLConnection|supabase|fetch\(|Credential/i);
  const widgets = read('widgets.js');
  assert.match(widgets, /'memories', 'status'(?:, '[a-z]+')*\]\);/);
  assert.match(widgets, /status: 'home'(?:, [a-z]+: '[a-z]+')* \}\);/);
  assert.match(widgets, /if \(link\.kind === 'status' && window\.usProfile\) setTimeout\(\(\) => window\.UsMemberStatus\?\.open\?\.\('status'\), 400\);/);
  assert.match(widgets, /addEventListener\('us:member-status-changed', \(\) => \{ syncStatus\(\)/);
  const manifest = read(`${PLUGIN}/AndroidManifest.xml`);
  assert.match(manifest, /<receiver\s+android:name="com\.usapp\.widget\.UsStatusWidgetProvider"\s+android:exported="false"/);
  assert.match(read(`${PLUGIN}/res/xml/us_widget_status_info.xml`), /android:previewLayout="@layout\/us_widget_preview_status"/);
  // 04/11/2026 (founder): only your two portraits, each with its state; no names, no lines.
  for (const name of ['us_widget_status', 'us_widget_status_medium']) {
    const layout = read(`${PLUGIN}/res/layout/${name}.xml`);
    for (const id of ['us_status_root', 'us_status_me_avatar', 'us_status_me_initial', 'us_status_me_emoji', 'us_status_partner_avatar', 'us_status_partner_initial', 'us_status_partner_emoji']) assert.match(layout, new RegExp(`@\\+id/${id}"`), `${name} ${id}`);
    assert.ok(layout.indexOf('us_status_me_avatar') < layout.indexOf('us_status_partner_avatar'), `${name}: you on the left`);
    assert.doesNotMatch(layout, /us_status_(?:me|partner)_(?:name|line)|us_widget_pastel_heart"/, `${name}: only the two portraits`);
    assert.doesNotMatch(layout, /android:textSize="(?:[0-9]|10)(?:\.\d)?sp"/, `${name}: nothing under 11sp`);
  }
  assert.match(read(`${PLUGIN}/res/layout/us_widget_status.xml`), /@drawable\/us_widget_art_status_s"/);
  assert.match(read(`${PLUGIN}/res/layout/us_widget_status_medium.xml`), /@drawable\/us_widget_art_status_m"/);
  assert.ok(provider.includes('UsWidgetArt.avatar(views, context, theirs, R.id.us_status_partner_avatar, R.id.us_status_partner_initial, partnerName, size);'));
  assert.ok(provider.includes('UsWidgetArt.avatar(views, context, mine, R.id.us_status_me_avatar, R.id.us_status_me_initial, "Tu", size);'));
  assert.match(read('widget-hub.js'), /\{ kind: 'status', name: 'Come stai', copy: '[^']+', shape: 'wide' \}/);
});
