// La sfida della settimana — the app side (approved boards SfidaGioca,
// SfidaOggi, SfidaDistanza, 03/11/2026). Gioca › Giochi shows it under the
// Domanda del giorno; Oggi reminds from Friday if it is not done; a couple
// apart sees the two photos side by side. The server decides everything
// (get/change/add RPCs): the page only reads and draws.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const wc = require('../weekly-challenge.js');

const ID = 'c0000000-0000-4000-8000-000000000001';
const M = 'm0000000-0000-4000-8000-000000000001';
// Wednesday 11 November 2026, 12:00 in Rome.
const WED = Date.parse('2026-11-11T11:00:00Z');
const FRI = Date.parse('2026-11-13T11:00:00Z');
const SUN = Date.parse('2026-11-15T19:00:00Z');
const base = (extra = {}) => ({
  id: ID, week_start: '2026-11-09', ends_at: '2026-11-15T22:59:59+00:00', title: 'Uscite per un’ora senza meta: a ogni incrocio decidete a turno.',
  short_title: 'Un’ora senza meta', two_places: false, points: 60, partial_points: 30, bonus_points: 100, bonus_every: 4,
  changes_left: 1, completed_at: null, xp_awarded: 0, bonus_xp: 0, streak: 3, photos: [], waiting_for: null, ...extra,
});
const opts = (now = WED) => ({ now, partnerName: 'Bea' });

test('open: the board SfidaGioca — title, 60 points, Sunday 23:59, one change, the weeks in a row', () => {
  const v = wc.viewModel(base(), opts());
  assert.equal(v.state, 'open');
  assert.equal(v.kicker, 'LA SFIDA DELLA SETTIMANA');
  assert.equal(v.chip, '60 punti');
  assert.equal(v.when, 'Scade domenica alle 23:59 · mancano 4 giorni');
  assert.equal(v.change, 'Cambia · 1');
  assert.deepEqual(v.bars, [true, true, true, false]);
  assert.deepEqual([v.streakBold, v.streakText], ['3 settimane di fila.', 'Con questa, 100 punti in più.']);
  assert.equal(wc.viewModel(base({ changes_left: 0 }), opts()).change, null);
  assert.equal(wc.viewModel(base(), opts(SUN)).when, 'Scade stasera alle 23:59');
  assert.equal(wc.viewModel(base(), opts(Date.parse('2026-11-14T11:00:00Z'))).when, 'Scade domenica alle 23:59 · manca 1 giorno');
  const first = wc.viewModel(base({ streak: 0 }), opts());
  assert.deepEqual([first.streakBold, first.streakText, first.bars.filter(Boolean).length], ['', 'Ogni 4 settimane di fila, 100 punti in più.', 0]);
  const one = wc.viewModel(base({ streak: 1 }), opts());
  assert.deepEqual([one.streakBold, one.streakText], ['1 settimana di fila.', 'Ancora 3 per 100 punti in più.']);
  assert.deepEqual(wc.viewModel(base({ streak: 4 }), opts()).bars, [false, false, false, false], 'a new round of four');
});

test('done: «Fatta da Bea, giovedì», the points to both, saved in Ricordi and the calendar', () => {
  const done = base({ completed_at: '2026-11-12T18:00:00Z', xp_awarded: 60, streak: 4, bonus_xp: 100, photos: [{ mine: false, moment_id: M, path: 'a/b/derived-thumbnails/x.webp', place_label: 'Torino', created_at: '2026-11-12T18:00:00Z' }] });
  const v = wc.viewModel(done, opts());
  assert.equal(v.state, 'done');
  assert.equal(v.by, 'Fatta da Bea, giovedì');
  assert.equal(v.doneTitle, 'Un’ora senza meta');
  assert.equal(v.doneLine, '+160 punti a tutti e due · salvata nei Ricordi e nel calendario');
  assert.equal(v.photos[0].path, 'a/b/derived-thumbnails/x.webp');
  const mine = wc.viewModel({ ...done, bonus_xp: 0, photos: [{ ...done.photos[0], mine: true }] }, opts());
  assert.equal(mine.by, 'Fatta da te, giovedì');
  assert.equal(mine.doneLine, '+60 punti a tutti e due · salvata nei Ricordi e nel calendario');
});

