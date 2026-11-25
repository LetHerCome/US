-- Noi, Fase B (founder, 24/11/2026, grill-me D4 and the board «US · Noi, il
-- vostro tempo»): the post-its sit on La lavagna and move freely; where one
-- is left, both see it there.
--
-- * Two columns, null until a post-it is moved: its centre on the board, as
--   a share of the board's width and height (0..1). Null = the app lays it
--   out by itself, as before.
-- * Same table, same RLS (private.current_couple_id()). The guard
--   (private.couple_notes_guard) still writes the next revision on every
--   change, but a move alone is not a change of the words: who wrote it last
--   and when stay as they were (the post-it keeps saying «Bea · ieri»).
-- * Realtime follows by itself (the publication sends the whole row). The
--   data export keeps its columns: a place on the board is layout, not
--   something either of you wrote.
-- Staging first, with the founder's go-ahead. Re-applying changes nothing.

alter table public.couple_notes add column if not exists board_x real;
alter table public.couple_notes add column if not exists board_y real;

do $do$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'couple_notes_board_place' and conrelid = 'public.couple_notes'::regclass) then
    alter table public.couple_notes add constraint couple_notes_board_place check (
      (board_x is null and board_y is null)
      or (board_x between 0 and 1 and board_y between 0 and 1)
    );
  end if;
end
$do$;

comment on column public.couple_notes.board_x is 'Centre of the post-it on La lavagna, share of the width (0..1); null = laid out by the app (Noi, Fase B).';
comment on column public.couple_notes.board_y is 'Centre of the post-it on La lavagna, share of the height (0..1); null = laid out by the app (Noi, Fase B).';

-- The guard of 20261031132258_couple_notes_v1, plus the move: when only the
-- place changed, updated_by and updated_at stay; the revision still grows.
create or replace function private.couple_notes_guard() returns trigger
language plpgsql set search_path = ''
as $fn$
begin
  -- Only the app's role is guarded; account deletion and leaving (security
  -- definer, see s32_close_membership) detach the authors as they are.
  if current_user <> 'authenticated' then return new; end if;
  new.title := pg_catalog.btrim(new.title);
  if tg_op = 'INSERT' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('couple-notes:' || new.couple_id::text, 0));
    if (select pg_catalog.count(*) from public.couple_notes n where n.couple_id = new.couple_id) >= 300 then
      raise exception using errcode = 'P0001', message = 'couple_notes_limit';
    end if;
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
    new.created_at := pg_catalog.now();
    new.updated_at := pg_catalog.now();
    new.revision := 1;
    return new;
  end if;
  if new.couple_id is distinct from old.couple_id then
    raise exception using errcode = '42501', message = 'couple_notes_couple_id_immutable';
  end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  if (new.title, new.body, new.items, new.color) is not distinct from (old.title, old.body, old.items, old.color) then
    new.updated_by := old.updated_by;
    new.updated_at := old.updated_at;
  else
    new.updated_by := auth.uid();
    new.updated_at := pg_catalog.now();
  end if;
  new.revision := old.revision + 1;
  return new;
end;
$fn$;
revoke all on function private.couple_notes_guard() from public, anon, authenticated;
