// M10.1C — Calendar readability: ownership is TEXT (F / B / Noi) derived from
// the existing lane authority, the month grid stays compact, and the selected
// day renders the real agenda under the grid. calendar.js runs in a vm with a
// minimal DOM; the test hook is injected here, never shipped.
//
// US 1.0 (audit N10): the old full-screen calendar (its month cells, selected
// day lanes, week rows and legend) is gone; Noi (noi-v2.js) is the one
// calendar and shows whose a commitment is by colour and by name. The F / B /
// Noi text marks live on in the quick form's "Già quel giorno" list, which is
// what these runtime checks now read. Noi's own runtime: noi-1-0-calendar.test.js.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const calSrc = read('calendar.js');
const html = read('index.html');
const css = read('calendar.css');
const noi = read('noi-v2.js');
const cal = require('../calendar.js');

const FR = { id: 'f-id', display_name: 'Francesco', role: 'francesco', couple_id: 'c1' };
const BE = { id: 'b-id', display_name: 'Beatrice', role: 'beatrice', couple_id: 'c1' };
const TODAY = '2026-09-30';
const at = (h, m = 0, day = 30) => new Date(2026, 8, day, h, m).toISOString();
let seq = 0;
const timed = (owner, type, h, title, extra = {}) => ({ id: `e${++seq}`, couple_id: 'c1', entry_type: type, owner_id: type === 'shared' ? null : owner, created_by: owner, title, description: null, location: extra.location ?? null, is_all_day: false, starts_at: at(h, extra.m || 0, extra.day || 30), ends_at: at(h + 1, extra.m || 0, extra.day || 30), start_date: null, end_date: null });
const allDay = (owner, type, title, day = 30) => ({ id: `e${++seq}`, couple_id: 'c1', entry_type: type, owner_id: type === 'shared' ? null : owner, created_by: owner, title, description: null, location: null, is_all_day: true, starts_at: null, ends_at: null, start_date: `2026-09-${day}`, end_date: `2026-09-${day}` });

function makeDom() {
  const els = new Map();
  const make = (id) => {
    const classes = new Set(); const attrs = {};
    const el = {
      id, hidden: false, textContent: '', dataset: {}, value: '', checked: false,
      classList: { add: (...n) => n.forEach((x) => classes.add(x)), remove: (...n) => n.forEach((x) => classes.delete(x)), contains: (n) => classes.has(n), toggle: (n, f) => { if (f === undefined ? !classes.has(n) : f) classes.add(n); else classes.delete(n); } },
      setAttribute: (k, v) => { attrs[k] = String(v); }, getAttribute: (k) => attrs[k] ?? null,
      addEventListener() {}, focus() {}, scrollIntoView() {},
      querySelectorAll(sel) {
        if (sel !== '[data-entry-id]') return [];
        // Same buttons on every call for the same markup, so handlers survive.
        if (el._cacheKey === el.innerHTML) return el._cache;
        el._cacheKey = el.innerHTML;
        el._cache = [...String(el.innerHTML || '').matchAll(/data-entry-id="([^"]+)"/g)].map((m) => {
          const handlers = [];
          return { dataset: { entryId: m[1] }, addEventListener: (type, fn) => handlers.push(fn), click: () => handlers.forEach((fn) => fn()) };
        });
        return el._cache;
      },
      innerHTML: ''
    };
    return el;
  };
  return { get: (id) => { if (!els.has(id)) els.set(id, make(id)); return els.get(id); } };
}

function load({ role = 'francesco', profiles = [BE, FR], entries = [], selected = TODAY } = {}) {
  const dom = makeDom();
  const window = { usProfile: role === 'francesco' ? FR : BE };
  const context = vm.createContext({
    console: { info() {}, warn() {} }, window, Date, Intl, Map, Set, Promise, setTimeout: () => 0, clearTimeout() {},
    document: { getElementById: (id) => dom.get(id), addEventListener() {}, body: dom.get('body') },
    sb: {}, toast() {}, confirm: () => true, navigator: { onLine: true }, matchMedia: () => ({ matches: false })
  });
  vm.runInContext(read('calendar-domain.js'), context);
  context.UsCalendarDomain = window.UsCalendarDomain;
  const hook = "window.__t={renderFormDay,ownerMarkOf,openDetail,set:(s)=>{entries=s.entries;profiles=s.profiles;profilesById=new Map(s.profiles.map((p)=>[p.id,p]));selectedDate=s.selectedDate;},get:()=>({selectedDate,detailEntry})};\n";
  const marker = "console.info('[US Calendar] calendario condiviso attivo');";
  assert.ok(calSrc.includes(marker));
  vm.runInContext(calSrc.replace(marker, hook + marker), context);
  window.__t.set({ entries, profiles, selectedDate: selected });
  return { t: window.__t, dom, window, context };
}
// The quick form lists what that day already has, each with its owner mark.
const dayList = (h, dateISO = TODAY) => { h.t.renderFormDay(dateISO, 'create'); return h.dom.get('usCalendarFormDayEntries').innerHTML; };

