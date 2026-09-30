// M11C — Game V2 context against the real migrations in an isolated PGlite:
// explicit adapters and their privacy scope, provenance snapshots, the
// centralized anti-repeat rules (exact / recipe / source / topic /
// perspective), longitudinal resurfacing and adapter isolation.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/game-v2-db');

const { createDb, couple, setClock, as, readOnly, rpc, id, playSide, startRound } = h;
const M11C = path.join(h.ROOT, 'supabase/migrations/20260930160000_m11c_game_v2_context.sql');
const NOW = '2026-09-30T10:00:00Z';
const days = (iso, n) => new Date(new Date(iso).getTime() + n * 86400000).toISOString();

async function world(clock = NOW) {
  const db = await createDb();
  const p = await couple(db);
  await setClock(db, clock);
  return { db, ...p };
}
const q = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const candidates = (db, c, family = 'per_voi') =>
  q(db, `select candidate_key, family, question_text, source_type, source_ref, recipe_id, topic, context
    from private.game_v2_context_candidates($1::uuid, $2::text, private.game_v2_clock())`, [c, family]);
const scored = async (db, c, family = 'per_voi') => Object.fromEntries((await q(db,
  `select candidate_key, cooled, score, base_score from private.game_v2_scored_candidates($1::uuid, $2::text, private.game_v2_clock(), 0)`,
  [c, family])).map((r) => [r.candidate_key, r]));
const get = (db, uid, sid) => as(db, uid, () => rpc(db, 'select public.get_game_session($1::uuid) r', [sid]));

