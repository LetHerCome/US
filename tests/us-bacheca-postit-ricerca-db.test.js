// La bacheca, fasi 2 e 3 (founder, grill 27/11/2026 D1–D16): your post-its on
// the things of the board (80 characters, one per person, each edits only
// their own, tied to the thing and not to the pin), the search in Ricordi on
// the server (only the couple's, only what was kept, at most 60) and «fai
// spazio» (take one unfixed thing down and pin the new one, atomically).
// Full repo schema in disposable PGlite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const DIR = path.join(__dirname, '../supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_bacheca_postit_ricerca\.sql$/.test(f));

let db;
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
let n = 0;
const moment = (by, date, { place = null, caption = null } = {}) => q(
  "insert into public.moments(couple_id, created_by, storage_path, moment_date, caption, place_label, place_lat, place_lon, place_source) values ($1, $2, $3, $4::date, $5, $6, case when $6::text is null then null else 45.4 end, case when $6::text is null then null else 11.9 end, case when $6::text is null then null else 'search' end) returning id",
  [h.A, by, `c/${by}/p${++n}.webp`, date, caption, place]).then((r) => r[0].id);
const letter = async (from, to, body, { kept = true, at = '2026-03-02T10:00:00Z' } = {}) => {
  const item = (await q("insert into public.left_for_you(couple_id, sender_id, recipient_id, kind, body) values ($1, $2, $3, 'text', $4) returning id", [h.A, from, to, body]))[0].id;
  if (!kept) return { item };
  const cc = (await q('insert into public.conserva_contributions(couple_id, source_item_id, source_sender_id, conserved_by, created_at) values ($1, $2, $3, $4, $5) returning id', [h.A, item, from, to, at]))[0].id;
  return { item, cc };
};
const question = async (text, date) => (await q('insert into public.daily_questions(id, question_date, question) values (gen_random_uuid(), $1, $2) returning id', [date, text]))[0].id;
const keepsake = async (qid, text, date, fa, ba) => (await q("insert into public.daily_question_keepsakes(couple_id, question_id, question_text, question_date, francesco_answer, beatrice_answer, revealed_at, kept_by_role) values ($1, $2, $3, $4, $5, $6, now(), 'francesco') returning id", [h.A, qid, text, date, fa, ba]))[0].id;
const postit = (who, ref, body) => h.as(db, who, 'select public.bacheca_postit_v1($1, $2) r', [ref, body]);
const thing = (who, ref) => h.as(db, who, 'select public.get_bacheca_thing_v1($1) r', [ref]);
const search = (who, args = {}) => h.as(db, who, 'select public.search_ricordi_v1($1, $2, $3, $4, $5) r', [args.query ?? null, args.year ?? null, args.place ?? null, args.who ?? null, args.month ?? null]);
const pinIt = (who, source, id, replace = null) => h.as(db, who, 'select public.bacheca_pin_v1($1, $2, $3) r', [source, id, replace]);
const board = (who = h.F) => h.as(db, who, 'select public.get_bacheca_v1() r');

test.beforeEach(async () => { db = await h.database(); n = 0; });
test.afterEach(async () => { await db?.close(); db = null; });

test('migration is listed; post-its are read by the couple only and written only through the function', async () => {
  assert.ok(FILE, 'missing supabase/migrations/*_bacheca_postit_ricerca.sql');
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
  const m = await moment(h.F, '2026-05-01', { caption: 'Sperlonga' });
  assert.equal((await postit(h.F, `moment:${m}`, 'Il giorno delle ciabatte')).status, 'saved');
  assert.equal(await h.as(db, h.B, 'select count(*)::int r from public.us_bacheca_notes'), 1);
  await h.create(db, h.U1);
  assert.equal(await h.as(db, h.U1, 'select count(*)::int r from public.us_bacheca_notes'), 0, 'another couple sees nothing');
  assert.equal((await postit(h.U1, `moment:${m}`, 'Non è mia')).status, 'no', 'never on another couple\'s thing');
  assert.equal(await h.as(db, h.U1, 'select public.get_bacheca_thing_v1($1) is null r', [`moment:${m}`]), true);
  await assert.rejects(h.as(db, h.F, "insert into public.us_bacheca_notes(couple_id, ref_key, author_id, body) values ($1, $2, $3, 'x') returning id r", [h.A, `moment:${m}`, h.F]), /permission denied/);
  await assert.rejects(h.as(db, h.F, "update public.us_bacheca_notes set body = 'y' returning id r"), /permission denied/);
  await assert.rejects(h.as(db, h.F, 'select count(*) r from public.us_bacheca_why'), /permission denied/);
});

