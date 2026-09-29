// M7C — Da vivere -> Calendar. Two layers:
// 1. Behavior of the M7C migration against a real embedded Postgres (pglite),
//    on top of the real M7A migration: "togli dal calendario" and the
//    BEFORE DELETE unschedule trigger on calendar_entries.
// 2. UI contract: the Calendar form stays the only date/time/reminder
//    authority, the created entry is always shared, the link is written only
//    by Da vivere with stale-race guards, and a failed link rolls back the
//    just-created entry instead of leaving an orphan duplicate.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const M7A = 'supabase/migrations/20260929121350_m7a_da_vivere_bucket_items_domain.sql';
const M7C = 'supabase/migrations/20260929190126_m7c_da_vivere_calendar_unschedule.sql';
const uuid = () => crypto.randomUUID();

const FIXTURE_SQL = `
  create role authenticated;
  create role anon;
  grant usage on schema public to authenticated, anon;
  create schema auth;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  create schema private;
  create table public.profiles (id uuid primary key, couple_id uuid not null);
  grant select on public.profiles to authenticated;
  create table public.calendar_entries (
    id uuid primary key default gen_random_uuid(),
    couple_id uuid not null,
    entry_type text not null check (entry_type in ('personal', 'shared'))
  );
  alter table public.calendar_entries enable row level security;
  create policy calendar_entries_all on public.calendar_entries for all
    using (couple_id = (select p.couple_id from public.profiles p where p.id = auth.uid()))
    with check (couple_id = (select p.couple_id from public.profiles p where p.id = auth.uid()));
  grant select, insert, update, delete on public.calendar_entries to authenticated;
  create table public.bucket_items (
    id uuid primary key default gen_random_uuid(),
    couple_id uuid not null,
    created_by uuid not null,
    title text not null,
    completed boolean not null default false,
    completed_at timestamptz,
    created_at timestamptz not null default now()
  );
  alter table public.bucket_items enable row level security;
  create policy bucket_items_all on public.bucket_items for all
    using (couple_id = (select p.couple_id from public.profiles p where p.id = auth.uid()))
    with check (couple_id = (select p.couple_id from public.profiles p where p.id = auth.uid()));
`;

let db;
test.before(async () => {
  db = new PGlite();
  await db.exec(FIXTURE_SQL);
  await db.exec(read(M7A));
  await db.exec(read(M7C));
});
test.after(async () => { await db.close(); });

async function asUser(uid) {
  await db.exec('set role authenticated');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
}
async function asSuperuser() {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
}
async function couple() {
  const coupleId = uuid(); const a = uuid(); const b = uuid();
  await asSuperuser();
  await db.query('insert into public.profiles (id, couple_id) values ($1, $2), ($3, $2)', [a, coupleId, b]);
  return { coupleId, a, b };
}
async function scheduledIdea({ coupleId, a }) {
  await asUser(a);
  const item = uuid(); const entry = uuid();
  await db.query(`insert into public.calendar_entries (id, couple_id, entry_type) values ($1, $2, 'shared')`, [entry, coupleId]);
  await db.query('insert into public.bucket_items (id, couple_id, created_by, title) values ($1, $2, $3, $4)', [item, coupleId, a, 'Lisbona']);
  await db.query(`update public.bucket_items set status = 'scheduled', calendar_entry_id = $2 where id = $1`, [item, entry]);
  return { item, entry };
}
const row = async (id) => (await db.query('select status, calendar_entry_id, completed from public.bucket_items where id = $1', [id])).rows[0];

test('M7C backend: deleting the linked shared event from Calendar brings the idea back to the list, without a date', async () => {
  const c = await couple();
  const { item, entry } = await scheduledIdea(c);
  await asUser(c.b);
  await db.query('delete from public.calendar_entries where id = $1', [entry]);
  const r = await row(item);
  assert.equal(r.status, 'idea');
  assert.equal(r.calendar_entry_id, null);
  assert.equal(r.completed, false);
});

test('M7C backend: a lived experience keeps its Calendar event — the FK still refuses the delete (history preserved)', async () => {
  const c = await couple();
  const { item, entry } = await scheduledIdea(c);
  await db.query(`update public.bucket_items set status = 'lived' where id = $1`, [item]);
  await assert.rejects(db.query('delete from public.calendar_entries where id = $1', [entry]), (e) => e.code === '23001');
  const r = await row(item);
  assert.equal(r.status, 'lived');
  assert.equal(r.calendar_entry_id, entry);
});

