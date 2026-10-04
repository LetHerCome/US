-- Production ledger 20260929190126 m7c_da_vivere_calendar_unschedule: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 9c607ab17f912969368872f78fdcca03; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

-- M7C — Da vivere -> Calendar: togliere dal calendario.
--
-- M7C collega un bucket_items "idea" a UN calendar_entries shared della
-- stessa coppia (status -> scheduled, calendar_entry_id valorizzato) usando
-- solo il contratto già stabilito da M7A: nessuna colonna o tabella nuova.
--
-- Il buco che M7C apre senza questa migration: calendar_entry_id ha
-- ON DELETE RESTRICT e M7A non ammette nessuna uscita da scheduled se non
-- verso lived/archived. Quindi, appena un'idea è in calendario, il Calendario
-- (che resta l'autorità di data/ora/durata/reminder) non potrebbe più
-- eliminare quell'evento: la DELETE fallirebbe sulla FK.
--
-- Questa migration, additiva e forward-only:
-- 1. aggiunge UNA transizione alla whitelist: scheduled -> idea, ammessa solo
--    se nello stesso update il link viene tolto (calendar_entry_id = null).
--    È "togli dal calendario": l'idea torna in lista senza data, nessuna
--    storia persa (non è mai stata vissuta). Il resto della funzione è
--    identico a M7A, riportato per intero perché CREATE OR REPLACE sostituisce
--    il corpo intero.
-- 2. un trigger BEFORE DELETE su calendar_entries che, per l'evento che sta
--    per essere eliminato, riporta a idea gli eventuali bucket_items ancora
--    scheduled collegati. Gira prima della cancellazione della riga, quindi
--    la FK RESTRICT non vede più riferimenti scheduled. Un bucket_item lived
--    o archived che porta ancora il link resta storia: la FK RESTRICT
--    continua a rifiutare la DELETE (il client lo spiega all'utente).
--
-- Non tocca: shared_events, shared_event_completions, relationship_milestones,
-- moments, moment_photos, calendar_reminders (le righe reminder dell'evento
-- seguono la loro FK esistente), né le policy RLS di calendar_entries: chi
-- non può cancellare l'evento per RLS non arriva mai al trigger.
--
-- NON applicata in production da questa milestone: resta nel repo finché il
-- rollout non viene autorizzato esplicitamente.

create or replace function private.bucket_items_guard_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  repair_transfer boolean := coalesce(current_setting('us.bucket_items_repair_transfer', true), '') = 'on';
  resolved_status text := new.status;
begin
  if new.couple_id <> old.couple_id then
    raise exception using errcode = '42501', message = 'bucket_items_couple_id_immutable';
  end if;

  if new.created_by <> old.created_by and not repair_transfer then
    raise exception using errcode = '42501', message = 'bucket_items_created_by_immutable';
  end if;

  if new.status = old.status and new.completed and not old.completed then
    resolved_status := 'lived';
  end if;

  if new.status = old.status and old.status = 'lived' and not new.completed then
    raise exception using errcode = '22023', message = 'bucket_items_cannot_revert_lived_via_completed_flag';
  end if;

  if resolved_status <> old.status then
    if not (
      (old.status = 'idea' and resolved_status = 'scheduled')
      or (old.status = 'idea' and resolved_status = 'lived')
      or (old.status = 'scheduled' and resolved_status = 'lived')
      or (old.status = 'scheduled' and resolved_status = 'idea' and new.calendar_entry_id is null)
      or (old.status = 'idea' and resolved_status = 'archived')
      or (old.status = 'scheduled' and resolved_status = 'archived')
      or (old.status = 'lived' and resolved_status = 'archived')
    ) then
      raise exception using errcode = '22023', message = format('bucket_items_invalid_status_transition: %s -> %s', old.status, resolved_status);
    end if;
  end if;

  new.status := resolved_status;

  if new.calendar_entry_id is distinct from old.calendar_entry_id then
    perform private.bucket_items_guard_calendar_link(new.couple_id, new.calendar_entry_id);
  end if;

  if new.status = 'lived' then
    new.completed := true;
    new.completed_at := coalesce(old.completed_at, now());
  else
    new.completed := old.completed;
    new.completed_at := old.completed_at;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.bucket_items_guard_update() from public, anon, authenticated;

create or replace function private.calendar_entries_unschedule_bucket_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.bucket_items
    set status = 'idea', calendar_entry_id = null
    where calendar_entry_id = old.id
      and couple_id = old.couple_id
      and status = 'scheduled';
  return old;
end;
$$;

revoke all on function private.calendar_entries_unschedule_bucket_items() from public, anon, authenticated;

create trigger calendar_entries_unschedule_bucket_items
before delete on public.calendar_entries
for each row execute function private.calendar_entries_unschedule_bucket_items();;
