// Batteria del partner (founder, grill del 31/10/2026; SQL couple_battery_v1).
// This phone reports its own battery (percentage, charging) only while US is
// in use: at launch and on return to the foreground, at most every 15 minutes.
// No background work and no push. Noi shows the partner's last reading
// ("Bea · 18% · 2 ore fa") and the Android widget "Noi" gets the same one.
// Without a reading, or with one a day old, nothing is shown.
// - Android reads the battery natively (UsWidgetBridge.getBatteryStatus);
//   elsewhere the browser's Battery API, where it exists.
// - Realtime uses its own channel, opened once the table has answered: a web
//   build that lands before the SQL never breaks the main US channel.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UsPartnerBattery = api;
})(typeof window !== 'undefined' ? window : null, function (w) {
  'use strict';

  const REPORT_GAP_MS = 15 * 60 * 1000;
  const VISIBLE_MS = 24 * 60 * 60 * 1000;
  const LOW = 20;
  // The table or the function is not there yet (web before SQL): stop asking.
  const MISSING = new Set(['42P01', '42883', 'PGRST202', 'PGRST205']);

  // Pure: send this phone's battery now? `mineAt` is the server's time of my
  // last reading, `lastTriedAt` this session's last attempt (failed or not).
  function shouldReport({ now = Date.now(), mineAt = null, lastTriedAt = 0, hidden = false, inFlight = false } = {}) {
    if (inFlight || hidden) return false;
    if (lastTriedAt && now - lastTriedAt < REPORT_GAP_MS) return false;
    const at = Date.parse(mineAt || '');
    return !(Number.isFinite(at) && now - at < REPORT_GAP_MS);
  }

  // Phosphor glyph; same thresholds as the widget (UsWidgetModels.batteryGlyph).
  function glyph(level, charging) {
    if (charging) return 'battery-charging';
    if (level <= LOW) return 'battery-low';
    return level <= 60 ? 'battery-medium' : 'battery-high';
  }

  // Same words as the rest of the app, so the English dictionary has them.
  function ago(ms) {
    const minutes = Math.floor(ms / 60000);
    if (minutes < 1) return 'proprio ora';
    if (minutes < 60) return `${minutes} min fa`;
    const hours = Math.floor(minutes / 60);
    return hours === 1 ? '1 ora fa' : `${hours} ore fa`;
  }

  // Pure: what Noi shows for the partner's row, or null for nothing.
  function model(row, { now = Date.now(), partnerName = '' } = {}) {
    const level = row?.level;
    const at = Date.parse(row?.updated_at || '');
    if (!row || !Number.isInteger(level) || level < 0 || level > 100 || !Number.isFinite(at)) return null;
    const age = Math.max(0, now - at);
    if (age >= VISIBLE_MS) return null;
    const charging = row.charging === true;
    return {
      level,
      charging,
      at: new Date(at).toISOString(),
      name: String(partnerName || '').trim() || 'La tua persona',
      when: ago(age),
      icon: glyph(level, charging),
      low: !charging && level <= LOW,
      text: `${level}%`
    };
  }

  // This phone's battery: native first, then the browser. null = unknown.
  async function readDevice(win = w) {
    try {
      const native = await win?.UsPlatform?.readNativeBattery?.();
      if (native) return native;
    } catch (_) {}
    try {
      const b = await win?.navigator?.getBattery?.();
      if (!b) return null;
      // Chrome on a computer without a battery says "full and charging, forever".
      if (b.charging === true && b.level === 1 && b.chargingTime === 0 && b.dischargingTime === Infinity) return null;
      const level = Math.round(Number(b.level) * 100);
      if (!Number.isInteger(level) || level < 0 || level > 100) return null;
      return { level, charging: b.charging === true };
    } catch (_) {
      return null;
    }
  }

  if (!w) return { shouldReport, glyph, ago, model, readDevice, REPORT_GAP_MS, VISIBLE_MS };

  // loaded: the couple's rows have been read once for this identity.
  const state = { key: '', loaded: false, partner: null, mineAt: null, lastTriedAt: 0, inFlight: false, missing: false };
  let channel = null;
  let channelKey = '';

  function client() {
    try { return sb; } catch (_) { return w.sb || null; }
  }
  const identityKey = (profile) => (profile?.id && profile?.couple_id ? `${profile.id}:${profile.couple_id}` : '');
  const partnerName = () => w.UsIdentity?.current?.()?.partnerName || '';
  const current = () => model(state.partner, { partnerName: partnerName() });

  function reset() {
    state.loaded = false;
    state.partner = null;
    state.mineAt = null;
    state.lastTriedAt = 0;
    state.inFlight = false;
    unsubscribe();
  }

  function render() {
    const m = current();
    const row = w.document?.getElementById('usPartnerBattery');
    if (row) {
      row.hidden = !m;
      if (m) {
        row.dataset.low = m.low ? 'true' : 'false';
        row.querySelector('[data-battery-name]').textContent = m.name;
        row.querySelector('[data-battery-icon]').dataset.usIcon = m.icon;
        row.querySelector('[data-battery-level]').textContent = m.text;
        row.querySelector('[data-battery-charging]').hidden = !m.charging;
        row.querySelector('[data-battery-when]').textContent = m.when;
      }
    }
    w.dispatchEvent(new Event('us:partner-battery-changed'));
  }

  // The couple's rows (mine and the partner's, RLS): my last time decides
  // whether to report, the partner's is what Noi shows.
  async function refresh() {
    const profile = w.usProfile;
    const key = identityKey(profile);
    if (key !== state.key) { reset(); state.key = key; }
    if (!key || state.missing || w.__US_LOCAL_DEV__) { render(); return null; }
    const db = client();
    if (!db?.from) return null;
    const { data, error } = await db.from('couple_batteries').select('user_id,level,charging,updated_at').eq('couple_id', profile.couple_id);
    if (identityKey(w.usProfile) !== key) return null;
    if (error) {
      if (MISSING.has(error.code)) state.missing = true;
      else console.warn('[US Battery] read', error);
      return state.partner;
    }
    const rows = Array.isArray(data) ? data : [];
    state.mineAt = rows.find((r) => r.user_id === profile.id)?.updated_at || null;
    state.partner = rows.find((r) => r.user_id !== profile.id) || null;
    state.loaded = true;
    subscribe(profile);
    render();
    return state.partner;
  }

  async function report() {
    const profile = w.usProfile;
    const key = identityKey(profile);
    if (!key || key !== state.key || state.missing) return false;
    if (!shouldReport({ mineAt: state.mineAt, lastTriedAt: state.lastTriedAt, hidden: w.document?.hidden, inFlight: state.inFlight })) return false;
    state.inFlight = true;
    state.lastTriedAt = Date.now();
    try {
      const reading = await readDevice();
      const db = client();
      if (!reading || !db?.rpc) return false;
      const { data, error } = await db.rpc('report_battery', { p_level: reading.level, p_charging: reading.charging });
      if (error) {
        if (MISSING.has(error.code)) state.missing = true;
        else console.warn('[US Battery] report', error);
        return false;
      }
      if (identityKey(w.usProfile) === key) state.mineAt = data?.updated_at || new Date().toISOString();
      return true;
    } finally {
      state.inFlight = false;
    }
  }

  // Launch and return to the foreground (app.js). Nothing else sends.
  async function onForeground() {
    try {
      await refresh();
      await report();
    } catch (error) {
      console.warn('[US Battery]', error);
    }
  }

  // A row of the couple changed: the partner's is shown as it arrives.
  function onRealtime(payload) {
    const me = w.usProfile?.id;
    const row = payload?.new;
    if (row?.user_id && row.user_id === me) { state.mineAt = row.updated_at || state.mineAt; return; }
    if (row?.user_id && payload.eventType !== 'DELETE') { state.partner = row; render(); return; }
    refresh().catch(() => {});
  }

  function subscribe(profile) {
    const key = identityKey(profile);
    const db = client();
    if (!key || channelKey === key || !db?.channel) return;
    unsubscribe();
    channelKey = key;
    channel = db.channel(`us-battery-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'couple_batteries', filter: `couple_id=eq.${profile.couple_id}` }, onRealtime)
      .subscribe();
  }

  function unsubscribe() {
    if (channel) {
      try { client()?.removeChannel?.(channel); } catch (_) {}
    }
    channel = null;
    channelKey = '';
  }

  // undefined until the rows are read: the widget keeps what it shows.
  function widgetState() {
    if (!state.loaded) return undefined;
    const m = current();
    return m ? { level: m.level, charging: m.charging, at: m.at } : null;
  }

  // Signed out or a different couple: nothing of the old one stays.
  w.addEventListener('us-identity-change', (event) => {
    if (!event.detail?.identityKey) { reset(); state.key = ''; }
    render();
  });
  // "2 ore fa" moves on while the page stays open; no network.
  setInterval(() => { if (!w.document?.hidden && state.partner) render(); }, 60000);

  return { shouldReport, glyph, ago, model, readDevice, refresh, onForeground, onRealtime, widgetState, REPORT_GAP_MS, VISIBLE_MS };
});
