// Errori dell'app (09/11/2026; SQL client_errors_v1). Until now a JavaScript
// error on someone's phone was seen by nobody. This module listens for the
// errors nobody caught and for rejected promises, and sends a few of them to
// Supabase (public.report_client_errors), with no third-party service:
// - only technical facts: the message without web addresses, emails, long
//   numbers, tokens or text in double quotes (a JSON error can quote what was
//   being read), the file name and line, the build, the platform;
// - at most 20 per page load, the same error once with how many times;
// - only with a signed-in account (the server asks for it): before that they
//   wait in memory, and are lost if the page closes first;
// - if the call fails (for example the SQL is not there yet) the batch is
//   dropped, never retried in a loop.
// It is the first deferred script, so it hears the errors of the others.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UsClientErrors = api;
})(typeof window !== 'undefined' ? window : null, function (w) {
  'use strict';

  const PER_LOAD = 20;
  const FLUSH_MS = 4000;
  const RETRY_MS = 60000;
  const MAX_RETRIES = 10;
  // Not bugs of US: a cross-origin script without details, a layout notice of
  // the browser, the network going away.
  const IGNORED = [
    /^Script error\.?$/i,
    /ResizeObserver loop/i,
    /^(TypeError: )?(Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?)$/i,
  ];
  const EXTENSION = /^(chrome|moz|safari|safari-web)-extension:/i;

  let override = {};
  const pending = new Map();
  const seen = new Set();
  let counted = 0;
  let timer = null;
  let retries = 0;
  let sending = false;

  function clean(text) {
    return String(text ?? '')
      .replace(/https?:\/\/[^\s'"()<>]+/gi, (url) => {
        try { const u = new URL(url); return u.host + u.pathname; } catch (_e) { return '<url>'; }
      })
      .replace(/"[^"]{0,400}"/g, '"…"')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<email>')
      .replace(/\beyJ[\w-]+(\.[\w-]+){1,2}/g, '<token>')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
      .replace(/\d{6,}/g, '<n>')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300);
  }

  // Only the file name: no address, no query (the build is sent on its own).
  function fileOf(source) {
    if (!source) return '';
    try {
      const u = new URL(String(source), 'https://us.invalid/');
      return (u.pathname.split('/').filter(Boolean).pop() || '').slice(0, 200);
    } catch (_e) { return ''; }
  }

  // Where a rejected promise was created: the first frame of its stack.
  function firstFrame(stack) {
    const match = /((?:https?|capacitor|file):\/\/[^\s)]+|\/[^\s):]+):(\d+):(\d+)/.exec(String(stack || ''));
    return match ? { file: fileOf(match[1]), line: Number(match[2]), col: Number(match[3]) } : null;
  }

  const toInt = (value) => (value === null || value === undefined || value === '' ? null
    : Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null);

  function platform() {
    if (override.platform) return override.platform;
    const name = w?.UsPlatform?.platformName
      || (w?.Capacitor?.isNativePlatform?.() ? w.Capacitor.getPlatform?.() : 'web');
    return name === 'android' || name === 'ios' ? name : 'web';
  }

  function build() {
    if (override.build) return override.build;
    const value = w?.document?.querySelector?.('meta[name="us-build"]')?.content;
    return String(value || 'unknown').slice(0, 64);
  }

  function record(kind, message, source, line, col) {
    const text = clean(message);
    if (!text || IGNORED.some((pattern) => pattern.test(text))) return null;
    if (EXTENSION.test(String(source || ''))) return null;
    const file = fileOf(source);
    const key = [kind, text, file, line || 0].join('|');
    const known = pending.get(key);
    if (known) { known.repeats = Math.min(known.repeats + 1, 1000); return known; }
    if (seen.has(key) || counted >= PER_LOAD) return null;
    seen.add(key);
    counted += 1;
    const entry = { kind, message: text, source: file || null, line: toInt(line), col: toInt(col), build: build(), platform: platform(), repeats: 1 };
    pending.set(key, entry);
    schedule(FLUSH_MS);
    return entry;
  }

  function describe(reason) {
    if (!reason) return '';
    if (typeof reason === 'string') return reason;
    if (typeof reason.message === 'string' && reason.message) {
      // A Supabase error is a plain object with a code: the code helps, the details may hold data.
      const name = reason.name && reason.name !== 'Error' ? reason.name : reason.code ? String(reason.code) : 'Error';
      return `${name}: ${reason.message}`;
    }
    return '';
  }

  function onError(event) {
    // A picture or a script that does not load is not a JavaScript error.
    if (!event || (!event.message && !event.error)) return null;
    const text = event.error ? describe(event.error) || event.message : event.message;
    return record('error', text, event.filename, event.lineno, event.colno);
  }

  function onRejection(event) {
    const reason = event?.reason;
    if (reason?.name === 'AbortError') return null;
    const text = describe(reason);
    if (!text) return null;
    const where = firstFrame(reason?.stack);
    return record('rejection', text, where?.file, where?.line, where?.col);
  }

  function client() {
    if (override.client) return override.client;
    try { return typeof sb !== 'undefined' ? sb : null; } catch (_e) { return null; }
  }

  function schedule(ms) {
    if (timer || !pending.size) return;
    timer = setTimeout(() => { timer = null; flush(); }, ms);
    timer?.unref?.();
  }

  function later() {
    if (retries >= MAX_RETRIES) return 0;
    retries += 1;
    schedule(RETRY_MS);
    return 0;
  }

  async function flush() {
    if (sending || !pending.size) return 0;
    const c = client();
    if (!c?.auth?.getSession || typeof c.rpc !== 'function') return later();
    let session = null;
    try { session = (await c.auth.getSession())?.data?.session || null; } catch (_e) { session = null; }
    if (!session) return later();
    const batch = [...pending.values()];
    pending.clear();
    retries = 0;
    sending = true;
    try { await c.rpc('report_client_errors', { errors: batch }); } catch (_e) { /* dropped: never a loop */ }
    finally { sending = false; }
    if (pending.size) schedule(FLUSH_MS);
    return batch.length;
  }

  function configure(options = {}) {
    override = { ...options };
    pending.clear(); seen.clear(); counted = 0; retries = 0; sending = false;
    if (timer) { clearTimeout(timer); timer = null; }
  }

  if (w && !w.__usClientErrors) {
    w.__usClientErrors = true;
    w.addEventListener?.('error', onError);
    w.addEventListener?.('unhandledrejection', onRejection);
    // Leaving the app: what is waiting goes now, if there is a session.
    w.document?.addEventListener?.('visibilitychange', () => { if (w.document.visibilityState === 'hidden') flush(); });
  }

  return { PER_LOAD, clean, fileOf, firstFrame, record, onError, onRejection, flush, configure, pendingCount: () => pending.size };
});
