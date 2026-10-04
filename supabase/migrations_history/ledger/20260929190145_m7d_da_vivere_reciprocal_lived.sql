-- Production ledger 20260929190145 m7d_da_vivere_reciprocal_lived: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 77737bdf3bcd2c08595260d3122335c7; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

-- M7D fix — Da vivere: "vissuta" solo con la conferma di entrambi.
--
-- Contratto di coppia: il partner A propone ("L'abbiamo vissuta"), il partner
-- B conferma, e solo allora bucket_items.status diventa 'lived'. Nessun
-- account può chiudere da solo una cosa vissuta "insieme".
--
-- Prima di questa migration M7A/M7C permettevano a chiunque nella coppia di
-- scrivere direttamente status='lived' (idea|scheduled -> lived) o, da un
-- client legacy, completed=true (in update o già in insert). Tutte e tre le
-- strade sono ora chiuse: l'unico ingresso in 'lived' è la RPC
-- public.confirm_bucket_item_lived, che registra la proposta in modo durevole
-- e finalizza solo alla conferma di un secondo membro distinto della stessa
-- coppia.
--
-- Cambi, additivi e forward-only:
-- 1. due colonne nullable: lived_proposed_by / lived_proposed_at (chi ha
--    proposto e quando). Le righe esistenti restano NULL: le lived legacy
--    restano lived e leggibili, nessun backfill, nessuna riscrittura.
-- 2. guard_insert: un insert non nasce mai lived (completed=true rifiutato) e
--    non porta una proposta già fatta.
-- 3. guard_update (corpo intero M7C + la regola nuova): l'ingresso in lived e
--    ogni scrittura di lived_proposed_* sono ammessi solo dentro la RPC
--    (flag di transazione us.bucket_items_lived_confirm, impostato con
--    set_config locale: non è raggiungibile da PostgREST, come il carve-out
--    us.bucket_items_repair_transfer di M7A). Tutto il resto di M7A/M7C resta
--    identico: whitelist di transizione, scheduled -> idea senza link,
--    completed/completed_at derivati da status, lived -> archived.
-- 4. RPC public.confirm_bucket_item_lived(p_item_id): SECURITY DEFINER,
--    idempotente. Lock: profili coinvolti FOR SHARE (in ordine di id) poi
--    riga FOR UPDATE con riverifica dopo l'attesa (dettagli nel corpo):
--    membership e conferma sono serializzate contro rimozione/re-pair.
--      - nessuna proposta           -> proposta di chi chiama
--      - proposta dello stesso      -> nessun cambiamento (retry sicuro)
--      - proposta dell'altro membro -> status 'lived' (completed/completed_at
--                                      impostati dalla guardia, adesso)
--      - già lived                  -> nessun cambiamento
--    Una proposta di un utente che non è più membro della coppia (re-pair di
--    claim_us_role) non vale come conferma: viene sostituita da quella di chi
--    chiama. calendar_entry_id non viene mai toccato: il Calendario resta
--    l'autorità di data/ora/reminder. Nessun Moment viene creato.
--
-- Non tocca: shared_events, shared_event_completions, relationship_milestones,
-- calendar_entries, calendar_reminders, moments, moment_photos, policy RLS.
--
-- NON applicata in production: resta nel repo finché il rollout non viene
-- autorizzato esplicitamente (dopo 20260929180000_m7c_...).

alter table public.bucket_items add column lived_proposed_by uuid;
alter table public.bucket_items add column lived_proposed_at timestamptz;

alter table public.bucket_items
  add constraint bucket_items_lived_proposal_pair_check
    check ((lived_proposed_by is null) = (lived_proposed_at is null));

create or replace function private.bucket_items_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from 'idea' then
    raise exception using errcode = '22023', message = 'bucket_items_insert_must_start_as_idea';
  end if;

  if new.completed then
    raise exception using errcode = '42501', message = 'bucket_items_lived_requires_reciprocal_confirmation';
  end if;

  if new.lived_proposed_by is not null or new.lived_proposed_at is not null then
    raise exception using errcode = '42501', message = 'bucket_items_lived_proposal_requires_confirm_rpc';
  end if;

  perform private.bucket_items_guard_calendar_link(new.couple_id, new.calendar_entry_id);

  new.completed := false;
  new.completed_at := null;
  return new;
end;
$$;

revoke all on function private.bucket_items_guard_insert() from public, anon, authenticated;

create or replace function private.bucket_items_guard_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  repair_transfer boolean := coalesce(current_setting('us.bucket_items_repair_transfer', true), '') = 'on';
  lived_confirm boolean := coalesce(current_setting('us.bucket_items_lived_confirm', true), '') = 'on';
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

  if (new.lived_proposed_by is distinct from old.lived_proposed_by
      or new.lived_proposed_at is distinct from old.lived_proposed_at)
     and not lived_confirm then
    raise exception using errcode = '42501', message = 'bucket_items_lived_proposal_requires_confirm_rpc';
  end if;

  if resolved_status = 'lived' and old.status <> 'lived' and not lived_confirm then
    raise exception using errcode = '42501', message = 'bucket_items_lived_requires_reciprocal_confirmation';
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

