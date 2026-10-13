#!/usr/bin/env node
// Google Play AAB gate for US.
//
// Reads what the Android tooling already extracted from a built
// app-release.aab (the manifest dumped by `bundletool dump manifest`, the zip
// entry list and an unzipped copy) and checks it against the Play and privacy
// rules US has decided. It never reads signing secrets and never uploads.
//
// Usage:
//   node scripts/validate-android-bundle.mjs \
//     --manifest <AndroidManifest.xml> --entries <entries.txt> \
//     --extracted <dir> --aab <app-release.aab> \
//     --expect-version-code <n> --expect-version-name <x.y.z> \
//     --mode test|upload --firebase-configured true|false --out <dir>
//
// Exit code 1 when any check fails. Warnings never fail the build; they are
// listed in the report for a human to decide.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const APPLICATION_ID = 'com.usapp.us';
// Google Play: new apps and updates must target API 36 from 31 Aug 2026.
export const PLAY_MIN_TARGET_SDK = 36;
export const EXPECTED_MIN_SDK = 26;
// Google Play rejects versionCode above 2,100,000,000.
export const PLAY_MAX_VERSION_CODE = 2100000000;
export const GUARDED_FCM_SERVICE = 'com.usapp.us.UsGuardedMessagingService';
export const FCM_ACTION = 'com.google.firebase.MESSAGING_EVENT';

// Permissions US must never ship: each one triggers a Play policy declaration
// or contradicts what US tells users it does.
export const FORBIDDEN_PERMISSIONS = [
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.QUERY_ALL_PACKAGES',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.MANAGE_EXTERNAL_STORAGE',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.USE_EXACT_ALARM',
  'android.permission.REQUEST_INSTALL_PACKAGES',
  'android.permission.READ_CONTACTS',
  'android.permission.READ_SMS',
  'android.permission.SEND_SMS',
  'android.permission.READ_CALL_LOG',
  'android.permission.READ_PHONE_STATE',
  'android.permission.BODY_SENSORS',
  'android.permission.ACTIVITY_RECOGNITION'
];

// Permissions that must be reflected in the Play Data safety form.
export const DATA_SAFETY_PERMISSIONS = {
  'android.permission.CAMERA': 'Foto e video (fotocamera)',
  'android.permission.ACCESS_FINE_LOCATION': 'Posizione precisa',
  'android.permission.ACCESS_COARSE_LOCATION': 'Posizione approssimativa',
  'android.permission.RECORD_AUDIO': 'Audio (note vocali)',
  'android.permission.POST_NOTIFICATIONS': 'Notifiche',
  'com.google.android.gms.permission.AD_ID': 'ID pubblicità'
};

const SECRET_PATTERNS = [
  { name: 'private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/ },
  { name: 'Google service account JSON', re: /"type"\s*:\s*"service_account"/ },
  { name: 'Supabase service_role JWT claim', re: /"role"\s*:\s*"service_role"/ },
  { name: 'Supabase secret key', re: /\bsb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: 'service role env name with value', re: /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"][^'"]{20,}/ }
];

const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.json', '.html', '.css', '.txt', '.xml', '.properties', '.webmanifest', '.svg']);

// ---------------------------------------------------------------- XML parsing
// `bundletool dump manifest` prints plain, well formed XML without CDATA, so a
// small tag tokenizer is enough and keeps this script dependency free.
export function parseManifestXml(xml) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const clean = xml.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const tagRe = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
  let match;
  while ((match = tagRe.exec(clean))) {
    const [, closing, tag, rawAttrs, selfClosing] = match;
    if (closing) {
      while (stack.length > 1 && stack.pop().tag !== tag) { /* unwind */ }
      continue;
    }
    const attrs = {};
    for (const [, key, value] of rawAttrs.matchAll(/([\w.:-]+)\s*=\s*"([^"]*)"/g)) attrs[key] = decodeXml(value);
    const node = { tag, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }
  const manifest = root.children.find((n) => n.tag === 'manifest');
  if (!manifest) throw new Error('No <manifest> element found in dumped manifest');
  return manifest;
}

