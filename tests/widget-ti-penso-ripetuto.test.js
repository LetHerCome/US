// Ti penso ×N dai widget (founder, 27/11/2026): «deve funzionare anche sul
// widget questa cosa ripetuta sia iOS che android». Taps in a row on the Ti
// penso widget add up and ONE Ti penso leaves 1.5 s after the last one, with
// the taps; the widget of whoever receives says «Bea ti ha pensato 5 volte».
// Static checks (Gradle and swiftc are not on every runner): the Android JVM
// tests (UsWidgetModelsTest) and the Swift CoreCheck test the logic itself.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, ...relative.split('/')), 'utf8');
const JAVA = 'native-plugins/us-widget-bridge/android/src/main/java/com/usapp/widget';
const CORE = 'native-plugins/us-widget-bridge/ios/Sources/UsWidgetBridgePlugin/Core';

test('Android: each tap is counted at once and one timer sends the burst after the last', () => {
  const receiver = read(`${JAVA}/UsThinkWidgetActionReceiver.java`);
  const models = read(`${JAVA}/UsWidgetModels.java`);
  assert.match(models, /static final long BURST_MS = 1_500L;/);
  assert.match(models, /static final int MAX_TAPS = 99;/);
  // The tap is counted under the lock, with its broadcast held open (goAsync) until the send.
  const tap = receiver.slice(receiver.indexOf('public void onReceive('), receiver.indexOf('static boolean flushIfOwed('));
  assert.match(tap, /UsWidgetModels\.tap\(state\.action,/);
  assert.match(tap, /writeAction\("counting", tap\.actionId, tap\.reply, tap\.taps\)/);
  assert.match(tap, /hold\(goAsync\(\)\)/);
  assert.ok(tap.indexOf('writeAction("counting"') < tap.indexOf('UsWidgets.refreshThink(app);\n        // If the process'), '«×N» is painted after the tap is stored');
  assert.match(tap, /TIMER\.schedule\(\(\) -> flush\(app, actionId, force\), force \? 0 : UsWidgetModels\.BURST_MS, TimeUnit\.MILLISECONDS\)/);
  assert.match(tap, /UsWidgets\.wakeAt\(app, Instant\.now\(\)\.plusMillis\(UsWidgetModels\.BURST_MS \+ 500\)\)/);
  // The previous tap's broadcast is finished when a newer one takes over; the last is finished after the send.
  assert.match(receiver, /private static void hold\(PendingResult next\) \{\s*PendingResult previous = held;\s*held = next;\s*if \(previous != null\) previous\.finish\(\);/);
  const flush = receiver.slice(receiver.indexOf('private static void flush('));
  assert.match(flush, /UsWidgetModels\.burstDue\(action, expectedId, force, now\)/);
  assert.match(flush, /if \(!UsWidgetModels\.burstWaiting\(action, now\)\) release\(\);/);
  assert.match(flush, /IN_FLIGHT\.compareAndSet\(false, true\)/);
  assert.match(flush, /writeAction\("sending", actionId, action\.optBoolean\("reply", false\), taps\)/);
  assert.match(flush, /\.send\(credentials\.functionsBase\(owner\), token, id, taps\)/);
  assert.match(flush, /finally \{[\s\S]*IN_FLIGHT\.set\(false\);[\s\S]*release\(\);/);
  // No new library: no WorkManager, no exact alarm permission.
  assert.doesNotMatch(receiver + read('native-plugins/us-widget-bridge/android/build.gradle'), /import androidx\.work|androidx\.work:|\.setExact|SCHEDULE_EXACT_ALARM/);
  assert.doesNotMatch(read('native-plugins/us-widget-bridge/android/src/main/AndroidManifest.xml'), /SCHEDULE_EXACT_ALARM|USE_EXACT_ALARM/);
});

test('Android: a burst owed after the process died leaves at the next tick, with its id', () => {
  const system = read(`${JAVA}/UsWidgetSystemReceiver.java`);
  assert.match(system, /if \(UsWidgets\.ACTION_TICK\.equals\(action\) && UsThinkWidgetActionReceiver\.flushIfOwed\(context, this\)\) return;/);
  const receiver = read(`${JAVA}/UsThinkWidgetActionReceiver.java`);
  const owed = receiver.slice(receiver.indexOf('static boolean flushIfOwed('), receiver.indexOf('private static void hold('));
  assert.match(owed, /UsWidgetModels\.burstDue\(store\.readAction\(\), null, false, Instant\.now\(\)\)/);
  assert.match(owed, /hold\(receiver\.goAsync\(\)\)/);
  assert.match(read(`${JAVA}/UsWidgets.java`), /static void wakeAt\(Context context, Instant at\)/);
});

test('Android: taps on the heart over the widget count too; the client sends taps', () => {
  const heart = read(`${JAVA}/UsThinkHeartActivity.java`);
  assert.match(heart, /root\.setOnTouchListener/);
  assert.match(heart, /target\.contains\(Math\.round\(event\.getRawX\(\)\), Math\.round\(event\.getRawY\(\)\)\)\) again\(\);/);
  assert.match(heart, /handler\.postDelayed\(closer, LINGER_MS\)/);
  const client = read(`${JAVA}/UsWidgetActionClient.java`);
  assert.match(client, /String send\(String functionsBase, String token, String actionId, int taps\)/);
  assert.match(client, /\.put\("actionId", actionId\)\.put\("taps", Math\.max\(1, Math\.min\(UsWidgetModels\.MAX_TAPS, taps\)\)\)/);
  // RemoteViews only: the count is text on views the layouts already have.
  const provider = read(`${JAVA}/UsThinkWidgetProvider.java`);
  assert.match(provider, /boolean many = got && model\.receivedTaps > 1;/);
  assert.doesNotMatch(provider, /new (?:TextView|LinearLayout|FrameLayout)\(/);
});

test('iOS: each tap is an intent that counts itself; only the last one sends', () => {
  const sender = read('ios/App/UsWidgets/UsThinkSender.swift');
  assert.match(sender, /store\.countTap\(replyIfNew: reply, now: now\)/);
  assert.match(sender, /if !counted\.tap\.full \{\s*try\? await Task\.sleep\(nanoseconds: UInt64\(UsWidgetModels\.burst \* 1_000_000_000\)\)/);
  assert.match(sender, /guard let taps = store\.claimBurst\(actionId: counted\.tap\.actionId, tapId: counted\.tapId\) else \{ return \}/);
  assert.match(sender, /actionId: counted\.tap\.actionId, taps: taps\)/);
  assert.match(sender, /"taps": max\(1, min\(UsWidgetModels\.maxTaps, taps\)\)/);
  // «×N» at once, the sent state after.
  assert.ok((sender.match(/WidgetCenter\.shared\.reloadTimelines\(ofKind: UsWidgetShared\.widgetKind\("think"\)\)/g) || []).length >= 3);
  const store = read(`${CORE}/UsWidgetStore.swift`);
  assert.match(store, /private static let burstLock = NSLock\(\)/);
  for (const fn of ['func countTap(', 'func claimBurst(']) {
    const body = store.slice(store.indexOf(fn), store.indexOf('\n    }\n', store.indexOf(fn)));
    assert.match(body, /Self\.burstLock\.lock\(\); defer \{ Self\.burstLock\.unlock\(\) \}/, fn);
  }
  assert.match(store, /UsWidgetContract\.string\(action\["tap"\]\) == tapId/);
  const models = read(`${CORE}/UsWidgetModels.swift`);
  assert.match(models, /static let burst: TimeInterval = 1\.5/);
  assert.match(models, /static let maxTaps = 99/);
  // The Control (iOS 18) uses the same intent.
  assert.match(read('ios/App/UsWidgets/UsThinkWidget.swift'), /ControlWidgetButton\(action: UsThinkIntent\(\)\)/);
});

test('the widget of whoever receives: «Bea ti ha pensato 5 volte», «×5» on the lock screen', () => {
  assert.match(read('app.js'), /lastReceivedTaps:received\?usThinkTaps\(received\):1/);
  assert.match(read('widgets.js'), /lastReceivedTaps: Number\.isInteger\(next\.lastReceivedTaps\) \? Math\.max\(1, Math\.min\(99, next\.lastReceivedTaps\)\) : 1/);
  assert.match(read('platform.js'), /lastReceivedTaps: Number\.isInteger\(think\.lastReceivedTaps\) \? Math\.max\(1, Math\.min\(99, think\.lastReceivedTaps\)\) : 1/);
  assert.match(read(`${JAVA}/UsWidgetContract.java`), /\.put\("lastReceivedTaps", taps\(thinkIn\.opt\("lastReceivedTaps"\)\)\)/);
  assert.match(read(`${CORE}/UsWidgetContract.swift`), /"lastReceivedTaps": taps\(thinkIn\["lastReceivedTaps"\]\)/);
  assert.match(read(`${JAVA}/UsWidgetModels.java`), /who \+ " ti ha pensato" \+ \(out\.receivedTaps > 1 \? " " \+ out\.receivedTaps \+ " volte" : ""\)/);
  assert.match(read(`${CORE}/UsWidgetModels.swift`), /who \+ " ti ha pensato" \+ \(out\.receivedTaps > 1 \? " \\\(out\.receivedTaps\) volte" : ""\)/);
  const view = read('ios/App/UsWidgets/UsThinkWidget.swift');
  assert.match(view, /if many \{ return "×\\\(model\.receivedTaps\)" \}/);
  assert.match(view, /case \.accessoryCircular:\s*if let short = shortCount/);
});

test('platform.js keeps only a whole number 1..99 of received taps', () => {
  const source = read('platform.js');
  const line = source.match(/lastReceivedTaps: (Number\.isInteger\(think\.lastReceivedTaps\)[^\n]*?: 1),/)[1];
  const clean = (value) => vm.runInNewContext(line, { think: { lastReceivedTaps: value }, Number, Math });
  assert.equal(clean(5), 5);
  assert.equal(clean(400), 99);
  assert.equal(clean(0), 1);
  assert.equal(clean(2.5), 1);
  assert.equal(clean('7'), 1);
  assert.equal(clean(undefined), 1);
});
