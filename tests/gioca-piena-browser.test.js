// Gioca più piena (grill del 27/11/2026) in the real app with the fake
// Supabase: a fresh couple on a small phone reaches the first game without
// its button under the bar (D1); a busy day shows both characters in Vi
// aspetta; spent tokens show «Intanto rileggete…» (D5); a result ends with
// +15 for your level (D4).
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, pageFor } = require('./helpers/countdown-browser');

const DAY = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
const weekStartOf = (iso) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const ago = (h) => new Date(Date.now() - h * 3600000).toISOString();

function scenario(kind) {
  const day = DAY(), week = weekStartOf(day);
  const allowance = (used, open = 0) => ({ day, week_start: week, resets_on: '2099-01-01', period: 'day', per_voi_used: used, free_used: used, free_limit: 3, used, limit: 3, per_voi_available: used < 3, free_available: used < 3, open_count: open, open_limit: 3, families: {} });
  const row = (o) => ({ item_count: 2, my_answered_count: 2, my_complete: true, partner_complete: true, reveal_ready: true, my_reveal_seen_at: ago(20), started_by_role: 'francesco', started_at: ago(30), completed_at: ago(26), ...o });
  const weekly = { week_start: week, next_unlock: '2099-01-05', assigned_role: 'francesco', next_role: 'beatrice', my_turn: false, created: false, created_by_me: false, partner_left_question: false, my_question: null };
  const seen = [row({ id: 'w', game_family: 'swipe' }), row({ id: 'r', game_family: 'ridete', completed_at: ago(50) })];
  const homes = {
    fresh: { allowance: allowance(0), per_voi: { state: 'idle' }, open_rounds: [], recent: [] },
    busy: { allowance: allowance(1, 1), per_voi: { state: 'idle' }, open_rounds: [{ ...row({ id: 'c', game_family: 'confrontatevi', my_complete: false, reveal_ready: false, my_reveal_seen_at: null, completed_at: null, started_by_role: 'beatrice', my_answered_count: 0 }) }], recent: [row({ id: 'q', game_family: 'quanto_mi_conosci', my_reveal_seen_at: null, completed_at: ago(1) }), ...seen] },
    zero: { allowance: allowance(3), per_voi: { state: 'played' }, open_rounds: [], recent: seen },
  };
  const c = (id, q, options, mine, theirs) => ({ id, position: 1, question_text: q, my_prompt: q, answer_kind: 'choice', options, my_answer_index: mine, partner_answer_index: theirs, mechanic: 'reciprocal', my_item_role: 'mutual', depth: 1, context: {} });
  const sessions = {
    w: { id: 'w', game_family: 'swipe', reveal_ready: true, my_reveal_seen_at: ago(20), my_complete: true, partner_complete: true, completed_at: ago(26), items: [c('w1', 'Sushi o pizza?', ['Sushi', 'Pizza'], 0, 1), c('w2', 'Mare o montagna?', ['Mare', 'Montagna'], 0, 0)] },
    r: { id: 'r', game_family: 'ridete', reveal_ready: true, my_reveal_seen_at: ago(48), my_complete: true, partner_complete: true, completed_at: ago(50), items: [c('r1', 'Chi si perde prima in un IKEA?', ['Io', 'Tu'], 0, 1)] },
  };
  return {
    home: { my_role: 'francesco', partner_role: 'beatrice', weekly, ...homes[kind] },
    sessions,
    intesa: kind === 'fresh' ? { compared: 0, same: 0, week_start: week, days: [], families: {} } : { compared: 20, same: 14, week_start: week, days: [day], families: { ridete: { last_at: ago(50), compared: 10, same: 7 } } },
  };
}

