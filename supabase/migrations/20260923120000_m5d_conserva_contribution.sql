-- M5D — Conserva: contributo persistente da "Lasciato per te".
--
-- CORE PRODUCT RULE: Conserva NON crea un Moment finito. Crea un
-- contributo/candidato durevole che un futuro flusso di creazione Moment
-- potrà consumare. Nessuna UI Moment, nessuna generazione automatica.
--
-- CANONICAL FLOW:
--   left_for_you item → il recipient sceglie Conserva
--   → un contributo durevole con provenance → un futuro Moment potrà
--     consumare/riferirsi al contributo.
--
-- SNAPSHOT DECISION (giustificata, esplicita): NESSUNA copia del payload.
-- left_for_you è persistente per contratto M5B (nessuna scadenza, nessuna
-- client DELETE policy/grant, seen lifecycle server-authoritative): la
-- provenance via source_item_id (FK) è sufficiente e il payload completo
-- resta risolvibile dal sorgente. Duplicare body/media_path introdurrebbe
-- una seconda fonte di verità (violazione invariant M5A/M5B). Nessuna
-- colonna JSON di metadati.
--
-- MODELLO DEDICATO MINIMO (nessuna riga incompleta/finta in moments):
--   conserva_contributions(
--     id, couple_id, source_item_id (UNIQUE), source_sender_id,
--     conserved_by, created_at)
--
-- SERVER AUTHORITY: nessuna INSERT/UPDATE/DELETE client arbitraria.
-- L'unica via di scrittura è la RPC authenticate-only
-- conserve_left_for_you(target_item_id):
--   * auth richiesta
--   * solo il RECIPIENT dell'item, stessa coppia (sender e cross-couple
--     ottengono lo stesso reject)
--   * idempotente: ON CONFLICT (source_item_id) DO NOTHING; il retry
--     restituisce il contributo esistente invariato (stesso id, stesso
--     created_at)
--   * NON modifica/elimina la riga left_for_you sorgente
--   * NON crea righe in moments/moment_photos
--
-- VITALIZZIONE RLS INVARIATA: left_for_you RLS/grants, seen lifecycle,
-- storage policies, Moment policies NON toccati. Nessuna policy
-- UPDATE/DELETE per il client sul contributo (immutabile lato client).
-- Nessuna scadenza, nessuno stato pubblico/social. Nessuna semantics di
-- consumo/eliminazione: il futuro flusso Moment deciderà.
--
-- Forward-only. NON riscrive le migration M5B/M5C e NON tocca moments,
-- moment_photos, stories, story_views.

create table public.conserva_contributions (
  id uuid not null default gen_random_uuid() primary key,
  couple_id uuid not null references public.couples(id) on delete cascade,
  source_item_id uuid not null references public.left_for_you(id) on delete cascade,
  source_sender_id uuid not null references public.profiles(id) on delete cascade,
  conserved_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint conserva_source_item_unique
    unique (source_item_id)
);

create index conserva_couple_created_idx
  on public.conserva_contributions (couple_id, created_at desc);
create index conserva_recipient_created_idx
  on public.conserva_contributions (conserved_by, created_at desc);

alter table public.conserva_contributions enable row level security;
alter table public.conserva_contributions force row level security;

-- Visibilità: entrambi i partner della coppia (il contributo parteciperà
-- a un Moment che è couple-visible). Fuori coppia: nessuna riga.
create policy conserva_select_same_couple
  on public.conserva_contributions
  for select to authenticated
  using (
    couple_id = private.current_couple_id()
  );

-- Nessuna policy INSERT/UPDATE/DELETE per il client: la mutazione passa
-- esclusivamente dalla RPC server-authoritative.

-- Grants: authenticated solo SELECT. anon: nessuno.
revoke all on table public.conserva_contributions from anon;
grant select on table public.conserva_contributions to authenticated;

-- RPC server-authoritative: solo il recipient conserva, idempotente,
-- senza toccare l'item sorgente né creare Moment.
create or replace function public.conserve_left_for_you(target_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_item public.left_for_you%rowtype;
  existing_row public.conserva_contributions%rowtype;
  created_row public.conserva_contributions%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  -- Solo il recipient dell'item, nella propria coppia: sender, altri
  -- membri di altre coppie e item inesistenti ottengono lo stesso reject.
  select entry.* into target_item
  from public.left_for_you as entry
  where entry.id = target_item_id
    and entry.couple_id = private.current_couple_id()
    and entry.recipient_id = auth.uid();

  if target_item.id is null then
    raise exception using errcode = '42501', message = 'conserva_recipient_required';
  end if;

  insert into public.conserva_contributions as c
    (couple_id, source_item_id, source_sender_id, conserved_by)
  values
    (target_item.couple_id, target_item.id, target_item.sender_id, auth.uid())
  on conflict (source_item_id) do nothing
  returning c.* into created_row;

  if created_row.id is not null then
    return jsonb_build_object(
      'id', created_row.id,
      'status', 'created',
      'couple_id', created_row.couple_id,
      'source_item_id', created_row.source_item_id,
      'source_sender_id', created_row.source_sender_id,
      'conserved_by', created_row.conserved_by,
      'created_at', created_row.created_at
    );
  end if;

  -- Retry idempotente: restituito il contributo esistente, invariato.
  select e.* into existing_row
  from public.conserva_contributions as e
  where e.source_item_id = target_item.id;

  return jsonb_build_object(
    'id', existing_row.id,
    'status', 'existing',
    'couple_id', existing_row.couple_id,
    'source_item_id', existing_row.source_item_id,
    'source_sender_id', existing_row.source_sender_id,
    'conserved_by', existing_row.conserved_by,
    'created_at', existing_row.created_at
  );
end;
$$;

revoke all on function public.conserve_left_for_you(uuid) from public, anon, authenticated;
grant execute on function public.conserve_left_for_you(uuid) to authenticated;