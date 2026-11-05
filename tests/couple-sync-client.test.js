// Couple sync V1, the app side (audit 05/11/2026, punto 2): the server moves
// public.couple_sync when something of the couple is deleted, and on every
// calendar change; app.js listens to it on the one Realtime channel and each
// kind refreshes what shows it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('couple_sync has a Realtime channel of its own, closed with the others', () => {
  const app = read('app.js');
  const from = app.indexOf('function startUsRealtime(){');
  const start = app.slice(from, app.indexOf('window.startUsRealtime=startUsRealtime;', from));
  const main = start.slice(0, start.indexOf('.subscribe();'));
  assert.doesNotMatch(main, /couple_sync/, 'a missing table must never break the main channel (Ti penso, daily, Ricordi)');
  assert.match(start, /usStopCoupleSync\(\);\n {2}usCoupleSyncChannel=sb\.channel\(`us-sync-\$\{userId\}`\)\n {4}\.on\('postgres_changes',\{event:'\*',schema:'public',table:'couple_sync',filter:`couple_id=eq\.\$\{coupleId\}`\},payload=>usOnCoupleSync\(payload\)\)\n {4}\.subscribe\(\);/);
  assert.match(app, /function usStopCoupleSync\(\)\{if\(usCoupleSyncChannel\)\{sb\.removeChannel\(usCoupleSyncChannel\);usCoupleSyncChannel=null;\}\}/);
  // Both sign-out cleanups close it, next to the main channel.
  assert.equal((app.match(/if\(usRealtimeChannel\)\{sb\.removeChannel\(usRealtimeChannel\);usRealtimeChannel=null;\}\n\s+window\.usStopCoupleSync\?\.\(\);/g) || []).length, 2);
});

test('each kind refreshes what shows it', () => {
  const app = read('app.js');
  const from = app.indexOf('function usOnCoupleSync(payload){');
  const source = app.slice(from, app.indexOf('function startUsRealtime(){', from));
  const calls = [];
  const context = vm.createContext({
    scheduleUsRealtimeRefresh: (kind) => calls.push(`refresh:${kind}`),
    window: {
      UsCoupleNotes: { refresh: () => calls.push('notes') },
      usRefreshStories: () => calls.push('stories'),
    },
  });
  vm.runInContext(source, context);
  for (const kind of ['moments', 'events', 'calendar', 'notes', 'stories', 'unknown']) context.usOnCoupleSync({ new: { kind } });
  context.usOnCoupleSync({});
  assert.deepEqual(calls, ['refresh:moments', 'refresh:events', 'refresh:calendar', 'notes', 'stories']);
});

test('a calendar signal refreshes Noi when it is open and Oggi\'s next commitment', () => {
  const app = read('app.js');
  assert.match(app, /if\(kind==='calendar'\)\{if\(active==='bond'\)window\.USNoiV2\?\.refresh\?\.\(\);window\.UsTodayPriority\?\.refresh\?\.\(\{freshEvents:true\}\);return;\}/);
  assert.match(read('noi-v2.js'), /refresh:\(\)=>refresh\(\{force:true\}\)/, 'Noi exposes its refresh');
});

test('stories and post-it expose their refresh; an open post-it the partner removed says so after the reload', () => {
  assert.match(read('stories.js'), /window\.usRefreshStories = \(\) => refreshStories\(\);/);
  const notes = read('couple-notes.js');
  assert.match(notes, /api\.refresh=\(\)=>ensure\(\{force:true\}\)/);
  const load = notes.slice(notes.indexOf('async function load(){'), notes.indexOf('function ensure('));
  assert.match(load, /const before=new Set\(notes\.map\(n=>n\.id\)\);/);
  assert.match(load, /if\(editing\?\.id&&before\.has\(editing\.id\)&&!notes\.some\(n=>n\.id===editing\.id\)\)\{editing\.id=null;paintMeta\(\);notice\('L’altra persona ha staccato questo post-it\. Se continui a scrivere, lo salvo di nuovo\.'\);\}/);
});
