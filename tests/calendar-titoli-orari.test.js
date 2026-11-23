// Nuovo impegno (founder, 04/11/2026): «+» adds a quick title of your own
// next to Lavoro, Università and Uscita; Inizio and Fine start empty (00:00
// as a hint, never 9 → 10) and the colon appears by itself while typing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const cal = require('../calendar.js');

test('typing a time: the colon appears by itself', () => {
  const cases = { '9': '09:', '1': '1', '18': '18:', '2.': '02:', '2.00': '02:00', '2,3': '02:3', '09:3': '09:3', '09:30': '09:30', '930': '09:30', '1845': '18:45', '25': '02:5', '00': '00:', '': '' };
  for (const [typed, shown] of Object.entries(cases)) assert.equal(cal.maskClockTyping(typed), shown, typed);
  // What the mask leaves is read by the same rule as before when you leave the field.
  assert.equal(cal.normalizeQuickTime(cal.maskClockTyping('2.00')), '02:00');
  assert.equal(cal.normalizeQuickTime(cal.maskClockTyping('9')), '09:00');
});

test('quick titles: yours after the three of US, no copies, at most eight', () => {
  assert.deepEqual([...cal.CALENDAR_BUILTIN_PRESETS], ['Lavoro', 'Università', 'Uscita']);
  assert.deepEqual(cal.addCalendarPreset([], '  Palestra  '), ['Palestra']);
  assert.deepEqual(cal.addCalendarPreset(['Palestra'], 'palestra'), ['Palestra'], 'never twice');
  assert.deepEqual(cal.addCalendarPreset([], 'LAVORO'), [], 'never a copy of one of US');
  assert.deepEqual(cal.addCalendarPreset(['Palestra'], '   '), ['Palestra']);
  assert.equal(cal.addCalendarPreset([], 'x'.repeat(40))[0].length, 30);
  assert.equal(cal.addCalendarPreset(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 'Nuovo').length, 8);
  assert.deepEqual(cal.removeCalendarPreset(['Palestra', 'Cena'], 'Palestra'), ['Cena']);
});

test('the form: «+» and its field, 00:00 as the hint, no hour filled for you', () => {
  const html = read('index.html');
  assert.match(html, /<div class="us-cal-presets" id="usCalendarPresets" role="group" aria-label="Titoli rapidi">[\s\S]*?data-us-calendar-preset="Uscita"[\s\S]*?id="usCalendarPresetAdd" aria-label="Aggiungi un titolo rapido"[\s\S]*?id="usCalendarPresetNew" hidden><input id="usCalendarPresetNewInput"/);
  for (const id of ['usCalendarStartTimeInput', 'usCalendarEndTimeInput']) {
    assert.match(html, new RegExp(`id="${id}"[^>]*inputmode="numeric"[^>]*placeholder="00:00"`), id);
  }
  const source = read('calendar.js');
  assert.doesNotMatch(source, /fillDefaultEndFromStart|end\.value = addClockMinutes/, 'Fine is never filled one hour after Inizio');
  assert.match(source, /\$\(id\)\?\.addEventListener\('input', maskTimeField\);/);
  assert.match(source, /if \(!input \|\| String\(event\.inputType \|\| ''\)\.startsWith\('delete'\)\) return;/, 'deleting is never re-masked');
  assert.match(source, /us:calendar:presets:v1:\$\{window\.usProfile\.id\}/, 'kept on this phone, per person');
  assert.match(source, /if \(typeof input\.selectionStart === 'number' && input\.selectionStart < input\.value\.length\) return;/, 'typing in the middle is not re-masked');
  assert.match(source, /press\.timer = setTimeout\(\(\) => \{ press\.fired = true; press\.firedAt = Date\.now\(\); forgetPreset\(button\.dataset\.usCalendarPreset\); \}, 550\);/);
  assert.match(source, /const longPress = presetPress\?\.fired && presetPress\.button === button && Date\.now\(\) - presetPress\.firedAt < 1000;/, 'only the click ending the long press is swallowed');
  assert.match(source, /title: `Togliere «\$\{title\}»\?`/);
});
