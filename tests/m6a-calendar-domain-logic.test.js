const test = require('node:test');
const assert = require('node:assert/strict');

const domain = require('../calendar-domain.js');

const WINDOW = {
  windowStartAt: '2026-09-01T00:00:00.000Z',
  windowEndAt: '2026-10-01T00:00:00.000Z',
  windowStartDate: '2026-09-01',
  windowEndDate: '2026-10-01'
};

test('M6A (17): interval query includes a start-inside entry', () => {
  const entry = { is_all_day: false, starts_at: '2026-09-10T09:00:00.000Z', ends_at: '2026-09-10T10:00:00.000Z' };
  assert.equal(domain.overlapsWindow(entry, WINDOW), true);
});

test('M6A (18): interval query includes an end-inside entry (starts before window, ends inside it)', () => {
  const entry = { is_all_day: false, starts_at: '2026-08-30T20:00:00.000Z', ends_at: '2026-09-01T02:00:00.000Z' };
  assert.equal(domain.overlapsWindow(entry, WINDOW), true);
});

test('M6A (18b): interval query includes a start-during-and-end-after entry', () => {
  const entry = { is_all_day: false, starts_at: '2026-09-30T22:00:00.000Z', ends_at: '2026-10-02T01:00:00.000Z' };
  assert.equal(domain.overlapsWindow(entry, WINDOW), true);
});

test('M6A (19): interval query includes an entry spanning the whole visible window', () => {
  const entry = { is_all_day: false, starts_at: '2026-08-01T00:00:00.000Z', ends_at: '2026-11-01T00:00:00.000Z' };
  assert.equal(domain.overlapsWindow(entry, WINDOW), true);
});

test('M6A (19b): all-day entry spanning the whole visible window is included', () => {
  const entry = { is_all_day: true, start_date: '2026-08-15', end_date: '2026-10-15' };
  assert.equal(domain.overlapsWindow(entry, WINDOW), true);
});

test('M6A: entries entirely outside the window are excluded', () => {
  assert.equal(domain.overlapsWindow({ is_all_day: false, starts_at: '2026-08-01T00:00:00.000Z', ends_at: '2026-08-02T00:00:00.000Z' }, WINDOW), false);
  assert.equal(domain.overlapsWindow({ is_all_day: false, starts_at: '2026-10-05T00:00:00.000Z', ends_at: '2026-10-06T00:00:00.000Z' }, WINDOW), false);
  assert.equal(domain.overlapsWindow({ is_all_day: true, start_date: '2026-08-01', end_date: '2026-08-15' }, WINDOW), false);
  assert.equal(domain.overlapsWindow({ is_all_day: true, start_date: '2026-10-05', end_date: '2026-10-10' }, WINDOW), false);
});

test('M6A: overlap compares real instants, not raw strings — offset vs Z-suffixed formats', () => {
  // Postgres/PostgREST emits timestamptz as '...+00:00'; JS toISOString() emits
  // '...Z'/'...000Z'. Lexicographically '+' (0x2B) sorts before '.' (0x2E), so a
  // naive string compare would misclassify an entry ending exactly at the window
  // start as still overlapping. A pure instant comparison must not.
  const entryEndingExactlyAtWindowStart = {
    is_all_day: false,
    starts_at: '2026-08-31T22:00:00+00:00',
    ends_at: '2026-09-01T00:00:00+00:00'
  };
  assert.equal(domain.overlapsWindow(entryEndingExactlyAtWindowStart, WINDOW), false,
    'ends_at equal to windowStartAt must not overlap (half-open, ends_at > windowStartAt required)');

  const entryStartingExactlyAtWindowEnd = {
    is_all_day: false,
    starts_at: '2026-10-01T00:00:00+00:00',
    ends_at: '2026-10-01T02:00:00+00:00'
  };
  assert.equal(domain.overlapsWindow(entryStartingExactlyAtWindowEnd, WINDOW), false,
    'starts_at equal to windowEndAt must not overlap (half-open, starts_at < windowEndAt required)');

  const entryStraddlingWindowStart = {
    is_all_day: false,
    starts_at: '2026-08-31T23:00:00+00:00',
    ends_at: '2026-09-01T00:00:00.000Z'
  };
  assert.equal(domain.overlapsWindow(entryStraddlingWindowStart, WINDOW), false,
    'the same equivalent-instant boundary (+00:00 vs .000Z for the same moment) must resolve identically');

  const entryOverlappingByOneMs = {
    is_all_day: false,
    starts_at: '2026-08-31T23:59:59.999+00:00',
    ends_at: '2026-09-01T00:00:00.001Z'
  };
  assert.equal(domain.overlapsWindow(entryOverlappingByOneMs, WINDOW), true,
    'mixed offset/Z formats for a genuine 2ms overlap must still be detected as overlapping');
});