function decodeXml(value) {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

const children = (node, tag) => node.children.filter((c) => c.tag === tag);
const androidAttr = (node, name) => node.attrs[`android:${name}`];

function qualify(name, pkg) {
  if (!name) return name;
  if (name.startsWith('.')) return `${pkg}${name}`;
  if (!name.includes('.')) return `${pkg}.${name}`;
  return name;
}

export function summarizeManifest(manifest) {
  const pkg = manifest.attrs.package;
  const usesSdk = children(manifest, 'uses-sdk')[0];
  const application = children(manifest, 'application')[0] || { attrs: {}, children: [] };
  const permissions = [
    ...children(manifest, 'uses-permission'),
    ...children(manifest, 'uses-permission-sdk-23')
  ].map((n) => androidAttr(n, 'name')).filter(Boolean);
  const components = [];
  for (const kind of ['activity', 'activity-alias', 'service', 'receiver', 'provider']) {
    for (const node of children(application, kind)) {
      const actions = children(node, 'intent-filter')
        .flatMap((f) => children(f, 'action'))
        .map((a) => androidAttr(a, 'name'));
      components.push({
        kind,
        name: qualify(androidAttr(node, 'name'), pkg),
        exported: androidAttr(node, 'exported'),
        permission: androidAttr(node, 'permission'),
        actions
      });
    }
  }
  return {
    package: pkg,
    versionCode: androidAttr(manifest, 'versionCode'),
    versionName: androidAttr(manifest, 'versionName'),
    minSdk: usesSdk ? androidAttr(usesSdk, 'minSdkVersion') : undefined,
    targetSdk: usesSdk ? androidAttr(usesSdk, 'targetSdkVersion') : undefined,
    application: {
      debuggable: androidAttr(application, 'debuggable'),
      testOnly: androidAttr(application, 'testOnly'),
      allowBackup: androidAttr(application, 'allowBackup'),
      usesCleartextTraffic: androidAttr(application, 'usesCleartextTraffic'),
      networkSecurityConfig: androidAttr(application, 'networkSecurityConfig')
    },
    permissions: [...new Set(permissions)].sort(),
    components
  };
}

// ---------------------------------------------------------------- checks
export function checkManifest(summary, { expectVersionCode, expectVersionName, mode }) {
  const results = [];
  const pass = (id, detail) => results.push({ id, level: 'pass', detail });
  const fail = (id, detail) => results.push({ id, level: 'fail', detail });
  const warn = (id, detail) => results.push({ id, level: 'warn', detail });

  summary.package === APPLICATION_ID
    ? pass('application-id', summary.package)
    : fail('application-id', `atteso ${APPLICATION_ID}, trovato ${summary.package}`);

  const code = Number(summary.versionCode);
  if (!Number.isInteger(code) || code < 1 || code > PLAY_MAX_VERSION_CODE) {
    fail('version-code-range', `versionCode ${summary.versionCode} fuori da 1..${PLAY_MAX_VERSION_CODE}`);
  } else if (expectVersionCode != null && String(code) !== String(expectVersionCode)) {
    fail('version-code-match', `atteso ${expectVersionCode}, trovato ${code}`);
  } else {
    pass('version-code', String(code));
  }

  if (!/^\d+\.\d+\.\d+$/.test(summary.versionName || '')) {
    fail('version-name-format', `versionName "${summary.versionName}" non è x.y.z`);
  } else if (expectVersionName != null && summary.versionName !== expectVersionName) {
    fail('version-name-match', `atteso ${expectVersionName}, trovato ${summary.versionName}`);
  } else {
    pass('version-name', summary.versionName);
  }

  Number(summary.targetSdk) >= PLAY_MIN_TARGET_SDK
    ? pass('target-sdk', String(summary.targetSdk))
    : fail('target-sdk', `targetSdk ${summary.targetSdk} < ${PLAY_MIN_TARGET_SDK} richiesto da Play`);
  String(summary.minSdk) === String(EXPECTED_MIN_SDK)
    ? pass('min-sdk', String(summary.minSdk))
    : warn('min-sdk', `minSdk ${summary.minSdk}, atteso ${EXPECTED_MIN_SDK}: verificare che il cambio sia voluto`);

  const app = summary.application;
  app.debuggable === 'true' ? fail('not-debuggable', 'android:debuggable="true"') : pass('not-debuggable', 'ok');
  app.testOnly === 'true' ? fail('not-test-only', 'android:testOnly="true"') : pass('not-test-only', 'ok');
  app.allowBackup === 'false' ? pass('backup-disabled', 'allowBackup=false') : fail('backup-disabled', `allowBackup=${app.allowBackup}`);
  app.usesCleartextTraffic === 'true'
    ? fail('no-cleartext', 'usesCleartextTraffic=true')
    : pass('no-cleartext', app.networkSecurityConfig ? `networkSecurityConfig=${app.networkSecurityConfig}` : 'default (bloccato da target >= 28)');

  const forbidden = summary.permissions.filter((p) => FORBIDDEN_PERMISSIONS.includes(p));
  forbidden.length ? fail('forbidden-permissions', forbidden.join(', ')) : pass('forbidden-permissions', 'nessuno');

  const dataSafety = summary.permissions.filter((p) => DATA_SAFETY_PERMISSIONS[p]);
  warn('data-safety-permissions', dataSafety.map((p) => `${p} -> ${DATA_SAFETY_PERMISSIONS[p]}`).join('; ') || 'nessuno');
  if (!summary.permissions.includes('android.permission.RECORD_AUDIO')) {
    warn('record-audio-missing', 'RECORD_AUDIO assente: le note vocali di "Lasciato per te" non funzionano su Android (roadmap B2, manifest della Squadra 1)');
  }

  const openExported = summary.components.filter((c) => c.exported === 'true' && !c.permission
    && !(c.kind === 'activity' && c.name === `${APPLICATION_ID}.MainActivity`));
  openExported.length
    ? fail('exported-components', openExported.map((c) => `${c.kind} ${c.name}`).join(', '))
    : pass('exported-components', 'solo MainActivity o componenti protetti da permesso');

  const fcmReceivers = summary.components.filter((c) => c.kind === 'service' && c.actions.includes(FCM_ACTION));
  const guardedOnly = fcmReceivers.length === 1 && fcmReceivers[0].name === GUARDED_FCM_SERVICE && fcmReceivers[0].exported !== 'true';
  const fcmDetail = fcmReceivers.map((c) => c.name).join(', ') || 'nessuno';
  if (guardedOnly) pass('fcm-guarded-receiver', fcmDetail);
  else if (mode === 'upload') fail('fcm-guarded-receiver', `serve solo ${GUARDED_FCM_SERVICE} (PR #187), trovati: ${fcmDetail}`);
  else warn('fcm-guarded-receiver', `build di prova senza servizio protetto (PR #187 non mergiata), trovati: ${fcmDetail}`);

  return results;
}

export function checkEntries(entries, { mode, firebaseConfigured, readLib }) {
  const results = [];
  const has = (re) => entries.some((e) => re.test(e));
  has(/^BundleConfig\.pb$/) && has(/^base\/manifest\/AndroidManifest\.xml$/)
    ? results.push({ id: 'bundle-structure', level: 'pass', detail: 'BundleConfig.pb + base/manifest' })
    : results.push({ id: 'bundle-structure', level: 'fail', detail: 'struttura AAB inattesa' });
  has(/^base\/dex\/classes\d*\.dex$/)
    ? results.push({ id: 'dex-present', level: 'pass', detail: 'ok' })
    : results.push({ id: 'dex-present', level: 'fail', detail: 'nessun classes.dex nel modulo base' });
  has(/^base\/assets\/public\/index\.html$/)
    ? results.push({ id: 'web-bundle-present', level: 'pass', detail: 'base/assets/public/index.html' })
    : results.push({ id: 'web-bundle-present', level: 'fail', detail: 'web app Capacitor assente: eseguire build:capacitor-web + cap sync' });
  has(/^base\/assets\/capacitor\.config\.json$/)
    ? results.push({ id: 'capacitor-config-present', level: 'pass', detail: 'ok' })
    : results.push({ id: 'capacitor-config-present', level: 'fail', detail: 'capacitor.config.json assente' });

  const nativeLibs = entries.filter((e) => /\/lib\/[^/]+\/[^/]+\.so$/.test(e));
  if (!nativeLibs.length) {
    results.push({ id: 'page-size-16kb', level: 'pass', detail: 'nessuna libreria nativa: conforme alle pagine da 16 KB' });
  } else if (!readLib) {
    results.push({ id: 'page-size-16kb', level: 'warn', detail: `librerie native non ispezionate: ${nativeLibs.join(', ')}` });
  } else {
    // Play requires 16 KB aligned LOAD segments for 64-bit ABIs.
    const bad = [];
    const checked = [];
    for (const lib of nativeLibs) {
      const abi = lib.split('/').slice(-2)[0];
      if (abi !== 'arm64-v8a' && abi !== 'x86_64') continue;
      let align;
      try { align = elfMinLoadAlignment(readLib(lib)); } catch (error) { bad.push(`${lib} (${error.message})`); continue; }
      (align >= 16384 ? checked : bad).push(`${lib} (align ${align})`);
    }
    bad.length
      ? results.push({ id: 'page-size-16kb', level: 'fail', detail: `segmenti LOAD non allineati a 16 KB: ${bad.join(', ')}` })
      : results.push({ id: 'page-size-16kb', level: 'pass', detail: `librerie 64 bit allineate a 16 KB: ${checked.join(', ')}` });
  }

  const debugLeftovers = entries.filter((e) => /\.(?:jks|keystore|p12|pem)$|keystore\.properties$|google-services\.json$/i.test(e));
  debugLeftovers.length
    ? results.push({ id: 'no-signing-material', level: 'fail', detail: debugLeftovers.join(', ') })
    : results.push({ id: 'no-signing-material', level: 'pass', detail: 'nessun keystore o file di configurazione privato nel bundle' });

  if (firebaseConfigured) results.push({ id: 'firebase-config', level: 'pass', detail: 'google-services.json applicato in build' });
  else if (mode === 'upload') results.push({ id: 'firebase-config', level: 'fail', detail: 'ANDROID_GOOGLE_SERVICES_JSON_B64 mancante: notifiche native non funzionerebbero' });
  else results.push({ id: 'firebase-config', level: 'warn', detail: 'build di prova senza Firebase: notifiche native non attive' });
  return results;
}

// Smallest p_align among PT_LOAD program headers of an ELF shared library.
export function elfMinLoadAlignment(buf) {
  if (buf.length < 52 || buf.readUInt32BE(0) !== 0x7f454c46) throw new Error('non è un file ELF');
  const is64 = buf[4] === 2;
  const le = buf[5] === 1;
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const u64 = (o) => Number(le ? buf.readBigUInt64LE(o) : buf.readBigUInt64BE(o));
  const phoff = is64 ? u64(0x20) : u32(0x1c);
  const phentsize = u16(is64 ? 0x36 : 0x2a);
  const phnum = u16(is64 ? 0x38 : 0x2c);
  let min = Infinity;
  for (let i = 0; i < phnum; i += 1) {
    const base = phoff + i * phentsize;
    if (u32(base) !== 1) continue; // PT_LOAD
    min = Math.min(min, is64 ? u64(base + 0x30) : u32(base + 0x1c));
  }
  if (min === Infinity) throw new Error('nessun segmento LOAD');
  return min;
}

// A Supabase service_role key appears as a base64url JWT, so the role claim is
// only visible after decoding the payload.
export function findServiceRoleJwts(text) {
  const found = [];
  for (const [token, payload] of text.matchAll(/eyJ[\w-]{8,}\.(eyJ[\w-]{8,})\.[\w-]{8,}/g)) {
    try {
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (claims && claims.role === 'service_role') found.push(token.slice(0, 12));
    } catch { /* not a JWT */ }
  }
  return found;
}

export function scanForSecrets(files) {
  const hits = [];
  for (const { name, text } of files) {
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.re.test(text)) hits.push(`${name}: ${pattern.name}`);
    }
    if (findServiceRoleJwts(text).length) hits.push(`${name}: Supabase service_role JWT`);
  }
  return hits.length
    ? [{ id: 'no-embedded-secrets', level: 'fail', detail: hits.join('; ') }]
    : [{ id: 'no-embedded-secrets', level: 'pass', detail: `${files.length} file di testo controllati` }];
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

