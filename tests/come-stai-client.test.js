// Come stai che conta (grill del founder del 27/11/2026, D7–D14, D16, D17,
// D19): the app side. The gesture to the other person's state (D7/D16), the
// things on the characters (D8), the line of US vi ricorda (D9/D17), Oggi's
// suggestion and «in viaggio» (D10), the Noi calendar from «In viaggio» (D14),
// and the wiring that keeps app, SQL, push and widgets on the same lists.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const S = require('../member-status.js');
const P = require('../personaggi.js');
const R = require('../us-ricorda.js');

const NOW = Date.parse('2026-11-27T15:00:00Z');
const row = (status, hoursAgo = 1, extra = {}) => ({ user_id: 'b', status, form: null, set_at: new Date(NOW - hoursAgo * 3600e3).toISOString(), expires_at: new Date(NOW + (12 - hoursAgo) * 3600e3).toISOString(), ...extra });

test('one gesture per state, the same nine as the SQL and the push', async () => {
  assert.deepEqual(S.GESTURE_OF, { giu: 'abbraccio', malato: 'abbraccio', stanco: 'riposati', nervoso: 'respira', felice: 'cuore', innamorato: 'cuore', festa: 'festa', lavoro: 'forza', studio: 'forza', palestra: 'spacca', viaggio: 'buon_viaggio', tavola: 'buon_appetito' });
  for (const s of S.STATUSES) assert.ok(S.GESTURES[S.gestureOf(s.key)], s.key);
  assert.deepEqual(S.GESTURES.abbraccio.label, 'Ti mando un abbraccio');
  assert.equal(S.GESTURES.respira.label, 'Respira, ci sono io');
  assert.equal(S.GESTURES.forza.label, 'Forza!');
  assert.equal(S.GESTURES.spacca.label, 'Spacca tutto!');
  assert.equal(S.GESTURES.festa.label, '🎉');
  assert.equal(S.GESTURES.abbraccio.said('Bea'), 'Bea: Ti mando un abbraccio');
  assert.equal(S.GESTURES.cuore.said('Bea'), 'Bea ti manda un cuore ♡');
  const { STATUS_GESTURES } = await import('../supabase/functions/_shared/notification-core.mjs');
  assert.deepEqual([...STATUS_GESTURES].sort(), Object.keys(S.GESTURES).sort());
  const sql = read('supabase/migrations/20261127184637_come_stai_risposta.sql');
  for (const [status, gesture] of Object.entries(S.GESTURE_OF)) assert.match(sql, new RegExp(`when '${status}' then '${gesture}'`), status);
});

test('the answer counts only for the state it answered, while it shows', () => {
  const answered = row('giu', 1, { reply_gesture: 'abbraccio', reply_at: new Date(NOW - 60e3).toISOString() });
  assert.deepEqual(S.replyOf(answered, { now: NOW }), { gesture: 'abbraccio', at: new Date(NOW - 60e3).toISOString() });
  assert.equal(S.replyOf({ ...answered, expires_at: new Date(NOW - 1).toISOString() }, { now: NOW }), null, 'expired with the state');
  assert.equal(S.replyOf({ ...answered, reply_gesture: 'urlo' }, { now: NOW }), null);
  assert.equal(S.replyOf(row('giu'), { now: NOW }), null);
  // The model of a row is unchanged (the widget and Oggi read it).
  assert.deepEqual(Object.keys(S.model(answered, { now: NOW })).sort(), ['at', 'emoji', 'form', 'key', 'since', 'until', 'word']);
});

test('Oggi: one light suggestion from the two states (D10)', () => {
  const m = (status) => S.model(row(status), { now: NOW });
  assert.deepEqual(S.hintFor(m('felice'), m('stanco'), 'Bea'), { kind: 'vocale', icon: 'microphone', title: 'Lascia un vocale a Bea' });
  assert.equal(S.hintFor(null, m('giu'), 'Bea').kind, 'vocale');
  assert.deepEqual(S.hintFor(m('innamorato'), m('felice'), 'Bea'), { kind: 'partita', icon: 'game-controller', title: 'Una partita?' });
  assert.equal(S.hintFor(m('lavoro'), m('felice'), 'Bea'), null, 'both happy or in love');
  assert.equal(S.hintFor(m('felice'), null, 'Bea'), null);
  assert.equal(S.hintFor(m('felice'), m('viaggio'), 'Bea'), null, 'in viaggio is on the distance, not a suggestion');
  // Never over a commitment of today; the distance says «in viaggio».
  const app = read('app.js');
  assert.match(app, /const hint=model&&model\.date===localDateISO\(\)\?null:window\.UsMemberStatus\?\.oggiHint\?\.\(\)\|\|null;/);
  assert.match(app, /if\(data\.usNextKind==='hint'&&window\.UsMemberStatus\?\.runHint\?\.\(data\.usHint\)\)return;/);
  assert.match(app, /repaint:\(\)=>renderOggiNext\(usOggiNextModel\)/);
  assert.match(app, /value\.textContent=trip\?'in viaggio':\(model\.text\|\|''\);/);
  const module = read('member-status.js');
  assert.match(module, /if \(kind === 'vocale'\) \{ w\.UsLeftForYou\?\.openComposer\?\.\(\{ kind: 'audio' \}\); return true; \}/);
  assert.match(module, /if \(kind === 'partita'\) \{ w\.openQuizHub\?\.\(\{ nav: true \}\); return true; \}/);
});