test('M6A (20): overnight/crossing-midnight timed entry overlap works via plain timestamptz range overlap', () => {
  const entry = { is_all_day: false, starts_at: '2026-09-15T23:00:00.000Z', ends_at: '2026-09-16T02:00:00.000Z' };
  assert.equal(domain.overlapsWindow(entry, WINDOW), true);
  const narrowWindow = { ...WINDOW, windowStartAt: '2026-09-16T01:00:00.000Z', windowEndAt: '2026-09-16T01:30:00.000Z' };
  assert.equal(domain.overlapsWindow(entry, narrowWindow), true, 'a window entirely inside the overnight span must still overlap');
});

test('M6A (15 support): all-day never needs timezone math, unlike a naive UTC-midnight timed representation', () => {
  // The bug this schema avoids: representing an all-day event as
  // 00:00Z -> 23:59Z and then rendering it in a negative UTC-offset timezone
  // shifts it a day earlier. Using a plain calendar-day string sidesteps this
  // entirely because there is no instant/offset conversion in the comparison.
  const allDayOct14 = { is_all_day: true, start_date: '2026-10-14', end_date: '2026-10-14' };
  const windowAroundThatDay = {
    windowStartAt: '2026-10-14T00:00:00.000Z',
    windowEndAt: '2026-10-15T00:00:00.000Z',
    windowStartDate: '2026-10-14',
    windowEndDate: '2026-10-15'
  };
  assert.equal(domain.overlapsWindow(allDayOct14, windowAroundThatDay), true);
  assert.equal(allDayOct14.start_date, '2026-10-14', 'the stored calendar day itself is never mutated by any offset');
});

test('M6A buildRangeOverlapFilter documents the exact direct-query contract (no RPC needed)', () => {
  const filter = domain.buildRangeOverlapFilter(WINDOW);
  assert.match(filter, /is_all_day\.eq\.false/);
  assert.match(filter, /starts_at\.lt\.2026-10-01T00:00:00\.000Z/);
  assert.match(filter, /ends_at\.gt\.2026-09-01T00:00:00\.000Z/);
  assert.match(filter, /is_all_day\.eq\.true/);
  assert.match(filter, /start_date\.lt\.2026-10-01/);
  assert.match(filter, /end_date\.gte\.2026-09-01/);
});

test('M6A (22): availability merges overlapping and adjacent busy intervals', () => {
  const merged = domain.mergeIntervals([
    { start: '2026-09-01T09:00:00.000Z', end: '2026-09-01T10:00:00.000Z' },
    { start: '2026-09-01T09:30:00.000Z', end: '2026-09-01T11:00:00.000Z' },
    { start: '2026-09-01T11:00:00.000Z', end: '2026-09-01T12:00:00.000Z' },
    { start: '2026-09-01T14:00:00.000Z', end: '2026-09-01T15:00:00.000Z' }
  ]);
  assert.equal(merged.length, 2);
  assert.equal(new Date(merged[0].start).toISOString(), '2026-09-01T09:00:00.000Z');
  assert.equal(new Date(merged[0].end).toISOString(), '2026-09-01T12:00:00.000Z');
});

test('M6A (23): availability clips busy/free periods to the requested window', () => {
  const free = domain.computeFreeTogether({
    windowStart: '2026-09-01T08:00:00.000Z',
    windowEnd: '2026-09-01T12:00:00.000Z',
    personABusy: [{ start: '2026-09-01T00:00:00.000Z', end: '2026-09-01T09:00:00.000Z' }],
    personBBusy: [],
    minDurationMinutes: 30
  });
  assert.deepEqual(free, [{ start: '2026-09-01T09:00:00.000Z', end: '2026-09-01T12:00:00.000Z' }]);
});

test('M6A (24): common-free calculation is correct across two independent schedules', () => {
  const free = domain.computeFreeTogether({
    windowStart: '2026-09-01T08:00:00.000Z',
    windowEnd: '2026-09-01T20:00:00.000Z',
    personABusy: [{ start: '2026-09-01T09:00:00.000Z', end: '2026-09-01T11:00:00.000Z' }],
    personBBusy: [{ start: '2026-09-01T10:00:00.000Z', end: '2026-09-01T13:00:00.000Z' }],
    minDurationMinutes: 30
  });
  assert.deepEqual(free, [
    { start: '2026-09-01T08:00:00.000Z', end: '2026-09-01T09:00:00.000Z' },
    { start: '2026-09-01T13:00:00.000Z', end: '2026-09-01T20:00:00.000Z' }
  ]);
});

