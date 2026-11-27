// I widget dell'iPhone ad app chiusa (founder, 27/11/2026: «fai fix per ios»): the other person's new
// look, or the order to forget them, arrives as an APNs background push. AppDelegate hands it to
// UsWidgetSignals (the widget bridge), which checks the version and the account, writes the look
// through the widget contract or clears like logout, and reloads WidgetKit. No Swift compiler here:
// the iOS CI (ios-native.yml) builds it; these checks keep the shape of the contract.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const PLUGIN = 'native-plugins/us-widget-bridge/ios/Sources/UsWidgetBridgePlugin';

test('AppDelegate hands background pushes to the widget bridge and answers iOS every time', () => {
  const app = read('ios/App/App/AppDelegate.swift');
  assert.match(app, /^import UsWidgetBridgePlugin$/m);
  assert.match(app, /didReceiveRemoteNotification userInfo: \[AnyHashable: Any\],\s*fetchCompletionHandler completionHandler: @escaping \(UIBackgroundFetchResult\) -> Void\) \{\s*completionHandler\(UsWidgetSignals\.apply\(userInfo\) \? \.newData : \.noData\)\s*\}/);
  // The push registration of @capacitor/push-notifications stays as it was.
  assert.match(app, /NotificationCenter\.default\.post\(name: \.capacitorDidRegisterForRemoteNotifications, object: deviceToken\)/);
});

test('UsWidgetSignals: the server\'s version, this account only, look or clear, then a reload', async () => {
  const swift = read(`${PLUGIN}/UsWidgetSignals.swift`);
  const { WIDGET_SIGNAL_VERSION } = await import('../supabase/functions/_shared/native-push-transport.mjs');
  assert.match(swift, new RegExp(`static let version = ${Number(WIDGET_SIGNAL_VERSION)}\\b`));
  assert.match(swift, /^public enum UsWidgetSignals \{/m);
  assert.match(swift, /let owner = us\["owner"\] as\? String, UsWidgetContract\.validOwner\(owner\)/);
  assert.match(swift, /let store = UsWidgetStore\.shared\(\), store\.owner\(\) == owner else \{ return false \}/, 'another account signed in: nothing changes');
  assert.match(swift, /case "clear":\s*UsWidgetCredentials\(\)\.clear\(\)\s*store\.clearAll\(\)/, 'the same cleanup as logout');
  assert.match(swift, /case "look":\s*changed = store\.writePartnerLook\(ownerHash: owner, look: widget\)/);
  assert.match(swift, /if changed \{ WidgetCenter\.shared\.reloadAllTimelines\(\) \}/);
  // Not in Core/: the widget extension never handles pushes.
  assert.ok(!fs.existsSync(path.join(ROOT, `${PLUGIN}/Core/UsWidgetSignals.swift`)));
});

test('the store writes only the partner\'s character, validated, for the same owner', () => {
  const store = read(`${PLUGIN}/Core/UsWidgetStore.swift`);
  const fn = store.slice(store.indexOf('func writePartnerLook('), store.indexOf('func readSnapshot()'));
  assert.match(fn, /guard UsWidgetContract\.validOwner\(ownerHash\), var snapshot = readSnapshot\(\),\s*\(snapshot\["ownerHash"\] as\? String\) == ownerHash else \{ return false \}/);
  assert.match(fn, /characters\["partner"\] = UsWidgetContract\.character\(look\)/);
  assert.match(fn, /return write\(snapshot: snapshot\)/, 'through the normal, validated write');
  assert.doesNotMatch(fn, /characters\["me"\]/);
});

test('the server sends to iPhones too, with the widget owner of that account', () => {
  const core = read('supabase/functions/_shared/widget-signal-core.mjs');
  assert.match(core, /export const IOS_WIDGET_SIGNALS = true;/);
  assert.match(core, /device\.provider === 'apns' \? await \(typeof ownerHash === 'function' \? ownerHash : widgetOwnerHash\)\(device\.user_id\) : ''/);
});
