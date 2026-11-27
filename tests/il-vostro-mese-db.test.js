// Il vostro mese (founder, 27/11/2026; grill P1–P8, C1–C6): the pack of the
// month just ended, 10 cards chosen once by rules for the couple, the content
// read live. Variety, the rare card, a poor month, only what both have read,
// safety between couples, idempotence, a deleted memory, leaving the couple.
// Full repo schema in disposable PGlite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const DIR = path.join(__dirname, '../supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_il_vostro_mese\.sql$/.test(f));

let db;
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const build = async (from, to) => (await q('select private.us_mese_build($1, $2::date, $3::date) r', [h.A, from, to]))[0].r;
let n = 0;
const moment = (by, date, { place = null, caption = null, createdAt = null, couple = h.A } = {}) => q(
  "insert into public.moments(couple_id, created_by, storage_path, moment_date, caption, place_label, place_lat, place_lon, place_source, created_at) values ($1, $2, $3, $4::date, $5, $6, case when $6::text is null then null else 45.4 end, case when $6::text is null then null else 11.9 end, case when $6::text is null then null else 'search' end, coalesce($7::timestamptz, now())) returning id",
  [couple, by, `c/${by}/m${++n}.webp`, date, caption, place, createdAt]).then((r) => r[0].id);
const LONG = 'Una risposta abbastanza lunga da contare come una vera risposta';
async function question(date, { answers = [LONG, LONG], seen = 2, hearts = 0, keep = false } = {}) {
  const id = (await q("insert into public.daily_questions(question_date, question, category) values ($1::date, $2, 'x') returning id", [date, `Domanda del ${date}?`]))[0].id;
  if (answers[0]) await q('insert into public.daily_answers(question_id, user_id, couple_id, answer) values ($1, $2, $3, $4)', [id, h.F, h.A, answers[0]]);
  if (answers[1]) await q('insert into public.daily_answers(question_id, user_id, couple_id, answer) values ($1, $2, $3, $4)', [id, h.B, h.A, answers[1]]);
  for (const [i, role] of ['francesco', 'beatrice'].entries()) {
    await q('insert into public.daily_question_reveal_states(couple_id, question_id, actor_role, reveal_seen_at, reaction) values ($1, $2, $3, $4, $5)',
      [h.A, id, role, i < seen ? new Date().toISOString() : null, i < hearts ? 'heart' : null]);
  }
  if (keep) await q("insert into public.daily_question_keepsakes(couple_id, question_id, question_text, question_date, francesco_answer, beatrice_answer, revealed_at, kept_by_role, kept_at) values ($1, $2, 'Q', $3::date, $4, $4, now(), 'francesco', now())", [h.A, id, date, LONG]);
  return id;
}
async function lived(title, at) {
  const id = (await q("insert into public.bucket_items(couple_id, created_by, title) values ($1, $2, $3) returning id", [h.A, h.F, title]))[0].id;
  await q("select set_config('us.bucket_items_lived_confirm', 'on', false)");
  await q("update public.bucket_items set status = 'lived' where id = $1", [id]);
  await q("select set_config('us.bucket_items_lived_confirm', '', false)");
  // The guard keeps the first completed_at: the test backdates it with the triggers off.
  await q('set session_replication_role = replica');
  await q('update public.bucket_items set completed_at = $2::timestamptz where id = $1', [id, at]);
  await q('set session_replication_role = origin');
  return id;
}
async function swipe(at, picks) {
  const s = (await q("insert into public.game_sessions(couple_id, game_family, content_source, started_by_role, create_request_id, completed_at, engine_version) values ($1, 'swipe', 'curated', 'francesco', gen_random_uuid(), $2::timestamptz, 2) returning id", [h.A, at]))[0].id;
  const items = [];
  for (const [i, [a, b]] of picks.entries()) {
    const it = (await q("insert into public.game_session_items(session_id, position, question_text, answer_kind, options, mechanic, context) values ($1, $2, 'Mare o montagna?', 'choice', '[\"Mare\",\"Montagna\"]', 'reciprocal', '{}') returning id", [s, i + 1]))[0].id;
    await q("insert into public.game_session_answers(item_id, actor_role, answer_index) values ($1, 'francesco', $2), ($1, 'beatrice', $3)", [it, a, b]);
    items.push(it);
  }
  await q("insert into public.game_session_sides(session_id, actor_role, completed_at, reveal_seen_at) values ($1, 'francesco', now(), now()), ($1, 'beatrice', now(), now())", [s]);
  return items;
}
const think = (at) => q("insert into public.shared_messages(couple_id, sender_id, recipient_id, kind, body, created_at) values ($1, $2, $3, 'think', 'Ti penso', $4::timestamptz)", [h.A, h.F, h.B, at]);
const kinds = (cards) => cards.map((c) => c.k);
// h.as gives the rows when the value is null: the value, or null.
const one = async (user, sql, p = []) => { const v = await h.as(db, user, sql, p); return Array.isArray(v) ? (v[0]?.r ?? null) : v; };
const lastMonth = async () => (await q("select (date_trunc('month', now() at time zone 'Europe/Rome') - interval '1 month')::date::text d"))[0].d;

