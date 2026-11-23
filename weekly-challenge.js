// La sfida della settimana (founder, 03/11/2026; SQL weekly_challenge_v1).
// One challenge a week for the couple, chosen by the server from «Come vi
// vedete», shown in Gioca › Giochi under the Domanda del giorno (board
// SfidaGioca) and on Oggi from Friday if it is not done (SfidaOggi). A photo
// closes it: the Ricordi composer saves it as a Ricordo with the challenge's
// title, then add_weekly_challenge_photo tells the server. A couple apart
// needs one photo each (SfidaDistanza): the second goes into the album of the
// first Ricordo, and the first one tells the other "manca solo la tua".
// The page never decides: points, the change, the weeks in a row and the
// closing are the server's. Realtime: two lines on the app's one channel
// (app.js startUsRealtime) call onChange.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UsWeeklyChallenge = api.create(root);
})(typeof window !== 'undefined' ? window : null, function (rootWindow) {
  'use strict';

  const ZONE = 'Europe/Rome';
  const CACHE_MS = 60 * 1000;
  // The function is not there yet (web before SQL): stop asking.
  const MISSING = new Set(['42P01', '42883', 'PGRST202', 'PGRST205']);
  const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const ERRORS = Object.freeze({
    challenge_closed: 'La settimana è finita: la foto resta nei Ricordi',
    challenge_change_used: 'Questa settimana avete già cambiato la sfida',
    challenge_has_photo: 'Con una foto già messa la sfida non si cambia',
    challenge_no_alternative: 'Per ora non c’è un’altra sfida per voi',
    challenge_photo_too_old: 'Serve una foto di questa settimana',
  });

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const formats = new Map();
  function format(key, locale, options) {
    const id = `${key}|${locale}`;
    if (!formats.has(id)) formats.set(id, new Intl.DateTimeFormat(locale, options));
    return formats.get(id);
  }
  const lang = () => rootWindow?.UsI18n?.tag || 'it-IT';
  // YYYY-MM-DD of an instant in Rome.
  function romeDay(at) {
    try { return format('day', 'en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at)); } catch (_) { return ''; }
  }
  function romeWeekday(at) {
    try { return format('wd', 'en-GB', { timeZone: ZONE, weekday: 'short' }).format(new Date(at)); } catch (_) { return ''; }
  }
  const romeTime = (at) => { try { return format('time', 'it-IT', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' }).format(new Date(at)); } catch (_) { return ''; } };
  const weekdayName = (at) => { try { return format('wdl', lang(), { timeZone: ZONE, weekday: 'long' }).format(new Date(at)); } catch (_) { return ''; } };
  const dayMonth = (at) => { try { return format('dm', lang(), { timeZone: ZONE, day: 'numeric', month: 'long' }).format(new Date(at)); } catch (_) { return ''; } };
  // Days from today (Rome) to the challenge's Sunday.
  function daysLeft(data, now) {
    const today = romeDay(now);
    if (!today || !data?.week_start) return 0;
    const sunday = Date.parse(`${data.week_start}T12:00:00Z`) + 6 * 864e5;
    return Math.max(0, Math.round((sunday - Date.parse(`${today}T12:00:00Z`)) / 864e5));
  }
  function whenLine(left) {
    if (left <= 0) return 'Scade stasera alle 23:59';
    return left === 1 ? 'Scade domenica alle 23:59 · manca 1 giorno' : `Scade domenica alle 23:59 · mancano ${left} giorni`;
  }
  function doneLine(data) {
    return `+${(Number(data.xp_awarded) || 0) + (Number(data.bonus_xp) || 0)} punti a tutti e due · salvata nei Ricordi e nel calendario`;
  }
  function streakCopy(streak, every) {
    if (!streak) return { bold: '', text: `Ogni ${every} settimane di fila, 100 punti in più.` };
    const need = every - (streak % every);
    return {
      bold: streak === 1 ? '1 settimana di fila.' : `${streak} settimane di fila.`,
      text: need === 1 ? 'Con questa, 100 punti in più.' : `Ancora ${need} per 100 punti in più.`,
    };
  }
  function photoLabel(name, photo) {
    if (!photo) return name;
    const place = photo.place_label ? ` · ${photo.place_label}` : '';
    const time = photo.created_at ? romeTime(photo.created_at) : '';
    return `${name}${place}${place && time ? `, ${time}` : ''}`;
  }

  // Pure: what the card says (boards SfidaGioca and SfidaDistanza).
  function viewModel(data, { now = Date.now(), partnerName = '' } = {}) {
    if (!data?.id) return null;
    const partner = partnerName || 'La tua persona';
    const every = Number(data.bonus_every) || 4;
    const streak = Math.max(0, Number(data.streak) || 0);
    const photos = Array.isArray(data.photos) ? data.photos : [];
    const left = daysLeft(data, now);
    const v = {
      id: data.id, title: data.title || '', shortTitle: data.short_title || data.title || '', kicker: 'LA SFIDA DELLA SETTIMANA',
      chip: `${Number(data.points) || 60} punti`, when: whenLine(left), photos,
      change: !data.completed_at && !photos.length && Number(data.changes_left) > 0 ? `Cambia · ${Number(data.changes_left)}` : null,
    };
    const lap = streak % every;
    const done = Boolean(data.completed_at);
    v.bars = Array.from({ length: every }, (_, i) => i < (done && streak && !lap ? every : lap));
    const copy = streakCopy(streak, every);
    v.streakBold = copy.bold;
    v.streakText = copy.text;
    if (data.two_places) {
      const mine = photos.find((p) => p.mine) || null;
      const theirs = photos.find((p) => !p.mine) || null;
      if (done) {
        return { ...v, state: 'apart-done', kicker: `SFIDA · ${dayMonth(data.completed_at).toUpperCase()}`, doneTitle: v.shortTitle, doneLine: doneLine(data),
          pair: [theirs, mine].filter(Boolean) };
      }
      return {
        ...v, state: 'apart', chip: 'A distanza',
        partner: theirs ? { label: photoLabel(partner, theirs), path: theirs.path || null, empty: false } : { label: mine ? `In attesa di ${partner}` : partner, path: null, empty: true },
        me: mine ? { label: photoLabel('Tu', mine), path: mine.path || null, empty: false } : { label: 'Tu', path: null, empty: true, action: 'Aggiungi la tua' },
        rule: 'Con tutte e due le foto: 60 punti. Se a domenica ce n’è una sola, la sfida si chiude lo stesso con 30.',
      };
    }
    if (done) {
      const by = photos[0];
      const day = weekdayName(data.completed_at);
      return { ...v, state: 'done', by: by && !by.mine ? `Fatta da ${partner}, ${day}` : `Fatta da te, ${day}`, doneTitle: v.shortTitle, doneLine: doneLine(data) };
    }
    return { ...v, state: 'open' };
  }

  // Pure: the Oggi card (board SfidaOggi), or null.
  function todayPriority(data, { now = Date.now(), partnerName = '' } = {}) {
    if (!data?.id || data.completed_at) return null;
    const points = Number(data.points) || 60;
    const base = { id: `challenge:${data.id}`, factKey: `challenge:${data.id}`, arrivalType: 'challenge', attention: true, action: 'challenge' };
    if (data.two_places && data.waiting_for === 'me') {
      return { ...base, category: 'waiting_for_me', title: `${partnerName || 'La tua persona'} ha messo la sua foto`, detail: `Manca solo la tua · ${points} punti`, actionLabel: 'Aggiungi' };
    }
    if (data.waiting_for === 'partner' || !['Fri', 'Sat', 'Sun'].includes(romeWeekday(now))) return null;
    const left = daysLeft(data, now);
    const detail = left <= 0 ? `Scade stasera · ${points} punti` : left === 1 ? `Manca 1 giorno · ${points} punti` : `Mancano ${left} giorni · ${points} punti`;
    return { ...base, category: 'challenge', title: data.short_title || data.title, detail, actionLabel: 'Chiudi' };
  }

  // The app's Phosphor icons (ui-foundation.css).
  const icon = (name) => `<span class="us-icon" data-us-icon="${name}" aria-hidden="true"></span>`;
  const ICON_WHEN = icon('calendar-blank');
  const ICON_CAMERA = icon('camera');
  const ICON_CHECK = icon('check');
  const img = (path, alt = '') => (path ? `<img class="us-wc-img" data-wc-path="${esc(path)}" alt="${esc(alt)}" decoding="async">` : '');
  const streakRow = (v) => `<div class="us-wc-streak"><div class="us-wc-bars" aria-hidden="true">${v.bars.map((on) => `<i${on ? ' data-on="true"' : ''}></i>`).join('')}</div><p>${v.streakBold ? `<b>${esc(v.streakBold)}</b> ` : ''}<span>${esc(v.streakText)}</span></p></div>`;

  // Pure: the section for the Gioca slot.
  function markup(v) {
    if (!v) return '';
    if (v.state === 'done') {
      return `<section class="us-wc is-done" data-wc-state="done" aria-label="${esc(v.kicker)}">
  <span class="us-wc-thumb" aria-hidden="true">${img(v.photos[0]?.path)}</span>
  <div class="us-wc-done-copy"><span class="us-wc-by">${ICON_CHECK}<span>${esc(v.by)}</span></span><b class="us-wc-done-title">${esc(v.doneTitle)}</b><small>${esc(v.doneLine)}</small></div>
</section>`;
    }
    if (v.state === 'apart-done') {
      return `<section class="us-wc is-born" data-wc-state="apart-done" aria-label="${esc(v.doneTitle)}">
  <div class="us-wc-born-pair" aria-hidden="true">${v.pair.map((p) => `<span>${img(p.path)}</span>`).join('')}</div>
  <div class="us-wc-born-copy"><span class="us-wc-kicker">${esc(v.kicker)}</span><b class="us-wc-done-title">${esc(v.doneTitle)}</b><small>${esc(v.doneLine)}</small></div>
</section>`;
    }
    const head = `<div class="us-wc-head"><span class="us-wc-kicker">${esc(v.kicker)}</span><span class="us-wc-chip${v.state === 'apart' ? ' is-apart' : ''}">${esc(v.chip)}</span></div>
  <h3 class="us-wc-title" id="usWcTitle">${esc(v.title)}</h3>`;
    const change = v.change ? `<button type="button" class="us-wc-change" data-wc-action="change">${esc(v.change)}</button>` : '';
    if (v.state === 'apart') {
      const cell = (who, c) => `<div class="us-wc-pair-cell" data-who="${who}">${c.empty
        ? (c.action ? `<button type="button" class="us-wc-pair-add" data-wc-action="mine">${ICON_CAMERA}<span>${esc(c.action)}</span></button>` : '<span class="us-wc-pair-wait" aria-hidden="true"></span>')
        : `<span class="us-wc-pair-photo">${img(c.path)}</span>`}<span class="us-wc-pair-label"><i aria-hidden="true"></i><span>${esc(c.label)}</span></span></div>`;
      return `<section class="us-wc is-apart" data-wc-state="apart" aria-labelledby="usWcTitle">
  ${head}
  <div class="us-wc-pair">${cell('partner', v.partner)}${cell('me', v.me)}</div>
  <p class="us-wc-rule">${esc(v.rule)}</p>
  <p class="us-wc-when">${ICON_WHEN}<span>${esc(v.when)}</span></p>
  ${change ? `<div class="us-wc-actions is-change">${change}</div>` : ''}
  ${streakRow(v)}
</section>`;
    }
    return `<section class="us-wc" data-wc-state="open" aria-labelledby="usWcTitle">
  ${head}
  <p class="us-wc-when">${ICON_WHEN}<span>${esc(v.when)}</span></p>
  <div class="us-wc-actions"><button type="button" class="us-wc-photo" data-wc-action="photo">${ICON_CAMERA}<span>Chiudi con una foto</span></button>${change}</div>
  ${streakRow(v)}
</section>`;
  }

  function create(w) {
    const state = { data: null, at: 0, key: '', loading: null, missing: false, busy: false, urls: new Map(), note: '' };
    // app.js's client is a global const (not on window): read it by name.
    // eslint-disable-next-line no-undef
    const db = () => w?.sb || (typeof sb !== 'undefined' ? sb : null);
    const toast = (text) => { try { (w?.toast || globalThis.toast)?.(text); } catch (_) {} };
    const profileKey = () => { const p = w?.usProfile; return p?.id && p?.couple_id ? `${p.id}:${p.couple_id}` : ''; };
    function partnerName() {
      try { return w?.usIdentity?.().partnerName || (typeof globalThis.usIdentity === 'function' ? globalThis.usIdentity().partnerName : '') || ''; } catch (_) { return ''; }
    }
    const errorText = (error) => ERRORS[String(error?.message || '').trim()] || 'Non riesco a salvare la sfida. Riprova.';
    function setState(data) {
      state.data = data || null;
      state.at = Date.now();
      state.key = profileKey();
      paint();
      return state.data;
    }

    async function load({ force = false } = {}) {
      const key = profileKey();
      const client = db();
      if (!key || !client || state.missing) return null;
      if (!force && state.key === key && state.data && Date.now() - state.at < CACHE_MS) return state.data;
      if (state.loading && state.key === key) return state.loading;
      if (state.key !== key) { state.data = null; state.key = key; }
      const task = (async () => {
        const { data, error } = await client.rpc('get_weekly_challenge');
        if (error) {
          if (MISSING.has(error.code)) state.missing = true;
          throw error;
        }
        if (profileKey() !== key) return null;
        return setState(data);
      })();
      state.loading = task;
      try { return await task; } catch (error) { console.warn('[US Sfida]', error); return state.data; } finally { if (state.loading === task) state.loading = null; }
    }

    function paint() {
      const slot = w?.document?.querySelector?.('[data-wc-slot]');
      if (!slot) return;
      const html = markup(viewModel(state.data, { partnerName: partnerName() }));
      if (slot.__usWc !== html) { slot.__usWc = html; slot.innerHTML = html; }
      slot.hidden = !html;
      for (const el of slot.querySelectorAll?.('img[data-wc-path]') || []) {
        const path = el.dataset.wcPath;
        const known = state.urls.get(path);
        if (known) { el.src = known; continue; }
        Promise.resolve(w?.usGetSignedUrl?.(path)).then((url) => { if (url) { state.urls.set(path, url); if (el.isConnected !== false) el.src = url; } }).catch(() => {});
      }
    }

    // "Chiudi con una foto": the Ricordi composer, with the challenge as its
    // source (uploadMoment then calls photoAdded). Call it from a tap.
    function startPhoto(now = Date.now()) {
      const d = state.data;
      if (!d?.id || d.completed_at) return false;
      const composer = w?.UsMomentComposer;
      if (typeof composer?.pick !== 'function') { toast('I Ricordi non sono pronti. Riprova.'); return false; }
      composer.pick({ caption: d.short_title || d.title, source: { kind: 'challenge', ref: d.id, date: romeDay(now) } });
      return true;
    }

    // announce:false (uploadMoment) keeps the line for takeNote(): the Ricordi
    // composer shows it in place of its own "Ricordo aggiunto ♡".
    async function photoAdded({ challengeId, momentId, photoId = null, announce = true } = {}) {
      const client = db();
      if (!client || !challengeId || !momentId) return null;
      const say = (text) => { if (announce) toast(text); else state.note = text; };
      const { data, error } = await client.rpc('add_weekly_challenge_photo', { target_challenge_id: challengeId, target_moment_id: momentId, target_photo_id: photoId });
      if (error) { console.warn('[US Sfida] foto', error); say(errorText(error)); return null; }
      setState(data);
      if (data?.completed_at) {
        say(`Sfida fatta: +${(Number(data.xp_awarded) || 0) + (Number(data.bonus_xp) || 0)} punti a tutti e due ♡`);
        try { w?.UsFeedback?.success?.(); } catch (_) {}
        try { w?.USProgression?.hydrate?.({ force: true }); } catch (_) {}
      } else if (data?.waiting_for === 'partner') {
        say(`Foto messa: ora manca quella di ${partnerName() || 'La tua persona'}`);
        Promise.resolve(w?.sendWebPushEvent?.('challenge_photo', data.id)).catch(() => {});
      }
      return data;
    }
    function takeNote() { const note = state.note || ''; state.note = ''; return note; }

    // A couple apart, the other one already sent theirs: mine joins the album
    // of their Ricordo, so the memory has the two photos side by side.
    async function addMine(file) {
      const d = state.data;
      const target = (d?.photos || []).find((p) => !p.mine);
      if (!d?.id || !file || state.busy) return null;
      if (!target) { startPhoto(); return null; }
      if (!TYPES.includes(file.type)) { toast('Per ora usa JPG, PNG o WebP'); return null; }
      state.busy = true;
      try {
        const ok = await w?.UsMomentAlbums?.uploadPhoto?.(target.moment_id, file);
        if (ok !== true) { toast('Non riesco ad aggiungere la foto'); return null; }
        const { data: row } = await db().from('moment_photos').select('id').eq('moment_id', target.moment_id).eq('created_by', w.usProfile.id)
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        return await photoAdded({ challengeId: d.id, momentId: target.moment_id, photoId: row?.id || null });
      } finally { state.busy = false; }
    }

    async function change() {
      const d = state.data;
      const client = db();
      if (!d?.id || !client || state.busy) return null;
      const ok = await (w?.UsUiFoundation?.confirm?.({ title: 'Cambiare la sfida?', body: 'Potete cambiarla una volta a settimana. Ne sceglie un’altra US.', confirmLabel: 'Cambia' }) ?? true);
      if (!ok) return null;
      state.busy = true;
      try {
        const { data, error } = await client.rpc('change_weekly_challenge', { target_challenge_id: d.id });
        if (error) { toast(errorText(error)); return null; }
        return setState(data);
      } finally { state.busy = false; }
    }

    let picker = null;
    function pickMine() {
      const doc = w?.document;
      if (!doc) return;
      if (!picker) {
        picker = doc.createElement('input');
        picker.type = 'file';
        picker.accept = TYPES.join(',');
        picker.hidden = true;
        picker.addEventListener('change', () => { const file = picker.files?.[0]; picker.value = ''; if (file) addMine(file); });
        doc.body.appendChild(picker);
      }
      picker.click();
    }

    // From Oggi: Gioca, with the card in view.
    function open() {
      w?.openQuizHub?.({ nav: true });
      setTimeout(() => {
        const card = w?.document?.querySelector?.('[data-wc-slot] .us-wc');
        card?.scrollIntoView?.({ block: 'center', behavior: w?.UsUiFoundation?.isReducedMotion?.() ? 'auto' : 'smooth' });
        card?.querySelector?.('[data-wc-action]')?.focus?.({ preventScroll: true });
      }, 180);
    }

    async function todayPriorityNow() {
      await load();
      return todayPriority(state.data, { partnerName: partnerName() });
    }

    function onChange() {
      marks.at = 0;
      load({ force: true }).then(() => { try { w?.UsTodayPriority?.refresh?.(); } catch (_) {} });
      markRicordi();
    }

    // The «Sfida» sign on the Ricordi a challenge photo went into.
    const marks = { at: 0, key: '', ids: null, loading: null };
    async function challengeMoments() {
      const key = profileKey();
      const client = db();
      if (!key || !client?.from || state.missing) return null;
      if (marks.key === key && marks.ids && Date.now() - marks.at < CACHE_MS) return marks.ids;
      if (marks.loading) return marks.loading;
      marks.loading = (async () => {
        const { data, error } = await client.from('couple_weekly_challenge_photos').select('moment_id').eq('couple_id', w.usProfile.couple_id);
        if (error) { if (MISSING.has(error.code)) state.missing = true; return marks.ids; }
        marks.key = key; marks.at = Date.now(); marks.ids = new Set((data || []).map((r) => r.moment_id));
        return marks.ids;
      })().finally(() => { marks.loading = null; });
      return marks.loading;
    }
    async function markRicordi() {
      const doc = w?.document;
      const cards = doc?.querySelectorAll?.('#momentsGrid .moment-card[data-moment-id]') || [];
      if (!cards.length) return;
      const ids = await challengeMoments();
      if (!ids) return;
      for (const card of cards) {
        const on = ids.has(card.dataset.momentId);
        let mark = card.querySelector(':scope > .us-wc-mark');
        if (on && !mark) { mark = doc.createElement('span'); mark.className = 'us-wc-mark'; mark.textContent = 'Sfida'; card.appendChild(mark); }
        else if (!on && mark) mark.remove();
      }
    }
    let markTimer = 0;
    function watchRicordi() {
      const grid = w?.document?.getElementById?.('momentsGrid');
      if (!grid || typeof w.MutationObserver !== 'function') return false;
      new w.MutationObserver(() => { clearTimeout(markTimer); markTimer = setTimeout(markRicordi, 200); }).observe(grid, { childList: true });
      markRicordi();
      return true;
    }

    function bind() {
      const doc = w?.document;
      if (!doc?.addEventListener) return;
      doc.addEventListener('click', (event) => {
        const control = event.target?.closest?.('[data-wc-slot] [data-wc-action]');
        if (!control) return;
        const action = control.dataset.wcAction;
        if (action === 'photo') startPhoto();
        if (action === 'mine') pickMine();
        if (action === 'change') change();
      });
      doc.addEventListener('visibilitychange', () => { if (!doc.hidden && doc.querySelector?.('#quiz.active')) load(); });
      const start = () => { if (!watchRicordi()) setTimeout(start, 1000); };
      if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, { once: true }); else start();
    }
    if (w?.document) bind();

    return Object.freeze({
      load, paint: () => { paint(); load(); }, setState, startPhoto, photoAdded, takeNote, addMine, change, open, onChange,
      todayPriority: todayPriorityNow, state: () => state.data, markRicordi,
    });
  }

  return Object.freeze({ viewModel, todayPriority, markup, create, romeDay });
});