// --- Ownership derivation ---------------------------------------------------

test('M10.1C: ownership marks derive from the existing lane authority — F, B, Noi', () => {
  assert.equal(cal.ownerMarkFor(cal.entryLaneRoleFor({ entry_type: 'personal' }, 'francesco'), 'Francesco'), 'F');
  assert.equal(cal.ownerMarkFor(cal.entryLaneRoleFor({ entry_type: 'personal' }, 'beatrice'), 'Beatrice'), 'B');
  assert.equal(cal.ownerMarkFor(cal.entryLaneRoleFor({ entry_type: 'shared', owner_id: null }, '')), 'Noi');
  assert.equal(cal.ownerMarkFor('other', 'Marta'), 'M', 'an unknown lane falls back to the name initial, never a wrong F/B');
  assert.equal(cal.ownerMarkFor('other', ''), '·');
  assert.doesNotMatch(calSrc, /owner_mark|ownership_field|owner_initial/, 'no second ownership field');
});

test('M10.1C: a personal Francesco event renders F, a personal Beatrice event B, a shared event Noi', () => {
  const h = load({ entries: [timed(FR.id, 'personal', 15, 'Lavoro'), timed(BE.id, 'personal', 9, 'Università'), timed(FR.id, 'shared', 21, 'Cena')] });
  const out = dayList(h);
  const row = (title) => out.match(new RegExp(`<span class="us-cal-chip(?: us-cal-chip--shared)?" aria-hidden="true">([^<]+)</span><b translate="no">${title}</b>`))?.[1];
  assert.equal(row('Lavoro'), 'F');
  assert.equal(row('Università'), 'B');
  assert.equal(row('Cena'), 'Noi');
});

test('M10.1C: ownership does not depend on colour, profile order or who is looking', () => {
  const entries = [timed(FR.id, 'personal', 15, 'Lavoro'), timed(BE.id, 'personal', 9, 'Università')];
  for (const role of ['francesco', 'beatrice']) {
    for (const profiles of [[BE, FR], [FR, BE]]) {
      const h = load({ role, profiles, entries });
      assert.equal(h.t.ownerMarkOf(entries[0]), 'F');
      assert.equal(h.t.ownerMarkOf(entries[1]), 'B');
    }
  }
  const rows = dayList(load({ entries }));
  assert.doesNotMatch(rows, /us-cal-marker|style=/, 'no colour-only marker, no inline colour');
  assert.match(rows, /<span class="us-cal-chip" aria-hidden="true">F<\/span>/);
  assert.match(css, /\.us-cal-chip\{[^}]*font-weight:800/);
});

test('M10.1C: assistive text names the owner, never only the initial', () => {
  const out = dayList(load({ entries: [timed(BE.id, 'personal', 9, 'Università'), timed(FR.id, 'shared', 21, 'Cena'), timed(FR.id, 'personal', 15, 'Palestra', { m: 30 }), allDay(FR.id, 'personal', 'Trasferta')] }));
  assert.match(out, /aria-label="Università, Beatrice, ore 9"/);
  assert.match(out, /aria-label="Cena, Insieme, ore 21"/);
  assert.match(out, /aria-label="Palestra, Francesco, ore 15:30"/);
  assert.match(out, /aria-label="Trasferta, Francesco, tutto il giorno"/);
  assert.match(out, /class="us-cal-chip[^"]*" aria-hidden="true"/, 'the initial itself is hidden from AT');
});

// --- Month grid -------------------------------------------------------------

