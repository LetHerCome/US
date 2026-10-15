// US Store S3.1 — staged public account journey, no alternate identity authority.
// Production UI remains login-only until an explicitly approved release:
// PRODUCTION_SIGNUP_RELEASED below is the only switch, and the release
// checklist (docs/store/US_S3_1_PRODUCTION_AUTH_RELEASE.md) must be complete
// before it is flipped. Supabase `enable_signup` stays the server kill switch.
// This module never stores email, passwords or recovery tokens in web storage.
(function (root, factory) {
  const value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  if (root) root.UsPublicAuthS31 = value;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  // Empty in committed source, so the production web and Android bundles carry
  // no reference to US-STAGING (the Play gate rejects one). Only the staging
  // builder fills it in: scripts/build-s31-staging-preview.mjs.
  const STAGING_ORIGIN = '';
  const PRODUCTION_ORIGIN = 'https://iiakdfsxpywdkxravqjh.supabase.co';
  // Founder-approved release decision only. Flipping it also requires the
  // matching assertion in tests/s3-1-public-auth.test.js to change.
  const PRODUCTION_SIGNUP_RELEASED = false;
  const PASSWORD_MIN = 10, PASSWORD_MAX = 72;
  // The published Terms and Privacy pages (https). Empty until the public
  // pages exist (docs/store/play/PLAY_DECLARATIONS_DRAFT.md §2.2): the sign-up
  // sentence then names them without a link. A release needs both.
  const LEGAL_URLS = Object.freeze({ terms: '', privacy: '' });
  const legalUrl = value => {
    try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch (_) { return ''; }
  };
  const LOCALES = ['it', 'en'];
  const TERMS_REQUIRED = 'Per creare l’account conferma di avere almeno 18 anni e accetta i Termini e la Privacy.';
  const emailValid = value => typeof value === 'string'
    && value.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
  const cleanEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
  const passwordValid = value => typeof value === 'string'
    && value.length >= PASSWORD_MIN && value.length <= PASSWORD_MAX && !/^\s|\s$/.test(value);
  const GENERIC_MAIL = 'Se l’indirizzo può ricevere il messaggio, troverai le istruzioni nella tua email.';
  const TRY_AGAIN = 'Operazione non disponibile adesso. Attendi qualche minuto e riprova.';
  function isStagingEndpoint(url) {
    if (!STAGING_ORIGIN) return false;
    try { return new URL(url).origin === STAGING_ORIGIN; } catch (_) { return false; }
  }
  function isProductionEndpoint(url) {
    try { return new URL(url).origin === PRODUCTION_ORIGIN; } catch (_) { return false; }
  }
  // Signup/recovery UI: always on US-STAGING; on production only once released.
  function publicAuthEnabled(url, released = PRODUCTION_SIGNUP_RELEASED) {
    return isStagingEndpoint(url) || (released === true && isProductionEndpoint(url));
  }
  function createController({ auth, onChange = () => {} }) {
    if (!auth || !['signUp','resend','resetPasswordForEmail','updateUser','signOut']
      .every(method => typeof auth[method] === 'function')) throw Error('auth_contract_missing');
    let epoch = 0, pending = false, mode = 'login', message = '', kind = 'neutral';
    let verificationEmail = ''; // volatile; never persisted, printed or placed into URLs
    let recoveryActive = false;
    const state = () => Object.freeze({ mode, message, kind, pending, recoveryActive });
    const notify = () => { onChange(state()); return state(); };
    const publish = (text, status = 'neutral') => { message = text; kind = status; return notify(); };
    function navigate(next) {
      if (!['login','signup','verify','forgot','new-password'].includes(next)) return state();
      if (pending || (recoveryActive && next !== 'new-password')) return state();
      epoch++;
      mode = next;
      if (next === 'login') verificationEmail = '';
      return publish('');
    }
    async function run(work) {
      if (pending) return { ok: false, kind: 'busy' };
      const ticket = ++epoch;
      pending = true;
      publish('');
      try { return await work(ticket); }
      finally { pending = false; if (ticket === epoch) notify(); }
    }
    const alive = ticket => ticket === epoch;
    async function register({ email, password, confirm, terms, locale }) {
      if (mode !== 'signup') return { ok: false, kind: 'mode' };
      const e = cleanEmail(email);
      if (!emailValid(e)) { publish('Inserisci un indirizzo email valido.', 'error'); return { ok: false }; }
      if (!passwordValid(password)) { publish('Usa una password di almeno 10 caratteri (massimo 72).', 'error'); return { ok: false }; }
      if (password !== confirm) { publish('Le password non coincidono.', 'error'); return { ok: false }; }
      // 18+ and the Terms: the ticked box, recorded with the account.
      if (terms !== true) { publish(TERMS_REQUIRED, 'error'); return { ok: false, kind: 'terms' }; }
      const accepted = { terms_accepted_at: new Date().toISOString(), locale: LOCALES.includes(locale) ? locale : 'it' };
      return run(async ticket => {
        try {
          const { data, error } = await auth.signUp({ email: e, password, options: { data: accepted } });
          if (!alive(ticket)) return { ok: false, kind: 'stale' };
          if (data?.session) {
            // A signup that immediately produces a session means email confirmation
            // is OFF server-side. Never treat that as a verified S3.1 signup.
            await auth.signOut({ scope: 'local' });
            if (alive(ticket)) publish('Verifica email non attiva. Registrazione sospesa.', 'error');
            return { ok: false, kind: 'confirmation_required' };
          }
          if (error && !/user[_-]?already[_-]?(?:exists|registered)|email[_-]?exists|already[_-]?registered/i.test(String(error.code || ''))) {
            publish(TRY_AGAIN, 'error');
            return { ok: false, kind: 'provider' };
          }
          verificationEmail = e;
          mode = 'verify';
          publish(GENERIC_MAIL, 'success');
          return { ok: true };
        } catch (_) {
          if (alive(ticket)) publish(TRY_AGAIN, 'error');
          return { ok: false, kind: 'transport' };
        }
      });
    }
    async function resend() {
      if (mode !== 'verify' || !verificationEmail) return { ok: false, kind: 'mode' };
      return run(async ticket => {
        try {
          const { error } = await auth.resend({ type: 'signup', email: verificationEmail });
          if (!alive(ticket)) return { ok: false, kind: 'stale' };
          publish(error ? TRY_AGAIN : GENERIC_MAIL, error ? 'error' : 'success');
          return { ok: !error };
        } catch (_) {
          if (alive(ticket)) publish(TRY_AGAIN, 'error');
          return { ok: false, kind: 'transport' };
        }
      });
    }
    async function forgot(email) {
      if (mode !== 'forgot') return { ok: false, kind: 'mode' };
      const e = cleanEmail(email);
      if (!emailValid(e)) { publish('Inserisci un indirizzo email valido.', 'error'); return { ok: false }; }
      return run(async ticket => {
        try {
          // Uses the Supabase project's configured Site URL. The deployment
          // checklist MUST validate this before any live email QA.
          const { error } = await auth.resetPasswordForEmail(e);
          if (!alive(ticket)) return { ok: false, kind: 'stale' };
          const unseen = /user[_-]?not[_-]?found|email[_-]?not[_-]?found/i.test(String(error?.code || ''));
          const accepted = !error || unseen;
          publish(accepted ? GENERIC_MAIL : TRY_AGAIN, accepted ? 'success' : 'error');
          return { ok: accepted };
        } catch (_) {
          if (alive(ticket)) publish(TRY_AGAIN, 'error');
          return { ok: false, kind: 'transport' };
        }
      });
    }
    function onRecoverySession() {
      epoch++;
      pending = false;
      verificationEmail = '';
      recoveryActive = true;
      mode = 'new-password';
      return publish('');
    }
    async function completeRecovery({ password, confirm }) {
      if (!recoveryActive || mode !== 'new-password') return { ok: false, kind: 'recovery_not_authorized' };
      if (!passwordValid(password)) { publish('Usa una password di almeno 10 caratteri (massimo 72).', 'error'); return { ok: false }; }
      if (password !== confirm) { publish('Le password non coincidono.', 'error'); return { ok: false }; }
      return run(async ticket => {
        try {
          const { error } = await auth.updateUser({ password });
          if (!alive(ticket)) return { ok: false, kind: 'stale' };
          if (error) { publish(TRY_AGAIN, 'error'); return { ok: false, kind: 'provider' }; }
          // Recovered session must not automatically open couple-private data.
          await auth.signOut({ scope: 'local' });
          if (!alive(ticket)) return { ok: false, kind: 'stale' };
          recoveryActive = false;
          mode = 'login';
          publish('Password aggiornata. Ora accedi con la nuova password.', 'success');
          return { ok: true };
        } catch (_) {
          if (alive(ticket)) publish(TRY_AGAIN, 'error');
          return { ok: false, kind: 'transport' };
        }
      });
    }
    function reset() {
      epoch++; pending = false; mode = 'login';
      verificationEmail = ''; recoveryActive = false;
      return publish('');
    }
    return Object.freeze({ get state() { return state(); }, navigate, register, resend, forgot,
      onRecoverySession, completeRecovery, reset });
  }
  function mount({ auth, endpoint, openStep, document: doc = globalThis.document }) {
    if (!publicAuthEnabled(endpoint) || !doc || typeof openStep !== 'function') return null;
    const node = id => doc.getElementById(id);
    const actions = node('usPublicAuthActions');
    if (!actions || !node('usSignup') || !node('usRecovery')) return null;
    actions.hidden = false;
    const ids = { signup: 'usSignup', verify: 'usVerifyEmail', forgot: 'usForgotPassword', 'new-password': 'usRecovery' };
    const statuses = { signup: 'usSignupStatus', verify: 'usVerifyStatus',
      forgot: 'usForgotStatus', 'new-password': 'usRecoveryStatus' };
    // "Crea account" waits for the 18+ and Terms box.
    const terms = node('usSignupTerms');
    const accepted = () => terms?.checked === true;
    for (const link of doc.querySelectorAll?.('[data-us-legal]') || []) {
      const url = legalUrl(LEGAL_URLS[link.dataset.usLegal]);
      if (url) { link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    }
    const ctrl = createController({ auth, onChange(s) {
      if (s.mode !== 'login') openStep(ids[s.mode]);
      const status = node(statuses[s.mode]);
      if (status) {
        status.textContent = s.message;
        status.dataset.kind = s.kind;
      }
      for (const id of ['usSignupSubmit','usVerifyResend','usForgotSubmit','usRecoverySubmit']) {
        if (node(id)) node(id).disabled = s.pending || (id === 'usSignupSubmit' && !accepted());
      }
    } });
    const syncSignup = () => { if (node('usSignupSubmit')) node('usSignupSubmit').disabled = ctrl.state.pending || !accepted(); };
    terms?.addEventListener('change', syncSignup);
    syncSignup();
    function go(mode) {
      ctrl.navigate(mode);
      openStep(mode === 'login' ? 'authLogin' : ids[mode]);
      for (const id of Object.values(statuses)) { if (node(id)) node(id).textContent = ''; }
    }
    for (const [button, mode] of [
      ['usShowSignup','signup'], ['usShowForgot','forgot'],
      ['usSignupBack','login'], ['usVerifyBack','login'],
      ['usForgotBack','login'], ['usRecoveryBack','new-password']]) {
      node(button)?.addEventListener('click', () => go(mode));
    }
    node('usSignup')?.addEventListener('submit', async ev => {
      ev.preventDefault();
      const email = node('usSignupEmail').value;
      const password = node('usSignupPassword').value;
      const confirm = node('usSignupConfirm').value;
      node('usSignupPassword').value = '';
      node('usSignupConfirm').value = '';
      const result = await ctrl.register({ email, password, confirm, terms: accepted(),
        locale: globalThis.UsI18n?.locale });
      // A new account asks again.
      if (result?.ok && terms) { terms.checked = false; syncSignup(); }
    });
    node('usVerifyResend')?.addEventListener('click', () => ctrl.resend());
    node('usForgotPassword')?.addEventListener('submit', ev => {
      ev.preventDefault();
      const email = node('usForgotEmail').value;
      node('usForgotEmail').value = '';
      return ctrl.forgot(email);
    });
    node('usRecovery')?.addEventListener('submit', ev => {
      ev.preventDefault();
      const password = node('usRecoveryPassword').value;
      const confirm = node('usRecoveryConfirm').value;
      node('usRecoveryPassword').value = '';
      node('usRecoveryConfirm').value = '';
      return ctrl.completeRecovery({ password, confirm });
    });
    return Object.freeze({
      get recoveryActive() { return ctrl.state.recoveryActive; },
      onRecoverySession() {
        ctrl.onRecoverySession();
        openStep('usRecovery');
        node('usRecoveryPassword')?.focus();
        return true;
      },
      reset() { ctrl.reset(); },
      go
    });
  }
  return Object.freeze({ isStagingEndpoint, isProductionEndpoint, publicAuthEnabled,
    PRODUCTION_SIGNUP_RELEASED, PASSWORD_MIN, PASSWORD_MAX, LEGAL_URLS, legalUrl,
    cleanEmail, emailValid, passwordValid, createController, mount });
});
