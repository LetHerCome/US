// Controllo del 27/11/2026 (Noi, Ricordi, Gioca): the fixes of the audit, one
// test each. The lavagna keeps strokes drawn without network and sends them in
// order; the bacheca says when it cannot be read, shows both kept answers and
// opens with the keyboard; «L'avete fatto?» waits for the other yes; post-its
// carry their own id; 44 px to the finger; neutral copy; the Rome day; dead
// code gone.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const tick = async (n = 12) => { for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r)); };

// ---------------------------------------------------------------- 1. lavagna

const L = require('../lavagna.js');

test('lavagna: what a failed save means', () => {
  assert.equal(L.saveOutcome(null), 'ok');
  assert.equal(L.saveOutcome({ message: 'TypeError: Failed to fetch', code: '' }), 'retry', 'no network: it waits');
  assert.equal(L.saveOutcome({ message: 'JWT expired', code: 'PGRST301' }), 'retry');
  assert.equal(L.saveOutcome({ code: '23505', message: 'duplicate key value violates unique constraint "lavagna_strokes_pkey"' }), 'duplicate', 'already saved: the id is ours');
  assert.equal(L.saveOutcome({ code: 'P0001', message: 'lavagna_full' }), 'full');
  assert.equal(L.saveOutcome({ code: '42501', message: 'new row violates row-level security policy' }), 'drop');
});

function fakeBoard() {
  const els = new Map(), winListeners = {}, docListeners = {};
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  const el = (id = '') => {
    const on = {};
    return {
      id, style: { setProperty() {} }, dataset: {}, hidden: false, disabled: false, textContent: '', innerHTML: '', width: 0, height: 0,
      classList: { s: new Set(), add(c) { this.s.add(c); }, remove(c) { this.s.delete(c); }, contains(c) { return this.s.has(c); }, toggle() {} },
      setAttribute() {}, getAttribute: () => null, removeAttribute() {}, appendChild() {},
      addEventListener(t, f) { (on[t] ||= []).push(f); }, fire(t, e) { for (const f of on[t] || []) f(e); },
      querySelector: () => el(), querySelectorAll: () => [], closest: () => null,
      getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 160 }), setPointerCapture() {},
    };
  };
  const byId = (id) => { if (!els.has(id)) els.set(id, el(id)); return els.get(id); };
  const document = {
    body: { appendChild() {} }, readyState: 'complete', hidden: false, documentElement: { style: { getPropertyValue: () => '' } },
    createElement: () => el(), getElementById: byId, addEventListener: (t, f) => { (docListeners[t] ||= []).push(f); },
  };
  const window = {
    document, UsLavagna: {}, crypto: require('node:crypto').webcrypto, devicePixelRatio: 1,
    usProfile: { id: 'me', couple_id: 'c1', role: 'francesco' },
    localStorage: { getItem: () => String(Date.now()), setItem() {} },
    addEventListener: (t, f) => { (winListeners[t] ||= []).push(f); },
    requestAnimationFrame: () => 0,
  };
  // The server: 'offline' answers nothing, 'lost' saves but the answer never comes back.
  const rows = new Map(), sent = [];
  let mode = 'online';
  const client = {
    from(table) {
      const q = { op: 'select', filters: [] };
      const chain = {
        select() { return chain; }, eq(c, v) { q.filters.push([c, v]); return chain; }, order() { return chain; },
        range: async () => ({ data: [...rows.values()], error: null }),
        maybeSingle: async () => (table === 'lavagna_boards' ? { data: null, error: null } : { data: rows.get(q.filters.find((f) => f[0] === 'id')?.[1]) || null, error: null }),
        insert(row) { q.op = 'insert'; q.row = row; return chain; },
        single: async () => {
          sent.push(q.row.id);
          if (mode === 'offline') return { data: null, error: { message: 'TypeError: Failed to fetch', code: '' } };
          if (rows.has(q.row.id)) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
          const row = { ...q.row, author_id: 'me', created_at: new Date(Date.now() + rows.size).toISOString() };
          rows.set(row.id, row);
          if (mode === 'lost') return { data: null, error: { message: 'TypeError: Failed to fetch', code: '' } };
          return { data: row, error: null };
        },
      };
      return chain;
    },
    rpc: async () => ({ data: null, error: null }),
  };
  const draw = (x) => {
    const canvas = byId('usLavagnaCanvas');
    canvas.fire('pointerdown', { pointerId: 1, pointerType: 'touch', button: 0, clientX: x, clientY: 10, preventDefault() {} });
    canvas.fire('pointermove', { pointerId: 1, clientX: x + 30, clientY: 90 });
    canvas.fire('pointerup', { pointerId: 1 });
  };
  const fire = (t) => { for (const f of winListeners[t] || []) f({}); };
  const fireDoc = (t) => { for (const f of docListeners[t] || []) f({}); };
  return { window, client, rows, sent, draw, fire, fireDoc, byId, setMode: (m) => { mode = m; } };
}