test('M7C backend: scheduled -> idea is only allowed while unlinking; every other M7A rule still holds', async () => {
  const c = await couple();
  const { item } = await scheduledIdea(c);
  await assert.rejects(db.query(`update public.bucket_items set status = 'idea' where id = $1`, [item]), /bucket_items_invalid_status_transition|bucket_items_status_calendar_link_check/);
  await db.query(`update public.bucket_items set status = 'idea', calendar_entry_id = null where id = $1`, [item]);
  assert.equal((await row(item)).status, 'idea');
  await db.query(`update public.bucket_items set status = 'archived' where id = $1`, [item]);
  await assert.rejects(db.query(`update public.bucket_items set status = 'idea' where id = $1`, [item]), /bucket_items_invalid_status_transition/);
});

test('M7C backend: a personal or other-couple event can still never be linked', async () => {
  const c = await couple();
  const other = await couple();
  await asUser(c.a);
  const item = uuid(); const personal = uuid();
  await db.query(`insert into public.calendar_entries (id, couple_id, entry_type) values ($1, $2, 'personal')`, [personal, c.coupleId]);
  await db.query('insert into public.bucket_items (id, couple_id, created_by, title) values ($1, $2, $3, $4)', [item, c.coupleId, c.a, 'x']);
  await assert.rejects(db.query(`update public.bucket_items set status = 'scheduled', calendar_entry_id = $2 where id = $1`, [item, personal]), /not_shared/);
  await asUser(other.a);
  const foreign = uuid();
  await db.query(`insert into public.calendar_entries (id, couple_id, entry_type) values ($1, $2, 'shared')`, [foreign, other.coupleId]);
  await asUser(c.a);
  await assert.rejects(db.query(`update public.bucket_items set status = 'scheduled', calendar_entry_id = $2 where id = $1`, [item, foreign]), /cross_couple/);
});

test('M7C migration: additive, forward-only, never touches shared_events or other domains', () => {
  const sql = read(M7C).replace(/--.*$/gm, '');
  assert.doesNotMatch(sql, /shared_events|moments|moment_photos|drop table|drop column|truncate|alter table/i);
  assert.match(sql, /create trigger calendar_entries_unschedule_bucket_items\s+before delete on public\.calendar_entries/);
  const files = fs.readdirSync(path.join(ROOT, 'supabase/migrations')).sort();
  assert.ok(files.indexOf(path.basename(M7C)) > files.indexOf(path.basename(M7A)));
});

// ---------------------------------------------------------------------------
// UI contract
const calendar = () => read('calendar.js');
const app = () => read('app.js');
const daVivereBlock = () => app().match(/\/\/ ===== M7B[\s\S]*?\/\/ ===== Ti penso =====/)?.[0] || '';

test('M7C UI: Da vivere has no date/time editor of its own — "Metti in calendario" opens the Calendar form', () => {
  const noi = read('index.html').match(/<section class="noi-idea-section"[\s\S]*?<\/section>\s*<\/section>/)?.[0] || '';
  assert.match(noi, /id="noiIdeaDetailSchedule"[^>]*hidden>Metti in calendario</);
  assert.match(noi, /id="noiIdeaDetailOpenCalendar"[^>]*>Apri nel calendario</);
  assert.doesNotMatch(noi, /type="date"|type="time"|datetime-local/);
  assert.match(daVivereBlock(), /window\.UsCalendarLinks\?\.openForIdea/);
  assert.match(daVivereBlock(), /window\.UsCalendarLinks\?\.openEntry\?\.\(item\.calendar_entry_id\)/);
});

test('M7C UI: the entry created from an idea is always shared, and never touches shared_events', () => {
  const src = calendar();
  assert.match(src, /const kind = ideaLink \? 'shared' : calendarKind;/);
  // M9C: the idea first becomes a pick (banner), then the tapped day opens the shared form.
  assert.match(src, /pendingIdeaPick = \{ bucketItemId: idea\.id, title: idea\.title \|\| '', note: idea\.note \|\| null, \.\.\.identity \};/);
  assert.match(src, /if \(pendingIdeaPick\) \{ openIdeaForm\(pendingIdeaPick, dateISO\); return; \}/);
  assert.match(src, /pendingIdeaLink = \{ bucketItemId: pick\.bucketItemId, userId: pick\.userId, coupleId: pick\.coupleId, note: pick\.note \};\s*calendarKind = 'shared';/);
  assert.doesNotMatch(src, /shared_events/);
  assert.doesNotMatch(src, /from\('bucket_items'\)/, 'Calendar never writes bucket_items: Da vivere owns the link');
});

