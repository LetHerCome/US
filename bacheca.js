// La vostra bacheca (founder, 25/11/2026; grill D1–D27, tavola «US · La vostra
// bacheca»). The Bacheca in Ricordi is the couple's «anta del frigo», kept by
// US: the server chooses what hangs (get_bacheca_v1); this file draws it as an
// endless corkboard you move through (one finger moves, two fingers or the
// wheel zoom, a double tap comes close; «Adesso», «Tutta la storia», the small
// map). The red string is the road of your story, the years written on the
// cork. Tapping a thing opens its sheet (fix, unpin, never again, open);
// dragging it moves it, and then it is yours. US says what it pinned with the
// bubble of US vi ricorda (news()).
//
// Fasi 2 e 3 (founder, grill 27/11/2026 D1–D16, tavola approvata):
// * your post-its: one per person on each thing, 80 characters, in the
//   writer's colour, next to US's «why»; written in the thing's sheet
//   (bacheca_postit_v1). They belong to the thing, not to the pin;
// * «Sulla bacheca» in the memory and in a search result (memoryRow): US's
//   post-it and yours, also when the thing is not pinned, «Scrivi il tuo»,
//   «Appendi / Riappendi in bacheca» or «Vedilo in bacheca»;
// * «Appendi» (pinThing) and, when the board is full, «fai spazio»: tap one
//   unfixed thing, «Stacca e appendi» swaps them on the server in one go;
// * openOn(): the board centred on a thing (a push, «Vedilo in bacheca»).
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) { root.UsBacheca = api; api.install(); }
})(typeof window !== 'undefined' ? window : null, function (w) {
  'use strict';

  const STEP = 230;
  const ROWS = [120, 390];
  const PAD = 110;
  const NOTE_MAX = 80;
  const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const year = (iso) => String(iso || '').slice(0, 4);
  function whenLabel(iso) {
    const m = /^(\d{4})-(\d{2})/.exec(String(iso || ''));
    return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
  }
  // «oggi», «ieri», or the day and the month: when a post-it was written.
  function whenShort(iso, now = Date.now()) {
    const t = Date.parse(iso || '');
    if (!Number.isFinite(t)) return '';
    const day = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
    if (day(t) === day(now)) return 'oggi';
    if (day(t) === day(now - 86400000)) return 'ieri';
    const d = new Date(t);
    return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
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
      case 'traguardo': return v.what === 'anni' ? (Number(v.count) === 1 ? `${v.count} anno insieme` : `${v.count} anni insieme`) : `${v.count} ricordi insieme`;
      case 'tenuta': return 'Tenuta da voi';
      case 'settimana': return 'Il ricordo della settimana';
      default: return '';
    }
  }
  // Fase 2: US's «why» stays with the thing (the server's why), also once it
  // is yours (moved, written on) or pinned again by you.
  function whyOf(pin) {
    const why = pin?.why;
    if (why && typeof why === 'object') return postit({ by_us: true, reason: why.reason, vars: why.vars });
    return pin?.why === undefined ? postit(pin || {}) : '';
  }
  // A post-it: 80 characters at most, spaces folded as the server folds them.
  function cleanNote(text) { return String(text ?? '').replace(/\s+/g, ' ').trim(); }
  function noteCount(text) { return `${Math.min(NOTE_MAX, String(text ?? '').length)}/${NOTE_MAX}`; }
  // The newest post-it of the other person, for a push without its id.
  function newestPartnerNote(pins) {
    let best = null;
    for (const p of pins || []) for (const n of p.notes || []) {
      if (n.mine) continue;
      if (!best || Date.parse(n.at) > Date.parse(best.note.at)) best = { pin: p, note: n };
    }
    return best;
  }
  // A short title for a thing (sheet, fai spazio, toasts).
  function titleOf(pin) {
    const c = pin?.content || {};
    if (pin?.source === 'moment') return String(c.caption || c.place || 'Un ricordo').slice(0, 60);
    if (pin?.source === 'traguardo') return whyOf(pin) || 'Un traguardo';
    if (pin?.source === 'keepsake') return String(c.question || 'Una risposta tenuta').slice(0, 60);
    return c.kind === 'photo' ? 'Una foto tenuta' : 'Una lettera tenuta';
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

  // A kept answer of the day: the question and both answers, each in the
  // colour of who wrote it; only the ones written, never an empty line.
  function noteAnswers(c, role) {
    const mine = role === 'francesco' || role === 'beatrice' ? role : '';
    return ['francesco', 'beatrice'].map((r) => ({ who: mine ? (r === mine ? 'me' : 'you') : '', text: String(c?.[r] || '').trim() })).filter((a) => a.text);
  }

  function install() {
    const d = w.document, $ = (id) => d.getElementById(id);
    const db = () => (typeof sb !== 'undefined' ? sb : null); // eslint-disable-line no-undef
    const me = () => w.usProfile?.id || '';
    const SEEN = () => `us:bacheca:seen:v1:${me()}`;
    const myName = () => String(w.usProfile?.display_name || '').trim() || 'Tu';
    const partnerName = () => { try { const n = w.usIdentity?.()?.partnerName; return n && n !== 'La tua persona' ? n : 'La tua persona'; } catch (_) { return 'La tua persona'; } };
    const reduced = () => { try { return Boolean(w.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch (_) { return false; } };
    let data = null, nodes = [], cam = { x: 0, y: 0, z: 0.9 }, loading = null, failed = false, loads = 0;
    let sel = null, drag = null, pinch = null, lastTap = { id: '', t: 0 }, pointerAt = 0;
    // Fai spazio: { source, id, title, pick } while the board asks what to take down.
    let room = null;
    // openOn(): the thing to centre on at the next drawing.
    let focus = null;
    // The post-it editor: { ref, title, notes, why, pinned, onDone }.
    let noteCtx = null;
    const rows = new Map();
    const pts = new Map();

    async function load() {
      if (!me() || !db()) return null;
      if (loading) return loading;
      loading = (async () => {
        try {
          const { data: res, error } = await db().rpc('get_bacheca_v1');
          if (error) throw error;
          data = res && typeof res === 'object' ? res : { pins: [], limit: 12, plus: false };
          failed = false; loads += 1;
          return data;
        } catch (error) { console.warn('[US Bacheca]', error); failed = true; return null; } finally { loading = null; }
      })();
      return loading;
    }
    function seenAt() { try { return Number(w.localStorage?.getItem(SEEN())) || 0; } catch (_) { return 0; } }
    function markSeen() { try { const t = Math.max(Date.now(), ...((data?.pins || []).map((p) => Date.parse(p.created_at) || 0))); w.localStorage?.setItem(SEEN(), String(t)); } catch (_) {} }
    function news() { return data ? newsOf(data.pins, seenAt()) : null; }

    const box = () => $('ricordiBacheca');
    const boardOpen = () => Boolean(box() && !box().hidden);
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
    const nameOf = (note) => (note.mine ? myName() : partnerName());
    function notesOnItem(p) {
      const list = p.notes || [];
      if (!list.length) return '';
      return `<span class="ub-notes" aria-hidden="true">${list.map((n) => `<span class="ub-pn" data-who="${n.mine ? 'me' : 'you'}"><span class="ub-pn-text" translate="no">${esc(n.body)}</span><b translate="no">${esc(nameOf(n))}</b></span>`).join('')}</span>`;
    }
    function itemMarkup(n, i) {
      const p = n.pin, c = p.content || {};
      const note = whyOf(p);
      const locked = Boolean(room && p.fixed);
      const picked = Boolean(room && room.pick === p.id);
      const cls = `ub-item ub-${n.kind}${p.fixed ? ' is-fixed' : ''}${p.by_us ? ' is-us' : ''}${locked ? ' is-locked' : ''}${picked ? ' is-picked' : ''}`;
      const who = p.by_us ? 'us' : (p.mine ? 'me' : 'you');
      let inner = '';
      if (n.kind === 'polaroid') {
        const t = thumbFor(p);
        const words = c.caption || c.place || c.body || '';
        inner = `<span class="ub-pol"><span class="ub-photo"${t.path ? ` data-ub-path="${esc(t.path)}"` : ''}>${t.src ? `<img src="${esc(t.src)}" alt="" loading="lazy" decoding="async" draggable="false">` : ''}</span><span class="ub-cap" translate="no">${esc(String(words).slice(0, 40))}</span></span>`;
      } else if (n.kind === 'letter') {
        inner = `<span class="ub-letter"><span class="ub-flap"></span><span class="ub-letter-text" translate="no">«${esc(String(c.body || '').slice(0, 70))}»</span></span>`;
      } else if (n.kind === 'note') {
        inner = `<span class="ub-note" translate="no"><b>${esc(String(c.question || '').slice(0, 60))}</b>${noteAnswers(c, w.usProfile?.role).map((a) => `<span class="ub-ans"${a.who ? ` data-who="${a.who}"` : ''}>${esc(a.text.slice(0, 50))}</span>`).join('')}</span>`;
      } else {
        inner = `<span class="ub-stamp">${esc(note || titleOf(p))}</span>`;
      }
      const count = (p.notes || []).length;
      const label = [note || (n.kind === 'polaroid' ? (c.caption || c.place || 'Un ricordo') : 'Una cosa tenuta'), whenLabel(p.item_date), count ? (count === 1 ? 'un post-it' : `${count} post-it`) : ''].filter(Boolean).join(', ');
      const state = room ? (locked ? ' aria-disabled="true"' : ` aria-pressed="${picked}"`) : '';
      return `<button type="button" class="${cls}" data-ub-pin="${esc(p.id)}" data-ub-i="${i}" data-who="${who}"${state} style="left:${n.x.toFixed(1)}px;top:${n.y.toFixed(1)}px;width:${n.w}px;--r:${n.r}deg" aria-label="${esc(room && !locked ? `Stacca: ${label}` : label)}">`
        + `<i class="ub-pin" aria-hidden="true"></i><span class="ub-date" aria-hidden="true">${esc(whenLabel(p.item_date))}</span>${inner}`
        + (note && n.kind !== 'stamp' ? `<span class="ub-postit" aria-hidden="true">${esc(note)}</span>` : '')
        + notesOnItem(p)
        + (p.fixed ? '<span class="ub-flag" aria-hidden="true">Fissata</span>' : '')
        + (picked ? '<span class="ub-check" aria-hidden="true"></span>' : '')
        + '</button>';
    }
    function roomMarkup(count, limit) {
      if (!room) return '';
      const chosen = (data?.pins || []).find((p) => p.id === room.pick);
      return `<div class="ub-room-head" role="status" tabindex="-1"><b>La bacheca è piena · ${count} di ${limit}</b><span translate="no">${esc(`Tocca cosa staccare per appendere «${room.title}»`)}</span><small>Le cose fissate restano: prima toglile dalle fissate.</small></div>`
        + `<div class="ub-room-bar"><p class="ub-room-say" aria-live="polite">${chosen ? esc(`Al posto di «${titleOf(chosen)}» va «${room.title}». I suoi post-it restano col ricordo.`) : 'Tocca una cosa non fissata.'}</p>`
        + `<div class="ub-room-acts"><button type="button" class="ub-room-cancel" data-ub-room="cancel">Annulla</button><button type="button" class="primary ub-room-go" data-ub-room="go"${chosen ? '' : ' disabled'}>Stacca e appendi</button></div></div>`;
    }
    function draw({ keep = false } = {}) {
      const el = box();
      if (!el) return;
      const pins = data?.pins || [];
      nodes = layout(pins);
      const b = bounds(nodes);
      const limit = Number(data?.limit) || 12;
      const full = pins.length >= limit;
      const count = data?.plus ? `${pins.length} cose · US Plus` : `${pins.length} su ${limit} · gratis`;
      // Not read (no network, the server did not answer): say so, never the empty board.
      if (!data && failed) {
        el.innerHTML = '<div class="ub-empty" role="alert"><p>La bacheca non risponde. <button type="button" class="primary ub-retry" data-ub-retry>Riprova</button></p></div>';
        return;
      }
      if (!pins.length) {
        el.innerHTML = '<div class="ub-empty"><p>La vostra bacheca la tiene US: appena mettete un ricordo, ci appende la vostra storia.</p></div>';
        return;
      }
      const before = { ...cam };
      const endX = (nodes.at(-1)?.x || 0) + STEP;
      el.classList.toggle('is-room', Boolean(room));
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
        + `<div class="ub-mini" aria-hidden="true"><svg viewBox="${b.x0.toFixed(0)} ${b.y0.toFixed(0)} ${(b.x1 - b.x0).toFixed(0)} ${(b.y1 - b.y0).toFixed(0)}" preserveAspectRatio="none"><path d="${roadPath(nodes)}"/></svg><span class="ub-mini-frame"></span></div>`
        + roomMarkup(pins.length, limit);
      paintThumbs();
      const target = focusTarget();
      if (target) focusNode(target);
      else if (keep) { cam = before; apply(false); }
      else goNow(false);
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
      world.style.transition = animate && !reduced() ? 'transform .6s cubic-bezier(.2,.8,.2,1)' : 'none';
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
    // openOn() and fai spazio: which node and how close, until a fresh read has
    // been drawn: the drawing before it and the one after it both look there.
    function focusTarget() {
      if (!focus) return null;
      let node = null;
      if (focus.room) {
        // Fai spazio: close enough to read, on the newest thing that can come down.
        node = [...nodes].reverse().find((n) => !n.pin.fixed) || nodes.at(-1) || null;
        if (loads > focus.loads) focus = null;
        return node ? { node, z: 0.8, mark: false } : null;
      }
      if (focus.ref) node = nodes.find((n) => n.pin.ref_key === focus.ref);
      else if (focus.noteId) node = nodes.find((n) => (n.pin.notes || []).some((x) => x.id === focus.noteId));
      if (!node && (focus.newest || focus.noteId)) { const best = newestPartnerNote(data?.pins); node = best ? nodes.find((n) => n.pin.id === best.pin.id) : null; }
      if (loads > focus.loads) focus = null;
      return node ? { node, z: 1.1, mark: true } : null;
    }
    function focusNode({ node: n, z, mark }) {
      lookAt(n.x + n.w / 2, n.y + n.w * 0.7, z, true);
      if (!mark) return;
      const el = box()?.querySelector?.(`[data-ub-pin="${String(n.pin.id).replace(/"/g, '')}"]`);
      if (!el) return;
      el.classList.add('is-focus');
      setTimeout(() => el.classList.remove('is-focus'), 2600);
    }

    // The sheet of a thing (D11): fix, unpin, never again; open it. Fase 2: the
    // post-its, and yours to write. Opened from elsewhere (the memory, the
    // search) it shows only the post-its.
    const sheet = () => $('usBachecaSheet');
    function openSheet(pin) {
      const s = sheet(); if (!s || !pin) return;
      sel = pin;
      const c = pin.content || {};
      const title = pin.source === 'moment' ? (c.caption || c.place || 'Un ricordo') : pin.source === 'traguardo' ? (whyOf(pin) || titleOf(pin)) : pin.source === 'keepsake' ? (c.question || 'Una risposta tenuta') : 'Una lettera tenuta';
      $('usBachecaSheetTitle').textContent = String(title).slice(0, 80);
      const why = whyOf(pin);
      $('usBachecaSheetWhy').textContent = pin.by_us ? (why ? `Appesa da US: ${why.toLowerCase()}. Trascinala per spostarla: diventa vostra.` : 'Appesa da US. Trascinala per spostarla: diventa vostra.') : (pin.mine ? 'Appesa da te.' : 'Appesa da voi.');
      const fix = s.querySelector('[data-ub-act="fix"]');
      if (fix) fix.textContent = pin.fixed ? 'Lascia decidere a US' : 'Fissa: US non la toglie più';
      const open = s.querySelector('[data-ub-act="open"]');
      if (open) open.hidden = pin.source !== 'moment';
      const acts = s.querySelector('.ub-sheet-actions');
      if (acts) acts.hidden = false;
      noteCtx = { ref: pin.ref_key || `${pin.source}:${pin.source_id}`, title, notes: pin.notes || [], why: pin.why, pinned: true, onDone: null };
      renderNotes();
      showSheet(s);
    }
    function openNoteSheet(ctx) {
      const s = sheet(); if (!s || !ctx?.ref) return;
      sel = null;
      $('usBachecaSheetTitle').textContent = String(ctx.title || 'Un ricordo').slice(0, 80);
      $('usBachecaSheetWhy').textContent = ctx.pinned ? 'È in bacheca.' : 'Non è appesa: il post-it resta col ricordo e torna con lei in bacheca.';
      const acts = s.querySelector('.ub-sheet-actions');
      if (acts) acts.hidden = true;
      noteCtx = { ...ctx, notes: ctx.notes || [] };
      renderNotes();
      showSheet(s);
      setTimeout(() => $('usBachecaNoteInput')?.focus?.({ preventScroll: true }), 60);
    }
    function showSheet(s) {
      w.UsUiFoundation?.cancelSurfaceExit?.(s);
      s.classList.add('open'); s.setAttribute('aria-hidden', 'false');
    }
    function renderNotes() {
      const host = $('usBachecaNotes');
      if (!host || !noteCtx) return;
      const why = noteCtx.why && typeof noteCtx.why === 'object' ? postit({ by_us: true, reason: noteCtx.why.reason, vars: noteCtx.why.vars }) : '';
      const mine = (noteCtx.notes || []).find((n) => n.mine);
      const others = (noteCtx.notes || []).filter((n) => !n.mine);
      const list = (why ? `<div class="ub-pn is-us"><p translate="no">${esc(why)}</p><b>US</b></div>` : '')
        + others.map((n) => `<div class="ub-pn" data-who="you"><p translate="no">${esc(n.body)}</p><b translate="no">${esc([partnerName(), whenShort(n.at)].filter(Boolean).join(' · '))}</b></div>`).join('');
      host.innerHTML = `<h3 class="ub-notes-kicker">I vostri post-it</h3>`
        + (list ? `<div class="ub-notes-list">${list}</div>` : '<p class="ub-notes-none">Ancora nessun post-it: il primo è tuo.</p>')
        + '<label class="ub-note-label" for="usBachecaNoteInput">Il tuo post-it</label>'
        + `<div class="ub-note-edit" data-who="me"><textarea id="usBachecaNoteInput" rows="2" maxlength="${NOTE_MAX}" placeholder="Scrivi qualcosa su questo ricordo" aria-describedby="usBachecaNoteCount usBachecaNoteHint"></textarea><span class="ub-note-count" id="usBachecaNoteCount">0/${NOTE_MAX}</span></div>`
        + `<p class="ub-note-hint" id="usBachecaNoteHint" translate="no">${esc(`Arriva un avviso a ${partnerName()}. Il tuo post-it lo cambi o lo togli quando vuoi; quello dell’altra persona no.`)}</p>`
        + `<div class="ub-note-actions"><button type="button" class="ub-note-remove" data-ub-note="remove"${mine ? '' : ' hidden'}>Togli il mio</button><button type="button" class="primary ub-note-save" data-ub-note="save">Attacca</button></div>`;
      const input = $('usBachecaNoteInput');
      if (input) { input.value = mine?.body || ''; $('usBachecaNoteCount').textContent = noteCount(input.value); }
    }
    function closeSheet() {
      const s = sheet(); if (!s?.classList.contains('open')) return;
      const done = () => { s.classList.remove('open'); s.setAttribute('aria-hidden', 'true'); };
      s.classList.remove('open');
      if (w.UsUiFoundation?.exitSurface) w.UsUiFoundation.exitSurface(s, done); else done();
    }
    async function saveNote(remove) {
      const ctx = noteCtx; if (!ctx || !db()) return;
      const body = remove ? '' : cleanNote($('usBachecaNoteInput')?.value);
      const had = (ctx.notes || []).some((n) => n.mine);
      if (!body && !had) { $('usBachecaNoteInput')?.focus?.(); return; }
      const buttons = sheet()?.querySelectorAll?.('[data-ub-note]') || [];
      for (const b of buttons) b.disabled = true;
      let res = null;
      try {
        const { data: out, error } = await db().rpc('bacheca_postit_v1', { p_ref: ctx.ref, p_body: body });
        if (error) throw error;
        res = out || {};
      } catch (error) { console.warn('[US Bacheca] post-it', error); }
      for (const b of buttons) b.disabled = false;
      if (!res || !['saved', 'deleted', 'none'].includes(res.status)) {
        w.toast?.(res?.status === 'too_long' ? 'Al massimo 80 caratteri' : 'Non riesco ad attaccarlo. Riprova.');
        return;
      }
      // «Bea ha scritto su un ricordo in bacheca»: send-web-push decides (the Lavagna switch, 2 hours).
      if (res.status === 'saved' && res.created && res.id) { try { w.sendWebPushEvent?.('bacheca_postit', res.id)?.catch?.(() => {}); } catch (_) {} }
      w.toast?.(res.status === 'saved' ? 'Attaccato ♡' : 'Tolto');
      closeSheet();
      noteCtx = null;
      await load();
      if (boardOpen()) draw({ keep: true });
      ctx.onDone?.();
    }
    async function act(kind) {
      const pin = sel; if (!pin) return;
      closeSheet();
      if (kind === 'open') { d.querySelector(`#momentsGrid .moment-card[data-moment-id="${String(pin.source_id).replace(/"/g, '')}"]`)?.click?.(); return; }
      const action = kind === 'fix' ? (pin.fixed ? 'unfix' : 'fix') : kind;
      const { data: ok, error } = await db().rpc('bacheca_pin_action_v1', { p_pin: pin.id, p_action: action });
      if (error || !ok) { w.toast?.('Non riesco a cambiare la bacheca. Riprova.'); return; }
      w.toast?.({ fix: 'Fissata: resta in bacheca', unfix: 'La decide di nuovo US', unpin: 'Staccata: è al suo posto', ban: 'Non la riappenderò' }[action] || '');
      await load(); draw({ keep: true });
    }

    // ---- The lens of Ricordi (fase 3): its code and styles the first time ---
    // it is tapped, with the same version as this file (the search needs the
    // network anyway, so it stays out of the offline shell).
    const LENS = 'ricordi-cerca';
    let cerca = null;
    function loadCerca() {
      if (w.UsRicordiCerca) return Promise.resolve();
      if (cerca) return cerca;
      const own = d.querySelector('script[src*="/bacheca.js"]')?.getAttribute('src') || '';
      const version = own.includes('?') ? own.slice(own.indexOf('?')) : '';
      cerca = new Promise((resolve, reject) => {
        const link = d.createElement('link');
        link.rel = 'stylesheet'; link.href = `/${LENS}.css${version}`;
        d.head.appendChild(link);
        const script = d.createElement('script');
        script.src = `/${LENS}.js${version}`;
        script.onload = () => resolve();
        script.onerror = () => { cerca = null; script.remove(); reject(new Error('ricordi-cerca')); };
        d.head.appendChild(script);
      });
      return cerca;
    }

    // ---- «Appendi» and «fai spazio» (fase 3) ------------------------------
    function pinnedToast() {
      const n = (data?.pins || []).length, limit = Number(data?.limit) || 12;
      w.toast?.(data?.plus ? 'Appesa in bacheca ♡' : `Appesa in bacheca ♡ · ${n} di ${limit}`);
    }
    async function pinThing(opts = {}) {
      if (!db() || !opts.source || !opts.id) return 'no';
      let res = null;
      try {
        const { data: out, error } = await db().rpc('bacheca_pin_v1', { p_source: opts.source, p_source_id: opts.id });
        if (error) throw error;
        res = out;
      } catch (error) { console.warn('[US Bacheca] appendi', error); }
      if (res === 'pinned') { await load(); pinnedToast(); if (boardOpen()) draw({ keep: true }); opts.onDone?.(); return res; }
      if (res === 'already') { w.toast?.('È già in bacheca'); opts.onDone?.(); return res; }
      if (res === 'full') { await startRoom(opts); return res; }
      w.toast?.('Non riesco ad appenderla. Riprova.');
      return res || 'no';
    }
    async function startRoom(opts) {
      room = { source: opts.source, id: opts.id, title: String(opts.title || 'Un ricordo').slice(0, 60), pick: null };
      w.UsRicordiCerca?.close?.();
      w.closeMomentAlbum?.();
      if (d.querySelector('.page.active')?.id !== 'moments') w.go?.('moments', { nav: true });
      focus = { room: true, loads };
      w.UsRicordiPlace?.setView?.('board');
      await load();
      draw({ keep: true });
      if (room) box()?.querySelector?.('.ub-room-head')?.focus?.({ preventScroll: true });
    }
    function cancelRoom() { if (!room) return; room = null; if (boardOpen()) draw({ keep: true }); }
    function pick(pin) {
      if (!room || !pin) return;
      if (pin.fixed) { w.toast?.('È fissata: prima toglila dalle fissate'); return; }
      room.pick = room.pick === pin.id ? null : pin.id;
      draw({ keep: true });
      box()?.querySelector?.(`[data-ub-pin="${String(pin.id).replace(/"/g, '')}"]`)?.focus?.({ preventScroll: true });
    }
    async function confirmRoom() {
      const r = room; if (!r?.pick || !db()) return;
      const go = box()?.querySelector?.('[data-ub-room="go"]');
      if (go) go.disabled = true;
      let res = null;
      try {
        const { data: out, error } = await db().rpc('bacheca_pin_v1', { p_source: r.source, p_source_id: r.id, p_replace: r.pick });
        if (error) throw error;
        res = out;
      } catch (error) { console.warn('[US Bacheca] fai spazio', error); }
      if (res === 'replaced' || res === 'pinned' || res === 'already') {
        room = null;
        focus = { ref: `${r.source}:${r.id}`, loads };
        await load(); draw();
        if (res === 'already') w.toast?.('È già in bacheca'); else pinnedToast();
        return;
      }
      if (go) go.disabled = false;
      if (res === 'fixed') { w.toast?.('È fissata: scegline un’altra'); await load(); r.pick = null; draw({ keep: true }); return; }
      w.toast?.('Non riesco ad appenderla. Riprova.');
    }

    // ---- «Sulla bacheca»: the memory and the search result (fase 2) ---------
    async function thing(ref) {
      if (!db() || !ref) return null;
      try {
        const { data: res, error } = await db().rpc('get_bacheca_thing_v1', { p_ref: ref });
        if (error) throw error;
        return res && typeof res === 'object' ? res : null;
      } catch (error) { console.warn('[US Bacheca] cosa', error); return null; }
    }
    function rowMarkup(t) {
      const why = t.why && typeof t.why === 'object' ? postit({ by_us: true, reason: t.why.reason, vars: t.why.vars }) : '';
      const notes = t.notes || [];
      const any = Boolean(why || notes.length);
      const mine = notes.some((n) => n.mine);
      const list = (why ? `<div class="ub-pn is-us"><p translate="no">${esc(why)}</p><b>US</b></div>` : '')
        + notes.map((n) => `<div class="ub-pn" data-who="${n.mine ? 'me' : 'you'}"><p translate="no">${esc(n.body)}</p><b translate="no">${esc(nameOf(n))}</b></div>`).join('');
      const say = t.pin ? '' : (any ? 'Ora non è appesa: i post-it restano qui e tornano con lei se la riappendete.' : 'Non è in bacheca.');
      const button = t.pin ? `<button type="button" class="ub-row-pin" data-ub-row="see">Vedilo in bacheca</button>`
        : `<button type="button" class="primary ub-row-pin" data-ub-row="pin">${any ? 'Riappendi in bacheca' : 'Appendi in bacheca'}</button>`;
      return `<div class="ub-row-head"><h3 class="ub-row-kicker">Sulla bacheca${t.pin ? '<i class="ub-row-pinned" aria-hidden="true"></i>' : ''}</h3><button type="button" class="ub-row-write" data-ub-row="write">${mine ? 'Cambia il tuo' : 'Scrivi il tuo'}</button></div>`
        + (list ? `<div class="ub-row-notes">${list}</div>` : '')
        + (say ? `<p class="ub-row-say">${say}</p>` : '')
        + button;
    }
    async function memoryRow(host, opts = {}) {
      if (!host || !opts.ref) return null;
      const ref = String(opts.ref).toLowerCase();
      host.dataset.ubRef = ref;
      const t = await thing(ref);
      if (host.dataset.ubRef !== ref) return null;
      if (!t) { host.hidden = true; host.innerHTML = ''; rows.delete(host); return null; }
      rows.set(host, { t, opts: { ...opts, ref } });
      host.classList.add('ub-row');
      host.setAttribute('aria-label', 'Sulla bacheca');
      host.innerHTML = rowMarkup(t);
      host.hidden = false;
      return t;
    }
    function rowAction(host, kind) {
      const row = rows.get(host); if (!row) return;
      const { t, opts } = row;
      const again = () => { memoryRow(host, opts); opts.onChange?.(); };
      if (kind === 'write') { openNoteSheet({ ref: t.ref_key, title: opts.title, notes: t.notes, why: t.why, pinned: Boolean(t.pin), onDone: again }); return; }
      if (kind === 'see') { openOn({ ref: t.ref_key }); return; }
      if (kind === 'pin') pinThing({ source: t.source, id: t.source_id, title: opts.title, onDone: again });
    }

    // The board centred on a thing: a push (the post-it's id, or the newest of
    // the other person's), «Vedilo in bacheca».
    function openOn({ ref = '', noteId = '' } = {}) {
      w.UsRicordiCerca?.close?.();
      w.closeMomentAlbum?.();
      closeSheet();
      focus = { ref: String(ref || '').toLowerCase(), noteId: String(noteId || '').toLowerCase(), newest: !ref && !noteId, loads };
      if (d.querySelector('.page.active')?.id !== 'moments') w.go?.('moments', { nav: true });
      w.UsRicordiPlace?.setView?.('board');
    }

    // Gestures (D23): one finger moves the board, a thing dragged moves the thing.
    // Fai spazio: a thing is only picked, never moved.
    function onDown(e) {
      const view = e.target?.closest?.('[data-ub-view]');
      if (!view) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const item = e.target.closest('[data-ub-pin]');
      if (item) pointerAt = Date.now();
      if (item && pts.size === 1) {
        const n = nodes[Number(item.dataset.ubI)];
        drag = { el: item, n, id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, moved: false, pan: Boolean(room) };
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
        if (drag.pan) { if (drag.moved) { cam.x += now.x - prev.x; cam.y += now.y - prev.y; apply(false); } return; }
        if (drag.moved) { drag.n.x = drag.ox + dx; drag.n.y = drag.oy + dy; drag.el.style.left = `${drag.n.x.toFixed(1)}px`; drag.el.style.top = `${drag.n.y.toFixed(1)}px`; drag.el.classList.add('is-dragging'); }
        return;
      }
      cam.x += now.x - prev.x; cam.y += now.y - prev.y; apply(false);
    }
    async function onUp(e) {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (!drag || drag.id !== e.pointerId) return;
      const g = drag; drag = null; g.el.classList.remove('is-dragging'); pointerAt = Date.now();
      if (g.pan) { if (!g.moved) pick(g.n.pin); return; }
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
      await load(); draw({ keep: true });
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
    d.addEventListener('input', (e) => {
      if (e.target?.id === 'usBachecaNoteInput') { const c = $('usBachecaNoteCount'); if (c) c.textContent = noteCount(e.target.value); }
    });
    d.addEventListener('click', (e) => {
      const t = e.target; if (!t?.closest) return;
      if (t.closest('[data-ricordi-cerca]') && !w.UsRicordiCerca) { loadCerca().then(() => w.UsRicordiCerca?.open?.()).catch(() => w.toast?.('La ricerca non si apre: controlla la connessione.')); return; }
      if (t.closest('[data-ub-now]')) { goNow(); return; }
      if (t.closest('[data-ub-all]')) { goAll(); return; }
      if (t.closest('[data-ub-retry]')) { api.show(); return; }
      const roomBtn = t.closest('[data-ub-room]');
      if (roomBtn) { if (roomBtn.dataset.ubRoom === 'go') confirmRoom(); else cancelRoom(); return; }
      const noteBtn = t.closest('[data-ub-note]');
      if (noteBtn) { saveNote(noteBtn.dataset.ubNote === 'remove'); return; }
      const rowBtn = t.closest('[data-ub-row]');
      if (rowBtn) { const host = rowBtn.closest('.ub-row'); if (host) rowAction(host, rowBtn.dataset.ubRow); return; }
      // Enter, Space, a screen reader: the click a finger never makes here
      // (the finger is read by the pointer: tap, double tap, drag).
      const item = t.closest('[data-ub-pin]');
      if (item) {
        if (Date.now() - pointerAt > 800) { const n = nodes[Number(item.dataset.ubI)]; if (n) { if (room) pick(n.pin); else openSheet(n.pin); } }
        return;
      }
      const a = t.closest('[data-ub-act]');
      if (a) { if (a.dataset.ubAct === 'close') closeSheet(); else act(a.dataset.ubAct); }
    });
    // Ready for the bubble at the start of the day, and fresh when the couple changes.
    w.addEventListener?.('us-identity-change', () => { data = null; room = null; if (me()) setTimeout(() => { load().catch(() => {}); }, 1200); });
    api.show = async () => { if (data) draw(); await load(); draw(); };
    api.refresh = async () => { await load(); if (boardOpen()) draw({ keep: true }); };
    api.news = news;
    api.markSeen = markSeen;
    api.closeSheet = closeSheet;
    api.openOn = openOn;
    api.pinThing = pinThing;
    api.memoryRow = memoryRow;
    api.openNoteSheet = openNoteSheet;
    api.inRoom = () => Boolean(room);
    api.cancelRoom = cancelRoom;
  }

  const api = {
    shape, postit, whyOf, cleanNote, noteCount, newestPartnerNote, titleOf, noteAnswers, layout, roadPath, yearMarks, bounds, newsOf, whenLabel, whenShort, install,
    show: async () => {}, refresh: async () => {}, news: () => null, markSeen: () => {}, closeSheet: () => {},
    openOn: () => {}, pinThing: async () => 'no', memoryRow: async () => null, openNoteSheet: () => {}, inRoom: () => false, cancelRoom: () => {},
  };
  return api;
});