test('lavagna: a stroke drawn without network stays, waits with the next ones, and leaves in order once the network is back', async (t) => {
  const realTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (f, ms, ...a) => { const id = realTimeout(f, ms, ...a); id?.unref?.(); return id; };
  const b = fakeBoard();
  globalThis.sb = b.client;
  t.after(() => { delete globalThis.sb; globalThis.setTimeout = realTimeout; });
  L.install(b.window);
  await tick();
  b.setMode('offline');
  b.draw(10);
  await tick();
  assert.equal(b.sent.length, 1);
  const first = b.sent[0];
  assert.match(b.byId('usLavagnaStatus').textContent, /Senza rete: il tratto resta qui/);
  assert.doesNotMatch(b.byId('usLavagnaStatus').textContent, /Tratto non salvato/);
  b.draw(200);
  await tick();
  assert.deepEqual(b.sent, [first, first], 'the waiting stroke goes first; the new one waits behind it');
  b.setMode('online');
  b.fire('online');
  await tick();
  const second = b.sent[3];
  assert.deepEqual(b.sent.slice(2), [first, second], 'back online: both, in the order they were drawn');
  assert.notEqual(first, second);
  assert.deepEqual([...b.rows.keys()], [first, second]);

  // The answer is lost after the server saved it: the resend finds the same id.
  b.setMode('lost');
  b.draw(400);
  await tick();
  const third = b.sent.at(-1);
  assert.equal(b.rows.size, 3);
  b.setMode('online');
  b.window.document.hidden = false;
  b.fireDoc('visibilitychange');
  await tick();
  assert.deepEqual(b.sent.slice(-2), [third, third], 'sent again when US comes back');
  assert.equal(b.rows.size, 3, 'no copy');
  b.draw(600);
  await tick();
  assert.equal(b.rows.size, 4, 'the outbox is empty again: the next stroke goes at once');
});

test('lavagna: the full board still says so; a waiting stroke is drawn lighter', () => {
  const src = read('lavagna.js');
  assert.ok(src.includes("say(outcome==='full'?'La lavagna è piena: puliscila per continuare':'Tratto non salvato. Riprova tra poco.');"));
  assert.ok(src.includes("ctx.globalAlpha=s.waiting&&s.tool!=='eraser'?.45:1;"));
  assert.ok(src.includes("w.addEventListener('online',()=>{if(outbox.length)flush();});"));
});

// ---------------------------------------------------------------- 2-4. bacheca

const B = require('../bacheca.js');