test.beforeEach(async () => { db = await h.database(); n = 0; });
test.afterEach(async () => { await db?.close(); db = null; });

test('migration is listed; the couple reads its packs; writes only through the functions', async () => {
  assert.ok(FILE, 'missing supabase/migrations/*_il_vostro_mese.sql');
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
  const sql = fs.readFileSync(path.join(DIR, FILE), 'utf8');
  for (const fn of ['get_carte_v1(int)', 'get_pacchetto_v1(uuid)', 'apri_pacchetto_v1(uuid)']) {
    assert.ok(sql.includes(`revoke all on function public.${fn} from public, anon;`), fn);
    assert.ok(sql.includes(`grant execute on function public.${fn} to authenticated;`), fn);
  }
  for (const fn of ['us_mese_build(uuid, date, date)', 'us_mese_ensure(uuid, date)', 'us_mese_card(uuid, jsonb, text)']) {
    assert.ok(sql.includes(`revoke all on function private.${fn} from public, anon, authenticated;`), fn);
  }
  assert.equal((sql.match(/security definer set search_path = ''/g) || []).length, 6, 'every function pins its search_path');
  await assert.rejects(h.as(db, h.F, "insert into public.us_mese_pacchi(couple_id, kind, period_start) values ($1, 'mese', '2026-10-01') returning id r", [h.A]), /permission denied/);
  await assert.rejects(h.as(db, h.F, "select private.us_mese_build($1, '2026-10-01', '2026-11-01') r", [h.A]), /permission denied/);
  await assert.rejects(h.as(db, h.F, "select private.us_mese_ensure($1, '2026-11-01') r", [h.A]), /permission denied/);
});

