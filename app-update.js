// US — aggiornamento dell'app (founder, 29/10/2026). The installed app updates
// itself through Google Play's in-app updates (@capawesome/capacitor-app-update,
// the native «AppUpdate» plugin), and the server's minimum version
// (get_app_min_version) can require it:
//   - an ordinary update downloads in the background, then «Riavvia» installs it;
//   - an urgent one (Play priority 4–5) takes the screen, and can be put off;
//   - below the minimum, US stays behind «Aggiorna US» until it is updated.
// Native only; the web app updates through its service worker. Offline or
// with no answer nothing happens and nothing blocks.
// iPhone (iOS Store V1, 05/11/2026): the same plugin asks the App Store, which
// has no in-app update: below the minimum «Aggiorna» opens the App Store page.
// The store may not answer (an app not yet in the App Store, a failed lookup):
// the installed build is then read from the app itself (App.getInfo), so the
// minimum still holds. iOS builds are numbered like Play's versionCode.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UsAppUpdate = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const AVAILABLE = 2, IN_PROGRESS = 3, DOWNLOADED = 11, OK = 0;
  const CHECK_GAP_MS = 6 * 3600e3;    // on resume, at most every 6 hours
  const ASK_AGAIN_MS = 24 * 3600e3;   // Play's download prompt, once a day per version
  const ASKED = (code) => `us:app-update:v1:asked:${code}`;
  // The App Store's numeric id of US (App Store Connect › App Information ›
  // Apple ID). The plugin reads appId only on iOS; Android opens Play by
  // package name. App record «US: app per coppie» (app.uscouple), created
  // 13/11/2026 (docs/store/ios/GIORNO_ACQUISTO.md).
  const APP_STORE_ID = '6834589989';
  const storeOptions = (appStoreId) => (/^[0-9]{6,12}$/.test(String(appStoreId || '')) ? { appId: String(appStoreId) } : undefined);

  function updatePlan({ info, minVersionCode }) {
    const current = Number(info?.currentVersionCode);
    if (!Number.isFinite(current) || current <= 0) return { kind: 'none' };
    const available = info.updateAvailability === AVAILABLE || info.updateAvailability === IN_PROGRESS;
    if (current < (Number(minVersionCode) || 0)) {
      return available && info.immediateUpdateAllowed ? { kind: 'immediate', required: true } : { kind: 'store', required: true };
    }
    if (info.installStatus === DOWNLOADED) return { kind: 'ready' };
    if (!available) return { kind: 'none' };
    if ((Number(info.updatePriority) || 0) >= 4 && info.immediateUpdateAllowed) return { kind: 'immediate', required: false };
    if (info.flexibleUpdateAllowed) return { kind: 'flexible' };
    return { kind: 'none' };
  }

  function createAppUpdater({ plugin, platformName, readMin, readInstalled = null, appStoreId = APP_STORE_ID, ui, storage, now = () => Date.now() }) {
    let lastCheck = -Infinity, blocked = false, listening = false, busy = null;
    const get = (key) => { try { return storage?.getItem?.(key) ?? null; } catch (_) { return null; } };
    const set = (key, value) => { try { storage?.setItem?.(key, String(value)); } catch (_) {} };
    const restart = () => Promise.resolve(plugin.completeFlexibleUpdate?.()).catch(() => {});

    async function listen() {
      if (listening || typeof plugin.addListener !== 'function') return;
      listening = true;
      try {
        await plugin.addListener('onFlexibleUpdateStateChange', (state) => {
          if (state?.installStatus === DOWNLOADED) ui?.readyToRestart?.(restart);
        });
      } catch (_) { listening = false; }
    }
    function gate(plan) {
      blocked = true;
      ui?.block?.({
        async onUpdate() {
          if (plan.kind === 'immediate') {
            const result = await Promise.resolve(plugin.performImmediateUpdate()).catch(() => null);
            if (result?.code === OK) return;
          }
          await Promise.resolve(plugin.openAppStore?.(storeOptions(appStoreId))).catch(() => {});
        },
      });
    }

    async function run() {
      lastCheck = now();
      let info = null;
      try { info = await plugin.getAppUpdateInfo(); } catch (_) { info = null; }
      // No answer from the store: only the installed build, for the minimum.
      if (!info && typeof readInstalled === 'function') {
        try {
          const build = (await readInstalled())?.build;
          info = build ? { currentVersionCode: String(build) } : null;
        } catch (_) { info = null; }
      }
      if (!info) return { kind: 'none' };
      // Unreadable (signed out, offline): 0 for now, and asked again next time.
      let min = 0;
      try { min = Number(await readMin(platformName)) || 0; } catch (_) { min = 0; lastCheck = -Infinity; }
      const plan = updatePlan({ info, minVersionCode: min });
      if (plan.kind === 'ready') ui?.readyToRestart?.(restart);
      if (plan.kind === 'flexible') {
        const version = String(info.availableVersionCode || '');
        const asked = Number(get(ASKED(version))) || 0;
        if (asked && now() - asked < ASK_AGAIN_MS) return plan;
        set(ASKED(version), now());
        await listen();
        await Promise.resolve(plugin.startFlexibleUpdate()).catch(() => null);
      }
      if (plan.kind === 'immediate') {
        const result = await Promise.resolve(plugin.performImmediateUpdate()).catch(() => null);
        if (plan.required && result?.code !== OK) gate(plan);
      }
      if (plan.kind === 'store') gate(plan);
      return plan;
    }
    function check({ force = false } = {}) {
      if (busy) return busy;
      if (!force && !blocked && now() - lastCheck < CHECK_GAP_MS) return Promise.resolve({ kind: 'skipped' });
      busy = run().finally(() => { busy = null; });
      return busy;
    }
    return Object.freeze({ check });
  }

  // ---------- DOM: «Aggiorna US» and «Riavvia» ----------
  function domUi(doc) {
    return {
      block({ onUpdate }) {
        if (doc.getElementById('usUpdateGate')) return;
        const gate = doc.createElement('div');
        gate.id = 'usUpdateGate';
        gate.className = 'us-update-gate';
        gate.setAttribute('role', 'alertdialog');
        gate.setAttribute('aria-modal', 'true');
        gate.setAttribute('aria-labelledby', 'usUpdateGateTitle');
        gate.innerHTML = '<div class="us-update-gate-card"><h2 id="usUpdateGateTitle">Aggiorna US</h2>'
          + '<p>Questa versione di US non funziona più. Aggiorna per continuare: i vostri ricordi restano dove sono.</p>'
          + '<button type="button" class="primary us-auth-primary" id="usUpdateGateGo">Aggiorna</button></div>';
        doc.body.appendChild(gate);
        const go = doc.getElementById('usUpdateGateGo');
        go.addEventListener('click', () => { onUpdate(); });
        go.focus();
      },
      readyToRestart(restart) {
        globalThis.toast?.('Aggiornamento pronto', { action: { label: 'Riavvia', onClick: restart } });
      },
    };
  }

  function start({ readMin, platform = globalThis.UsPlatform, doc = globalThis.document } = {}) {
    const plugin = platform?.isNative ? platform.getNativePlugin?.('AppUpdate') : null;
    if (!plugin || typeof readMin !== 'function' || !doc) return null;
    const app = platform.getNativePlugin?.('App');
    const readInstalled = typeof app?.getInfo === 'function' ? () => app.getInfo() : null;
    const updater = createAppUpdater({ plugin, platformName: platform.platformName, readMin, readInstalled, ui: domUi(doc), storage: globalThis.localStorage });
    // After the first screen has settled, and whenever US comes back.
    setTimeout(() => { updater.check(); }, 2500);
    doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'visible') updater.check(); });
    return updater;
  }

  return Object.freeze({ updatePlan, createAppUpdater, storeOptions, start });
});
