const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const cal = require('../calendar.js');
const domain = require('../calendar-domain.js');

const html = () => read('index.html');
const js = () => read('calendar.js');
const css = () => read('calendar.css');
const worker = () => read('supabase/functions/calendar-reminders-worker/index.ts');
const migration = () => read('supabase/migrations_history/20260928210000_m6d_calendar_reminders.sql');
const config = () => read('supabase/config.toml');

// (1) M9C: reminder configuration leaves the quick form; the domain stays.
test('M6D (1): the quick form no longer configures reminders; the domain helpers remain', () => {
  const form = html().match(/<form class="us-cal-form"[\s\S]*?<\/form>/)?.[0] || '';
  assert.doesNotMatch(form, /Ricordamelo|usCalendarReminderField|usCalendarReminderTargetPicker|data-us-cal-reminder/);
  assert.deepEqual(cal.REMINDER_OPTIONS.map((o) => o.label), ['Nessuno', '10 min prima', '30 min prima', '1 ora prima', '1 giorno prima']);
});

// (2) all-day: solo Nessuno/1 giorno prima — le altre opzioni spariscono.
test('M6D (2): all-day events only allow Nessuno or 1 giorno prima (10m/30m/1h hidden)', () => {
  assert.deepEqual(cal.reminderOptionsFor(true).map((o) => o.label), ['Nessuno', '1 giorno prima']);
  assert.equal(cal.reminderOptionsFor(false).length, 5, 'timed keeps all 5 options');
  assert.equal(cal.reminderOffsetAllowed(10, true), false);
  assert.equal(cal.reminderOffsetAllowed(1440, true), true);
  // server-side: il check constraint impone lo stesso rule-set
  assert.match(migration(), /calendar_reminders_allday_offset_check/);
});