test('US vi ricorda: giù, non sta bene or nervoso for two hours, once per state, no answer sent yet (D9/D17)', () => {
  assert.equal(S.lineFor(row('giu', 1.9), { now: NOW }), null, 'not before two hours');
  const line = S.lineFor(row('giu', 3), { now: NOW });
  assert.deepEqual({ kind: line.kind, speaker: line.speaker, hours: line.vars.hours, gesture: line.vars.gesture }, { kind: 'come_sta', speaker: 'me', hours: 3, gesture: 'abbraccio' });
  assert.match(line.ref_key, /^come_sta:2026-11-27T12:00:00\.000Z$/, 'one per state');
  assert.equal(S.lineFor(row('felice', 5), { now: NOW }), null);
  assert.equal(S.lineFor(row('malato', 4, { reply_gesture: 'abbraccio', reply_at: new Date(NOW - 60e3).toISOString() }), { now: NOW }), null, 'already answered');
  assert.equal(R.sentence({ kind: 'come_sta', ref_key: 'x', vars: { status: 'giu', hours: 3 } }, 'Bea'), 'Bea è giù da 3 ore. Un pensiero?');
  assert.equal(R.sentence({ kind: 'come_sta', ref_key: 'x', vars: { status: 'malato', hours: 2 } }, 'Bea'), 'Bea non sta bene da 2 ore. Un pensiero?');
  assert.equal(R.sentence({ kind: 'come_sta', ref_key: 'x', vars: { status: 'nervoso', hours: 5, form: 'f' } }, 'Bea'), 'Bea è nervosa da 5 ore. Un pensiero?');
  assert.equal(R.sentence({ kind: 'come_sta', ref_key: 'x', vars: { status: 'nervoso', hours: 5, form: '' } }, 'la tua persona'), 'La tua persona ha i nervi tesi da 5 ore. Un pensiero?', 'undeclined without a choice');
  // Never at night, within the one line a day, muted like the others.
  assert.equal(R.inWindow({ kind: 'come_sta', slot: 'mattina' }, 22), false);
  assert.equal(R.inWindow({ kind: 'come_sta', slot: 'mattina' }, 8), false);
  assert.equal(R.inWindow({ kind: 'come_sta', slot: 'mattina' }, 15), true);
  const none = new Set();
  assert.equal(R.choose({ server: { kind: 'un_anno_fa', vars: {} }, tocca: 'game', introduced: true, mutedKinds: none, comeSta: line }).kind, 'come_sta');
  assert.equal(R.choose({ server: null, tocca: '', introduced: true, mutedKinds: new Set(['come_sta']), comeSta: line }), null);
  assert.equal(R.KIND_NAMES.come_sta, 'Quando la tua persona non sta bene');
  assert.equal(R.action({ kind: 'come_sta', vars: {} }, 'Bea').go, 'come_sta');
  const js = read('us-ricorda.js');
  assert.match(js, /if \(comeSta && store\(COMESTA\(\)\) === comeSta\.ref_key\) comeSta = null;/);
  assert.match(js, /if \(t\.closest\('\[data-battuta-think\]'\) && current\) \{ closeSheet\(\); w\.sendThinkSignal\?\.\(\); return; \}/);
  assert.match(js, /if \(t\.closest\('\[data-battuta-gesture\]'\) && current\) \{ closeSheet\(\); w\.UsMemberStatus\?\.respond\?\.\(\); return; \}/);
});

