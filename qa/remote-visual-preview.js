(() => {
  'use strict';

  const PREVIEW_HOST = 'us-preview.vercel.app';
  const PRODUCTION_HOST = 'usfinal.vercel.app';
  const hostname = window.location.hostname;
  const localOrigin = hostname === PREVIEW_HOST && hostname !== PRODUCTION_HOST;
  const requested = new URLSearchParams(window.location.search).get('us-preview') === 'remote';
  const nativeRuntime = Boolean(window.UsPlatform?.isNative);
  const active = localOrigin && requested && !nativeRuntime;
  const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

  function blocked(operation) {
    throw new Error(`QA_REMOTE_BLOCKED:${operation}`);
  }

  const blockedClient = Object.freeze({
    auth: Object.freeze({
      getSession: async () => blocked('auth.getSession'),
      onAuthStateChange: () => blocked('auth.onAuthStateChange'),
      signInAnonymously: async () => blocked('auth.signInAnonymously'),
    }),
    from: () => blocked('supabase.from'),
    rpc: async (name) => blocked(`supabase.rpc:${name}`),
    functions: Object.freeze({ invoke: async (name) => blocked(`supabase.functions:${name}`) }),
  });

  const originalFetch = window.fetch?.bind(window);
  if (active && originalFetch) {
    window.fetch = async (input, init = {}) => {
      const rawUrl = typeof input === 'string' ? input : input?.url || '';
      const url = new URL(rawUrl, window.location.href);
      const method = String(init.method || input?.method || 'GET').toUpperCase();
      if (url.hostname.endsWith('.supabase.co') || MUTATING_METHODS.includes(method)) {
        throw new Error(`QA_REMOTE_BLOCKED:${method}:${url.hostname}${url.pathname}`);
      }
      return originalFetch(input, init);
    };
  }

  const profiles = Object.freeze({
    francesco: Object.freeze({ id: 'preview-francesco', display_name: 'Francesco', role: 'francesco', couple_id: 'preview-couple', avatar_path: null }),
    beatrice: Object.freeze({ id: 'preview-beatrice', display_name: 'Beatrice', role: 'beatrice', couple_id: 'preview-couple', avatar_path: null }),
  });

  const fixture = Object.freeze({
    active,
    hostname,
    requested,
    client: blockedClient,
    profiles,
    async boot() {
      if (!active) return false;
      window.usProfile = profiles.francesco;
      document.documentElement.classList.remove('us-auth-pending', 'us-returning-device');
      document.documentElement.classList.add('us-auth-ready', 'us-local-preview');
      document.getElementById('authOverlay')?.classList.add('hidden');
      const badge = document.getElementById('onlineBadge');
      if (badge) { badge.className = 'online-badge ok'; badge.textContent = '● DEV PREVIEW'; }
      const marker = document.getElementById('previewMarker');
      if (marker) marker.hidden = false;
      for (const id of ['homePhotoLayerA', 'homePhotoLayerB']) {
        const layer = document.getElementById(id);
        if (layer) layer.style.background = 'radial-gradient(circle at 72% 30%,rgba(246,111,158,.36),transparent 28%),radial-gradient(circle at 26% 65%,rgba(139,114,248,.34),transparent 32%),linear-gradient(145deg,#111016,#28142f 56%,#070609)';
      }
      return true;
    },
  });

  window.__US_REMOTE_PREVIEW__ = fixture;
  if (active) {
    console.info('[US PREVIEW] DEV PREVIEW active · local fixtures · Supabase blocked');
    window.addEventListener('error', (event) => {
      if (String(event.error?.message || event.message || '').includes('QA_REMOTE_BLOCKED')) event.preventDefault();
    });
  }
})();