test('variety, the points and the rare card: at most 3 photos and 2 questions, one of the others, the fixed one is rare and last', async () => {
  const fixed = await moment(h.F, '2026-10-16', { caption: 'Il ponte al tramonto', place: 'Venezia' });
  await q("insert into public.us_bacheca_pins(couple_id, source, source_id, ref_key, reason, item_date, pinned_by, fixed) values ($1, 'moment', $2::uuid, 'moment:' || $2::text, 'scelta', '2026-10-16', $3, true)", [h.A, fixed, h.F]);
  for (const d of ['02', '06', '09', '22', '27']) await moment(d === '22' ? h.B : h.F, `2026-10-${d}`, { caption: `Ricordo ${d}` });
  await question('2026-10-03', { hearts: 2 });
  await question('2026-10-11');
  await question('2026-10-13', { keep: true });
  await question('2026-10-25', { answers: ['sì', 'no'] });
  await lived('Carbonara in videochiamata', '2026-10-19T18:00:00Z');
  await swipe('2026-10-12T20:00:00Z', [[0, 0], [1, 0], [1, 1], [0, 1]]);
  const item = (await q("insert into public.left_for_you(couple_id, sender_id, recipient_id, kind, body, created_at) values ($1, $2, $3, 'text', 'Stasera ti chiamo', '2026-10-07T21:00:00Z') returning id", [h.A, h.B, h.F]))[0].id;
  await q("insert into public.conserva_contributions(couple_id, source_item_id, source_sender_id, conserved_by, created_at) values ($1, $2, $3, $4, '2026-10-08T09:00:00Z')", [h.A, item, h.B, h.F]);
  for (let i = 0; i < 4; i += 1) await think(`2026-10-0${i + 1}T10:00:00Z`);

  const cards = await build('2026-10-01', '2026-11-01');
  assert.equal(cards.length, 10, kinds(cards).join(','));
  const count = (k) => cards.filter((c) => c.k === k).length;
  assert.equal(count('foto'), 3, 'at most three photos');
  assert.equal(count('qa'), 2, 'at most two questions');
  for (const k of ['lettera', 'prima', 'scelta']) assert.equal(count(k), 1, k);
  const rare = cards.at(-1);
  assert.equal(rare.rare, true);
  assert.equal(cards.filter((c) => c.rare).length, 1, 'one rare');
  assert.equal(rare.id, fixed, 'the fixed one, with the most points');
  assert.equal(rare.pts, 1 + 5 + 2, 'fixed +5, a place never seen +2');
  const kept = cards.find((c) => c.src === 'keepsake');
  assert.ok(kept, 'the kept answer is in');
  assert.equal(kept.pts, 1 + 4 + 2, 'kept +4, long answers +2');
  const hearts = cards.find((c) => c.k === 'qa' && c.src === 'question');
  assert.equal(hearts.day, '2026-10-03', 'the hearts win the second question place');
  assert.equal(hearts.pts, 1 + 2 + 2, 'long +2, two hearts +2');
  assert.equal(cards.find((c) => c.k === 'prima').pts, 4, 'a first time +3');
  assert.equal(cards.find((c) => c.k === 'lettera').pts, 5, 'kept +4');
  const days = cards.filter((c) => c.day).map((c) => c.day);
  assert.equal(new Set(days).size, days.length, 'never two cards of the same day while there is something else');
  // A reference, never a copy: no caption, no path, no answer in the stored cards.
  const raw = JSON.stringify(cards);
  for (const text of ['Il ponte al tramonto', 'Venezia', '.webp', LONG, 'Stasera ti chiamo', 'Carbonara', 'Mare']) assert.ok(!raw.includes(text), `no copy of «${text}»`);
});

test('one card a day while there is something else; the same day only to fill the caps', async () => {
  const a = await moment(h.F, '2026-10-20', {});
  for (let i = 0; i < 4; i += 1) await moment(h.B, '2026-10-05', { caption: `Stesso giorno ${i}` });
  const cards = await build('2026-10-01', '2026-11-01');
  assert.deepEqual(kinds(cards), ['foto', 'foto', 'foto']);
  assert.ok(cards.some((c) => c.id === a), 'the other day is in, even with fewer points');
});