export function readTextFiles(dir) {
  const files = [];
  for (const full of walk(dir)) {
    const ext = path.extname(full).toLowerCase();
    // .dex is scanned as latin1 so constants compiled into BuildConfig count too.
    if (!TEXT_EXTENSIONS.has(ext) && ext !== '.dex') continue;
    if (statSync(full).size > 32 * 1024 * 1024) continue;
    files.push({ name: path.relative(dir, full), text: readFileSync(full, ext === '.dex' ? 'latin1' : 'utf8') });
  }
  return files;
}

export function renderMarkdown(report) {
  const icon = { pass: 'OK', warn: 'ATTENZIONE', fail: 'ERRORE' };
  const lines = [
    `# Validazione AAB US (${report.mode})`,
    '',
    `- Esito: **${report.ok ? 'SUPERATA' : 'FALLITA'}**`,
    `- Pacchetto: ${report.summary.package} · versionCode ${report.summary.versionCode} · versionName ${report.summary.versionName}`,
    `- minSdk ${report.summary.minSdk} · targetSdk ${report.summary.targetSdk}`,
    report.aab ? `- AAB: ${report.aab.bytes} byte · SHA-256 ${report.aab.sha256}` : '',
    '',
    '| Controllo | Esito | Dettaglio |',
    '|---|---|---|',
    ...report.results.map((r) => `| ${r.id} | ${icon[r.level]} | ${String(r.detail).replace(/\|/g, '\\|')} |`),
    '',
    '## Permessi dichiarati',
    '',
    ...report.summary.permissions.map((p) => `- ${p}`),
    ''
  ];
  return lines.filter((l, i) => l !== '' || lines[i - 1] !== '').join('\n');
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--')) throw new Error(`Argomento inatteso: ${argv[i]}`);
    args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
}

