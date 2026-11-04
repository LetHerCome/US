// Android live (04/11/2026): US-STAGING inside the real Android app, with the
// web part served from this PC, so a JS/CSS change shows in the app in about a
// second without a new APK. Staging only, debug only: never production
// Supabase, never a release, never the Play bundle.
//
//   node scripts/android-live.mjs serve        server + rebuild/reload on save
//   node scripts/android-live.mjs apk          build and install the "US LIVE" app (once)
//   node scripts/android-live.mjs reload       reload the app now
//   node scripts/android-live.mjs eval "<js>"  run JS in the app's WebView, print the result
//   node scripts/android-live.mjs shot <file>  screenshot of the device (PNG)
//
// The app (com.usapp.us.staging.live) opens http://localhost:PORT, which
// `adb reverse` forwards to this PC: the emulator and a USB phone alike.
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { watch } from 'node:fs';
import { cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PRODUCTION_PROJECT_REF,
  STAGING_HOST,
  isolateStagingBuild
} from './configure-s3-staging-qa.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.US_LIVE_PORT || 5174);const OUT = path.join(ROOT, 'dist', 'android-live');
const BUNDLE = path.join(ROOT, 'dist', 'capacitor');
const LIVE_APP_ID = 'com.usapp.us.staging.live';
const STAGING_SITE_APP = 'https://us-staging-s31.pages.dev/app.js';
const SDK = process.env.ANDROID_HOME || path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
const ADB = path.join(SDK, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const ASSETS = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets');
const LIVE_CLIENT = '/__us_live.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.txt': 'text/plain; charset=utf-8'
};

