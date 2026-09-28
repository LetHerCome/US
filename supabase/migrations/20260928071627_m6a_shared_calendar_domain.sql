-- M6A — Shared Calendar Domain.
--
-- Dominio couple-centrato del "quando": cosa fa Francesco, cosa fa Beatrice,
-- quando sono liberi insieme. Non è un clone di Google Calendar: nessuna
-- ricorrenza, nessun invito/RSVP, nessuna UI. Solo fondamenta dominio/backend.
--
-- Autorità preesistente: public.shared_events (produzione, nessuna migration
-- nel repo) resta il dominio "date importanti da vivere" — countdown, XP,
-- ricorrenza annuale, completions. Semantica ortogonale e non estendibile a
-- personal/shared/orario: non viene toccata, evoluta né migrata qui. Nessuna
-- riga esistente di shared_events è interessata da questa migration. Path di
-- futura evoluzione: se in futuro serve unificare le due liste "cosa c'è in
-- programma", si farà con una vista di aggregazione a sola lettura sopra
-- entrambe le tabelle, non con una fusione di schema.
--
-- Additive only. Forward-only. Non tocca left_for_you, conserva_contributions,
-- stories, moments, moment_photos.

create table public.calendar_entries (
  id uuid not null default gen_random_uuid() primary key,
  couple_id uuid not null references public.couples(id) on delete cascade,
  entry_type text not null,
  owner_id uuid references public.profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  location text,
  is_all_day boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  start_date date,
  end_date date,
  visibility text not null default 'full',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint calendar_entries_entry_type_check
    check (entry_type in ('personal', 'shared')),

  -- Colonna privacy-ready ora per evitare una migration costosa quando un
  -- futuro milestone esporrà le impostazioni di visibilità. Solo 'full' è
  -- ammesso in M6A: RLS non può mascherare colonne, quindi finché il read
  -- path non applica davvero un oscuramento di title/description/location
  -- per 'busy_only', accettare quel valore sarebbe una bugia sulla privacy
  -- (il partner leggerebbe comunque i dettagli completi via
  -- calendar_entries_select_couple). Il milestone che implementa il masking
  -- allargherà questo check insieme al read path.
  constraint calendar_entries_visibility_check
    check (visibility = 'full'),

  constraint calendar_entries_title_check
    check (char_length(btrim(title)) between 1 and 200),

  -- personal ⇒ owner_id valorizzato (il proprietario). shared ⇒ una riga
  -- sola, couple-level, senza owner di parte (evita la duplicazione
  -- per-partner che l'RLS sotto impedirebbe comunque all'insert).
  constraint calendar_entries_owner_by_type_check
    check (
      (entry_type = 'personal' and owner_id is not null)
      or (entry_type = 'shared' and owner_id is null)
    ),

  -- Un personal entry può essere creato solo dal suo stesso owner (nessuna
  -- creazione per conto del partner).
  constraint calendar_entries_personal_owner_is_creator_check
    check (entry_type <> 'personal' or owner_id = created_by),

  -- Rappresentazione timed XOR all-day, mai mista: un all-day resta ancorato
  -- a un calendar-day (date, non timestamptz) cosi la giornata non scivola
  -- sotto conversione di fuso orario. Un timed usa timestamptz timezone-safe
  -- (nessun fuso hardcoded).
  constraint calendar_entries_temporal_representation_check
    check (
      (
        is_all_day = false
        and starts_at is not null and ends_at is not null
        and start_date is null and end_date is null
      )
      or (
        is_all_day = true
        and start_date is not null and end_date is not null
        and starts_at is null and ends_at is null
      )
    ),

  constraint calendar_entries_timed_range_check
    check (is_all_day = true or ends_at > starts_at),

  constraint calendar_entries_all_day_range_check
    check (is_all_day = false or end_date >= start_date)
);

-- Query contract: fetch per finestra visibile (es. mese) senza caricare tutta
-- la storia. Timed e all-day hanno pattern di accesso diversi (timestamptz vs
-- date), quindi due indici parziali dedicati invece di un indice generico.
create index calendar_entries_couple_timed_idx
  on public.calendar_entries (couple_id, starts_at)
  where is_all_day = false;

create index calendar_entries_couple_allday_idx
  on public.calendar_entries (couple_id, start_date)
  where is_all_day = true;

-- Le default privileges di progetto concedono a anon/authenticated anche
-- TRUNCATE/REFERENCES/TRIGGER/MAINTAIN sulle nuove tabelle in public (RLS non
-- si applica a TRUNCATE). Non raggiungibile da PostgREST, ma su una tabella
-- nuova restringiamo comunque l'ACL al minimo necessario, come da convenzione
-- del repo (vedi il fix grants di left_for_you); la selettività resta
-- comunque affidata interamente alle policy sotto.
revoke all on table public.calendar_entries from anon, authenticated;
grant select, insert, update, delete on table public.calendar_entries to authenticated;