test('bacheca: a kept answer shows both answers, each with who wrote it, never an empty line', () => {
  const c = { question: 'Il posto più bello?', francesco: 'Il lago', beatrice: '  Venezia ' };
  assert.deepEqual(B.noteAnswers(c, 'beatrice'), [{ who: 'you', text: 'Il lago' }, { who: 'me', text: 'Venezia' }]);
  assert.deepEqual(B.noteAnswers(c, 'francesco').map((a) => a.who), ['me', 'you']);
  assert.deepEqual(B.noteAnswers({ question: 'x', francesco: '', beatrice: 'Solo io' }, 'francesco'), [{ who: 'you', text: 'Solo io' }]);
  assert.deepEqual(B.noteAnswers({ question: 'x' }, 'francesco'), []);
  assert.deepEqual(B.noteAnswers(c, '').map((a) => a.who), ['', ''], 'no role known: no colours');
  assert.match(read('dc-ricordi.css'), /#moments \.ub-ans\[data-who="me"\]\{border-left-color:var\(--us-tu\)\}/);
});

test('bacheca in the app: an error is an error with «Riprova»; Enter opens a thing; a kept answer shows both', async (t) => {
  const { start, pageFor } = require('./helpers/countdown-browser');
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    await page.waitForFunction(() => window.UsBacheca && window.UsRicordiPlace);
    await page.evaluate(() => {
      window.UsAngolo?.isola?.(false);
      window.__QA.rpc.get_bacheca_v1 = async () => ({ data: null, error: { message: 'TypeError: Failed to fetch' } });
      // Forget the board read at launch: this time it never arrives.
      window.dispatchEvent(new CustomEvent('us-identity-change'));
      window.go('moments', { nav: true });
    });
    await page.click('#moments [data-ricordi-view="board"]');
    await page.waitForSelector('#ricordiBacheca [data-ub-retry]');
    assert.match(await page.locator('#ricordiBacheca').innerText(), /La bacheca non risponde/);
    assert.doesNotMatch(await page.locator('#ricordiBacheca').innerText(), /appena mettete un ricordo/, 'not the empty board');
    await page.evaluate(() => {
      const pin = (id, extra) => ({ id, source: 'moment', source_id: `s${id}`, reason: 'storia', vars: {}, item_date: '2024-05-10', by_us: true, mine: false, fixed: false, x: null, y: null, created_at: '2026-11-20T10:00:00Z', content: { caption: `Ricordo ${id}` }, ...extra });
      window.__QA.rpc.get_bacheca_v1 = async () => ({ data: { limit: 12, plus: false, pins: [pin('p1'), pin('k1', { source: 'keepsake', content: { question: 'Il posto più bello?', francesco: 'Il lago', beatrice: 'Venezia' } })] }, error: null });
    });
    await page.click('#ricordiBacheca [data-ub-retry]');
    await page.waitForSelector('#ricordiBacheca [data-ub-pin="k1"]');
    const note = page.locator('#ricordiBacheca [data-ub-pin="k1"] .ub-note');
    assert.deepEqual(await note.locator('.ub-ans').allInnerTexts(), ['Il lago', 'Venezia']);
    assert.deepEqual(await note.locator('.ub-ans').evaluateAll((els) => els.map((e) => e.dataset.who)), ['me', 'you']);
    await page.focus('#ricordiBacheca [data-ub-pin="p1"]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#usBachecaSheet.open');
    assert.equal(await page.locator('#usBachecaSheetTitle').innerText(), 'Ricordo p1');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await h.close();
  }
});

test('bacheca: the keyboard click opens the sheet, a finger keeps tap, double tap and drag', () => {
  const src = read('bacheca.js');
  // La bacheca, fase 3 (27/11/2026): in «fai spazio» the same click picks the thing instead.
  assert.ok(src.includes("if (Date.now() - pointerAt > 800) { const n = nodes[Number(item.dataset.ubI)]; if (n) { if (room) pick(n.pin); else openSheet(n.pin); } }"));
  assert.ok(src.includes('setTimeout(() => { if (lastTap.id === g.n.pin.id && lastTap.t === t) openSheet(g.n.pin); }, 330);'), 'the tap of a finger as before');
  assert.ok(src.includes("if (!data && failed) {"));
});

