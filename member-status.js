// Come stai (02/11/2026; docs/missions/widget-come-stai-v1.md; «Come stai che
// conta», grill and tavola of 27/11/2026, DECISIONS.md). Twelve states, twelve
// hours (server times), no free text, no history; words in each one's form.
// One gesture per state of the other person (with its push), the silent widget
// signal, Oggi's hint, «In viaggio» → Noi, lineFor() for US vi ricorda.
// Realtime: one line on the app's one channel (app.js startUsRealtime).
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UsMemberStatus = api;
})(typeof window !== 'undefined' ? window : null, function (w) {
  'use strict';

  // The same keys, emoji and words as the SQL check and the widget.
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
  // The nine gestures (as the SQL, the push and UsPushNotices status_*): emoji,
  // short word, «Manda …» (the same for him and her), how the other reads it.
  const GESTURES = Object.freeze({ abbraccio: { icon: '🤗' }, riposati: { icon: '🌙' }, respira: { icon: '🫶' }, cuore: { icon: '♡' }, festa: { icon: '🎉' }, forza: { icon: '💪' }, spacca: { icon: '🔥' }, buon_viaggio: { icon: '👋' }, buon_appetito: { icon: '😋' } });
  const SHORT = Object.freeze({ abbraccio: 'Abbraccio', riposati: 'Riposati', respira: 'Respira', cuore: 'Cuore', festa: 'Festa', forza: 'Forza!', spacca: 'Spacca tutto!', buon_viaggio: 'Buon viaggio', buon_appetito: 'Buon appetito' });
  const ACT = Object.freeze({ abbraccio: 'Manda un abbraccio', riposati: 'Manda «Riposati»', respira: 'Manda «Respira, ci sono io»', cuore: 'Manda un cuore', festa: 'Manda 🎉', forza: 'Manda «Forza!»', spacca: 'Manda «Spacca tutto!»', buon_viaggio: 'Manda «Buon viaggio»', buon_appetito: 'Manda «Buon appetito»' });
  const GOT = Object.freeze({ abbraccio: '{name} ti manda un abbraccio', riposati: '{name} ti dice «Riposati»', respira: '{name} ti dice «Respira, ci sono io»', cuore: '{name} ti manda un cuore', festa: '{name} festeggia con te 🎉', forza: '{name} ti dice «Forza!»', spacca: '{name} ti dice «Spacca tutto!»', buon_viaggio: '{name} ti dice «Buon viaggio»', buon_appetito: '{name} ti dice «Buon appetito»' });
  // The state in the third person, in each one's form (m, f, n).
  const THIRD = Object.freeze({
    innamorato: { m: '{name} è innamorato', f: '{name} è innamorata', n: '{name} ha il cuore pieno' }, felice: '{name} è felice',
    stanco: { m: '{name} è stanco', f: '{name} è stanca', n: '{name} è senza energie' }, giu: '{name} è giù',
    nervoso: { m: '{name} è nervoso', f: '{name} è nervosa', n: '{name} ha i nervi tesi' }, malato: '{name} non sta bene',
    festa: '{name} è in festa', lavoro: '{name} è al lavoro', studio: '{name} è sui libri', palestra: '{name} è in palestra', viaggio: '{name} è in viaggio', tavola: '{name} è a tavola'
  });
  const REPLY_SHOWN_MS = 3 * 3600e3;
  const GESTURE_OF = Object.freeze({ giu: 'abbraccio', malato: 'abbraccio', stanco: 'riposati', nervoso: 'respira', felice: 'cuore', innamorato: 'cuore', festa: 'festa', lavoro: 'forza', studio: 'forza', palestra: 'spacca', viaggio: 'buon_viaggio', tavola: 'buon_appetito' });
  const gestureOf = (key) => GESTURE_OF[key] || null;
  // The answer saved on a state row (reply_gesture), only while that state shows.
  function replyOf(row, { now = Date.now() } = {}) {
    const g = row?.reply_gesture;
    if (!GESTURES[g] || !model(row, { now })) return null;
    const at = Date.parse(row.reply_at || '');
    return Number.isFinite(at) ? { gesture: g, at: new Date(at).toISOString() } : null;
  }
  // D9/D17: how long the other person has been giù, non sta bene or nervoso.
  const HEAVY = Object.freeze(['giu', 'malato', 'nervoso']);
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

  // D10: one hint for Oggi's row: they are stanco/giù → a voice message; both glad → a game.
  function hintFor(mine, partner, name) {
    if (!partner) return null;
    if (partner.key === 'stanco' || partner.key === 'giu') return { kind: 'vocale', title: `🎙 Un vocale a ${name}?` };
    const glad = (m) => m && (m.key === 'felice' || m.key === 'innamorato');
    if (glad(mine) && glad(partner)) return { kind: 'partita', title: '🎲 Una partita?' };
    return null;
  }

  // D9/D17: US vi ricorda's line: giù, non sta bene or nervoso for 2 hours, no gesture yet, one per state.
  function lineFor(row, { now = Date.now() } = {}) {
    const m = model(row, { now });
    if (!m || !HEAVY.includes(m.key) || replyOf(row, { now })) return null;
    const hours = Math.floor((now - Date.parse(m.at)) / 3600e3);
    if (hours < 2) return null;
    return { kind: 'come_sta', ref_key: `come_sta:${m.at}`, speaker: 'me', slot: 'mattina', vars: { status: m.key, form: m.form || '', hours, gesture: gestureOf(m.key) } };
  }

  const pure = { STATUSES, FORMS, FORM_LABEL, LASTS_MS, GESTURES, GESTURE_OF, SHORT, ACT, GOT, THIRD, word, since, model, gestureOf, replyOf, hintFor, lineFor };
  if (!w) return pure;

  const d = w.document;
  const $ = (id) => d?.getElementById(id);
  // loaded: the couple's rows have been read once for this identity.
  const state = { key: '', loaded: false, mine: null, partner: null, missing: false, saving: false };

  function client() {
    try { return sb; } catch (_) { return w.sb || null; }
  }
  const identityKey = (profile) => (profile?.id && profile?.couple_id ? `${profile.id}:${profile.couple_id}` : '');
  const partnerName = () => w.UsIdentity?.current?.()?.partnerName || 'La tua persona';
  // The pill's short name: the first word («Beatrice Maria» → «Beatrice»); the full one stays in the aria-label.
  const shortName = (name) => (name === 'La tua persona' ? t(name) : String(name || '').trim().split(/\s+/)[0] || name);
  const t = (text, vars) => (typeof w.usT === 'function' ? w.usT(text, vars) : String(text).replace(/\{([a-z]+)\}/gi, (all, k) => vars?.[k] ?? all));

  function reset() {
    state.loaded = false;
    state.mine = null;
    state.partner = null;
  }

  const meId = () => w.usProfile?.id || '';
  const store = (key, value) => {
    try {
      if (value === undefined) return w.localStorage?.getItem(key) ?? null;
      w.localStorage?.setItem(key, value);
    } catch (_) { return null; }
    return null;
  };
  const sentToPartner = () => replyOf(state.partner);
  const replyToMe = ({ now = Date.now() } = {}) => replyOf(state.mine, { now });
  const painted = { hint: 'null', trip: false };
  // Before the SQL of 27/11 (no answer columns) nothing is offered that the server would refuse.
  const partnerGesture = () => {
    const partner = model(state.partner);
    return partner && !state.noReplies ? gestureOf(partner.key) : null;
  };
  const act = (g) => t(ACT[g] || '');
  const gotLine = (g, name) => t(GOT[g] || '', { name });
  const hasPartner = () => {
    try { const list = w.UsCoupleContext?.snapshot?.()?.profiles; return Array.isArray(list) ? list.length > 1 : true; } catch (_) { return true; }
  };
  const roleOfPartner = () => (w.UsPersonaggi?.myRole?.() === 'beatrice' ? 'francesco' : 'beatrice');
  const faceOf = (size) => {
    try { return w.UsPersonaggi?.character?.(roleOfPartner(), { size, reaction: '' }) || ''; } catch (_) { return ''; }
  };
  const untilText = (iso) => {
    const at = new Date(iso);
    return Number.isFinite(at.getTime()) ? `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}` : '';
  };

  // Oggi's second row (tavola «Come stai di US»; founder, 28/11: «una pillola
  // unica»): its readable width (every word that may go gone, never under
  // 150 px) is its minimum, so below it the pill takes the next line of the
  // row; above it, the richest form that fits. Levels: the word of the gesture
  // I got (1), the gesture's word (2), then the name (3: the face says who).
  const LEVELS = '123', FIT_MAX = 3, MIN_READABLE = 150;
  let fitting = false;
  const widthOf = (group, fitLevels) => {
    group.dataset.fit = fitLevels;
    // The content plus the pill's own border (scrollWidth leaves it out).
    return Math.ceil(group.scrollWidth + (group.offsetWidth - group.clientWidth)) + 1;
  };
  function fit() {
    const group = $('usOggiStatusGroup');
    if (!group || group.hidden || fitting) return;
    fitting = true;
    try {
      const row = group.parentElement;
      // The pill's own widths, measured free: the richest form and the readable one.
      group.style.flex = '0 0 auto';
      group.style.minWidth = '0px';
      group.style.maxWidth = 'none';
      const widths = [''].concat([...LEVELS].map((_, i) => LEVELS.slice(0, i + 1))).map((f) => widthOf(group, f));
      group.style.flex = group.style.minWidth = group.style.maxWidth = '';
      const rich = widths[0];
      const room = row ? row.clientWidth : rich;
      const basis = Math.min(room, Math.max(MIN_READABLE, widths[FIT_MAX]));
      group.dataset.readable = String(widths[FIT_MAX]);
      group.style.setProperty('--us-status-basis', `${basis}px`);
      group.style.setProperty('--us-status-rich', `${Math.max(basis, rich)}px`);
      const over = () => group.scrollWidth > group.clientWidth + 1;
      let level = 0;
      group.dataset.fit = '';
      while (level < FIT_MAX && over()) group.dataset.fit = LEVELS.slice(0, ++level);
      // A level taken: the pill hugs what it shows (no empty glass at its end).
      if (level) group.style.setProperty('--us-status-rich', `${Math.max(basis, widths[level])}px`);
    } finally {
      fitting = false;
    }
  }

  function paintRow() {
    const group = $('usOggiStatusGroup');
    const show = Boolean(state.key) && !state.missing;
    if (group) group.hidden = !show;
    const mine = model(state.mine);
    const partner = model(state.partner);
    const name = partnerName();
    const g = partnerGesture();
    const sent = sentToPartner();

    const her = $('usOggiPartner');
    if (her) {
      her.hidden = !show || !hasPartner();
      if (!her.hidden) {
        const face = her.querySelector('[data-status-face]');
        const html = faceOf(26);
        if (face && face.__usHtml !== html) { face.innerHTML = html; face.__usHtml = html; }
        her.querySelector('[data-status-name]').textContent = shortName(name);
        her.querySelector('[data-status-her-word]').textContent = partner ? t(partner.word) : '?';
        her.dataset.state = partner ? 'set' : 'none';
        her.setAttribute('aria-label', partner ? `${t(personLine(partner, name))}, ${t(partner.since)}. ${t('Apri')}` : t('{name} non ha ancora detto come sta. Apri', { name }));
      }
    }

    const quick = $('usOggiStatusReply');
    if (quick) {
      quick.hidden = !show || !g;
      if (!quick.hidden) {
        quick.dataset.sent = sent ? 'true' : 'false';
        quick.querySelector('[data-act-icon]').textContent = sent ? '✓' : GESTURES[g].icon;
        quick.querySelector('[data-act-word]').textContent = sent ? t('Mandato') : t(SHORT[g]);
        quick.setAttribute('aria-label', sent ? t('Mandato a {name}', { name }) : act(g));
        quick.setAttribute('aria-disabled', sent || state.responding ? 'true' : 'false');
      }
    }

    const pill = $('usOggiStatus');
    if (pill) {
      pill.hidden = !show;
      if (show) {
        pill.dataset.mine = mine ? 'set' : 'none';
        pill.querySelector('[data-status-mine-emoji]').textContent = mine ? mine.emoji : '';
        pill.querySelector('[data-status-mine]').textContent = t('Tu');
        pill.setAttribute('aria-label', mine ? `${t('Tu')}: ${t(mine.word)}. ${t('Cambia come stai')}` : t('Come stai? Scegli'));
        pill.title = mine ? t(mine.word) : '';
      }
    }

    const got = $('usOggiGot');
    if (got) {
      const reply = replyToMe();
      const fresh = reply && Date.now() - Date.parse(reply.at) < REPLY_SHOWN_MS;
      got.hidden = !show || !fresh;
      if (group) group.dataset.got = got.hidden ? 'false' : 'true';
      if (!got.hidden) {
        got.querySelector('[data-got-icon]').textContent = GESTURES[reply.gesture].icon;
        got.querySelector('[data-got-word]').textContent = t('da {name}', { name });
        const line = gotLine(reply.gesture, name);
        got.setAttribute('aria-label', `${line}. ${t('Cambia come stai')}`);
        got.title = line;
      }
    }
    fit();
  }

  function personLine(m, name) {
    const p = THIRD[m.key];
    const said = typeof p === 'string' ? p : p ? p[m.form || 'n'] || p.n : '';
    return said.replace('{name}', name);
  }

  const personRoot = () => $('usStatusPerson');
  const personOpened = () => Boolean(personRoot()?.classList.contains('open'));
  function paintPerson() {
    const sheet = personRoot();
    if (!sheet) return;
    const partner = model(state.partner);
    const name = partnerName();
    const g = partnerGesture();
    const sent = sentToPartner();
    const char = $('usStatusPersonChar');
    const html = faceOf(96);
    if (char && char.__usHtml !== html) { char.innerHTML = html; char.__usHtml = html; }
    const title = $('usStatusPersonTitle');
    if (title) title.textContent = partner ? personLine(partner, name) : t('{name} non ha ancora detto come sta', { name });
    const line = $('usStatusPersonSince');
    if (line) {
      line.hidden = !partner;
      if (partner) line.textContent = `${partner.emoji} ${t(partner.since)} · ${t('fino alle {time}', { time: untilText(partner.until) })}`;
    }
    const button = $('usStatusRespond');
    if (button) {
      button.hidden = !g;
      if (g) {
        button.dataset.gesture = g;
        button.dataset.sent = sent ? 'true' : 'false';
        button.disabled = Boolean(sent) || Boolean(state.responding);
        button.setAttribute('aria-disabled', button.disabled ? 'true' : 'false');
        button.querySelector('[data-status-respond-label]').textContent = sent ? `✓ ${t('Mandato')}` : `${GESTURES[g].icon} ${act(g)}`;
        button.setAttribute('aria-label', sent ? t('Mandato a {name}', { name }) : act(g));
      }
    }
  }
  function openPerson() {
    const sheet = personRoot();
    if (!sheet || !state.key) return false;
    paintPerson();
    w.UsUiFoundation?.cancelSurfaceExit?.(sheet);
    sheet.setAttribute('aria-hidden', 'false');
    sheet.classList.add('open');
    w.setTimeout(() => sheet.querySelector('[data-person-close].us-modal-close')?.focus?.({ preventScroll: true }), 60);
    return true;
  }
  function closePerson() {
    const sheet = personRoot();
    if (!sheet || !personOpened()) return;
    const finish = () => { sheet.classList.remove('open'); sheet.setAttribute('aria-hidden', 'true'); };
    sheet.classList.remove('open');
    if (!w.UsUiFoundation?.exitSurface?.(sheet, finish)) finish();
  }

  function paint() {
    paintRow();
    if ($('usOggiStatus')) w.syncOggiRow?.();
    paintSheet();
    paintPerson();
    const value = $('usStatusFormValue');
    if (value) value.textContent = t(FORM_LABEL[validForm(state.mine?.form)] || 'Da scegliere');
    // D10: the Oggi row and the distance read the states again, only when what they show changes.
    const hint = JSON.stringify(oggiHint());
    if (hint !== painted.hint) { painted.hint = hint; w.UsOggiNext?.repaint?.(); }
    const trip = partnerTraveling();
    if (trip !== painted.trip) { painted.trip = trip; w.usRepaintDistanceCapsule?.(); }
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
    const clear = $('usStatusClear');
    if (clear) clear.hidden = !mine;
    const note = $('usStatusNote');
    if (note) note.textContent = t('{name} lo vede subito, anche nel widget. Dura 12 ore.', { name: partnerName() });
  }

  // D14: «In viaggio» chosen: the sheet offers the Noi calendar (dismissable).
  function showTrip(on) {
    const trip = $('usStatusTrip');
    if (trip) trip.hidden = !on;
    if (on) w.setTimeout(() => $('usStatusTripYes')?.focus?.({ preventScroll: true }), 60);
  }

  function open(panel = 'status') {
    const sheet = root();
    if (!sheet || !state.key) return false;
    sheet.querySelectorAll('[data-status-panel]').forEach((section) => { section.hidden = section.dataset.statusPanel !== panel; });
    showTrip(false);
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
    const finish = () => { sheet.classList.remove('open'); sheet.setAttribute('aria-hidden', 'true'); showTrip(false); };
    sheet.classList.remove('open');
    if (!w.UsUiFoundation?.exitSurface?.(sheet, finish)) finish();
  }

  // ---------- data ----------

  const COLUMNS = 'user_id,status,form,set_at,expires_at,reply_gesture,reply_at';
  const OLD_COLUMNS = 'user_id,status,form,set_at,expires_at';
  // The couple's rows (RLS); before the SQL of 27/11, without the answer's columns.
  async function refresh() {
    const profile = w.usProfile;
    const key = identityKey(profile);
    if (key !== state.key) { reset(); state.key = key; }
    if (!key || state.missing || w.__US_LOCAL_DEV__) { render(); return null; }
    const db = client();
    if (!db?.from) return null;
    let { data, error } = await db.from('member_status').select(state.noReplies ? OLD_COLUMNS : COLUMNS).eq('couple_id', profile.couple_id);
    if (error && !state.noReplies && error.code === '42703') {
      state.noReplies = true;
      ({ data, error } = await db.from('member_status').select(OLD_COLUMNS).eq('couple_id', profile.couple_id));
    }
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
    noticeReply();
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
      // D13: the other person's widgets follow at once, even with US closed.
      w.sendWebPushEvent?.('partner_status');
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
    // D14: in viaggio, the sheet stays open and offers the Noi calendar.
    if (ok && status === 'viaggio' && opened()) showTrip(true);
    else if (ok) w.setTimeout(close, 380);
    return ok;
  }

  const chooseForm = (form, button) => write('set_member_form', { p_form: validForm(form) }, button);

  const todayISO = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };
  function tripToCalendar() {
    close();
    w.go?.('bond', { nav: true });
    w.setTimeout(() => w.UsCalendarLinks?.createPrefilled?.(todayISO(), { title: t('In viaggio'), allDay: true }), 80);
  }

  // D7/D16: one tap sends the gesture that fits the other person's state.
  async function respond(button) {
    const key = identityKey(w.usProfile);
    const partner = model(state.partner);
    const g = partner ? gestureOf(partner.key) : null;
    const db = client();
    if (!g || state.noReplies || !key || key !== state.key || state.responding || sentToPartner() || !db?.rpc) return false;
    state.responding = true;
    paint();
    try {
      const { data, error } = await db.rpc('respond_member_status', { p_status_set_at: state.partner.set_at, p_gesture: g });
      if (identityKey(w.usProfile) !== key) return false;
      if (error) throw error;
      state.partner = { ...state.partner, reply_gesture: data?.gesture || g, reply_at: data?.at || new Date().toISOString() };
      w.UsFeedback?.selection?.();
      if (button) w.UsUiFoundation?.done?.(button);
      // The push, like a Ti penso; a retry of an answer already saved sends nothing new.
      if (!data?.already) w.sendWebPushEvent?.('status_response');
      w.toast?.(t('Mandato a {name} ♡', { name: partnerName() }));
      return true;
    } catch (error) {
      const text = String(error?.message || '');
      if (error?.code === 'P0002' || /status (gone|changed)/.test(text)) { w.toast?.(t('Il suo Come stai è appena cambiato.')); refresh().catch(() => {}); }
      else if (/rate limited/.test(text)) w.toast?.(t('Aspetta un attimo e riprova.'));
      else { console.warn('[US Come stai] respond', error); w.toast?.(t('Non riesco a mandarlo. Riprova.')); }
      w.UsFeedback?.error?.();
      return false;
    } finally {
      state.responding = false;
      render();
    }
  }

  // An answer to my state: a toast once (also at launch); the reaction is personaggi.js's.
  const SEEN = () => `us:status-reply:v1:${meId()}`;
  function noticeReply() {
    const reply = replyToMe();
    if (!reply || !meId()) return;
    if (store(SEEN()) === reply.at) return;
    store(SEEN(), reply.at);
    if (Date.now() - Date.parse(reply.at) > LASTS_MS) return;
    w.toast?.(gotLine(reply.gesture, partnerName()));
    w.UsFeedback?.selection?.();
    w.dispatchEvent(new CustomEvent('us:status-reply', { detail: reply }));
  }

  // D10: the suggestion for Oggi's row (app.js renderOggiNext) and the distance.
  const oggiHint = () => hintFor(model(state.mine), model(state.partner), partnerName());
  function runHint(kind) {
    if (kind === 'vocale') { w.UsLeftForYou?.openComposer?.({ kind: 'audio' }); return true; }
    if (kind === 'partita') { w.openQuizHub?.({ nav: true }); return true; }
    return false;
  }
  const partnerTraveling = () => model(state.partner)?.key === 'viaggio';
  // D9/D17: the line for US vi ricorda (us-ricorda.js asks, decides when).
  const ricordaLine = () => lineFor(state.partner);

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
      if (row.user_id === me) noticeReply();
      return;
    }
    refresh().catch(() => {});
  }

  // The faces (personaggi.js moodOf): what is known, even before the first read.
  function faces() {
    const pack = (row) => { const m = model(row); return { status: m ? m.key : '', form: validForm(row?.form) || '' }; };
    return { me: pack(state.mine), partner: pack(state.partner) };
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
      if (target.closest('#usOggiStatusReply')) { respond(target.closest('#usOggiStatusReply')); return; }
      if (target.closest('#usOggiPartner')) { openPerson(); return; }
      if (target.closest('#usOggiStatus') || target.closest('#usOggiGot')) { open('status'); return; }
      const person = personRoot();
      if (person && person.contains(target)) {
        if (target.closest('[data-person-close]')) { closePerson(); return; }
        if (target.closest('#usStatusRespond')) { respond(target.closest('#usStatusRespond')); return; }
        if (target.closest('#usStatusPersonThink')) { closePerson(); w.sendThinkSignal?.(); return; }
        if (target.closest('#usStatusPersonVoice')) { closePerson(); w.UsLeftForYou?.openComposer?.({ kind: 'audio' }); return; }
        return;
      }
      const sheet = root();
      if (!sheet || !sheet.contains(target)) return;
      if (target.closest('[data-status-close]')) { close(); return; }
      if (target.closest('#usStatusTripYes')) { tripToCalendar(); return; }
      if (target.closest('#usStatusTripNo')) { close(); return; }
      const pick = target.closest('[data-status]');
      if (pick) { choose(pick.dataset.status, pick); return; }
      if (target.closest('#usStatusClear')) { choose(null, target.closest('#usStatusClear')); return; }
      const form = target.closest('[data-status-form]');
      if (form) chooseForm(form.dataset.statusForm || null, form);
    });
    d.addEventListener('keydown', (event) => { if (event.key === 'Escape' && personOpened()) closePerson(); });
    const group = $('usOggiStatusGroup');
    if (group && typeof w.ResizeObserver === 'function') new w.ResizeObserver(() => fit()).observe(group);
    else w.addEventListener('resize', fit);
    try { d.fonts?.ready?.then(() => fit()); d.fonts?.addEventListener?.('loadingdone', () => fit()); } catch (_) { /* old webview */ }
    w.addEventListener('us:aspetto', () => w.setTimeout(fit, 0));
  }
  // Signed out or a different couple: nothing of the old one stays.
  w.addEventListener('us-identity-change', (event) => {
    if (!event.detail?.identityKey) { reset(); state.key = ''; close(); closePerson(); }
    render();
  });
  // A state turns twelve hours old, or "da 20 min" moves on, while the page stays open; no network.
  setInterval(() => { if (!d?.hidden && (state.mine || state.partner)) render(); }, 60000);

  return { ...pure, refresh, onForeground, onChange, open, close, openPerson, closePerson, choose, chooseForm, widgetState, faces, respond, replyToMe, oggiHint, runHint, partnerTraveling, ricordaLine, tripToCalendar, fit };
});
