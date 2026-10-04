// App-wide copy reduction. Pins the copy that was deliberately removed and that
// the copy kept for safety (destructive, reveal, privacy, irreversible) is still
// there.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');

const SURFACES = ['index.html', 'app.js', 'settings.js', 'events.js', 'calendar.js', 'left-for-you.js', 'stories.js', 'moments-albums.js', 'games.js', 'fix4.js'];
const all = () => SURFACES.map(read).join('\n');

test('copy: explanatory and duplicate lines removed in this pass stay removed', () => {
  const removed = [
    'Quello che state costruendo insieme', 'Tocca un giorno per aggiungere', 'Tocca per scegliere una foto', 'Tocca per aggiornare',
    'Solo voi due potete vederlo', 'Scorri verso il basso per chiudere', 'Sto preparando la domanda di oggi',
    'Una domanda al giorno, uguale per entrambi', 'Un piccolo segnale, solo per voi due', 'Un piccolo invito a fare qualcosa insieme',
    'Cose che volete provare, senza fretta', 'Solo ciò che serve davvero a voi e a questo telefono',
    'Regola mesiversari, anniversari e giorni insieme', 'Aggiorna la foto che vede il tuo partner', 'La Home pesca automaticamente',
    'Scegli cosa vuoi ricevere davvero', 'Unità usata nella Home', 'Profili, rete, push e stato di questo dispositivo',
    'Questi interruttori regolano realmente', 'spazio privato condiviso', 'Puoi aggiornare quando hai finito',
    'Aggiungete solo le date che vale davvero la pena aspettare', 'US vi aiuterà a vedere come si incastrano',
    'Per questa settimana avete giocato tutto. Nuovi giochi lunedì', 'Una domanda che solo tu potresti fare',
    'Cinque domande, scelte tra tutto quello che avete', 'Supabase ha bloccato', 'fallback admin', 'Il server invia',
    'Mostro ciò che è già disponibile', 'Piccole cose che avete deciso di non perdere insieme',
  ];
  const text = all();
  for (const phrase of removed) assert.ok(!text.includes(phrase), `"${phrase}" is gone`);
  assert.equal((read('index.html').match(/Piccole cose che avete deciso di non perdere\./g) || []).length, 1, 'the Conservati tagline lives in the sheet only, not again on the Ricordi entry');
});

test('copy: text kept on purpose (destructive, reveal, privacy, irreversible) is still there', () => {
  const text = all();
  for (const phrase of [
    'Eliminare questo impegno?', 'Sparirà dal calendario di entrambi.', 'Elimina questo ricordo per entrambi', '>Eliminato<', '>Annulla<',
    'Sparirà per entrambi.', 'Dopo la conferma le risposte non si cambiano più.', 'Le risposte si sbloccano quando avete risposto entrambi.',
    'Scollega questo telefono', 'Dovrai inserire di nuovo il codice privato per rientrare in US.', 'Revocare Scriptable?',
    'Sei offline.', 'Facoltativa e privata.', 'Su di te · ',
  ]) assert.ok(text.includes(phrase), `"${phrase}" kept`);
  assert.match(text, /scoprirà giocando/);
});

test('copy: empty, loading and error states are a title, not a paragraph', () => {
  const html = read('index.html');
  assert.match(html, /<b>Carico…<\/b>/);
  assert.match(html, /<div class="us-cal-empty" id="usCalendarEmpty" hidden>\s*<b>Nessun impegno<\/b>\s*<\/div>/);
  assert.match(html, /<h3>Non riesco ad aprirlo<\/h3><button/);
  assert.doesNotMatch(html, /Preparo i vostri Conservati|Preparo qualcosa per te|Preparo Gioca/);
  assert.match(read('app.js'), /<b>La vostra storia parte da qui<\/b><\/div>/);
});

test('copy: Noi and Settings rows carry a label, not a description', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /<p>Quello che state costruendo/);
  assert.match(html, /<b>Notifiche<\/b><\/span>/);
  assert.match(html, /<b>Sincronizzazione<\/b><\/span>/);
  assert.match(html, /<b>Distanza<\/b><\/span>/);
  assert.match(html, /<small>LA NOSTRA SETTIMANA<\/small><b>Lavagna<\/b>/);
  assert.match(html, /Apri calendario ›/);
  assert.match(read('app.js'), /questTitle\.textContent='Questa settimana';\s*questMeta\.textContent='';/);
});
