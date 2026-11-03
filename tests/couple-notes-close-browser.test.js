// Post-it che sparisce (staging, 04/11/2026): every way the open post-it
// «ciao» can be closed, in the real app with the fake Supabase. None takes it
// away unless someone empties it by hand and says yes to «Staccare il
// post-it?». The rules themselves: couple-notes-close.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadChromium, startServer, FAKE_SUPABASE } = require('./helpers/oggi-browser');

// Every delete that reaches the fake server.
const SPY = FAKE_SUPABASE.replace("delete() { op = 'delete'; return b; }", "delete() { op = 'delete'; (window.__QA.deletes ||= []).push(table); return b; }");

function fixture() {
  const iso = (d) => new Date(Date.now() + d * 864e5).toISOString();
  const note = (id, title, by, age, extra = {}) => ({ id, couple_id: 'c1', title, body: '', items: [], color: 'yellow', created_by: by, updated_by: by, created_at: iso(-age), updated_at: iso(-age), revision: 1, ...extra });
  window.__QA = {
    me: 'f1', persistWrites: true,
    countdown: { items: [], active_id: null, together_style: 'editorial', version: 0, started_on: '2024-01-10' },
    tables: {
      profiles: [{ id: 'f1', couple_id: 'c1', role: 'francesco', display_name: 'Fra' }, { id: 'b1', couple_id: 'c1', role: 'beatrice', display_name: 'Bea' }],
      couples: [{ id: 'c1', bond_xp: 100, started_on: '2024-01-10', name: 'US.' }],
      calendar_entries: [], shared_events: [], moments: [], moment_photos: [], bucket_items: [],
      couple_notes: [
        note('ciao', 'ciao', 'f1', 0, { body: '😀🥰🎉' }),
        note('spesa', 'Spesa', 'b1', 1, { items: [{ id: 'i1', text: 'Pane', done: false }] }),
        note('solo', '', 'b1', 2, { body: 'Solo testo' })
      ],
      daily_answers: [], calendar_reminders: [], bond_weekly_quests: [], stories: [], couple_locations: [], shared_event_completions: [], relationship_milestones: []
    },
    rpc: {
      get_countdown_oggi_v1: async () => ({ data: structuredClone(window.__QA.countdown), error: null }),
      get_progression_v1: async () => ({ data: { rewards: [], total_xp: 100, level: 1, preferences: {}, pending_unlocks: [], rhythm_days: 0 }, error: null }),
      get_daily_state: async () => ({ data: { my_answer: null, partner_has_answer: false, both_answered: false }, error: null })
    }
  };
  try { localStorage.clear(); sessionStorage.clear(); } catch (_) {}
}

const EDITOR = '#usNoiBoardGrid .is-editing';
const open = async (p, id = 'ciao') => { await p.locator(`#usNoiBoardGrid .us-postit[data-note-id="${id}"] .us-postit-text`).first().tap(); await p.waitForSelector(`${EDITOR} .us-notes-title`); };
const done = (p) => p.locator(`${EDITOR} [data-notes-done]`).tap();
const partner = (p, id, patch) => p.evaluate(([id, patch]) => {
  const row = { ...window.__QA.tables.couple_notes.find((n) => n.id === id), updated_by: 'b1', revision: 2, ...patch };
  for (const k of Object.keys(patch)) if (patch[k] === undefined) delete row[k];
  window.UsCoupleNotes.onChange({ eventType: 'UPDATE', new: row, old: { id } });
}, [id, patch]);

const PATHS = {
  'opened and closed at once': async (p) => { await open(p); await done(p); },
  'a tap on another post-it': async (p) => { await open(p); await open(p, 'solo'); await done(p); },
  '«Nuovo post-it» while it is open': async (p) => { await open(p); await p.locator('#usNoiBoardGrid [data-notes-new]').tap(); await p.waitForTimeout(200); await done(p); },
  '«Tutti i post-it», then Back': async (p) => { await open(p); await p.evaluate(() => window.UsCoupleNotes.open()); await p.waitForTimeout(300); await p.evaluate(() => window.UsCoupleNotes.back()); },
  'another tab and back': async (p) => { await open(p); await p.locator('.nav button[data-page="home"]').tap(); await p.waitForTimeout(400); await p.locator('.nav button[data-page="bond"]').tap(); await p.waitForTimeout(600); await done(p); },
  'Android Back': async (p) => { await open(p); await p.evaluate(() => window.UsCoupleNotes.back()); await p.waitForTimeout(200); await done(p); },
  'the partner changes it': async (p) => { await open(p); await partner(p, 'ciao', { color: 'pink' }); await done(p); },
  'the partner ticks another one': async (p) => { await open(p); await partner(p, 'spesa', {}); await done(p); },
  'a Realtime row without its text': async (p) => { await open(p); await partner(p, 'ciao', { title: undefined, body: undefined, items: undefined }); await p.waitForTimeout(200); await done(p); },
  'the board read again': async (p) => { await open(p); await p.evaluate(() => window.UsCoupleNotes.refresh()); await p.waitForTimeout(300); await done(p); },
  'written on, saved, closed at once': async (p) => { await open(p); await p.locator(`${EDITOR} .us-notes-text`).press('End'); await p.keyboard.type('!'); await p.waitForTimeout(720); await done(p); }
};

