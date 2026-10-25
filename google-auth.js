// US Accesso con Google (25/10/2026). Android: the local UsGoogleSignIn plugin
// (Credential Manager) returns a Google ID token bound to a nonce, and Supabase
// signInWithIdToken checks it with the raw nonce. Web: Supabase's Google
// redirect. Nothing here stores a token or an email; the account is chosen
// in Google's own sheet every time.
(function (root, factory) {
  const value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  if (root) root.UsGoogleAuth = value;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  // The OAuth "Web application" client of the US Google Cloud project (public,
  // not a secret: it is the ID token's audience). Empty: the button stays hidden.
  const WEB_CLIENT_ID = '';
  const PLUGIN = 'UsGoogleSignIn';
  const CODES = ['cancelled', 'no_account', 'interrupted', 'not_configured', 'unavailable'];

  const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  function randomNonce(crypto) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return hex(bytes);
  }
  async function sha256Hex(text, crypto) {
    return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
  }
  // The token's subject, read without verifying (Supabase verifies): only to
  // refuse another Google account before it replaces this session.
  function tokenSubject(idToken) {
    try {
      const part = String(idToken).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = JSON.parse(decodeURIComponent(Array.from(atob(part.padEnd(part.length + (4 - part.length % 4) % 4, '=')),
        (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')));
      return typeof json.sub === 'string' ? json.sub : '';
    } catch (_) { return ''; }
  }
  const providers = (user) => {
    const list = Array.isArray(user?.app_metadata?.providers) ? user.app_metadata.providers : [];
    const fromIdentities = Array.isArray(user?.identities) ? user.identities.map((i) => i?.provider) : [];
    return new Set([...list, ...fromIdentities].filter(Boolean));
  };
  const usesGoogle = (user) => providers(user).has('google');
  // Accounts made by the owner or by sign-up have a password ("email" identity).
  const hasPassword = (user) => providers(user).has('email');
  function googleSubject(user) {
    const identity = (Array.isArray(user?.identities) ? user.identities : []).find((i) => i?.provider === 'google');
    return String(identity?.identity_data?.sub || identity?.id || '');
  }
  // A Google account that never ticked 18+ and the Terms (the sign-up box)
  // opens nothing private until it does (app.js initCloud).
  const needsTerms = (user) => usesGoogle(user) && !user?.user_metadata?.terms_accepted_at;

  function create({ auth, platform = globalThis.UsPlatform, crypto = globalThis.crypto, location = globalThis.location, clientId = WEB_CLIENT_ID } = {}) {
    const native = Boolean(platform?.isNative);
    const plugin = () => (native && platform.isPluginAvailable?.(PLUGIN) ? platform.getNativePlugin(PLUGIN) : null);
    function supported() {
      if (!clientId || !auth) return false;
      return native ? Boolean(plugin()) : typeof auth.signInWithOAuth === 'function';
    }
    const failure = (error) => {
      const code = String(error?.code || error?.message || '');
      return { ok: false, kind: CODES.includes(code) ? code : 'failed' };
    };
    // Google's sheet → ID token (native only).
    async function googleToken() {
      const nonce = randomNonce(crypto);
      const { idToken } = await plugin().signIn({ serverClientId: clientId, nonce: await sha256Hex(nonce, crypto) });
      if (typeof idToken !== 'string' || !idToken) throw Object.assign(new Error('failed'), { code: 'failed' });
      return { idToken, nonce };
    }
    async function exchange({ idToken, nonce }) {
      const { data, error } = await auth.signInWithIdToken({ provider: 'google', token: idToken, nonce });
      if (error || !data?.session) return { ok: false, kind: 'failed' };
      return { ok: true, session: data.session };
    }
    /** «Continua con Google»: a new account or an existing one, same email linked by Supabase. */
    async function signIn() {
      if (!supported()) return { ok: false, kind: 'unavailable' };
      try {
        if (!native) {
          // The page leaves for Google and comes back signed in (detectSessionInUrl).
          const { error } = await auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/` } });
          return error ? { ok: false, kind: 'failed' } : { ok: true, kind: 'redirect' };
        }
        const result = await exchange(await googleToken());
        return result.ok ? { ok: true, kind: 'signed_in', userId: result.session.user?.id || '' } : result;
      } catch (error) { return failure(error); }
    }
    /**
     * Deletion and leaving the couple ask for a fresh sign-in (Edge amr < 10
     * min): for a Google account that is Google again, with the same account.
     */
    async function reauthenticate(user) {
      if (!native || !supported()) return { ok: false, kind: 'unavailable' };
      const expected = googleSubject(user);
      if (!expected) return { ok: false, kind: 'failed' };
      try {
        const token = await googleToken();
        if (tokenSubject(token.idToken) !== expected) return { ok: false, kind: 'other_account' };
        const result = await exchange(token);
        if (!result.ok) return result;
        if (result.session.user?.id !== user.id) return { ok: false, kind: 'other_account' };
        return { ok: true, accessToken: result.session.access_token };
      } catch (error) { return failure(error); }
    }
    return Object.freeze({ supported, signIn, reauthenticate, get native() { return native; } });
  }

  return Object.freeze({ WEB_CLIENT_ID, create, needsTerms, usesGoogle, hasPassword, googleSubject, tokenSubject, randomNonce, sha256Hex });
});