test('a poor month: real cards only (numbers, places), never invented; nothing at all leaves the pack empty', async () => {
  assert.deepEqual(await build('2026-09-01', '2026-10-01'), [], 'an empty month: an empty pack');
  await moment(h.F, '2026-09-10', { place: 'Padova' });
  await moment(h.B, '2026-09-21', { place: 'Pescara' });
  await think('2026-09-03T10:00:00Z');
  await think('2026-09-04T10:00:00Z');
  await think('2026-09-05T10:00:00Z');
  const cards = await build('2026-09-01', '2026-10-01');
  assert.deepEqual(kinds(cards).sort(), ['foto', 'foto', 'numeri', 'posti']);
  assert.deepEqual(cards.find((c) => c.k === 'numeri').v, { thinks: 3, games: 0, questions: 0 });
  assert.equal(cards.find((c) => c.k === 'posti').v.count, 2);
  assert.equal(cards.at(-1).k, 'foto', 'the rare is a real card');
  // The agreement in Gioca (instead of «Il vostro Come stai»): 3 same out of 4.
  await swipe('2026-09-12T20:00:00Z', [[0, 0], [1, 1], [0, 0], [1, 0]]);
  const more = await build('2026-09-01', '2026-10-01');
  assert.deepEqual(more.find((c) => c.k === 'intesa').v, { same: 3, total: 4 });
  assert.ok(more.find((c) => c.k === 'scelta'), 'a same choice of Questo o quello');
  assert.ok(!kinds(more).includes('mood'), 'no Come stai card');
});

test('only what both have read: an answer one has not seen yet, a delicate caption stay out', async () => {
  await question('2026-10-04', { seen: 1 });
  await question('2026-10-05', { answers: [LONG, null] });
  await moment(h.F, '2026-10-06', { caption: 'Dal medico, tutto ok' });
  const cards = await build('2026-10-01', '2026-11-01');
  assert.ok(!cards.some((c) => c.k === 'qa'), kinds(cards).join(','));
  assert.ok(!cards.some((c) => c.k === 'foto'));
});

test('get_carte_v1: the pack of last month is made once, the same for both; another couple sees nothing', async () => {
  await q("update public.couples set created_at = now() - interval '70 days' where id = $1", [h.A]);
  const month = await lastMonth();
  const m = await moment(h.F, month, { caption: 'Il mese scorso', place: 'Padova' });
  await moment(h.B, month.replace(/-01$/, '-15'), { caption: 'A metà mese' });
  const first = await h.as(db, h.F, 'select public.get_carte_v1() r');
  const again = await h.as(db, h.B, 'select public.get_carte_v1() r');
  assert.equal((await q('select count(*)::int c from public.us_mese_pacchi where couple_id = $1 and period_start = $2::date', [h.A, month]))[0].c, 1, 'one pack per month');
  const slot = (r) => r.months.find((x) => x.month === Number(month.slice(5, 7)) && r.year === Number(month.slice(0, 4)));
  if (first.year === Number(month.slice(0, 4))) {
    assert.equal(slot(first).state, 'closed');
    assert.equal(slot(first).pack, slot(again).pack, 'the same pack for both');
    assert.equal(slot(first).count, 3, 'two photos and the place');
  }
  assert.ok(first.waiting.some((w) => w.kind === 'mese' && w.period_start === month));
  const pack = first.waiting.find((w) => w.period_start === month).pack;
  // Re-running the planning changes nothing (idempotent).
  const packs = async () => (await q('select count(*)::int c from public.us_mese_pacchi where couple_id = $1', [h.A]))[0].c;
  const made = await packs();
  await q("select private.us_mese_ensure($1, (now() at time zone 'Europe/Rome')::date)", [h.A]);
  await q("select private.us_mese_ensure($1, (now() at time zone 'Europe/Rome')::date)", [h.A]);
  assert.equal(await packs(), made);
  const cards = await q('select cards from public.us_mese_pacchi where id = $1', [pack]);
  const before = JSON.stringify(cards[0].cards);
  await h.as(db, h.F, 'select public.get_carte_v1() r');
  assert.equal(JSON.stringify((await q('select cards from public.us_mese_pacchi where id = $1', [pack]))[0].cards), before, 'chosen once');

  // Another couple: nothing to read, nothing to open.
  await h.create(db, h.U1, 'Alex', '2026-01-01');
  assert.equal(await one(h.U1, 'select public.get_pacchetto_v1($1) r', [pack]), null);
  assert.equal(await one(h.U1, 'select public.apri_pacchetto_v1($1) r', [pack]), null);
  assert.equal(await h.as(db, h.U1, 'select count(*)::int r from public.us_mese_pacchi'), 0);
  assert.equal(await h.as(db, h.U1, 'select count(*)::int r from public.us_mese_aperti'), 0);
  assert.equal((await q('select count(*)::int c from public.us_mese_aperti'))[0].c, 0);

  // Opening: mine, then the other one sees that I did.
  const open = await h.as(db, h.F, 'select public.apri_pacchetto_v1($1) r', [pack]);
  assert.deepEqual(open, { opened: true, partner_opened: false });
  assert.deepEqual(await h.as(db, h.F, 'select public.apri_pacchetto_v1($1) r', [pack]), { opened: true, partner_opened: false }, 'again: the same');
  const forB = await h.as(db, h.B, 'select public.get_pacchetto_v1($1) r', [pack]);
  assert.equal(forB.opened, false);
  assert.equal(forB.partner_opened, true);
  const forF = await h.as(db, h.F, 'select public.get_pacchetto_v1($1) r', [pack]);
  const photo = forF.cards.find((c) => c.k === 'foto' && c.caption === 'Il mese scorso');
  assert.equal(photo.by, 'francesco');
  assert.deepEqual(photo.pin, { source: 'moment', id: m });
  assert.equal(photo.gone, false);

  // A deleted memory: its card turns off, nothing of it stays.
  await q('delete from public.moments where id = $1', [m]);
  const after = await h.as(db, h.F, 'select public.get_pacchetto_v1($1) r', [pack]);
  const off = after.cards.find((c) => c.n === photo.n);
  assert.equal(off.gone, true);
  assert.equal(off.path, undefined);
  assert.equal(off.caption, undefined);
});

