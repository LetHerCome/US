// Come stai (founder, 02/11/2026; SQL member_status_v1; docs/missions/widget-come-stai-v1.md).
// Each member picks how they are from twelve states, in Oggi (the pill beside
// the distance opens the sheet); the partner sees it in Oggi and in the
// Android widget "Come stai". It lasts twelve hours (the server's times).
// No free text, no history. The words are said in the form each
// member chose once in Settings ('m', 'f'), or undeclined.
// Come stai che conta (grill del founder del 27/11/2026): under the other
// person's state one fitting gesture, one tap, one per state (D7/D16, with a
// push: the exception to «no notification» of 02/11, which was about the
// changes of state); a change reaches their widgets at once (D13, a silent
// signal); Oggi's row may suggest one thing (D10); «In viaggio» offers the
// Noi calendar (D14); US vi ricorda asks lineFor() (D9/D17).
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
  // Come stai che conta (grill del founder del 27/11/2026, D7/D16): under the
  // other person's state, one gesture that fits it, one tap. The same nine are
  // in the SQL (respond_member_status), the push (notification-core.mjs) and
  // the Android notices (UsPushNotices status_<gesture>).
  // label: the button; said: how the other person reads it, with your name.
  const GESTURES = Object.freeze({
    abbraccio: { label: 'Ti mando un abbraccio', icon: '🤗', said: (n) => `${n}: Ti mando un abbraccio` },
    riposati: { label: 'Riposati', icon: '🌙', said: (n) => `${n}: Riposati` },
    respira: { label: 'Respira, ci sono io', icon: '🫶', said: (n) => `${n}: Respira, ci sono io` },
    cuore: { label: 'Ti mando un cuore ♡', icon: '♡', said: (n) => `${n} ti manda un cuore ♡` },
    festa: { label: '🎉', icon: '🎉', aria: 'Festeggia con {name}', said: (n) => `${n}: 🎉` },
    forza: { label: 'Forza!', icon: '💪', said: (n) => `${n}: Forza!` },
    spacca: { label: 'Spacca tutto!', icon: '🔥', said: (n) => `${n}: Spacca tutto!` },
    buon_viaggio: { label: 'Buon viaggio', icon: '👋', said: (n) => `${n}: Buon viaggio` },
    buon_appetito: { label: 'Buon appetito', icon: '😋', said: (n) => `${n}: Buon appetito` }
  });
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

  // D10: one light suggestion for the Oggi row, from the two states, or null.
  // partner stanco/giù → a voice message; both happy or in love → a game.
  function hintFor(mine, partner, name) {
    if (!partner) return null;
    if (partner.key === 'stanco' || partner.key === 'giu') return { kind: 'vocale', icon: 'microphone', title: `Lascia un vocale a ${name}` };
    const glad = (m) => m && (m.key === 'felice' || m.key === 'innamorato');
    if (glad(mine) && glad(partner)) return { kind: 'partita', icon: 'game-controller', title: 'Una partita?' };
    return null;
  }

  // D9/D17: the line of US vi ricorda, decided here (like «ti aspetta»): the
  // other person giù, non sta bene or nervoso for two hours or more, and no
  // gesture sent yet. One per state (ref_key), never at night (us-ricorda.js).
  function lineFor(row, { now = Date.now() } = {}) {
    const m = model(row, { now });
    if (!m || !HEAVY.includes(m.key) || replyOf(row, { now })) return null;
    const hours = Math.floor((now - Date.parse(m.at)) / 3600e3);
    if (hours < 2) return null;
    return { kind: 'come_sta', ref_key: `come_sta:${m.at}`, speaker: 'me', slot: 'mattina', vars: { status: m.key, form: m.form || '', hours, gesture: gestureOf(m.key) } };
  }

  const pure = { STATUSES, FORMS, FORM_LABEL, LASTS_MS, GESTURES, GESTURE_OF, word, since, model, gestureOf, replyOf, hintFor, lineFor };
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
  const t = (text, vars) => (typeof w.usT === 'function' ? w.usT(text, vars) : String(text).replace(/\{([a-z]+)\}/gi, (all, k) => vars?.[k] ?? all));

  function reset() {
    state.loaded = false;
    state.mine = null;
    state.partner = null;
  }

  // ---------- Come stai che conta: the answer, the line, the hint ----------

  const meId = () => w.usProfile?.id || '';
  const store = (key, value) => {
    try {
      if (value === undefined) return w.localStorage?.getItem(key) ?? null;
      w.localStorage?.setItem(key, value);
    } catch (_) { return null; }
    return null;
  };
  // The answer I sent to the state the other person shows now, if any.
  const sentToPartner = () => replyOf(state.partner);
  // The answer the other person sent to my state (personaggi.js reactionOf).
  const replyToMe = ({ now = Date.now() } = {}) => replyOf(state.mine, { now });
  const gestureLabel = (g) => (g === 'festa' ? t('Festeggia con {name}', { name: partnerName() }) : t(GESTURES[g]?.label || ''));
  // «Mandato ♡» on the Oggi row for a moment after the tap; in the sheet it stays.
  let flashUntil = 0;
  const painted = { hint: 'null', trip: false };

  function paintRespond() {
    const partner = model(state.partner);
    // Before the SQL of 27/11 (no answer columns) nothing is offered that the server would refuse.
    const g = partner && !state.noReplies ? gestureOf(partner.key) : null;
    const sent = sentToPartner();
    const button = $('usStatusRespond');
    if (button) {
      button.hidden = !g;
      if (g) {
        const done = Boolean(sent);
        button.dataset.gesture = g;
        button.setAttribute('aria-disabled', done || state.responding ? 'true' : 'false');
        button.dataset.sent = done ? 'true' : 'false';
        const label = button.querySelector('[data-status-respond-label]');
        if (label) label.textContent = done ? t('Mandato ♡') : t(GESTURES[g].label);
        button.setAttribute('aria-label', done ? t('Mandato a {name}', { name: partnerName() }) : `${gestureLabel(g)}. ${t('Lo mandi a {name}', { name: partnerName() })}`);
      }
    }
    const quick = $('usOggiStatusReply');
    if (quick) {
      const flashing = Date.now() < flashUntil;
      const show = Boolean(state.key) && !state.missing && Boolean(g) && (!sent || flashing);
      quick.hidden = !show;
      if (show) {
        quick.dataset.sent = sent ? 'true' : 'false';
        quick.textContent = sent ? t('Mandato ♡') : GESTURES[g].icon;
        quick.setAttribute('aria-label', sent ? t('Mandato a {name}', { name: partnerName() }) : `${t('Rispondi a {name}', { name: partnerName() })}: ${gestureLabel(g)}`);
        quick.setAttribute('aria-disabled', sent || state.responding ? 'true' : 'false');
      }
    }
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
    }
    paintRespond();
    if (pill) w.syncOggiRow?.();
    paintSheet();
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
  // The couple's rows (mine and the partner's, RLS). Before the SQL of 27/11
  // the answer's columns do not exist: the old read, and no answers.
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
  // «Lo segno nel calendario di Noi?»: the event editor of Noi, «In viaggio», today, all day.
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
    paintRespond();
    try {
      const { data, error } = await db.rpc('respond_member_status', { p_status_set_at: state.partner.set_at, p_gesture: g });
      if (identityKey(w.usProfile) !== key) return false;
      if (error) throw error;
      state.partner = { ...state.partner, reply_gesture: data?.gesture || g, reply_at: data?.at || new Date().toISOString() };
      flashUntil = Date.now() + 2600;
      w.setTimeout(paintRespond, 2700);
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

  // The other person answered my state: a toast once (also at launch, if not
  // seen yet) and, for three hours, a reaction on my character (personaggi.js).
  const SEEN = () => `us:status-reply:v1:${meId()}`;
  function noticeReply() {
    const reply = replyToMe();
    if (!reply || !meId()) return;
    if (store(SEEN()) === reply.at) return;
    store(SEEN(), reply.at);
    if (Date.now() - Date.parse(reply.at) > LASTS_MS) return;
    w.toast?.(t(GESTURES[reply.gesture].said(partnerName())));
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
      if (row.user_id === me) noticeReply();
      return;
    }
    refresh().catch(() => {});
  }

  // What the characters wear on their face now (personaggi.js moodOf): what is
  // known, even before the first read (a Realtime row), unlike the widget's.
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
      if (target.closest('#usOggiStatus')) { open('status'); return; }
      const sheet = root();
      if (!sheet || !sheet.contains(target)) return;
      if (target.closest('[data-status-close]')) { close(); return; }
      if (target.closest('#usStatusRespond')) { respond(target.closest('#usStatusRespond')); return; }
      if (target.closest('#usStatusTripYes')) { tripToCalendar(); return; }
      if (target.closest('#usStatusTripNo')) { close(); return; }
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

  return { ...pure, refresh, onForeground, onChange, open, close, choose, chooseForm, widgetState, faces, respond, replyToMe, oggiHint, runHint, partnerTraveling, ricordaLine, tripToCalendar };
});
