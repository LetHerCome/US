/* «La cosa di oggi» (founder, 13/11/2026, docs/DECISIONS.md): the Domanda di
   oggi card on Oggi (app.js renderDailyRitual) goes on after the answers.
   Instead of «Rivedi» it offers the next gesture (a Ti penso), then closes the
   day («Oggi c’eravate voi due ♡»); the gentle streak takes the place of «Una
   domanda, due risposte». The server counts everything (public.cosa_di_oggi);
   this file only reads it, words it and celebrates it. The steps of the first
   week left Oggi with the redesign (fase 5, D9): the server still counts them. */
(function () {
  'use strict';
  const w = typeof window !== 'undefined' ? window : globalThis;
  const db = () => w.sb || (typeof sb !== 'undefined' ? sb : null); // eslint-disable-line no-undef
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  const MILESTONES = Object.freeze([7, 14, 21, 30, 50, 100, 150, 200, 300, 365]);
  const HEART = '<svg class="us-cdo-heart" viewBox="0 0 256 256" aria-hidden="true" focusable="false"><path fill="currentColor" d="M240,98a57.63,57.63,0,0,1-17,41L133.7,229.62a8,8,0,0,1-11.4,0L33,139a58,58,0,0,1,82-82.1L128,69.05l13.09-12.19A58,58,0,0,1,240,98Z"/></svg>';

  function romeToday(now = Date.now()) {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now)); }
    catch (_) { return new Date(now).toISOString().slice(0, 10); }
  }
  function partnerName() {
    try { return w.usIdentity?.().partnerName || (typeof usIdentity === 'function' ? usIdentity().partnerName : '') || 'la tua persona'; } // eslint-disable-line no-undef
    catch (_) { return 'la tua persona'; }
  }
  function initials(name) { return String(name || '').trim().charAt(0).toLocaleUpperCase('it-IT') || '♡'; }

  // ---------------------------------------------------------------- words
  function streakHtml(n) {
    return n >= 2 ? `<span class="dq-sub us-daily-ritual-meta us-cdo-streak">${HEART}<span class="us-cdo-streak-n">${esc(`${n} giorni di fila`)}</span></span>` : '';
  }
  function ctaHtml(label, heart) {
    return `<span class="btn-primary us-daily-ritual-cta">${heart ? HEART : ''}${esc(label)}${heart ? '' : '<span class="us-daily-ritual-arrow" aria-hidden="true"></span>'}</span>`;
  }

  // The card's model (app.js dailyRitualViewModel) with today's next thing.
  function decorate(model, s = state, { partner = partnerName() } = {}) {
    if (!model || !s || model.state === 'error') return model;
    const streak = streakHtml(Number(s.streak) || 0);
    const foot = streak ? `<span class="us-cdo-left">${streak}</span>` : '';
    if (model.state === 'answer') return foot ? { ...model, footHtml: foot } : model;
    if (model.state !== 'revealed') return model;
    const base = { ...model, kicker: 'La cosa di oggi', footHtml: foot, attention: false };
    if (!s.today?.my_think) return { ...base, look: 'think', question: `Manda un Ti penso a ${partner}`, cta: 'Ti penso', ctaHtml: ctaHtml('Ti penso', true), action: 'think' };
    if (s.today?.counted) return { ...base, look: 'closed', question: 'Oggi c’eravate voi due ♡', cta: 'Rivedi', ctaHtml: ctaHtml('Rivedi') };
    return model;
  }

  // What changed between two reads, to celebrate (each once).
  function changes(prev, next) {
    const out = [];
    if (!prev || !next) return out;
    const a = Number(prev.streak) || 0, b = Number(next.streak) || 0;
    if (b > a) out.push('streak');
    if (!prev.today?.counted && next.today?.counted) out.push('closed');
    if (!prev.today?.my_think && next.today?.my_think) out.push('gesture');
    const best = Number(next.best_before) || 0;
    if (b > a && best >= 3 && b === best + 1) out.push('record');
    if (b > a && MILESTONES.includes(b)) out.push(`milestone:${b}`);
    return out;
  }

  // ---------------------------------------------------------------- motion
  function reduced() {
    try { return Boolean(w.UsUiFoundation?.isReducedMotion?.()) || Boolean(w.matchMedia?.('(prefers-reduced-motion: reduce)').matches); }
    catch (_) { return false; }
  }
  function card() { return w.document?.getElementById?.('usDailyRitual') || null; }
  function onOggi() { return Boolean(w.document?.getElementById?.('home')?.classList?.contains?.('active')); }
  function once(name) {
    const p = w.usProfile;
    const k = `us:cdo:${p?.couple_id || ''}:${name}`;
    try { if (w.localStorage.getItem(k)) return false; w.localStorage.setItem(k, '1'); } catch (_) {}
    return true;
  }
  // A layer over the card that outlives a re-render of it.
  function overCard(className) {
    const el = card();
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    const fx = w.document.createElement('div');
    fx.className = `us-cdo-fx ${className || ''}`;
    fx.setAttribute('aria-hidden', 'true');
    Object.assign(fx.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    w.document.body.appendChild(fx);
    return fx;
  }
  function hearts(n = 7) {
    const fx = overCard('is-hearts');
    if (!fx) return;
    for (let i = 0; i < n; i++) {
      const h = w.document.createElement('span');
      h.className = 'us-cdo-fly';
      h.innerHTML = HEART;
      h.style.left = `${40 + Math.random() * 20}%`;
      h.style.setProperty('--dx', `${Math.round((Math.random() - 0.5) * 120)}px`);
      h.style.animationDelay = `${i * 60}ms`;
      fx.appendChild(h);
    }
    const check = w.document.createElement('span');
    check.className = 'us-cdo-check';
    check.innerHTML = '<svg viewBox="0 0 34 34"><circle cx="17" cy="17" r="17"/><path d="M10 17.5l4.6 4.6L24.5 12"/></svg>';
    fx.appendChild(check);
    setTimeout(() => fx.remove(), 1600);
  }
  function bumpStreak() {
    const el = card()?.querySelector?.('.us-cdo-streak');
    if (!el?.animate) return;
    el.querySelector('.us-cdo-streak-n')?.animate([{ transform: 'translateY(60%)', opacity: 0 }, { transform: 'translateY(-12%)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' });
    el.querySelector('.us-cdo-heart')?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.45)', offset: 0.35 }, { transform: 'scale(.92)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 640, easing: 'ease-out' });
  }
  function party(title, sub) {
    const doc = w.document;
    const fx = doc.createElement('div');
    fx.className = 'us-cdo-party';
    fx.setAttribute('role', 'status');
    if (!reduced()) {
      for (let i = 0; i < 26; i++) {
        const r = doc.createElement('span');
        r.className = 'us-cdo-rain';
        r.dataset.k = i % 3 ? 'heart' : 'star';
        r.innerHTML = i % 3 ? HEART : '✦';
        r.style.left = `${Math.random() * 100}%`;
        r.style.setProperty('--dx', `${Math.round((Math.random() - 0.5) * 80)}px`);
        r.style.setProperty('--r', `${Math.round((Math.random() - 0.5) * 540)}deg`);
        r.style.animationDelay = `${(Math.random() * 0.6).toFixed(2)}s`;
        fx.appendChild(r);
      }
    }
    const banner = doc.createElement('div');
    banner.className = 'us-cdo-banner';
    banner.innerHTML = `<b>${esc(title)}</b><span>${esc(sub)}</span>`;
    fx.appendChild(banner);
    doc.body.appendChild(fx);
    setTimeout(() => fx.remove(), 3200);
    try { w.UsFeedback?.success?.(); } catch (_) {}
  }
  function celebrate(list) {
    if (!list.length || !onOggi()) return;
    const motion = !reduced();
    if (motion && (list.includes('gesture') || list.includes('closed'))) { hearts(); try { w.UsFeedback?.action?.(); } catch (_) {} }
    if (motion && list.includes('streak')) { setTimeout(bumpStreak, 360); }
    const s = state;
    const day = romeToday();
    if (list.includes('record') && once(`record:${s?.streak}:${day}`)) setTimeout(() => party('Nuovo record ♡', `${s.streak} giorni di fila insieme`), 400);
    else {
      const m = list.find((x) => x.startsWith('milestone:'));
      if (m && once(`${m}:${day}`)) setTimeout(() => party(`${m.slice(10)} giorni di fila ♡`, 'Continuate così'), 400);
    }
  }

  // ---------------------------------------------------------------- data
  let state = null;
  let stateKey = '';
  let fetchedAt = 0;
  let inflight = null;
  let queued = null;
  // A promise that never answers (the native bridge or the network at
  // startup, emulator 13/11) must never hold every later read.
  const TIMEOUT = Symbol('timeout');
  const LIMITS = { widget: 2500, read: 10000 };
  function deadline(promise, ms) {
    let timer;
    return Promise.race([Promise.resolve(promise), new Promise((resolve) => { timer = setTimeout(() => resolve(TIMEOUT), ms); })])
      .finally(() => clearTimeout(timer));
  }
  async function widgetState() {
    const widgets = w.UsWidgets;
    if (!widgets?.isAvailable?.()) return 'unsupported';
    try {
      const placed = await deadline(widgets.installed(), LIMITS.widget);
      if (placed === TIMEOUT) return 'todo';
      return Object.values(placed?.installed || {}).some(Boolean) ? 'done' : 'todo';
    } catch (_) { return 'todo'; }
  }
  function keyNow() {
    const p = w.usProfile;
    return p?.id && p?.couple_id ? `${p.id}:${p.couple_id}:${romeToday()}` : '';
  }
  // Read again at most every 20 s (force: after my own gesture).
  function refresh({ force = false } = {}) {
    const k = keyNow();
    if (!k || !db()) { state = null; stateKey = ''; return Promise.resolve(null); }
    if (k !== stateKey) { stateKey = k; state = null; fetchedAt = 0; }
    // A forced read during an older one (my Ti penso while Oggi was reading)
    // reads again right after it, so it never gets the answer from before.
    if (inflight) {
      if (!force) return inflight;
      if (!queued) queued = inflight.then(() => { queued = null; return refresh({ force: true }); });
      return queued;
    }
    if (!force && Date.now() - fetchedAt < 20000) return Promise.resolve(state);
    inflight = (async () => {
      const widget = await widgetState();
      const answer = await deadline(db().rpc('cosa_di_oggi', { widget }), LIMITS.read);
      const { data, error } = answer === TIMEOUT ? { data: null, error: new Error('cosa_di_oggi timeout') } : answer;
      if (error) { console.warn('[US Cosa di oggi]', error); fetchedAt = Date.now(); return state; }
      if (keyNow() !== k) return state;
      const prev = state;
      fetchedAt = Date.now();
      if (JSON.stringify(prev) === JSON.stringify(data)) return state;
      state = data || null;
      w.UsTodayPriority?.refresh?.();
      const list = changes(prev, state);
      if (list.length) setTimeout(() => celebrate(list), 60);
      return state;
    })().finally(() => { inflight = null; });
    return inflight;
  }

  // ---------------------------------------------------------------- taps
  let busy = false;
  async function act(action) {
    if (busy) return false;
    if (action === 'think') {
      busy = true;
      try {
        const sent = typeof w.sendThinkSignal === 'function' ? await w.sendThinkSignal() : false;
        if (sent) await refresh({ force: true });
        return Boolean(sent);
      } finally { busy = false; }
    }
    return false;
  }

  const api = { limits: LIMITS, decorate, changes, refresh, act, celebrate, party, romeToday, MILESTONES, get state() { return state; } };
  w.UsCosaDiOggi = Object.freeze(api);
  // Back on the app: the day may have moved on, the other person may have done something.
  w.document?.addEventListener?.('visibilitychange', () => { if (w.document.visibilityState === 'visible') refresh(); });
})();
