const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const file = (relative) => path.join(ROOT, ...relative.split('/'));
const read = (relative) => fs.readFileSync(file(relative), 'utf8');

async function loadContract() {
  const relative = 'supabase/functions/_shared/widget-think-contract.mjs';
  assert.ok(fs.existsSync(file(relative)), `contratto backend mancante: ${relative}`);
  return import(`${pathToFileURL(file(relative)).href}?test=${Date.now()}`);
}

test('widget send accetta solo token opaco header-only e action UUID valido', async () => {
  const { parseWidgetThinkRequest } = await loadContract();
  const token = 'A'.repeat(43);
  const actionId = '2de8db04-d677-4f8c-97bc-8ae3e068503f';
  const accepted = await parseWidgetThinkRequest(new Request('https://example.test/widget-think-send', {
    method: 'POST',
    headers: { 'x-us-widget-token': token, 'content-type': 'application/json' },
    body: JSON.stringify({ actionId })
  }));
  assert.deepEqual(accepted, { token, actionId });

  await assert.rejects(
    parseWidgetThinkRequest(new Request(`https://example.test/widget-think-send?token=${token}`, {
      method: 'POST', body: JSON.stringify({ actionId })
    })),
    /query/i
  );
  await assert.rejects(
    parseWidgetThinkRequest(new Request('https://example.test/widget-think-send', {
      method: 'POST', headers: { 'x-us-widget-token': 'short' }, body: JSON.stringify({ actionId })
    })),
    /token/i
  );
  await assert.rejects(
    parseWidgetThinkRequest(new Request('https://example.test/widget-think-send', {
      method: 'POST', headers: { 'x-us-widget-token': token }, body: JSON.stringify({ actionId: 'not-a-uuid' })
    })),
    /action/i
  );
});

test('token hash è deterministico e non conserva il token raw', async () => {
  const { sha256Hex } = await loadContract();
  const token = 'abcdefghijklmnopqrstuvwxyzABCDEFGH123456789';
  assert.equal(await sha256Hex(token), 'd43d4b96505fb9b487cfab30695d823a0b362961a3e6c008339642ab35860112');
  assert.doesNotMatch(await sha256Hex(token), new RegExp(token));
});

test('migration limita la credential a think:send e rende atomica idempotenza + insert', () => {
  const directory = file('supabase/migrations');
  assert.ok(fs.existsSync(directory), 'migration W1.3 mancante');
  const migrations = fs.readdirSync(directory).filter((name) => name.endsWith('_widget_think_silent_send.sql'));
  assert.equal(migrations.length, 1, 'deve esistere una sola migration W1.3');
  const sql = read(`supabase/migrations/${migrations[0]}`);
  assert.match(sql, /think:send/);
  assert.match(sql, /widget_action_receipts/i);
  assert.match(sql, /unique\s*\([^)]*token_id[^)]*action_id/i);
  assert.match(sql, /widget_send_think_internal/i);
  assert.match(sql, /insert\s+into\s+public\.shared_messages/i);
  assert.match(sql, /kind,\s*body\)[\s\S]*'think'/i);
  assert.match(
    sql,
    /select\s+message\.recipient_id\s+into\s+partner_id[\s\S]*from\s+public\.shared_messages\s+as\s+message/i,
    'il replay idempotente deve qualificare recipient_id per evitare ambiguità PL/pgSQL'
  );
  assert.match(sql, /revoke\s+all[\s\S]*from\s+public/i);
  assert.match(sql, /grant\s+execute[\s\S]*to\s+service_role/i);
  assert.doesNotMatch(sql, /grant[\s\S]{0,80}widget_(?:tokens|action_receipts)[\s\S]{0,80}to\s+(?:anon|authenticated)/i);
});

test('migration hotfix qualifica couple_id nella funzione widget per evitare ambiguita PL/pgSQL', () => {
  const directory = file('supabase/migrations');
  const migrations = fs.readdirSync(directory).filter((name) => name.endsWith('_fix_widget_think_couple_id_ambiguity.sql'));
  assert.equal(migrations.length, 1, 'serve una sola migration hotfix per couple_id');
  const sql = read(`supabase/migrations/${migrations[0]}`);
  assert.match(sql, /from\s+public\.profiles\s+as\s+partner/i);
  assert.match(sql, /partner\.couple_id\s*=\s*credential\.couple_id/i);
  assert.match(sql, /partner\.id\s*<>\s*credential\.profile_id/i);
  assert.match(sql, /order\s+by\s+partner\.created_at,\s*partner\.id/i);
});

