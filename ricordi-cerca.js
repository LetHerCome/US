// La lente di Ricordi (founder, grill 27/11/2026 D1–D16, tavole «Lente»,
// «Risultati», «Appendi»): one lens in the head of Ricordi, the same for
// Raccolta, Bacheca and Mappa. A field and three filters (chi, anno, posto);
// with the field empty, quick searches. The search runs on the server
// (search_ricordi_v1: only your couple, only what you kept, at most 60) and the
// results come mixed, month by month: photos as polaroids, kept letters as
// envelopes, kept answers as notes. A result opens with «Sulla bacheca» (the
// post-its, «Appendi in bacheca» or «Vedilo in bacheca», bacheca.js).
// Free for everyone. The words typed are never kept on the phone.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) { root.UsRicordiCerca = api; api.install(); }
})(typeof window !== 'undefined' ? window : null, function (w) {
  'use strict';

  const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const DELAY_MS = 280;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const parts = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null; };
  function monthLabel(iso) { const p = parts(iso); return p ? `${MONTHS[p.m - 1]} ${p.y}` : ''; }
  function dayLabel(iso) { const p = parts(iso); return p ? `${p.d} ${MONTHS[p.m - 1]} ${p.y}` : ''; }

  // The results, month by month, newest first (the server already orders them).
  function groupByMonth(results) {
    const groups = [];
    for (const r of results || []) {
      const key = String(r.date || '').slice(0, 7);
      let g = groups.at(-1);
      if (!g || g.key !== key) { g = { key, label: monthLabel(r.date), items: [] }; groups.push(g); }
      g.items.push(r);
    }
    return groups;
  }
  function countLabel(n) { return n === 0 ? 'Nessun ricordo' : n === 1 ? 'Un ricordo' : `${n} ricordi`; }
  function criteria(s) { return Boolean(String(s.q || '').trim().length >= 2 || s.year || s.month || s.place || s.who); }
  // The quick searches of the empty field (D9): a year ago when there is
  // something, the couple's years, its three places, «Le mie», «Di <nome>».
  function quickSearches(hints, partner) {
    const out = [];
    const ago = hints?.year_ago;
    if (ago && Number(ago.count) > 0) out.push({ kind: 'ago', label: 'Un anno fa', set: { year: ago.year, month: ago.month } });
    for (const y of (hints?.years || []).slice(0, 4)) out.push({ kind: 'year', label: String(y), set: { year: y } });
    for (const p of (hints?.places || []).slice(0, 3)) out.push({ kind: 'place', label: p, set: { place: p } });
    out.push({ kind: 'who', label: 'Le mie', set: { who: 'me' } });
    out.push({ kind: 'who', label: `Di ${partner}`, set: { who: 'partner' } });
    return out;
  }

  function install() {
    const d = w.document, $ = (id) => d.getElementById(id);
    const db = () => (typeof sb !== 'undefined' ? sb : null); // eslint-disable-line no-undef
    const partner = () => { try { const n = w.usIdentity?.()?.partnerName; return n && n !== 'La tua persona' ? n : 'la tua persona'; } catch (_) { return 'la tua persona'; } };
    const myName = () => String(w.usProfile?.display_name || '').trim() || 'te';
    const overlay = () => $('usRicordiCerca');
    const body = () => $('usRicordiCercaBody');
    const input = () => $('usRicordiCercaInput');
    let state = { q: '', year: null, month: null, place: null, who: null };
    let results = null, hints = null, seq = 0, timer = null, detail = null, busy = false, failed = false;

    async function fetchNow() {
      const mine = ++seq;
      const s = { ...state };
      if (!db()) return;
      busy = criteria(s);
      if (busy) render();
      try {
        const { data: res, error } = await db().rpc('search_ricordi_v1', {
          p_query: String(s.q || '').trim().length >= 2 ? String(s.q).trim().slice(0, 80) : null,
          p_year: s.year || null, p_place: s.place || null, p_who: s.who || null, p_month: s.month || null,
        });
        if (error) throw error;
        if (mine !== seq) return;
        hints = res?.hints || hints;
        results = criteria(s) ? (res?.results || []) : null;
        failed = false;
      } catch (error) {
        if (mine !== seq) return;
        console.warn('[US Ricordi] cerca', error?.message || error);
        failed = true;
      }
      busy = false;
      render();
    }
    function run(now = false) {
      clearTimeout(timer);
      detail = null;
      if (now) fetchNow(); else timer = setTimeout(fetchNow, DELAY_MS);
    }

    function filtersMarkup() {
      const years = hints?.years || [];
      const places = hints?.places || [];
      const who = (value, label) => `<button type="button" class="rc-chip" data-rc-who="${value}" aria-pressed="${String((state.who || '') === value)}">${esc(label)}</button>`;
      const ago = state.month ? `<button type="button" class="rc-chip is-on" data-rc-clear="month" aria-label="${esc(`Togli il filtro: ${MONTHS[state.month - 1]} ${state.year || ''}`.trim())}">${esc(`${MONTHS[state.month - 1]} ${state.year || ''}`.trim())} ×</button>` : '';
      return `<div class="rc-filters" role="group" aria-label="Filtri">`
        + `<div class="rc-who">${who('', 'Tutti')}${who('me', 'Le mie')}${who('partner', `Di ${partner()}`)}</div>`
        + `<label class="rc-select"><span class="noi-sr">Anno</span><select data-rc-year aria-label="Anno"><option value="">Anno</option>${years.map((y) => `<option value="${esc(y)}"${Number(state.year) === Number(y) ? ' selected' : ''}>${esc(y)}</option>`).join('')}</select></label>`
        + `<label class="rc-select"><span class="noi-sr">Posto</span><select data-rc-place aria-label="Posto"><option value="">Posto</option>${places.map((p) => `<option value="${esc(p)}"${state.place === p ? ' selected' : ''} translate="no">${esc(p)}</option>`).join('')}</select></label>`
        + ago
        + '</div>';
    }
    function emptyMarkup() {
      const quick = quickSearches(hints, partner());
      const pinIcon = '<span class="us-icon" data-us-icon="map-pin" aria-hidden="true"></span>';
      return `<section class="rc-quick" aria-labelledby="rcQuickTitle"><h3 class="rc-kicker" id="rcQuickTitle">Ricerche veloci</h3>`
        + `<div class="rc-quick-list">${quick.map((s, i) => `<button type="button" class="rc-chip${s.kind === 'place' ? ' is-place' : ''}" data-rc-quick="${i}"${s.kind === 'place' ? ' translate="no"' : ''}>${s.kind === 'place' ? pinIcon : ''}${esc(s.label)}</button>`).join('')}</div></section>`
        + '<section class="rc-where"><h3 class="rc-kicker">Dove cerca</h3><p>Didascalie, posti, post-it di US e vostri, mese e anno, chi l’ha messo, le lettere e le risposte che avete tenuto. Mai in quello che non avete tenuto.</p></section>'
        + '<div class="rc-hello"><span class="us-icon" data-us-icon="magnifying-glass" aria-hidden="true"></span><p>Cosa cercate oggi?</p></div>';
    }
    function itemMarkup(r, i) {
      const c = r.content || {};
      const pinned = r.pin ? '<span class="rc-pinned" role="img" aria-label="Già in bacheca"></span>' : '';
      const when = dayLabel(r.date);
      if (r.kind === 'keepsake') {
        const answer = String(c.francesco || c.beatrice || '').slice(0, 70);
        return `<button type="button" class="rc-item rc-note" data-rc-open="${i}" aria-label="${esc(`Risposta tenuta: ${c.question || ''}, ${when}`)}">${pinned}<span class="rc-note-kind">Risposta tenuta</span><span class="rc-note-text" translate="no">${esc(answer || c.question || '')}</span></button>`;
      }
      if (r.kind === 'conserva' && c.kind !== 'photo') {
        return `<button type="button" class="rc-item rc-letter" data-rc-open="${i}" aria-label="${esc(`Lettera tenuta, ${when}`)}">${pinned}<span class="rc-flap" aria-hidden="true"></span><span class="rc-letter-text" translate="no">«${esc(String(c.body || '').slice(0, 60))}»</span></button>`;
      }
      const words = String(c.caption || c.place || '').slice(0, 40);
      return `<button type="button" class="rc-item rc-pol" data-rc-open="${i}" aria-label="${esc([words || 'Un ricordo', when].filter(Boolean).join(', '))}">${pinned}<span class="rc-photo"${c.path ? ` data-rc-path="${esc(c.path)}"` : ''}></span>${words ? `<span class="rc-cap" translate="no">${esc(words)}</span>` : ''}</button>`;
    }
    function resultsMarkup() {
      const list = results || [];
      const head = `<div class="rc-count" aria-live="polite">${busy ? 'Cerco…' : esc(countLabel(list.length))}</div>`;
      if (failed && !list.length) return head + '<div class="rc-none" role="alert"><p>La ricerca non risponde.</p><button type="button" class="primary" data-rc-retry>Riprova</button></div>';
      if (!busy && !list.length) return head + '<div class="rc-none"><p>Niente qui: provate un’altra parola, o un anno.</p></div>';
      let i = -1;
      return head + groupByMonth(list).map((g) => `<section class="rc-month"><h3 class="rc-month-title">${esc(g.label)}</h3><div class="rc-grid">${g.items.map((r) => itemMarkup(r, (i += 1))).join('')}</div></section>`).join('');
    }
    function titleOf(r) {
      const c = r?.content || {};
      if (r?.kind === 'keepsake') return String(c.question || 'Una risposta tenuta');
      if (r?.kind === 'conserva') return c.kind === 'photo' ? 'Una foto tenuta' : 'Una lettera tenuta';
      return String(c.caption || c.place || 'Un ricordo');
    }
    function detailMarkup(r, i, total) {
      const c = r.content || {};
      const by = r.by ? (r.mine ? myName() : partner()) : '';
      const head = `<div class="rc-detail-head"><button type="button" class="rc-back" data-rc-back aria-label="Torna ai risultati"><span class="us-icon" data-us-icon="caret-left" aria-hidden="true"></span></button><span class="rc-detail-count">${esc(state.q.trim() ? `«${state.q.trim()}» · ${i + 1} di ${total}` : `${i + 1} di ${total}`)}</span></div>`;
      let media = '';
      if (r.kind === 'keepsake') {
        const answers = ['francesco', 'beatrice'].map((role) => String(c[role] || '').trim()).filter(Boolean);
        media = `<div class="rc-big-note"><span class="rc-note-kind">La domanda</span><p translate="no">${esc(c.question || '')}</p>${answers.map((a) => `<p class="rc-big-ans" translate="no">${esc(a)}</p>`).join('')}</div>`;
      } else if (r.kind === 'conserva' && c.kind !== 'photo') {
        media = `<div class="rc-big-letter"><span class="rc-flap" aria-hidden="true"></span><p translate="no">«${esc(c.body || '')}»</p></div>`;
      } else {
        media = `<div class="rc-big-photo"${c.path ? ` data-rc-path="${esc(c.path)}"` : ''}></div>`;
      }
      const card = r.kind === 'moment' ? d.querySelector(`#momentsGrid .moment-card[data-moment-id="${String(r.id).replace(/"/g, '')}"]`) : null;
      return head + media
        + `<div class="rc-detail-text"><h2 class="rc-detail-title" translate="no">${esc(titleOf(r))}</h2><p class="rc-detail-by">${esc([dayLabel(r.date), by ? `di ${by}` : ''].filter(Boolean).join(' · '))}</p>${c.place && c.caption ? `<p class="rc-detail-place" translate="no">${esc(c.place)}</p>` : ''}</div>`
        + `<section class="rc-row" id="usRicordiCercaRow" hidden></section>`
        + (card ? '<button type="button" class="rc-open-album" data-rc-album>Apri il ricordo</button>' : '');
    }
    function render() {
      const el = body(); if (!el) return;
      if (detail !== null && results?.[detail]) {
        const r = results[detail];
        el.innerHTML = detailMarkup(r, detail, results.length);
        paint();
        w.UsBacheca?.memoryRow?.($('usRicordiCercaRow'), { ref: r.ref_key, title: titleOf(r), onChange: () => fetchNow() });
        return;
      }
      el.innerHTML = criteria(state) ? filtersMarkup() + resultsMarkup() : emptyMarkup();
      paint();
    }
    async function paint() {
      for (const ph of body()?.querySelectorAll?.('[data-rc-path]') || []) {
        const path = ph.dataset.rcPath;
        if (!path || typeof w.usGetSignedUrl !== 'function') continue;
        try {
          const url = await w.usGetSignedUrl(path);
          if (url && ph.isConnected && !ph.querySelector('img')) ph.innerHTML = `<img src="${esc(url)}" alt="" loading="lazy" decoding="async">`;
        } catch (_) {}
      }
    }

    function open() {
      const o = overlay(); if (!o) return;
      w.UsUiFoundation?.cancelSurfaceExit?.(o);
      o.classList.add('open'); o.setAttribute('aria-hidden', 'false');
      detail = null;
      render();
      fetchNow();
      setTimeout(() => input()?.focus?.({ preventScroll: true }), 60);
    }
    function close() {
      const o = overlay(); if (!o?.classList.contains('open')) return;
      clearTimeout(timer); seq += 1;
      const done = () => {
        o.classList.remove('open'); o.setAttribute('aria-hidden', 'true');
        // Nothing typed stays behind.
        state = { q: '', year: null, month: null, place: null, who: null }; results = null; detail = null;
        if (input()) input().value = '';
        if (body()) body().innerHTML = '';
      };
      o.classList.remove('open');
      if (w.UsUiFoundation?.exitSurface) w.UsUiFoundation.exitSurface(o, done); else done();
    }
    function back() {
      if (detail !== null) { const at = detail; detail = null; render(); body()?.querySelector?.(`[data-rc-open="${at}"]`)?.focus?.({ preventScroll: true }); return; }
      close();
    }
    const isOpen = () => Boolean(overlay()?.classList.contains('open'));

    d.addEventListener('click', (e) => {
      const t = e.target; if (!t?.closest) return;
      if (t.closest('[data-ricordi-cerca]')) { open(); return; }
      if (!t.closest('#usRicordiCerca')) return;
      if (t.closest('[data-rc-close]')) { close(); return; }
      if (t.closest('[data-rc-back]')) { back(); return; }
      if (t.closest('[data-rc-retry]')) { run(true); return; }
      const quick = t.closest('[data-rc-quick]');
      if (quick) {
        const s = quickSearches(hints, partner())[Number(quick.dataset.rcQuick)];
        if (s) { state = { ...state, year: null, month: null, place: null, who: null, ...s.set }; run(true); }
        return;
      }
      const whoBtn = t.closest('[data-rc-who]');
      if (whoBtn) { state.who = whoBtn.dataset.rcWho || null; run(true); return; }
      if (t.closest('[data-rc-clear]')) { state.month = null; state.year = null; run(true); return; }
      const item = t.closest('[data-rc-open]');
      if (item) { detail = Number(item.dataset.rcOpen); render(); body()?.querySelector?.('[data-rc-back]')?.focus?.({ preventScroll: true }); return; }
      if (t.closest('[data-rc-album]')) {
        const r = results?.[detail];
        const card = r && d.querySelector(`#momentsGrid .moment-card[data-moment-id="${String(r.id).replace(/"/g, '')}"]`);
        if (card) { close(); setTimeout(() => card.click?.(), 80); }
      }
    });
    d.addEventListener('change', (e) => {
      const t = e.target; if (!t?.closest?.('#usRicordiCerca')) return;
      if (t.matches?.('[data-rc-year]')) { state.year = t.value ? Number(t.value) : null; state.month = null; run(true); }
      if (t.matches?.('[data-rc-place]')) { state.place = t.value || null; run(true); }
    });
    d.addEventListener('input', (e) => {
      if (e.target?.id !== 'usRicordiCercaInput') return;
      state.q = String(e.target.value || '').slice(0, 80);
      run();
    });
    d.addEventListener('keydown', (e) => {
      if (!isOpen()) return;
      if (e.key === 'Escape' && !d.getElementById('usBachecaSheet')?.classList.contains('open')) { e.preventDefault(); back(); }
      if (e.key === 'Enter' && e.target?.id === 'usRicordiCercaInput') { e.preventDefault(); run(true); }
    });
    w.addEventListener?.('us-identity-change', () => { hints = null; close(); });

    api.open = open;
    api.close = close;
    api.back = back;
    api.isOpen = isOpen;
  }

  const api = { groupByMonth, countLabel, criteria, quickSearches, monthLabel, dayLabel, install, open: () => {}, close: () => {}, back: () => {}, isOpen: () => false };
  return api;
});