test('M7C UI: the link write is guarded against stale races and is the only scheduled write', () => {
  const block = daVivereBlock();
  assert.match(block, /\.update\(\{status:'scheduled',calendar_entry_id:entryId\}\)\s*\.eq\('id',id\)\.eq\('couple_id',coupleId\)\.eq\('status','idea'\)\.is\('calendar_entry_id',null\)/);
  assert.equal([...block.matchAll(/\.update\(\{status:'scheduled'/g)].length, 1);
  assert.match(block, /if\(!data\)return \{ok:false,reason:'stale'\};/);
});

test('M7C UI: a failed link deletes the just-created Calendar entry (no orphan duplicate) and a linked delete is explained', () => {
  const src = calendar();
  const fn = src.match(/async function linkCreatedEntryToIdea\([\s\S]*?\n\}/)?.[0] || '';
  assert.match(fn, /if \(outcome\?\.ok\) return \{ ok: true \};/);
  assert.match(fn, /sb\.from\('calendar_entries'\)\.delete\(\)\.eq\('id', entryId\)/);
  assert.match(src, /error\?\.code === '23001' \|\| error\?\.code === '23503'\)\) \{ toast\('È collegato a Da vivere: resta nel calendario\.'\); return; \}/);
  assert.match(src, /toast\('Impegno eliminato'\);\s*window\.hydrateNoiIdeas\?\.\(\);/);
});

test('M7C UI: "quando" in Da vivere is read from calendar_entries through the Calendar module, never copied', () => {
  const block = daVivereBlock();
  const tables = [...block.matchAll(/sb\.from\('([a-z_]+)'\)/g)].map((m) => m[1]);
  assert.ok(tables.every((t) => t === 'bucket_items'));
  assert.match(block, /window\.UsCalendarLinks\?\.getEntriesByIds/);
  assert.match(calendar(), /\.from\('calendar_entries'\)\s*\.select\('id,title,entry_type,is_all_day,starts_at,ends_at,start_date,end_date'\)\s*\.eq\('couple_id', window\.usProfile\.couple_id\)\s*\.in\('id', unique\)/);
});

test('M7C runtime: linkCalendarEntry updates local state on success and reports stale on 0 rows', async () => {
  const els = new Map();
  const el = (id) => { if (!els.has(id)) els.set(id, { id, hidden: false, textContent: '', innerHTML: '', value: '', dataset: {}, setAttribute() {}, addEventListener() {}, focus() {}, reset() {} }); return els.get(id); };
  const responses = [];
  const calls = [];
  const builder = () => {
    const b = { calls: [] };
    for (const m of ['select', 'eq', 'neq', 'order', 'insert', 'update', 'maybeSingle', 'is']) b[m] = (...args) => { calls.push([m, ...args]); return b; };
    b.then = (ok, ko) => Promise.resolve(responses.shift()).then(ok, ko);
    return b;
  };
  const window = { usProfile: { id: 'u1', couple_id: 'c1' } };
  window.window = window;
  const context = { window, document: { getElementById: el, querySelector: () => ({ hidden: false, dataset: {} }) }, sb: { from: () => builder() }, toast() {}, escapeHtml: (s) => String(s), console, setTimeout: () => 0, scrollTo() {} };
  vm.createContext(context);
  vm.runInContext(daVivereBlock(), context);
  responses.push({ data: [{ id: 'i1', title: 'Lisbona', note: null, link_url: null, status: 'idea', calendar_entry_id: null, created_at: 'x' }], error: null });
  await window.hydrateNoiIdeas();
  responses.push({ data: { id: 'i1', status: 'scheduled', calendar_entry_id: 'e1' }, error: null });
  assert.deepEqual({ ...(await window.UsDaVivere.linkCalendarEntry('i1', 'e1')) }, { ok: true });
  assert.match(el('noiIdeaList').innerHTML, /In calendario/);
  responses.push({ data: null, error: null });
  assert.deepEqual({ ...(await window.UsDaVivere.linkCalendarEntry('i1', 'e2')) }, { ok: false, reason: 'stale' });
});