test('M10.1C: the month cell stays compact — day number and owner dots, never event titles', () => {
  const cell = noi.match(/const days=Array\.from\(\{length:slots\}[\s\S]*?return `<div class="us-noi-v2-calendar"/)?.[0] || '';
  assert.match(cell, /<span class="us-noi-v2-day-number">\$\{n\}<\/span><span class="us-noi-v2-day-marks" aria-hidden="true">\$\{dots\}<\/span>/);
  assert.match(cell, /\['tu','partner','noi'\]\.filter\(owner=>marks\.some\(x=>ownerOf\(x\)===owner\)\)/, 'one dot per owner, in a fixed order');
  assert.doesNotMatch(cell, /\.title/, 'no titles inside a month cell');
  assert.equal(cal.monthCellMarks([]).chips.length, 0);
  assert.deepEqual(cal.monthCellMarks(['B', 'Noi', 'F']), { chips: ['B', 'F', 'Noi'], more: 0 }, 'fixed marker order');
});

test('M10.1C: the month cell label says how many moments and marks the selected day', () => {
  const cell = noi.match(/const days=Array\.from\(\{length:slots\}[\s\S]*?return `<div class="us-noi-v2-calendar"/)?.[0] || '';
  assert.match(cell, /const moments=marks\.length===1\?'1 momento':marks\.length\?`\$\{marks\.length\} momenti`:'nessun momento';/);
  assert.match(cell, /aria-pressed="\$\{active\}"/);
  assert.match(cell, /is-selected/);
});

// --- Selected day -----------------------------------------------------------

test('M10.1C: the day already in the form shows title, time and owner of each commitment', () => {
  const out = dayList(load({ entries: [timed(BE.id, 'personal', 9, 'Università', { location: 'Aula 3' }), timed(FR.id, 'personal', 15, 'Lavoro'), timed(FR.id, 'shared', 21, 'Cena')] }));
  for (const needle of ['09:00 → 10:00', 'Università', '15:00 → 16:00', 'Lavoro', '21:00 → 22:00', 'Cena', 'Già quel giorno']) assert.ok(out.includes(needle), needle);
  // Parity: the day title is the mockup's (with the year only outside the current one).
  assert.match(noi, /<h3>\$\{esc\(dayTitle\(selected\)\)\}<\/h3>/, 'the Noi day detail names the day');
});

test('M10.1C: empty lanes are never fabricated; an empty day says so once', () => {
  const h = load({ entries: [] });
  assert.equal(dayList(h), '');
  assert.equal(h.dom.get('usCalendarFormDayEntries').hidden, true);
  assert.equal((noi.match(/Nessun momento in questo giorno\./g) || []).length, 1);
});

test('M10.1C: several events stay readable — sorted all-day first then by time, titles kept whole', () => {
  assert.deepEqual(cal.sortDayEntries([{ title: 'b', is_all_day: false, starts_at: at(10) }, { title: 'a', is_all_day: true }, { title: 'c', is_all_day: false, starts_at: at(9) }]).map((e) => e.title), ['a', 'c', 'b']);
  assert.match(noi, /for\(const list of map\.values\(\)\)list\.sort\(\(a,b\)=>a\.sort\.localeCompare\(b\.sort\)\);/, 'Noi sorts each day by time');
  assert.match(css, /\.us-cal-event-title\{[^}]*overflow-wrap:anywhere/);
});

test('M10.1C: tapping an event opens the existing detail → edit flow, never a day-level edit', () => {
  const entry = timed(BE.id, 'personal', 9, 'Università');
  const h = load({ entries: [entry, timed(FR.id, 'personal', 15, 'Lavoro')] });
  dayList(h);
  const buttons = h.dom.get('usCalendarFormDayEntries').querySelectorAll('[data-entry-id]');
  assert.equal(buttons.length, 2);
  buttons.find((b) => b.dataset.entryId === entry.id).click();
  assert.equal(h.t.get().detailEntry.id, entry.id, 'the detail sheet holds that exact event');
  assert.equal(h.dom.get('usCalendarDetailSheet').classList.contains('open'), true);
  assert.match(calSrc, /\$\('usCalendarDetailEdit'\)\?\.addEventListener\('click', \(\) => \{ if \(detailEntry\) openForm\('edit', detailEntry\); \}\)/, 'Modifica goes through the existing edit form');
});

test('M10.1C: the Noi "+" is the one explicit create affordance; no floating +', () => {
  assert.match(html, /<button type="button" class="us-noi-v2-add" id="usNoiV2AddTop" data-noi-add aria-label="Aggiungi un impegno nel giorno selezionato"/);
  assert.doesNotMatch(html, /usCalendarAddBtn|us-cal-fab|id="usCalendarAddEntry"/);
  assert.doesNotMatch(calSrc, /us-cal-fab/);
});

test('M10.1C/US 1.0: quick create collects presets/title, all-day and explicit start/end; authority is unchanged', () => {
  const form = html.match(/<form class="us-cal-form" id="usCalendarForm">[\s\S]*?<\/form>/)[0];
  const inputs = [...form.matchAll(/<(?:input|textarea|select)[^>]*id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(inputs, ['usCalendarTitleInput', 'usCalendarDateInput', 'usCalendarAllDayInput', 'usCalendarStartTimeInput', 'usCalendarEndTimeInput'], 'date input is edit-only; timed entries expose a compact range');
  assert.doesNotMatch(form, /Durata|duration|Ricordamelo|reminder|<textarea|Nota/i);
  assert.match(calSrc, /setFormKind\(mode === 'edit' \? entry\.entry_type : 'personal'\);/);
  assert.match(calSrc, /const kind = ideaLink \? 'shared' : calendarKind;/);
  assert.equal(cal.withCreateAuthority({}, 'personal', { id: 'me', couple_id: 'c' }).owner_id, 'me');
  const shared = cal.withCreateAuthority({}, 'shared', { id: 'me', couple_id: 'c' });
  assert.equal(shared.entry_type, 'shared');
  assert.equal(shared.owner_id, null);
});

test('M10.1C: Da vivere still picks the day on the calendar and opens the shared linked form', () => {
  const choose = noi.match(/function chooseDay\(day,\{fromList=false[^}]*\}=\{\}\) \{[\s\S]*?\n\}/)[0];
  assert.match(choose, /if\(ideaPick\)\{\s*const picker=window\.UsCalendarLinks\?\.createForIdeaDate;/);
  assert.match(calSrc, /if \(pendingIdeaPick\) \{ openIdeaForm\(pendingIdeaPick, dateISO\); return; \}/);
  assert.match(calSrc, /setFormKind\('shared'\);/);
});

test('M10.1C: month mode always keeps a selected day inside the visible month (today, else the 1st)', () => {
  assert.match(noi, /selected=day\|\|\(monthMatch\(today\(\)\)\?today\(\):iso\(year,month,1\)\);/);
  assert.match(noi, /if\(differentMonth&&mode!=='week'\)return;/, 'a day of another month never becomes the selection in month mode');
});

// --- Week view + Tempo insieme ----------------------------------------------

test('M10.1C: the week view shows each commitment in the colour of whose it is, with the free evenings', () => {
  const week = noi.match(/function weekMarkup\(index\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(week, /chipMarkup\(day,item\)/);
  assert.match(week, /Sera libera/);
  assert.match(noi, /aria-label="\$\{esc\(item\.title\)\}, \$\{esc\(ownerLabel\(item\)\)\}, \$\{esc\(item\.time\)\}"/, 'each chip names its owner for assistive tech');
});

test('M10.1C: free time together still comes from computeFreeTogether, unchanged', () => {
  assert.match(calSrc, /UsCalendarDomain\.computeFreeTogether\(/);
  assert.equal((calSrc.match(/function computeFreeTogether/g) || []).length, 0, 'the algorithm is not re-implemented in calendar.js');
});

test('M10.1C: the legend explains the colours in text, with the real names', () => {
  const legend = noi.match(/function legendMarkup\(\)\{[\s\S]*?\n\}/)[0];
  assert.match(legend, /people\.push\(\['noi','Insieme'\]\)/);
  assert.match(legend, /'La tua persona'/);
  assert.doesNotMatch(legend, /Francesco|Beatrice/);
});

test('M10.1C: no calendar backend change — same table, same read filter, no new migration', () => {
  assert.equal((calSrc.match(/sb\.from\('calendar_entries'\)/g) || []).length >= 3, true);
  assert.match(calSrc, /UsCalendarDomain\.buildRangeOverlapFilter\(win\)/);
  const migrations = fs.readdirSync(path.join(ROOT, 'supabase/migrations_history'));
  assert.ok(!migrations.some((m) => /m10_1|m101/.test(m)), 'M10.1 adds no migration');
});

// --- M10.1 final correction: ONE shared month at every width ----------------

test('M10.1: one month grid — no per-partner months, no duplicated shared events', () => {
  assert.equal((noi.match(/function calendarMarkup\(/g) || []).length, 1);
  assert.doesNotMatch(html, /class="us-cal-grid"|usCalendarGridA|usCalendarGridB|usCalendarPaneWide|usCalendarWideHead|usCalendarGridMobile/);
  assert.doesNotMatch(calSrc + noi, /renderWideGrids|renderMobileGrid|roleFilter|usCalendarGridA/);
});

test('M10.1: F, B and Noi coexist in one day and a shared event is one row, not two', () => {
  const shared = timed(FR.id, 'shared', 21, 'Cena');
  const list = [timed(FR.id, 'personal', 15, 'Lavoro'), timed(BE.id, 'personal', 9, 'Università'), shared];
  const out = dayList(load({ entries: list }));
  assert.deepEqual([...out.matchAll(/us-cal-chip(?: us-cal-chip--shared)?" aria-hidden="true">([^<]+)</g)].map((m) => m[1]).sort(), ['B', 'F', 'Noi']);
  assert.equal((out.match(new RegExp(`data-entry-id="${shared.id}"`, 'g')) || []).length, 1);
});
