// M6A — Shared Calendar Domain: deterministic, dependency-free domain logic.
// No AI/LLM, no DOM, no Supabase client — pure functions so this is portable
// across month/week/day views and testable under `node --test` without a DB.
// Mirrors (and documents) the interval-overlap query the frontend will run
// against public.calendar_entries, and computes "Liberi insieme" (when both
// partners are free) from busy intervals. No UI wiring here (M6A is domain
// only); M6B+ will call these from the calendar surface.
((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UsCalendarDomain = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), () => {
  'use strict';

  function toMs(value) {
    const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
    if (Number.isNaN(t)) throw new RangeError(`us-calendar-domain: invalid instant "${value}"`);
    return t;
  }

  function toIso(ms) {
    return new Date(ms).toISOString();
  }

  // Drops zero/negative-duration intervals, sorts by start.
  function normalizeIntervals(intervals) {
    return (intervals || [])
      .map((iv) => ({ start: toMs(iv.start), end: toMs(iv.end) }))
      .filter((iv) => iv.end > iv.start)
      .sort((a, b) => a.start - b.start || a.end - b.end);
  }

  // Merges overlapping AND adjacent (touching) intervals.
  function mergeIntervals(intervals) {
    const sorted = normalizeIntervals(intervals);
    const merged = [];
    for (const iv of sorted) {
      const last = merged[merged.length - 1];
      if (last && iv.start <= last.end) {
        last.end = Math.max(last.end, iv.end);
      } else {
        merged.push({ start: iv.start, end: iv.end });
      }
    }
    return merged;
  }

  function clipIntervals(intervals, windowStart, windowEnd) {
    const ws = toMs(windowStart);
    const we = toMs(windowEnd);
    return intervals
      .map((iv) => ({ start: Math.max(iv.start, ws), end: Math.min(iv.end, we) }))
      .filter((iv) => iv.end > iv.start);
  }

  // Complement of the (already merged) busy set, clipped to the window.
  function complementIntervals(intervals, windowStart, windowEnd) {
    const ws = toMs(windowStart);
    const we = toMs(windowEnd);
    const busy = clipIntervals(mergeIntervals(intervals), ws, we);
    const free = [];
    let cursor = ws;
    for (const iv of busy) {
      if (iv.start > cursor) free.push({ start: cursor, end: iv.start });
      cursor = Math.max(cursor, iv.end);
    }
    if (cursor < we) free.push({ start: cursor, end: we });
    return free;
  }

  function filterByMinDuration(intervals, minDurationMs) {
    return intervals.filter((iv) => (iv.end - iv.start) >= minDurationMs);
  }

  // Intersection of two busy sets: "both busy at once" — a distinct concept
  // from "free together" (the complement of the union). Not used inside
  // computeFreeTogether; exposed separately on purpose.
  function intersectIntervals(listA, listB) {
    const a = mergeIntervals(listA);
    const b = mergeIntervals(listB);
    const result = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      const start = Math.max(a[i].start, b[j].start);
      const end = Math.min(a[i].end, b[j].end);
      if (start < end) result.push({ start, end });
      if (a[i].end < b[j].end) i += 1;
      else j += 1;
    }
    return result;
  }

  // "Liberi insieme": periods where neither partner is busy, within the
  // requested window, at least minDurationMinutes long.
  //   1. normalize both partners' busy intervals
  //   2. a shared event marks BOTH partners busy (added to both lists before
  //      merging — merge naturally dedupes overlapping/duplicate spans, so
  //      this never double-counts busy time)
  //   3. merge each partner's busy set, then union the two
  //   4. clip to window, take the complement (free), filter by min duration
  function computeFreeTogether(options) {
    const {
      windowStart,
      windowEnd,
      personABusy = [],
      personBBusy = [],
      sharedEvents = [],
      minDurationMinutes = 30
    } = options || {};

    const shared = normalizeIntervals(sharedEvents);
    const busyA = mergeIntervals([...personABusy, ...shared]);
    const busyB = mergeIntervals([...personBBusy, ...shared]);
    const combinedBusy = mergeIntervals([...busyA, ...busyB]);
    const free = complementIntervals(combinedBusy, windowStart, windowEnd);
    const filtered = filterByMinDuration(free, minDurationMinutes * 60000);
    return filtered.map((iv) => ({ start: toIso(iv.start), end: toIso(iv.end) }));
  }

  // "Both busy at once" — kept separate from free-together. Useful later for
  // surfacing "you're both booked" without borrowing "conflict" language.
  function computeBothBusy(options) {
    const {
      windowStart,
      windowEnd,
      personABusy = [],
      personBBusy = [],
      sharedEvents = []
    } = options || {};

    const shared = normalizeIntervals(sharedEvents);
    const busyA = clipIntervals(mergeIntervals([...personABusy, ...shared]), windowStart, windowEnd);
    const busyB = clipIntervals(mergeIntervals([...personBBusy, ...shared]), windowStart, windowEnd);
    return intersectIntervals(busyA, busyB).map((iv) => ({ start: toIso(iv.start), end: toIso(iv.end) }));
  }

  // Query contract — mirrors the RLS-scoped Supabase select the frontend
  // will run: couple_id = current_couple_id() (via RLS) AND overlap with the
  // visible window. Timed rows overlap by instant; all-day rows overlap by
  // calendar date (never by instant, to avoid the all-day/timezone shift
  // bug). windowStartDate/windowEndDate are the same visible window expressed
  // as local calendar days ('YYYY-MM-DD'); the caller derives both from one
  // local view range, this module does no timezone math of its own.
  function overlapsWindow(entry, window) {
    const { windowStartAt, windowEndAt, windowStartDate, windowEndDate } = window;
    if (entry.is_all_day) {
      // Plain 'YYYY-MM-DD' strings compare correctly lexicographically; no
      // instant conversion here on purpose (that's the whole point of dates).
      return entry.start_date < windowEndDate && entry.end_date >= windowStartDate;
    }
    // Postgres/PostgREST emits timestamptz with a "+00:00" offset while
    // JS toISOString() emits "Z"/".000Z" — different formats for the same
    // instant compare incorrectly as strings (e.g. '+' sorts before '.').
    // Convert through toMs() so this is a real instant comparison.
    return toMs(entry.starts_at) < toMs(windowEndAt) && toMs(entry.ends_at) > toMs(windowStartAt);
  }

  function filterEntriesInWindow(entries, window) {
    return (entries || []).filter((entry) => overlapsWindow(entry, window));
  }

  // Builds the PostgREST `.or(...)` filter string for a direct, RLS-scoped
  // `supabase.from('calendar_entries').select(...).eq('couple_id', id).or(filter)`
  // read. No RPC: a direct filtered select is the simplest mechanism that
  // satisfies the interval-scoped contract under RLS.
  function buildRangeOverlapFilter({ windowStartAt, windowEndAt, windowStartDate, windowEndDate }) {
    const timedBranch = `and(is_all_day.eq.false,starts_at.lt.${windowEndAt},ends_at.gt.${windowStartAt})`;
    const allDayBranch = `and(is_all_day.eq.true,start_date.lt.${windowEndDate},end_date.gte.${windowStartDate})`;
    return `${timedBranch},${allDayBranch}`;
  }

  return {
    normalizeIntervals,
    mergeIntervals,
    clipIntervals,
    complementIntervals,
    filterByMinDuration,
    intersectIntervals,
    computeFreeTogether,
    computeBothBusy,
    overlapsWindow,
    filterEntriesInWindow,
    buildRangeOverlapFilter
  };
});
