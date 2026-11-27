// US — the intro led by your character (tavola «L'intro col tuo personaggio», approved 26/11/2026).
// Right after «Entra in US», once per person on their own phone, your character walks you through
// Oggi in eight stops: it lights the real thing, says it in a sentence, you tap Avanti. The other
// person's character drops two lines. «Salta» always; «Rivedi l'intro» in the Profilo starts it again.
// It lights and explains, never acts for anyone: nothing is tapped or sent on your behalf.
// Before the tour, whoever never made their character makes it (shape and colour, 27/11/2026).
(() => {
'use strict';
if (window.UsIntro) return;
const d = document, w = window;
const $ = (id) => d.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SEEN = () => `us:intro:v1:${w.usProfile?.id || ''}`;
const reduced = () => d.documentElement?.dataset?.usMotion === 'reduced' || Boolean(w.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
const store = { get: (k) => { try { return w.localStorage?.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { w.localStorage?.setItem(k, v); } catch (_) { /* private mode: it can show again */ } } };

const P = () => w.UsPersonaggi;
const me = () => P()?.myRole?.() || 'francesco';
const other = () => (me() === 'beatrice' ? 'francesco' : 'beatrice');
function nameOf(role, fallback) {
  try { return w.UsIdentity?.current?.()?.nameForRole?.(role) || fallback; } catch (_) { return fallback; }
}
const visible = (el) => { if (!el || el.closest('[hidden]')) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
const firstVisible = (selector) => [...d.querySelectorAll(selector)].find(visible) || null;

// Your character before the tour (founder, 27/11/2026): whoever never made it (the update, or a
// setup left as it was) first picks its shape and colour here; the guardaroba stays in the angolo,
// where its pieces unlock. «Rivedi l'intro» shows it too, with what you have now.
const profiles = () => { try { return w.UsCoupleContext?.snapshot?.()?.profiles || []; } catch (_) { return []; } };
const mine = () => profiles().find((p) => p?.id && p.id === w.usProfile?.id) || null;
const made = () => Boolean(mine()?.character_shape || mine()?.person_color || w.usProfile?.character_shape || w.usProfile?.person_color);
const client = () => (typeof sb !== 'undefined' ? sb : null); // eslint-disable-line no-undef
const canMake = () => Boolean(client()?.rpc && w.usProfile?.couple_id && P()?.character && P()?.SHAPES?.length);

// The stops. target: what is lit (none for the welcome); other: the line of the other person;
// maker: the shapes and the colours, in the bubble.
function steps({ force = false } = {}) {
  const name = nameOf(me(), ''), theirs = nameOf(other(), 'la tua persona');
  const maker = canMake() && (force || !made());
  return [
    // Whole sentences, with and without the name, so the English dictionary finds each one.
    ...(maker ? [{ id: 'crea', maker: true, say: name ? `Prima del giro, crea me, ${name}: sono il tuo personaggio. Scegli la mia forma e il mio colore. Ti seguo in tutta l’app, anche nei widget.` : 'Prima del giro, crea me: sono il tuo personaggio. Scegli la mia forma e il mio colore. Ti seguo in tutta l’app, anche nei widget.', cta: 'Eccomi', reaction: 'saluta' }] : []),
    { id: 'ciao', say: maker ? 'Eccomi! Ora ti faccio fare un giro di US: ci vuole un minuto.' : name ? `Ciao ${name}! Sono il tuo personaggio. Ti faccio fare un giro di US: ci vuole un minuto.` : 'Ciao! Sono il tuo personaggio. Ti faccio fare un giro di US: ci vuole un minuto.', cta: 'Andiamo', reaction: maker ? 'festa' : 'saluta' },
    { id: 'domanda', target: () => firstVisible('#usDailyRitual'), say: 'Ogni giorno qui c’è una domanda per voi due: rispondete, poi leggete cosa ha scritto l’altra persona.' },
    { id: 'tipenso', target: () => firstVisible('#thinkButton'), round: true, say: `Questo è il Ti penso: un tocco e ${theirs} riceve il tuo pensiero, anche da lontano.`, other: 'Io lo aspetto, eh.' },
    { id: 'noi', target: () => firstVisible('.us-nav [data-page="bond"]'), say: 'In Noi c’è il vostro tempo: il calendario, la lavagna e i post-it che vi lasciate.' },
    { id: 'ricordi', target: () => firstVisible('.us-nav [data-page="moments"]'), say: 'In Ricordi mettete le vostre foto, mese per mese. Diventano il vostro album.' },
    { id: 'gioca', target: () => firstVisible('.us-nav [data-page="quiz"]'), say: 'In Gioca ci sono i giochi da fare in due: tre partite al giorno, per conoscervi ancora.' },
    { id: 'profilo', target: () => firstVisible('#home [data-us-self], .top [data-us-self]'), round: true, say: 'Qui in alto a destra ci sono io: toccami e apri il tuo Profilo, con le Impostazioni, i colori, le notifiche e la vostra data.' },
    { id: 'angolo', target: () => firstVisible('#usIsola'), pill: true, island: true, say: 'Questo è il logo di US: toccalo e si apre la barra con voi due e il vostro livello. Tocca la barra ed entri nel vostro angolo: il guardaroba e i premi.', other: 'Ci vediamo qui ogni giorno!', cta: 'Fine', reaction: 'cuore' }
  ];
}

let root = null, list = [], at = 0, open = false, returnFocus = null, timers = [], closing = 0;
// A stop whose thing is not on screen yet is waited for a moment, then left out (27/11/2026).
const TARGET_WAIT = 1500;
let waitUntil = 0, waitTimer = 0, settleTimer = 0;
const ready = (step) => !step?.target || Boolean(step.target());
function settle() {
  if (Date.now() < waitUntil) return;
  list = list.filter((step, i) => i <= at || ready(step));
}
const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
function clearTimers() { timers.forEach(clearTimeout); timers = []; }

function build() {
  if (root) return root;
  root = d.createElement('div');
  root.className = 'us-intro';
  root.id = 'usIntro';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'usIntroSay');
  root.hidden = true;
  root.innerHTML = `<div class="us-intro-hole is-none" data-intro-hole></div>
    <div class="us-intro-guide" data-intro-guide aria-hidden="true"></div>
    <div class="us-intro-other" data-intro-other aria-hidden="true"><p class="us-intro-other-say" data-intro-other-say></p><span data-intro-other-char></span></div>
    <div class="us-intro-bubble" data-intro-bubble>
      <p class="us-intro-say" id="usIntroSay" aria-live="polite"></p>
      <div class="us-intro-maker" data-intro-maker hidden></div>
      <div class="us-intro-foot"><span class="us-intro-dots" data-intro-dots aria-hidden="true"></span><span class="us-intro-btns"><button type="button" class="us-intro-skip" data-intro-skip>Salta</button><button type="button" class="us-intro-next" data-intro-next>Avanti</button></span></div>
    </div>`;
  d.body.appendChild(root);
  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-intro-next]')) { next(); return; }
    if (event.target.closest('[data-intro-skip]')) { finish(); return; }
    const shape = event.target.closest('[data-intro-shape]');
    if (shape) { pickShape(shape.dataset.introShape); return; }
    const colour = event.target.closest('[data-intro-colour]');
    if (colour && !colour.disabled) pickColour(colour.dataset.introColour);
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); finish(); }
    // The focus stays inside the intro's buttons (Salta, Avanti and the maker's) while it is open.
    if (event.key === 'Tab') {
      const buttons = [...root.querySelectorAll('button')].filter((b) => !b.hidden && !b.disabled && !b.closest('[hidden]'));
      const i = buttons.indexOf(d.activeElement);
      if (event.shiftKey && i <= 0) { event.preventDefault(); buttons[buttons.length - 1]?.focus(); }
      else if (!event.shiftKey && i === buttons.length - 1) { event.preventDefault(); buttons[0]?.focus(); }
    }
  });
  w.addEventListener('resize', () => { if (open) place(list[at]); });
  return root;
}

