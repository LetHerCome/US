import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const html = read('index.html');
const settings = read('settings.js');
const styles = read('styles.css');
const widgetState = read('supabase/functions/us-widget-state/index.ts');

test('pre-native: couple identity is one light bridge with Settings in the top-right corner', () => {
  const bond = html.match(/<main id="bond"[\s\S]*?<\/main>/)?.[0] || '';
  // Il diario, ma pulito (15/11/2026): the couple card stays mounted (avatars and
  // distance still fill it) but its header is hidden; Settings is the gear of the
  // Noi header «I vostri giorni».
  const header = bond.match(/<header class="noi-canonical-head noi-couple-head" hidden>[\s\S]*?<\/header>/)?.[0] || '';
  const noiHead = bond.match(/<section class="us-noi-v2" id="usNoiV2"[\s\S]*?<header class="dy-hd">[\s\S]*?<\/header>/)?.[0] || '';
  assert.match(noiHead, /<h2 class="dy-h2">I vostri <em>giorni<\/em><\/h2>/);
  // La barra a goccia (20/11/2026): your character, top right, opens Impostazioni (the gear left Noi).
  assert.match(noiHead, /<button type="button" class="dy-ib dy-me" data-dy-me onclick="go\('settings',\{nav:true\}\)" aria-label="Tu: profilo e impostazioni">/);
  assert.match(header, /id="noiCoupleCard"/);
  assert.match(header, /id="pairAvatarFrancesco"/);
  assert.match(header, /id="pairAvatarBeatrice"/);
  assert.match(header, /id="noiCoupleDistance"/);
  assert.match(header, /id="usSettingsEntry"[\s\S]*?aria-label="Apri impostazioni"/);
  assert.ok(header.indexOf('id="noiCoupleCard"') < header.indexOf('id="usSettingsEntry"'));
  assert.match(styles, /#bond \.noi-couple-card\{/);
  assert.match(styles, /#bond \.noi-couple-card #usSettingsEntry\{[\s\S]*?right:2px;[\s\S]*?top:4px;/);
  assert.match(styles, /#bond \.noi-couple-card\{[\s\S]*?background:transparent;[\s\S]*?border:0;/);
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
