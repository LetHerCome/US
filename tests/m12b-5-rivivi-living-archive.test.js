// M12B.5 — Rivivi as a deterministic consumer of the Living Archive.
// The archive adapter, the selection and the source-aware Rivivi card are
// executed for real (vm); the data wiring is asserted on source.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const APP = read('app.js');
const between = (start, end) => {
  const i = APP.indexOf(start);
  const j = APP.indexOf(end, i + start.length);
  assert.ok(i >= 0 && j > i, `block ${start}`);
  return APP.slice(i, j);
};
const ARCHIVE = between('// ===== M8A — Ricordi living archive =====', 'async function hydrateMomentsCore()');
const CORE = between('async function hydrateMomentsCore(){', 'let momentsHydrateInFlight');

function load() {
  const window = {};
  const roots = new Map();
  const el = (id) => {
    if (!roots.has(id)) roots.set(id, { id, hidden: true, innerHTML: '', addEventListener() {} });
    return roots.get(id);
  };
  const opened = [];
  const context = vm.createContext({
    window,
    document: { getElementById: el, querySelectorAll: () => [], querySelector: () => null },
    escapeHtml: (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`),
    go() {},
    openMomentViewer: (card) => opened.push(card),
    console,
  });
  vm.runInContext(`${ARCHIVE}\nwindow.render=renderRicordiRivivi;window.eventCard=ricordiEventCard;window.momentCard=ricordiMomentCard;`, context);
  return { api: window.UsRicordiArchive, render: window.render, eventCard: window.eventCard, momentCard: window.momentCard, root: el('ricordiRivivi') };
}

const TODAY = '2026-10-01';
const m = (id, date, extra = {}) => ({ id, moment_date: date, created_at: `${date}T10:00:00Z`, storage_path: `p/${id}`, created_by: 'u1', caption: null, ...extra });
const lived = (id, title, completedAt) => ({ id, title, completed_at: completedAt });
const ev = (id, date, extra = {}) => ({ source_ref: id, occurrence_date: date, completed_at: `${date}T21:00:00Z`, title: 'Cena a Roma', title_source: 'snapshot', moment_id: null, ...extra });
const kept = (qid, date, extra = {}) => ({ id: `k-${qid}`, source_key: `daily_question:${qid}`, question_text: 'Quale posto per te è “nostro”?', question_date: date,
  francesco_answer: 'Il lago', beatrice_answer: 'La terrazza <b>', revealed_at: `${date}T20:00:00Z`, ...extra });
const prov = (kind, ref, momentId, extra = {}) => ({ source_kind: kind, source_ref: ref, target_moment_id: momentId, source_title: null, source_date: null, ...extra });
const keys = (entries) => [...entries].map((e) => e.sourceKey);

// ---------------------------------------------------------------- identity
test('M12B.5 identity: every archive family carries its canonical source key, never one built from text', () => {
  const { api } = load();
  const t = api.timeline([m('m1', '2026-05-01')], [lived('b1', 'Mostra', '2026-04-10T18:00:00Z')], [kept('q1', '2026-03-03')], [ev('c1', '2026-02-14')], []);
  assert.deepEqual(keys(t).sort(), ['da_vivere:b1', 'daily_question:q1', 'moment:m1', 'shared_event_completion:c1']);
  assert.deepEqual([...t].map((e) => e.kind).sort(), ['daily', 'event', 'experience', 'moment']);
});

test('M12B.5 identity: a keepsake without its server source key is not an archive fact (no identity is invented)', () => {
  const { api } = load();
  const t = api.timeline([], [], [kept('q1', '2026-03-03', { source_key: null }), kept('q2', '2026-03-04', { source_key: 'moment:x' })], [], []);
  assert.equal(t.length, 0);
});

// ---------------------------------------------------------------- dedup
test('M12B.5 dedup A: Da vivere + its linked Moment are ONE experience; provenance snapshot owns historical title/date', () => {
  const { api } = load();
  const t = api.timeline(
    [m('m1', '2026-05-12', { caption: 'che sera' })],
    [lived('b1', 'Concerto rinominato', '2026-05-11T22:00:00Z')],
    [], [], [prov('da_vivere', 'b1', 'm1', { source_title: 'Concerto originale', source_date: '2026-05-10' })]);
  assert.equal(t.length, 1);
  assert.equal(t[0].sourceKey, 'da_vivere:b1');
  assert.equal(t[0].kind, 'experience');
  assert.equal(t[0].moment.id, 'm1');
  assert.equal(t[0].date, '2026-05-10', 'uses frozen lived date, not confirm or photo date');
  assert.equal(t[0].title, 'Concerto originale', 'uses frozen source title after later rename');
  assert.equal(t[0].row.title, 'Concerto originale');
  const ch = [...api.chapters(t)].map((c) => ({ count: c.count, moments: c.moments, experiences: c.experiences, cover: c.cover?.id }));
  assert.deepEqual(ch, [{ count: 1, moments: 0, experiences: 1, cover: 'm1' }], 'Capitoli count it once and use its photo');
});

test('M12B.5 dedup B: Event completion + its linked Moment are ONE experience (via provenance or the history view)', () => {
  const { api } = load();
  const viaProvenance = api.timeline([m('m1', '2026-02-15')], [], [], [ev('c1', '2026-02-14')], [prov('shared_event_completion', 'c1', 'm1')]);
  const viaView = api.timeline([m('m1', '2026-02-15')], [], [], [ev('c1', '2026-02-14', { moment_id: 'm1' })], []);
  for (const t of [viaProvenance, viaView]) {
    assert.deepEqual(keys(t), ['shared_event_completion:c1']);
    assert.equal(t[0].kind, 'event');
    assert.equal(t[0].moment.id, 'm1');
    assert.equal(t[0].date, '2026-02-14', 'event occurrence remains canonical over the photo date');
  }
});

test('M12B.5 dedup C: the same title on unrelated sources stays two experiences (never dedup by title)', () => {
  const { api } = load();
  const t = api.timeline([m('m1', '2026-01-10', { caption: 'Cena a Roma' })], [lived('b1', 'Cena a Roma', '2026-02-01T20:00:00Z')], [], [ev('c1', '2026-03-01'), ev('c2', '2025-03-01')], []);
  assert.deepEqual(keys(t).sort(), ['da_vivere:b1', 'moment:m1', 'shared_event_completion:c1', 'shared_event_completion:c2']);
});

test('M12B.5 dedup D: the same source identity is always one candidate, whatever its representations', () => {
  const { api } = load();
  const t = api.timeline(
    [m('m1', '2026-02-15'), m('m1', '2026-02-15')],
    [lived('b1', 'Mostra', '2026-01-02T10:00:00Z'), lived('b1', 'Mostra', '2026-01-02T10:00:00Z')],
    [kept('q1', '2026-03-03'), kept('q1', '2026-03-03')],
    [ev('c1', '2026-02-14', { moment_id: 'm1' }), ev('c1', '2026-02-14', { moment_id: 'm1' })],
    [prov('shared_event_completion', 'c1', 'm1')]);
  assert.deepEqual(keys(t).sort(), ['da_vivere:b1', 'daily_question:q1', 'shared_event_completion:c1']);
  assert.equal(new Set(keys(t)).size, t.length);
});

test('M12B.5 dedup: a linked Moment whose source is not readable any more keeps the source identity and its snapshot', () => {
  const { api } = load();
  const t = api.timeline([m('m1', '2026-05-09')], [], [], [], [prov('da_vivere', 'b9', 'm1', { source_title: 'Picnic', source_date: '2026-05-08' })]);
  assert.equal(t.length, 1);
  assert.equal(t[0].sourceKey, 'da_vivere:b9');
  assert.equal(t[0].title, 'Picnic');
  assert.equal(t[0].date, '2026-05-08');
});

// ---------------------------------------------------------------- eligibility
test('M12B.5 eligibility: old Moment yes, recent Moment no; unkept Daily answers are not an input at all', () => {
  const { api } = load();
  assert.equal(api.pickRivivi(api.timeline([m('recent', '2026-09-20')]), TODAY), null);
  assert.equal(api.pickRivivi(api.timeline([m('old', '2026-06-01')]), TODAY).entry.sourceKey, 'moment:old');
  assert.doesNotMatch(CORE, /daily_answers|daily_questions|get_daily_state/, 'only intentionally kept Dailies (keepsakes) reach Ricordi/Rivivi');
});

test('M12B.5 eligibility: lived Da vivere, Event completion and kept Daily without a photo are eligible on their own', () => {
  const { api } = load();
  for (const [t, key] of [
    [api.timeline([], [lived('b1', 'Mostra', '2026-06-01T18:00:00Z')], [], [], []), 'da_vivere:b1'],
    [api.timeline([], [], [], [ev('c1', '2026-06-01')], []), 'shared_event_completion:c1'],
    [api.timeline([], [], [kept('q1', '2026-06-01')], [], []), 'daily_question:q1'],
  ]) assert.equal(api.pickRivivi(t, TODAY).entry.sourceKey, key);
  assert.equal(api.pickRivivi(api.timeline([], [], [kept('q1', '2026-09-25')], [ev('c1', '2026-09-28')], []), TODAY), null, 'recent facts wait');
});

// ---------------------------------------------------------------- selection
test('M12B.5 selection: an anniversary (±3 days, past year) wins across source kinds, closest first', () => {
  const { api } = load();
  const t = api.timeline([m('m-old', '2026-03-01')], [lived('b1', 'Mostra', '2024-10-04T12:00:00Z')], [], [ev('c1', '2025-09-30')], []);
  const pick = api.pickRivivi(t, TODAY);
  assert.equal(pick.reason, 'anniversary');
  assert.equal(pick.entry.sourceKey, 'shared_event_completion:c1');
  assert.equal(pick.label, 'Un anno fa, in questi giorni');
});

test('M12B.5 selection: without anniversary only 30+ day facts, stable for the whole day and independent of input order', () => {
  const { api } = load();
  const a = [m('m1', '2026-03-01')], b = [lived('b1', 'Mostra', '2026-05-01T12:00:00Z')], c = [ev('c1', '2026-06-01')], d = [kept('q1', '2026-07-01')], recent = [m('m-new', '2026-09-15')];
  const t1 = api.timeline([...a, ...recent], b, d, c, []);
  const t2 = api.timeline([...recent, ...a], [...b].reverse(), d, c, []);
  const p1 = api.pickRivivi(t1, TODAY), p2 = api.pickRivivi(t1, TODAY), p3 = api.pickRivivi([...t2].reverse(), TODAY);
  assert.equal(p1.reason, 'resurface');
  assert.equal(p1.entry.sourceKey, p2.entry.sourceKey);
  assert.equal(p1.entry.sourceKey, p3.entry.sourceKey);
  assert.notEqual(p1.entry.sourceKey, 'moment:m-new');
});

test('M12B.5 selection: consecutive days rotate (also across a month boundary), so the same fact is not shown two days running', () => {
  const { api } = load();
  const t = api.timeline([m('m1', '2026-03-01'), m('m2', '2026-04-01')]);
  for (const [d1, d2] of [['2026-09-30', '2026-10-01'], ['2026-10-31', '2026-11-01'], ['2026-12-31', '2027-01-01'], ['2026-06-10', '2026-06-11']]) {
    assert.notEqual(api.pickRivivi(t, d1).entry.sourceKey, api.pickRivivi(t, d2).entry.sourceKey, `${d1} → ${d2}`);
  }
});

test('US 1.0 presentation: Ricordi paints Rivivi only for a true anniversary', () => {
  assert.match(CORE, /const riviviPick=ricordiPickRivivi\(timeline,today\);\s*renderRicordiRivivi\(riviviPick\?\.reason==='anniversary'\?riviviPick:null,signedUrls,names\);/);
});

test('M12B.5 selection: only recent history, or nothing, gives no Rivivi (never filler)', () => {
  const { api } = load();
  assert.equal(api.pickRivivi(api.timeline([m('m1', '2026-09-10')], [lived('b1', 'X', '2026-09-20T10:00:00Z')], [], [], []), TODAY), null);
  assert.equal(api.pickRivivi([], TODAY), null);
  assert.equal(api.pickRivivi(null, TODAY), null);
});

test('M12B.5 consistency: Rivivi candidates, the story and Capitoli are the same entries', () => {
  const { api } = load();
  const t = api.timeline([m('m1', '2025-02-15'), m('m2', '2025-06-01')], [lived('b1', 'Mostra', '2025-03-01T10:00:00Z')], [kept('q1', '2025-04-01')], [ev('c1', '2025-02-14')], [prov('shared_event_completion', 'c1', 'm1')]);
  const total = [...api.chapters(t)].reduce((n, c) => n + c.count, 0);
  assert.equal(total, t.length);
  for (const day of ['2026-02-14', '2026-03-01', '2026-04-01', '2026-06-01', TODAY]) {
    const pick = api.pickRivivi(t, day);
    assert.ok(pick && keys(t).includes(pick.entry.sourceKey), day);
  }
});

// ---------------------------------------------------------------- rendering
test('M12B.5 card: a plain Moment keeps the photo card and opens the existing Moment viewer with its signed URL', () => {
  const { api, render, root } = load();
  const t = api.timeline([m('m1', '2026-03-01', { caption: 'Al mare' })]);
  render(api.pickRivivi(t, TODAY), new Map([['p/m1', 'https://signed/m1']]), new Map([['u1', 'Bea']]));
  assert.equal(root.hidden, false);
  assert.match(root.innerHTML, /<button type="button" class="ricordi-rivivi-card" data-ricordi-open="m1" data-source-key="moment:m1" data-rivivi-kind="moment" data-url="https:\/\/signed\/m1" data-author="Bea"/);
  assert.match(root.innerHTML, /<b>Al mare<\/b><span>1 marzo 2026 · Bea<\/span>/);
});

test('M12B.5 card: missing media — a plain Moment without a signed URL hides Rivivi; a linked source falls back to its record', () => {
  const { api, render, root } = load();
  render(api.pickRivivi(api.timeline([m('m1', '2026-03-01')]), TODAY), new Map(), new Map());
  assert.equal(root.hidden, true);
  // The Moment of an Event was dropped (no signed URL): the Event itself remains.
  render(api.pickRivivi(api.timeline([], [], [], [ev('c1', '2026-03-01', { moment_id: 'm1' })], []), TODAY), new Map(), new Map());
  assert.equal(root.hidden, false);
  assert.match(root.innerHTML, /class="ricordi-rivivi-card ricordi-rivivi-note" data-source-key="shared_event_completion:c1"/);
  assert.doesNotMatch(root.innerHTML, /<img/);
});

test('M12B.5 card: a lived source with its photo shows source snapshot date/title in Rivivi and its viewer metadata', () => {
  const { api, render, root } = load();
  const t = api.timeline(
    [m('m1', '2026-05-12', { caption: null })],
    [lived('b1', 'Concerto rinominato', '2026-05-11T22:00:00Z')],
    [], [], [prov('da_vivere', 'b1', 'm1', { source_title: 'Concerto al Circo Massimo', source_date: '2026-05-10' })]);
  render(api.pickRivivi(t, TODAY), new Map([['p/m1', 'https://signed/m1']]), new Map([['u1', 'Francesco']]));
  assert.match(root.innerHTML, /data-ricordi-open="m1" data-source-key="da_vivere:b1" data-rivivi-kind="experience"/);
  assert.match(root.innerHTML, /data-date="10 mag 2026"/);
  assert.match(root.innerHTML, /data-caption="Concerto al Circo Massimo"/);
  assert.match(root.innerHTML, /<b>Concerto al Circo Massimo<\/b><span>10 maggio 2026 · Da vivere<\/span>/);
});

test('M12B.5 card: Event without photo uses the historical snapshot title, says "Evento vissuto" and never opens the mutable event', () => {
  const { api, render, root } = load();
  render(api.pickRivivi(api.timeline([], [], [], [ev('c1', '2026-03-07', { title: 'Cena a Roma', current_title: 'Rinominato' })], []), TODAY), new Map(), new Map());
  assert.match(root.innerHTML, /<b>Cena a Roma<\/b><span>7 marzo 2026 · Evento vissuto<\/span>/);
  assert.match(root.innerHTML, /Vissuto insieme il 7 marzo 2026\.<\/p>/);
  assert.doesNotMatch(root.innerHTML, /Rinominato|editEvent|openEventEditor|data-ricordi-experience/);
});

test('M12B.5 card: a legacy completion (title_source live) is shown with the declared live fallback, nothing backfilled', () => {
  const { api, render, root } = load();
  render(api.pickRivivi(api.timeline([], [], [], [ev('c1', '2026-03-07', { title: 'Anniversario', title_source: 'live' })], []), TODAY), new Map(), new Map());
  assert.match(root.innerHTML, /<b>Anniversario<\/b>/);
  assert.match(root.innerHTML, /Il titolo è quello di oggi: quello di allora non era registrato\./);
});

test('M12B.5 card: a lived Da vivere without photo opens the existing Da vivere detail', () => {
  const { api, render, root } = load();
  render(api.pickRivivi(api.timeline([], [lived('b1', 'Mostra di Frida', '2026-04-10T18:00:00Z')], [], [], []), TODAY), new Map(), new Map());
  assert.match(root.innerHTML, /<b>Mostra di Frida<\/b><span>10 aprile 2026 · Da vivere<\/span>/);
  assert.match(root.innerHTML, /<button type="button" class="ricordi-rivivi-link" data-ricordi-experience="b1">Apri in Da vivere<\/button>/);
});

test('M12B.5 card: a kept Daily shows the question, its date and opens on the frozen answer pair (escaped)', () => {
  const { api, render, root } = load();
  const long = 'Qual è il ricordo più lungo e dettagliato che hai di una giornata in cui non è successo niente di speciale ma ti sei sentita a casa?';
  render(api.pickRivivi(api.timeline([], [], [kept('q1', '2026-06-01', { question_text: long })], [], []), TODAY), new Map(), new Map());
  assert.match(root.innerHTML, /data-source-key="daily_question:q1" data-rivivi-kind="daily"/);
  assert.ok(root.innerHTML.includes(`<b>${long}</b><span>1 giugno 2026 · Domanda del giorno</span>`));
  assert.match(root.innerHTML, /<b>Francesco<\/b><p>Il lago<\/p>/);
  assert.match(root.innerHTML, /<b>Bea<\/b><p>La terrazza &#60;b&#62;<\/p>/);
});

test('M12B.5 story: a Moment that is the photo of a lived source says so; an Event without photo is a read-only record', () => {
  const { eventCard, momentCard } = load();
  const html = momentCard(m('m1', '2026-02-15'), 'https://signed/m1', 'Bea', false, false, { kind: 'event', sourceKey: 'shared_event_completion:c1', title: 'Cena a Roma', date: '2026-02-14' });
  assert.match(html, /data-moment-iso="2026-02-14"/);
  assert.match(html, /data-date="14 feb 2026"/);
  assert.match(html, /<small class="ricordi-moment-source" data-source-key="shared_event_completion:c1">Evento vissuto · Cena a Roma<\/small>/);
  assert.match(html, /^<article class="moment-card moment-postit"/, 'editorial rhythm hook unchanged');
  const card = eventCard(ev('c1', '2026-02-14'));
  assert.match(card, /^<article class="ricordi-experience ricordi-event" data-source-key="shared_event_completion:c1" data-title-source="snapshot">/);
  assert.match(card, /<small>Vissuto insieme · 14 febbraio<\/small><b>Cena a Roma<\/b>/);
  assert.doesNotMatch(card, /<img|onclick|data-ricordi-experience/);
});

// ---------------------------------------------------------------- wiring
test('M12B.5 wiring: Ricordi reads event history and provenance as optional, read-only enrichments and feeds one timeline to all three surfaces', () => {
  assert.match(CORE, /sb\.from\('relationship_event_history'\)\.select\('source_ref,occurrence_date,completed_at,title,title_source,moment_id'\)/);
  assert.match(CORE, /sb\.from\('living_provenance'\)\.select\('source_kind,source_ref,source_title,source_date,target_moment_id'\)/);
  assert.match(CORE, /const eventRows=eventsError\?\[\]:\(events\|\|\[\]\);/);
  assert.match(CORE, /const provenanceRows=provenanceError\?\[\]:\(provenance\|\|\[\]\);/);
  assert.match(CORE, /const riviviPick=ricordiPickRivivi\(timeline,today\);/);
  assert.match(CORE, /renderRicordiRivivi\(riviviPick\?\.reason==='anniversary'\?riviviPick:null,signedUrls,names\);/);
  assert.match(CORE, /renderRicordiChapters\(ricordiChapters\(timeline\),signedUrls\);/);
  assert.doesNotMatch(CORE + ARCHIVE, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(|link_moment_to_source|conserva_contributions|left_for_you/);
  assert.doesNotMatch(ARCHIVE, /Math\.random|crypto\.|localStorage|sessionStorage/, 'deterministic, no new storage');
  assert.match(ARCHIVE, /if\(rivivi\)\{openMomentViewer\(rivivi\);return;\}/);
});

test('M12B.5 media and icons: signed URLs only, private media cache untouched, Phosphor icons already in the shell', () => {
  assert.match(CORE, /usGetSignedUrls\(\(rows\|\|\[\]\)\.map\(row=>row\.storage_path\),21600\)/);
  assert.doesNotMatch(ARCHIVE + CORE, /getPublicUrl|caches\.open/);
  const sw = read('service-worker.js');
  assert.match(sw, /const MEDIA_CACHE_NAME = "us-private-media-v1";/);
  const css = read('moments-albums.css').split('M12B.5 · Rivivi source-aware')[1] || '';
  assert.notEqual(css, '');
  for (const icon of [...css.matchAll(/\/assets\/icons\/phosphor\/([a-z-]+\.svg)/g)].map((x) => x[1])) {
    assert.ok(fs.existsSync(path.join(ROOT, 'assets/icons/phosphor', icon)), icon);
    assert.ok(sw.includes(`"/assets/icons/phosphor/${icon}"`), `${icon} precached`);
  }
});

test('M12B.5 data: no M12B.5 migration; M12B.3 / M12B.4 / Game V2 SQL untouched', () => {
  const migrations = fs.readdirSync(path.join(ROOT, 'supabase/migrations')).sort();
  assert.ok(migrations.includes('20261001093123_m12b_4_daily_question_keepsakes.sql'));
  assert.equal(migrations.filter((file) => /m12b[_-]?5/i.test(file)).length, 0);
});
