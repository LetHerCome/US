'use strict';
// US 1.0 language on the server: the phone tells set_my_locale once per person
// and language, and English readers ask for the computed English columns with
// a plain Italian read as the fallback.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const between = (start, end) => {
  const from = app.indexOf(start);
  assert.notEqual(from, -1, start);
  const to = app.indexOf(end, from);
  assert.notEqual(to, -1, end);
  return app.slice(from, to);
};
const END = ':row)}:result;';
const fnSource = between('async function usSyncContentLocale(profile){', END) + END;

function load({ locale, rpc, store = new Map(), current }) {
  const window = { UsI18n: locale ? { locale } : undefined, usProfile: current };
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const sb = { rpc };
  return new Function('window', 'localStorage', 'sb', `${fnSource}; return {usSyncContentLocale, usReadLocalized, usLocalizedTitles};`)(window, localStorage, sb);
}

test('set_my_locale is sent once per person and language, never cached on failure', async () => {
  const calls = [];
  const store = new Map();
  const profile = { id: 'p1' };
  let fail = true;
  const rpc = async (name, args) => { calls.push([name, args]); return fail ? { error: { code: 'PGRST202' } } : { error: null }; };
  let api = load({ locale: 'en', rpc, store, current: profile });
  await api.usSyncContentLocale(profile);
  assert.deepEqual(calls, [['set_my_locale', { p_locale: 'en' }]]);
  assert.equal(store.size, 0, 'a database without the function is retried next launch');
  fail = false;
  await api.usSyncContentLocale(profile);
  await api.usSyncContentLocale(profile);
  assert.equal(calls.length, 2);
  api = load({ locale: 'it', rpc, store, current: profile });
  await api.usSyncContentLocale(profile);
  assert.deepEqual(calls.at(-1), ['set_my_locale', { p_locale: 'it' }]);
  await load({ locale: undefined, rpc, store, current: profile }).usSyncContentLocale(profile);
  assert.equal(calls.length, 3);
});

test('English readers get the localized column, with the Italian read as fallback', async () => {
  const asked = [];
  const query = (fail) => async (columns) => { asked.push(columns); return fail && columns.includes('localized') ? { error: { code: '42703' } } : { data: [columns], error: null }; };
  const it = load({ locale: 'it', rpc: async () => ({}) });
  assert.deepEqual((await it.usReadLocalized(query(false), 'id,title', 'title_localized')).data, ['id,title']);
  const en = load({ locale: 'en', rpc: async () => ({}) });
  assert.deepEqual((await en.usReadLocalized(query(false), 'id,title', 'title_localized')).data, ['id,title,title_localized']);
  assert.deepEqual((await en.usReadLocalized(query(true), 'id,title', 'title_localized')).data, ['id,title']);
  assert.deepEqual(asked, ['id,title', 'id,title,title_localized', 'id,title,title_localized', 'id,title']);
  assert.match(app, /usRunWhenIdle\(\(\)=>usSyncContentLocale\(profile\),1600\);/);
});

test('mission titles use the English title when the server sends one', () => {
  const { usLocalizedTitles } = load({ locale: 'en', rpc: async () => ({}) });
  assert.deepEqual(usLocalizedTitles({ data: [{ id: 1, title: 'Cena', title_localized: 'Dinner' }, { id: 2, title: 'Gita' }], error: null }).data,
    [{ id: 1, title: 'Dinner', title_localized: 'Dinner' }, { id: 2, title: 'Gita' }]);
  const failed = { data: null, error: { code: 'x' } };
  assert.equal(usLocalizedTitles(failed), failed);
  assert.equal((app.match(/\.then\(usLocalizedTitles\)/g) || []).length, 3, 'the board, the recent weeks and Sintonia history');
});