// The shape just picked shows at once, before the couple is read again.
let shapeNow = null, colourNow = null, saving = false;
const myShape = () => shapeNow || P()?.shapeOf?.(me()) || '';
function character(role, reaction, size, shape) {
  const s = shape || (role === me() ? shapeNow : null);
  try { return P()?.character?.(role, { size, reaction, ...(s ? { shape: s } : {}) }) || ''; } catch (_) { return ''; }
}

// The maker: the five shapes with your character in each, the eight colours (the other person's is theirs).
const STAND_IN = '~partner';
function coupleNow() {
  const list = profiles().map((p) => ({ ...p }));
  let self = list.find((p) => p.id === w.usProfile?.id);
  if (!self && w.usProfile?.id) { self = { id: w.usProfile.id, role: me(), person_color: w.usProfile.person_color || null }; list.push(self); }
  if (self && colourNow !== null) self.person_color = colourNow;
  // The other profile not read yet: their usual colour is taken already, as in the setup.
  if (!list.some((p) => p?.id && p.id !== w.usProfile?.id)) list.push({ id: STAND_IN, role: other(), person_color: null });
  return list;
}
// The couple's colours on the page: only real profiles.
const realCouple = () => coupleNow().filter((p) => p.id !== STAND_IN);
function makerMarkup() {
  const role = me(), names = P()?.SHAPE_NAMES || {}, theirName = nameOf(other(), '');
  const whose = theirName ? `è di ${theirName}` : 'è della tua persona';
  const shapes = (P()?.SHAPES || []).map((s) => `<button type="button" class="us-intro-shape" data-intro-shape="${esc(s)}" aria-pressed="${s === myShape()}">${character(role, '', 40, s)}<span>${esc(names[s] || s)}</span></button>`).join('');
  const colours = (w.UsPersonColors?.choices?.(coupleNow(), w.usProfile?.id) || []).map((c) => `<button type="button" class="us-intro-swatch" data-intro-colour="${esc(c.id)}" aria-pressed="${c.mine}" aria-label="${esc(c.taken ? `${c.name}, ${whose}` : c.name)}"${c.taken ? ' disabled' : ''}><i style="background:${esc(c.hex)}"></i></button>`).join('');
  return `<p class="us-intro-maker-label">La forma</p><div class="us-intro-shapes" role="group" aria-label="La forma">${shapes}</div>`
    + (colours ? `<p class="us-intro-maker-label">Il colore</p><div class="us-intro-swatches" role="group" aria-label="Il colore">${colours}</div>` : '')
    + '<p class="us-intro-maker-note">Gli accessori arrivano dopo: li sbloccate insieme, nel vostro angolo.</p>';
}
function paintMaker(step) {
  const host = root?.querySelector('[data-intro-maker]');
  if (!host) return;
  host.hidden = !step?.maker;
  if (!step?.maker) { host.innerHTML = ''; return; }
  const focused = d.activeElement && host.contains(d.activeElement) ? (d.activeElement.dataset.introShape ? `[data-intro-shape="${d.activeElement.dataset.introShape}"]` : `[data-intro-colour="${d.activeElement.dataset.introColour}"]`) : '';
  host.innerHTML = makerMarkup();
  if (focused) host.querySelector(focused)?.focus({ preventScroll: true });
}
function repaintMe() {
  const step = list[at];
  root.querySelector('[data-intro-guide]').innerHTML = character(me(), step?.reaction || '', 72);
  paintMaker(step);
}
async function save(rpc, args) {
  const db = client();
  if (!db?.rpc) return false;
  try {
    const r = await db.rpc(rpc, args);
    if (r?.error) throw r.error;
    w.UsFeedback?.selection?.();
    Promise.resolve(w.UsCoupleContext?.hydrate?.()).catch(() => {});
    return true;
  } catch (error) {
    const m = String(error?.message || '');
    w.toast?.(/partner color/.test(m) ? `È il colore di ${nameOf(other(), 'la tua persona')}` : /plus required/.test(m) ? 'Il colore si sblocca con US Plus' : 'Non riesco a salvarlo, riprova');
    return false;
  }
}
async function pickShape(shape) {
  if (saving || !P()?.SHAPES?.includes(shape) || shape === myShape()) return;
  const before = shapeNow;
  saving = true; shapeNow = shape; repaintMe();
  if (!(await save('set_my_character_shape', { p_shape: shape }))) { shapeNow = before; repaintMe(); }
  saving = false;
}
async function pickColour(colour) {
  if (saving || !w.UsPersonColors?.PALETTE?.[colour]) return;
  const before = colourNow;
  saving = true; colourNow = colour;
  w.UsPersonColors.applyCoupleColors?.(realCouple());
  repaintMe();
  if (!(await save('set_my_color', { p_color: colour }))) {
    colourNow = before;
    w.UsPersonColors.applyCoupleColors?.(realCouple());
    repaintMe();
  }
  saving = false;
}

