// Widget «Nota» (docs/missions/widget-nota-v1.md): the Android side and the
// app wiring, checked statically (Gradle is not in every CI; the pure model
// has its JVM tests in UsNoteModelsTest).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN = 'native-plugins/us-widget-bridge/android/src/main';
const JAVA = `${PLUGIN}/java/com/usapp/widget`;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const java = (name) => read(`${JAVA}/${name}.java`);

test('manifest: provider, tick receiver and the two windows, none exported, no launcher configure', () => {
  const manifest = read(`${PLUGIN}/AndroidManifest.xml`);
  for (const name of ['UsNoteWidgetProvider', 'UsNoteWidgetActionReceiver', 'UsNoteEditActivity', 'UsNoteChooseActivity']) {
    const block = manifest.match(new RegExp(`<(?:receiver|activity)[^>]*${name}"[\\s\\S]*?(?:/>|</(?:receiver|activity)>)`))?.[0] || '';
    assert.match(block, /android:exported="false"/, name);
  }
  for (const name of ['UsNoteEditActivity', 'UsNoteChooseActivity']) {
    const block = manifest.match(new RegExp(`<activity[^>]*${name}"[\\s\\S]*?/>`))[0];
    assert.match(block, /android:theme="@android:style\/Theme\.DeviceDefault\.Dialog\.NoActionBar"/, `${name}: a window over the Home screen`);
    assert.match(block, /android:taskAffinity=""/, `${name}: never the app's task`);
    assert.match(block, /android:excludeFromRecents="true"/);
  }
  assert.doesNotMatch(manifest, /APPWIDGET_CONFIGURE/);
  assert.equal((manifest.match(/android:exported="true"/g) || []).length, 0);
  const info = read(`${PLUGIN}/res/xml/us_widget_note_info.xml`);
  assert.doesNotMatch(info, /android:configure/);
  assert.match(info, /android:previewLayout="@layout\/us_widget_preview_note"/);
});

test('provider: rows tick through the internal receiver, the pencil opens the window, immutable intents, no network', () => {
  const provider = java('UsNoteWidgetProvider');
  assert.match(provider, /new Intent\(context, UsNoteWidgetActionReceiver\.class\)[\s\S]*?\.setData\(Uri\.parse\("us-widget-note:\/\/toggle\/" \+ widgetId \+ "\/" \+ row\)\)/);
  assert.match(provider, /new Intent\(context, UsNoteEditActivity\.class\)/);
  assert.match(provider, /new Intent\(context, UsNoteChooseActivity\.class\)/);
  assert.equal((provider.match(/PendingIntent\.FLAG_IMMUTABLE/g) || []).length, 3);
  assert.doesNotMatch(provider, /FLAG_MUTABLE/);
  assert.match(provider, /UsNoteModels\.find\(state\.notes\(\), noteId\)/);
  assert.doesNotMatch(provider, /HttpURLConnection|UsWidgetNoteClient|supabase/i);
  assert.doesNotMatch(provider, /setPaintFlags/, 'not remotable: a span strikes the done items');
  // The last widget away: the copy and the phone's token go, the server's is revoked by the app.
  assert.match(provider, /if \(!credentials\.status\(store\.owner\(\)\)\.equals\("missing"\)\) store\.setNoteRevokePending\(true\);\s*credentials\.clear\(\);/);
});

test('tick: only for the note the widget shows, optimistic, one request at a time, reverted when refused', () => {
  const receiver = java('UsNoteWidgetActionReceiver');
  assert.match(receiver, /!noteId\.equals\(store\.noteFor\(widgetId\)\)\) return;/);
  assert.match(receiver, /Executors\.newSingleThreadExecutor\(\)/);
  assert.match(receiver, /store\.replaceNote\(optimistic, ""\);\s*UsWidgets\.refreshAll\(app\);/);
  assert.match(receiver, /new UsWidgetCredentialStore\(app, UsWidgetCredentialStore\.NOTE\)/);
  assert.match(receiver, /if \(!owner\.equals\(store\.owner\(\)\)\) return;/);
  assert.match(receiver, /store\.replaceNote\(before, UsNoteModels\.STATUS_FAILED\);/);
  assert.doesNotMatch(receiver, /Log\.|println/);
});

