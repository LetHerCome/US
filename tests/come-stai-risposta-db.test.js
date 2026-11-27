// Come stai che conta (grill 27/11/2026, D7/D16, D9/D17): one gesture to the
// partner's state, one per state shown, rate-limited, gone with the state;
// «Non dirmelo più» accepts the new kind and keeps every old one.
// Full repo schema in disposable PGlite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'supabase/migrations');
const RISPOSTA = fs.readdirSync(DIR).find((f) => /_come_stai_risposta\.sql$/.test(f));
const MUTO = fs.readdirSync(DIR).find((f) => /_come_stai_muto\.sql$/.test(f));

let db;
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const setStatus = (user, status) => h.as(db, user, 'select public.set_member_status($1) r', [status]);
const respond = (user, at, gesture) => h.as(db, user, 'select public.respond_member_status($1::timestamptz, $2) r', [at, gesture]);
const rowOf = async (user) => (await q('select status, set_at, reply_gesture, reply_at, reply_sent_at from public.member_status where user_id = $1', [user]))[0];
// The rate limit is two minutes: tests move the last answer back in time.
const rewind = (user) => q("update public.member_status set reply_sent_at = reply_sent_at - interval '3 minutes' where user_id = $1", [user]);

test.beforeEach(async () => { db = await h.database(); });
test.afterEach(async () => { await db?.close(); db = null; });

test('the migrations exist and are listed in the cutoff', () => {
  assert.ok(RISPOSTA && MUTO);
  const cutoff = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  for (const f of [RISPOSTA, MUTO]) assert.ok(cutoff.executable_migrations.includes(f) && cutoff.forward_migrations.includes(f), f);
  const sql = fs.readFileSync(path.join(DIR, RISPOSTA), 'utf8');
  assert.match(sql, /function public\.respond_member_status[\s\S]*?security definer\s+set search_path = ''/);
  assert.match(sql, /revoke all on function public\.respond_member_status\(timestamp with time zone, text\) from public, anon;/);
});

test('the partner sends the gesture of the state once; the owner sees it; a retry returns what is saved', async () => {
  const status = await setStatus(h.B, 'giu');
  const saved = await respond(h.F, status.set_at, 'abbraccio');
  assert.equal(saved.gesture, 'abbraccio');
  assert.equal(saved.already, false);
  assert.ok(Math.abs(Date.now() - Date.parse(saved.at)) < 60000, 'server time');
  // The owner reads it on their own row (RLS: the couple reads both rows).
  const seen = await h.as(db, h.B, 'select user_id, reply_gesture from public.member_status where user_id = $1', [h.B]);
  assert.deepEqual(seen, [{ user_id: h.B, reply_gesture: 'abbraccio' }]);
  // Once per state: again is harmless and returns the same answer, even right away.
  const again = await respond(h.F, status.set_at, 'abbraccio');
  assert.equal(again.already, true);
  assert.equal(again.gesture, 'abbraccio');
  // The responder's own row only keeps the time of the answer.
  const mine = await rowOf(h.F);
  assert.equal(mine.status, null);
  assert.ok(mine.reply_sent_at);
});

test('only the gesture of that state, only to a state still showing and still the same instance', async () => {
  const pairs = { innamorato: 'cuore', felice: 'cuore', stanco: 'riposati', giu: 'abbraccio', nervoso: 'respira', malato: 'abbraccio', festa: 'festa', lavoro: 'forza', studio: 'forza', palestra: 'spacca', viaggio: 'buon_viaggio', tavola: 'buon_appetito' };
  for (const [state, gesture] of Object.entries(pairs)) {
    const s = await setStatus(h.B, state);
    await assert.rejects(respond(h.F, s.set_at, gesture === 'cuore' ? 'forza' : 'cuore'), /gesture invalid/, state);
    assert.equal((await respond(h.F, s.set_at, gesture)).gesture, gesture, state);
    await rewind(h.F);
  }
  await assert.rejects(respond(h.F, new Date().toISOString(), 'urlo'), /gesture invalid/);
  // A newer state than the one the phone saw: refused, never lands on it.
  const old = await setStatus(h.B, 'stanco');
  await setStatus(h.B, 'nervoso');
  await assert.rejects(respond(h.F, old.set_at, 'riposati'), /status changed|gesture invalid/);
  await assert.rejects(respond(h.F, old.set_at, 'respira'), /status changed/);
  await assert.rejects(respond(h.F, null, 'respira'), /status changed/);
  // No state, or an expired one.
  await setStatus(h.B, null);
  await assert.rejects(respond(h.F, old.set_at, 'riposati'), /status gone/);
  const s = await setStatus(h.B, 'tavola');
  await q('alter table public.member_status disable trigger member_status_server_time');
  await q("update public.member_status set expires_at = now() - interval '1 minute' where user_id = $1", [h.B]);
  await q('alter table public.member_status enable trigger member_status_server_time');
  await assert.rejects(respond(h.F, s.set_at, 'buon_appetito'), /status gone/);
});

