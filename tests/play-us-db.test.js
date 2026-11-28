// Play Us v1 (28/11/2026): the real migration on an isolated PGlite with the
// minimal Supabase surface. Invite → answer → moves → steps by time or both
// done → spent from step 4 → the end writes the memory, the points, the forfeit.
// One spent game a day; another couple never reads or plays it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let PGlite;
try { ({ PGlite } = require('@electric-sql/pglite')); } catch (_) { PGlite = null; }
const MIGRATION = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/20261128090123_play_us_v1.sql'), 'utf8');
const POINTS = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/20261128101816_play_us_punti.sql'), 'utf8');

const F = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', C1 = 'c1c1c1c1-0000-4000-8000-000000000001';
const X = '33333333-3333-4333-8333-333333333333', C2 = 'c2c2c2c2-0000-4000-8000-000000000002';
const FIXTURE = `
  create role authenticated; create role anon; create role service_role;
  create schema auth; create schema private;
  grant usage on schema public, auth, private to authenticated;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant execute on function auth.uid() to authenticated;
  create table public.couples (id uuid primary key, bond_xp integer not null default 0);
  create table public.profiles (id uuid primary key, couple_id uuid references public.couples(id), role text, display_name text);
  create function private.current_couple_id() returns uuid language sql stable security definer set search_path = '' as $$ select couple_id from public.profiles where id = auth.uid() $$;
  grant execute on function private.current_couple_id() to authenticated;
  create table public.moments (id uuid primary key, couple_id uuid not null, created_by uuid not null, storage_path text not null unique, caption text, moment_date date not null, created_at timestamptz not null);
  create table public.moment_photos (id uuid primary key, moment_id uuid not null, couple_id uuid not null, created_by uuid not null, storage_path text not null unique, caption text, position smallint not null, created_at timestamptz not null);
  create table public.couple_notes (id uuid primary key default gen_random_uuid(), couple_id uuid not null, title text not null default '', body text not null default '', items jsonb not null default '[]', created_by uuid, updated_by uuid, color text not null default 'yellow');
  create table public.game_v2_catalog (id text primary key, version integer not null default 1, family text not null, source_type text not null default 'curated', mechanic text not null, answer_kind text not null, question_text text not null, predict_text text, options jsonb not null, depth smallint not null default 1, topic text not null default 't', cooldown_class text not null default 'c', longitudinal boolean not null default false, active boolean not null default true, created_at timestamptz not null default now());
  -- The real points function (20261128101816_play_us_punti) runs on this table; only the unlock sync and the level are stubs.
  create table public.progression_events (id uuid primary key default gen_random_uuid(), couple_id uuid not null, actor_id uuid, source_kind text not null, source_key text not null, xp_awarded integer not null default 0, counts_rhythm boolean not null default true, action_day date, created_at timestamptz not null default now(), unique (couple_id, source_kind, source_key));
  create function private.progression_sync_unlocks(c uuid, xp integer) returns void language plpgsql as $$ begin end $$;
  create function private.progression_level(xp integer) returns integer language sql immutable as $$ select 1 $$;
  insert into public.couples (id) values ('${C1}'), ('${C2}');
  insert into public.profiles values ('${F}', '${C1}', 'francesco', 'Francesco'), ('${B}', '${C1}', 'beatrice', 'Beatrice'), ('${X}', '${C2}', 'francesco', 'Altro');
  insert into public.game_v2_catalog (id, family, mechanic, answer_kind, question_text, options) values
    ('ridete-001', 'ridete', 'reciprocal', 'choice', 'Mare o montagna?', '["Mare","Montagna"]'),
    ('ridete-002', 'ridete', 'reciprocal', 'choice', 'Dolce o salato?', '["Dolce","Salato"]'),
    ('ridete-003', 'ridete', 'reciprocal', 'choice', 'Alba o tramonto?', '["Alba","Tramonto"]'),
    ('ridete-004', 'ridete', 'reciprocal', 'choice', 'Una domanda {troppo} col segnaposto?', '["A","B"]'),
    ('ridete-005', 'ridete', 'reciprocal', 'choice', 'Cane o gatto?', '["Cane","Gatto"]'),
    ('ridete-006', 'ridete', 'reciprocal', 'choice', 'Film o serie?', '["Film","Serie"]'),
    ('ridete-007', 'ridete', 'reciprocal', 'choice', 'Caffè o tè?', '["Caffè","Tè"]'),
    ('quanto_mi_conosci-003', 'quanto_mi_conosci', 'prediction', 'choice', 'Come passi la domenica?', '["Fuori","A casa"]'),
    ('quanto_mi_conosci-004', 'quanto_mi_conosci', 'prediction', 'choice', 'Cosa ordini al bar?', '["Caffè","Spritz"]'),
    ('quanto_mi_conosci-001', 'quanto_mi_conosci', 'prediction', 'choice', 'Al ristorante come scegli?', '["Subito","Con calma","Chiedo"]'),
    ('quanto_mi_conosci-002', 'quanto_mi_conosci', 'prediction', 'choice', 'Che vacanza ti ricarica?', '["Mare","Città","Montagna"]');
`;

