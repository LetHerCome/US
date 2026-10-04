-- Production ledger 20260930225935 m12b_2_da_vivere_archived_link_release: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 ca827a62c5c3e288528a198d1923201b; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

-- M12B.2 — Da vivere: an idea archived without ever being lived releases its
-- Calendario event.
create or replace function private.bucket_items_release_archived_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'archived' and new.completed_at is null and new.calendar_entry_id is not null then
    new.calendar_entry_id := null;
  end if;
  return new;
end;
$$;

revoke all on function private.bucket_items_release_archived_link() from public, anon, authenticated;

create trigger bucket_items_release_archived_link
before update on public.bucket_items
for each row execute function private.bucket_items_release_archived_link();

do $$
declare
  released integer;
begin
  update public.bucket_items
    set calendar_entry_id = null
    where status = 'archived'
      and completed_at is null
      and calendar_entry_id is not null;
  get diagnostics released = row_count;
  raise notice 'm12b_2: released % archived never-lived Da vivere link(s)', released;
end;
$$;

alter table public.bucket_items
  add constraint bucket_items_archived_unlived_unlinked_check
    check (status <> 'archived' or completed_at is not null or calendar_entry_id is null);;
