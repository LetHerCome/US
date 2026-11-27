// La prima settimana guidata (founder, 27/11/2026: «solamente per gli account appena creati,
// quindi per i Beta tester no»). For seven days after the other person joins, the characters
// suggest one small first step a day; only couples born after the migration; a step already
// done is skipped; it can be muted; birthdays and the anniversary still win.
// Full repo schema in disposable PGlite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const DIR = path.join(__dirname, '../supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_prima_settimana\.sql$/.test(f));
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

let db;
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const plan = (day) => q('select private.us_ricorda_plan_couple($1, $2::date)', [h.A, day]);
const lineOf = async (user, day) => (await q('select kind, ref_key, speaker, vars from public.us_battute where couple_id = $1 and day = $2::date and recipient_id = $3', [h.A, day, user]))[0] || null;
const step = async (user, day) => { const l = await lineOf(user, day); return l?.kind === 'primi_passi' ? l.vars.step : null; };
// Couple A: the other person joined on 20/11 (Rome).
const joinedOn20 = () => q("update public.couple_invites set used_at = '2026-11-20 10:00:00+01' where couple_id = $1 and used_at is not null", [h.A]);
const newCouple = () => q("update private.us_primi_passi_start set since = '2000-01-01'");

test.beforeEach(async () => { db = await h.database(); await joinedOn20(); });
test.afterEach(async () => { await db?.close(); db = null; });

test('listed, and nobody but the planner reads the start', async () => {
  assert.ok(FILE, 'missing supabase/migrations/*_prima_settimana.sql');
  const cutoff = JSON.parse(read('supabase/baseline/MIGRATION_CUTOFF.json'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
  await assert.rejects(h.as(db, h.F, 'select since r from private.us_primi_passi_start'), /permission denied/);
  assert.equal((await q('select count(*)::int n from private.us_primi_passi_start'))[0].n, 1);
});

test('a couple from before (the beta testers) never gets it', async () => {
  for (const day of ['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-27']) {
    await plan(day);
    assert.equal(await step(h.F, day), null, day);
    assert.equal(await step(h.B, day), null, day);
  }
});

test('a new couple: one step a day for seven days after joining, then nothing', async () => {
  await newCouple();
  await plan('2026-11-20');
  assert.equal(await step(h.F, '2026-11-20'), null, 'the day they join: the introduction and the intro instead');
  const want = { '2026-11-21': 'domanda', '2026-11-22': 'ricordo', '2026-11-23': 'gioco', '2026-11-24': 'postit', '2026-11-25': 'tipenso', '2026-11-26': 'compleanni', '2026-11-27': 'settimana' };
  for (const [day, s] of Object.entries(want)) {
    await plan(day);
    assert.equal(await step(h.F, day), s, `${day} Francesco`);
    assert.equal(await step(h.B, day), s, `${day} Beatrice`);
  }
  assert.equal((await lineOf(h.F, '2026-11-27')).speaker, 'both', 'the week is said by both');
  assert.equal((await lineOf(h.F, '2026-11-21')).vars.partner, 'Beatrice');
  await plan('2026-11-28');
  assert.equal(await step(h.F, '2026-11-28'), null, 'day 8: over');
});

test('a step already done is skipped; muted means never; a birthday wins the day', async () => {
  await newCouple();
  await q("insert into public.moments(couple_id, created_by, storage_path, moment_date) values ($1, $2, 'c/f/m1.webp', '2026-11-21')", [h.A, h.F]);
  await plan('2026-11-22');
  assert.notEqual(await step(h.F, '2026-11-22'), 'ricordo', 'they already have a photo');
  await q("insert into public.shared_events(couple_id, created_by, title, event_date, recurs_yearly) values ($1, $2, 'Compleanno di Francesco', '2000-03-01', true)", [h.A, h.F]);
  await plan('2026-11-26');
  assert.notEqual(await step(h.F, '2026-11-26'), 'compleanni', 'his birthday is in');
  assert.equal(await step(h.B, '2026-11-26'), 'compleanni', 'hers is not');
  // Beatrice's birthday in 7 days on 24/11: the birthday line (priority 1) wins over the step.
  await q("insert into public.shared_events(couple_id, created_by, title, event_date, recurs_yearly) values ($1, $2, 'Compleanno di Beatrice', '2000-12-01', true)", [h.A, h.B]);
  await plan('2026-11-24');
  assert.equal((await lineOf(h.F, '2026-11-24')).kind, 'compleanno');
  assert.equal(await step(h.B, '2026-11-24'), 'postit');
  await q("insert into public.us_battute_mute(user_id, kind) values ($1, 'primi_passi')", [h.B]);
  await plan('2026-11-27');
  assert.equal(await step(h.B, '2026-11-27'), null, '«Non dirmelo più»');
  assert.equal(await step(h.F, '2026-11-27'), 'settimana');
});

test('the app writes each step and prepares its gesture; never a reproach', () => {
  const R = require('../us-ricorda.js');
  assert.ok(read('us-ricorda.js').includes("ti_aspetta: 2, primi_passi: 2, bacheca: 2.5,"));
  const say = (s, extra = {}) => R.sentence({ kind: 'primi_passi', ref_key: `primi_passi:${s}`, vars: { step: s, name: 'Bea', ...extra } }, 'Francesco');
  for (const s of ['domanda', 'ricordo', 'gioco', 'postit', 'tipenso', 'compleanni', 'settimana']) assert.ok(say(s).length > 10, s);
  assert.equal(say('nonsense'), '');
  const act = (s) => R.action({ kind: 'primi_passi', vars: { step: s, name: 'Bea' } }, 'Francesco');
  assert.deepEqual(act('domanda'), { label: 'Rispondi', go: 'daily' });
  assert.deepEqual(act('ricordo'), { label: 'Metti una foto', go: 'compose' });
  assert.deepEqual(act('postit'), { label: 'Apri Noi', go: 'noi' });
  assert.deepEqual(act('tipenso'), { label: 'Provalo', go: 'think' });
  assert.deepEqual(act('compleanni'), { label: 'Aggiungi il tuo', go: 'birthday', name: 'Bea' });
  assert.deepEqual(act('settimana'), { label: 'Va bene', go: 'close' });
  const src = read('us-ricorda.js');
  assert.ok(src.includes("case 'noi': w.go?.('bond', { nav: true }); break;"));
  assert.ok(src.includes("case 'think': w.go?.('home', { nav: true });"));
});