test('Edge Functions separano provisioning JWT e send custom auth senza query token', () => {
  const provision = read('supabase/functions/widget-device-token/index.ts');
  const send = read('supabase/functions/widget-think-send/index.ts');
  const secrets = read('supabase/functions/_shared/supabase-secret.ts');
  const config = read('supabase/config.toml');
  assert.match(config, /\[functions\.widget-device-token\][\s\S]*verify_jwt\s*=\s*true/);
  assert.match(config, /\[functions\.widget-think-send\][\s\S]*verify_jwt\s*=\s*false/);
  assert.match(provision, /auth\.getUser/);
  assert.match(provision, /crypto\.getRandomValues/);
  assert.match(provision, /token_hash/);
  assert.match(provision, /revoked_at/);
  assert.doesNotMatch(provision, /access_token|refresh_token/i);
  assert.ok(
    provision.indexOf('operation !== "issue"') < provision.indexOf('.from("widget_action_tokens")'),
    'operation deve essere validata prima di revocare credential esistenti'
  );
  assert.match(send, /parseWidgetThinkRequest/);
  assert.match(send, /widget_send_think_internal/);
  assert.match(send, /dispatchThinkWebPush/);
  assert.match(provision, /supabaseSecretKey/);
  assert.match(send, /supabaseSecretKey/);
  assert.match(secrets, /SUPABASE_SECRET_KEYS/);
  assert.match(secrets, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(send, /searchParams\.get\(["']token/);
  assert.doesNotMatch(send, /createClient\([^\n]+ANON|access_token|refresh_token/i);
});

test('Web Push Think ha una sola implementation condivisa', () => {
  const shared = read('supabase/functions/_shared/think-web-push.ts');
  const web = read('supabase/functions/send-web-push/index.ts');
  const widget = read('supabase/functions/widget-think-send/index.ts');
  assert.match(shared, /export\s+async\s+function\s+dispatchThinkWebPush/);
  assert.match(shared, /push_subscriptions/);
  assert.match(shared, /notification_preferences/);
  assert.match(shared, /push_event_log/);
  assert.ok(
    shared.indexOf('get_internal_vapid_private_key') < shared.indexOf('.from("push_event_log").insert'),
    'la configurazione VAPID deve essere validata prima di consumare la chiave dedupe'
  );
  assert.match(web, /dispatchThinkWebPush/);
  assert.match(web, /supabaseSecretKey/);
  assert.match(widget, /dispatchThinkWebPush/);
  assert.doesNotMatch(widget, /webpush\.sendNotification|push_subscriptions|notification_preferences/);
});

test('heart usa receiver silent e body continua ad aprire Home', () => {
  const provider = read('native-plugins/us-widget-bridge/android/src/main/java/com/usapp/widget/UsThinkWidgetProvider.java');
  const receiver = read('native-plugins/us-widget-bridge/android/src/main/java/com/usapp/widget/UsThinkWidgetActionReceiver.java');
  const manifest = read('native-plugins/us-widget-bridge/android/src/main/AndroidManifest.xml');
  assert.match(provider, /setOnClickPendingIntent\(R\.id\.us_widget_root,\s*launchIntent/);
  assert.match(provider, /setOnClickPendingIntent\(R\.id\.us_widget_heart,\s*sendIntent/);
  assert.match(provider, /PendingIntent\.getBroadcast/);
  assert.match(provider, /PendingIntent\.getActivity/);
  assert.doesNotMatch(receiver, /startActivity|getLaunchIntentForPackage/);
  assert.match(receiver, /goAsync\(\)/);
  assert.match(receiver, /ACTION_SEND_THINK/);
  assert.match(manifest, /UsThinkWidgetActionReceiver/);
  assert.match(manifest, /android:exported="false"/);
});

test('client Android usa header token, action id e nessun retry o Supabase client', () => {
  const client = read('native-plugins/us-widget-bridge/android/src/main/java/com/usapp/widget/UsWidgetActionClient.java');
  assert.match(client, /X-US-Widget-Token/i);
  assert.match(client, /actionId/);
  assert.match(client, /HttpURLConnection/);
  assert.match(client, /setConnectTimeout/);
  assert.match(client, /setReadTimeout/);
  assert.doesNotMatch(client, /retry|OkHttp|createClient|io\.supabase|accessToken|refreshToken/i);
  assert.doesNotMatch(client, /\?token=/i);
  const timeout = Number(client.match(/TIMEOUT_MS\s*=\s*(\d+)/)?.[1] || 0);
  assert.ok(timeout > 0 && timeout <= 4000, 'il singolo tentativo deve terminare entro la finestra di goAsync del receiver');
});

test('credential native è Keystore encrypted, non-backup e account-isolated', () => {
  const store = read('native-plugins/us-widget-bridge/android/src/main/java/com/usapp/widget/UsWidgetCredentialStore.java');
  assert.match(store, /AndroidKeyStore/);
  assert.match(store, /AES\/GCM\/NoPadding/);
  assert.match(store, /getNoBackupFilesDir\(\)/);
  assert.match(store, /AtomicFile/);
  assert.match(store, /ownerHash/);
  assert.match(store, /clear\(\)/);
  assert.doesNotMatch(store, /accessToken|refreshToken|supabaseKey/i);
});

test('feedback widget distingue sending, sent e failed senza animazione fragile', () => {
  const provider = read('native-plugins/us-widget-bridge/android/src/main/java/com/usapp/widget/UsThinkWidgetProvider.java');
  const layout = read('native-plugins/us-widget-bridge/android/src/main/res/layout/us_widget_think.xml');
  assert.match(layout, /us_widget_heart_pulse/);
  assert.match(provider, /lastActionStatus/);
  assert.match(provider, /Invio…/);
  assert.match(provider, /Inviato/);
  assert.match(provider, /Riprova/);
  assert.doesNotMatch(provider, /AnimationDrawable|ObjectAnimator|ValueAnimator/);
});

test('MainActivity resta vuota e nessuna credential entra nello snapshot', () => {
  const activity = read('android/app/src/main/java/com/usapp/us/MainActivity.java').replace(/\r\n/g, '\n').trim();
  const snapshot = read('native-plugins/us-widget-bridge/android/src/main/java/com/usapp/widget/UsWidgetSnapshotStore.java');
  assert.equal(activity, 'package com.usapp.us;\n\nimport com.getcapacitor.BridgeActivity;\n\npublic class MainActivity extends BridgeActivity {}');
  assert.doesNotMatch(snapshot, /token|credential|Authorization/i);
});