// (3) Ricorda a: Me/Partner; Entrambi solo shared — una riga per destinatario.
test('M6D (3): Entrambi renders only for shared events; rows resolve per-recipient', () => {
  assert.equal(cal.reminderTargetAllowed('both', 'shared'), true);
  assert.equal(cal.reminderTargetAllowed('both', 'personal'), false);
  assert.deepEqual(cal.reminderRowsFor({ entryType: 'shared', target: 'both', requesterId: 'me1', partnerId: 'p1', offsetMinutes: 30 }), [
    { recipient_id: 'me1', offset_minutes: 30 },
    { recipient_id: 'p1', offset_minutes: 30 }
  ]);
  assert.deepEqual(cal.reminderRowsFor({ entryType: 'shared', target: 'partner', requesterId: 'me1', partnerId: 'p1', offsetMinutes: 60 }), [
    { recipient_id: 'p1', offset_minutes: 60 }
  ]);
  assert.deepEqual(cal.reminderRowsFor({ entryType: 'personal', target: 'both', requesterId: 'me1', partnerId: 'p1', offsetMinutes: 30 }), [],
    'personal + Entrambi produces no rows (UI hides it; helper refuses it)');
  // niente hardcoded names nel Calendario
  assert.doesNotMatch(js(), /['"]Francesco['"]|['"]Beatrice['"]/);
});

// (4) timing: il worker calcola il momento dagli eventi reali.
test('M6D (4): the worker computes due-time from real entries (timed offset; all-day 18:00 day before)', () => {
  assert.match(worker(), /nowMs >= startsAt - offsetMinutes \* 60000/);
  assert.match(worker(), /ALLDAY_REMINDER_HOUR = 18/);
  assert.match(worker(), /Europe\/Rome/);
  assert.match(worker(), /function dueFor/);
  assert.doesNotMatch(worker(), /notify_at/, 'no stored derived timestamp: due-time is computed, not copied');
});

// (5) no duplicate: unique constraint + push_event_log dedupe + sent_at gate.
test('M6D (5): triple no-duplicate guard — unique constraint, event-log dedupe, sent_at gate', () => {
  assert.match(migration(), /calendar_reminders_entry_recipient_offset_unique\s+unique \(entry_id, recipient_id, offset_minutes\)/);
  assert.match(worker(), /calendar-reminder:\$\{reminder\.id\}/);
  // Native Notifications V1: the 23505 claim lives in the shared dispatcher the worker delegates to.
  assert.match(worker(), /dedupeKey: `calendar-reminder:\$\{reminder\.id\}`/);
  assert.match(worker(), /if \(result\.deduplicated\)/);
  assert.match(read('supabase/functions/_shared/notification-core.mjs'), /claimError\?\.code === '23505'/);
  assert.match(worker(), /\.is\("sent_at", null\)/);
  assert.match(migration(), /create index calendar_reminders_pending_idx[\s\S]*where sent_at is null/);
});

// (6) delete cascades; M9C: saving through the quick form never deletes or rewrites reminders.
// US 1.0 (N8): reminders are hidden until 1.1, so the Calendar UI does not even read them.
test('M6D (6): entry delete cascades to reminders; the quick form never deletes or re-syncs them', () => {
  assert.match(migration(), /entry_id uuid not null references public\.calendar_entries\(id\) on delete cascade/);
  assert.doesNotMatch(js(), /syncEntryReminders/);
  assert.doesNotMatch(js(), /\.from\('calendar_reminders'\)/, 'the Calendar UI does not touch reminders in 1.0');
  // M7C: a create from Da vivere is forced shared; every other create keeps calendarKind.
  assert.match(js(), /const kind = ideaLink \? 'shared' : calendarKind;/);
  assert.match(js(), /const result = await sb\.from\('calendar_entries'\)\.insert\(withCreateAuthority\(payload, kind, window\.usProfile\)\)\.select\('id'\);/);
});

// (7) authorization: personal owner-only, shared couple, recipient in couple, isolation.
test('M6D (7): RLS — insert requires requester auth + entry authority; recipient must be in couple', () => {
  assert.match(migration(), /requested_by = auth\.uid\(\)/);
  assert.match(migration(), /\(e\.entry_type = 'shared' or e\.owner_id = auth\.uid\(\)\)/, 'personal reminders only by the owner; shared by any couple member');
  assert.match(migration(), /where p\.id = recipient_id and p\.couple_id = couple_id/);
  assert.match(migration(), /calendar_reminders_update_requester[\s\S]*requested_by = auth\.uid\(\)/);
  assert.match(migration(), /entry_id uuid not null references public\.calendar_entries\(id\)/);
  assert.match(migration(), /couple_id uuid not null references public\.couples\(id\)/);
  // worker: nessun bypass client — sent_at non è scrivibile da policy utente
  assert.match(migration(), /calendar_reminders_update_requester[\s\S]*?requested_by = auth\.uid\(\)/, 'update stays requester-only (recipient can delete, never modify)');
  assert.match(migration(), /or recipient_id = auth\.uid\(\)/, 'the RECIPIENT can delete a reminder addressed to them');
});

// (8) all-day entries: il worker usa start_date, non starts_at (mai misto).
test('M6D (8): all-day reminders derive from start_date (the M6A all-day rule)', () => {
  const w = worker();
  const allDayBranch = w.match(/if \(entry\.is_all_day\) \{[\s\S]*?\n  \}/)?.[0] || '';
  assert.match(allDayBranch, /entry\.start_date/);
  assert.doesNotMatch(allDayBranch, /starts_at/);
});

// (9) US 1.0 (N8): "Ricordamelo" is hidden until 1.1; the server side is untouched.
test('M6D (9): Calendar regression — the entry detail has no reminders in 1.0; the worker config stays', () => {
  assert.doesNotMatch(html(), /id="usCalendarDetailReminders"|Ricordamelo/);
  assert.doesNotMatch(js(), /renderDetailReminders|Ricordamelo/);
  assert.match(config(), /\[functions\.calendar-reminders-worker\]/);
  assert.match(config(), /verify_jwt = false/);
});

// (10) worker auth: chiave cron DEDICATA nel vault, nessun secret nel repo.
test('M6D (10): the cron key is vault-only and dedicated — the worker reads it via SECURITY DEFINER RPC', () => {
  assert.match(worker(), /get_internal_calendar_reminders_cron_key/);
  assert.doesNotMatch(worker(), /CALENDAR_REMINDERS_CRON_SECRET/, 'no Edge env secret: the vault is the single source');
  assert.doesNotMatch(worker(), /monthiversary/i, 'never shares another job key');
  const migrationSql = migration();
  assert.match(migrationSql, /create or replace function public\.get_internal_calendar_reminders_cron_key\(\)/);
  assert.match(migrationSql, /security definer/);
  assert.match(migrationSql, /grant execute on function public\.get_internal_calendar_reminders_cron_key\(\) to service_role/);
  assert.match(migrationSql, /vault\.create_secret/, 'the key is generated by the database itself');
  assert.match(migrationSql, /us_calendar_reminders_cron_key/);
  assert.doesNotMatch(migrationSql, /us_monthiversary_cron_key/);
  assert.match(migrationSql, /cron\.schedule\([\s\S]*us-calendar-reminders-dispatch/, 'the migration registers the pg_cron job');
  const readme = read('supabase/functions/calendar-reminders-worker/README.md');
  assert.match(readme, /us_calendar_reminders_cron_key/);
  assert.doesNotMatch(readme, /monthiversary/i);
  // nessun valore letterale di secret
  assert.doesNotMatch(readme, /x-us-cron-key','[A-Za-z0-9_\-]{16,}/);
});

// (11) copy: il testo vive in un modulo condiviso che il worker importa.
// Le Edge Function girano in UTC: i test girano in UTC anche loro, così
// un'ora presa dal fuso della macchina si vede subito.
const copyModule = () => import('../supabase/functions/_shared/calendar-reminder-copy.mjs');
const inUtc = async (fn) => {
  const previous = process.env.TZ;
  process.env.TZ = 'UTC';
  try { return await fn(); } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
};

test('M6D (11): the worker builds the text from the shared copy module, never from the server clock', () => {
  assert.match(worker(), /import \{ reminderBody \} from "\.\.\/_shared\/calendar-reminder-copy\.mjs";/);
  assert.doesNotMatch(worker(), /getHours|getMinutes/);
  assert.doesNotMatch(read('supabase/functions/_shared/calendar-reminder-copy.mjs'), /getHours|getMinutes/);
  assert.match(worker(), /La tua persona/, 'fallback name, never a hardcoded real name');
  assert.doesNotMatch(js(), /ti ricorda/, 'the Calendar UI keeps no second copy of the text');
});

test('M6D (11b): partner copy shows the Rome time, summer and winter', () => inUtc(async () => {
  const { reminderBody } = await copyModule();
  // 10/07 alle 20:30 a Roma (ora legale, UTC+2), promemoria un'ora prima.
  assert.equal(reminderBody({
    selfRecipient: false, requesterName: 'Francesco', title: 'Cena', allDay: false,
    startsAt: '2026-07-10T18:30:00.000Z', startDate: null, offsetMinutes: 60,
    nowMs: Date.parse('2026-07-10T17:30:00.000Z')
  }), 'Francesco ti ricorda: Cena alle 20:30 ♡');
  // 20/11 alle 20:30 a Roma (ora solare, UTC+1), 30 minuti prima.
  assert.equal(reminderBody({
    selfRecipient: false, requesterName: 'Francesco', title: 'Cena', allDay: false,
    startsAt: '2026-11-20T19:30:00.000Z', startDate: null, offsetMinutes: 30,
    nowMs: Date.parse('2026-11-20T19:00:00.000Z')
  }), 'Francesco ti ricorda: Cena alle 20:30 ♡');
}));

test('M6D (11c): partner copy says «domani» when the event falls on the next day in Rome', () => inUtc(async () => {
  const { reminderBody } = await copyModule();
  // «1 giorno prima»: arriva il 19/11 alle 20:30 per la cena del 20/11 alle 20:30.
  assert.equal(reminderBody({
    selfRecipient: false, requesterName: 'Beatrice', title: 'Cena', allDay: false,
    startsAt: '2026-11-20T19:30:00.000Z', startDate: null, offsetMinutes: 1440,
    nowMs: Date.parse('2026-11-19T19:30:00.000Z')
  }), 'Beatrice ti ricorda: Cena, domani alle 20:30 ♡');
  // Tutto il giorno: arriva alle 18:00 della sera prima, senza ora.
  assert.equal(reminderBody({
    selfRecipient: false, requesterName: 'Beatrice', title: 'Compleanno di mamma', allDay: true,
    startsAt: null, startDate: '2026-11-20', offsetMinutes: 1440,
    nowMs: Date.parse('2026-11-19T17:00:00.000Z')
  }), 'Beatrice ti ricorda: Compleanno di mamma, domani ♡');
  // Un'ora prima, a cavallo della mezzanotte di Roma (in UTC è ancora il 20/11 per entrambi).
  assert.equal(reminderBody({
    selfRecipient: false, requesterName: 'Francesco', title: 'Pizza', allDay: false,
    startsAt: '2026-11-20T23:15:00.000Z', startDate: null, offsetMinutes: 60,
    nowMs: Date.parse('2026-11-20T22:15:00.000Z')
  }), 'Francesco ti ricorda: Pizza, domani alle 00:15 ♡');
}));

test('M6D (11d): self copy keeps the offset lead and adds the Rome time to «Domani»', () => inUtc(async () => {
  const { reminderBody } = await copyModule();
  assert.equal(reminderBody({
    selfRecipient: true, requesterName: 'Francesco', title: 'Esame di Psicologia', allDay: false,
    startsAt: '2026-11-20T08:00:00.000Z', startDate: null, offsetMinutes: 60,
    nowMs: Date.parse('2026-11-20T07:00:00.000Z')
  }), 'Tra un’ora: Esame di Psicologia');
  assert.equal(reminderBody({
    selfRecipient: true, requesterName: 'Francesco', title: 'Cena', allDay: false,
    startsAt: '2026-11-20T19:30:00.000Z', startDate: null, offsetMinutes: 1440,
    nowMs: Date.parse('2026-11-19T19:30:00.000Z')
  }), 'Domani alle 20:30: Cena');
  assert.equal(reminderBody({
    selfRecipient: true, requesterName: 'Francesco', title: 'Compleanno di mamma', allDay: true,
    startsAt: null, startDate: '2026-11-20', offsetMinutes: 1440,
    nowMs: Date.parse('2026-11-19T17:00:00.000Z')
  }), 'Domani: Compleanno di mamma');
}));

// (12) review-fix regressioni: savedId scope + cronKey const.
test('M6D (12): review fixes hold — savedId declared before the branch, cronKey constant defined', () => {
  assert.match(js(), /let savedId = null; \/\/ M6D/, 'savedId lives in the try scope, before the branch');
  assert.doesNotMatch(js(), /const savedId = Array.isArray(result.data)/, 'no const re-declaration inside the else branch');
  assert.match(worker(), /const cronKey = /, 'cronKey constant is defined before use');
  assert.match(css(), /.us-cal-field>span{display:block}/);
  assert.doesNotMatch(css(), /.us-cal-reminder-target>span,.us-cal-field>span/);
});
