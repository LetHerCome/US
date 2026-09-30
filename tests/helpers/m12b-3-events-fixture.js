// M12B.3 test stand-ins for the production-only Eventi authority. The repo has
// no migration for shared_events / shared_event_completions /
// complete_shared_event (they predate the migration history), so the tests
// declare them with the shape the client already relies on (events.js selects)
// and the facts verified in production for M12B:
//   - shared_events is the event authority, readable by the couple;
//   - shared_event_completions(id, couple_id, event_id, occurrence_date,
//     completed_by, xp_awarded, completed_at), unique (event_id,
//     occurrence_date), readable by the couple;
//   - complete_shared_event(uuid, date) is SECURITY DEFINER and idempotent on
//     event_id + occurrence_date.
// The completion FK uses ON DELETE CASCADE, the worst case for history (the
// production delete behaviour was not verified), so the tests prove what
// provenance keeps even then. private.current_couple_id() mirrors the
// production helper used by the moments policies.
const EVENTS_FIXTURE = `
  create or replace function private.current_couple_id() returns uuid
  language sql stable security definer set search_path = '' as $$
    select p.couple_id from public.profiles p where p.id = auth.uid()
  $$;
  grant usage on schema private to authenticated;
  grant execute on function private.current_couple_id() to authenticated;

  create table public.shared_events (
    id uuid primary key default gen_random_uuid(),
    couple_id uuid not null references public.couples(id) on delete cascade,
    created_by uuid, title text not null, event_date date not null, event_time time, location text, note text,
    recurs_yearly boolean not null default false,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now()
  );
  alter table public.shared_events enable row level security;
  create policy shared_events_couple on public.shared_events for all to authenticated
    using (couple_id = private.current_couple_id()) with check (couple_id = private.current_couple_id());
  grant select, insert, update, delete on public.shared_events to authenticated;

  create table public.shared_event_completions (
    id uuid primary key default gen_random_uuid(),
    couple_id uuid not null references public.couples(id) on delete cascade,
    event_id uuid not null references public.shared_events(id) on delete cascade,
    occurrence_date date not null,
    completed_by uuid, xp_awarded integer not null default 0,
    completed_at timestamptz not null default now(),
    unique (event_id, occurrence_date)
  );
  alter table public.shared_event_completions enable row level security;
  create policy shared_event_completions_select_couple on public.shared_event_completions for select to authenticated
    using (couple_id = private.current_couple_id());
  grant select on public.shared_event_completions to authenticated;

  create or replace function public.complete_shared_event(target_event_id uuid, target_occurrence_date date)
  returns jsonb language plpgsql security definer set search_path = '' as $$
  declare ev public.shared_events%rowtype; done public.shared_event_completions%rowtype;
  begin
    select * into ev from public.shared_events e where e.id = target_event_id and e.couple_id = private.current_couple_id();
    if not found then raise exception using errcode = 'P0002', message = 'event not found'; end if;
    insert into public.shared_event_completions(couple_id, event_id, occurrence_date, completed_by, xp_awarded)
    values (ev.couple_id, ev.id, target_occurrence_date, auth.uid(), 10)
    on conflict (event_id, occurrence_date) do nothing returning * into done;
    if done.id is null then
      select * into done from public.shared_event_completions c where c.event_id = ev.id and c.occurrence_date = target_occurrence_date;
      return jsonb_build_object('id', done.id, 'already_completed', true, 'xp_awarded', done.xp_awarded);
    end if;
    return jsonb_build_object('id', done.id, 'already_completed', false, 'xp_awarded', done.xp_awarded);
  end;
  $$;
  revoke all on function public.complete_shared_event(uuid, date) from public, anon;
  grant execute on function public.complete_shared_event(uuid, date) to authenticated;
`;

const M12B3 = {
  provenance: 'supabase/migrations/20260930233000_m12b_3_living_provenance.sql',
  gameV2: 'supabase/migrations/20260930233100_m12b_3_game_v2_living_origin.sql',
  history: 'supabase/migrations/20260930233200_m12b_3_event_completion_history.sql',
};

module.exports = { EVENTS_FIXTURE, M12B3 };