test('the things on the characters (D8); at night only who is not unwell sleeps; Come stai repaints at once', () => {
  assert.deepEqual({ ...P.THING }, { lavoro: 'valigetta', studio: 'libro', palestra: 'fascia', viaggio: 'valigia', tavola: 'forchetta', malato: 'termometro' });
  for (const [status, thing] of Object.entries(P.THING)) {
    for (const shape of P.SHAPES) {
      const svg = P.character({ shape, color: '#ff7c96' }, { mood: status, reaction: '' });
      assert.match(svg, new RegExp(`data-thing="${thing}"`), `${status} ${shape}`);
      assert.ok(P.thingSvg(thing, shape).length > 40);
    }
  }
  assert.doesNotMatch(P.character({ shape: 'palla', color: '#ff7c96' }, { mood: 'felice', reaction: '' }), /data-thing/);
  // Asleep: no thing; not feeling well: no sleep, the thermometer stays.
  const night = P.character({ shape: 'palla', color: '#ff7c96' }, { mood: 'lavoro', reaction: 'sera' });
  assert.match(night, />z</);
  assert.doesNotMatch(night, /data-thing/);
  const sick = P.character({ shape: 'palla', color: '#ff7c96' }, { mood: 'malato', reaction: 'sera' });
  assert.doesNotMatch(sick, />z</);
  assert.match(sick, /data-thing="termometro"/);
  // The wardrobe previews show the clothes, not the briefcase.
  const js = read('personaggi.js');
  assert.match(js, /character\(role, \{ size: 44, reaction: '', thing: '', head:/);
  assert.match(js, /w\.addEventListener\('us:member-status-changed', \(\) => \{/);
  // The answer the other person sent: a little heart by the head (or their heart eyes, or the party).
  assert.match(P.character({ shape: 'quadrato', color: '#a98bff' }, { reaction: 'coccola' }), /class="us-char-coccola"/);
  // The same steps on the widgets.
  const java = read('native-plugins/us-widget-bridge/android/src/main/java/com/usapp/widget/UsCharacterShapes.java');
  const swift = read('native-plugins/us-widget-bridge/ios/Sources/UsWidgetBridgePlugin/Core/UsCharacterShapes.swift');
  for (const step of ['M-3 75 Q-3 72 0 72 H20 Q23 72 23 75 V89 Q23 92 20 92 H0 Q-3 92 -3 89 Z', 'M-4 69 Q-4 66 -1 66 H17 Q20 66 20 69 V91 Q20 94 17 94 H-1 Q-4 94 -4 91 Z', 'M-3 70 H19 Q22 70 22 73 V93 Q22 96 19 96 H-3 Z', 'M5 66 H11 V93 Q11 96 8 96 Q5 96 5 93 Z', 'M2 49 V60 M8 49 V60 M14 49 V60 M2 58 Q2 66 8 66 Q14 66 14 58']) {
    assert.ok(js.includes(step) && java.includes(step) && swift.includes(step), step);
  }
  for (const native of [java, swift]) {
    for (const [status, thing] of Object.entries(P.THING)) assert.match(native, new RegExp(`case "${status}": return "${thing}"`), status);
  }
});

test('the sheet and the Oggi row: the gesture, «Mandato ♡», the Noi calendar from «In viaggio»; tap targets', () => {
  const html = read('index.html');
  assert.match(html, /<button type="button" class="us-status-respond" id="usStatusRespond" hidden><span data-status-respond-label><\/span><\/button>/);
  assert.match(html, /<button type="button" class="og-pill us-status-reply-pill" id="usOggiStatusReply" hidden><\/button>/);
  assert.match(html, /<p id="usStatusTripText">Lo segno nel calendario di Noi\?<\/p>/);
  const css = read('member-status.css');
  assert.match(css, /\.us-status-reply-pill:not\(\[hidden\]\)\{[^}]*min-width:44px;[^}]*min-height:44px;/);
  assert.match(css, /\.us-status-respond\{[^}]*min-height:48px/);
  assert.match(css, /\.us-status-trip button\{min-height:44px/);
  const module = read('member-status.js');
  assert.match(module, /db\.rpc\('respond_member_status', \{ p_status_set_at: state\.partner\.set_at, p_gesture: g \}\)/);
  assert.match(module, /if \(!data\?\.already\) w\.sendWebPushEvent\?\.\('status_response'\);/);
  assert.match(module, /if \(ok && status === 'viaggio' && opened\(\)\) showTrip\(true\);/);
  assert.match(module, /w\.UsCalendarLinks\?\.createPrefilled\?\.\(todayISO\(\), \{ title: t\('In viaggio'\), allDay: true \}\)/);
  assert.match(read('calendar.js'), /function createCalendarEntryPrefilled\(dateISO, prefill = \{\}\) \{\s*createCalendarEntryForDate\(dateISO\);/);
  // D13: a change of mine tells the other person's widgets, silently.
  assert.match(module, /w\.sendWebPushEvent\?\.\('partner_status'\);/);
});