// Where things go: the light around the target; the character next to it, on the side with room;
// the bubble beyond the character, its tail pointing at it.
function place(step) {
  if (!root || !step) return;
  const vw = w.innerWidth, vh = w.innerHeight, guide = root.querySelector('[data-intro-guide]'), hole = root.querySelector('[data-intro-hole]'), bubble = root.querySelector('[data-intro-bubble]');
  const target = step.target?.() || null;
  const g = Math.round(Math.min(72, vw * 0.18));
  let gx, gy, below;
  if (target) {
    const r = target.getBoundingClientRect(), pad = step.round ? 6 : 8;
    hole.classList.remove('is-none');
    hole.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px;border-radius:${step.round || step.pill ? '999px' : '26px'}`;
    below = r.top + r.height / 2 < vh / 2; // the target is high: character and bubble go under it
    const cx = r.left + r.width / 2;
    gx = Math.min(vw - g - 12, Math.max(12, (step.round ? cx - g * 1.3 : r.left + 14)));
    if (target.closest?.('.us-nav')) gx = Math.min(vw - g - 12, Math.max(12, cx - g / 2));
    gy = below ? r.bottom + 10 : r.top - g - 10;
    if (step.id === 'domanda') gy = r.top - g + 6;
  } else {
    hole.classList.add('is-none');
    hole.style.cssText = '';
    below = false;
    gx = 20; gy = vh * 0.58;
  }
  guide.style.width = `${g}px`;
  guide.style.transform = `translate(${Math.round(gx)}px,${Math.round(gy)}px)`;
  const tail = Math.min(vw - 64, Math.max(28, gx + g / 2 - 16));
  bubble.style.setProperty('--us-intro-tail', `${tail}px`);
  bubble.classList.toggle('is-up', below);
  const bh = bubble.offsetHeight || 140;
  const top = below ? gy + g + 12 : gy - bh - 12;
  bubble.style.top = `${Math.round(Math.max(12, Math.min(vh - bh - 12, top)))}px`;
  // The other person, on the side away from the bubble.
  const o = root.querySelector('[data-intro-other]');
  o.style.top = below ? `${Math.round(Math.min(vh - 150, top + bh + 30))}px` : `${Math.round(Math.max(90, top - 150))}px`;
}

// The last stop shown says «Fine».
function paintFoot() {
  const step = list[at];
  if (!root || !step) return;
  const nextBtn = root.querySelector('[data-intro-next]'), skip = root.querySelector('[data-intro-skip]');
  const last = at === list.length - 1;
  nextBtn.textContent = last ? 'Fine' : step.cta || 'Avanti';
  skip.hidden = last;
  root.querySelector('[data-intro-dots]').innerHTML = list.map((_, i) => `<i${i === at ? ' class="is-on"' : ''}></i>`).join('');
}

function paint() {
  clearTimeout(waitTimer); waitTimer = 0;
  const step = list[at];
  if (!step) return finish();
  if (!ready(step)) {
    if (Date.now() < waitUntil) { waitTimer = setTimeout(paint, 120); return; }
    list.splice(at, 1);
    return paint();
  }
  settle();
  const guide = root.querySelector('[data-intro-guide]');
  guide.innerHTML = character(me(), step.reaction || '', 72);
  if (!reduced()) { guide.classList.remove('is-hop'); void guide.offsetWidth; guide.classList.add('is-hop'); }
  root.querySelector('#usIntroSay').textContent = step.say;
  root.dataset.maker = step.maker ? 'true' : 'false';
  paintMaker(step);
  paintFoot();
  root.dataset.step = step.id;
  clearTimers();
  // The logo opens into the bar of your two characters, as if tapped; the light follows it.
  try { w.UsAngolo?.isola?.(false); } catch (_) { /* no island yet */ }
  if (step.island) {
    later(() => {
      root.querySelector('[data-intro-hole]')?.classList.add('is-tap');
      later(() => { try { w.UsAngolo?.isola?.(true, { ms: 9000 }); } catch (_) {} later(() => place(step), 460); }, 380);
    }, reduced() ? 300 : 1100);
  }
  const o = root.querySelector('[data-intro-other]');
  o.classList.remove('is-on');
  root.querySelector('[data-intro-hole]')?.classList.remove('is-tap');
  if (step.other && P()?.character) {
    o.querySelector('[data-intro-other-char]').innerHTML = character(other(), step.reaction === 'cuore' ? 'cuore' : '', 56);
    o.querySelector('[data-intro-other-say]').textContent = step.other;
    later(() => o.classList.add('is-on'), reduced() ? 200 : 900);
  }
  place(step);
  requestAnimationFrame(() => place(step));
}

function next() {
  if (waitTimer) return; // the next stop is still being waited for
  if (at >= list.length - 1) return finish();
  at += 1;
  paint();
  w.UsFeedback?.selection?.();
}

function finish() {
  if (!open) return;
  open = false;
  clearTimers();
  clearTimeout(waitTimer); waitTimer = 0;
  clearTimeout(settleTimer);
  store.set(SEEN(), '1');
  try { w.UsAngolo?.isola?.(false); } catch (_) {}
  root.classList.remove('is-open');
  const done = () => { root.hidden = true; d.documentElement.classList.remove('us-intro-open'); };
  if (reduced()) done(); else closing = setTimeout(done, 260);
  returnFocus?.focus?.({ preventScroll: true });
  returnFocus = null;
  w.dispatchEvent?.(new CustomEvent('us:intro-done'));
}

// force: «Rivedi l'intro» from the Profilo; otherwise only the first time, on this phone.
function start({ force = false } = {}) {
  if (open || !w.usProfile?.id) return false;
  if (!force && store.get(SEEN())) return false;
  build();
  clearTimeout(closing); // a closing fade still running must not hide the intro that starts again
  if (typeof w.go === 'function' && !$('home')?.classList.contains('active')) w.go('home', { nav: true });
  w.closeModal?.();
  shapeNow = null; colourNow = null;
  // Every stop: its thing is looked for when it is reached.
  list = steps({ force });
  if (!list.length) return false;
  at = 0;
  open = true;
  waitUntil = Date.now() + TARGET_WAIT;
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => { if (open) { settle(); paintFoot(); } }, TARGET_WAIT + 20);
  returnFocus = d.activeElement;
  d.documentElement.classList.add('us-intro-open');
  root.hidden = false;
  void root.offsetWidth;
  root.classList.add('is-open');
  paint();
  requestAnimationFrame(() => root.querySelector('[data-intro-next]')?.focus({ preventScroll: true }));
  return true;
}

// Who already has US (the beta testers, founder 26/11/2026): with the update the intro shows
// once to them too, on Oggi, when both of you are in and nothing else is open. Whoever is still
// in the first setup gets it from onboarding.js instead, right after «Entra in US».
const paired = () => {
  try { const p = w.UsCoupleContext?.snapshot?.()?.profiles || []; return ['francesco', 'beatrice'].every((role) => p.some((x) => x?.role === role)); } catch (_) { return false; }
};
const setupPending = () => Boolean(store.get(`us:setup:v1:pending:${w.usProfile?.id || ''}`));
const somethingOpen = () => {
  const shown = (el) => { if (!el || el.hidden || el.closest('[hidden]')) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  // The sign-in and first-run screens (#authOverlay holds #usOnboarding) and the device setup.
  if (shown($('authOverlay')) || shown($('usDeviceSetup'))) return true;
  if (d.body?.getAttribute?.('data-us-surface') === 'open' || d.body?.classList?.contains('us-look-open')) return true;
  return [...d.querySelectorAll('[aria-modal="true"]')].some((el) => el.id !== 'usIntro' && !el.closest('[hidden],[aria-hidden="true"]') && el.getBoundingClientRect().height > 0);
};
let autoTries = 0;
// An automated browser (the test suite) is not surprised by it, unless a test asks (__usIntroAuto).
const automated = () => Boolean(w.navigator?.webdriver) && !w.__usIntroAuto;
function autoStart() {
  if (open || store.get(SEEN()) || autoTries > 60 || automated()) return;
  autoTries += 1;
  const ready = w.usProfile?.id && w.usProfile?.couple_id && paired() && !setupPending()
    && $('home')?.classList.contains('active') && !d.hidden
    && !d.documentElement.classList.contains('us-app-locked') && !somethingOpen();
  if (ready) { start(); return; }
  setTimeout(autoStart, 1500);
}
const boot = () => setTimeout(autoStart, 2500);
if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
d.addEventListener('visibilitychange', () => { if (!d.hidden && !open && !store.get(SEEN())) { autoTries = 0; setTimeout(autoStart, 1500); } });

w.UsIntro = Object.freeze({ start, stop: finish, active: () => open, seen: () => Boolean(store.get(SEEN())) });
})();