create or replace function public.confirm_bucket_item_lived(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.bucket_items%rowtype;
  v_seen_proposer uuid;
  v_seen_couple uuid;
  v_ids uuid[];
  v_lock record;
  v_caller_couple uuid;
  v_proposer_couple uuid;
  v_proposer_is_member boolean := false;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'bucket_items_lived_requires_authenticated_member';
  end if;

  -- Strategia di lock (stesso ordine del flusso claim_us_role, che blocca il
  -- profilo PRIMA delle righe bucket_items: profili -> riga, mai il contrario,
  -- quindi nessun deadlock con il re-pair):
  --   1. lettura SENZA lock della riga, solo per sapere coppia e proponente;
  --   2. lock FOR SHARE dei profili coinvolti (chi chiama + proponente), in
  --      ordine deterministico per id: un re-pair/rimozione (che li blocca
  --      FOR UPDATE o li cancella) aspetta la fine di questa transazione, e
  --      chi è già stato rimosso non si vede più (la lettura sotto lock è
  --      quella corrente, non quella di prima dell'attesa);
  --   3. lock FOR UPDATE della riga e RIVERIFICA dopo l'attesa: coppia e
  --      proponente devono essere ancora quelli su cui abbiamo bloccato i
  --      profili, altrimenti 40001 (retry sicuro: la RPC è idempotente).
  select b.couple_id, b.lived_proposed_by into v_seen_couple, v_seen_proposer
  from public.bucket_items b where b.id = p_item_id;
  -- Stesso errore per "non esiste" e "è di un'altra coppia": la RPC non
  -- rivela l'esistenza di righe fuori dalla coppia di chi chiama.
  if not found then
    raise exception using errcode = 'P0002', message = 'bucket_items_not_found';
  end if;

  v_ids := array[v_uid];
  if v_seen_proposer is not null and v_seen_proposer <> v_uid then
    v_ids := v_ids || v_seen_proposer;
  end if;

  for v_lock in
    select p.id, p.couple_id from public.profiles p
    where p.id = any(v_ids)
    order by p.id
    for share
  loop
    if v_lock.id = v_uid then v_caller_couple := v_lock.couple_id; end if;
    if v_lock.id = v_seen_proposer then v_proposer_couple := v_lock.couple_id; end if;
  end loop;

  if v_caller_couple is null then
    raise exception using errcode = '42501', message = 'bucket_items_lived_requires_authenticated_member';
  end if;
  if v_caller_couple <> v_seen_couple then
    raise exception using errcode = 'P0002', message = 'bucket_items_not_found';
  end if;

  select b.* into v_item from public.bucket_items b where b.id = p_item_id for update;
  if not found or v_item.couple_id <> v_caller_couple then
    raise exception using errcode = 'P0002', message = 'bucket_items_not_found';
  end if;
  if v_item.lived_proposed_by is distinct from v_seen_proposer then
    raise exception using errcode = '40001', message = 'bucket_items_lived_proposal_changed_retry';
  end if;

  if v_item.status not in ('idea', 'scheduled', 'lived') then
    raise exception using errcode = '22023', message = format('bucket_items_lived_not_allowed_from: %s', v_item.status);
  end if;

  if v_item.status <> 'lived' then
    -- Il proponente vale solo se è ANCORA membro della stessa coppia (letto
    -- sotto lock: non può cambiare fino al commit).
    v_proposer_is_member := v_item.lived_proposed_by is not null
      and v_item.lived_proposed_by <> v_uid
      and v_proposer_couple is not distinct from v_item.couple_id;

    perform set_config('us.bucket_items_lived_confirm', 'on', true);
    if v_item.lived_proposed_by is null
       or (v_item.lived_proposed_by <> v_uid and not v_proposer_is_member) then
      update public.bucket_items
        set lived_proposed_by = v_uid, lived_proposed_at = now()
        where id = p_item_id;
    elsif v_item.lived_proposed_by <> v_uid then
      update public.bucket_items set status = 'lived' where id = p_item_id;
    end if;
    perform set_config('us.bucket_items_lived_confirm', 'off', true);
  end if;

  select b.* into v_item from public.bucket_items b where b.id = p_item_id;
  return jsonb_build_object(
    'id', v_item.id,
    'status', v_item.status,
    'calendar_entry_id', v_item.calendar_entry_id,
    'completed', v_item.completed,
    'completed_at', v_item.completed_at,
    'lived_proposed_by', v_item.lived_proposed_by,
    'lived_proposed_at', v_item.lived_proposed_at
  );
end;
$$;

revoke all on function public.confirm_bucket_item_lived(uuid) from public, anon, authenticated;
grant execute on function public.confirm_bucket_item_lived(uuid) to authenticated;;