test('apart: the board SfidaDistanza — the two photos side by side, «Aggiungi la tua», 60 with both, 30 with one', () => {
  const half = base({ two_places: true, waiting_for: 'me', photos: [{ mine: false, moment_id: M, path: 'p/bea.webp', place_label: 'Lisbona', created_at: '2026-11-11T20:04:00Z' }] });
  const v = wc.viewModel(half, opts());
  assert.equal(v.state, 'apart');
  assert.equal(v.chip, 'A distanza');
  assert.deepEqual(v.partner, { label: 'Bea · Lisbona, 21:04', path: 'p/bea.webp', empty: false });
  assert.deepEqual(v.me, { label: 'Tu', path: null, empty: true, action: 'Aggiungi la tua' });
  assert.equal(v.rule, 'Con tutte e due le foto: 60 punti. Se a domenica ce n’è una sola, la sfida si chiude lo stesso con 30.');
  assert.equal(v.when, 'Scade domenica alle 23:59 · mancano 4 giorni');
  assert.equal(v.change, null, 'no change once a photo is in');
  const none = wc.viewModel(base({ two_places: true }), opts());
  assert.deepEqual(none.partner, { label: 'Bea', path: null, empty: true });
  assert.equal(none.change, 'Cambia · 1');
  const waiting = wc.viewModel(base({ two_places: true, waiting_for: 'partner', photos: [{ mine: true, moment_id: M, path: 'p/me.webp', place_label: 'Torino', created_at: '2026-11-11T20:04:00Z' }] }), opts());
  assert.equal(waiting.me.label, 'Tu · Torino, 21:04');
  assert.equal(waiting.partner.label, 'In attesa di Bea');
  const born = wc.viewModel({ ...half, waiting_for: null, completed_at: '2026-11-12T20:30:00Z', xp_awarded: 60, photos: [...half.photos, { mine: true, moment_id: M, photo_id: 'p2', path: 'p/me.webp', place_label: null, created_at: '2026-11-12T20:30:00Z' }] }, opts());
  assert.equal(born.state, 'apart-done');
  assert.equal(born.kicker, 'SFIDA · 12 NOVEMBRE');
  assert.equal(born.doneLine, '+60 punti a tutti e due · salvata nei Ricordi e nel calendario');
});

test('Oggi (board SfidaOggi): from Friday if not done, «Chiudi»; apart and waiting for me, any day', () => {
  assert.equal(wc.todayPriority(base(), opts(WED)), null, 'not before Friday');
  const fri = wc.todayPriority(base(), opts(FRI));
  assert.deepEqual(
    { category: fri.category, title: fri.title, detail: fri.detail, action: fri.action, actionLabel: fri.actionLabel, attention: fri.attention },
    { category: 'challenge', title: 'Un’ora senza meta', detail: 'Mancano 2 giorni · 60 punti', action: 'challenge', actionLabel: 'Chiudi', attention: true }
  );
  assert.equal(wc.todayPriority(base(), opts(SUN)).detail, 'Scade stasera · 60 punti');
  assert.equal(wc.todayPriority(base({ completed_at: '2026-11-13T10:00:00Z', xp_awarded: 60 }), opts(FRI)), null);
  const me = wc.todayPriority(base({ two_places: true, waiting_for: 'me', photos: [{ mine: false }] }), opts(WED));
  assert.deepEqual({ category: me.category, title: me.title, detail: me.detail, actionLabel: me.actionLabel }, { category: 'waiting_for_me', title: 'Bea ha messo la sua foto', detail: 'Manca solo la tua · 60 punti', actionLabel: 'Aggiungi' });
  assert.equal(wc.todayPriority(base({ two_places: true, waiting_for: 'partner' }), opts(FRI)), null, 'my part is done');
  assert.equal(wc.todayPriority(null, opts(FRI)), null);
});