test('client and credential: header token, the two US projects only, no redirects, no Supabase session', () => {
  const client = java('UsWidgetNoteClient');
  assert.match(client, /String base = UsWidgetEndpoints\.functionsBase\(functionsBase\);/);
  assert.match(client, /connection\.setRequestProperty\("X-US-Widget-Token", token\);/);
  assert.match(client, /connection\.setInstanceFollowRedirects\(false\);/);
  assert.doesNotMatch(client, /access_token|refresh_token|apikey|Authorization/i);
  const store = java('UsWidgetCredentialStore');
  assert.match(store, /NOTE\.equals\(scope\) \? "note-credential-v1\.json" : "action-credential-v1\.json"/);
  assert.match(store, /return UsWidgetEndpoints\.functionsBase\(payload\.optString\("functionsUrl", ""\)\);/);
  const bridge = java('UsWidgetBridgePlugin');
  assert.match(bridge, /boolean addressOk = functionsUrl\.isEmpty\(\) \? !note : !UsWidgetEndpoints\.functionsBase\(functionsUrl\)\.isEmpty\(\);/);
  assert.match(bridge, /noteCredentials\.clear\(\);\s*store\.clearAll\(\);/, 'logout clears the note token too');
});

test('windows: checked against the widget and its note; plain Android views, never a WebView', () => {
  const edit = java('UsNoteEditActivity');
  const choose = java('UsNoteChooseActivity');
  assert.match(edit, /!UsNoteSheet\.isNoteWidget\(this, widgetId\) \|\| !UsNoteModels\.validNoteId\(noteId\) \|\| !noteId\.equals\(store\.noteFor\(widgetId\)\)/);
  assert.match(choose, /if \(!UsNoteSheet\.isNoteWidget\(this, widgetId\)\) \{ finish\(\); return; \}/);
  assert.match(edit, /new InputFilter\.LengthFilter\(max\)/);
  assert.match(edit, /if \(!touched\) fill\(result\.note\);/, 'the server version never replaces what one is typing');
  for (const source of [edit, choose, java('UsNoteSheet')]) assert.doesNotMatch(source, /import android\.webkit|import [\w.]*supabase|android\.util\.Log|Log\.[dewiv]\(/i);
});

test('app: the note token and the copy only while a Nota widget exists; revoked when it goes', () => {
  const widgets = read('widgets.js');
  const sync = widgets.slice(widgets.indexOf('function syncNotes()'), widgets.indexOf('// ---------- deep links ----------'));
  assert.match(sync, /if \(!widgets\.placed\) \{\s*if \(widgets\.revokePending/);
  assert.match(sync, /await window\.UsWidgetCredentialApi\.revoke\(deviceIdHash, 'note:rw'\);/);
  assert.match(sync, /if \(widgets\.credential !== 'ready'\) await provisionNoteCredential\(target, token\);/);
  assert.match(widgets, /window\.UsWidgetCredentialApi\.issue\(deviceIdHash, 'note:rw'\)/);
  assert.match(widgets, /functionsUrl: window\.UsWidgetCredentialApi\.functionsUrl \|\| ''/);
  assert.match(widgets, /await window\.UsWidgetCredentialApi\.revoke\(revokeHash, 'note:rw'\);/, 'logout');
  const platform = read('platform.js');
  assert.match(platform, /if \(note && !safeUrl\) return false;/, 'the Nota cannot work without the address');
  assert.match(platform, /const WIDGET_KINDS = \[[^\]]*'note'\];/);
  const app = read('app.js');
  assert.match(app, /functionsUrl:`\$\{SB_URL\}\/functions\/v1`,/);
  assert.match(app, /\.\.\.\(scope==='note:rw'\?\{scope\}:\{\}\)/);
  assert.match(app, /sb\.from\('couple_notes'\)\.select\(fields\)\.eq\('couple_id',cid\)/);
  const hub = read('widget-hub.js');
  assert.match(hub, /\{ kind: 'note', name: 'Nota', copy: '[^']+', shape: 'square' \}/);
  // A change of the notes in the app reaches the widgets, one read per burst.
  assert.match(read('couple-notes.js'), /function onChange\(event\)\{\s*\/\/[^\n]*\n\s*w\.dispatchEvent\?\.\(new Event\('us:couple-notes-changed'\)\);/);
  assert.match(widgets, /notesTimer = setTimeout\(\(\) => \{ syncNotes\(\)\.catch\(\(\) => \{\}\); \}, 2000\);/);
});