test('the golden pack of the year arrives on 31 December, not before', async () => {
  await q("update public.couples set created_at = '2026-03-10T10:00:00Z' where id = $1", [h.A]);
  await moment(h.F, '2026-05-02', { caption: 'Maggio' });
  await q("select private.us_mese_ensure($1, '2026-12-30')", [h.A]);
  assert.equal((await q("select count(*)::int c from public.us_mese_pacchi where couple_id = $1 and kind = 'anno'", [h.A]))[0].c, 0);
  assert.equal((await q("select count(*)::int c from public.us_mese_pacchi where couple_id = $1 and kind = 'mese'", [h.A]))[0].c, 9, 'March to November');
  await q("select private.us_mese_ensure($1, '2026-12-31')", [h.A]);
  const gold = await q("select cards from public.us_mese_pacchi where couple_id = $1 and kind = 'anno' and period_start = '2026-01-01'", [h.A]);
  assert.equal(gold.length, 1);
  assert.equal(gold[0].cards.at(-1).rare, true);
  assert.equal((await q("select count(*)::int c from public.us_mese_pacchi where couple_id = $1 and period_start = '2026-02-01'", [h.A]))[0].c, 0, 'before the couple: no pack');
});

test('every kind read live, mine and theirs from each side; an answer deleted turns its card off', async () => {
  await moment(h.F, '2026-10-02', { place: 'Padova', caption: 'Il treno' });
  await moment(h.B, '2026-10-20', { place: 'Venezia' });
  const qid = await question('2026-10-03');
  await q("update public.daily_answers set answer = 'La mia, di Francesco, abbastanza lunga da contare davvero' where question_id = $1 and user_id = $2", [qid, h.F]);
  await lived('Carbonara in videochiamata', '2026-10-19T18:00:00Z');
  await swipe('2026-10-12T20:00:00Z', [[1, 1], [0, 1], [1, 1], [1, 1]]);
  const item = (await q("insert into public.left_for_you(couple_id, sender_id, recipient_id, kind, body, created_at) values ($1, $2, $3, 'text', 'Stasera ti chiamo', '2026-10-07T21:00:00Z') returning id", [h.A, h.B, h.F]))[0].id;
  await q("insert into public.conserva_contributions(couple_id, source_item_id, source_sender_id, conserved_by, created_at) values ($1, $2, $3, $4, '2026-10-08T09:00:00Z')", [h.A, item, h.B, h.F]);
  const pack = (await q("insert into public.us_mese_pacchi(couple_id, kind, period_start, cards) values ($1, 'mese', '2026-10-01', private.us_mese_build($1, '2026-10-01', '2026-11-01')) returning id", [h.A]))[0].id;
  const forF = await h.as(db, h.F, 'select public.get_pacchetto_v1($1) r', [pack]);
  const forB = await h.as(db, h.B, 'select public.get_pacchetto_v1($1) r', [pack]);
  const byK = (r, k) => r.cards.find((c) => c.k === k);
  assert.deepEqual(forF.cards.map((c) => c.n), forF.cards.map((_, i) => i + 1));
  assert.match(byK(forF, 'qa').mine, /di Francesco/);
  assert.match(byK(forB, 'qa').theirs, /di Francesco/, 'the same answer is «theirs» for the other');
  assert.equal(byK(forF, 'qa').question, 'Domanda del 2026-10-03?');
  assert.equal(byK(forF, 'prima').title, 'Carbonara in videochiamata');
  assert.deepEqual([byK(forF, 'scelta').chosen, byK(forF, 'scelta').other], ['Montagna', 'Mare']);
  assert.equal(byK(forF, 'lettera').body, 'Stasera ti chiamo');
  assert.equal(byK(forF, 'lettera').by, 'beatrice');
  assert.equal(byK(forF, 'lettera').pin.source, 'conserva');
  const places = byK(forF, 'posti');
  assert.deepEqual(places.places.map((p) => p.label), ['Padova', 'Venezia']);
  assert.ok(places.places.every((p) => p.nuovo), 'never seen before October');
  assert.deepEqual([byK(forF, 'intesa').same, byK(forF, 'intesa').total], [3, 4]);
  assert.deepEqual([byK(forF, 'numeri').games, byK(forF, 'numeri').questions], [1, 1]);
  await q('delete from public.daily_answers where question_id = $1 and user_id = $2', [qid, h.B]);
  const after = await h.as(db, h.F, 'select public.get_pacchetto_v1($1) r', [pack]);
  assert.equal(byK(after, 'qa').gone, true);
  assert.equal(byK(after, 'qa').mine, undefined, 'nothing of it is sent');
});