test('one answer every two minutes per person (rate limit)', async () => {
  const a = await setStatus(h.B, 'stanco');
  await respond(h.F, a.set_at, 'riposati');
  const b = await setStatus(h.B, 'felice');
  await assert.rejects(respond(h.F, b.set_at, 'cuore'), /rate limited/);
  await rewind(h.F);
  assert.equal((await respond(h.F, b.set_at, 'cuore')).gesture, 'cuore');
});

test('the answer goes with the state: a new state or none clears it; the same state still showing keeps it', async () => {
  const s = await setStatus(h.B, 'malato');
  await respond(h.F, s.set_at, 'abbraccio');
  await setStatus(h.B, 'malato');
  assert.equal((await rowOf(h.B)).reply_gesture, 'abbraccio', 'same state, same instance');
  await setStatus(h.B, 'giu');
  const cleared = await rowOf(h.B);
  assert.equal(cleared.reply_gesture, null);
  assert.equal(cleared.reply_at, null);
  await rewind(h.F);
  const g = await rowOf(h.B);
  await respond(h.F, g.set_at, 'abbraccio');
  await setStatus(h.B, null);
  assert.equal((await rowOf(h.B)).reply_gesture, null);
});

test('nobody writes the answer columns by hand, not even the owner of the row', async () => {
  const s = await setStatus(h.B, 'giu');
  // The owner may update their row (RLS), but the trigger keeps the answer columns.
  await h.as(db, h.B, "update public.member_status set reply_gesture = 'cuore', reply_at = now(), reply_sent_at = now() where user_id = $1", [h.B]);
  let row = await rowOf(h.B);
  assert.equal(row.reply_gesture, null);
  assert.equal(row.reply_sent_at, null);
  await respond(h.F, s.set_at, 'abbraccio');
  // Nor clear the partner's rate limit, nor the answer they got.
  await h.as(db, h.F, 'update public.member_status set reply_sent_at = null where user_id = $1', [h.F]);
  assert.ok((await rowOf(h.F)).reply_sent_at, 'rate limit kept');
  await h.as(db, h.B, 'update public.member_status set reply_gesture = null, reply_at = null where user_id = $1', [h.B]);
  assert.equal((await rowOf(h.B)).reply_gesture, 'abbraccio');
  // A fresh row inserted by hand starts without them.
  await q('delete from public.member_status where user_id = $1', [h.F]);
  await h.as(db, h.F, "insert into public.member_status (user_id, couple_id, reply_sent_at) values ($1, $2, now() + interval '1 day')", [h.F, h.A]);
  row = await rowOf(h.F);
  assert.equal(row.reply_sent_at, null);
});

test('no account, no couple or another couple: refused; anon cannot call it', async () => {
  const s = await setStatus(h.B, 'giu');
  await assert.rejects(respond(null, s.set_at, 'abbraccio'), /authentication required/);
  await assert.rejects(respond(h.U1, s.set_at, 'abbraccio'), /authentication required/);
  // Another couple's member sees no partner state here.
  const other = await h.create(db, h.U1, 'Alex');
  const code = await h.invite(db, h.U1);
  await h.accept(db, h.U2, code?.code || code, 'Sam');
  await assert.rejects(respond(h.U1, s.set_at, 'abbraccio'), /status gone/);
  assert.ok(other);
  await assert.rejects(h.as(db, null, 'select public.respond_member_status(now(), $1) r', ['abbraccio'], 'anon'), /permission denied/);
  assert.equal((await rowOf(h.B)).reply_gesture, null);
});

test('the partner who left can no longer answer', async () => {
  const s = await setStatus(h.B, 'giu');
  await q("update public.profiles set couple_id = null where id = $1", [h.B]);
  await assert.rejects(respond(h.F, s.set_at, 'abbraccio'), /status gone/);
});

test('«Non dirmelo più» accepts come_sta and still every kind it accepted before', async () => {
  for (const kind of ['*', 'compleanno', 'anniversario', 'mesiversario', 'giorni', 'un_anno_fa', 'traguardo', 'conoscervi', 'ti_aspetta', 'primi_passi', 'bacheca', 'come_sta']) {
    assert.equal(await h.as(db, h.F, 'select public.set_my_battute_mute_v1($1, true) r', [kind]), true, kind);
  }
  const kinds = (await q('select kind from public.us_battute_mute where user_id = $1 order by kind', [h.F])).map((r) => r.kind);
  assert.equal(kinds.length, 12);
  await assert.rejects(h.as(db, h.F, 'select public.set_my_battute_mute_v1($1, true) r', ['inventato']), /us_battute_mute_kind/);
});

test('re-applying the two migrations changes nothing', async () => {
  const s = await setStatus(h.B, 'giu');
  await respond(h.F, s.set_at, 'abbraccio');
  await db.exec(fs.readFileSync(path.join(DIR, RISPOSTA), 'utf8'));
  await db.exec(fs.readFileSync(path.join(DIR, MUTO), 'utf8'));
  assert.equal((await rowOf(h.B)).reply_gesture, 'abbraccio');
  await setStatus(h.B, 'felice');
  assert.equal((await rowOf(h.B)).reply_gesture, null);
});