// ---------------------------------------------------------------- 5. L'avete fatto?

test('«L\'avete fatto?»: the server tells a proposal from a lived idea; only a lived one offers the photo', async () => {
  const app = read('app.js');
  const src = app.slice(app.indexOf('async function markNoiIdeaLivedFromBoard(id){'), app.indexOf('// Noi, Fase B.2 (D13): the board\'s ideas say'));
  const run = async (res) => {
    const c = vm.createContext({ window: { usProfile: { id: 'me' } }, noiIdeaState: { busy: false }, noiIdeaFindItem: () => ({ id: 'i' }), noiIdeaLivedPhase: () => 'none', noiIdeaPartnerName: () => 'Bea', toast() {}, hydrateNoiIdeas() {}, console, confirmNoiIdeaLived: async () => res });
    vm.runInContext(src, c);
    return c.markNoiIdeaLivedFromBoard('i');
  };
  assert.equal(await run({ status: 'lived' }), 'lived');
  assert.equal(await run({ status: 'scheduled', lived_proposed_by: 'me' }), 'proposed');
  assert.equal(await run(null), false);
  const notes = read('couple-notes.js');
  assert.ok(notes.includes("fatto={...f,step:ok==='proposed'?'waiting':'photo'};"));
  assert.ok(notes.includes('<h2 class="us-fatto-title" translate="no">Ora manca ${esc(partnerName())}</h2>'));
  const waiting = notes.slice(notes.indexOf("if(f.step==='waiting')"), notes.indexOf("if(f.step==='photo')"));
  assert.doesNotMatch(waiting, /data-fatto-photo|foto/, 'no photo while the other yes is missing');
  assert.ok(notes.includes("${f.partnerSaid?'Con il tuo sì l’idea diventa fatta e vi propone una foto in Ricordi.':`Dopo il tuo sì manca quello di ${esc(partnerName())}: con tutti e due l’idea diventa fatta.`} Ve lo chiede una volta sola."));
  assert.doesNotMatch(notes, /Con un sì l’idea diventa fatta/);
});

// ---------------------------------------------------------------- 6. post-it id

