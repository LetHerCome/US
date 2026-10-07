const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start, pageFor } = require('./helpers/countdown-browser');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('multi-couple: runtime identity comes from couple/profile data, not private names or dates', () => {
  const app = read('app.js');
  const games = read('games.js');

  assert.doesNotMatch(app, /2026-04-21/, 'relationship date must never be hardcoded');
  assert.match(app, /window\.UsCoupleContext=Object\.freeze/);
  assert.match(app, /sb\.from\('couples'\)\.select\('id,name,started_on'\)\.eq\('id',coupleId\)/);
  assert.match(app, /sb\.from\('profiles'\)\.select\('id,display_name,role,couple_id,avatar_path'\)\.eq\('couple_id',coupleId\)/);

  assert.doesNotMatch(app, /\?\s*['"]Beatrice['"]\s*:\s*['"]Francesco['"]/);
  assert.doesNotMatch(app, /\?\s*['"]Bea['"]\s*:\s*['"]Francesco['"]/);
  assert.doesNotMatch(games, /role\s*===\s*['"]francesco['"]\s*\?\s*['"]Francesco['"]/);
  assert.doesNotMatch(games, /const agree\s*=/, 'gender must not be inferred from the legacy role');
  assert.match(games, /UsCoupleContext\?\.partnerName/);
});

test('multi-couple: calendar presentation uses profile names rather than F/B identity', () => {
  const calendar = read('calendar.js');
  assert.doesNotMatch(calendar, /OWNER_MARK_BY_LANE/);
  assert.doesNotMatch(calendar, /F\+B/);
  assert.match(calendar, /lane === 'shared'\) return '♡'/);
  assert.match(calendar, /toLocaleUpperCase\('it-IT'\)/);
});

test('multi-couple: boot placeholders and local cosmetics do not infer a private identity', () => {
  const fastboot = read('fastboot2.js');
  const progression = read('progression.js');
  assert.match(fastboot, /document\.title='US — Solo voi'/);
  assert.match(fastboot, /La tua persona/);
  assert.doesNotMatch(progression, /role\s*===\s*['"]beatrice['"]/);
  assert.doesNotMatch(progression, /Francesco|Beatrice/);
});

test('multi-couple: current membership authority stays one auth user -> one profile -> one couple', () => {
  const tables = read('supabase/baseline/20_tables.sql');
  const constraints = read('supabase/baseline/40_constraints.sql');
  assert.match(tables, /create table public\.profiles[\s\S]*?id uuid not null,[\s\S]*?couple_id uuid/);
  assert.match(constraints, /profiles_id_fkey FOREIGN KEY \(id\) REFERENCES auth\.users\(id\)/);
  assert.match(constraints, /profiles_couple_id_fkey FOREIGN KEY \(couple_id\) REFERENCES couples\(id\)/);
  assert.doesNotMatch(tables, /create table public\.couple_members\b/,
    'do not add a second membership authority until multiple memberships are a product requirement');
});

test('multi-couple browser: a completely different couple renders its own names and started_on', async (t) => {
  let h;
  try { h = await start(); } catch (error) {
    if (/Executable doesn't exist|browserType\.launch|playwright/i.test(String(error))) { t.skip('Playwright unavailable'); return; }
    throw error;
  }
  if (!h) { t.skip('Playwright unavailable'); return; }
  t.after(() => h.close());

  const started = '2024-02-03';
  const { page, ctx, errors } = await pageFor(h, {
    meName: 'Luca',
    partnerName: 'Maya',
    started
  });
  t.after(() => ctx.close());

  await page.waitForFunction(() => window.UsCoupleContext?.partnerName?.() === 'Maya');

  const actual = await page.evaluate(() => ({
    me: document.querySelector('[data-noi-couple-name="francesco"]')?.textContent?.trim(),
    partner: document.querySelector('[data-noi-couple-name="beatrice"]')?.textContent?.trim(),
    contextPartner: window.UsCoupleContext.partnerName(),
    startedOn: window.UsCoupleContext.snapshot().couple?.started_on,
    days: document.getElementById('daysTogether')?.textContent?.trim()
  }));

  const [y,m,d] = started.split('-').map(Number);
  const now = new Date();
  const expectedDays = Math.max(0, Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(y,m-1,d)) / 86400000)).toLocaleString('it-IT');

  assert.deepEqual(actual, {
    me: 'Luca',
    partner: 'Maya',
    contextPartner: 'Maya',
    startedOn: started,
    days: expectedDays
  });
  assert.deepEqual(errors, []);
});