test('the markup: one section, real buttons of at least 44px, nothing but text from the server', () => {
  const html = wc.markup(wc.viewModel(base({ title: '<img src=x onerror=alert(1)>' }), opts()));
  assert.match(html, /<section class="us-wc" data-wc-state="open" aria-labelledby="usWcTitle">/);
  assert.match(html, /data-wc-action="photo"[^>]*>[\s\S]*Chiudi con una foto/);
  assert.match(html, /data-wc-action="change"/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
  const apart = wc.markup(wc.viewModel(base({ two_places: true, waiting_for: 'me', photos: [{ mine: false, moment_id: M, path: 'p/bea.webp', place_label: 'Lisbona', created_at: '2026-11-11T20:04:00Z' }] }), opts()));
  assert.match(apart, /data-wc-action="mine"[^>]*>[\s\S]*Aggiungi la tua/);
  assert.match(apart, /data-wc-path="p\/bea\.webp"/);
  const css = read('dc-gioca.css');
  assert.match(css, /#quiz \.us-wc-actions button\{[^}]*min-height:48px/);
  assert.match(css, /#quiz \.us-wc-pair-add\{[^}]*min-height:/);
  assert.match(css, /prefers-reduced-motion|data-us-motion="reduced"\] #quiz \.us-wc/);
});

test('the photo: the Ricordi composer with the title, then the server closes it; apart, the first tells the other', async () => {
  const calls = [];
  const sb = { rpc: async (name, args) => { calls.push([name, args]); return { data: base({ two_places: true, waiting_for: 'partner' }), error: null }; } };
  const w = { usProfile: { id: 'f', couple_id: 'c' }, sb, UsMomentComposer: { pick: (arg) => calls.push(['pick', arg]) }, sendWebPushEvent: async (...a) => { calls.push(['push', ...a]); }, toast: (t) => calls.push(['toast', t]) };
  const api = wc.create(w);
  api.setState(base({ two_places: true }));
  api.startPhoto(Date.parse('2026-11-11T11:00:00Z'));
  assert.deepEqual(calls.shift(), ['pick', { caption: 'Un’ora senza meta', source: { kind: 'challenge', ref: ID, date: '2026-11-11' } }]);
  const result = await api.photoAdded({ challengeId: ID, momentId: M });
  assert.deepEqual(calls.shift(), ['add_weekly_challenge_photo', { target_challenge_id: ID, target_moment_id: M, target_photo_id: null }]);
  assert.deepEqual(calls.shift(), ['toast', 'Foto messa: ora manca quella di La tua persona']);
  assert.deepEqual(calls.shift(), ['push', 'challenge_photo', ID]);
  assert.equal(result.waiting_for, 'partner');

  const app = read('app.js');
  assert.match(app, /function setMomentComposerSource\(source\)\{[\s\S]*?source\?\.kind==='challenge'/);
  assert.match(app, /if\(source\.kind==='challenge'\)await window\.UsWeeklyChallenge\?\.photoAdded\?\.\(\{challengeId:source\.ref,momentId:created\.id,announce:false\}\);\s*else\{/);
  // The composer says the challenge's line instead of its own "Ricordo aggiunto ♡".
  assert.match(app, /const challengeNote=source\?\.kind==='challenge'&&!failed\?window\.UsWeeklyChallenge\?\.takeNote\?\.\(\):'';\s*toast\(challengeNote\|\|/);
  const quiet = wc.create({ usProfile: { id: 'f' }, sb: { rpc: async () => ({ data: base({ completed_at: '2026-11-11T12:00:00Z', xp_awarded: 60 }), error: null }) }, toast: (t) => calls.push(['loud', t]) });
  await quiet.photoAdded({ challengeId: ID, momentId: M, announce: false });
  assert.equal(calls.some((c) => c[0] === 'loud'), false, 'no toast of its own');
  assert.equal(quiet.takeNote(), 'Sfida fatta: +60 punti a tutti e due ♡');
  assert.equal(quiet.takeNote(), '', 'said once');
});

test('apart, the second photo goes to the album of the other one\'s Ricordo; a closed week keeps it as a Ricordo', async () => {
  const calls = [];
  const sb = {
    rpc: async (name, args) => { calls.push([name, args]); return { data: base({ two_places: true, completed_at: '2026-11-12T10:00:00Z', xp_awarded: 60 }), error: null }; },
    from: () => { const b = { select: () => b, eq: () => b, order: () => b, limit: () => b, maybeSingle: async () => ({ data: { id: 'p2' }, error: null }) }; return b; },
  };
  const w = { usProfile: { id: 'f', couple_id: 'c' }, sb, UsMomentAlbums: { uploadPhoto: async (m) => { calls.push(['album', m]); return true; } }, toast: (t) => calls.push(['toast', t]), sendWebPushEvent: async () => calls.push(['push']) };
  const api = wc.create(w);
  api.setState(base({ two_places: true, waiting_for: 'me', photos: [{ mine: false, moment_id: M }] }));
  await api.addMine({ type: 'image/jpeg', size: 1000 });
  assert.deepEqual(calls.slice(0, 2), [['album', M], ['add_weekly_challenge_photo', { target_challenge_id: ID, target_moment_id: M, target_photo_id: 'p2' }]]);
  assert.deepEqual(calls[2], ['toast', 'Sfida fatta: +60 punti a tutti e due ♡']);
  assert.equal(calls.some((c) => c[0] === 'push'), false, 'complete: nobody to wait for');

  const closed = { usProfile: { id: 'f' }, sb: { rpc: async () => ({ data: null, error: { message: 'challenge_closed' } }) }, toast: (t) => calls.push(['closed', t]) };
  const late = wc.create(closed);
  late.setState(base());
  await late.photoAdded({ challengeId: ID, momentId: M });
  assert.deepEqual(calls.at(-1), ['closed', 'La settimana è finita: la foto resta nei Ricordi']);
});

test('one change: asked first, then the server picks; its refusals in plain words', async () => {
  const calls = [];
  const w = { usProfile: { id: 'f' }, sb: { rpc: async (n, a) => { calls.push([n, a]); return { data: null, error: { message: 'challenge_has_photo' } }; } }, toast: (t) => calls.push(['toast', t]), UsUiFoundation: { confirm: async (o) => { calls.push(['confirm', o.title]); return true; } } };
  const api = wc.create(w);
  api.setState(base());
  await api.change();
  assert.deepEqual(calls, [['confirm', 'Cambiare la sfida?'], ['change_weekly_challenge', { target_challenge_id: ID }], ['toast', 'Con una foto già messa la sfida non si cambia']]);
});

test('wired in: the module is loaded and cached, Gioca has its slot, Oggi its category, Realtime its lines', () => {
  const index = read('index.html');
  assert.match(index, /<script defer src="\/weekly-challenge\.js\?v=[^"]+"><\/script>/);
  assert.match(read('service-worker.js'), /versioned\("\/weekly-challenge\.js"\)/);
  for (const f of ['scripts/build-cloudflare-pages.mjs', 'scripts/build-capacitor-web.mjs']) assert.match(read(f), /'weekly-challenge\.js'/, f);
  const games = read('games.js');
  assert.match(games, /data-gv4-daily-slot[^\n]*\n\s*<div class="us-wc-slot" data-wc-slot><\/div>/);
  assert.match(games, /window\.UsWeeklyChallenge\?\.paint\?\.\(\);/);
  const app = read('app.js');
  assert.match(app, /const US_TODAY_PRIORITY_ORDER=Object\.freeze\(\{[^}]*challenge:6/);
  assert.match(app, /challenge:'Sfida · scade domenica'/);
  assert.match(app, /const US_OGGI_PRIMARY_RANK=Object\.freeze\(\{[^}]*challenge:40\}/);
  assert.match(app, /challenge=await window\.UsWeeklyChallenge\?\.todayPriority\?\.\(\)/);
  assert.match(app, /if\(action==='challenge'\)window\.UsWeeklyChallenge\?\.open\?\.\(\);/);
  assert.match(app, /table:'couple_weekly_challenges'[^\n]*UsWeeklyChallenge\?\.onChange/);
  assert.match(app, /table:'couple_weekly_challenge_photos'[^\n]*UsWeeklyChallenge\?\.onChange/);
});

test('the old missions are gone from the app; «Le vostre idee» stays', () => {
  const index = read('index.html'), app = read('app.js');
  for (const id of ['questWeekBoard', 'bondQuestList', 'questRecent', 'questRecentList']) assert.doesNotMatch(index, new RegExp(`id="${id}"`), id);
  assert.doesNotMatch(index, /Missioni di coppia/);
  for (const name of ['confirm_bond_quest', 'reroll_bond_quest', 'ensure_bond_week', 'oggiMissionToConfirm', 'missionTodayPriorityViewModel', 'openOggiMission', 'function hydrateBond(']) assert.ok(!app.includes(name), name);
  for (const id of ['noiIdeaList', 'noiIdeaQuickForm', 'noiIdeaDetail']) assert.match(index, new RegExp(`id="${id}"`), id);
  for (const name of ['function hydrateNoiIdeas', 'function markNoiIdeaLived', 'function addNoiIdeaMemory']) assert.ok(app.includes(name), name);
});

test('Impostazioni › Notifiche: the challenge\'s switch, «Come vi vedete» speaks of the challenge, English for every new text', () => {
  const settings = read('settings.js');
  assert.match(settings, /preferenceToggle\('bond','La sfida della settimana',p\.bond!==false\)/);
  assert.match(settings, /key==='bond'\?'Il lunedì la nuova, il sabato un promemoria'/);
  const index = read('index.html');
  assert.match(index, /Ci serve solo per scegliere la sfida giusta per voi\./);
  assert.match(index, /<small>Serve per la sfida della settimana<\/small>/);
  const en = require('../i18n-en.js');
  const dict = en.EN || en;
  for (const key of ['LA SFIDA DELLA SETTIMANA', '{n} punti', 'Scade domenica alle 23:59 · mancano {n} giorni', 'Scade domenica alle 23:59 · manca 1 giorno', 'Scade stasera alle 23:59', 'Chiudi con una foto', 'Cambia · {n}',
    '{n} settimane di fila.', '1 settimana di fila.', 'Con questa, 100 punti in più.', 'Ancora {n} per 100 punti in più.', 'Ogni 4 settimane di fila, 100 punti in più.',
    'Fatta da {name}, {day}', 'Fatta da te, {day}', '+{n} punti a tutti e due · salvata nei Ricordi e nel calendario', 'A distanza', 'Aggiungi la tua', 'In attesa di {name}',
    'Con tutte e due le foto: 60 punti. Se a domenica ce n’è una sola, la sfida si chiude lo stesso con 30.', 'Sfida · scade domenica', 'Mancano {n} giorni · {m} punti', 'Manca 1 giorno · {n} punti', 'Scade stasera · {n} punti',
    '{name} ha messo la sua foto', 'Manca solo la tua · {n} punti', 'La sfida della settimana', 'Il lunedì la nuova, il sabato un promemoria', 'Cambiare la sfida?',
    'Sfida fatta: +{n} punti a tutti e due ♡', 'La settimana è finita: la foto resta nei Ricordi', 'Con una foto già messa la sfida non si cambia',
    'Ci serve solo per scegliere la sfida giusta per voi.', 'Serve per la sfida della settimana']) {
    assert.ok(Object.prototype.hasOwnProperty.call(dict, key), `i18n-en: ${key}`);
  }
});
