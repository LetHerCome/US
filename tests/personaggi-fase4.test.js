// Redesign definitivo, fase 4 (founder 23/11/2026, D2 e D4): the two
// characters instead of the circles (the daily question, Sintonia, the couple
// card), the reactions, and the wardrobe in Il vostro angolo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const P = require('../personaggi.js');

test('the reactions: festa on the mesiversario, heart eyes after a Ti penso, a wave, sleepy at night', () => {
  // Without a window the module reads nothing: only the hour speaks.
  assert.equal(P.reactionOf('francesco', new Date(2026, 10, 23, 23, 0)), 'sera');
  assert.equal(P.reactionOf('francesco', new Date(2026, 10, 23, 12, 0)), '');
  const heart = P.character('francesco', { reaction: 'cuore' });
  assert.match(heart, /data-reaction="cuore"/);
  assert.match(heart, /fill="#FF4F6F"/, 'heart eyes');
  assert.doesNotMatch(heart, /us-char-eyes/);
  assert.match(P.character('beatrice', { reaction: 'festa' }), /class="us-char-confetto"/);
  assert.match(P.character('beatrice', { reaction: 'saluta' }), /class="us-char-wave"/);
  assert.match(P.character('beatrice', { reaction: 'sera' }), />z</);
  // Same character, same markup: the daily card is not redrawn for nothing.
  assert.equal(P.character('francesco', { face: 'sciarpina' }), P.character('francesco', { face: 'sciarpina' }));
  const js = read('personaggi.js');
  assert.match(js, /if \(w\?\.todayQuestion\?\.id && st\?\.partner_has_answer && st\?\.my_answer == null\) return 'saluta';/);
  assert.match(read('app.js'), /window\.usThinkLastReceivedAt=received\?\.created_at\|\|'';window\.dispatchEvent\(new Event\('us:think-updated'\)\);/);
});

test('the daily question on Oggi: the two characters, dashed until answered, together with a heart', () => {
  const app = read('app.js');
  assert.match(app, /const one=\(role,on\)=>!P\?'':on\?P\.character\(role,\{size:26,reaction:''\}\):P\.slot\(P\.shapeOf\(role\),26,false\);/);
  assert.match(app, /const mineIn=st==='attesa'\|\|st==='pronte'\|\|st==='svelate',theirsIn=st==='tocca'\|\|st==='pronte'\|\|st==='svelate';/);
  assert.doesNotMatch(app, /usDailyRingMe|r-fill|r-bloom/, 'no circles left');
  assert.match(app, /playDailyRitualAnswered\(card,model\.state!=='waiting'\)/, 'answering second brings them together');
  const css = read('struttura.css');
  assert.match(css, /#home #usDailyRitual \.us-daily-duo:is\(\[data-st="pronte"\],\[data-st="svelate"\]\) \.r-noi\{opacity:1\}/);
  assert.doesNotMatch(read('dc-oggi.css'), /\.ring \.r-fill|\.ring \.r-me-ring/);
});

test('Sintonia: the two circles became the characters of the angolo, closer as the level grows', () => {
  assert.doesNotMatch(read('index.html'), /us-sintonia-venn/);
  const progression = read('progression.js');
  assert.match(progression, /return document\.querySelector\?\.\('#usAngolo \.us-angolo-duo'\) \|\| null;/);
  assert.match(progression, /duo\.style\.setProperty\('--us-vicini', `\$\{gap\}px`\);/);
  assert.doesNotMatch(progression, /us-sintonia-venn|is-bloom/);
  assert.match(read('struttura.css'), /\.us-angolo-duo \.us-duo-one\+\.us-duo-one\{margin-left:var\(--us-vicini,28px\)/);
});

test('the couple card of the Profilo shows the two characters', () => {
  assert.match(read('settings.js'), /const drawn=window\.UsPersonaggi\?\.character\?\.\(role,\{size:48,react:true,label:name\}\);/);
});

test('the wardrobe: shape, head, face or neck; the thresholds the server checks; Cambia look', () => {
  // Since il grande bilanciamento (28/11/2026) the wardrobe sits on the levels of the one ladder.
  assert.deepEqual(P.LOOK_LEVELS, { occhiali: 2, cappello: 4, fiocco: 7, sciarpina: 9, sole: 12, gala: 14, cuffie: 17, coroncina: 20, corona: 25 });
  const sql = read('supabase/migrations/20261128104932_bilanciamento_v1.sql');
  for (const [item, level] of Object.entries(P.LOOK_LEVELS)) assert.ok(sql.includes(`('${item}', ${level})`), `${item} ${level} as on the server`);
  const js = read('personaggi.js');
  assert.match(js, /saveCharacter\('set_my_character_look', \{ p_head: next\.head, p_face: next\.face \}\);/);
  assert.match(js, /saveCharacter\('set_my_character_shape', \{ p_shape: shape \}\);/);
  assert.match(js, /db\.rpc\('my_character_unlocks'\)/);
  const html = read('index.html');
  // 25/11/2026: the wardrobe is the Guardaroba tab of the angolo.
  assert.match(html, /<section class="us-angolo-look us-angolo-panel" id="usAngoloLook" role="tabpanel" aria-labelledby="usAngoloTabLook" aria-label="Il tuo guardaroba" data-angolo-panel="look" hidden><\/section>/);
  assert.match(html, /<button type="button" class="us-profile-look" data-us-angolo="look">Cambia look<\/button>/);
  // 25/11/2026: Cambia look opens the Guardaroba tab of the angolo.
  assert.match(js, /showTab\(place === 'look' \? 'look' : 'voi', \{ focus: false \}\);/);
});
