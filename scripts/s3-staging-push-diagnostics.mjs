// STAGING BUILD ONLY: add privacy-safe FCM diagnostic counters and QA panel.
// This file is never invoked by production or the ordinary Android CI.
import { readFile, writeFile, access } from 'node:fs/promises';
import { basename } from 'node:path';

if (process.env.US_STAGING_QA !== 'true') throw new Error('S3 diagnostics forbidden outside isolated STAGING build');
const mode = process.argv[2];
if (!['bundle', 'android'].includes(mode)) throw new Error('Usage: node scripts/s3-staging-push-diagnostics.mjs bundle|android');

async function replaceFile(file, edits) {
  // GitHub Windows runners can checkout Java sources with CRLF.
  let content = (await readFile(file, 'utf8')).replace(/\r\n/g, '\n');
  for (const [before, after] of edits) {
    if (content.split(before).length !== 2) throw new Error('S3 diagnostics guard failed: ' + basename(file) + ': ' + before.slice(0, 65));
    content = content.replace(before, after);
  }
  await writeFile(file, content);
}
const trace = (event) => 'UsPushSupportPlugin.qaTrace(this, "' + event + '");';

if (mode === 'bundle') {
  const config = JSON.parse(await readFile('capacitor.config.json', 'utf8'));
  if (config.appId !== 'com.usapp.us.staging' || config.appName !== 'US STAGING')
    throw new Error('Diagnostics require isolated staging application ID/name');
  const appJs = await readFile('dist/capacitor/app.js', 'utf8');
  if (!appJs.includes('dugmhngrfkuieeletatb') || appJs.includes('iiakdfsxpywdkxravqjh'))
    throw new Error('Never inject QA panel in a production-bound app');
  await replaceFile('dist/capacitor/index.html', [
    ['</body>', '<script defer src="/s3-staging-push-qa.js"></script>\n</body>']
  ]);
  const panel = String.raw`(() => {
    'use strict';
    function init() {
      if (!document.body || document.getElementById('s3-qa-button')) return;
      const button = document.createElement('button');
      button.id = 's3-qa-button';
      button.type = 'button';
      button.textContent = 'FCM QA';
      button.style.cssText = 'position:fixed;right:10px;top:calc(env(safe-area-inset-top, 0px) + 60px);z-index:2147483000;background:#d9e3ff;color:#12204e;border:1px solid #7691de;border-radius:16px;padding:9px 12px;font:600 13px system-ui';
      const panel = document.createElement('section');
      panel.id = 's3-qa-panel';
      panel.hidden = true;
      panel.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top, 0px) + 103px);left:12px;right:12px;max-height:68vh;overflow:auto;z-index:2147483000;background:#111a2c;color:#eef3ff;padding:18px;border:1px solid #8197c8;border-radius:16px;box-shadow:0 12px 40px #0009;font:13px system-ui';
      const heading = document.createElement('p');
      heading.textContent = 'US STAGING · Firebase QA (senza dati privati)';
      heading.style.cssText = 'font-weight:700;margin:0 0 8px';
      const description = document.createElement('p');
      description.textContent = 'Messaggi ricevuti e motivi di blocco. Nessun token, nome, account o contenuto viene registrato. Apri dopo il test e invia uno screenshot.';
      const refresh = document.createElement('button');
      refresh.textContent = 'Aggiorna diagnosi';
      refresh.style.cssText = 'background:#90aaff;color:#081329;padding:10px;border-radius:10px;border:0;margin:7px 0';
      const details = document.createElement('pre');
      details.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;font:12px ui-monospace,monospace';
      const repair = document.createElement('button');
      repair.type = 'button';
      repair.textContent = 'Ricollega notifiche su questo dispositivo';
      repair.style.cssText = 'display:block;background:#314a80;color:#fff;padding:10px;border-radius:10px;border:1px solid #8da7ff;margin:7px 0';
      const repairResult = document.createElement('p');
      repairResult.style.cssText = 'font-weight:600;white-space:pre-wrap';
      panel.append(heading, description, refresh, repair, repairResult, details);
      document.body.append(button, panel);
      async function readDiagnostics() {
        details.textContent = 'Lettura stato nativo…';
        try {
          const plugin = window.UsPlatform?.getNativePlugin?.('UsPushSupport') ||
            window.Capacitor?.Plugins?.UsPushSupport;
          if (!plugin?.getQaPushDiagnostics) throw Error('Bridge diagnostico non disponibile: verifica versione APK');
          const d = await plugin.getQaPushDiagnostics();
          const state = await window.UsNotifications?.getState?.();
          let events = [];
          try { events = JSON.parse(localStorage.getItem('us:s3qa:events') || '[]'); } catch (_) {}
          details.textContent = 'Stato interno notifiche: ' + (state?.kind || 'non disponibile') +
            '\nAssociazione nativa attiva: ' + d.ownerBound +
            '\nPermesso app: ' + d.notificationsEnabled +
            '\nCanale US: ' + d.channelImportance +
            '\nApp in primo piano: ' + d.activityResumed +
            '\n\nCronologia (orari telefono):\n' +
            (d.history || 'Nessun evento FCM registrato') +
            '\nCronologia registrazione US:\n' + (events.length ? events.slice(-20).join('\n') : 'Nessun evento locale');
        } catch (error) {
          details.textContent = 'Errore QA: ' + (error?.message || String(error));
        }
      }
      button.onclick = () => { panel.hidden = !panel.hidden; if (!panel.hidden) readDiagnostics(); };
      refresh.onclick = readDiagnostics;
      repair.onclick = async () => {
        repair.disabled = true;
        repairResult.textContent = 'Ricollegamento in corso...';
        try {
          const result = await window.UsNotifications?.enable?.();
          repairResult.textContent = result?.ok
            ? 'Registrazione nell’app confermata. Ora il server dovrebbe riconoscere il dispositivo.'
            : 'Registrazione non riuscita: ' + (result?.kind || 'non disponibile');
        } catch (_) {
          repairResult.textContent = 'Registrazione non riuscita: errore del collegamento nativo.';
        } finally {
          repair.disabled = false;
          await readDiagnostics();
        }
      };
      document.addEventListener('visibilitychange', () => { if (!document.hidden && !panel.hidden) readDiagnostics(); });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  })();`;
  await writeFile('dist/capacitor/s3-staging-push-qa.js', panel);

  // Capture only categorical lifecycle outcomes. No raw token, account, JWT,
  // installation identifier, provider payload or server error text is logged.
  const pushJs = 'dist/capacitor/notifications.js';
  await replaceFile(pushJs, [
    ["  const isNative = Boolean(platform?.isNative);",
     `  const isNative = Boolean(platform?.isNative);
  const stageQaTrace = (event) => {
    try {
      const key = 'us:s3qa:events';
      const prev = JSON.parse(localStorage.getItem(key) || '[]');
      const entries = Array.isArray(prev) ? prev : [];
      entries.push(new Date().toLocaleTimeString('it-IT', { hour12: false }) + ' ' + event);
      localStorage.setItem(key, JSON.stringify(entries.slice(-32)));
    } catch (_) {}
  };`],
    ["  async function requestToken() {", "  async function requestToken() {\n    stageQaTrace('token_request_enter');"],
    ["    if (retired().some(entry => typeof entry === 'string' || entry.userId !== session.userId)) throw new Error('previous_account_retirement_pending');", "    if (retired().some(entry => typeof entry === 'string' || entry.userId !== session.userId)) { stageQaTrace('blocked_previous_account_cleanup'); throw new Error('previous_account_retirement_pending'); }"],
    ["    await push.register();\n    return withTimeout(waiting, REGISTRATION_TIMEOUT_MS);", "    try { await push.register(); stageQaTrace('provider_register_called'); }\n    catch (error) { stageQaTrace('provider_register_rejected'); throw error; }\n    try { const token = await withTimeout(waiting, REGISTRATION_TIMEOUT_MS); stageQaTrace('provider_token_callback_ok'); return token; }\n    catch (error) { stageQaTrace(error?.message === 'timeout' ? 'provider_token_callback_timeout' : 'provider_token_callback_failed'); throw error; }"],
    ["  async function registerToken(token, status, owner = session) {\n    assertOwner(owner);", "  async function registerToken(token, status, owner = session) {\n    stageQaTrace('register_token_enter');\n    assertOwner(owner);"],
    ["    if (retired().some((entry) => typeof entry === 'string' || !entry.token || entry.token === normalized)) throw new Error('retired_token');", "    if (retired().some((entry) => typeof entry === 'string' || !entry.token || entry.token === normalized)) { stageQaTrace('blocked_retired_or_reused_token'); throw new Error('retired_token'); }"],
    ["  async function onRegistration(event) {\n    lastToken", "  async function onRegistration(event) {\n    stageQaTrace('provider_registration_callback');\n    lastToken"],
    ["    busy = true;\n    const owner = session;\n    try {", "    busy = true;\n    stageQaTrace('enable_enter');\n    const owner = session;\n    try {"],
    ["      assertOwner(owner);\n      const token = await requestToken();\n      await registerToken(token, status, owner);", "      assertOwner(owner);\n      stageQaTrace('enable_permission_ok');\n      const token = await requestToken();\n      stageQaTrace('enable_token_acquired');\n      await registerToken(token, status, owner);"],
    ["      stageQaTrace(error?.message === 'previous_account_retirement_pending' ? 'previous_owner_cleanup_pending' : 'enable_failed');", "      const safeReasons = Object.freeze(['previous_account_retirement_pending','retired_token','timeout','registration_failed','stale_session','token_invalid','no_session','native_owner_gate_unavailable','native_owner_gate_stale','native_owner_clear_failed']);\n      const kind = safeReasons.includes(error?.message) ? error.message : 'other';\n      stageQaTrace('enable_failure_' + kind);"],
    ["    listen('registrationError', () => settleToken(new Error('registration_failed')));", "    listen('registrationError', () => { stageQaTrace('provider_registration_error_callback'); settleToken(new Error('registration_failed')); });"],
    ["    const request = db.rpc('register_native_push_device', {",
     "    stageQaTrace('register_rpc_start');\n    const request = db.rpc('register_native_push_device', {"],
    ["    if (error) throw error;\n    assertOwner(owner);\n    await bindNativeOwner(status, installation, owner);",
     "    if (error) { stageQaTrace(error.code === '23505' ? 'rpc_token_conflict' : 'rpc_registration_error'); throw error; }\n    assertOwner(owner);\n    await bindNativeOwner(status, installation, owner);\n    stageQaTrace('register_and_owner_bind_success');"],
    ["    } catch (_) {\n      return { ok: false, kind: 'error' };\n    } finally {\n      busy = false;\n    }\n  }",
     "    } catch (error) {\n      stageQaTrace(error?.message === 'previous_account_retirement_pending' ? 'previous_owner_cleanup_pending' : 'enable_failed');\n      return { ok: false, kind: 'error' };\n    } finally {\n      busy = false;\n    }\n  }"],
    ["  async function revokeDevice() {\n    pending = null;",
     "  async function revokeDevice() {\n    stageQaTrace('logout_device_revoke');\n    pending = null;"],
    ["  function signedOut() {\n    authGeneration++;",
     "  function signedOut() {\n    stageQaTrace('auth_signed_out');\n    authGeneration++;"],
    ["  async function authReady(profile) {\n    if (!profile?.id) return;",
     "  async function authReady(profile) {\n    if (!profile?.id) return;\n    stageQaTrace('auth_ready');"]
  ]);

  process.stdout.write('STAGING QA panel injected into isolated web bundle\n');
} else {
  const cfg = JSON.parse(await readFile('capacitor.config.json', 'utf8'));
  if (cfg.appId !== 'com.usapp.us.staging') throw new Error('Native instrumentation requires staging package');
  const service = 'android/app/src/main/java/com/usapp/us/UsGuardedMessagingService.java';
  await replaceFile(service, [
    ['final Map<String, String> data = message.getData();',
      'final Map<String, String> data = message.getData();\n        UsPushSupportPlugin.qaTrace(this, "fcm_message_received");'],
    ['if (message.getNotification() != null || !"2".equals(data.get("v"))) return;',
      'if (message.getNotification() != null || !"2".equals(data.get("v"))) { ' + trace('rejected_legacy_or_invalid_v2') + ' return; }'],
    ['if (!UsPushOwnerGate.accepts(this, data.get("installation"))) return;',
      'if (!UsPushOwnerGate.accepts(this, data.get("installation"))) { ' + trace('rejected_owner_or_installation') + ' return; }'],
    ['if (!UsPushSupportPlugin.isActivityResumed()) {\n            postPrivateSafeNotice(data.get("installation"));\n        }',
      'if (!UsPushSupportPlugin.isActivityResumed()) {\n            ' + trace('accepted_background') + '\n            postPrivateSafeNotice(data.get("installation"));\n        } else {\n            ' + trace('suppressed_foreground_as_designed') + '\n        }'],
    ['&& checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;',
      '&& checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) { ' + trace('blocked_os_permission') + ' return; }'],
    ['if (manager == null || !manager.areNotificationsEnabled()) return;',
      'if (manager == null || !manager.areNotificationsEnabled()) { ' + trace('blocked_os_app_notifications') + ' return; }'],
    ['if (manager.getNotificationChannel(CHANNEL).getImportance() == NotificationManager.IMPORTANCE_NONE) return;',
      'if (manager.getNotificationChannel(CHANNEL).getImportance() == NotificationManager.IMPORTANCE_NONE) { ' + trace('blocked_os_channel') + ' return; }'],
    ['if (!UsPushOwnerGate.accepts(this, installation)) return;',
      'if (!UsPushOwnerGate.accepts(this, installation)) { ' + trace('rejected_late_owner_change') + ' return; }'],
    ['if (intent == null) return;',
      'if (intent == null) { ' + trace('blocked_launch_intent') + ' return; }'],
    ['UsPushOwnerGate.postIfCurrent(this, installation,\n                () -> manager.notify("us-private-notice", NOTICE_ID, notification));',
      'boolean posted = UsPushOwnerGate.postIfCurrent(this, installation,\n                () -> manager.notify("us-private-notice", NOTICE_ID, notification));\n            ' +
      'UsPushSupportPlugin.qaTrace(this, posted ? "android_notify_called" : "rejected_owner_before_notify");'],
    ['} catch (RuntimeException ignored) {\n            // Permission was revoked',
      '} catch (RuntimeException ignored) {\n            ' + trace('android_notify_exception') + '\n            // Permission was revoked']
  ]);
  const pluginSrc = 'native-plugins/us-push-support/android/src/main/java/com/usapp/pushsupport/UsPushSupportPlugin.java';
  const patch = [
    ['import android.content.Context;',
      'import android.content.Context;\nimport android.content.SharedPreferences;'],
    ['public static boolean isActivityResumed() { return activityResumed; }',
      `public static boolean isActivityResumed() { return activityResumed; }
    // Stage-only bounded diagnostic history. NEVER save tokens, account ids,
    // payload contents, installation UUID or Firebase identifiers.
    public static void qaTrace(Context context, String event) {
        if (!"com.usapp.us.staging".equals(context.getPackageName())) return;
        synchronized (UsPushSupportPlugin.class) {
            SharedPreferences store = context.getApplicationContext()
                .getSharedPreferences("us_s3_private_qa_events", Context.MODE_PRIVATE);
            String current = store.getString("events", "");
            String next = current + new java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.ROOT)
                .format(new java.util.Date()) + " " + event + "\\n";
            if (next.length() > 4000) next = next.substring(next.length() - 4000);
            store.edit().putString("events", next).commit();
        }
    }
    @PluginMethod
    public void getQaPushDiagnostics(PluginCall call) {
        if (!"com.usapp.us.staging".equals(getContext().getPackageName())) {
            call.reject("not_staging");
            return;
        }
        NotificationManager nm = manager();
        NotificationChannel ch = nm == null ? null : nm.getNotificationChannel("us_partner");
        String history = getContext().getSharedPreferences("us_s3_private_qa_events", Context.MODE_PRIVATE)
            .getString("events", "");
        JSObject result = new JSObject();
        result.put("history", history);
        SharedPreferences gate = getContext().getSharedPreferences("us_private_push_owner_v2", Context.MODE_PRIVATE);
        result.put("ownerBound", gate.contains("owner") && gate.contains("installation"));
        result.put("activityResumed", activityResumed);
        result.put("notificationsEnabled", nm != null && nm.areNotificationsEnabled());
        result.put("channelImportance", ch == null ? -1 : ch.getImportance());
        call.resolve(result);
    }`],
    ['createChannels();',
      'createChannels();\n        qaTrace(getContext(), "qa_plugin_initialized");'],
    ['call.resolve(new JSObject().put("bound", bound));',
      'qaTrace(getContext(), bound ? "owner_bound" : "owner_bind_rejected");\n        call.resolve(new JSObject().put("bound", bound));'],
    ['call.resolve(new JSObject().put("cleared", cleared));',
      'qaTrace(getContext(), cleared ? "owner_cleared" : "owner_clear_failed");\n        call.resolve(new JSObject().put("cleared", cleared));']
  ];
  await replaceFile(pluginSrc, patch);
  // npm file: dependency can be a copy rather than a symlink on CI.
  const nodeCopy = 'node_modules/@us/push-support/android/src/main/java/com/usapp/pushsupport/UsPushSupportPlugin.java';
  try {
    await access(nodeCopy);
    if (!(await readFile(nodeCopy, 'utf8')).includes('void getQaPushDiagnostics')) {
      await replaceFile(nodeCopy, patch);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await replaceFile('android/app/src/main/res/values/strings.xml', [
    ['<string name="app_name">US</string>', '<string name="app_name">US STAGING</string>'],
    ['<string name="title_activity_main">US</string>', '<string name="title_activity_main">US STAGING</string>']
  ]);
  process.stdout.write('STAGING-only guarded FCM service trace + plugin method + app label installed\n');
}