// Waiting for the partner (09/11/2026): until now who signed up first saw only
// the code. Now they can already answer today's question (same RPC and same
// answer row as Oggi), and the invite says so: the partner answers to see it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const OB = require('../onboarding.js');

const PROFILE = { id: 'u1', couple_id: 'c1', display_name: 'Bea' };
function fakeDaily({ answer = '', questionError = null, saveError = null, question = 'Qual è il vostro posto?' } = {}) {
  const calls = { question: 0, read: [], save: [] };
  return {
    calls,
    question: async () => { calls.question += 1; return questionError ? { data: null, error: questionError } : { data: { id: 'q1', question, question_date: '2026-11-09' }, error: null }; },
    readAnswer: async (questionId, userId) => { calls.read.push([questionId, userId]); return { data: answer ? { answer } : null, error: null }; },
    saveAnswer: async (row) => { calls.save.push(row); return { error: saveError }; },
  };
}

test('the invite says the question is answered only when it is', () => {
  const code = '01JBX4Z7Q8M2N5P6R9S3T4V7W8';
  const plain = OB.inviteMessage(code, undefined, 'https://www.uscouple.app');
  assert.equal(plain, `Ti aspetto su US ♡\nApri il mio invito:\nhttps://www.uscouple.app/invito#${code}`);
  const answered = OB.inviteMessage(code, undefined, 'https://www.uscouple.app', { answered: true });
  assert.equal(answered, `Ti aspetto su US ♡\nHo già risposto alla domanda di oggi: rispondi anche tu per vedere la mia.\nApri il mio invito:\nhttps://www.uscouple.app/invito#${code}`);
  const english = OB.inviteMessage(code, (t) => `<${t}>`, 'https://www.uscouple.app', { answered: true }).split('\n');
  assert.equal(english[1], '<Ho già risposto alla domanda di oggi: rispondi anche tu per vedere la mia.>');
  assert.equal(english[3], `https://www.uscouple.app/invito#${code}`, 'the link is never translated');
});

test('who waits loads today\'s question once per account and day, and answers it with the Oggi row', async () => {
  const daily = fakeDaily();
  let now = new Date('2026-11-09T10:00:00Z');
  const day = OB.waitingToday(daily, { now: () => now });
  assert.equal((await day.load(PROFILE)).status, 'open');
  assert.deepEqual(day.state.question, { id: 'q1', text: 'Qual è il vostro posto?' });
  await day.load(PROFILE);
  assert.equal(daily.calls.question, 1, 'the same day: no second request');
  assert.deepEqual(daily.calls.read, [['q1', 'u1']]);

  assert.equal((await day.save(PROFILE, '   ')).error, 'Scrivi qualcosa prima');
  assert.equal(daily.calls.save.length, 0);
  const saving = day.save(PROFILE, `  ${'a'.repeat(1200)}  `);
  assert.equal(day.state.status, 'saving', 'the button can say «Salvo…» at once');
  assert.equal((await saving).status, 'answered');
  assert.deepEqual(daily.calls.save, [{ question_id: 'q1', user_id: 'u1', couple_id: 'c1', answer: 'a'.repeat(1000) }]);
  assert.equal(day.answered(), true);
  assert.equal((await day.save(PROFILE, 'again')).status, 'answered', 'answered: no second answer from here');
  assert.equal(daily.calls.save.length, 1);

  now = new Date('2026-11-10T08:00:00Z');
  await day.load(PROFILE);
  assert.equal(daily.calls.question, 2, 'a new day in Rome: today\'s question again');
});

test('an answer already given shows as given; any failure keeps the card away or says retry', async () => {
  const given = OB.waitingToday(fakeDaily({ answer: 'Il lago' }));
  const state = await given.load(PROFILE);
  assert.equal(state.status, 'answered');
  assert.equal(state.answer, 'Il lago');

  assert.equal((await OB.waitingToday(fakeDaily({ questionError: { message: 'couple membership required' } })).load(PROFILE)).status, 'off');
  assert.equal((await OB.waitingToday(fakeDaily({ question: '  ' })).load(PROFILE)).status, 'off');
  assert.equal((await OB.waitingToday(null).load(PROFILE)).status, 'off', 'no daily wiring: no card');
  assert.equal((await OB.waitingToday(fakeDaily()).load({ id: 'u1', couple_id: null })).status, 'off');
  const thrower = fakeDaily();
  thrower.question = async () => { throw new Error('offline'); };
  assert.equal((await OB.waitingToday(thrower).load(PROFILE)).status, 'off');

  const failing = OB.waitingToday(fakeDaily({ saveError: { message: 'boom' } }));
  await failing.load(PROFILE);
  const after = await failing.save(PROFILE, 'Il mare');
  assert.equal(after.status, 'open');
  assert.equal(after.error, 'Non riesco a salvare la risposta. Riprova.');
});

test('the card sits in the invite screen, in Italian and English, wired to the Oggi RPC and row', () => {
  const html = read('index.html');
  const waiting = html.slice(html.indexOf('id="mc3Waiting"'), html.indexOf('us-ob-note'));
  for (const id of ['mc3Today', 'mc3TodayQuestion', 'mc3TodayAnswer', 'mc3TodayStatus', 'mc3TodaySave', 'mc3TodayDone']) {
    assert.match(waiting, new RegExp(`id="${id}"`), id);
  }
  assert.match(waiting, /<div class="us-ob-today" id="mc3Today" role="group"[^>]* hidden>/);
  assert.match(waiting, /<textarea id="mc3TodayAnswer" rows="3" maxlength="1000"><\/textarea>/);
  const en = read('i18n-en.js');
  for (const it of ['Intanto, la domanda di oggi', 'La tua risposta', 'Rispondi', 'Salvo…', 'Scrivi qualcosa prima',
    'Fatto. La tua persona vedrà la tua risposta quando avrà dato la sua.', 'Non riesco a salvare la risposta. Riprova.',
    'Ho già risposto alla domanda di oggi: rispondi anche tu per vedere la mia.']) {
    assert.ok(en.includes(`'${it}':`) || en.includes(`${it}:`), `English for «${it}»`);
  }
  const app = read('app.js');
  assert.match(app, /daily:\{\s*question:\(\)=>usWithDeadline\(sb\.rpc\('get_or_create_daily_question'\),5000\)/);
  assert.match(app, /saveAnswer:row=>sb\.from\('daily_answers'\)\.upsert\(\{\.\.\.row,updated_at:new Date\(\)\.toISOString\(\)\},\{onConflict:'question_id,user_id'\}\)/);
  const css = read('dc-primo.css');
  assert.match(css, /#mc3Waiting \.us-ob-today\{order:6\}/);
  assert.match(css, /#usOnboarding \.us-ob-today>\*\{order:0\}/, 'the button stays under the field: the step orders fields first');
  assert.match(css, /html \.auth-overlay #mc3CopyCode,\nhtml \.auth-overlay #mc3TodaySave,/, 'a secondary button, like Copia codice');
  const ob = read('onboarding.js');
  assert.match(ob, /inviteMessage\(code,window\.UsI18n\?\.t,undefined,\{answered:waitingDay\.answered\(\)\}\)/);
});