async function db() {
  const pg = new PGlite();
  await pg.exec(FIXTURE);
  await pg.exec(MIGRATION);
  await pg.exec(POINTS);
  await pg.exec(fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/20261128125827_ritocchi_testi.sql'), 'utf8'));
  const as = async (uid, sql, params) => {
    await pg.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
    try { return (await pg.query(sql, params)).rows; } finally { await pg.exec('reset role;'); }
  };
  const call = async (uid, fn, args = '', params) => (await as(uid, `select public.${fn}(${args}) as r`, params))[0].r;
  const sql = async (text, params) => (await pg.query(text, params)).rows;
  return { pg, as, call, sql };
}

test('play us: invite, answer, live moves, steps, the end with memory, points and forfeit', async (t) => {
  if (!PGlite) return t.skip('PGlite unavailable');
  const { call, sql, as } = await db();

  const today = await call(F, 'play_us_today');
  assert.equal(today.can_invite, true);
  assert.equal(today.limit, 1);

  const inv = await call(F, 'play_us_invite');
  assert.equal(inv.status, 'invited');
  await assert.rejects(call(B, 'play_us_invite'), /game open/, 'one open game per couple');
  await assert.rejects(call(F, 'play_us_answer', `$1::uuid, true`, [inv.id]), /own invite/);
  // Another couple cannot see or answer it.
  assert.equal((await as(X, 'select count(*)::int as n from public.play_us_sessions'))[0].n, 0);
  await assert.rejects(call(X, 'play_us_answer', `$1::uuid, true`, [inv.id]), /not your game/);

  const st = await call(B, 'play_us_answer', `$1::uuid, true`, [inv.id]);
  assert.equal(st.status, 'playing');
  assert.equal(st.step, 1);
  assert.equal(st.items.length, 5, '3 quick + 2 «quanto mi conosci»');
  assert.ok(st.items.slice(0, 3).every((i) => i.id.startsWith('ridete-') && !i.q.includes('{')), 'short questions, no placeholders');
  assert.ok(st.items.slice(3).every((i) => i.id.startsWith('quanto_mi_conosci-')));
  const sid = st.id;
  // The lobby: 4 s before the first question; moves start then.
  await sql(`update public.play_us_sessions set step_started_at = now() where id = $1`, [sid]);

  // Step 1: answers once each, validated; the same answer twice counts.
  await call(F, 'play_us_move', `$1::uuid, 1, 'answer', 0, '{"i":0}'::jsonb`, [sid]);
  await call(B, 'play_us_move', `$1::uuid, 1, 'answer', 0, '{"i":0}'::jsonb`, [sid]);
  await call(F, 'play_us_move', `$1::uuid, 1, 'answer', 0, '{"i":1}'::jsonb`, [sid]);
  await assert.rejects(call(F, 'play_us_move', `$1::uuid, 1, 'answer', 1, '{"i":7}'::jsonb`, [sid]), /answer invalid/);
  await assert.rejects(call(F, 'play_us_move', `$1::uuid, 2, 'photo', 0, '{}'::jsonb`, [sid]), /not this step/);
  assert.equal((await sql(`select payload->>'i' as i from public.play_us_moves where session_id = $1 and user_id = $2 and slot = 0`, [sid, F]))[0].i, '0', 'the first answer stays');

  // Not both done and time left: no move on.
  assert.equal((await call(F, 'play_us_advance', '$1::uuid', [sid])).step, 1);
  await call(F, 'play_us_move', `$1::uuid, 1, 'done', 0, '{}'::jsonb`, [sid]);
  await call(B, 'play_us_move', `$1::uuid, 1, 'done', 0, '{}'::jsonb`, [sid]);
  let s = await call(B, 'play_us_advance', '$1::uuid', [sid]);
  assert.equal(s.step, 2);
  assert.equal(s.spent, false);
  // Calling it again (the other phone) does not skip a step.
  assert.equal((await call(F, 'play_us_advance', '$1::uuid', [sid])).step, 2);

  // Step 2: a photo under your own folder only; skipping is allowed.
  await assert.rejects(call(F, 'play_us_move', `$1::uuid, 2, 'photo', 0, $2::jsonb`, [sid, JSON.stringify({ path: `${C1}/${B}/play-us/${sid}/x.webp` })]), /path invalid/);
  await call(F, 'play_us_move', `$1::uuid, 2, 'photo', 0, $2::jsonb`, [sid, JSON.stringify({ path: `${C1}/${F}/play-us/${sid}/photo.webp` })]);
  await call(B, 'play_us_move', `$1::uuid, 2, 'photo', 0, '{"skipped":true}'::jsonb`, [sid]);
  // Time is up: the step moves on even without «done».
  await sql(`update public.play_us_sessions set step_started_at = now() - interval '40 seconds' where id = $1`, [sid]);
  await assert.rejects(call(F, 'play_us_move', `$1::uuid, 2, 'done', 0, '{}'::jsonb`, [sid]), /time is up/);
  s = await call(F, 'play_us_advance', '$1::uuid', [sid]);
  assert.equal(s.step, 3);

  // Step 3: the retouched photos.
  await call(F, 'play_us_move', `$1::uuid, 3, 'edit', 0, $2::jsonb`, [sid, JSON.stringify({ path: `${C1}/${F}/play-us/${sid}/edit.webp` })]);
  await call(B, 'play_us_move', `$1::uuid, 3, 'edit', 0, $2::jsonb`, [sid, JSON.stringify({ path: `${C1}/${B}/play-us/${sid}/edit.webp` })]);
  await call(F, 'play_us_move', `$1::uuid, 3, 'done', 0, '{}'::jsonb`, [sid]);
  await call(B, 'play_us_move', `$1::uuid, 3, 'done', 0, '{}'::jsonb`, [sid]);
  s = await call(F, 'play_us_advance', '$1::uuid', [sid]);
  assert.equal(s.step, 4);
  assert.equal(s.spent, true, 'spent from step 4');
  assert.equal((await call(B, 'play_us_today')).can_invite, false);

  // Step 4: answer for yourself and guess the other one.
  await call(F, 'play_us_move', `$1::uuid, 4, 'guess', 0, '{"self":0,"guess":1}'::jsonb`, [sid]);
  await call(B, 'play_us_move', `$1::uuid, 4, 'guess', 0, '{"self":1,"guess":1}'::jsonb`, [sid]);
  for (const u of [F, B]) await call(u, 'play_us_move', `$1::uuid, 4, 'done', 0, '{}'::jsonb`, [sid]);
  assert.equal((await call(F, 'play_us_advance', '$1::uuid', [sid])).step, 5);
  // Step 5: a gesture.
  await call(F, 'play_us_move', `$1::uuid, 5, 'gesture', 0, '{"g":"abbraccio"}'::jsonb`, [sid]);
  await assert.rejects(call(B, 'play_us_move', `$1::uuid, 5, 'gesture', 0, '{"g":"schiaffo"}'::jsonb`, [sid]), /gesture invalid/);
  for (const u of [F, B]) await call(u, 'play_us_move', `$1::uuid, 5, 'done', 0, '{}'::jsonb`, [sid]);
  assert.equal((await call(F, 'play_us_advance', '$1::uuid', [sid])).step, 6);
  // Step 6: the maze scores.
  await call(F, 'play_us_move', `$1::uuid, 6, 'score', 0, '{"score":420}'::jsonb`, [sid]);
  await call(B, 'play_us_move', `$1::uuid, 6, 'score', 0, '{"score":310}'::jsonb`, [sid]);
  for (const u of [F, B]) await call(u, 'play_us_move', `$1::uuid, 6, 'done', 0, '{}'::jsonb`, [sid]);
  assert.equal((await call(F, 'play_us_advance', '$1::uuid', [sid])).step, 7);
  // Step 7: both ready → the end.
  for (const u of [F, B]) await call(u, 'play_us_move', `$1::uuid, 7, 'ready', 0, '{}'::jsonb`, [sid]);
  s = await call(B, 'play_us_advance', '$1::uuid', [sid]);
  assert.equal(s.step, 8);
  assert.equal(s.status, 'done');
  assert.equal(s.result.intesa, 1);
  assert.equal(s.result.winner, F);
  assert.equal(s.result.scores[F], 420);
  assert.equal(s.result.guessed[F], 1, 'Francesco guessed Bea (1)');
  assert.equal(s.result.guessed[B], 0);
  assert.ok(s.moment_id, 'the memory is in Ricordi');
  const moment = (await sql('select * from public.moments where id = $1', [s.moment_id]))[0];
  assert.equal(moment.storage_path, `${C1}/${F}/play-us/${sid}/edit.webp`);
  assert.match(moment.caption, /^Play Us · \d+ [a-z]+$/);
  assert.equal((await sql('select count(*)::int as n from public.moment_photos where moment_id = $1', [s.moment_id]))[0].n, 1);
  assert.equal((await sql(`select bond_xp from public.couples where id = $1`, [C1]))[0].bond_xp, 30, '+30 once, through the real progression_award');
  assert.deepEqual((await sql(`select source_kind, source_key, xp_awarded from public.progression_events`)).map((r) => [r.source_kind, r.source_key, r.xp_awarded]), [['play_us', sid, 30]]);
  await call(F, 'play_us_advance', '$1::uuid', [sid]);
  assert.equal((await sql(`select bond_xp from public.couples where id = $1`, [C1]))[0].bond_xp, 30, 'never twice');

  // The forfeit: only the winner, only from the list, once; it is a post-it.
  await assert.rejects(call(B, 'play_us_move', `$1::uuid, 8, 'pegno', 0, '{"text":"Mi devi un caffè"}'::jsonb`, [sid]), /only the winner/);
  await assert.rejects(call(F, 'play_us_move', `$1::uuid, 8, 'pegno', 0, '{"text":"Qualcosa di inventato"}'::jsonb`, [sid]), /pegno invalid/);
  // Ritocchi dei testi (28/11): the old gendered forfeit is gone.
  await assert.rejects(call(F, 'play_us_move', `$1::uuid, 8, 'pegno', 0, '{"text":"Una foto di te appena sveglia"}'::jsonb`, [sid]), /pegno invalid/);
  await call(F, 'play_us_move', `$1::uuid, 8, 'pegno', 0, '{"text":"Mi devi un caffè"}'::jsonb`, [sid]);
  await call(F, 'play_us_move', `$1::uuid, 8, 'pegno', 0, '{"text":"Stasera il film lo scelgo io"}'::jsonb`, [sid]);
  const notes = await sql(`select body, created_by, color from public.couple_notes where couple_id = $1`, [C1]);
  assert.deepEqual(notes.map((n) => [n.body, n.created_by, n.color]), [['Mi devi un caffè', F, 'pink']]);

  // One game a day.
  await assert.rejects(call(B, 'play_us_invite'), /played today/);
});

test('play us: a declined or expired invite does not spend the day; leaving after step 4 keeps what was done', async (t) => {
  if (!PGlite) return t.skip('PGlite unavailable');
  const { call, sql } = await db();
  const a = await call(F, 'play_us_invite');
  assert.equal((await call(B, 'play_us_answer', `$1::uuid, false`, [a.id])).status, 'declined');
  const b = await call(B, 'play_us_invite');
  await sql(`update public.play_us_sessions set invite_expires_at = now() - interval '1 second' where id = $1`, [b.id]);
  assert.equal((await call(F, 'play_us_today')).can_invite, true, 'expired: free again');
  await assert.rejects(call(F, 'play_us_answer', `$1::uuid, true`, [b.id]), /invite closed/);
  const c = await call(F, 'play_us_invite');
  const st = await call(B, 'play_us_answer', `$1::uuid, true`, [c.id]);
  // Gone before step 4: abandoned, not spent, the day stays free.
  await call(F, 'play_us_abandon', '$1::uuid', [st.id]);
  assert.equal((await call(B, 'play_us_today')).can_invite, true);
  // Gone after step 4: spent, the points are given.
  const d = await call(B, 'play_us_invite');
  await call(F, 'play_us_answer', `$1::uuid, true`, [d.id]);
  await sql(`update public.play_us_sessions set step = 4, spent = true, step_started_at = now() where id = $1`, [d.id]);
  const end = await call(B, 'play_us_abandon', '$1::uuid', [d.id]);
  assert.equal(end.status, 'abandoned');
  assert.ok(end.result.finished_at);
  assert.equal((await sql(`select bond_xp from public.couples where id = $1`, [C1]))[0].bond_xp, 30);
  assert.equal((await call(F, 'play_us_today')).can_invite, false, 'spent today');
});