alter table public.calendar_entries enable row level security;
alter table public.calendar_entries force row level security;

-- SELECT: entrambi i partner leggono personal e shared della propria coppia.
create policy calendar_entries_select_couple
  on public.calendar_entries
  for select to authenticated
  using (couple_id = private.current_couple_id());

-- INSERT personal: solo per se stessi, come owner e creator, nella propria
-- coppia. Non si può creare un personal event a nome del partner.
create policy calendar_entries_insert_personal
  on public.calendar_entries
  for insert to authenticated
  with check (
    entry_type = 'personal'
    and couple_id = private.current_couple_id()
    and created_by = auth.uid()
    and owner_id = auth.uid()
  );

-- INSERT shared: uno dei due membri crea per la propria coppia, una riga
-- sola (nessun owner di parte).
create policy calendar_entries_insert_shared
  on public.calendar_entries
  for insert to authenticated
  with check (
    entry_type = 'shared'
    and couple_id = private.current_couple_id()
    and created_by = auth.uid()
    and owner_id is null
  );

-- UPDATE/DELETE personal: solo l'owner.
create policy calendar_entries_update_personal
  on public.calendar_entries
  for update to authenticated
  using (
    entry_type = 'personal'
    and couple_id = private.current_couple_id()
    and owner_id = auth.uid()
  )
  with check (
    entry_type = 'personal'
    and couple_id = private.current_couple_id()
    and owner_id = auth.uid()
  );

create policy calendar_entries_delete_personal
  on public.calendar_entries
  for delete to authenticated
  using (
    entry_type = 'personal'
    and couple_id = private.current_couple_id()
    and owner_id = auth.uid()
  );

-- UPDATE/DELETE shared: solo il creator (M6A, nessun consenso reciproco).
create policy calendar_entries_update_shared
  on public.calendar_entries
  for update to authenticated
  using (
    entry_type = 'shared'
    and couple_id = private.current_couple_id()
    and created_by = auth.uid()
  )
  with check (
    entry_type = 'shared'
    and couple_id = private.current_couple_id()
    and created_by = auth.uid()
  );

create policy calendar_entries_delete_shared
  on public.calendar_entries
  for delete to authenticated
  using (
    entry_type = 'shared'
    and couple_id = private.current_couple_id()
    and created_by = auth.uid()
  );

-- Con piu' policy permissive su UPDATE, Postgres valuta USING/WITH CHECK di
-- ciascuna policy in OR indipendentemente: senza guardia esplicita, una riga
-- che soddisfa la USING personal potrebbe soddisfare la WITH CHECK shared (o
-- viceversa), scavalcando l'autorità. Il trigger blocca a monte qualunque
-- cambio di entry_type/couple_id, indipendentemente da come le policy si
-- combinano, e stampiglia updated_at.
--
-- created_by è immutabile tranne durante un trasferimento di re-pair
-- esplicito e autorizzato: claim_us_role (produzione, SECURITY DEFINER come
-- postgres) bypassa le policy RLS ma non questo trigger, quindi senza un
-- carve-out il trasferimento dei calendar_entries al profilo successore
-- verrebbe comunque rifiutato — e senza quel trasferimento, la cascade su
-- profiles cancellerebbe silenziosamente gli eventi del profilo sostituito.
-- Il carve-out è un flag locale alla transazione, acceso solo da
-- claim_us_role solo per lo statement di trasferimento (vedi la migration
-- successiva): non è un allentamento generale della guardia. entry_type e
-- couple_id restano sempre immutabili, in ogni caso, senza eccezioni.
create or replace function private.calendar_entries_guard_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  repair_transfer boolean := coalesce(current_setting('us.calendar_entries_repair_transfer', true), '') = 'on';
begin
  if new.entry_type <> old.entry_type then
    raise exception using errcode = '42501', message = 'calendar_entries_entry_type_immutable';
  end if;
  if new.couple_id <> old.couple_id then
    raise exception using errcode = '42501', message = 'calendar_entries_couple_id_immutable';
  end if;
  if new.created_by <> old.created_by and not repair_transfer then
    raise exception using errcode = '42501', message = 'calendar_entries_created_by_immutable';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.calendar_entries_guard_update() from public, anon, authenticated;

create trigger calendar_entries_guard_update
before update on public.calendar_entries
for each row execute function private.calendar_entries_guard_update();