export function main(argv) {
  const args = parseArgs(argv);
  const mode = args.mode;
  if (mode !== 'test' && mode !== 'upload') throw new Error('--mode deve essere test o upload');
  for (const key of ['manifest', 'entries', 'extracted', 'out']) {
    if (!args[key]) throw new Error(`--${key} è obbligatorio`);
  }
  const summary = summarizeManifest(parseManifestXml(readFileSync(args.manifest, 'utf8')));
  const entries = readFileSync(args.entries, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const results = [
    ...checkManifest(summary, {
      expectVersionCode: args['expect-version-code'],
      expectVersionName: args['expect-version-name'],
      mode
    }),
    ...checkEntries(entries, {
      mode,
      firebaseConfigured: args['firebase-configured'] === 'true',
      readLib: (entry) => readFileSync(path.join(args.extracted, entry))
    }),
    ...scanForSecrets(readTextFiles(args.extracted))
  ];
  let aab;
  if (args.aab) {
    const bytes = readFileSync(args.aab);
    aab = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  const report = { mode, ok: !results.some((r) => r.level === 'fail'), summary, aab, results };
  mkdirSync(args.out, { recursive: true });
  writeFileSync(path.join(args.out, 'aab-validation.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.join(args.out, 'aab-validation.md'), `${renderMarkdown(report)}\n`);
  writeFileSync(path.join(args.out, 'permissions.txt'), `${summary.permissions.join('\n')}\n`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = main(process.argv.slice(2));
    console.log(renderMarkdown(report));
    process.exitCode = report.ok ? 0 : 1;
  } catch (error) {
    console.error(`Validazione AAB interrotta: ${error.message}`);
    process.exitCode = 1;
  }
}