test('80 characters, one per person per thing, each edits and takes down only their own', async () => {
  const m = await moment(h.F, '2026-05-01', { caption: 'Sperlonga' });
  const ref = `moment:${m}`;
  assert.equal((await postit(h.F, ref, 'x'.repeat(81))).status, 'too_long');
  assert.equal((await postit(h.F, ref, '   ')).status, 'none', 'nothing to take down');
  const first = await postit(h.F, ref, `  ${'a'.repeat(80)}  `);
  assert.deepEqual([first.status, first.created], ['saved', true]);
  const again = await postit(h.F, ref, 'Il giorno   che hai perso\nle ciabatte');
  assert.deepEqual([again.status, again.created, again.id], ['saved', false, first.id], 'the same post-it, changed');
  assert.equal((await postit(h.B, ref, 'Torniamo a giugno?')).status, 'saved', 'the other writes their own');
  let t = await thing(h.B, ref);
  assert.deepEqual(t.notes.map((x) => [x.body, x.mine]), [['Il giorno che hai perso le ciabatte', false], ['Torniamo a giugno?', true]]);
  assert.equal((await postit(h.B, ref, '')).status, 'deleted', 'Bea takes down hers');
  t = await thing(h.F, ref);
  assert.deepEqual(t.notes.map((x) => x.body), ['Il giorno che hai perso le ciabatte'], 'Francesco\'s stays: Bea cannot touch it');
  await assert.rejects(q("insert into public.us_bacheca_notes(couple_id, ref_key, author_id, body) values ($1, $2, $3, $4)", [h.A, ref, h.F, 'doppio']), /us_bacheca_notes_one/);
  await assert.rejects(q("insert into public.us_bacheca_notes(couple_id, ref_key, author_id, body) values ($1, $2, $3, $4)", [h.A, ref, h.B, 'x'.repeat(81)]), /us_bacheca_notes_body/);
});

test('a post-it makes the thing yours, survives the unpin with US\'s why, and comes back when pinned again', async () => {
  const first = await moment(h.F, '2026-04-22', { caption: 'Il primo', place: 'Sperlonga' });
  await q('select private.us_bacheca_plan($1, $2::date)', [h.A, '2026-11-01']);
  let b = await board();
  const pin = b.pins.find((p) => p.source_id === first);
  assert.deepEqual([pin.ref_key, pin.by_us, pin.why.reason, pin.notes], [`moment:${first}`, true, 'primo', []]);
  await postit(h.B, pin.ref_key, 'Il nostro mare');
  b = await board();
  const mine = b.pins.find((p) => p.id === pin.id);
  assert.deepEqual([mine.by_us, mine.fixed, mine.why.reason, mine.notes.map((x) => x.body)], [false, false, 'primo', ['Il nostro mare']], 'yours now: US never takes it down by itself');
  assert.equal(b.pins.length, 1, 'a post-it takes no place');
  assert.equal(await h.as(db, h.F, 'select public.bacheca_pin_action_v1($1, $2) r', [pin.id, 'unpin']), true);
  const off = await thing(h.F, pin.ref_key);
  assert.deepEqual([off.pin, off.why.reason, off.notes.map((x) => x.body), off.count, off.limit], [null, 'primo', ['Il nostro mare'], 0, 12], 'not pinned: US\'s why and yours stay with the memory');
  assert.equal((await postit(h.F, pin.ref_key, 'Ci torniamo')).status, 'saved', 'you can write on it while it is not pinned');
  assert.equal(await pinIt(h.F, 'moment', first), 'pinned');
  const back = (await board()).pins.find((p) => p.source_id === first);
  assert.deepEqual([back.reason, back.why.reason, back.notes.map((x) => x.body)], ['scelta', 'primo', ['Il nostro mare', 'Ci torniamo']]);
});

