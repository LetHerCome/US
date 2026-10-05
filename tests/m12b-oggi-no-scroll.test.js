// M12B.1 — Oggi genuinely fits the viewport. Two layers:
// 1. Static contract: no overflow clip is left on Oggi, the frame drops the
//    shared nav clearance instead, other pages keep it.
// 2. Real geometry in Chromium at 375x667, 390x844, 768x1024 and 1280x800
//    across Oggi states: the document is never taller than the viewport, no
//    clipping rule is in effect while measuring, every visible Oggi control
//    sits between the top bar and the bottom nav, Oggi surfaces never overlap,
//    and M12A arbitration still shows at most 1 primary + 1 quiet item.
//    Since US Home Cleanup the dashboard stack (#usOggiStack) is retired and
//    stays mounted but invisible; what Oggi shows is the photo/countdown, the
//    fixed priority notice and the transient Daily Question nudge.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, loadChromium, startServer, FAKE_SUPABASE } = require('./helpers/oggi-browser');

const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const css = () => ['styles.css', 'ui-foundation.css', 'identity.css', 'fix4.css', 'polish4.css', 'settings2.css', 'calendar.css', 'events.css', 'games.css', 'moments-albums.css', 'left-for-you.css', 'stories.css']
  .map(read).join('\n');

test('M12B.1 static: Oggi keeps no overflow clip on body, html or #home', () => {
  const all = css();
  assert.doesNotMatch(all, /body:has\(#home\.page\.active\)\{[^}]*overflow/);
  assert.doesNotMatch(all, /#home\.page\.active\{[^}]*overflow/);
  assert.doesNotMatch(all, /html:has\(#home[^{]*\{[^}]*overflow/);
});

test('M12B.1 static: the Oggi frame drops the nav clearance of .app, only while Oggi is active', () => {
  const identity = read('identity.css');
  assert.match(identity, /body:has\(#home\.page\.active\) \.app\{padding-bottom:0!important\}/);
  assert.match(identity, /#home \.home-hero-only\{height:calc\(var\(--us-viewport-height\) - var\(--us-safe-top\)\)!important;min-height:0!important\}/);
  // Every other page keeps the shared clearance for the floating nav.
  assert.match(read('fix4.css'), /\.app\{[^}]*padding-bottom:calc\(var\(--us-nav-height\) \+ var\(--us-safe-bottom\) \+ 34px\)!important/);
});

const VIEWPORTS = [[375, 667], [390, 844], [768, 1024], [1280, 800]];
const romeToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const LONG_QUESTION = 'Se potessi rivivere un solo giorno di quest’anno insieme a me, dall’alba fino a notte fonda, quale sceglieresti e che cosa cambieresti di quella giornata?';

function fixtures({ moments = true, event = true, eventTitle = 'Concerto di Elisa', push = false, daily = 'invited' } = {}) {
  const F = 'f1', B = 'b1', C = 'c1';
  const now = Date.now(), ago = (m) => new Date(now - m * 60000).toISOString();
  const state = {
    invited: { my_answer: null, partner_has_answer: true, both_answered: false },
    answer: { my_answer: null, partner_has_answer: false, both_answered: false },
    answered: { my_answer: 'Sì', partner_has_answer: false, both_answered: false },
    ready: { my_answer: 'Sì', partner_has_answer: true, both_answered: true, partner_answer: 'Anche io' }
  }[daily];
  return {
    push,
    daily: state,
    revealMeta: daily === 'ready' ? { question_id: 'dq1', both_answered: true, my_reveal_seen_at: null, my_notice_dismissed_at: null, my_reaction: null, partner_reaction: null } : null,
    tables: {
      profiles: [{ id: F, display_name: 'Francesco', role: 'francesco', couple_id: C, avatar_path: null }, { id: B, display_name: 'Beatrice', role: 'beatrice', couple_id: C, avatar_path: null }],
      couple_locations: [{ couple_id: C, user_id: F, latitude: 41.9, longitude: 12.5, accuracy: 30, updated_at: ago(4) }, { couple_id: C, user_id: B, latitude: 45.46, longitude: 9.19, accuracy: 30, updated_at: ago(3) }],
      moments: moments ? [{ id: 'm1', couple_id: C, created_by: F, storage_path: `${C}/${F}/a.webp`, caption: 'Mare', moment_date: day(-40), created_at: ago(60000) }] : [],
      shared_events: event ? [{ id: 'se1', couple_id: C, created_by: F, title: eventTitle, event_date: day(1), event_time: '21:00', location: 'Roma', note: null, recurs_yearly: false, created_at: ago(9000), updated_at: ago(9000) }] : [],
      shared_event_completions: [], relationship_milestones: [], couples: [{ id: C, bond_xp: 340, started_on: null }],
      calendar_entries: [], calendar_reminders: [], bucket_items: [], left_for_you: [], moment_photos: [], bond_weekly_quests: [], stories: [], conserva_contributions: []
    }
  };
}

// What each state must put on Oggi under the post-Home-Cleanup contract:
// `nudge` is the transient Daily Question nudge (its copy), null means no nudge.
const STATES = {
  'busy: event + Daily Question (partner answered)': { fx: fixtures(), nudge: /ha già risposto · tocca a te/ },
  'long texts: long event title + long question': { fx: fixtures({ eventTitle: 'La cena di compleanno a sorpresa con tutta la famiglia di Beatrice a Trastevere' }), nudge: /ha già risposto · tocca a te/ },
  'answers ready notice (dismissable) + event': { fx: fixtures({ daily: 'ready' }), nudge: /Le vostre risposte sono pronte/ },
  'empty: no Ricordo yet + Daily Question': { fx: fixtures({ moments: false, event: false, daily: 'answer' }), nudge: /Una domanda per voi oggi/ },
  'quiet push opt-in wins the quiet slot': { fx: fixtures({ event: false, push: true, daily: 'answer' }), nudge: /Una domanda per voi oggi/ },
  'calm: nothing to do': { fx: fixtures({ event: false, daily: 'answered' }), nudge: null }
};

async function measure(page) {
  return page.evaluate(() => {
    const visible = (el) => { if (!el || el.closest('[hidden]')) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4; };
    const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
    const clip = (el) => /hidden|clip/.test(getComputedStyle(el).overflowY);
    const top = box(document.querySelector('.top.us-premium-top'));
    const nav = box(document.querySelector('.nav'));
    // Oggi surfaces after Home Cleanup: the fixed priority notice, the
    // transient Daily Question nudge, the empty state and the bottom row.
    const surfaceIds = ['usTodayPriorityRegion', 'usDailyNudge', 'homeEmptyState', 'distanceWidget', 'pushOptInCard'];
    const surfaces = surfaceIds.map((id) => document.getElementById(id)).filter(visible).map((el) => ({ id: el.id, ...box(el) }));
    const controls = [...document.querySelectorAll('#homeHero button, #homeHero a, #homeHero [role=button], #usDailyNudge')]
      .filter((el) => el.id !== 'usOggiFocusToggle' && visible(el)).map((el) => ({ id: el.id || el.className, ...box(el) }));
    const stack = document.getElementById('usOggiStack');
    const stackStyle = getComputedStyle(stack);
    const retiredStack = { mounted: Boolean(stack), visibility: stackStyle.visibility, height: stack.getBoundingClientRect().height, pointerEvents: stackStyle.pointerEvents };
    const nudge = document.getElementById('usDailyNudge');
    const nudgeText = visible(nudge) ? nudge.textContent.replace(/\s+/g, ' ').trim() : null;
    const slots = [...document.querySelectorAll('#homeHero [data-us-oggi-slot]')].filter(visible).map((el) => el.getAttribute('data-us-oggi-slot'));
    return {
      innerHeight, innerWidth,
      scrollHeight: document.scrollingElement.scrollHeight, scrollWidth: document.scrollingElement.scrollWidth,
      clipped: { html: clip(document.documentElement), body: clip(document.body), home: clip(document.getElementById('home')) },
      top, nav, surfaces, controls, slots, retiredStack, nudgeText
    };
  });
}

test('M12B.1 geometry: Oggi fits every supported viewport without clipping', async (t) => {
  const chromium = loadChromium();
  if (!chromium) { t.skip('Playwright/Chromium not available in this environment'); return; }
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    for (const [name, { fx, nudge }] of Object.entries(STATES)) {
      for (const vp of VIEWPORTS) {
        const label = `${name} @ ${vp.join('x')}`;
        const mobile = vp[0] < 800;
        const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: vp[0], height: vp[1] }, isMobile: mobile, hasTouch: mobile });
        const page = await ctx.newPage();
        await page.route('**/*', (route) => {
          const url = route.request().url();
          if (url.startsWith(base)) return route.continue();
          if (/supabase-js/.test(url)) return route.fulfill({ contentType: 'text/javascript', body: FAKE_SUPABASE });
          return route.abort();
        });
        await page.addInitScript(({ fx, question, today }) => {
          window.__QA = { me: 'f1', tables: fx.tables, rpc: {
            get_or_create_daily_question: async () => ({ data: { id: 'dq1', question, question_date: today }, error: null }),
            get_daily_state: async () => ({ data: fx.daily, error: null }),
            get_daily_reveal_meta: async () => ({ data: fx.revealMeta, error: null }),
            get_notification_preferences: async () => ({ data: { think: true, today: true, bond: true, relationship: true, left_for_you: true, games: true }, error: null })
          } };
          try { localStorage.clear(); } catch (_) {}
        }, { fx, question: LONG_QUESTION, today: romeToday() });
        await page.goto(base + '/', { waitUntil: 'load' });
        await page.waitForFunction(() => window.usProfile, null, { timeout: 15000 });
        await page.waitForTimeout(2200);
        if (fx.push) {
          // The opt-in's own availability depends on the browser's push support;
          // for geometry it is shown as the arbitration's quiet candidate.
          // The calendar insight is hidden so the opt-in actually wins the quiet slot.
          await page.evaluate(() => { document.getElementById('usOggiCalendarWidget').hidden = true; document.getElementById('pushOptInCard').hidden = false; });
          await page.waitForTimeout(100);
        }
        const m = await measure(page);
        await ctx.close();

        assert.equal(Object.values(m.clipped).some(Boolean), false, `${label}: an overflow clip is active ${JSON.stringify(m.clipped)}`);
        assert.ok(m.scrollHeight <= m.innerHeight, `${label}: document ${m.scrollHeight}px > viewport ${m.innerHeight}px`);
        assert.ok(m.scrollWidth <= m.innerWidth, `${label}: horizontal overflow ${m.scrollWidth}px`);
        assert.ok(m.nav.bottom <= m.innerHeight && m.top.top >= 0, `${label}: top bar or nav outside the viewport`);
        for (const c of m.controls) {
          assert.ok(c.top >= m.top.bottom - 0.5 && c.bottom <= m.nav.top + 0.5, `${label}: ${c.id} (${Math.round(c.top)}-${Math.round(c.bottom)}) not between top bar ${Math.round(m.top.bottom)} and nav ${Math.round(m.nav.top)}`);
          assert.ok(c.left >= -0.5 && c.right <= m.innerWidth + 0.5, `${label}: ${c.id} outside the width`);
        }
        for (let i = 0; i < m.surfaces.length; i += 1) {
          for (let j = i + 1; j < m.surfaces.length; j += 1) {
            const a = m.surfaces[i], b = m.surfaces[j];
            const overlap = a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
            assert.equal(overlap, false, `${label}: ${a.id} overlaps ${b.id}`);
          }
        }
        // The retired dashboard stack stays mounted for its authorities but never shows.
        assert.deepEqual(m.retiredStack, { mounted: true, visibility: 'hidden', height: 0, pointerEvents: 'none' }, `${label}: the retired Oggi stack is visible`);
        if (nudge) {
          assert.match(m.nudgeText || '', nudge, `${label}: expected the Daily Question nudge`);
          const n = m.surfaces.find((s) => s.id === 'usDailyNudge');
          assert.ok(n.top >= m.top.bottom - 0.5 && n.bottom <= m.nav.top + 0.5, `${label}: the nudge is not between top bar and nav`);
        } else {
          assert.equal(m.nudgeText, null, `${label}: no Daily Question nudge when there is nothing to do`);
        }
        assert.ok(m.slots.filter((s) => s === 'primary').length <= 1, `${label}: more than one primary`);
        assert.ok(m.slots.filter((s) => s === 'quiet').length <= 1, `${label}: more than one quiet`);
        assert.equal(m.slots.includes('suppressed'), false, `${label}: a suppressed surface is still visible`);
        if (fx.push) assert.ok(m.surfaces.some((s) => s.id === 'pushOptInCard'), `${label}: the opt-in should hold the quiet slot`);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
});
