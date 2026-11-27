// US vi ricorda (founder, 25/11/2026; docs/product/2026-11-25-us-vi-ricorda.md,
// tavola «US · US vi ricorda»). US remembers the couple and, rarely, the
// characters say something of theirs: the server plans the day's line
// (get_my_battuta_v1, kind and a few values); this file writes the sentence
// (5 variants a kind, D15), decides when to say it (once a day, 9–21, the
// evening for memories, D3/D12), makes it a speech bubble out of the island
// (personaggi.js UsAngolo.parla, D11/D17) and opens the line's sheet with the
// gesture ready (D7): it never sends anything for anyone.
// «Ti aspetta» is decided here, live (D13), from the «tocca a te» state.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) { root.UsRicorda = api; api.install(root); }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  // The kinds «Non dirmelo più» switches off, as Profilo › Notifiche names them (one switch each).
  const KIND_NAMES = Object.freeze({ compleanno: 'I compleanni', anniversario: 'Gli anniversari', mesiversario: 'I mesiversari', giorni: 'I giorni insieme', un_anno_fa: 'Un anno fa, oggi', traguardo: 'I traguardi', conoscervi: 'Le domande per conoscervi', ti_aspetta: 'Quando tocca a te' });
  const PRIORITY = Object.freeze({ presentazione: 0, compleanno: 1, anniversario: 1, ti_aspetta: 2, bacheca: 2.5, un_anno_fa: 3, mesiversario: 4, giorni: 4, traguardo: 4, conoscervi: 5 });
  const hash = (s) => { let h = 2166136261; for (const c of String(s || '')) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };
  const pick = (list, key) => list[hash(key) % list.length];
  // The date in the app's language (UsI18n.tag), with or without the year.
  const tag = () => (typeof window !== 'undefined' && window.UsI18n?.tag) || 'it-IT';
  const longDate = (iso, { year = true } = {}) => { try { return new Date(`${iso}T12:00:00Z`).toLocaleDateString(tag(), { day: 'numeric', month: 'long', ...(year ? { year: 'numeric' } : {}), timeZone: 'Europe/Rome' }); } catch (_) { return iso || ''; } };
  // «un anno» or «N anni» are written out in each sentence, so every sentence is
  // one entry of the English dictionary (i18n-en.js).

  // The sentences (D15): short, warm, with «tu», never a reproach, no emoji.
  // v: the line's values; p: the partner's name.
  function lines(kind, v, p) {
    // At the start of a sentence the name (or «la tua persona») takes a capital.
    const P = String(p || '').charAt(0).toUpperCase() + String(p || '').slice(1);
    switch (kind) {
      case 'presentazione': return ['Ciao! Da oggi ogni tanto vi ricordiamo le vostre cose: le date, i ricordi, le prime volte.'];
      case 'compleanno':
        if (v.days === 0) return [`Oggi è il compleanno di ${v.name}. Un pensiero vale tantissimo.`, `Oggi compie gli anni ${v.name}. Gliel'hai già detto?`, `È il compleanno di ${v.name}: è la sua giornata.`, `Oggi festeggiamo ${v.name}. Un messaggio, una foto, una voce.`, `Buon compleanno a ${v.name}! Diglielo tu, come sai fare.`];
        if (v.days === 1) return [`Domani è il compleanno di ${v.name}. Hai già un'idea?`, `Manca un giorno al compleanno di ${v.name}.`, `Domani compie gli anni ${v.name}. Ci siamo quasi.`, `Promemoria piccolo: domani è il compleanno di ${v.name}.`, `Domani è il giorno di ${v.name}. Tutto pronto?`];
        return [`Tra 7 giorni è il compleanno di ${v.name}. Ci pensiamo insieme?`, `Una settimana al compleanno di ${v.name}. C'è tempo per una sorpresa.`, `Il ${longDate(v.date, { year: false })} è il compleanno di ${v.name}: mancano 7 giorni.`, `Tra una settimana compie gli anni ${v.name}. Hai già in mente qualcosa?`, `Segnalo io: tra 7 giorni è il compleanno di ${v.name}.`];
      case 'anniversario':
        if (v.days === 0) return v.years === 1
          ? ['Oggi fate un anno insieme.', 'Un anno di voi due. Buon anniversario!', 'È il vostro anniversario: un anno insieme.', 'Oggi è il vostro giorno: un anno.', 'Buon anniversario! Un anno di cose vostre.']
          : [`Oggi fate ${v.years} anni insieme.`, `${v.years} anni di voi due. Buon anniversario!`, `È il vostro anniversario: ${v.years} anni insieme.`, `Oggi è il vostro giorno: ${v.years} anni.`, `Buon anniversario! ${v.years} anni di cose vostre.`];
        return [v.years === 1 ? `Tra una settimana fate un anno insieme. Prepariamo qualcosa per ${p}?` : `Tra una settimana fate ${v.years} anni insieme. Prepariamo qualcosa per ${p}?`, `Manca una settimana al vostro anniversario. Un'idea per ${p}?`, v.years === 1 ? 'Tra 7 giorni sono un anno. Resta tra noi due.' : `Tra 7 giorni sono ${v.years} anni. Resta tra noi due.`, `Una settimana all'anniversario: c'è tempo per una sorpresa.`, `Tra una settimana è il vostro giorno. Ci pensiamo?`];
      case 'mesiversario': return [`Oggi sono ${v.months} mesi insieme.`, `${v.months} mesi di voi due. Buon mesiversario!`, `Un mese in più: oggi sono ${v.months}.`, `Buon mesiversario! ${v.months} mesi, e non è che l'inizio.`, `Oggi fate ${v.months} mesi.`];
      case 'giorni': return [`Oggi sono ${v.days} giorni insieme.`, `${v.days} giorni di voi due.`, `Contati uno a uno: ${v.days} giorni.`, `Oggi fate ${v.days} giorni insieme. Non male!`, `Un numero tondo: ${v.days} giorni.`];
      case 'un_anno_fa':
        if (v.source === 'meet') return [`Un anno fa, il vostro incontro: «${v.title}». Lo ricordi a ${p}?`, `Un anno fa, oggi: «${v.title}».`, `Esattamente un anno fa: «${v.title}».`, `Un anno fa eravate insieme: «${v.title}».`, `Ti ricordi? Un anno fa: «${v.title}».`];
        if (v.source === 'idea') return [`Un anno fa avete fatto «${v.title}». Lo ricordi a ${p}?`, `Un anno fa, oggi: «${v.title}», fatto insieme.`, `Ti ricordi «${v.title}»? Era un anno fa.`, `Un anno fa una vostra idea è diventata vera: «${v.title}».`, `Un anno fa: «${v.title}».`];
        if (v.place) return [`Un anno fa eravate a ${v.place}. Lo mandi a ${p}?`, `Un anno fa, oggi, a ${v.place}.`, `Ti ricordi ${v.place}? Era un anno fa.`, `Esattamente un anno fa: ${v.place}. Lo rimandi a ${p}?`, `Un anno fa a ${v.place}. Che giornata.`];
        return [`Un anno fa avete messo questo ricordo. Lo mandi a ${p}?`, `Un anno fa, oggi: un vostro ricordo.`, `Ti ricordi questo? Era un anno fa.`, `Un anno fa avete fermato questo momento.`, `Un ricordo di un anno fa. Lo rimandi a ${p}?`];
      case 'traguardo':
        if (v.what === 'luogo') return [`La prima volta a ${v.place}: ora è tra i vostri posti.`, `${v.place}: un posto nuovo per voi due.`, `Prima volta a ${v.place}. Lo segno tra i vostri luoghi.`, `Un posto in più: ${v.place}.`, `${v.place} entra nella vostra mappa.`];
        return [`Siete a ${v.count} ricordi insieme.`, `${v.count} ricordi! Che collezione.`, `Avete messo il ricordo numero ${v.count}.`, `${v.count} momenti fermati insieme.`, `Avete raggiunto ${v.count} ricordi.`];
      case 'conoscervi':
        if (v.ask === 'primo_ricordo') return ['Mettete il vostro primo ricordo: da lì comincio a conoscervi.', 'Una foto per cominciare? Il vostro primo ricordo.', 'Il primo ricordo è il più bello da mettere.'];
        return ['Quando è il tuo compleanno? Così me lo ricordo.', 'Non so ancora il tuo compleanno. Me lo dici?', 'Mettiamo il tuo compleanno? Poi ci penso io a ricordarlo.'];
      case 'bacheca':
        // La vostra bacheca (25/11/2026): what US pinned on the board.
        if (v.reason === 'un_anno_fa') return v.place ? [`Vi ho appeso una foto in bacheca: un anno fa eravate a ${v.place}.`, `In bacheca c'è ${v.place}, un anno fa.`, `Ho messo in bacheca un ricordo di un anno fa: ${v.place}.`] : ['Vi ho appeso in bacheca un ricordo di un anno fa.', "In bacheca c'è una foto di un anno fa.", 'Un anno fa, oggi: ve l\'ho appeso in bacheca.'];
        if (v.reason === 'traguardo') return v.what === 'anni' ? (v.count === 1 ? ["In bacheca c'è un timbro nuovo: un anno insieme.", 'Ho appeso i vostri un anno in bacheca.'] : [`In bacheca c'è un timbro nuovo: ${v.count} anni insieme.`, `Ho appeso i vostri ${v.count} anni in bacheca.`]) : [`In bacheca c'è un timbro nuovo: ${v.count} ricordi.`, `Ho appeso i vostri ${v.count} ricordi in bacheca.`];
        if (v.reason === 'tenuta') return ['Ho appeso in bacheca una cosa che avete tenuto.', "In bacheca c'è una cosa vostra di questa settimana."];
        return ['Ho appeso in bacheca il ricordo della settimana.', "In bacheca c'è il ricordo più bello della settimana.", 'Ho sistemato la bacheca: guarda il ricordo della settimana.'];
      case 'ti_aspetta':
        if (v.what === 'game') return [`${P} ha giocato e aspetta te.`, `C'è una partita che ti aspetta: tocca a te.`, `${P} ha fatto la sua mossa. Tocca a te.`];
        return [`${P} ha già risposto alla domanda di oggi. Tocca a te.`, `La risposta di ${p} c'è già: manca la tua.`, `${P} ti aspetta sulla domanda di oggi.`];
      default: return [];
    }
  }
  function sentence(b, partner) {
    const list = lines(b.kind, b.vars || {}, partner || 'la tua persona');
    return list.length ? pick(list, b.ref_key || b.id || b.kind) : '';
  }
  // What the line's button does and says (D7): the gesture, prepared.
  function action(b, partner) {
    const v = b.vars || {};
    switch (b.kind) {
      case 'compleanno': return { label: v.days === 0 ? `Scrivi a ${v.name}` : 'Prepara qualcosa', go: 'lfy', text: v.days === 0 ? 'Tanti auguri ♡' : '' };
      case 'anniversario': return { label: v.days === 0 ? `Scrivi a ${partner}` : 'Prepara una sorpresa', go: 'lfy', text: v.days === 0 ? (v.years === 1 ? 'Un anno di noi ♡' : `${v.years} anni di noi ♡`) : '' };
      case 'mesiversario': return { label: `Scrivi a ${partner}`, go: 'lfy', text: `${v.months} mesi di noi ♡` };
      case 'giorni': return { label: `Scrivi a ${partner}`, go: 'lfy', text: `${v.days} giorni di noi ♡` };
      case 'un_anno_fa': return { label: `Mandalo a ${partner}`, go: v.source === 'moment' && v.path ? 'lfy-photo' : 'lfy', text: `Ti ricordi? ${v.place || v.title || ''}${v.date ? ` · ${longDate(v.date)}` : ''} ♡`.replace('?  ·', '?') };
      case 'traguardo': return { label: 'Apri Ricordi', go: 'moments' };
      case 'bacheca': return { label: 'Apri la bacheca', go: 'bacheca' };
      case 'conoscervi': return v.ask === 'primo_ricordo' ? { label: 'Metti un ricordo', go: 'compose' } : { label: 'Aggiungilo', go: 'birthday', name: v.name };
      case 'ti_aspetta': return v.what === 'game' ? { label: 'Gioca', go: 'games' } : { label: 'Rispondi', go: 'daily' };
      case 'presentazione': return { label: 'Va bene', go: 'close' };
      default: return { label: 'Va bene', go: 'close' };
    }
  }
  // When a line may be said: 9–21 Rome, memories from 17 (D12).
  function inWindow(b, hour) {
    if (hour < 9 || hour >= 21) return false;
    return b.slot !== 'sera' || hour >= 17;
  }
  // The line of the moment: the introduction first, then the strongest.
  function choose({ server, tocca, introduced, mutedKinds, bacheca = null }) {
    const list = [];
    if (!introduced) list.push({ kind: 'presentazione', ref_key: 'presentazione', speaker: 'both', slot: 'mattina', vars: {} });
    if (server) list.push(server);
    if (bacheca && !mutedKinds.has('bacheca')) list.push(bacheca);
    if (tocca && !mutedKinds.has('ti_aspetta')) list.push({ kind: 'ti_aspetta', ref_key: `ti_aspetta:${tocca}`, speaker: 'me', slot: 'mattina', vars: { what: tocca } });
    return list.sort((a, b) => (PRIORITY[a.kind] ?? 9) - (PRIORITY[b.kind] ?? 9))[0] || null;
  }

  function install(w) {
    const d = w.document, $ = (id) => d.getElementById(id);
    const db = () => (typeof sb !== 'undefined' ? sb : null); // eslint-disable-line no-undef
    const me = () => w.usProfile?.id || '';
    // Tests may fix the clock (window.__usRicordaNow = { day, hour }).
    const romeNow = () => { if (w.__usRicordaNow) return w.__usRicordaNow; const s = new Date().toLocaleString('en-CA', { timeZone: 'Europe/Rome', hour12: false }); return { day: s.slice(0, 10), hour: Number(s.slice(12, 14)) % 24 }; };
    const partnerName = () => { try { const n = w.usIdentity?.()?.partnerName; return n && n !== 'La tua persona' ? n : 'la tua persona'; } catch (_) { return 'la tua persona'; } };
    const store = (k, v) => { try { if (v === undefined) return w.localStorage?.getItem(k); w.localStorage?.setItem(k, v); } catch (_) { return null; } return null; };
    const SAID = () => `us:ricorda:v1:${me()}`;
    const INTRO = () => `us:ricorda:intro:v1:${me()}`;
    let server = null, muted = false, mutedKinds = new Set(), loadedDay = '', loading = null, tocca = '', current = null;

    async function load({ force = false } = {}) {
      const client = db(), day = romeNow().day;
      if (!client || !me() || !w.usProfile?.couple_id) return;
      if (!force && loadedDay === day) return;
      if (loading) return loading;
      loading = (async () => {
        try {
          const { data, error } = await client.rpc('get_my_battuta_v1');
          if (error) throw error;
          muted = Boolean(data?.muted);
          server = data?.battuta || null;
          loadedDay = day;
          const kinds = await client.from('us_battute_mute').select('kind');
          mutedKinds = new Set((kinds?.data || []).map((r) => r.kind));
        } catch (error) {
          // A database without US vi ricorda yet: the characters stay quiet.
          console.warn('[US ricorda]', error?.message || error);
          server = null; loadedDay = day;
        } finally { loading = null; paintVoi(); }
      })();
      return loading;
    }
    const saidToday = () => { try { const s = JSON.parse(store(SAID()) || 'null'); return s && s.day === romeNow().day ? s : null; } catch (_) { return null; } };

    let showTimer = 0;
    function maybeSay() {
      clearTimeout(showTimer);
      showTimer = setTimeout(async () => {
        if (d.hidden || !me() || muted || w.UsIntro?.active?.()) return;
        if (!$('home')?.classList.contains('active')) return;
        if (d.body?.getAttribute?.('data-us-surface') === 'open') return;
        if (!w.UsAngolo?.parla) return;
        await load();
        if (muted || saidToday()) return;
        const { hour, day } = romeNow();
        const b = choose({ server: server && !server.seen ? server : null, tocca, introduced: Boolean(store(INTRO())), mutedKinds, bacheca: w.UsBacheca?.news?.() || null });
        if (!b || !inWindow(b, hour)) return;
        const text = sentence(b, partnerName());
        if (!text) return;
        // The board's news opens the board itself; the others open the line's sheet.
        const ok = w.UsAngolo.parla({ text, speaker: b.speaker, cta: action(b, partnerName()).label, onTap: () => (b.kind === 'bacheca' ? run(b) : openSheet(b)), onHold: () => askMute(b) });
        if (!ok) return;
        current = b;
        store(SAID(), JSON.stringify({ day, kind: b.kind, ref: b.ref_key, id: b.id || null }));
        if (b.kind === 'presentazione') store(INTRO(), '1');
        if (b.kind === 'bacheca') w.UsBacheca?.markSeen?.();
        if (b.id) db()?.rpc('mark_my_battuta_v1', { p_id: b.id, p_action: 'seen' }).then(() => {}, () => {});
        paintVoi();
      }, 1400);
    }

    // The line's sheet (tavola, «La scheda della battuta»).
    const sheet = () => $('usBattuta');
    function closeSheet() {
      const s = sheet();
      if (!s?.classList.contains('open')) return;
      const finish = () => { s.classList.remove('open'); s.setAttribute('aria-hidden', 'true'); };
      s.classList.remove('open');
      if (!w.UsUiFoundation?.exitSurface?.(s, finish)) finish();
    }
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    async function openSheet(b) {
      const s = sheet(), body = $('usBattutaBody');
      if (!s || !body || !b) return;
      current = b;
      const P = w.UsPersonaggi, mine = P?.myRole?.() || 'francesco', other = mine === 'beatrice' ? 'francesco' : 'beatrice';
      const chars = b.speaker === 'both' ? [mine, other] : [mine];
      const a = action(b, partnerName());
      const v = b.vars || {};
      body.innerHTML = `<div class="us-battuta-who">
          <span class="us-battuta-chars" aria-hidden="true">${chars.map((r) => P?.character?.(r, { size: 54, reaction: b.kind === 'presentazione' ? 'cuore' : '' }) || '').join('')}</span>
          <p class="us-battuta-text" id="usBattutaText">${esc(sentence(b, partnerName()))}</p>
        </div>
        ${b.kind === 'un_anno_fa' && v.source === 'moment' ? `<figure class="us-battuta-photo"><div class="us-battuta-img" data-battuta-img><span>${esc([v.place, v.date ? longDate(v.date) : ''].filter(Boolean).join(' · '))}</span></div>${v.caption ? `<figcaption>«${esc(v.caption)}»</figcaption>` : ''}</figure>` : ''}
        <div class="us-battuta-actions">
          <button type="button" class="us-battuta-go" data-battuta-go>${esc(a.label)}</button>
          ${a.go === 'close' ? '' : '<button type="button" class="us-battuta-later" data-battuta-later>Non ora</button>'}
        </div>
        ${a.go === 'lfy' || a.go === 'lfy-photo' ? `<p class="us-battuta-note">Si apre Lasciato per te già pronto: scrivi tu e mandi tu.</p>` : ''}
        ${b.kind === 'presentazione' ? '' : '<button type="button" class="us-battuta-never" data-battuta-never>Non dirmelo più</button>'}`;
      w.UsUiFoundation?.cancelSurfaceExit?.(s);
      s.classList.add('open'); s.setAttribute('aria-hidden', 'false');
      if (b.kind === 'un_anno_fa' && v.path && typeof w.usGetSignedUrl === 'function') {
        try {
          const url = await w.usGetSignedUrl(v.path);
          const img = body.querySelector('[data-battuta-img]');
          if (url && img) img.style.backgroundImage = `url("${String(url).replace(/"/g, '%22')}")`;
        } catch (_) {}
      }
    }
    async function attachPhoto(path, caption) {
      // The memory's photo in Lasciato per te, ready to send (the sender still sends).
      try {
        const url = await w.usGetSignedUrl?.(path);
        if (!url) return false;
        const blob = await (await fetch(url)).blob();
        const file = new File([blob], 'ricordo.jpg', { type: blob.type || 'image/jpeg' });
        w.UsLeftForYou?.openComposer?.({ kind: 'photo' });
        const input = $('leftForYouComposerPhotoFile');
        if (!input || typeof DataTransfer !== 'function') return false;
        const dt = new DataTransfer(); dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        const text = $('leftForYouComposerPhotoCaption') || $('leftForYouComposerCaption');
        if (text && caption) { text.value = caption.slice(0, 280); text.dispatchEvent(new Event('input', { bubbles: true })); }
        return true;
      } catch (_) { return false; }
    }
    async function run(b) {
      const a = action(b, partnerName());
      // The ready text goes into a field, which the page translation leaves alone.
      if (a.text && typeof w.usT === 'function') a.text = w.usT(a.text);
      if (b.id) db()?.rpc('mark_my_battuta_v1', { p_id: b.id, p_action: 'done' }).then(() => {}, () => {});
      closeSheet();
      const v = b.vars || {};
      switch (a.go) {
        case 'lfy': w.UsLeftForYou?.openComposer?.(a.text ? { kind: 'text', text: a.text } : { kind: 'text' }); break;
        case 'lfy-photo': if (!(await attachPhoto(v.path, a.text))) w.UsLeftForYou?.openComposer?.({ kind: 'text', text: a.text }); break;
        case 'moments': w.go?.('moments', { nav: true }); break;
        case 'compose': w.go?.('moments', { nav: true }); setTimeout(() => w.UsMomentComposer?.open?.(), 80); break;
        case 'birthday': w.go?.('bond', { nav: true }); setTimeout(() => w.openEventEditor?.(null, null, { title: (typeof w.usT === 'function' ? w.usT : String)(`Compleanno di ${a.name || ''}`.trim()) }), 80); break;
        case 'daily': w.openToday?.(); break;
        case 'games': w.openQuizHub?.({ nav: true }); break;
        case 'bacheca': w.go?.('moments', { nav: true }); setTimeout(() => w.UsRicordiPlace?.setView?.('board'), 80); break;
        default: break;
      }
    }
    async function askMute(b) {
      if (!b || b.kind === 'presentazione') return;
      const ok = await w.UsUiFoundation?.confirm?.({ title: 'Non dirmelo più?', body: 'Non ti diremo più cose di questo tipo. Puoi riaccenderle da Profilo › Notifiche.', confirmLabel: 'Non dirmelo più', cancelLabel: 'Annulla' });
      if (!ok) return;
      // Muted only once the server keeps it: otherwise it says so and nothing changes.
      let saved = false;
      try { const r = await db()?.rpc('set_my_battute_mute_v1', { p_kind: b.kind, p_muted: true }); saved = Boolean(r) && !r.error; } catch (_) { saved = false; }
      if (!saved) { w.toast?.('Non riesco a salvarlo. Riprova.'); return; }
      mutedKinds.add(b.kind);
      closeSheet();
      w.UsAngolo?.isola?.(false);
    }
    // Profilo › Notifiche: the switches as the server keeps them ('*' all off, or one kind).
    async function loadMutes() {
      const client = db();
      if (!client?.from || !me()) return null;
      try {
        const { data, error } = await client.from('us_battute_mute').select('kind');
        if (error) throw error;
        const kinds = (data || []).map((r) => r?.kind).filter(Boolean);
        muted = kinds.includes('*');
        mutedKinds = new Set(kinds.filter((k) => k !== '*'));
        return { voci: !muted, kinds: Object.keys(KIND_NAMES).filter((k) => mutedKinds.has(k)) };
      } catch (error) {
        console.warn('[US ricorda] mutes', error?.message || error);
        return null;
      }
    }
    // One kind back on (or off again), from Profilo › Notifiche.
    async function setKind(kind, on) {
      if (!KIND_NAMES[kind]) return false;
      try {
        const r = await db()?.rpc('set_my_battute_mute_v1', { p_kind: kind, p_muted: !on });
        if (!r || r.error) return false;
      } catch (_) { return false; }
      if (on) mutedKinds.delete(kind); else mutedKinds.add(kind);
      return true;
    }
    d.addEventListener('click', (e) => {
      const t = e.target;
      if (!t?.closest) return;
      if (t.closest('[data-battuta-close]')) { closeSheet(); return; }
      if (t.closest('[data-battuta-go]') && current) { run(current); return; }
      if (t.closest('[data-battuta-later]') && current) {
        if (current.id) db()?.rpc('mark_my_battuta_v1', { p_id: current.id, p_action: 'later' }).then(() => {}, () => {});
        closeSheet(); return;
      }
      if (t.closest('[data-battuta-never]') && current) { askMute(current); return; }
      if (t.closest('[data-battuta-oggi]')) { const s = saidToday(); const b = s && (s.id && server?.id === s.id ? server : current); if (b) openSheet(b); }
    });
    d.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheet()?.classList.contains('open')) closeSheet(); });

    // Voi: «Oggi ti ho detto» (tavola, scheda Voi), until the evening.
    function paintVoi() {
      const card = $('usAngoloOggi');
      if (!card) return;
      const s = saidToday();
      const b = s ? (server && server.id && s.id === server.id ? server : current && current.ref_key === s.ref ? current : null) : null;
      if (!b) { card.hidden = true; card.innerHTML = ''; return; }
      const P = w.UsPersonaggi, mine = P?.myRole?.() || 'francesco';
      card.hidden = false;
      card.innerHTML = `<button type="button" class="us-angolo-oggi-row" data-battuta-oggi>
          <span class="us-angolo-oggi-char" aria-hidden="true">${P?.character?.(mine, { size: 40 }) || ''}</span>
          <span class="us-angolo-oggi-copy"><small>Oggi ti ho detto</small><span>${esc(sentence(b, partnerName()))}</span></span>
          <em>${esc(action(b, partnerName()).label)}</em>
        </button>`;
    }

    // Muted or not, for Profilo › Notifiche (D22).
    async function setVoci(on) {
      muted = !on;
      const { error } = (await db()?.rpc('set_my_battute_mute_v1', { p_kind: '*', p_muted: !on })) || {};
      if (error) { muted = on; return false; }
      if (!on) w.UsAngolo?.isola?.(false);
      return true;
    }

    // Moments to try: the app ready, back on Oggi, back in the app, «tocca a te».
    w.addEventListener('us:tocca-a-te', (e) => { tocca = e?.detail?.daily ? 'daily' : e?.detail?.game ? 'game' : ''; maybeSay(); });
    w.addEventListener('us-identity-change', () => { loadedDay = ''; maybeSay(); });
    // The intro held the line back while it was open: it is tried again when it closes.
    w.addEventListener('us:intro-done', () => maybeSay());
    d.addEventListener('visibilitychange', () => { if (!d.hidden) maybeSay(); });
    const home = $('home');
    if (home && typeof w.MutationObserver === 'function') new w.MutationObserver(() => { if (home.classList.contains('active')) maybeSay(); }).observe(home, { attributes: true, attributeFilter: ['class'] });
    let tries = 0;
    const boot = () => { if (w.usProfile?.couple_id) maybeSay(); else if (tries++ < 40) setTimeout(boot, 500); };
    if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();

    const api = w.UsRicorda;
    api.load = load; api.say = maybeSay; api.open = openSheet; api.close = closeSheet; api.setVoci = setVoci;
    api.loadMutes = loadMutes; api.setKind = setKind; api.mutedKinds = () => Object.keys(KIND_NAMES).filter((k) => mutedKinds.has(k));
    api.voci = () => !muted; api.state = () => ({ server, muted, tocca, said: saidToday() });
  }

  return { PRIORITY, KIND_NAMES, lines, sentence, action, inWindow, choose, hash, install };
});