test('deleting the memory or the kept item takes its post-its and its why with it; a couple can still be deleted', async () => {
  const m = await moment(h.F, '2026-04-22', { caption: 'Il primo' });
  const { item, cc } = await letter(h.B, h.F, 'Ti aspetto alla stazione');
  const k = await keepsake(await question('Il posto dove vorresti tornare?', '2026-06-01'), 'Il posto dove vorresti tornare?', '2026-06-01', 'Vasto', 'Il mare');
  await q('select private.us_bacheca_plan($1, $2::date)', [h.A, '2026-11-01']);
  for (const ref of [`moment:${m}`, `conserva:${cc}`, `keepsake:${k}`]) assert.equal((await postit(h.F, ref, 'Un post-it')).status, 'saved', ref);
  await q("insert into public.us_bacheca_why(couple_id, ref_key, reason) values ($1, $2, 'tenuta')", [h.A, `conserva:${cc}`]);
  await q('delete from public.moments where id = $1', [m]);
  await q('delete from public.left_for_you where id = $1', [item]);
  await q('delete from public.daily_question_keepsakes where id = $1', [k]);
  assert.deepEqual(await q('select ref_key from public.us_bacheca_notes'), []);
  assert.deepEqual(await q('select ref_key from public.us_bacheca_why'), []);
  assert.deepEqual(await q('select ref_key from public.us_bacheca_pins'), []);
  const again = await moment(h.F, '2026-05-01', { caption: 'Il secondo' });
  await pinIt(h.F, 'moment', again);
  await postit(h.B, `moment:${again}`, 'Resta');
  await q("update public.us_bacheca_pins set reason = 'storia' where couple_id = $1", [h.A]);
  await q('delete from public.couples where id = $1', [h.A]);
  assert.deepEqual(await q('select * from public.us_bacheca_why'), [], 'the couple gone: nothing left behind');
});

test('the search: captions, places, post-its, months, names, kept letters and answers; never what was not kept', async () => {
  const sea = await moment(h.F, '2024-08-12', { caption: 'Il primo bagno al mare', place: 'Sperlonga' });
  const town = await moment(h.B, '2025-06-14', { caption: 'Tramonto', place: 'Vasto' });
  const city = await moment(h.B, '2025-03-01', { caption: 'Caffè in piazza', place: 'Padova' });
  await moment(h.F, '2025-03-08', { caption: 'Di nuovo', place: 'padova ' });
  await postit(h.B, `moment:${town}`, 'Torniamo al mare a giugno?');
  const { cc } = await letter(h.B, h.F, 'Il mare d\'inverno con te');
  await letter(h.F, h.B, 'Il mare segreto, mai tenuto', { kept: false });
  const qid = await question('Il posto dove vorresti tornare con me?', '2025-06-20');
  const k = await keepsake(qid, 'Il posto dove vorresti tornare con me?', '2025-06-20', 'Il mare, sempre il mare, con te.', 'Vasto');
  const other = await question('Una domanda mai tenuta', '2025-07-01');
  await q("insert into public.daily_answers(question_id, user_id, couple_id, answer) values ($1, $2, $3, 'Il mare nascosto')", [other, h.F, h.A]);
  const res = await search(h.F, { query: 'MARE' });
  const refs = res.results.map((r) => r.ref_key);
  assert.deepEqual(new Set(refs), new Set([`moment:${sea}`, `moment:${town}`, `conserva:${cc}`, `keepsake:${k}`]), 'caption, a post-it, a kept letter, a kept answer');
  assert.ok(!JSON.stringify(res).includes('segreto') && !JSON.stringify(res).includes('nascosto'), 'never a letter or an answer not kept');
  assert.deepEqual(res.results.map((r) => r.date), [...res.results.map((r) => r.date)].sort().reverse(), 'newest first');
  assert.equal(res.results.find((r) => r.kind === 'conserva').content.body, 'Il mare d\'inverno con te');
  // Accents, months, years, names, words together.
  assert.deepEqual((await search(h.F, { query: 'caffe' })).results.map((r) => r.id), [city]);
  assert.deepEqual((await search(h.F, { query: 'agosto 2024' })).results.map((r) => r.id), [sea]);
  assert.deepEqual((await search(h.F, { query: 'august' })).results.map((r) => r.id), [sea]);
  assert.ok((await search(h.F, { query: 'beatrice tramonto' })).results.some((r) => r.id === town), 'who added it');
  assert.deepEqual((await search(h.F, { query: 'vasto giugno' })).results.map((r) => r.kind).sort(), ['keepsake', 'moment']);
  // US's own post-it.
  await q('select private.us_bacheca_plan($1, $2::date)', [h.A, '2026-11-01']);
  assert.ok((await search(h.F, { query: 'primo ricordo' })).results.some((r) => r.id === sea && r.pin), 'US\'s why, and the pin it has');
  // Filters.
  assert.deepEqual((await search(h.F, { place: 'Padova' })).results.length, 2, 'one place, however it was written');
  assert.ok((await search(h.F, { year: 2025, who: 'partner' })).results.every((r) => r.by === h.B));
  assert.ok((await search(h.F, { who: 'me' })).results.every((r) => r.mine));
  assert.deepEqual((await search(h.F, { year: 2025, month: 6 })).results.map((r) => r.kind).sort(), ['keepsake', 'moment']);
  // Wildcards are letters.
  assert.deepEqual((await search(h.F, { query: '%' })).results, []);
  assert.deepEqual((await search(h.F, { query: '_' })).results, []);
  // Empty: hints only.
  const empty = await search(h.F);
  assert.deepEqual(empty.results, []);
  assert.deepEqual(empty.hints.years, [2026, 2025, 2024], 'the kept letter is of 2026');
  assert.equal(empty.hints.places[0].toLowerCase(), 'padova', 'the places with most memories first');
  assert.equal(empty.hints.limit, 12);
  // Another couple finds nothing of this one.
  await h.create(db, h.U1);
  assert.deepEqual((await search(h.U1, { query: 'mare' })).results, []);
  assert.deepEqual((await search(h.U1)).hints.years, []);
});