function adb(args, options = {}) {
  const result = spawnSync(ADB, args, { encoding: options.encoding ?? 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw new Error(`adb non trovato in ${ADB} (${result.error.message})`);
  if (result.status !== 0 && !options.allowFail) {
    throw new Error(`adb ${args.join(' ')}: ${String(result.stderr || result.stdout).trim()}`);
  }
  return result;
}

function devices() {
  return adb(['devices']).stdout.split(/\r?\n/).slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state === 'device')
    .map(([serial]) => serial);
}

function forwardPort() {
  const serials = devices();
  for (const serial of serials) adb(['-s', serial, 'reverse', `tcp:${PORT}`, `tcp:${PORT}`]);
  return serials;
}

// The staging publishable key: a client key every browser of the staging site
// already receives. From the env when set, else read off the staging site.
async function stagingKey() {
  const fromEnv = process.env.US_STAGING_SUPABASE_PUBLISHABLE_KEY;
  if (fromEnv) return fromEnv;
  const response = await fetch(STAGING_SITE_APP, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Sito di staging non raggiungibile (${response.status})`);
  const source = await response.text();
  if (!source.includes(`const SB_URL = 'https://${STAGING_HOST}';`) || source.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error('Il sito di staging non punta a US-STAGING: chiave non letta');
  }
  const key = source.match(/^const SB_KEY = '(sb_publishable_[A-Za-z0-9_-]+)';$/m)?.[1];
  if (!key) throw new Error('Chiave pubblica di staging non trovata sul sito di staging');
  return key;
}

// The native web bundle (scripts/build-capacitor-web.mjs) rewritten for
// US-STAGING the same way as the signed staging QA APK, into dist/android-live.
async function buildWeb(key) {
  const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-capacitor-web.mjs')], {
    cwd: ROOT, encoding: 'utf8'
  });
  if (result.status !== 0) throw new Error(`Build web fallito:\n${result.stderr || result.stdout}`);
  const [appJs, indexHtml, capacitorJson] = await Promise.all([
    readFile(path.join(BUNDLE, 'app.js'), 'utf8'),
    readFile(path.join(BUNDLE, 'index.html'), 'utf8'),
    readFile(path.join(ROOT, 'capacitor.config.json'), 'utf8')
  ]);
  const staged = isolateStagingBuild({ appJs, indexHtml, capacitorJson, publishableKey: key });
  await rm(OUT, { recursive: true, force: true });
  await cp(BUNDLE, OUT, { recursive: true });
  const index = staged.indexHtml.replace('</body>', `<script src="${LIVE_CLIENT}"></script>\n</body>`);
  if (!index.includes(LIVE_CLIENT)) throw new Error('index.html senza </body>: client live non inserito');
  await writeFile(path.join(OUT, 'app.js'), staged.appJs, 'utf8');
  await writeFile(path.join(OUT, 'index.html'), index, 'utf8');
  return staged;
}

const LIVE_CLIENT_SOURCE = `// Android live (dev server only, never in a build): reload on save.
(() => {
  const source = new EventSource('/__us_live');
  source.addEventListener('reload', () => location.reload());
})();
`;

async function serve() {
  const key = await stagingKey();
  let started = Date.now();
  await buildWeb(key);
  console.log(`Build web di staging pronto (${Date.now() - started} ms)`);
  const clients = new Set();
  const broadcast = () => { for (const res of clients) res.write('event: reload\ndata: 1\n\n'); };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname === '/__us_live') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(': live\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (url.pathname === '/__us_live/reload') {
      broadcast();
      res.writeHead(204).end();
      return;
    }
    if (url.pathname === LIVE_CLIENT) {
      res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' }).end(LIVE_CLIENT_SOURCE);
      return;
    }
    let relative = decodeURIComponent(url.pathname);
    if (relative.endsWith('/')) relative += 'index.html';
    const file = path.resolve(OUT, `.${relative}`);
    if (file !== OUT && !file.startsWith(OUT + path.sep)) { res.writeHead(403).end(); return; }
    const info = await stat(file).catch(() => null);
    if (!info?.isFile() && path.extname(relative)) { res.writeHead(404).end(); return; }
    const target = info?.isFile() ? file : path.join(OUT, 'index.html');
    try {
      const body = await readFile(target);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Server live: http://localhost:${PORT} (solo questo PC)`);
    try {
      const serials = forwardPort();
      console.log(serials.length
        ? `adb reverse attivo su: ${serials.join(', ')}`
        : 'Nessun dispositivo adb: avvia l\'emulatore e poi "reload" (o riavvia serve).');
    } catch (error) { console.log(error.message); }
  });

  const IGNORED = /^(node_modules|dist|android|ios|\.git|\.claude|docs|tests|scripts|supabase|cloudflare|native-plugins)([\\/]|$)/;
  const WATCHED = /\.(js|mjs|css|html|json|png|webp|svg|jpg|jpeg|gif|woff2?)$/i;
  let timer = null;
  let building = false;
  let again = false;
  const rebuild = async () => {
    if (building) { again = true; return; }
    building = true;
    started = Date.now();
    try {
      await buildWeb(key);
      try { forwardPort(); } catch {}
      broadcast();
      console.log(`↻ ricaricato (${Date.now() - started} ms, ${clients.size} app collegate)`);
    } catch (error) {
      console.error(`✗ ${error.message}`);
    } finally {
      building = false;
      if (again) { again = false; rebuild(); }
    }
  };
  watch(ROOT, { recursive: true }, (_event, name) => {
    if (!name || IGNORED.test(name) || !WATCHED.test(name)) return;
    clearTimeout(timer);
    timer = setTimeout(rebuild, 200);
  });
  console.log('Guardo i file di US: salva e l\'app si ricarica. Ctrl+C per fermare.');
}

async function moveAside(name) {
  const from = path.join(ASSETS, name);
  const backup = `${from}.android-live-backup`;
  if (!(await stat(from).catch(() => null))) return async () => { await rm(from, { recursive: true, force: true }); };
  await rm(backup, { recursive: true, force: true });
  await rename(from, backup);
  return async () => { await rm(from, { recursive: true, force: true }); await rename(backup, from); };
}

