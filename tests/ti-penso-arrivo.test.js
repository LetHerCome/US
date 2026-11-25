// Ti penso ricevuto nella nuova US (founder 25/11/2026, tavola «US · Ti penso
// ricevuto», approvata: «Approvo»; icon of the hug: «La A»). Their character
// drops in with heart eyes and says «Ti penso!»; three one-tone replies with
// their name; at the tap your character arrives and answers, then it closes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start, pageFor } = require('./helpers/countdown-browser');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('markup: the stage with the two characters, the bubble, three named replies', () => {
  const html = read('index.html');
  const arrival = html.slice(html.indexOf('<main id="thinkArrival"'), html.indexOf('</main>', html.indexOf('<main id="thinkArrival"')));
  assert.match(arrival, /aria-labelledby="thinkArrivalTitle" data-us-modal-panel data-think-state="ask"/);
  for (const hook of ['data-think-me', 'data-think-them', 'data-think-hug']) assert.match(arrival, new RegExp(hook), hook);
  assert.match(arrival, /<span class="think-arrival-bubble">Ti penso!<\/span>/);
  for (const [reaction, label] of [['heart', 'Un cuore'], ['hug', 'Un abbraccio'], ['miss_you', 'Anch\'io']]) {
    assert.match(arrival, new RegExp(`data-think-reaction="${reaction}"[^>]*>.*?<span class="think-reaction-label" aria-hidden="true">${label}</span>`), label);
  }
  // Icon A: the two characters cheek to cheek, one tone; no emoji left.
  assert.match(arrival, /think-reaction-hug" aria-hidden="true"><svg viewBox="0 0 256 256" fill="none" stroke="currentColor"[^>]*><circle cx="82" cy="150" r="58"\/><rect x="140" y="92"/);
  assert.doesNotMatch(arrival, /\p{Extended_Pictographic}/u);
  assert.match(arrival, /class="think-arrival-close ghost" onclick="closeThinkArrival\(\)">Più tardi<\/button>/);
});

test('logic: their character with heart eyes, yours, the hug; the reply shows at the tap', () => {
  const app = read('app.js');
  assert.match(app, /if\(themEl\)themEl\.innerHTML=P\.character\(them,\{size:170,reaction:'cuore',mood:''\}\);/);
  assert.match(app, /usThinkReactionInFlight=true;usThinkReactionPicked=reaction;renderThinkReactionUi\(\);/);
  assert.match(app, /const state=\(\{heart:'heart',hug:'hug',miss_you:'miss'\}\)\[chosen\]\|\|'ask';/);
  assert.match(app, /thinkArrivalCast\(root\);\n  renderThinkReactionUi\(\);/);
  assert.match(app, /setTimeout\(\(\)=>closeThinkArrival\(\),2300\);/);
  // Founder 25/11/2026: no hands on the hug, the two cheek to cheek with a heart above.
  assert.doesNotMatch(app, /think-arrival-arms|const arm=/);
  assert.match(app, /<svg class="think-arrival-hug-heart"/);
  const css = read('dc-oggi.css');
  for (const state of ['heart', 'hug', 'miss']) assert.match(css, new RegExp(`\\[data-think-state="${state}"\\]`), state);
  assert.doesNotMatch(css, /think-arrival-visual|think-reaction-hug::before/);
});

test('in the app: the arrival, a hug, and it closes by itself', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    await page.waitForFunction(() => window.UsPersonaggi && window.openThinkArrival);
    await page.evaluate(() => {
      window.UsAngolo?.isola?.(false);
      window.__QA.rpc.set_think_reaction = async (args) => ({ data: [{ status: 'saved', reaction: args.target_reaction }], error: null });
      usIncomingThink = { id: 'qa-think', sender_id: 'b1', created_at: new Date().toISOString() };
      window.openThinkArrival();
    });
    await page.waitForSelector('#thinkArrival.open [data-think-them] svg[data-reaction="cuore"]');
    assert.equal(await page.locator('#thinkArrival [data-think-me] svg').count(), 1);
    assert.match(await page.locator('#thinkArrivalTitle').innerText(), /Beatrice\s+ti pensa/);
    await page.waitForTimeout(1200);
    await page.click('#thinkArrival [data-think-reaction="hug"]');
    await page.waitForFunction(() => document.querySelector('#thinkArrival .think-arrival-sheet').dataset.thinkState === 'hug');
    assert.equal(await page.locator('#thinkArrival [data-think-hug] .us-char').count(), 2, 'the two of you together');
    await page.waitForFunction(() => document.getElementById('thinkArrivalStatus').textContent === 'Hai risposto con un abbraccio.');
    await page.waitForFunction(() => !document.getElementById('thinkArrival').classList.contains('open'), null, { timeout: 6000 });
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await h.close();
  }
});