test('post-it: a new one carries its own id, so a retry after a lost answer never makes a copy', () => {
  const N = require('../couple-notes.js');
  assert.match(N.noteId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const fallback = N.noteId({ getRandomValues: (b) => require('node:crypto').getRandomValues(b) });
  assert.match(fallback, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(N.duplicateKey({ code: '23505' }), true);
  assert.equal(N.duplicateKey({ message: 'TypeError: Failed to fetch' }), false);
  const src = read('couple-notes.js');
  assert.ok(src.includes("target.newId=target.newId||noteId(w.crypto);"), 'made once, kept for the retries');
  assert.ok(src.includes("insert({...data,id:target.newId,couple_id:w.usProfile.couple_id})"));
  assert.ok(src.includes("if(duplicateKey(res.error))res=await client.from('couple_notes').update(data).eq('id',target.newId)"));
  // The table takes an id from the app (default only when none is given; the guard never rewrites it).
  const table = read('supabase/migrations/20261031132258_couple_notes_v1.sql');
  assert.match(table, /id uuid primary key default gen_random_uuid\(\)/);
  for (const f of fs.readdirSync(path.join(ROOT, 'supabase/migrations')).filter((x) => /couple_notes/.test(x))) assert.doesNotMatch(read(`supabase/migrations/${f}`), /new\.id\s*:=/, f);
});

// ---------------------------------------------------------------- 7. 44 px

test('tap targets: 44 px to the finger in Noi, Ricordi and Gioca', () => {
  const notes = read('couple-notes.css');
  assert.ok(notes.includes('.us-notes-check.is-small input{inset:-7px;width:calc(100% + 14px);height:calc(100% + 14px)}'), 'the small box: 30 + 14');
  assert.ok(notes.includes('.us-postit .us-idea-close::after,.us-notes-item-x::after{content:"";position:absolute;left:50%;top:50%;width:44px;height:44px;transform:translate(-50%,-50%)}'));
  assert.match(notes, /\.us-notes-item-x\{position:relative;/);
  assert.match(notes, /\.us-postit \.us-idea-close\{position:relative;/);
  const noi = read('dc-noi.css');
  assert.ok(noi.includes('#bond .us-noi-v2 .us-noi-v2-nav::after{content:"";position:absolute;left:50%;top:50%;width:44px;height:44px;transform:translate(-50%,-50%)}'));
  assert.match(noi, /#bond \.us-noi-v2 \.us-noi-v2-nav\{position:relative;/);
  assert.match(read('dc-ricordi.css'), /#moments \.ricordi-views button\{min-height:44px;/);
  // Gioca's back button already reaches 44 px: 40 px and 2 px of ::after on each side.
  assert.ok(read('dc-gioca.css').includes('#quiz .us-gv2-back::after{content:"";position:absolute;inset:-2px}'));
});

// ---------------------------------------------------------------- 8-10. Gioca

function hub(homeState, profiles) {
  const nodes = {};
  const node = (id) => (nodes[id] ||= {
    id, innerHTML: '', dataset: {}, classList: { add() {}, remove() {}, contains: () => false },
    setAttribute() {}, removeAttribute() {}, addEventListener() {}, querySelector: () => null,
  });
  const window = { usProfile: { role: 'francesco' }, crypto: { randomUUID: () => 'r' }, go() {} };
  const sandbox = {
    window,
    document: { readyState: 'complete', hidden: false, getElementById: node, addEventListener() {}, querySelector: () => ({ id: 'quiz' }) },
    sb: { rpc: async () => ({ data: homeState, error: null }) },
    toast() {}, FormData: class {}, console: { warn() {} }, setTimeout: () => 1, setInterval: () => 1,
  };
  node('quizHub'); node('usGameV2Panel');
  require('./helpers/identity-fixture').install(sandbox, profiles);
  vm.runInNewContext(read('games.js'), sandbox);
  return { html: async () => { await tick(6); return nodes.quizHub.innerHTML; } };
}
const weekly = { week_start: '2026-09-28', next_unlock: '2026-10-05', assigned_role: 'beatrice', next_role: 'francesco', my_turn: false, created: false, created_by_me: false, partner_left_question: false, my_question: null };
const homeOf = (over = {}) => ({ my_role: 'francesco', partner_role: 'beatrice', weekly, per_voi: { state: 'idle' }, open_rounds: [], recent: [], ...over });

test('Gioca: without the other one\'s name the sentence says «la tua persona», lowercase', async () => {
  const alone = [{ id: 'f', role: 'francesco', display_name: 'Francesco', couple_id: 'fixture' }];
  const html = await hub(homeOf({ per_voi: { state: 'waiting', session_id: 's' }, open_rounds: [{ id: 'o1', game_family: 'ridete', item_count: 5, my_answered_count: 5, my_complete: true }] }), alone).html();
  assert.match(html, /Aspetti la tua persona/);
  assert.doesNotMatch(html, /Aspetti La tua persona|tocca a La tua persona/);
  const named = await hub(homeOf({ per_voi: { state: 'waiting', session_id: 's' } })).html();
  assert.match(named, /Aspetti Beatrice/);
  const js = read('games.js');
  assert.doesNotMatch(js, /l’uno dell’altra/);
  assert.match(js, /scopritevi: 'Le cose che ancora non sapete di voi due, una domanda alla volta\.'/);
  assert.match(js, /`Poi tocca a \$\{waitingName\(\)\}, \$\{unlock\}\.`/);
  assert.match(js, /`Questa settimana tocca a \$\{midName\(label\(w\.assigned_role\)\)\}`/);
});

test('Gioca: a round finished after midnight in Rome shows the Rome day', async () => {
  const done = { id: 'd1', game_family: 'ridete', item_count: 5, reveal_ready: true, my_reveal_seen_at: '2026-11-27T08:00:00Z', completed_at: '2026-11-26T23:30:00Z' };
  const html = await hub(homeOf({ recent: [done] })).html();
  assert.match(html, /data-gv2-session="d1"[\s\S]*?<small>27 novembre<\/small>/);
  assert.doesNotMatch(html, /26 novembre/);
});

test('Gioca: Enter or a screen reader plays a side card of the giostra; a finger brings it to the middle', () => {
  const js = read('games.js');
  assert.ok(js.includes("if (button.dataset.gv2Slide && button.dataset.gv2Active === 'false' && event.detail !== 0) { centerSlide(button); return; }"));
});

test('the day is the Europe/Rome day in Noi and in app.js, as in Gioca and the post-its', () => {
  const noi = read('noi-v2.js');
  assert.match(noi, /const today = \(\) => \{try\{return new Intl\.DateTimeFormat\('en-CA',\{timeZone:'Europe\/Rome'/);
  assert.match(noi, /const currentMonth = \(\) => \{const \[y,m\]=today\(\)\.split\('-'\)\.map\(Number\);return \[y,m-1\];\};/);
  const app = read('app.js');
  const fn = app.slice(app.indexOf('function localDateISO(){'), app.indexOf('\n}', app.indexOf('function localDateISO(){')) + 2);
  assert.match(fn, /timeZone:'Europe\/Rome'/);
  const day = vm.runInNewContext(`${fn};localDateISO()`, { Intl, Date, String });
  assert.equal(day, new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date()));
});

// ---------------------------------------------------------------- 11. dead code

test('dead code of the redesign is gone', () => {
  const all = ['index.html', 'app.js', 'games.js', 'ricordi-place.js', 'moments-albums.js', 'events.js'].map(read).join('\n');
  for (const gone of ['usPerVoiTop', 'ricordiCount', "getElementById('conservatiEntry')", "getElementById('conservatiCount')", 'usCalendarDot', 'paintDailyInGioca', 'renderTop']) assert.ok(!all.includes(gone), gone);
  assert.doesNotMatch(read('identity.css'), /#usPerVoiTop/);
  assert.doesNotMatch(read('games.css'), /\.us-gv2-daily|\.us-gv4-week|\.us-gv4-day\b|\.us-gv2-rhythm|\.us-gv2-pervoi/);
  assert.doesNotMatch(read('dc-gioca.css'), /\.us-gv2-daily|\.us-gv2-wd\b|\.us-gv2-daycount|\.us-gioca-tab|\.us-wc-slot/);
  assert.doesNotMatch(read('games.js'), /one new round per Europe\/Rome day|the day's one game/);
});

// ---------------------------------------------------------------- 13-14

test('US vi ricorda: the bubble of the Bacheca can be muted with a long press too', () => {
  const src = read('us-ricorda.js');
  assert.ok(src.includes('onHold: () => askMute(b) });'));
  assert.doesNotMatch(src, /onHold: b\.kind === 'bacheca' \? undefined/);
});

test('English: the new sentences have their translation', () => {
  const en = read('i18n-en.js');
  for (const it of ['Senza rete: il tratto resta qui e parte appena torna la connessione.', 'La bacheca non risponde.', 'Ora manca {name}', 'Quando dice di sì anche {name}, «{title}» va tra le idee fatte.', 'Va bene',
    'Con il tuo sì l’idea diventa fatta e vi propone una foto in Ricordi. Ve lo chiede una volta sola.', 'Dopo il tuo sì manca quello di {name}: con tutti e due l’idea diventa fatta. Ve lo chiede una volta sola.',
    'Aggiungi la prima foto', 'Le cose che ancora non sapete di voi due, una domanda alla volta.']) {
    assert.ok(en.includes(`'${it}':`), it);
  }
});
