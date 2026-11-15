// Come stai (founder, 02/11/2026; SQL member_status_v1; docs/missions/widget-come-stai-v1.md).
// Each member picks how they are from twelve states, in Oggi (the pill beside
// the distance opens the sheet); the partner sees it in Oggi and in the
// Android widget "Come stai". It lasts twelve hours (the server's times).
// No free text, no history, no push. The words are said in the form each
// member chose once in Settings ('m', 'f'), or undeclined.
// - Realtime: one line on the app's one channel (app.js startUsRealtime),
//   as the battery; never a parallel channel (ARCHITECTURE.md).
//   The SQL goes before the web: without the table this module stays quiet.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UsMemberStatus = api;
})(typeof window !== 'undefined' ? window : null, function (w) {
  'use strict';

  // The founder's twelve (02/11/2026). The same keys, emoji and words are in
  // the SQL check and in the widget (UsWidgetModels.STATUSES).
  const STATUSES = Object.freeze([
    { key: 'innamorato', emoji: '🥰', m: 'innamorato', f: 'innamorata', n: 'col cuore pieno' },
    { key: 'felice', emoji: '😊', m: 'felice', f: 'felice', n: 'felice' },
    { key: 'stanco', emoji: '😴', m: 'stanco', f: 'stanca', n: 'senza energie' },
    { key: 'giu', emoji: '😔', m: 'giù', f: 'giù', n: 'giù' },
    { key: 'nervoso', emoji: '😤', m: 'nervoso', f: 'nervosa', n: 'nervi tesi' },
    { key: 'malato', emoji: '🤒', m: 'non sto bene', f: 'non sto bene', n: 'non sto bene' },
    { key: 'festa', emoji: '🥳', m: 'in festa', f: 'in festa', n: 'in festa' },
    { key: 'lavoro', emoji: '💼', m: 'al lavoro', f: 'al lavoro', n: 'al lavoro' },
    { key: 'studio', emoji: '📚', m: 'sui libri', f: 'sui libri', n: 'sui libri' },
    { key: 'palestra', emoji: '🏋️', m: 'in palestra', f: 'in palestra', n: 'in palestra' },
    { key: 'viaggio', emoji: '🚗', m: 'in viaggio', f: 'in viaggio', n: 'in viaggio' },
    { key: 'tavola', emoji: '🍝', m: 'a tavola', f: 'a tavola', n: 'a tavola' }
  ]);
  const BY_KEY = new Map(STATUSES.map((s) => [s.key, s]));
  const FORMS = Object.freeze(['m', 'f']);
  const FORM_LABEL = Object.freeze({ m: 'Al maschile', f: 'Al femminile' });
  const LASTS_MS = 12 * 60 * 60 * 1000;
  const MISSING = new Set(['42P01', '42883', 'PGRST202', 'PGRST205']);

  const validForm = (form) => (FORMS.includes(form) ? form : null);

  // "innamorata", "innamorato", or the undeclined "col cuore pieno".
  function word(key, form) {
    const s = BY_KEY.get(key);
    if (!s) return '';
    const f = validForm(form);
    return f ? s[f] : s.n;
  }

  // "da 20 min", "da 1 ora", "da 3 ore"; "proprio ora" in the first minute.
  function since(ms) {
    const minutes = Math.floor(Math.max(0, ms) / 60000);
    if (minutes < 1) return 'proprio ora';
    if (minutes < 60) return `da ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return hours === 1 ? 'da 1 ora' : `da ${hours} ore`;
  }

  // Pure: a member's row as the app shows it, or null (none, expired, unknown).
  function model(row, { now = Date.now() } = {}) {
    const s = BY_KEY.get(row?.status);
    const at = Date.parse(row?.set_at || '');
    const until = Date.parse(row?.expires_at || '');
    if (!s || !Number.isFinite(at) || !Number.isFinite(until) || now >= until) return null;
    const form = validForm(row.form);
    return {
      key: s.key,
      emoji: s.emoji,
      form,
      word: word(s.key, form),
      since: since(now - at),
      at: new Date(at).toISOString(),
      until: new Date(until).toISOString()
    };
  }

  if (!w) return { STATUSES, FORMS, FORM_LABEL, LASTS_MS, word, since, model };

  const d = w.document;
  const $ = (id) => d?.getElementById(id);
  // loaded: the couple's rows have been read once for this identity.
  const state = { key: '', loaded: false, mine: null, partner: null, missing: false, saving: false };

  function client() {
    try { return sb; } catch (_) { return w.sb || null; }
  }
  const identityKey = (profile) => (profile?.id && profile?.couple_id ? `${profile.id}:${profile.couple_id}` : '');
  const partnerName = () => w.UsIdentity?.current?.()?.partnerName || 'La tua persona';
  const t = (text, vars) => (typeof w.usT === 'function' ? w.usT(text, vars) : String(text).replace(/\{([a-z]+)\}/gi, (all, k) => vars?.[k] ?? all));

  function reset() {
    state.loaded = false;
    state.mine = null;
    state.partner = null;
  }

  // ---------- Oggi: the pill beside the distance ----------

  function paint() {
    const pill = $('usOggiStatus');
    if (pill) {
      const show = Boolean(state.key) && !state.missing;
      pill.hidden = !show;
      if (show) {
        const mine = model(state.mine);
        const partner = model(state.partner);
        const name = partnerName();
        pill.querySelector('[data-status-partner]').hidden = !partner;
        if (partner) pill.querySelector('[data-status-partner]').textContent = `${partner.emoji} ${name}`;
        pill.querySelector('[data-status-mine]').textContent = mine ? mine.emoji : t('Come stai?');
        pill.dataset.mine = mine ? 'set' : 'none';
        const parts = [];
        if (partner) parts.push(`${name}: ${t(partner.word)}, ${t(partner.since)}`);
        parts.push(mine ? `${t('Tu')}: ${t(mine.word)}. ${t('Cambia come stai')}` : t('Come stai? Scegli'));
        pill.setAttribute('aria-label', parts.join('. '));
      }
      w.syncOggiRow?.();
    }
    paintSheet();
    const value = $('usStatusFormValue');
    if (value) value.textContent = t(FORM_LABEL[validForm(state.mine?.form)] || 'Da scegliere');
  }

  function render() {
    paint();
    w.dispatchEvent(new Event('us:member-status-changed'));
  }

  // ---------- the sheet: the twelve, or the form (Settings) ----------

  const root = () => $('usStatusSheet');
  const opened = () => Boolean(root()?.classList.contains('open'));

  function paintSheet() {
    const sheet = root();
    if (!sheet) return;
    const mine = model(state.mine);
    const form = validForm(state.mine?.form);
    sheet.querySelectorAll('[data-status]').forEach((button) => {
      const s = BY_KEY.get(button.dataset.status);
      if (!s) return;
      button.querySelector('[data-status-word]').textContent = t(word(s.key, form));
      button.setAttribute('aria-pressed', mine?.key === s.key ? 'true' : 'false');
    });
    sheet.querySelectorAll('[data-status-form]').forEach((button) => {
      const value = button.dataset.statusForm || null;
      button.setAttribute('aria-pressed', value === form ? 'true' : 'false');
    });
    const partner = model(state.partner);
    const line = $('usStatusPartnerLine');
    if (line) {
      line.hidden = !partner;
      if (partner) line.textContent = `${partnerName()}: ${partner.emoji} ${t(partner.word)} · ${t(partner.since)}`;
    }
    const clear = $('usStatusClear');
    if (clear) clear.hidden = !mine;
    const note = $('usStatusNote');
    if (note) note.textContent = t('Lo vede solo {name}, per 12 ore.', { name: partnerName() });
  }

  function open(panel = 'status') {
    const sheet = root();
    if (!sheet || !state.key) return false;
    sheet.querySelectorAll('[data-status-panel]').forEach((section) => { section.hidden = section.dataset.statusPanel !== panel; });
    paint();
    w.UsUiFoundation?.cancelSurfaceExit?.(sheet);
    sheet.setAttribute('aria-hidden', 'false');
    sheet.classList.add('open');
    if (!state.loaded) refresh().catch(() => {});
    return true;
  }

  function close() {
    const sheet = root();
    if (!sheet || !opened()) return;
    const finish = () => { sheet.classList.remove('open'); sheet.setAttribute('aria-hidden', 'true'); };
    sheet.classList.remove('open');
    if (!w.UsUiFoundation?.exitSurface?.(sheet, finish)) finish();
  }

  // ---------- data ----------

  // The couple's rows (mine and the partner's, RLS).
  async function refresh() {
    const profile = w.usProfile;
    const key = identityKey(profile);
    if (key !== state.key) { reset(); state.key = key; }
    if (!key || state.missing || w.__US_LOCAL_DEV__) { render(); return null; }
    const db = client();
    if (!db?.from) return null;
    const { data, error } = await db.from('member_status').select('user_id,status,form,set_at,expires_at').eq('couple_id', profile.couple_id);
    if (identityKey(w.usProfile) !== key) return null;
    if (error) {
      if (MISSING.has(error.code)) state.missing = true;
      else console.warn('[US Come stai] read', error);
      render();
      return null;
    }
    const rows = Array.isArray(data) ? data : [];
    state.mine = rows.find((r) => r.user_id === profile.id) || null;
    state.partner = rows.find((r) => r.user_id !== profile.id) || null;
    state.loaded = true;
    render();
    return state.partner;
  }

  async function write(rpc, args, button) {
    const key = identityKey(w.usProfile);
    const db = client();
    if (!key || key !== state.key || state.saving || !db?.rpc) return false;
    state.saving = true;
    try {
      const { data, error } = await db.rpc(rpc, args);
      if (identityKey(w.usProfile) !== key) return false;
      if (error) throw error;
      state.mine = { ...(state.mine || {}), user_id: w.usProfile.id, ...data };
      render();
      if (button) w.UsUiFoundation?.done?.(button);
      return true;
    } catch (error) {
      console.warn('[US Come stai]', error);
      w.UsFeedback?.error?.();
      w.toast?.(t('Non riesco a salvarlo. Riprova.'));
      return false;
    } finally {
      state.saving = false;
    }
  }

  async function choose(status, button) {
    if (status !== null && !BY_KEY.has(status)) return false;
    const ok = await write('set_member_status', { p_status: status }, button);
    if (ok) w.setTimeout(close, 380);
    return ok;
  }

  const chooseForm = (form, button) => write('set_member_form', { p_form: validForm(form) }, button);

  // Launch and return to the foreground (app.js).
  async function onForeground() {
    try { await refresh(); } catch (error) { console.warn('[US Come stai]', error); }
  }

  // A row of the couple changed (app.js startUsRealtime).
  function onChange(payload) {
    const me = w.usProfile?.id;
    const row = payload?.new;
    if (row?.user_id && payload.eventType !== 'DELETE') {
      if (row.user_id === me) state.mine = row;
      else state.partner = row;
      render();
      return;
    }
    refresh().catch(() => {});
  }

  // undefined until the rows are read: the widget keeps what it shows.
  function widgetState() {
    if (!state.loaded) return undefined;
    const pack = (row) => {
      const m = model(row);
      return { status: m ? m.key : '', form: validForm(row?.form) || '', at: m ? m.at : '', until: m ? m.until : '' };
    };
    return { me: pack(state.mine), partner: pack(state.partner) };
  }

  if (d) {
    d.addEventListener('click', (event) => {
      const target = event.target;
      if (!target?.closest) return;
      if (target.closest('#usOggiStatus')) { open('status'); return; }
      const sheet = root();
      if (!sheet || !sheet.contains(target)) return;
      if (target.closest('[data-status-close]')) { close(); return; }
      const pick = target.closest('[data-status]');
      if (pick) { choose(pick.dataset.status, pick); return; }
      if (target.closest('#usStatusClear')) { choose(null, target.closest('#usStatusClear')); return; }
      const form = target.closest('[data-status-form]');
      if (form) chooseForm(form.dataset.statusForm || null, form);
    });
  }
  // Signed out or a different couple: nothing of the old one stays.
  w.addEventListener('us-identity-change', (event) => {
    if (!event.detail?.identityKey) { reset(); state.key = ''; close(); }
    render();
  });
  // A state turns twelve hours old, or "da 20 min" moves on, while the page stays open; no network.
  setInterval(() => { if (!d?.hidden && (state.mine || state.partner)) render(); }, 60000);

  return { STATUSES, FORMS, FORM_LABEL, LASTS_MS, word, since, model, refresh, onForeground, onChange, open, close, choose, chooseForm, widgetState };
});