async function gioca(h, kind, size) {
  const { page, ctx, errors } = await pageFor(h, size);
  await page.evaluate((s) => {
    const qa = window.__QA;
    qa.rpc.get_game_v2_home = async () => ({ data: structuredClone(s.home), error: null });
    qa.rpc.get_game_intesa_v1 = async () => ({ data: structuredClone(s.intesa), error: null });
    qa.rpc.get_game_session = async ({ target_session_id }) => (s.sessions[target_session_id] ? { data: structuredClone(s.sessions[target_session_id]), error: null } : { data: null, error: { message: 'session unavailable' } });
    qa.rpc.mark_game_session_reveal_seen = async ({ target_session_id }) => ({ data: { ...structuredClone(s.sessions[target_session_id]), my_reveal_seen_at: new Date().toISOString() }, error: null });
    try { window.UsIntro?.close?.(); } catch (_) {}
    window.openQuizHub ? window.openQuizHub({ nav: true }) : window.go('quiz', { nav: true });
  }, scenario(kind));
  await page.waitForFunction(() => document.querySelector('#quizHub .us-gv2-voi'), null, { timeout: 8000 });
  await page.evaluate(() => window.USGameV2.load());
  await page.waitForFunction(() => document.querySelector('#quizHub .us-gv2-giostra [data-gv2-active="true"]'), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(900);
  return { page, ctx, errors };
}
// The first card's button against the bottom bar (and the Ti penso heart above it).
const firstButton = (page) => page.evaluate(() => {
  const card = document.querySelector('#quizHub .us-gv2-giostra [data-gv2-active="true"]') || document.querySelector('#quizHub .us-gv2-giostra .us-gv2-game');
  const cta = card.querySelector('.us-gv2-carta-cta');
  // The side cards lean and shrink with the scroll; the target is its layout size.
  const b = { top: cta.getBoundingClientRect().top, bottom: cta.getBoundingClientRect().bottom, height: cta.offsetHeight };
  const bars = [document.querySelector('.us-nav'), document.getElementById('thinkButton')].filter((el) => el && !el.hidden && el.getBoundingClientRect().height);
  const barTop = Math.min(innerHeight, ...bars.map((el) => el.getBoundingClientRect().top));
  return { top: b.top, bottom: b.bottom, height: b.height, barTop, vh: innerHeight };
});

test('fresh couple: tokens and the week, Voi due, the first game; its button above the bar at 360×640 and 390×844', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    for (const size of [{ width: 360, height: 640 }, { width: 390, height: 844 }]) {
      const { page, ctx, errors } = await gioca(h, 'fresh', size);
      const order = await page.evaluate(() => ['#usGv2Tokens', '.us-gv2-giorni', '.us-gv2-voi', '.us-gv2-choose', '.us-gv2-all'].map((s) => Math.round(document.querySelector(`#quizHub ${s}`)?.getBoundingClientRect().top ?? -1)));
      assert.ok(order.every((y) => y >= 0), `${size.width}: every block is there ${order}`);
      assert.deepEqual(order, [...order].sort((a, b) => a - b), `${size.width}: D1 order`);
      const b = await firstButton(page);
      assert.ok(b.height >= 44, 'a 44 px target');
      assert.ok(b.top >= 0 && b.bottom <= b.barTop - 2, `${size.width}×${size.height}: the Gioca button sits above the bar (${JSON.stringify(b)})`);
      const text = await page.evaluate(() => document.querySelector('#quizHub .us-gv2-voi').innerText);
      assert.match(text, /Giocate qualche partita e qui vedrete la vostra intesa/);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(overflow <= 1, 'no sideways page scroll');
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally { await h.close(); }
});

test('busy day: both characters in Vi aspetta, happy for ready answers; discoveries from opened rounds; zero tokens: Intanto rileggete…; a result ends with +15', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    {
      const { page, ctx, errors } = await gioca(h, 'busy', { width: 390, height: 844 });
      const state = await page.evaluate(() => ({
        rows: [...document.querySelectorAll('#quizHub .us-gv2-aspetta')].map((r) => [...r.querySelectorAll('.us-char')].map((c) => c.getAttribute('data-reaction') || 'mood')),
        voi: document.querySelector('#quizHub .us-gv2-voi-line')?.textContent,
        voiFaces: [...document.querySelectorAll('#quizHub .us-gv2-voi .us-char')].map((c) => c.getAttribute('data-reaction')),
        found: [...document.querySelectorAll('#quizHub .us-gv2-scoperta')].map((b) => b.dataset.gv2Session),
        week: [...document.querySelectorAll('#quizHub .us-gv2-giorni-dots i')].filter((i) => i.dataset.on === 'true').length,
      }));
      assert.equal(state.rows.length, 2, 'the ready answers and the turn');
      assert.deepEqual(state.rows[0], ['cuore', 'cuore'], 'both, happy, when the answers are ready');
      assert.equal(state.rows[1].length, 2, 'both characters on the turn too');
      assert.equal(state.voi, 'Su 20 domande avete risposto uguale 14 volte');
      assert.deepEqual(state.voiFaces, ['cuore', 'cuore']);
      assert.ok(state.found.length >= 2 && !state.found.includes('q'), `opened rounds only: ${state.found}`);
      assert.equal(state.week, 1);
      // D4: a result ends with the points the round gave to your level.
      await page.evaluate(() => window.USGameV2.openSession('w'));
      await page.waitForSelector('.us-gv5-livello', { timeout: 5000 });
      await page.evaluate(() => { const s = document.querySelector('.us-gv2-sheet'); s.scrollTop = s.scrollHeight; });
      await page.waitForTimeout(300);
      const xp = await page.evaluate(() => { const el = document.querySelector('.us-gv5-livello'); const r = el.getBoundingClientRect(); return { text: el.textContent.trim(), visible: r.top >= 0 && r.bottom <= innerHeight }; });
      assert.deepEqual(xp, { text: '+15 per il vostro livello', visible: true });
      assert.deepEqual(errors, []);
      await ctx.close();
    }
    {
      const { page, ctx, errors } = await gioca(h, 'zero', { width: 390, height: 844 });
      const state = await page.evaluate(() => {
        const card = document.querySelector('#quizHub .us-gv2-rileggete');
        const r = card?.getBoundingClientRect();
        return {
          lead: card?.querySelector('.us-gv2-kicker')?.textContent,
          title: card?.querySelector('h3')?.textContent,
          answers: [...(card?.querySelectorAll('dd') || [])].map((d) => d.textContent),
          top: r ? Math.round(r.top) : -1,
          before: card && card.compareDocumentPosition(document.querySelector('#quizHub .us-gv2-choose')) & Node.DOCUMENT_POSITION_FOLLOWING,
          faces: [...document.querySelectorAll('#quizHub .us-gv2-voi .us-char')].map((c) => c.getAttribute('data-reaction')),
          tokens: document.querySelector('#usGv2Tokens b')?.textContent,
        };
      });
      assert.equal(state.lead, 'Intanto rileggete…');
      assert.equal(state.title, 'Ne parlate stasera?');
      assert.deepEqual(state.answers, ['Sushi', 'Pizza']);
      assert.ok(state.top > 0 && state.top < 844, 'on the first screen, not a grey page');
      assert.ok(state.before, 'before the spent games');
      assert.deepEqual(state.faces, ['sera', 'sera'], 'sleepy when the tokens are finished');
      assert.equal(state.tokens, 'Domani altre 3');
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally { await h.close(); }
});
