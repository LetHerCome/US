-- Noi nuova, bacheca (founder, 03/11/2026, docs/DECISIONS.md «Noi nuova,
-- lavagna e sfida della settimana»): the shared notes become post-its on the
-- Noi page, each on its paper, one of four colours chosen by whoever writes
-- it and changed by either member.
--
-- * One column, never null: yellow, pink, blue or green. Every note written
--   before this migration is yellow; nothing else changes and nothing goes.
-- * Same table, same RLS (private.current_couple_id()) and the same guard
--   (private.couple_notes_guard): a new paper is a change like any other, so
--   the server writes who changed it, when, and the next revision.
-- * Realtime and the data export follow by themselves: the publication sends
--   the whole row and public.s32_export_user_data exports to_jsonb of the
--   row; the Edge export lists the column (s3-2-export-core.mjs).
-- Re-applying this migration changes nothing.

alter table public.couple_notes add column if not exists color text not null default 'yellow';

do $do$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'couple_notes_color_paper' and conrelid = 'public.couple_notes'::regclass) then
    alter table public.couple_notes add constraint couple_notes_color_paper check (color in ('yellow', 'pink', 'blue', 'green'));
  end if;
end
$do$;

comment on column public.couple_notes.color is 'Paper of the post-it in Noi: yellow, pink, blue or green (Noi nuova, 03/11/2026).';