test('leaving the couple: who leaves loses their openings; the packs stay with the other', async () => {
  await q("update public.couples set created_at = now() - interval '70 days' where id = $1", [h.A]);
  await moment(h.F, await lastMonth(), { caption: 'Il mese scorso' });
  const r = await h.as(db, h.F, 'select public.get_carte_v1() r');
  const pack = r.waiting[0].pack;
  await h.as(db, h.F, 'select public.apri_pacchetto_v1($1) r', [pack]);
  await h.as(db, h.B, 'select public.apri_pacchetto_v1($1) r', [pack]);
  assert.equal((await q("select public.s32_leave_couple($1, 'app') r", [h.B]))[0].r.mode, 'departed');
  assert.deepEqual((await q('select user_id from public.us_mese_aperti where pack_id = $1', [pack])).map((x) => x.user_id), [h.F]);
  assert.equal((await q('select count(*)::int c from public.us_mese_pacchi where id = $1', [pack]))[0].c, 1);
  const forF = await h.as(db, h.F, 'select public.get_pacchetto_v1($1) r', [pack]);
  assert.equal(forF.partner, false);
  assert.equal(forF.partner_opened, false);
  // The last one leaving erases the couple, and its packs with it.
  await q("select public.s32_leave_couple($1, 'app') r", [h.F]);
  assert.equal((await q('select count(*)::int c from public.us_mese_pacchi'))[0].c, 0);
});
