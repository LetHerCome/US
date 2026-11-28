-- Noi, Fase A (founder, 24/11/2026, grill-me D6 and the board «US · Noi, il
-- vostro tempo»): «Ci vediamo» on a commitment makes it your next meeting.
-- For couples apart (couples.distance_mode = 'far') Noi opens with «Vi
-- rivedete tra» and a timer to the next commitment with Ci vediamo on.
-- One boolean on the row, off by default: existing rows and older apps are
-- untouched; the update guard (entry type, couple, author immutable) is the
-- same. Staging first, with the founder's go-ahead.

alter table public.calendar_entries
  add column if not exists ci_vediamo boolean not null default false;

comment on column public.calendar_entries.ci_vediamo is
  'Ci vediamo: this commitment is a meeting of the two; the next one is «Vi rivedete tra» in Noi.';

-- The next meeting is read from today on: only the few rows with it on.
create index if not exists calendar_entries_couple_ci_vediamo_idx
  on public.calendar_entries (couple_id, start_date, starts_at)
  where ci_vediamo;
