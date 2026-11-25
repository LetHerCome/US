// La vostra bacheca (founder, 25/11/2026; grill D1–D27, tavola «US · La vostra
// bacheca»). The Bacheca in Ricordi is the couple's «anta del frigo», kept by
// US: the server chooses what hangs (get_bacheca_v1); this file draws it as an
// endless corkboard you move through (one finger moves, two fingers or the
// wheel zoom, a double tap comes close; «Adesso», «Tutta la storia», the small
// map). The red string is the road of your story, the years written on the
// cork. Tapping a thing opens its sheet (fix, unpin, never again, open);
// dragging it moves it, and then it is yours. US says what it pinned with the
// bubble of US vi ricorda (news()).
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) { root.UsBacheca = api; api.install(); }
})(typeof window !== 'undefined' ? window : null, function (w) {
  'use strict';

  const STEP = 230;
  const ROWS = [120, 390];
  const PAD = 110;
  const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const year = (iso) => String(iso || '').slice(0, 4);
  function whenLabel(iso) {
    const m = /^(\d{4})-(\d{2})/.exec(String(iso || ''));
    return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
  }

  // What a thing is on the board, and its size.
  function shape(pin) {
    const c = pin.content || {};
    if (pin.source === 'traguardo') return { kind: 'stamp', w: 120 };
    if (pin.source === 'keepsake') return { kind: 'note', w: 170 };
    if (pin.source === 'conserva') return c.kind === 'photo' ? { kind: 'polaroid', w: 150 } : { kind: 'letter', w: 180 };
    return { kind: 'polaroid', w: 150 };
  }
  // The post-it US writes (D12): why the thing is there.
  function postit(pin) {
    if (!pin.by_us) return '';
    const v = pin.vars || {};
    switch (pin.reason) {
      case 'primo': return 'Il vostro primo ricordo';
      case 'prima_volta': return v.place ? `La prima volta a ${v.place}` : 'Una prima volta';
      case 'storia': return 'Un pezzo della vostra storia';
      case 'un_anno_fa': return v.place ? `Un anno fa, a ${v.place}` : 'Un anno fa, oggi';
      case 'traguardo': return v.what === 'anni' ? `${v.count} ${Number(v.count) === 1 ? 'anno' : 'anni'} insieme` : `${v.count} ricordi insieme`;
      case 'tenuta': return 'Tenuta da voi';
      case 'settimana': return 'Il ricordo della settimana';
      default: return '';
    }
  }
  // Auto places along the road, in time; a thing you moved keeps its place (D24, D26).
  function layout(pins) {
    return (pins || []).map((pin, i) => {
      const s = shape(pin);
      const free = !(Number.isFinite(pin.x) && Number.isFinite(pin.y));
      return { pin, ...s, x: free ? PAD + i * STEP : pin.x, y: free ? ROWS[i % 2] : pin.y, r: [-5, 4, -3, 3, -6, 5, 2, -4][i % 8] };
    });
  }
  function roadPath(nodes) {
    const c = nodes.map((n) => ({ x: n.x + n.w / 2, y: n.y + n.w * 0.55 }));
    return c.reduce((d, p, i) => {
      if (!i) return `M${p.x.toFixed(0)} ${p.y.toFixed(0)}`;
      const a = c[i - 1];
      return `${d} Q${((a.x + p.x) / 2).toFixed(0)} ${((a.y + p.y) / 2 + 60).toFixed(0)} ${p.x.toFixed(0)} ${p.y.toFixed(0)}`;
    }, '');
  }
  function yearMarks(nodes) {
    const seen = new Set();
    return nodes.filter((n) => { const y = year(n.pin.item_date); if (!y || seen.has(y)) return false; seen.add(y); return true; })
      .map((n) => ({ year: year(n.pin.item_date), x: n.x - 20 }));
  }
  function bounds(nodes) {
    if (!nodes.length) return { x0: 0, y0: 0, x1: 600, y1: 600 };
    return {
      x0: Math.min(...nodes.map((n) => n.x)) - PAD, y0: Math.min(...nodes.map((n) => n.y)) - PAD,
      x1: Math.max(...nodes.map((n) => n.x + n.w)) + PAD * 2, y1: Math.max(...nodes.map((n) => n.y + n.w * 1.4)) + PAD,
    };
  }
  // «Vi ho appeso…»: the newest thing US pinned that this person has not seen yet (D14).
  function newsOf(pins, seenAt) {
    const fresh = (pins || []).filter((p) => p.by_us && p.reason !== 'storia' && p.reason !== 'primo' && p.reason !== 'prima_volta' && Date.parse(p.created_at) > (seenAt || 0));
    fresh.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    const p = fresh[0];
    return p ? { kind: 'bacheca', ref_key: `bacheca:${p.id}`, speaker: 'me', slot: p.reason === 'un_anno_fa' ? 'sera' : 'mattina', vars: { reason: p.reason, ...(p.vars || {}) }, at: Date.parse(p.created_at) } : null;
  }

  function install() {
    const d = w.document, $ = (id) => d.getElementById(id);
    const db = () => (typeof sb !== 'undefined' ? sb : null); // eslint-disable-line no-undef
    const me = () => w.usProfile?.id || '';
    const SEEN = () => `us:bacheca:seen:v1:${me()}`;
    let data = null, nodes = [], cam = { x: 0, y: 0, z: 0.9 }, loading = null;
    let sel = null, drag = null, pinch = null, lastTap = { id: '', t: 0 };
    const pts = new Map();

    async function load() {
      if (!me() || !db()) return null;
      if (loading) return loading;
      loading = (async () => {
        try {
          const { data: res, error } = await db().rpc('get_bacheca_v1');
          if (error) throw error;
          data = res && typeof res === 'object' ? res : { pins: [], limit: 12, plus: false };
          return data;
        } catch (error) { console.warn('[US Bacheca]', error); return null; } finally { loading = null; }
      })();
      return loading;
    }
    function seenAt() { try { return Number(w.localStorage?.getItem(SEEN())) || 0; } catch (_) { return 0; } }
    function markSeen() { try { const t = Math.max(Date.now(), ...((data?.pins || []).map((p) => Date.parse(p.created_at) || 0))); w.localStorage?.setItem(SEEN(), String(t)); } catch (_) {} }
    function news() { return data ? newsOf(data.pins, seenAt()) : null; }

    const box = () => $('ricordiBacheca');
    function thumbFor(pin) {
      const c = pin.content || {};
      if (pin.source === 'moment') {
        const card = d.querySelector(`#momentsGrid .moment-card[data-moment-id="${String(pin.source_id).replace(/"/g, '')}"]`);
        const img = card?.querySelector?.('.ricordi-inline-current') || card?.querySelector?.('img[src]:not(.ricordi-inline-peek)');
        const src = img?.currentSrc || img?.getAttribute?.('src') || '';
        if (src) return { src };
      }
      return { path: c.path || '' };
    }
    function itemMarkup(n, i) {
      const p = n.pin, c = p.content || {};
      const note = postit(p);
      const cls = `ub-item ub-${n.kind}${p.fixed ? ' is-fixed' : ''}${p.by_us ? ' is-us' : ''}`;
      const who = p.by_us ? 'us' : (p.mine ? 'me' : 'you');
      let inner = '';
      if (n.kind === 'polaroid') {
        const t = thumbFor(p);
        const words = c.caption || c.place || c.body || '';
        inner = `<span class="ub-pol"><span class="ub-photo"${t.path ? ` data-ub-path="${esc(t.path)}"` : ''}>${t.src ? `<img src="${esc(t.src)}" alt="" loading="lazy" decoding="async" draggable="false">` : ''}</span><span class="ub-cap" translate="no">${esc(String(words).slice(0, 40))}</span></span>`;
      } else if (n.kind === 'letter') {
        inner = `<span class="ub-letter"><span class="ub-flap"></span><span class="ub-letter-text" translate="no">«${esc(String(c.body || '').slice(0, 70))}»</span></span>`;
      } else if (n.kind === 'note') {
        inner = `<span class="ub-note" translate="no"><b>${esc(String(c.question || '').slice(0, 60))}</b>${esc(String(c.francesco || '').slice(0, 50))}</span>`;
      } else {
        inner = `<span class="ub-stamp">${esc(postit({ ...p, by_us: true }))}</span>`;
      }
      const label = [postit(p) || (n.kind === 'polaroid' ? (c.caption || c.place || 'Un ricordo') : 'Una cosa tenuta'), whenLabel(p.item_date)].filter(Boolean).join(', ');
      return `<button type="button" class="${cls}" data-ub-pin="${esc(p.id)}" data-ub-i="${i}" data-who="${who}" style="left:${n.x.toFixed(1)}px;top:${n.y.toFixed(1)}px;width:${n.w}px;--r:${n.r}deg" aria-label="${esc(label)}">`
        + `<i class="ub-pin" aria-hidden="true"></i><span class="ub-date" aria-hidden="true">${esc(whenLabel(p.item_date))}</span>${inner}`
        + (note && n.kind !== 'stamp' ? `<span class="ub-postit" aria-hidden="true">${esc(note)}</span>` : '')
        + (p.fixed ? '<span class="ub-flag" aria-hidden="true">Fissata</span>' : '')
        + '</button>';
    }
    function draw() {
      const el = box();
      if (!el) return;
      const pins = data?.pins || [];
      nodes = layout(pins);
      const b = bounds(nodes);
      const limit = Number(data?.limit) || 12;
      const full = pins.length >= limit;
      const count = data?.plus ? `${pins.length} cose · US Plus` : `${pins.length} su ${limit} · gratis`;
      if (!pins.length) {
        el.innerHTML = '<div class="ub-empty"><p>La vostra bacheca la tiene US: appena mettete un ricordo, ci appende la vostra storia.</p></div>';
        return;
      }
      const endX = (nodes.at(-1)?.x || 0) + STEP;
      el.innerHTML = `<div class="ub-view" data-ub-view tabindex="0" aria-label="Bacheca: trascina per muoverti, due dita per avvicinare">`
        + `<div class="ub-tilt"><div class="ub-world" style="width:${(b.x1 + STEP).toFixed(0)}px;height:${b.y1.toFixed(0)}px">`
        + `<div class="ub-cork" style="left:${(b.x0 - 4000).toFixed(0)}px;top:${(b.y0 - 4000).toFixed(0)}px;width:${(b.x1 - b.x0 + STEP + 8000).toFixed(0)}px;height:${(b.y1 - b.y0 + 8000).toFixed(0)}px"></div>`
        + yearMarks(nodes).map((m) => `<span class="ub-year" style="left:${m.x.toFixed(0)}px" aria-hidden="true">${esc(m.year)}</span>`).join('')
        + `<svg class="ub-road" width="${(b.x1 + STEP).toFixed(0)}" height="${b.y1.toFixed(0)}" aria-hidden="true" focusable="false"><path d="${roadPath(nodes)}"/></svg>`
        + nodes.map(itemMarkup).join('')
        + (data?.plus ? '' : `<div class="ub-end" style="left:${endX.toFixed(0)}px;top:${ROWS[nodes.length % 2]}px">${full ? '<b>Bacheca piena</b><span>Con US Plus la strada continua senza limite</span>' : `<b>Ancora ${limit - pins.length} ${limit - pins.length === 1 ? 'posto' : 'posti'}</b><span>Con US Plus la strada continua senza limite</span>`}</div>`)
        + '</div></div></div>'
        + `<div class="ub-controls"><button type="button" class="ub-now" data-ub-now>Adesso</button><button type="button" class="ub-all" data-ub-all>Tutta la storia</button></div>`
        + `<span class="ub-count">${esc(count)}</span>`
        + `<div class="ub-mini" aria-hidden="true"><svg viewBox="${b.x0.toFixed(0)} ${b.y0.toFixed(0)} ${(b.x1 - b.x0).toFixed(0)} ${(b.y1 - b.y0).toFixed(0)}" preserveAspectRatio="none"><path d="${roadPath(nodes)}"/></svg><span class="ub-mini-frame"></span></div>`;
      paintThumbs();
      goNow(false);
      markSeen();
    }
    async function paintThumbs() {
      for (const ph of box()?.querySelectorAll?.('[data-ub-path]') || []) {
        const path = ph.dataset.ubPath;
        if (!path || typeof w.usGetSignedUrl !== 'function') continue;
        try {
          const url = await w.usGetSignedUrl(path);
          if (url && ph.isConnected && !ph.querySelector('img')) ph.innerHTML = `<img src="${esc(url)}" alt="" loading="lazy" decoding="async" draggable="false">`;
        } catch (_) {}
      }
    }
    // The camera.
    function viewSize() { const v = box()?.querySelector?.('[data-ub-view]'); return { w: v?.clientWidth || 360, h: v?.clientHeight || 560 }; }
    function apply(animate) {
      const world = box()?.querySelector?.('.ub-world');
      const tilt = box()?.querySelector?.('.ub-tilt');
      if (!world) return;
      world.style.transition = animate ? 'transform .6s cubic-bezier(.2,.8,.2,1)' : 'none';
      world.style.transform = `translate(${cam.x.toFixed(1)}px, ${cam.y.toFixed(1)}px) scale(${cam.z.toFixed(3)})`;
      if (tilt) tilt.style.transform = `rotateX(${Math.max(0, 8 - cam.z * 4).toFixed(1)}deg)`;
      const b = bounds(nodes), v = viewSize(), frame = box()?.querySelector?.('.ub-mini-frame');
      if (frame) {
        const W = b.x1 - b.x0, H = b.y1 - b.y0;
        frame.style.left = `${Math.max(0, Math.min(100, ((-cam.x / cam.z) - b.x0) / W * 100)).toFixed(1)}%`;
        frame.style.top = `${Math.max(0, Math.min(100, ((-cam.y / cam.z) - b.y0) / H * 100)).toFixed(1)}%`;
        frame.style.width = `${Math.min(100, v.w / cam.z / W * 100).toFixed(1)}%`;
        frame.style.height = `${Math.min(100, v.h / cam.z / H * 100).toFixed(1)}%`;
      }
    }
    const clampZ = (z) => Math.max(0.14, Math.min(2.2, z));
    function lookAt(x, y, z, animate = true) { const v = viewSize(); cam = { x: v.w / 2 - x * z, y: v.h / 2 - y * z, z }; apply(animate); }
    function goNow(animate = true) { const n = nodes.at(-1); if (n) lookAt(n.x + n.w / 2 - 60, (ROWS[0] + ROWS[1]) / 2 + 80, 0.85, animate); }
    function goAll() { const b = bounds(nodes), v = viewSize(); const z = clampZ(Math.min(v.w / (b.x1 - b.x0), v.h / (b.y1 - b.y0))); lookAt((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, z); }
    function zoomAt(f, cx, cy) {
      const z = clampZ(cam.z * f), k = z / cam.z;
      cam = { x: cx - (cx - cam.x) * k, y: cy - (cy - cam.y) * k, z }; apply(false);
    }

    // The sheet of a thing (D11): fix, unpin, never again; open it.
    const sheet = () => $('usBachecaSheet');
    function openSheet(pin) {
      const s = sheet(); if (!s || !pin) return;
      sel = pin;
      const c = pin.content || {};
      const title = pin.source === 'moment' ? (c.caption || c.place || 'Un ricordo') : pin.source === 'traguardo' ? postit({ ...pin, by_us: true }) : pin.source === 'keepsake' ? (c.question || 'Una risposta tenuta') : 'Una lettera tenuta';
      $('usBachecaSheetTitle').textContent = String(title).slice(0, 80);
      $('usBachecaSheetWhy').textContent = pin.by_us ? `Appesa da US${postit(pin) ? `: ${postit(pin).toLowerCase()}` : ''}. Trascinala per spostarla: diventa vostra.` : (pin.mine ? 'Appesa da te.' : 'Appesa da voi.');
      const fix = s.querySelector('[data-ub-act="fix"]');
      if (fix) fix.textContent = pin.fixed ? 'Lascia decidere a US' : 'Fissa: US non la toglie più';
      const open = s.querySelector('[data-ub-act="open"]');
      if (open) open.hidden = pin.source !== 'moment';
      w.UsUiFoundation?.cancelSurfaceExit?.(s);
      s.classList.add('open'); s.setAttribute('aria-hidden', 'false');
    }
    function closeSheet() {
      const s = sheet(); if (!s?.classList.contains('open')) return;
      const done = () => { s.classList.remove('open'); s.setAttribute('aria-hidden', 'true'); };
      s.classList.remove('open');
      if (w.UsUiFoundation?.exitSurface) w.UsUiFoundation.exitSurface(s, done); else done();
    }
    async function act(kind) {
      const pin = sel; if (!pin) return;
      closeSheet();
      if (kind === 'open') { d.querySelector(`#momentsGrid .moment-card[data-moment-id="${String(pin.source_id).replace(/"/g, '')}"]`)?.click?.(); return; }
      const action = kind === 'fix' ? (pin.fixed ? 'unfix' : 'fix') : kind;
      const { data: ok, error } = await db().rpc('bacheca_pin_action_v1', { p_pin: pin.id, p_action: action });
      if (error || !ok) { w.toast?.('Non riesco a cambiare la bacheca. Riprova.'); return; }
      w.toast?.({ fix: 'Fissata: resta in bacheca', unfix: 'La decide di nuovo US', unpin: 'Staccata: è al suo posto', ban: 'Non la riappenderò' }[action] || '');
      await load(); draw();
    }

    // Gestures (D23): one finger moves the board, a thing dragged moves the thing.
    function onDown(e) {
      const view = e.target?.closest?.('[data-ub-view]');
      if (!view) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const item = e.target.closest('[data-ub-pin]');
      if (item && pts.size === 1) {
        const n = nodes[Number(item.dataset.ubI)];
        drag = { el: item, n, id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, moved: false };
      }
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: cam.z }; drag = null; }
      try { view.setPointerCapture(e.pointerId); } catch (_) {}
    }
    function onMove(e) {
      const prev = pts.get(e.pointerId); if (!prev) return;
      const now = { x: e.clientX, y: e.clientY }; pts.set(e.pointerId, now);
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()], r = box().querySelector('[data-ub-view]').getBoundingClientRect();
        zoomAt((pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d) / cam.z, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); return;
      }
      if (drag && drag.id === e.pointerId) {
        const dx = (now.x - drag.sx) / cam.z, dy = (now.y - drag.sy) / cam.z;
        if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 8 / cam.z) drag.moved = true;
        if (drag.moved) { drag.n.x = drag.ox + dx; drag.n.y = drag.oy + dy; drag.el.style.left = `${drag.n.x.toFixed(1)}px`; drag.el.style.top = `${drag.n.y.toFixed(1)}px`; drag.el.classList.add('is-dragging'); }
        return;
      }
      cam.x += now.x - prev.x; cam.y += now.y - prev.y; apply(false);
    }
    async function onUp(e) {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (!drag || drag.id !== e.pointerId) return;
      const g = drag; drag = null; g.el.classList.remove('is-dragging');
      if (!g.moved) {
        const t = Date.now();
        if (lastTap.id === g.n.pin.id && t - lastTap.t < 320) { lastTap = { id: '', t: 0 }; lookAt(g.n.x + g.n.w / 2, g.n.y + g.n.w / 2, 1.6); return; }
        lastTap = { id: g.n.pin.id, t };
        setTimeout(() => { if (lastTap.id === g.n.pin.id && lastTap.t === t) openSheet(g.n.pin); }, 330);
        return;
      }
      const { data: ok, error } = await db().rpc('bacheca_pin_action_v1', { p_pin: g.n.pin.id, p_action: 'move', p_x: Math.round(g.n.x), p_y: Math.round(g.n.y) });
      if (error || !ok) { w.toast?.('Non riesco a spostarla. Riprova.'); }
      else if (g.n.pin.by_us) w.toast?.('Spostata: ora è vostra');
      await load(); const keep = { ...cam }; draw(); cam = keep; apply(false);
    }

    d.addEventListener('pointerdown', onDown);
    d.addEventListener('pointermove', onMove);
    d.addEventListener('pointerup', onUp);
    d.addEventListener('pointercancel', onUp);
    d.addEventListener('wheel', (e) => {
      const view = e.target?.closest?.('[data-ub-view]'); if (!view) return;
      e.preventDefault();
      const r = view.getBoundingClientRect();
      zoomAt(e.deltaY > 0 ? 0.9 : 1.1, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    d.addEventListener('click', (e) => {
      const t = e.target; if (!t?.closest) return;
      if (t.closest('[data-ub-now]')) { goNow(); return; }
      if (t.closest('[data-ub-all]')) { goAll(); return; }
      const a = t.closest('[data-ub-act]');
      if (a) { if (a.dataset.ubAct === 'close') closeSheet(); else act(a.dataset.ubAct); }
    });
    // Ready for the bubble at the start of the day, and fresh when the couple changes.
    w.addEventListener?.('us-identity-change', () => { data = null; if (me()) setTimeout(() => { load().catch(() => {}); }, 1200); });
    api.show = async () => { if (data) draw(); await load(); draw(); };
    api.refresh = async () => { await load(); if (box() && !box().hidden) draw(); };
    api.news = news;
    api.markSeen = markSeen;
    api.closeSheet = closeSheet;
  }

  const api = { shape, postit, layout, roadPath, yearMarks, bounds, newsOf, whenLabel, install, show: async () => {}, refresh: async () => {}, news: () => null, markSeen: () => {}, closeSheet: () => {} };
  return api;
});