test('M6A (25): minimum-duration filtering drops slivers shorter than the threshold', () => {
  const free = domain.computeFreeTogether({
    windowStart: '2026-09-01T08:00:00.000Z',
    windowEnd: '2026-09-01T12:00:00.000Z',
    personABusy: [{ start: '2026-09-01T09:00:00.000Z', end: '2026-09-01T09:50:00.000Z' }],
    personBBusy: [{ start: '2026-09-01T09:55:00.000Z', end: '2026-09-01T11:00:00.000Z' }],
    minDurationMinutes: 30
  });
  // Gap between 09:50 and 09:55 is only 5 minutes: below the 30-minute floor.
  assert.deepEqual(free, [
    { start: '2026-09-01T08:00:00.000Z', end: '2026-09-01T09:00:00.000Z' },
    { start: '2026-09-01T11:00:00.000Z', end: '2026-09-01T12:00:00.000Z' }
  ]);
  const freeWithLowerThreshold = domain.computeFreeTogether({
    windowStart: '2026-09-01T08:00:00.000Z',
    windowEnd: '2026-09-01T12:00:00.000Z',
    personABusy: [{ start: '2026-09-01T09:00:00.000Z', end: '2026-09-01T09:50:00.000Z' }],
    personBBusy: [{ start: '2026-09-01T09:55:00.000Z', end: '2026-09-01T11:00:00.000Z' }],
    minDurationMinutes: 5
  });
  assert.equal(freeWithLowerThreshold.length, 3, 'a lower configurable threshold must surface the 5-minute gap too');
});

test('M6A (26): a shared event marks both partners busy, shrinking free-together on both sides', () => {
  const withoutShared = domain.computeFreeTogether({
    windowStart: '2026-09-01T08:00:00.000Z',
    windowEnd: '2026-09-01T20:00:00.000Z',
    personABusy: [],
    personBBusy: [],
    minDurationMinutes: 30
  });
  assert.deepEqual(withoutShared, [{ start: '2026-09-01T08:00:00.000Z', end: '2026-09-01T20:00:00.000Z' }]);

  const withShared = domain.computeFreeTogether({
    windowStart: '2026-09-01T08:00:00.000Z',
    windowEnd: '2026-09-01T20:00:00.000Z',
    personABusy: [],
    personBBusy: [],
    sharedEvents: [{ start: '2026-09-01T12:00:00.000Z', end: '2026-09-01T13:00:00.000Z' }],
    minDurationMinutes: 30
  });
  assert.deepEqual(withShared, [
    { start: '2026-09-01T08:00:00.000Z', end: '2026-09-01T12:00:00.000Z' },
    { start: '2026-09-01T13:00:00.000Z', end: '2026-09-01T20:00:00.000Z' }
  ]);
});

test('M6A (27): a duplicate shared busy interval on both personal lists does not corrupt availability', () => {
  const sameLunch = { start: '2026-09-01T12:00:00.000Z', end: '2026-09-01T13:00:00.000Z' };
  const free = domain.computeFreeTogether({
    windowStart: '2026-09-01T08:00:00.000Z',
    windowEnd: '2026-09-01T20:00:00.000Z',
    personABusy: [sameLunch],
    personBBusy: [sameLunch],
    sharedEvents: [sameLunch],
    minDurationMinutes: 30
  });
  // If duplicates were summed instead of set-merged, this would incorrectly
  // remove more than one hour of free time or fragment the result.
  assert.deepEqual(free, [
    { start: '2026-09-01T08:00:00.000Z', end: '2026-09-01T12:00:00.000Z' },
    { start: '2026-09-01T13:00:00.000Z', end: '2026-09-01T20:00:00.000Z' }
  ]);
});

test('M6A: "both busy" (intersection) is a distinct concept from "free together" (complement of union)', () => {
  const bothBusy = domain.computeBothBusy({
    windowStart: '2026-09-01T08:00:00.000Z',
    windowEnd: '2026-09-01T20:00:00.000Z',
    personABusy: [{ start: '2026-09-01T09:00:00.000Z', end: '2026-09-01T11:00:00.000Z' }],
    personBBusy: [{ start: '2026-09-01T10:00:00.000Z', end: '2026-09-01T13:00:00.000Z' }]
  });
  assert.deepEqual(bothBusy, [{ start: '2026-09-01T10:00:00.000Z', end: '2026-09-01T11:00:00.000Z' }]);

  const freeTogether = domain.computeFreeTogether({
    windowStart: '2026-09-01T08:00:00.000Z',
    windowEnd: '2026-09-01T20:00:00.000Z',
    personABusy: [{ start: '2026-09-01T09:00:00.000Z', end: '2026-09-01T11:00:00.000Z' }],
    personBBusy: [{ start: '2026-09-01T10:00:00.000Z', end: '2026-09-01T13:00:00.000Z' }],
    minDurationMinutes: 30
  });
  assert.notDeepEqual(bothBusy, freeTogether);
});

test('M6A: zero/negative-duration intervals are normalized away, not treated as busy', () => {
  const merged = domain.normalizeIntervals([
    { start: '2026-09-01T09:00:00.000Z', end: '2026-09-01T09:00:00.000Z' },
    { start: '2026-09-01T10:00:00.000Z', end: '2026-09-01T09:30:00.000Z' },
    { start: '2026-09-01T11:00:00.000Z', end: '2026-09-01T12:00:00.000Z' }
  ]);
  assert.equal(merged.length, 1);
});
