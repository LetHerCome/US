(() => {
  'use strict';

  if (window.__usThinkWidgetInstalled) return;
  window.__usThinkWidgetInstalled = true;

  const platform = window.UsPlatform;
  const nativeEnabled = Boolean(platform?.isNative);
  const SEND_COOLDOWN_MS = 2500;
  let ownerHash = '';
  let authProfile = null;
  let pendingAction = null;
  let actionInFlight = null;
  let lastSendStartedAt = 0;
  let thinkState = {
    partnerName: '',
    lastReceivedAt: '',
    lastSentAt: '',
    lastActionStatus: 'idle',
    lastActionAt: ''
  };

  async function hashOwner(value) {
    const bytes = new TextEncoder().encode(String(value || ''));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function snapshot() {
    return {
      schemaVersion: 1,
      ownerHash,
      updatedAt: new Date().toISOString(),
      modules: { think: { ...thinkState } }
    };
  }

  async function writeSnapshot() {
    if (!nativeEnabled || !ownerHash) return false;
    try { return await platform.writeWidgetSnapshot(snapshot()); }
    catch (error) { console.warn('[US Widget] snapshot write', error); return false; }
  }

  async function publishThink(next = {}) {
    thinkState = {
      ...thinkState,
      partnerName: String(next.partnerName || thinkState.partnerName || '').slice(0, 80),
      lastReceivedAt: next.lastReceivedAt || '',
      lastSentAt: next.lastSentAt || ''
    };
    return writeSnapshot();
  }

  async function publishActionStatus(status) {
    thinkState = {
      ...thinkState,
      lastActionStatus: ['idle', 'sending', 'sent', 'failed'].includes(status) ? status : 'idle',
      lastActionAt: new Date().toISOString()
    };
    return writeSnapshot();
  }

  function parseAction(value) {
    const urlValue = typeof value === 'string' ? value : value?.url;
    if (!urlValue) return null;
    try {
      const url = new URL(urlValue);
      if (url.protocol !== 'us:' || url.hostname !== 'widget' || url.pathname !== '/think/open' && url.pathname !== '/think/send') return null;
      return url.pathname.endsWith('/send') ? 'send' : 'open';
    } catch (_) { return null; }
  }

  async function runAction(action) {
    if (!action) return false;
    if (!authProfile) { pendingAction = action; return false; }
    if (typeof window.go === 'function') window.go('home');
    if (action === 'open') return true;
    const now = Date.now();
    if (actionInFlight || now - lastSendStartedAt < SEND_COOLDOWN_MS) return false;
    lastSendStartedAt = now;
    actionInFlight = (async () => {
      await publishActionStatus('sending');
      let sent = false;
      try { sent = (await window.sendThinkSignal()) === true; }
      catch (error) { console.warn('[US Widget] Ti penso action', error); }
      await publishActionStatus(sent ? 'sent' : 'failed');
      return sent;
    })();
    try { return await actionInFlight; }
    finally { actionInFlight = null; }
  }

  async function authReady(profile) {
    if (!nativeEnabled || !profile?.id) return false;
    const nextHash = await hashOwner(profile.id);
    if (ownerHash && ownerHash !== nextHash) thinkState = { partnerName: '', lastReceivedAt: '', lastSentAt: '', lastActionStatus: 'idle', lastActionAt: '' };
    ownerHash = nextHash;
    authProfile = { id: profile.id };
    try { await platform.activateWidgetAccount(ownerHash); }
    catch (error) { console.warn('[US Widget] account activation', error); }
    const action = pendingAction;
    pendingAction = null;
    if (action) await runAction(action);
    return true;
  }

  async function clear() {
    ownerHash = '';
    authProfile = null;
    pendingAction = null;
    thinkState = { partnerName: '', lastReceivedAt: '', lastSentAt: '', lastActionStatus: 'idle', lastActionAt: '' };
    if (!nativeEnabled) return false;
    try { return await platform.clearWidgetSnapshot(); }
    catch (error) { console.warn('[US Widget] snapshot clear', error); return false; }
  }

  function acceptUrl(value) {
    const action = parseAction(value);
    if (!action) return Promise.resolve(false);
    return runAction(action);
  }

  window.UsThinkWidget = Object.freeze({ authReady, publishThink, publishActionStatus, clear });

  if (nativeEnabled) {
    platform.listenForNativeAppUrl?.((event) => acceptUrl(event));
    Promise.resolve(platform.getNativeLaunchUrl?.()).then(acceptUrl).catch(() => {});
  }
})();