test('the search gives at most 60 results', async () => {
  await q("insert into public.moments(couple_id, created_by, storage_path, moment_date, caption) select $1, $2, 'c/x/' || g || '.webp', date '2025-01-01' + g, 'Giornata ' || g from generate_series(1, 75) g", [h.A, h.F]);
  const res = await search(h.B, { query: 'giornata' });
  assert.equal(res.results.length, 60);
  assert.equal(res.results[0].date, '2025-03-17');
});

test('fai spazio: one unfixed thing comes down and the new one goes up, in one go; fixed ones never', async () => {
  const ids = [];
  for (let i = 0; i < 12; i += 1) ids.push(await moment(h.F, `2025-0${1 + (i % 9)}-1${i % 10}`, { caption: `R${i}` }));
  // Today is planned already: US adds nothing of its own during the test.
  await q("insert into public.us_bacheca_planned(couple_id, day, first_fill) values ($1, (now() at time zone 'Europe/Rome')::date, true)", [h.A]);
  for (const id of ids) assert.equal(await pinIt(h.F, 'moment', id), 'pinned');
  await q("update public.us_bacheca_pins set fixed = false, reason = 'storia', pinned_by = null where source_id = any($1::uuid[])", [ids.slice(0, 3)]);
  const fresh = await moment(h.B, '2026-06-01', { caption: 'Vasto, tramonto' });
  assert.equal(await pinIt(h.B, 'moment', fresh), 'full');
  const all = (await board(h.B)).pins;
  const fixed = all.find((p) => p.fixed);
  const loose = all.find((p) => !p.fixed);
  await postit(h.F, loose.ref_key, 'Resta col ricordo');
  assert.equal(await pinIt(h.B, 'moment', fresh, fixed.id), 'fixed', 'a fixed thing cannot be picked');
  assert.equal((await board(h.B)).pins.length, 12);
  const bc = (await h.create(db, h.U1)).couple_id;
  const theirs = (await q("insert into public.moments(couple_id, created_by, storage_path, moment_date) values ($1, $2, 'u1/x.webp', '2026-01-01') returning id", [bc, h.U1]))[0].id;
  assert.equal(await pinIt(h.U1, 'moment', theirs, loose.id), 'pinned', 'their own board is empty');
  assert.equal((await board(h.B)).pins.length, 12, 'another couple never takes down one of yours');
  assert.equal(await pinIt(h.B, 'moment', fresh, loose.id), 'replaced');
  const after = (await board(h.B)).pins;
  assert.equal(after.length, 12);
  assert.ok(after.some((p) => p.source_id === fresh && p.mine && p.fixed));
  assert.ok(!after.some((p) => p.id === loose.id));
  const gone = await thing(h.F, loose.ref_key);
  assert.deepEqual([gone.pin, gone.why.reason, gone.notes.map((x) => x.body)], [null, 'storia', ['Resta col ricordo']], 'the post-its of what came down stay with it');
  assert.equal(await pinIt(h.B, 'moment', fresh, loose.id), 'already');
  // Not full: p_replace is not needed and nothing is taken down.
  await h.as(db, h.F, 'select public.bacheca_pin_action_v1($1, $2) r', [after[0].id, 'unpin']);
  assert.equal(await pinIt(h.F, 'moment', loose.source_id, after[1].id), 'pinned');
  assert.ok((await board()).pins.some((p) => p.id === after[1].id));
  // Kept letters and answers go up the same way.
  const { cc } = await letter(h.B, h.F, 'Una lettera');
  const k = await keepsake(await question('Domanda?', '2025-01-01'), 'Domanda?', '2025-01-01', 'Sì', 'No');
  await h.as(db, h.F, 'select public.bacheca_pin_action_v1($1, $2) r', [after[2].id, 'unpin']);
  assert.equal(await pinIt(h.F, 'conserva', cc), 'pinned');
  assert.equal(await pinIt(h.F, 'keepsake', k), 'full');
});