function gitDiff(files) {
  return spawnSync('git', ['diff', '--name-only', '--', ...files], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
}

async function apk() {
  if (!devices().length) throw new Error('Nessun dispositivo adb: avvia l\'emulatore (o collega il telefono) prima di "apk".');
  const key = await stagingKey();
  await buildWeb(key);

  // `cap sync` writes the plugin list and web assets; it must not change the
  // tracked Gradle wiring (a missing native-plugins link once dropped
  // us-photo-place): any change it makes there is put back.
  const wiring = ['android/capacitor.settings.gradle', 'android/app/capacitor.build.gradle'];
  const dirtyBefore = gitDiff(wiring);
  const restoreConfig = await moveAside('capacitor.config.json');
  const restorePublic = await moveAside('public');
  const restorePlugins = await moveAside('capacitor.plugins.json');
  try {
    const sync = spawnSync('npx cap sync android', { cwd: ROOT, encoding: 'utf8', shell: true });
    if (sync.status !== 0) throw new Error(`cap sync fallito:\n${sync.stderr || sync.stdout}`);
    if (!dirtyBefore && gitDiff(wiring)) {
      spawnSync('git', ['checkout', '--', ...wiring], { cwd: ROOT });
      console.log('cap sync aveva cambiato il cablaggio Gradle: ripristinato.');
    }
    const config = JSON.parse(await readFile(path.join(ROOT, 'capacitor.config.json'), 'utf8'));
    const liveConfig = {
      ...config,
      appId: LIVE_APP_ID,
      appName: 'US LIVE',
      server: { url: `http://localhost:${PORT}`, cleartext: true }
    };
    await writeFile(path.join(ASSETS, 'capacitor.config.json'), `${JSON.stringify(liveConfig, null, 2)}\n`, 'utf8');
    await rm(path.join(ASSETS, 'public'), { recursive: true, force: true });
    await cp(OUT, path.join(ASSETS, 'public'), { recursive: true });

    const gradleTmp = path.join(os.homedir(), 'gtmp');
    await mkdir(gradleTmp, { recursive: true });
    const env = {
      ...process.env,
      ANDROID_HOME: SDK,
      US_STAGING_QA: 'true',
      US_ANDROID_LIVE: 'true',
      JAVA_TOOL_OPTIONS: `-Djdk.net.unixdomain.tmpdir=${gradleTmp}`
    };
    const gradlew = path.join(ROOT, 'android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
    console.log('Gradle assembleDebug (qualche minuto la prima volta)…');
    const build = spawnSync(`"${gradlew}" --no-daemon assembleDebug`, {
      cwd: path.join(ROOT, 'android'), env, stdio: 'inherit', shell: true
    });
    if (build.status !== 0) throw new Error('Gradle assembleDebug fallito');
  } finally {
    // The live config (server.url) must never stay where a later local build
    // could package it.
    await restoreConfig();
    await restorePublic();
    await restorePlugins();
  }

  const apkPath = path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  for (const serial of devices()) {
    adb(['-s', serial, 'install', '-r', apkPath]);
    adb(['-s', serial, 'reverse', `tcp:${PORT}`, `tcp:${PORT}`]);
    adb(['-s', serial, 'shell', 'monkey', '-p', LIVE_APP_ID, '-c', 'android.intent.category.LAUNCHER', '1'], { allowFail: true });
    console.log(`Installata e aperta "US LIVE" su ${serial}`);
  }
  console.log(`APK: ${apkPath}`);
}

async function reload() {
  const response = await fetch(`http://127.0.0.1:${PORT}/__us_live/reload`).catch(() => null);
  if (!response?.ok) throw new Error('Server live spento: avvia prima "serve".');
  console.log('Ricarica inviata.');
}

// Chrome DevTools Protocol on the debug app's WebView: what Claude reads and
// drives (DOM, console, clicks) while the founder uses the same screen.
async function evaluate(expression) {
  const pid = adb(['shell', 'pidof', LIVE_APP_ID], { allowFail: true }).stdout.trim().split(/\s+/)[0];
  if (!pid) throw new Error('"US LIVE" non è aperta sul dispositivo');
  const cdpPort = PORT + 1;
  adb(['forward', `tcp:${cdpPort}`, `localabstract:webview_devtools_remote_${pid}`]);
  const pages = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json();
  const page = pages.find((entry) => entry.type === 'page' && entry.url.startsWith(`http://localhost:${PORT}`)) || pages[0];
  if (!page) throw new Error('Nessuna pagina nel WebView');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  const reply = await new Promise((resolve, reject) => {
    socket.onmessage = (message) => {
      const data = JSON.parse(message.data);
      if (data.id === 1) resolve(data);
    };
    socket.onerror = reject;
    socket.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true, userGesture: true }
    }));
  });
  socket.close();
  if (reply.result?.exceptionDetails) {
    throw new Error(reply.result.exceptionDetails.exception?.description || reply.result.exceptionDetails.text);
  }
  const value = reply.result?.result?.value;
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

async function shot(file) {
  if (!file) throw new Error('Uso: shot <file.png>');
  const png = adb(['exec-out', 'screencap', '-p'], { encoding: 'buffer' }).stdout;
  await writeFile(path.resolve(file), png);
  console.log(path.resolve(file));
}

const [command = 'serve', ...rest] = process.argv.slice(2);
const commands = { serve, apk, reload, eval: () => evaluate(rest.join(' ')), shot: () => shot(rest[0]) };
if (!commands[command]) {
  console.error('Comandi: serve | apk | reload | eval "<js>" | shot <file.png>');
  process.exit(1);
}
try {
  await commands[command]();
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}
