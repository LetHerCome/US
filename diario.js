/* Il diario, ma pulito (founder, 15/11/2026; docs/missions/diario-pulito.md).
   Paints the page of today and «Voi due» from the authorities that already
   exist: the photo of the day (app.js UsOggiPhoto), the question of today
   (window.todayQuestion / todayState, app.js), Sintonia (progression.js,
   bondLevelInfo), the gentle streak (cosa-di-oggi.js) and the last points
   (app.js UsResonance). It owns no data and writes nothing to the server.
   The sentence of the day is built from your own facts with templates we
   wrote: no AI and never a comparison of who does less. */
(function () {
  'use strict';
  const w = typeof window !== 'undefined' ? window : globalThis;
  const d = w.document;
  if (!d) return;
  const $ = (id) => d.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const locale = () => w.UsI18n?.tag || 'it-IT';
  const reduced = () => {
    try { return Boolean(w.UsUiFoundation?.isReducedMotion?.()) || Boolean(w.matchMedia?.('(prefers-reduced-motion: reduce)').matches); }
    catch (_) { return false; }
  };
  const identity = () => {
    try { return (typeof w.usIdentity === 'function' ? w.usIdentity() : null) || {}; } catch (_) { return {}; }
  };
  const partnerName = () => identity().partnerName || 'la tua persona';
  // Restart a CSS animation on purpose (one class, once).
  function play(el, cls, ms) {
    if (!el || reduced()) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    clearTimeout(el.__dyTimers?.[cls]);
    el.__dyTimers = { ...(el.__dyTimers || {}), [cls]: setTimeout(() => el.classList.remove(cls), ms) };
  }

  // ---------------------------------------------------------------- the two characters
  // A ball for whoever created the couple (role francesco, --us-rosa), a
  // square for whoever joined (role beatrice, --us-lilla). Drawn here so they
  // take the person's colour and can be animated; the same shapes as the studio.
  const ell = (x, y, rx, ry) => `M${x - rx} ${y} a${rx} ${ry} 0 1 0 ${2 * rx} 0 a${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z`;
  const SHAPES = Object.freeze({
    palla: { body: 'M12 60 a38 36 0 1 0 76 0 a38 36 0 1 0 -76 0 Z', ex: [40, 60], ey: 58, feet: [37, 63] },
    quadrato: { body: 'M36 24 H64 Q86 24 86 46 V72 Q86 94 64 94 H36 Q14 94 14 72 V46 Q14 24 36 24 Z', ex: [40, 60], ey: 56, feet: [36, 64] },
  });
  const INK = '#14120E';
  function character(role, o = {}) {
    const shape = role === 'beatrice' ? 'quadrato' : 'palla';
    const color = role === 'beatrice' ? 'var(--us-lilla)' : 'var(--us-rosa)';
    const s = SHAPES[shape], size = o.size || 56, dx = o.dx || 0, [a, b] = s.ex, y = s.ey, wink = o.mood === 'occhiolino';
    const open = wink ? [a] : [a, b];
    const label = o.label ? ` role="img" aria-label="${esc(o.label)}"` : ' aria-hidden="true"';
    return `<svg class="dy-char" viewBox="-4 6 108 100" width="${size}" height="${Math.round(size * 100 / 108)}"${label} focusable="false">
      <path d="${ell(s.feet[0], 97, 9, 5)} ${ell(s.feet[1], 97, 9, 5)}" style="fill:${color}" stroke="${INK}" stroke-width="3"/>
      <path d="${s.body}" style="fill:${color}" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>
      <path d="${ell(32, 40, 8, 5)}" fill="rgba(255,255,255,.55)"/>
      <path d="${ell(a - 8, y + 9, 5, 3)} ${ell(b + 8, y + 9, 5, 3)}" fill="rgba(211,64,42,.3)"/>
      <g class="dy-eyes"><path d="${open.map((x) => ell(x + dx, y, 4.4, 5.8)).join(' ')}" fill="${INK}"/><path d="${open.map((x) => ell(x + dx + 1.5, y - 2.3, 1.5, 1.5)).join(' ')}" fill="#fff"/></g>
      ${wink ? `<path d="M${b - 5} ${y + 1} Q${b} ${y - 4} ${b + 5} ${y + 1}" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>` : ''}
      <path d="M46 ${y + 10} Q50 ${y + 14.5} 54 ${y + 10}" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
      ${o.acc === 'occhiali' ? `<path d="${ell(a, y, 9.5, 8.5)} ${ell(b, y, 9.5, 8.5)} M${a + 9.5} ${y} H${b - 9.5}" fill="rgba(255,255,255,.28)" stroke="${INK}" stroke-width="2.6"/>` : ''}
    </svg>`;
  }
  // Both phones show the same two, in the same order: the ball, then the square.
  function couple() {
    const me = w.usProfile || {};
    const myRole = me.role === 'beatrice' ? 'beatrice' : 'francesco';
    const id = identity();
    const names = { [myRole]: id.ownName || 'Tu', [myRole === 'beatrice' ? 'francesco' : 'beatrice']: id.partnerName || 'La tua persona' };
    return { myRole, partnerRole: myRole === 'beatrice' ? 'francesco' : 'beatrice', names };
  }
  let winkUntil = 0;
  function paintDuo({ hop = false } = {}) {
    const root = $('dyDuo');
    if (!root) return;
    if (!w.usProfile?.couple_id) { root.innerHTML = ''; return; }
    const c = couple();
    const wink = Date.now() < winkUntil;
    // The one who just received my Ti penso winks (the partner's character).
    const ball = character('francesco', { size: 50, dx: 2, mood: wink && c.partnerRole === 'francesco' ? 'occhiolino' : '' });
    const square = character('beatrice', { size: 54, dx: -2, mood: wink && c.partnerRole === 'beatrice' ? 'occhiolino' : '' });
    root.innerHTML = `<span class="dy-stk" data-dy-char="francesco">${ball}</span><span class="dy-stk" data-dy-char="beatrice" style="animation-delay:.06s">${square}</span>`;
    root.setAttribute('aria-label', `Voi due: ${c.names.francesco} e ${c.names.beatrice}. La vostra Sintonia`);
    if (hop) hopDuo();
  }
  function hopDuo() {
    $('dyDuo')?.querySelectorAll('.dy-stk').forEach((el) => play(el, 'dy-hop', 600));
  }

  // ---------------------------------------------------------------- the title
  function romeParts(now = new Date()) {
    try {
      const f = new Intl.DateTimeFormat(locale(), { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long' });
      const parts = Object.fromEntries(f.formatToParts(now).map((p) => [p.type, p.value]));
      return { weekday: parts.weekday || '', day: `${parts.day || ''} ${parts.month || ''}`.trim() };
    } catch (_) { return { weekday: '', day: '' }; }
  }
  const cap = (s) => (s ? s.charAt(0).toLocaleUpperCase(locale()) + s.slice(1) : '');
  function todayISO() {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date()); } catch (_) { return new Date().toISOString().slice(0, 10); }
  }
  function startedOn() {
    try { return w.UsCoupleContext?.snapshot?.()?.couple?.started_on || null; } catch (_) { return null; }
  }
  const dayNumber = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : NaN; };
  function pageNumber() {
    const n = dayNumber(todayISO()) - dayNumber(startedOn());
    return Number.isFinite(n) && n >= 0 ? n + 1 : 0;
  }
  function paintTitle() {
    const p = romeParts();
    const wd = $('dyWeekday'), day = $('dyDay');
    if (wd) wd.textContent = p.weekday ? `${cap(p.weekday)}, ` : '';
    if (day) day.textContent = p.day;
    const n = pageNumber(), line = $('dyPageLine');
    if (line) {
      line.hidden = !n;
      if (n) $('dyPageN').textContent = String(n);
    }
  }

  // ---------------------------------------------------------------- the sentence of the day
  // Templates written by us, filled with your facts. Each has the colour of
  // what it talks about: honey for dates, sky for the distance, the other
  // person's soft colour for what they did, white for the photo itself.
  function monthsBetween(fromISO, toISO) {
    const f = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fromISO || '')), t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(toISO || ''));
    if (!f || !t) return null;
    let m = (+t[1] - +f[1]) * 12 + (+t[2] - +f[2]);
    if (+t[3] < +f[3]) m -= 1;
    return m;
  }
  const NUM = ['', 'Un', 'Due', 'Tre', 'Quattro', 'Cinque', 'Sei', 'Sette', 'Otto', 'Nove', 'Dieci', 'Undici', 'Dodici'];
  function yearsWord(n) { return n === 1 ? 'Un anno' : `${NUM[n] || n} anni`; }
  function photoSentences(meta, today) {
    const out = [];
    const date = String(meta?.date || '');
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!m) return out;
    const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
    if (t && m[2] === t[2] && m[3] === t[3] && +t[1] > +m[1]) {
      out.push({ text: `${yearsWord(+t[1] - +m[1])} fa, proprio oggi`, tone: 'miele' });
      return out;
    }
    const days = dayNumber(today) - dayNumber(date);
    if (days === 0) out.push({ text: 'Questa foto è di oggi', tone: 'white' });
    else if (days === 1) out.push({ text: 'Questa foto è di ieri', tone: 'white' });
    else if (days > 1 && days < 31) out.push({ text: `Questa foto è di ${days} giorni fa`, tone: 'white' });
    else if (days >= 31) {
      const months = monthsBetween(date, today);
      if (months >= 12) {
        const y = Math.floor(months / 12);
        out.push({ text: `Questa foto ha ${y === 1 ? 'un anno' : `${y} anni`}`, tone: 'white' });
      } else if (months >= 1) out.push({ text: `Questa foto ha ${months === 1 ? 'un mese' : `${months} mesi`}`, tone: 'white' });
    }
    return out;
  }
  function distanceSentence(next) {
    const pill = $('distanceWidget');
    const value = $('distanceValue')?.textContent?.trim() || '';
    if (!pill || pill.hidden || !/\d/.test(value) || !/km/i.test(value)) return null;
    return { text: next ? `${value} · ${next.title} ${next.when.toLocaleLowerCase(locale())}` : `${value} tra voi`, tone: 'cielo' };
  }
  function nextModel() {
    const button = $('usOggiNext');
    if (!button || button.hidden) return null;
    const when = $('usOggiNextWhen')?.textContent?.trim() || '';
    const title = $('usOggiNextTitle')?.textContent?.trim() || '';
    return when && title ? { when, title } : null;
  }
  function togetherSentence(today) {
    const s = startedOn();
    if (!s) return null;
    // A month together in the next 7 days.
    for (let k = 0; k <= 7; k += 1) {
      const at = new Date((dayNumber(today) + k) * 86400000).toISOString().slice(0, 10);
      const months = monthsBetween(s, at);
      if (months > 0 && at.slice(8) === String(s).slice(8)) {
        const what = months % 12 === 0 ? (months === 12 ? 'un anno' : `${months / 12} anni`) : (months === 1 ? 'un mese' : `${months} mesi`);
        const when = k === 0 ? 'Oggi fate' : k === 1 ? 'Domani fate' : `Tra ${k} giorni fate`;
        return { text: `${when} ${what} insieme`, tone: 'miele' };
      }
    }
    const n = pageNumber();
    const next100 = Math.ceil(n / 100) * 100;
    if (n > 0 && next100 - n <= 7 && next100 - n >= 0) return { text: next100 === n ? `Oggi sono ${n} giorni insieme` : `Tra ${next100 - n} giorni sono ${next100}`, tone: 'miele' };
    return null;
  }
  function sentences(meta) {
    const today = todayISO();
    const next = nextModel();
    const list = [];
    const together = togetherSentence(today);
    if (together) list.push(together);
    const distance = distanceSentence(next);
    if (distance) list.push(distance);
    else if (next) list.push({ text: `${next.when}: ${next.title}`, tone: 'miele' });
    list.push(...photoSentences(meta, today));
    const author = meta?.author;
    if (author && author !== w.usProfile?.id && list.length < 2) list.push({ text: `Questa l’ha scelta ${partnerName()} per i Ricordi`, tone: 'partner' });
    return list;
  }
  const TONE = { miele: 'var(--us-miele)', cielo: 'var(--us-cielo)', white: '#FFFFFF', partner: 'var(--us-partner-soft)' };

  // ---------------------------------------------------------------- the photo of the day
  let shownPath = null, photoTurn = 0, loadedFor = null;
  function paintPhoto({ fresh = false } = {}) {
    const button = $('dyPhoto'), img = $('dyPhotoImg'), empty = $('dyPhotoEmpty');
    if (!button || !img) return;
    const now = w.UsOggiPhoto?.current?.() || { url: '', path: '', meta: null };
    const has = Boolean(now.url);
    // Painted from the boot cache: read Ricordi once for its caption and author.
    if (has && !now.meta && loadedFor !== now.path) { loadedFor = now.path; w.UsOggiPhoto?.load?.(); }
    button.hidden = !has && Boolean(w.usProfile);
    button.classList.toggle('has-photo', has);
    if (empty) empty.hidden = has || !w.usProfile;
    if (has && img.getAttribute('src') !== now.url) img.src = now.url;
    img.hidden = !has;
    const model = now.meta && w.UsOggiCaption?.viewModel ? w.UsOggiCaption.viewModel(now.meta) : null;
    const capEl = $('dyPhotoCap'), who = $('dyPhotoWho');
    if (capEl) capEl.textContent = model?.text || '';
    if (who) {
      const mine = model?.who === 'tu', theirs = model?.who === 'partner';
      who.hidden = !(mine || theirs);
      who.style.setProperty('--who', mine ? 'var(--us-tu)' : 'var(--us-partner)');
    }
    button.setAttribute('aria-label', `La foto del giorno${model?.text ? `: ${model.text}` : ''}${model?.meta ? `, ${model.meta}` : ''}. Tocca per la prossima`);
    const changed = has && now.path !== shownPath;
    if (changed) { if (shownPath !== null) photoTurn += 1; shownPath = now.path; }
    if ((fresh || changed) && has && shownPath !== null) play(button, 'is-fresh', 520);
    paintFrase(now.meta, { fresh: fresh || changed });
  }
  function paintFrase(meta, { fresh = false } = {}) {
    const el = $('dyFrase');
    if (!el) return;
    const list = sentences(meta);
    const pick = list.length ? list[photoTurn % list.length] : null;
    if (!pick || !$('dyPhoto')?.classList.contains('has-photo')) { el.hidden = true; el.textContent = ''; return; }
    const same = el.textContent === pick.text && !el.hidden;
    el.textContent = pick.text;
    el.style.setProperty('--frase', TONE[pick.tone] || '#fff');
    el.hidden = false;
    if (fresh && !same) play(el, 'is-fresh', 700);
  }

  // ---------------------------------------------------------------- the question of today
  let lastQuestion = { id: null, mine: null, both: false, unread: false };
  // Same rule as app.js dailyRevealAccess: the answers stay closed on Oggi
  // until the sheet has shown them (or the notice was put away).
  function revealUnread(source, question) {
    const st = source?.state || w.todayState;
    if (!st?.both_answered) return false;
    const meta = source?.reveal ?? w.todayRevealMeta;
    const ok = meta && meta.question_id === question?.id && (meta.my_reveal_seen_at || meta.my_notice_dismissed_at);
    return !ok;
  }
  const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';
  function paintQuestion(source) {
    const card = $('dyQuestion');
    if (!card) return;
    const q = source?.question || w.todayQuestion;
    const st = source?.state || w.todayState;
    const partner = source?.partnerName || partnerName();
    if (source?.status === 'error') {
      card.innerHTML = `<span class="dy-q-kicker">La domanda di oggi</span><span class="dy-q-text">La domanda di oggi non è arrivata.</span><div class="dy-q-foot"><span class="dy-q-hint">Riprova tra un momento.</span><button type="button" class="dy-btn dy-btn-l" data-dy="answer">Riprova</button></div>`;
      card.hidden = false;
      return;
    }
    if (!q?.id || !q.question || !st) { card.hidden = true; return; }
    const mine = st.my_answer != null ? String(st.my_answer) : null;
    const both = Boolean(st.both_answered);
    const unread = both && revealUnread(source, q);
    const theirs = both && !unread && typeof st.partner_answer === 'string' ? st.partner_answer : null;
    const mineHl = (text) => `<span><span class="dy-hl" style="--c:var(--us-tu-soft)" translate="no">${esc(text)}</span></span>`;
    // The other person's answer exists but is not readable: a blurred line, never their words.
    const ghost = `<span class="dy-q-blur" aria-hidden="true"><span class="dy-hl" style="--c:var(--us-partner-soft)">quando mi hai chiamato solo per dirmi buonanotte</span></span>`;
    const was = lastQuestion;
    const justRevealed = theirs !== null && was.id === q.id && (was.unread || !was.both || was.mine === null);
    let answers = '', foot = '';
    if (mine === null) {
      if (st.partner_has_answer) answers = `<div class="dy-q-answers">${ghost}</div>`;
      foot = `<div class="dy-q-foot"><span class="dy-q-hint">${esc(st.partner_has_answer ? `La risposta di ${partner} si apre quando rispondi anche tu` : 'Una domanda, due risposte: si aprono insieme')}</span><button type="button" class="dy-btn dy-btn-l" data-dy="answer">Rispondi ${ARROW}</button></div>`;
    } else if (!both) {
      answers = `<div class="dy-q-answers">${mineHl(mine)}</div>`;
      foot = `<div class="dy-q-foot"><span class="dy-q-hint">${esc(`Aspettiamo ${partner}`)}</span><button type="button" class="dy-btn dy-btn-m dy-btn-ghost" data-dy="answer">Modifica</button></div>`;
    } else if (unread) {
      answers = `<div class="dy-q-answers">${mineHl(mine)}${ghost}</div>`;
      foot = `<div class="dy-q-foot"><span class="dy-q-hint">${esc(`Anche ${partner} ha risposto`)}</span><button type="button" class="dy-btn dy-btn-l" data-dy="answer">Leggi ${ARROW}</button></div>`;
    } else {
      answers = `<div class="dy-q-answers">${mineHl(mine)}<span class="${justRevealed && !reduced() ? 'dy-q-unblur' : ''}"><span class="dy-hl" style="--c:var(--us-partner-soft)" translate="no">${esc(theirs || '')}</span></span></div>`;
    }
    const html = `<span class="dy-q-kicker">La domanda di oggi</span><span class="dy-q-text">${esc(q.question)}</span>${answers}${foot}`;
    if (card.__dyHtml !== html || card.hidden) { card.innerHTML = html; card.__dyHtml = html; }
    card.hidden = false;
    lastQuestion = { id: q.id, mine, both, unread };
    // The points go to you two: +10 Sintonia rises towards the characters
    // (private.progression_daily_trigger awards 10 when both answered).
    if (justRevealed) {
      if (!reduced()) {
        const plus = d.createElement('span');
        plus.className = 'dy-plus';
        plus.setAttribute('aria-hidden', 'true');
        plus.textContent = '+10 Sintonia';
        card.appendChild(plus);
        setTimeout(() => plus.remove(), 1800);
      }
      hopDuo();
    }
  }

  // ---------------------------------------------------------------- Ti penso
  const HEART = '<svg viewBox="0 0 256 256" aria-hidden="true" focusable="false"><path fill="#FF5477" d="M240,102c0,70-103.79,126.66-108.21,129a8,8,0,0,1-7.58,0C119.79,228.66,16,172,16,102A62.07,62.07,0,0,1,78,40c20.65,0,38.73,8.88,50,23.89C139.27,48.88,157.35,40,178,40A62.07,62.07,0,0,1,240,102Z"/></svg>';
  let toastTimer = 0;
  function notice(html) {
    const el = $('dyToast');
    if (!el) return;
    el.hidden = true;
    void el.offsetWidth;
    el.innerHTML = html;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2050);
  }
  // Returns true when Oggi is on screen and told it (app.js skips its own toast).
  function thinkSent({ name = '', duplicate = false } = {}) {
    if (!$('home')?.classList.contains('active') || !$('dyOggi')) return false;
    const btn = $('thinkButton');
    if (duplicate) { notice(`${HEART}<span>Già inviato</span>`); return true; }
    play(btn, 'dy-pop', 480);
    const fly = $('dyThinkFly');
    if (fly && !reduced()) {
      fly.innerHTML = [[6, 0], [18, 0.1], [28, 0.18]].map(([x, delay]) => `<i style="left:${x}px;animation-delay:${delay}s">${HEART}</i>`).join('');
      setTimeout(() => { fly.innerHTML = ''; }, 1400);
    }
    notice(`${HEART}<span>${esc(`Ti penso inviato a ${name || partnerName()}`)}</span>`);
    winkUntil = Date.now() + 1200;
    paintDuo({ hop: true });
    setTimeout(() => paintDuo(), 1250);
    return true;
  }

  // ---------------------------------------------------------------- Voi due (Sintonia)
  // Founder, 15/11/2026: the rewards go to the characters. Phase 1 shows the
  // next accessory as a preview; the server catalogue does not change.
  const ACCESSORIES = Object.freeze(['gli occhiali', 'il cappello', 'le cuffie', 'il fiocco', 'la corona']);
  function levelOf(total) {
    if (typeof w.bondLevelInfo === 'function') return w.bondLevelInfo(total);
    return { level: 1, current: 0, needed: 200, progress: 0 };
  }
  const daysAgo = (at) => {
    const t = Date.parse(at);
    if (!Number.isFinite(t)) return '';
    const days = Math.round((dayNumber(todayISO()) * 86400000 - new Date(new Date(t).toISOString().slice(0, 10)).getTime()) / 86400000);
    if (days <= 0) return 'oggi';
    if (days === 1) return 'ieri';
    return w.UsResonance?.date?.(at) || '';
  };
  function voiDueMarkup() {
    const st = w.USProgression?.getState?.() || null;
    const total = Number(st?.total_xp) || 0;
    const info = levelOf(total);
    const left = Math.max(0, (Number(info.needed) || 0) - (Number(info.current) || 0));
    const pct = Math.max(0, Math.min(100, Number(info.progress) || 0));
    const streak = Math.max(0, Number(w.UsCosaDiOggi?.state?.streak) || Number(st?.rhythm_days) || 0);
    const todayOn = Boolean(w.UsCosaDiOggi?.state?.today?.counted ?? st?.rhythm_today);
    const filled = Math.min(7, streak);
    const lastOn = todayOn ? 6 : 5;
    const squares = Array.from({ length: 7 }, (_, i) => {
      const on = i <= lastOn && i > lastOn - filled;
      return `<i class="${on ? 'on' : ''}${i === 6 && !todayOn ? ' today' : ''}"></i>`;
    }).join('');
    const nextLevel = info.level + 1;
    const acc = ACCESSORIES[(nextLevel - 2 + ACCESSORIES.length * 10) % ACCESSORIES.length];
    const c = couple();
    const entries = (w.UsResonance?.entries?.() || []).slice(0, 3);
    const points = entries.length
      ? entries.map((e) => {
        const what = w.UsResonance?.what?.(e) || { title: '', detail: '' };
        const label = e.kind === 'milestone' ? what.title : (what.detail || what.title);
        return `<div class="dy-point"><b>+${Math.max(0, Number(e.xp) || 0)}</b><span${what.own ? ' translate="no"' : ''}>${esc(label)}</span><small>${esc(daysAgo(e.at))}</small></div>`;
      }).join('')
      : '<div class="dy-points-empty">Le sfide, gli eventi vissuti e i mesiversari arrivano qui.</div>';
    const streakWord = streak === 1 ? '1 giorno di fila' : `${streak} giorni di fila`;
    return `<div class="dy-scrim" data-dy="close"></div>
      <div class="dy-sheet" role="dialog" aria-modal="true" aria-labelledby="dyVoiDueTitle">
        <span class="dy-grab" aria-hidden="true"></span>
        <div class="dy-sheet-head"><h2 class="dy-sheet-title" id="dyVoiDueTitle">Voi <em>due</em></h2><button type="button" class="dy-ib dy-close" data-dy="close" aria-label="Chiudi"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
        <div class="dy-venn"><svg viewBox="0 0 260 118" aria-hidden="true" focusable="false"><circle class="dy-venn-a" cx="100" cy="59" r="52"/><circle class="dy-venn-b" cx="160" cy="59" r="52"/></svg><span class="dy-venn-level">Livello ${esc(info.level)}</span></div>
        <div class="dy-meter-head"><span>Sintonia</span><span>${esc(left === 1 ? `1 punto al livello ${nextLevel}` : `${left} punti al livello ${nextLevel}`)}</span></div>
        <div class="dy-meter" role="progressbar" aria-label="Sintonia verso il livello ${nextLevel}" aria-valuemin="0" aria-valuemax="${esc(info.needed)}" aria-valuenow="${esc(info.current)}"><i style="width:${pct}%"></i></div>
        <div class="dy-streak"><span class="dy-streak-copy"><b>${esc(streakWord)}</b><span>Basta una cosa al giorno, insieme</span></span><span class="dy-streak-days" aria-hidden="true">${squares}</span></div>
        <div class="dy-next"><span class="dy-stk">${character(c.myRole, { size: 46, acc: 'occhiali' })}</span><span class="dy-next-copy"><b>${esc(`Al livello ${nextLevel}: ${acc}`)}</b><span>I premi sono per i personaggi, il cuore e la copertina dell’app</span></span></div>
        <div class="dy-points-title">Gli ultimi punti</div>
        ${points}
        <button type="button" class="dy-btn dy-btn-m dy-btn-ghost dy-sheet-more" data-dy="rewards">I premi che avete</button>
      </div>`;
  }
  let opener = null;
  function openVoiDue() {
    const over = $('dyVoiDue');
    if (!over) return;
    opener = d.activeElement;
    over.classList.remove('is-closing');
    over.innerHTML = voiDueMarkup();
    over.hidden = false;
    d.body.classList.add('dy-sheet-open');
    over.querySelector('.dy-close')?.focus?.({ preventScroll: true });
    // Fresh points and streak, then paint again in place (without the entrance).
    Promise.allSettled([w.USProgression?.hydrate?.({ showUnlocks: false }), w.UsResonance?.hydrate?.(), w.UsCosaDiOggi?.refresh?.()]).then(() => paintVoiDue());
    try { w.history?.pushState?.({ ...(w.history.state || {}), usDiarioSheet: true }, ''); } catch (_) { /* no history */ }
  }
  function paintVoiDue() {
    const over = $('dyVoiDue');
    if (!over || over.hidden || over.classList.contains('is-closing')) return;
    const sheet = over.querySelector('.dy-sheet');
    const scroll = sheet?.scrollTop || 0;
    const tmp = d.createElement('div');
    tmp.innerHTML = voiDueMarkup();
    const next = tmp.querySelector('.dy-sheet');
    if (!sheet || !next) return;
    // The second paint keeps everything still: no entrance, same scroll.
    next.style.animation = 'none';
    next.querySelectorAll('.dy-venn circle,.dy-meter i').forEach((el) => { el.style.animation = 'none'; });
    sheet.replaceWith(next);
    next.scrollTop = scroll;
  }
  function closeVoiDue({ fromBack = false } = {}) {
    const over = $('dyVoiDue');
    if (!over || over.hidden) return false;
    const done = () => { over.hidden = true; over.innerHTML = ''; over.classList.remove('is-closing'); d.body.classList.remove('dy-sheet-open'); opener?.focus?.({ preventScroll: true }); };
    if (reduced()) done();
    else { over.classList.add('is-closing'); setTimeout(done, 240); }
    if (!fromBack) { try { if (w.history?.state?.usDiarioSheet) w.history.back(); } catch (_) { /* no history */ } }
    return true;
  }


  // ---------------------------------------------------------------- Ricordi: il vostro diario
  // Founder, 15/11/2026: Ricordi is the diary of your days. A day is its
  // number in italics and what it holds: the photos you added (rounded, with
  // the dot of who added it and the caption in your hand) and the question of
  // the day you both answered. Short quiet stretches between two days are
  // said once («Tre giorni tranquilli»). The filters dim the days of the other.
  let diary = null, diaryWho = 'tutti';
  const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  const QUIET = ['', '', 'Due giorni tranquilli', 'Tre giorni tranquilli', 'Quattro giorni tranquilli', 'Cinque giorni tranquilli', 'Sei giorni tranquilli'];
  const isoDay = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : '');
  const wdShort = (iso) => { try { return new Date(`${iso}T12:00:00`).toLocaleDateString(locale(), { weekday: 'short' }).replace('.', ''); } catch (_) { return ''; } };
  function paintChips() {
    const name = identity().partnerName || '';
    d.querySelectorAll('[data-dy-partner-name]').forEach((el) => { el.textContent = name || 'chi ami'; });
    d.querySelectorAll('#dyRicordiChips [data-dy-who]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.dyWho === diaryWho)));
    $('dyDiary')?.setAttribute('data-who', diaryWho);
  }
  function photoMarkup(row, url, big) {
    const me = w.usProfile?.id;
    const who = row.created_by ? (row.created_by === me ? 'var(--us-tu)' : 'var(--us-partner)') : '';
    return `<button type="button" class="dy-pic${big ? ' is-big' : ''}" data-dy-moment="${esc(row.id)}" aria-label="${esc(row.caption || 'Un ricordo')}. Apri"><img src="${esc(url)}" alt="" loading="lazy" decoding="async">${who ? `<span class="dy-pic-who" style="--who:${who}" aria-hidden="true"></span>` : ''}</button>`;
  }
  function questionMarkup(k) {
    const line = (role, text) => (text ? `<span class="dy-dq-a"><span class="dy-hl" style="--c:var(--us-${role === 'francesco' ? 'rosa' : 'lilla'}-soft)" translate="no">${esc(text)}</span></span>` : '');
    return `<div class="dy-dq"><span class="dy-dq-q">${esc(k.question_text || '')}</span>${line('francesco', k.francesco_answer)}${line('beatrice', k.beatrice_answer)}</div>`;
  }
  function paintDiary(data) {
    if (data) diary = data;
    const root = $('dyDiary');
    if (!root || !diary) return;
    paintChips();
    const me = w.usProfile?.id;
    const urls = diary.urls instanceof Map ? diary.urls : new Map();
    const preview = (row) => {
      try { return (typeof w.ricordiPreviewUrl === 'function' ? w.ricordiPreviewUrl(row, urls) : '') || urls.get(row.thumbnail_path) || urls.get(row.storage_path) || ''; }
      catch (_) { return urls.get(row.storage_path) || ''; }
    };
    const days = new Map();
    const day = (iso) => { if (!days.has(iso)) days.set(iso, { iso, photos: [], kept: [] }); return days.get(iso); };
    for (const item of diary.timeline || []) {
      const row = item.moment;
      const iso = isoDay(item.date || row?.moment_date);
      if (row && iso && preview(row)) day(iso).photos.push(row);
    }
    for (const k of diary.kept || []) {
      const iso = isoDay(k.question_date);
      if (iso && (k.francesco_answer || k.beatrice_answer)) day(iso).kept.push(k);
    }
    const list = [...days.values()].sort((a, b) => b.iso.localeCompare(a.iso));
    if (!list.length) {
      root.innerHTML = '<div class="dy-rows-empty"><b>Il vostro diario comincia da una foto</b><button type="button" class="dy-btn dy-btn-m" data-dy="add-moment">Aggiungi un ricordo</button></div>';
      return;
    }
    const thisYear = todayISO().slice(0, 4);
    const out = [];
    let month = '';
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      const key = it.iso.slice(0, 7);
      if (key !== month) {
        month = key;
        const pages = list.filter((x) => x.iso.startsWith(key)).length;
        const y = key.slice(0, 4);
        out.push(`<div class="dy-diary-month"><b>${MONTHS[+key.slice(5, 7) - 1]}</b><span>${y !== thisYear ? `${y} · ` : ''}${pages === 1 ? '1 pagina' : `${pages} pagine`}</span></div>`);
      }
      const authors = new Set(it.photos.map((p) => (p.created_by === me ? 'me' : 'partner')));
      const who = it.kept.length || authors.size !== 1 ? 'both' : [...authors][0];
      const [first, ...rest] = it.photos;
      const caption = String(it.photos.find((p) => String(p.caption || '').trim())?.caption || '').trim();
      const body = [
        first ? photoMarkup(first, preview(first), true) : '',
        rest.length ? `<div class="dy-pics">${rest.slice(0, 4).map((p) => photoMarkup(p, preview(p), false)).join('')}</div>` : '',
        caption ? `<div class="dy-diary-cap" translate="no">${esc(caption)}</div>` : '',
        it.kept.map(questionMarkup).join(''),
      ].join('');
      out.push(`<div class="dy-diary-day" data-who="${who}"><div class="dy-diary-date"><em>${+it.iso.slice(8)}</em><small>${esc(wdShort(it.iso))}</small></div><div class="dy-diary-body">${body}</div></div>`);
      // A short quiet stretch before the next (older) day of the same month.
      const next = list[i + 1];
      if (next && next.iso.slice(0, 7) === key) {
        const gap = dayNumber(it.iso) - dayNumber(next.iso) - 1;
        if (gap >= 2 && gap <= 6) {
          const fromIso = new Date((dayNumber(next.iso) + 1) * 86400000).toISOString().slice(0, 10);
          const toIso = new Date((dayNumber(it.iso) - 1) * 86400000).toISOString().slice(0, 10);
          out.push(`<div class="dy-diary-day is-quiet" data-who="both"><div class="dy-diary-date"><em>${+fromIso.slice(8)}–${+toIso.slice(8)}</em><small>${esc(wdShort(fromIso))}–${esc(wdShort(toIso))}</small></div><div class="dy-diary-body"><span class="dy-diary-quiet">${QUIET[gap]}</span></div></div>`);
        }
      }
    }
    root.innerHTML = out.join('');
  }
  // A photo opens in its album: the album viewer works from the grid card.
  function openMoment(id) {
    const card = [...d.querySelectorAll('#momentsGrid .moment-card[data-moment-id]')].find((c) => c.dataset.momentId === id);
    card?.click?.();
  }

  // ---------------------------------------------------------------- wiring
  function onClick(event) {
    const t = event.target;
    if (t.closest?.('#dyDuo')) { openVoiDue(); return; }
    if (t.closest?.('#dyPhoto')) {
      Promise.resolve(w.UsOggiPhoto?.next?.()).catch(() => {});
      return;
    }
    const act = t.closest?.('[data-dy]')?.dataset?.dy;
    if (act === 'answer') { w.openToday?.(); return; }
    if (act === 'add-moment') { w.UsMomentComposer?.pick?.(); return; }
    const pic = t.closest?.('[data-dy-moment]');
    if (pic) { openMoment(pic.dataset.dyMoment); return; }
    const chip = t.closest?.('#dyRicordiChips [data-dy-who]');
    if (chip) { diaryWho = chip.dataset.dyWho; paintChips(); return; }
    if (act === 'close') closeVoiDue();
    // The collection of Sintonia (equip what you unlocked) until the accessories arrive.
    if (act === 'rewards') { closeVoiDue(); setTimeout(() => w.USNoiV2?.openSintonia?.(), 260); }
  }
  function paintAll() {
    paintTitle();
    paintDuo();
    paintPhoto();
    paintQuestion();
  }
  // The paper is light: dark clock and icons on Android and iOS. Asked again
  // when US comes back, because the launch (splash, edge-to-edge) resets it.
  function lightBars() {
    try { const p = w.Capacitor?.isNativePlatform?.() && w.Capacitor?.Plugins?.SystemBars; if (p?.setStyle) Promise.resolve(p.setStyle({ style: 'LIGHT' })).catch(() => {}); } catch (_) { /* web */ }
  }
  function boot() {
    lightBars();
    setTimeout(lightBars, 1200);
    d.addEventListener('click', onClick);
    d.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeVoiDue(); });
    w.addEventListener('popstate', () => closeVoiDue({ fromBack: true }));
    w.addEventListener('us:home-photo-changed', () => paintPhoto());
    w.addEventListener('us-identity-change', () => { shownPath = null; lastQuestion = { id: null, mine: null, both: false, unread: false }; paintAll(); });
    d.addEventListener('visibilitychange', () => { if (d.visibilityState === 'visible') { lightBars(); paintTitle(); paintPhoto(); } });
    // The facts the sentence reads (distance, next commitment) arrive later.
    const watch = ['distanceWidget', 'usOggiNext'].map($).filter(Boolean);
    if (typeof MutationObserver === 'function' && watch.length) {
      const mo = new MutationObserver(() => paintFrase(w.UsOggiPhoto?.current?.()?.meta || null));
      watch.forEach((el) => mo.observe(el, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true, characterData: true }));
    }
    // The map of Ricordi takes the place of the diary while it is open.
    const map = $('ricordiMap');
    if (map && typeof MutationObserver === 'function') {
      const sync = () => {
        const open = map.hidden === false;
        $('dyDiary')?.toggleAttribute('hidden', open);
        $('dyRicordiChips')?.toggleAttribute('hidden', open);
        $('dyRicordiMap')?.setAttribute('aria-pressed', String(open));
      };
      new MutationObserver(sync).observe(map, { attributes: true, attributeFilter: ['hidden'] });
      sync();
    }
    // The profile and the couple arrive after boot: paint when they do.
    let tries = 0;
    const wait = () => {
      paintAll();
      if ((!w.usProfile?.couple_id || !startedOn()) && tries++ < 40) setTimeout(wait, 500);
    };
    wait();
    // A new day while US stays open.
    setInterval(() => { if (!d.hidden) paintTitle(); }, 60000);
  }

  w.UsDiario = Object.freeze({ paintDiary, paintQuestion, paintVoiDue, thinkSent, openVoiDue, closeVoiDue, character, sentences, paintAll });
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