async function bucket(db, c, title, status = 'idea', completedAt = null) {
  const [row] = await q(db, `insert into public.bucket_items(couple_id, title, status, completed, completed_at)
    values ($1, $2, $3, $4, $5) returning id`, [c, title, status, status === 'lived', completedAt]);
  return row.id;
}
// A played item in the couple's history, written directly so each rule can be
// pinned to an exact date.
async function played(db, c, at, item) {
  const [s] = await q(db, `insert into public.game_sessions(couple_id, game_family, content_source, started_by_role,
    create_request_id, engine_version, started_at, completed_at) values ($1, 'per_voi', 'mixed', 'francesco', $2, 2, $3, $3) returning id`,
  [c, id(), at]);
  await q(db, `insert into public.game_session_items(session_id, position, question_text, answer_kind, mechanic, family,
    source_type, source_ref, recipe_id, topic, fingerprint, subject_role, predict_text, options)
    values ($1, 1, 'Domanda di prova?', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
  [s.id, item.subject_role ? 'choice' : 'open', item.mechanic || 'reciprocal', item.family || 'e_se', item.source_type, item.source_ref,
    item.recipe_id || null, item.topic, item.fingerprint, item.subject_role || null, item.subject_role ? 'Cosa sceglie?' : null, item.subject_role ? '["A","B"]' : '[]']);
  return s.id;
}
async function playText(db, uid, sid, text) {
  return as(db, uid, async () => {
    const state = await rpc(db, 'select public.get_game_session($1::uuid) r', [sid]);
    for (const item of state.items) {
      const choice = item.answer_kind === 'choice';
      await rpc(db, 'select public.save_game_session_answer($1::uuid,$2::uuid,$3::text,$4::smallint) r',
        [sid, item.id, choice ? null : `${text}-${item.position}`, choice ? 0 : null]);
    }
    return rpc(db, 'select public.complete_game_session_side($1::uuid) r', [sid]);
  });
}

test('M11C adapters: only shared, couple-scoped sources; Daily Question and Left for You content never read', async () => {
  const { db, c, f, b } = await world();
  const other = await couple(db);
  await bucket(db, c, 'Weekend a Matera');
  await bucket(db, c, 'Cena\n«da»   Nonna');
  await bucket(db, c, 'https://prenota.example.com');
  await bucket(db, c, 'x'.repeat(61));
  await bucket(db, c, '♥♥♥');
  await bucket(db, c, 'Cena sul lago', 'lived', days(NOW, -50));
  await bucket(db, other.c, 'Idea dell’altra coppia');
  await q(db, `insert into public.calendar_entries(couple_id, entry_type, owner_id, created_by, title, starts_at) values
    ($1, 'shared', null, $2, 'Concerto di Elisa', $3), ($1, 'shared', null, $2, 'Matrimonio di Luca', $4),
    ($1, 'personal', $2, $2, 'Visita medica segreta', $5), ($1, 'personal', $6, $6, 'Regalo per Francesco', $4)`,
  [c, f, days(NOW, 12), days(NOW, -160), days(NOW, 5), b]);
  await q(db, `insert into public.moments(couple_id, created_by, caption, moment_date) values ($1, $2, 'Tramonto a Trieste', $3), ($1, $2, 'Troppo recente', $4)`,
    [c, f, days(NOW, -120).slice(0, 10), days(NOW, -3).slice(0, 10)]);
  const [lfy] = await q(db, `insert into public.left_for_you(couple_id, sender_id, recipient_id, body) values ($1, $2, $3, 'SEGRETO-LFY') returning id`, [c, f, b]);
  await q(db, `insert into public.conserva_contributions(couple_id, source_item_id, source_sender_id, conserved_by, created_at) values ($1, $2, $3, $4, $5)`, [c, lfy.id, f, b, days(NOW, -20)]);
  await q(db, `insert into public.daily_answers(couple_id, user_id, answer) values ($1, $2, 'SEGRETO-DAILY')`, [c, f]);

  const rows = await candidates(db, c);
  const all = JSON.stringify(rows);
  for (const present of ['«Weekend a Matera»', '«Cena da Nonna»', '«Cena sul lago»', '«Concerto di Elisa», il 12 ottobre', '«Matrimonio di Luca», ad aprile', '«Tramonto a Trieste», a giugno', 'Tra le cose che abbiamo conservato']) {
    assert.ok(all.includes(present), present);
  }
  for (const absent of ['Visita medica', 'Regalo per', 'SEGRETO', 'http', 'example', 'xxxxxxxx', '♥', 'altra coppia', 'Troppo recente']) {
    assert.ok(!all.includes(absent), `${absent} must never become content`);
  }
  const kept = rows.find((r) => r.source_type === 'conservati');
  assert.deepEqual(Object.keys(kept.context).sort(), ['captured_at', 'kind', 'kind_label', 'recipe_id', 'recipe_version', 'source_id', 'source_type', 'title', 'when']);
  assert.equal(kept.context.source_id, 'conservati', 'an aggregate, never a kept item id');
  assert.equal(kept.context.title, null);
  // Mode filter: a mode only receives its own recipes.
  for (const r of await candidates(db, c, 'rivivete')) assert.equal(r.family, 'rivivete');
  assert.deepEqual(await candidates(db, c, 'quanto_mi_conosci'), [], 'prediction stays curated or couple-authored');
});

test('M11C provenance: context items are immutable snapshots with source, recipe and capture time', async () => {
  const { db, c, f, b } = await world();
  const lived = await bucket(db, c, 'Cena sul lago', 'lived', days(NOW, -40));
  const [m] = await q(db, `insert into public.moments(couple_id, created_by, caption, moment_date) values ($1, $2, 'Tramonto a Trieste', '2026-06-02') returning id`, [c, f]);
  const s = await startRound(db, f, 'rivivete');
  const ctx = s.items.filter((i) => i.source_type !== 'curated');
  assert.ok(ctx.length >= 2 && ctx.length <= 3, `context present but capped in a mode round (${ctx.length})`);
  assert.ok(s.items.filter((i) => i.source_type === 'curated').length >= 2, 'the editorial voice stays');
  for (const i of ctx) {
    assert.ok(i.context.kind_label && i.context.recipe_id && i.context.recipe_version === 1 && i.context.captured_at, JSON.stringify(i.context));
    assert.ok([lived, m.id].includes(i.context.source_id));
  }
  const before = await get(db, f, s.id);
  await q(db, `update public.bucket_items set title = 'Titolo cambiato' where id = $1`, [lived]);
  await q(db, 'delete from public.moments where id = $1', [m.id]);
  await playSide(db, f, s.id); await playSide(db, b, s.id);
  const after = await get(db, b, s.id);
  assert.deepEqual(after.items.map((i) => [i.question_text, i.context]), before.items.map((i) => [i.question_text, i.context]));
  await assert.rejects(q(db, `update public.game_session_items set context = '{}' where session_id = $1`, [s.id]), /immutable/);
});

test('M11C anti-repeat: exact, recipe, source and topic cooldowns come from one table', async () => {
  const { db, c } = await world();
  const x = await bucket(db, c, 'Weekend a Matera');
  const y = await bucket(db, c, 'Corso di ceramica');
  const cd = Object.fromEntries((await q(db, 'select * from public.game_v2_cooldowns')).map((r) => [r.cooldown_class, r]));
  assert.deepEqual([cd.context.item_days, cd.context.recipe_days, cd.context.source_days, cd.context.topic_days], [180, 7, 30, 5]);
  await played(db, c, days(NOW, -3), { source_type: 'da_vivere', source_ref: x, recipe_id: 'da_vivere_idea-001',
    topic: 'ctx_idea_immaginare', fingerprint: `recipe:da_vivere_idea-001:da_vivere:${x}` });
  const key = (recipe, obj) => `recipe:${recipe}:da_vivere:${obj}`;
  const at = async (clock) => { await setClock(db, clock); return scored(db, c); };

  let s = await at(NOW);
  assert.equal(s[key('da_vivere_idea-001', x)].cooled, true, 'exact');
  assert.equal(s[key('da_vivere_idea-001', y)].cooled, true, 'recipe (7 days) on another object');
  assert.equal(s[key('da_vivere_idea-002', x)].cooled, true, 'source (30 days) through another recipe');
  assert.equal(s[key('da_vivere_idea-002', y)].cooled, false, 'unrelated');
  // Topic is soft: the same topic scores 15 lower than its hash-only score.
  const jitter = (k) => parseInt(crypto.createHash('md5').update(`${c}:${k}:0`).digest('hex').slice(0, 2), 16) % 12;
  const k1 = key('da_vivere_idea-001', y);
  assert.equal(s[k1].score, s[k1].base_score + jitter(k1) - 15, 'topic penalty');
  const k2 = key('da_vivere_idea-002', y);
  assert.equal(s[k2].score, s[k2].base_score + jitter(k2));

  s = await at(days(NOW, 10));
  assert.equal(s[key('da_vivere_idea-001', y)].cooled, false, 'recipe cooldown over');
  assert.equal(s[key('da_vivere_idea-002', x)].cooled, true, 'source still cooling');
  assert.equal(s[key('da_vivere_idea-001', x)].cooled, true, 'exact still cooling');
  s = await at(days(NOW, 40));
  assert.equal(s[key('da_vivere_idea-002', x)].cooled, false, 'source cooldown over');
  assert.equal(s[key('da_vivere_idea-001', x)].cooled, true);
  s = await at(days(NOW, 190));
  assert.equal(s[key('da_vivere_idea-001', x)].cooled, false, 'exact cooldown over');
});

test('M11C anti-repeat: a cooled context prompt is not replayed while fresh content exists', async () => {
  const { db, c, f, b } = await world();
  for (const t of ['Weekend a Matera', 'Corso di ceramica', 'Notte in tenda', 'Cena giapponese']) await bucket(db, c, t);
  const seen = new Set();
  // Ten curated E se…? prompts plus the fresh context recipes cover two rounds.
  for (let round = 0; round < 2; round += 1) {
    const s = await startRound(db, f, 'e_se');
    for (const i of s.items) {
      assert.ok(!seen.has(i.question_text), `no replay of "${i.question_text}"`);
      seen.add(i.question_text);
    }
    await playSide(db, f, s.id); await playSide(db, b, s.id);
  }
});

test('M11C perspective: a prediction prompt played before comes back about the other partner, inside the 3/2 split', async () => {
  const { db, c } = await world();
  const item = (k) => ({ candidate_key: `catalog:${k}`, mechanic: 'prediction' });
  const assign = async (items, heavy) => (await q(db, 'select private.game_v2_assign_subjects($1::uuid, $2::jsonb, $3::text) r',
    [c, JSON.stringify(items), heavy]))[0].r.map((i) => i.subject_role ?? null);
  const three = [item('quanto_mi_conosci-001'), { candidate_key: 'catalog:ridete-001', mechanic: 'reciprocal' }, item('quanto_mi_conosci-002'), item('quanto_mi_conosci-003')];
  assert.deepEqual(await assign(three, 'beatrice'), ['beatrice', null, 'francesco', 'beatrice'], 'no history: heavy first, alternating');
  await played(db, c, days(NOW, -200), { family: 'quanto_mi_conosci', mechanic: 'prediction', answer_kind: 'open', source_type: 'curated',
    source_ref: 'quanto_mi_conosci-001', topic: 'x', fingerprint: 'catalog:quanto_mi_conosci-001', subject_role: 'beatrice' });
  assert.deepEqual(await assign(three, 'beatrice'), ['francesco', null, 'beatrice', 'beatrice'], 'rotated, split kept 2/1');
  await played(db, c, days(NOW, -150), { family: 'quanto_mi_conosci', mechanic: 'prediction', answer_kind: 'open', source_type: 'curated',
    source_ref: 'quanto_mi_conosci-002', topic: 'y', fingerprint: 'catalog:quanto_mi_conosci-002', subject_role: 'beatrice' });
  const out = await assign(three, 'beatrice');
  assert.equal(out[0], 'francesco');
  assert.equal(out.filter((r) => r === 'beatrice').length, 2, 'the heavy role keeps its share even when rotation wants more');
  assert.equal(out.filter((r) => r === 'francesco').length, 1);
});

test('M11C longitudinal: a revealed prompt resurfaces once, after 90 days, with the earlier answers only at reveal', async () => {
  const T0 = '2026-01-14T10:00:00Z';
  const { db, c, f, b } = await world(T0);
  const first = await startRound(db, f, 'scopritevi');
  const longitudinal = first.items.filter((i) => /insignificante|parte di te|cambiato idea|momento della settimana|domanda che vorresti/.test(i.question_text));
  assert.ok(longitudinal.length >= 1, 'the first round contains a longitudinal-eligible prompt');
  await playText(db, f, first.id, 'F-allora'); await playText(db, b, first.id, 'B-allora');

  await setClock(db, days(T0, 60));
  assert.equal((await candidates(db, c, 'scopritevi')).filter((r) => r.source_type === 'game_history').length, 0, 'not before 90 days');
  await setClock(db, days(T0, 100));
  const found = (await candidates(db, c, 'scopritevi')).filter((r) => r.source_type === 'game_history');
  assert.equal(found.length, 1, 'one resurfacing at a time');
  assert.equal(found[0].context.kind_label, 'L’avete già giocata a gennaio');
  const original = first.items.find((i) => i.question_text === found[0].question_text);
  assert.ok(original, 'the same wording comes back');

  const again = await startRound(db, f, 'scopritevi');
  const item = again.items.find((i) => i.source_type === 'game_history');
  assert.ok(item, 'the resurfaced prompt is chosen');
  assert.equal(item.previous, null, 'no earlier answer before the new reveal');
  await playText(db, f, again.id, 'F-ora');
  assert.equal((await get(db, f, again.id)).items.find((i) => i.id === item.id).previous, null, 'still hidden while waiting');
  await playText(db, b, again.id, 'B-ora');
  const revealF = (await get(db, f, again.id)).items.find((i) => i.id === item.id);
  const revealB = (await get(db, b, again.id)).items.find((i) => i.id === item.id);
  assert.equal(revealF.previous.my_answer_text, `F-allora-${original.position}`);
  assert.equal(revealF.previous.partner_answer_text, `B-allora-${original.position}`);
  assert.equal(revealB.previous.my_answer_text, `B-allora-${original.position}`);
  assert.equal(revealB.my_answer_text, `B-ora-${item.position}`);
  assert.equal((await candidates(db, c, 'scopritevi')).filter((r) => r.source_type === 'game_history').length, 1,
    'another eligible prompt may be offered, but the recipe cooldown keeps it cooled');
  const s = await scored(db, c, 'scopritevi');
  for (const [k, r] of Object.entries(s)) if (k.startsWith('longitudinal:')) assert.equal(r.cooled, true, `${k} waits 60 days`);
  await readOnly(db, f, () => rpc(db, 'select public.get_game_session($1::uuid) r', [again.id]));
});

test('M11C isolation: a broken source is skipped, never breaks a round', async () => {
  const { db, c, f } = await world();
  await bucket(db, c, 'Weekend a Matera');
  await q(db, `insert into public.moments(couple_id, created_by, caption, moment_date) values ($1, $2, 'Tramonto a Trieste', '2026-06-02')`, [c, f]);
  await db.exec('alter table public.moments rename column caption to caption_v2');
  const rows = await candidates(db, c);
  assert.ok(rows.some((r) => r.source_type === 'da_vivere'), 'other adapters still work');
  assert.ok(!rows.some((r) => r.source_type === 'moment'));
  const s = await startRound(db, f, 'per_voi');
  assert.equal(s.items.length, 5);
});

test('M11C Per voi: context never exceeds two items and the selection is deterministic for the same history', async () => {
  const build = async () => {
    const w = await world();
    for (const t of ['Weekend a Matera', 'Corso di ceramica', 'Notte in tenda']) await bucket(w.db, w.c, t);
    await bucket(w.db, w.c, 'Cena sul lago', 'lived', days(NOW, -30));
    await q(w.db, `insert into public.calendar_entries(couple_id, entry_type, created_by, title, starts_at) values ($1, 'shared', $2, 'Concerto di Elisa', $3)`, [w.c, w.f, days(NOW, 9)]);
    return w;
  };
  const one = await build();
  const s = await startRound(one.db, one.f, 'per_voi');
  assert.ok(s.items.filter((i) => !['curated', 'couple_custom'].includes(i.source_type)).length <= 2);
  const two = await build();
  const again = await as(two.db, two.f, () => rpc(two.db, `select private.game_v2_select_items($1::uuid, 'per_voi', private.game_v2_clock(), 0) r`, [two.c]).catch(() => null));
  assert.equal(again, null, 'the selector is private');
  const direct = async (w) => (await q(w.db, `select private.game_v2_select_items($1::uuid, 'per_voi', private.game_v2_clock(), 0) r`, [w.c]))[0].r
    .map((e) => e.candidate_key.replace(/[0-9a-f-]{36}/g, 'ID'));
  const three = await build();
  assert.deepEqual(await direct(two), await direct(two), 'same inputs, same round');
  assert.equal((await direct(three)).length, 5);
});

test('M11C static: additive, lock-free reads, pinned search_path, no private sources or network', () => {
  const sql = fs.readFileSync(M11C, 'utf8');
  const fns = [...sql.matchAll(/create (?:or replace )?function ([\w.]+)\([\s\S]*?\$\$([\s\S]*?)\$\$;/g)];
  assert.ok(fns.length >= 15);
  for (const [whole, name, body] of fns) {
    const header = whole.slice(0, whole.indexOf('$$'));
    if (/\bstable\b/.test(header)) assert.doesNotMatch(body, /\bfor\s+(share|update|no key update|key share)\b|pg_advisory/i, `${name} is STABLE and must not lock`);
    if (/security definer/.test(header)) assert.match(header, /set search_path = ''/, `${name} pins search_path`);
    assert.match(header, /set search_path = ''/, `${name} pins search_path`);
  }
  assert.doesNotMatch(sql, /\bdrop table\b|\btruncate\b|\bdelete from\b|\bupdate public\./i, 'additive; never writes a source');
  assert.doesNotMatch(sql, /daily_questions|daily_answers|daily_question_|left_for_you\b|\.body\b|bond_xp|net\.http|openai|anthropic/i);
  assert.doesNotMatch(sql, /entry_type\s*(=|in)\s*\(?'personal'/, 'personal calendar entries are never read');
  assert.match(sql, /grant execute on function public\.start_game_round\(text, uuid\) to authenticated;/);
});
