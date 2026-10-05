import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const html = read('index.html');
const settings = read('settings.js');
const styles = read('styles.css');
const widgetState = read('supabase/functions/us-widget-state/index.ts');

test('pre-native: couple identity is one compact card with Settings in the top-right corner', () => {
  const bond = html.match(/<main id="bond"[\s\S]*?<\/main>/)?.[0] || '';
  const header = bond.match(/<header class="noi-canonical-head noi-couple-head">[\s\S]*?<\/header>/)?.[0] || '';
  assert.match(header, /id="noiCoupleCard"/);
  assert.match(header, /id="pairAvatarFrancesco"/);
  assert.match(header, /id="pairAvatarBeatrice"/);
  assert.match(header, /id="noiCoupleDistance"/);
  assert.match(header, /id="usSettingsEntry"[\s\S]*?aria-label="Apri impostazioni"/);
  assert.ok(header.indexOf('id="noiCoupleCard"') < header.indexOf('id="usSettingsEntry"'));
  assert.match(styles, /#bond \.noi-couple-card\{/);
  assert.match(styles, /#bond \.noi-couple-card #usSettingsEntry\{[\s\S]*?right:8px;[\s\S]*?top:8px;/);
});

test('pre-native: Scriptable is retired from the product client and dedicated integration source', () => {
  assert.doesNotMatch(html, /scriptable-widgets|Scriptable/);
  assert.doesNotMatch(settings, /scriptable|Scriptable/);
  for (const path of [
    'integrations/widgets/scriptable/README.md',
    'integrations/widgets/scriptable/US-Noi.js',
    'integrations/widgets/scriptable/US-Ti-Penso.js',
    'supabase/functions/widget-scriptable-setup/index.ts',
    'tests/scriptable-widgets.test.js',
    'tests/us-widget-state-scriptable.test.js'
  ]) assert.equal(existsSync(new URL('../' + path, import.meta.url)), false, path);
});

test('pre-native: native-ready widget backend stays available and old Scriptable state tokens fail closed', () => {
  assert.equal(existsSync(new URL('../supabase/functions/widget-device-token/index.ts', import.meta.url)), true);
  assert.equal(existsSync(new URL('../supabase/functions/widget-think-send/index.ts', import.meta.url)), true);
  assert.match(widgetState, /tokenRow\.device_label === "Scriptable"\) return json\(\{ error: "invalid_token" \}, 401\)/);
  assert.doesNotMatch(widgetState, /widget_scriptable_installations|makeScriptableWidgetState/);
});