test('no way of closing the post-it «ciao» takes it away', async (t) => {
  const chromium = loadChromium();
  if (!chromium) return t.skip('Playwright unavailable');
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const page = async () => {
    const ctx = await browser.newContext({ locale: 'it-IT', viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true, timezoneId: 'Europe/Rome', serviceWorkers: 'block', reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.route('**/*', (route) => { const u = route.request().url(); if (u.startsWith(base)) return route.continue(); if (/supabase-js/.test(u)) return route.fulfill({ contentType: 'text/javascript', body: SPY }); return route.abort(); });
    await p.addInitScript(fixture);
    await p.goto(`${base}/?us-dev=1`, { waitUntil: 'load' });
    await p.waitForFunction(() => window.usProfile && window.UsCoupleNotes?.onChange);
    await p.waitForTimeout(1000);
    await p.locator('.nav button[data-page="bond"]').tap();
    await p.waitForSelector('#usNoiBoardGrid .us-postit[data-note-id="ciao"]');
    return { p, ctx, errors };
  };
  const server_ = (p) => p.evaluate(() => ({ ciao: window.__QA.tables.couple_notes.find((n) => n.id === 'ciao') || null, deletes: window.__QA.deletes || [], asking: Boolean(document.querySelector('.us-confirm [data-us-confirm="ok"]')) }));
  try {
    for (const [name, run] of Object.entries(PATHS)) {
      const { p, ctx, errors } = await page();
      await run(p);
      await p.waitForTimeout(400);
      const s = await server_(p);
      assert.deepEqual(s.deletes, [], `${name}: nothing deleted`);
      assert.ok(s.ciao && s.ciao.title === 'ciao' && s.ciao.body.startsWith('😀🥰🎉'), `${name}: «ciao» is still there`);
      assert.deepEqual(errors, [], name);
      await ctx.close();
    }

    // Emptied by hand: it asks; «Tienilo» keeps it as it was, «Stacca» takes it away.
    const { p, ctx, errors } = await page();
    const empty = async () => { await open(p); await p.locator(`${EDITOR} .us-notes-title`).fill(''); await p.locator(`${EDITOR} .us-notes-text`).fill(''); await done(p); await p.waitForSelector('.us-confirm [data-us-confirm="ok"]'); };
    await empty();
    assert.match(await p.locator('.us-confirm').innerText(), /Staccare il post-it\?[\s\S]*L’hai svuotato/);
    await p.locator('.us-confirm button[data-us-confirm="cancel"]').tap();
    await p.waitForTimeout(400);
    let s = await server_(p);
    assert.deepEqual(s.deletes, []);
    assert.equal(s.ciao?.body, '😀🥰🎉', 'kept as it was');
    assert.equal(await p.locator(EDITOR).count(), 0, 'the post-it is closed');
    assert.match(await p.locator('#usNoiBoardGrid .us-postit[data-note-id="ciao"]').innerText(), /ciao[\s\S]*😀🥰🎉/);
    await empty();
    await p.locator('.us-confirm [data-us-confirm="ok"]').tap();
    await p.waitForTimeout(400);
    s = await server_(p);
    assert.equal(s.ciao, null, '«Stacca»: gone for both');
    assert.deepEqual(s.deletes, ['couple_notes']);

    // Born in this opening, written, saved and emptied again: it goes by itself.
    await p.locator('#usNoiBoardGrid [data-notes-new]').tap();
    await p.locator(`${EDITOR} .us-notes-title`).fill('Prova');
    await p.waitForFunction(() => window.__QA.tables.couple_notes.some((n) => n.title === 'Prova'));
    await p.waitForTimeout(100);
    await p.locator(`${EDITOR} .us-notes-title`).fill('');
    await done(p);
    await p.waitForTimeout(400);
    s = await server_(p);
    assert.equal(s.asking, false, 'nothing to ask');
    assert.deepEqual(s.deletes, ['couple_notes', 'couple_notes']);
    assert.equal(await p.evaluate(() => window.__QA.tables.couple_notes.some((n) => n.title === 'Prova')), false);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
});
