(() => {
  'use strict';

  if (window.__usThinkWidgetInstalled) return;
  window.__usThinkWidgetInstalled = true;

  const platform = window.UsPlatform;
  const nativeEnabled = Boolean(platform?.isNative);
  let ownerHash = '';
  let deviceIdHash = '';
  let credentialProvisionInFlight = null;
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
      if (url.protocol !== 'us:' || url.hostname !== 'widget' || url.pathname !== '/think/open') return null;
      return 'open';
    } catch (_) { return null; }
  }

  async function runAction(action) {
    if (!action) return false;
    if (typeof window.go === 'function') window.go('home');
    return true;
  }

  async function provisionCredential(targetOwnerHash) {
    const identity = await platform.getWidgetDeviceIdentity?.();
    if (!identity?.deviceId || !window.UsWidgetCredentialApi?.issue) return false;
    deviceIdHash = await hashOwner(identity.deviceId);
    try {
      const issued = await window.UsWidgetCredentialApi.issue(deviceIdHash);
      if (!issued?.token) throw new Error('credential_not_issued');
      const stored = await platform.storeWidgetActionCredential(targetOwnerHash, issued.token);
      if (!stored) throw new Error('credential_not_stored');
      return true;
    } catch (error) {
      console.warn('[US Widget] credential provision', error);
      try { await window.UsWidgetCredentialApi.revoke(deviceIdHash); } catch (_) {}
      try { await platform.clearWidgetActionCredential?.(); } catch (_) {}
      return false;
    }
  }

  async function authReady(profile) {
    if (!nativeEnabled || !profile?.id) return false;
    const nextHash = await hashOwner(profile.id);
    if (ownerHash && ownerHash !== nextHash) thinkState = { partnerName: '', lastReceivedAt: '', lastSentAt: '', lastActionStatus: 'idle', lastActionAt: '' };
    ownerHash = nextHash;
    try { await platform.activateWidgetAccount(ownerHash); }
    catch (error) { console.warn('[US Widget] account activation', error); }
    const previous = credentialProvisionInFlight;
    const task = Promise.resolve(previous).catch(() => false).then(() => provisionCredential(nextHash));
    credentialProvisionInFlight = task;
    try { await task; }
    finally { if (credentialProvisionInFlight === task) credentialProvisionInFlight = null; }
    return true;
  }

  async function clear() {
    const provisioning = credentialProvisionInFlight;
    if (provisioning) try { await provisioning; } catch (_) {}
    const revokeHash = deviceIdHash;
    if (nativeEnabled && revokeHash && window.UsWidgetCredentialApi?.revoke) {
      try { await window.UsWidgetCredentialApi.revoke(revokeHash); }
      catch (error) { console.warn('[US Widget] credential revoke', error); }
    }
    ownerHash = '';
    deviceIdHash = '';
    thinkState = { partnerName: '', lastReceivedAt: '', lastSentAt: '', lastActionStatus: 'idle', lastActionAt: '' };
    if (!nativeEnabled) return false;
    try { await platform.clearWidgetActionCredential?.(); }
    catch (error) { console.warn('[US Widget] credential clear', error); }
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
