(() => {
  'use strict';

  const hostname = window.location.hostname;
  const localOrigin = hostname === 'localhost' || hostname === '127.0.0.1';
  const requested = new URLSearchParams(window.location.search).get('us-qa') === 'gate1';
  const nativeRuntime = Boolean(window.UsPlatform?.isNative);
  const active = localOrigin && requested && !nativeRuntime;
  const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

  const originalFetch = window.fetch?.bind(window);
  if (active && originalFetch) {
    window.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input?.url || '', window.location.href);
      const method = String(init.method || input?.method || 'GET').toUpperCase();
      if (url.origin.includes('.supabase.co')) {
        if (MUTATING_METHODS.includes(method)) throw new Error(`QA_REMOTE_BLOCKED:${method}:${url.pathname}`);
        throw new Error(`QA_REMOTE_BLOCKED:${method}:${url.pathname}`);
      }
      return originalFetch(input, init);
    };
  }

  // QA mode never calls pairing: no signInAnonymously and no claim_us_role.
  // Settings is exercised through the real go('settings',{nav:true}) entry.
  function fixtureProfile(role, id, displayName) {
    return Object.freeze({
      id,
      display_name: displayName,
      role,
      couple_id: 'local-qa-couple',
      avatar_path: null,
    });
  }

  const fixture = {
    active,
    hostname,
    requested,
    profiles: Object.freeze({
      francesco: fixtureProfile('francesco', 'local-qa-francesco', 'Francesco'),
      beatrice: fixtureProfile('beatrice', 'local-qa-beatrice', 'Beatrice'),
    }),
    async boot() {
      if (!active) return false;
      window.usProfile = fixture.profiles.francesco;
      document.documentElement.classList.remove('us-auth-pending', 'us-returning-device');
      document.documentElement.classList.add('us-auth-ready', 'us-local-qa');
      document.getElementById('authOverlay')?.classList.add('hidden');
      const badge = document.getElementById('onlineBadge');
      if (badge) {
        badge.className = 'online-badge ok';
        badge.textContent = '● local QA';
      }
      const layerA = document.getElementById('homePhotoLayerA');
      const layerB = document.getElementById('homePhotoLayerB');
      const fixtureBackground = 'radial-gradient(circle at 72% 30%,rgba(246,111,158,.36),transparent 28%),radial-gradient(circle at 26% 65%,rgba(139,114,248,.34),transparent 32%),linear-gradient(145deg,#111016,#28142f 56%,#070609)';
      [layerA, layerB].forEach((layer) => { if (layer) layer.style.background = fixtureBackground; });
      const overlay = document.getElementById('usHeroOverlayLayer');
      if (overlay) {
        overlay.querySelector('[data-us-qa-overlay]')?.remove();
        const fake = document.createElement('div');
        fake.dataset.usQaOverlay = 'gate1';
        fake.className = 'us-local-qa-overlay';
        fake.setAttribute('role', 'status');
        fake.textContent = 'Overlay strutturale QA';
        overlay.append(fake);
      }
      return true;
    },
  };

  window.__US_LOCAL_QA__ = Object.freeze(fixture);

  if (active) {
    const launch = () => fixture.boot();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', launch, { once: true });
    else setTimeout(launch, 0);
    console.info('[US QA] local Gate 1 visual fixture active; Supabase network blocked');
  }
})();
