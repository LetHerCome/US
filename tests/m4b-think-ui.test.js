const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function sendThinkBlock() {
  const source = read('app.js');
  const start = source.indexOf('async function sendThinkSignal()');
  const end = source.indexOf('window.sendThinkSignal=', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return source.slice(start, end);
}

test('M4B send Web usa send_think con operation id stabile e retry-safe', () => {
  const block = sendThinkBlock();
  assert.match(block, /randomUUID/);
  assert.match(block, /sb\.rpc\('send_think'/);
  assert.match(block, /operation_id/);
  assert.doesNotMatch(block, /sb\.from\('shared_messages'\)\.insert/);
  assert.match(block, /sendWebPushEvent\('think'/);
});

test('M4B integra Ti Penso ricevuto nella Arrival Surface M2', () => {
  const app = read('app.js');
  assert.match(app, /arrivalType.*think-received|think-received.*arrivalType/);
  assert.match(app, /action.*think|think.*action/);
  assert.match(app, /openThinkArrival/);
  assert.match(app, /refreshTodayPriorities/);
  assert.match(app, /table:'think_reactions'/);
  assert.match(read('navigation.js'), /name:'think-arrival'/);
});

test('M4B espone tre reaction finali senza thread o counter sociali', () => {
  const html = read('index.html');
  const app = read('app.js');
  assert.match(html, /id="thinkArrival"/);
  assert.match(html, /data-think-reaction="heart"/);
  assert.match(html, /data-think-reaction="hug"/);
  assert.match(html, /data-think-reaction="miss_you"/);
  assert.match(app, /set_think_reaction/);
  assert.match(app, /think_reaction/);
  assert.doesNotMatch(html, /chat thread|social thread|reaction counter/i);
});

test('M4B rende la reaction terminale lato UI e aggiorna il feedback sender', () => {
  const app = read('app.js');
  assert.match(app, /usThinkReactionFinal/);
  assert.match(app, /already_reacted|duplicate/);
  assert.match(app, /lastReaction|reaction.*sender|ha reagito/i);
  assert.match(app, /sendWebPushEvent\('think_reaction'/);
});
