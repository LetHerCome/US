-- M7A — Da vivere: dominio backend (bucket_items).
--
-- "Da vivere" = idee di coppia che aspettano di diventare un momento reale,
-- poi vissuto. Autorità preesistente: public.bucket_items (produzione,
-- nessuna migration nel repo prima di questa) è già la lista "cose che
-- vogliamo fare" — couple_id, created_by, title, completed, completed_at,
-- created_at; RLS e policy couple-scoped su SELECT/INSERT/UPDATE/DELETE,
-- INSERT vincolato a created_by = auth.uid(). Un audit repo-wide non ha
-- trovato nessun consumer UI di questa tabella (solo un update in
-- claim_us_role e una menzione nei test M6A) — è quindi l'autorità giusta da
-- evolvere additivamente, non una nuova tabella duplicata.
--
-- DECISIONE ARCHITETTURALE (documentata qui perché non esiste altra sede):
-- bucket_items RESTA l'unica persistenza "Da vivere". Nessuna nuova tabella
-- living_items/shared_experiences/proposals viene creata — M3 già asserisce
-- che non deve esisterne una (tests/m3-noi-canonical.test.js). Questa
-- migration evolve bucket_items in modo additivo: nuove colonne, nuovi
-- vincoli, nuovi trigger. Colonne e righe esistenti restano leggibili dal
-- contratto legacy (produzione ha già 1 riga reale, nessun consumer UI oggi).
--
-- Autorità NON toccata: public.shared_events (countdown/XP/ricorrenza/
-- completions — dominio ortogonale "date importanti da vivere", vedi M6A) e
-- public.calendar_entries (M6A, dominio "quando") sono referenziate SOLO da
-- una foreign key in uscita (calendar_entry_id), in preparazione del futuro
-- M7C che collegherà un'idea vissuta al giorno reale in cui è successa.
-- Nessuna riga o logica di shared_events/shared_event_completions/
-- relationship_milestones/calendar_entries è alterata qui.
--
-- Lifecycle minimo: idea -> scheduled -> lived, più archived (raggiungibile
-- da idea, scheduled o lived; mai reversibile). Nessuna categoria, voto,
-- priorità, budget, tag o workflow: solo il minimo che rende praticabile il
-- futuro M7C (collegare UN calendar_entries condiviso della stessa coppia e
-- passare a scheduled; dopo l'evento, passare a lived). Nessun caller/UI di
-- M7C esiste ancora — solo il contratto FK/unique/validazione.
--
-- Additive only. Forward-only. Non tocca shared_events, shared_event_completions,
-- relationship_milestones, calendar_entries (solo FK in uscita), moments,
-- moment_photos, left_for_you, conserva_contributions.

-- 1. Nuove colonne, additive. `status` è backfillato dal significato legacy
--    di `completed` PRIMA di imporre NOT NULL/default/check, così la riga
--    già in produzione ottiene un valore coerente invece del default
--    generico 'idea' (che perderebbe il fatto che è già stata completata).
alter table public.bucket_items add column note text;
alter table public.bucket_items add column link_url text;
alter table public.bucket_items add column status text;
alter table public.bucket_items add column calendar_entry_id uuid;
alter table public.bucket_items add column updated_at timestamptz;

update public.bucket_items
  set status = case when completed then 'lived' else 'idea' end
  where status is null;

-- updated_at eredita created_at per le righe storiche, invece di ricevere il
-- timestamp del momento della migration (che mentirebbe sulla storia reale).
update public.bucket_items set updated_at = created_at where updated_at is null;

-- completed_at difensivo: mai dovrebbe mancare su una riga già completed nel
-- contratto legacy, ma se succedesse non lo si inventerebbe sovrascrivendo
-- un valore esistente — solo coalesce, mai un update incondizionato.
update public.bucket_items
  set completed_at = coalesce(completed_at, now())
  where completed = true and completed_at is null;

alter table public.bucket_items alter column status set default 'idea';
alter table public.bucket_items alter column status set not null;
alter table public.bucket_items alter column updated_at set default now();
alter table public.bucket_items alter column updated_at set not null;

alter table public.bucket_items
  add constraint bucket_items_status_check
    check (status in ('idea', 'scheduled', 'lived', 'archived'));

alter table public.bucket_items
  add constraint bucket_items_link_url_check
    check (link_url is null or link_url ~* '^https?://');

-- calendar_entry_id: un bucket_item punta al massimo a UN calendar_entries
-- (M6A) condiviso della stessa coppia. La FK garantisce l'esistenza della
-- riga; couple/shared-only non sono esprimibili da una FK e sono imposti dal
-- trigger sotto. ON DELETE RESTRICT: cancellare l'evento condiviso che
-- ancora "spiega" uno scheduled/lived sarebbe una perdita di storia silenziosa
-- se rimpiazzata da un SET NULL — RESTRICT la rende un rifiuto esplicito e
-- leggibile invece di un effetto collaterale del check sottostante.
alter table public.bucket_items
  add constraint bucket_items_calendar_entry_id_fkey
    foreign key (calendar_entry_id) references public.calendar_entries(id) on delete restrict;

-- Un solo bucket_item per calendar_entries: il link è 1:1, mai condiviso fra
-- più idee (indice parziale: più righe con calendar_entry_id NULL restano
-- ammesse, NULL non collide mai con se stesso in Postgres).
create unique index bucket_items_calendar_entry_id_key
  on public.bucket_items (calendar_entry_id)
  where calendar_entry_id is not null;

-- Coerenza stato/link: idea non ha ancora un evento (si collega
-- contestualmente al passaggio a scheduled, futuro M7C); scheduled lo
-- richiede sempre (non esiste ancora un modo di programmare un'idea senza
-- collegarla a un giorno reale). lived NON lo richiede: un'idea può essere
-- vissuta senza mai passare da scheduled (nessuna UI M7C esiste ancora, e i
-- client legacy che conoscono solo il booleano `completed` non sanno cosa
-- sia un calendar_entry), e le righe storiche già completed nel contratto
-- legacy sono state backfillate a lived senza alcun link sopra — quindi
-- lived tollera calendar_entry_id sia null che valorizzato. Quando un link è
-- comunque presente (scheduled->lived passando dal calendario, o un lived
-- collegato da un futuro M7C), FK/couple/shared-only restano sempre imposti
-- dalla guardia sotto, indipendentemente da questo check. archived è libero
-- in entrambi i sensi (può arrivare da idea, mai stata linkata, o da
-- scheduled/lived, link preservato come storia).
alter table public.bucket_items
  add constraint bucket_items_status_calendar_link_check
    check (
      (status = 'idea' and calendar_entry_id is null)
      or (status = 'scheduled' and calendar_entry_id is not null)
      or (status = 'lived')
      or (status = 'archived')
    );

-- 2. ACL: le default privileges di progetto lascerebbero comunque
-- TRUNCATE/REFERENCES/TRIGGER/MAINTAIN raggiungibili (RLS non li copre). La
-- tabella preesiste già con grant/RLS coerenti secondo il recon di
-- produzione; li ribadiamo qui per rendere il contratto verificabile da
-- questo repo invece che solo dalla history di produzione non tracciata.
revoke all on table public.bucket_items from anon, authenticated;
grant select, insert, update, delete on table public.bucket_items to authenticated;

-- 3. Guardia link: calendar_entry_id deve appartenere alla stessa coppia ed
-- essere SEMPRE una riga shared (mai un personal event del partner: un'idea
-- di coppia non può "diventare" l'agenda privata di una sola persona).
create or replace function private.bucket_items_guard_calendar_link(
  p_couple_id uuid,
  p_calendar_entry_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Prefixed v_*: a bare `entry_type` here would be ambiguous with
  -- calendar_entries.entry_type in the SELECT below (PL/pgSQL cannot tell
  -- whether the target-list identifier means the variable or the column),
  -- so the source column is also alias-qualified (ce.*) to make the query
  -- side unambiguous too, not just the variable side.
  v_couple_id uuid;
  v_entry_type text;
begin
  if p_calendar_entry_id is null then
    return;
  end if;

  select ce.couple_id, ce.entry_type
  into v_couple_id, v_entry_type
  from public.calendar_entries ce
  where ce.id = p_calendar_entry_id;

  if v_couple_id is null then
    raise exception using errcode = '23503', message = 'bucket_items_calendar_entry_not_found';
  end if;

  if v_couple_id <> p_couple_id then
    raise exception using errcode = '42501', message = 'bucket_items_calendar_entry_cross_couple';
  end if;

  if v_entry_type <> 'shared' then
    raise exception using errcode = '42501', message = 'bucket_items_calendar_entry_not_shared';
  end if;
end;
$$;

revoke all on function private.bucket_items_guard_calendar_link(uuid, uuid) from public, anon, authenticated;

-- 4. Trigger INSERT: la colonna `status` non può nascere già scheduled/
-- lived/archived (quel salto bypasserebbe la whitelist di transizione
-- dell'update trigger sotto) — questo resta vero anche per un client
-- legacy, che infatti non conosce affatto `status` e non lo tocca mai. Un
-- client legacy conosce solo il booleano `completed`: se lo manda già true
-- in insert (es. un import storico di un'idea già vissuta), è una lived
-- dichiarata alla nascita, non una bugia su un'idea nuova — viene quindi
-- mappata a status='lived' invece di essere silenziosamente scartata (il
-- bug corretto qui: la versione precedente forzava sempre completed=false
-- su ogni insert, cancellando quel booleano). completed_at è sempre
-- server-side now(), mai il valore eventualmente inviato dal chiamante. Un
-- eventuale link iniziale è comunque validato in entrambi i casi.
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

  perform private.bucket_items_guard_calendar_link(new.couple_id, new.calendar_entry_id);

  if new.completed then
    new.status := 'lived';
    new.completed_at := now();
  else
    new.completed := false;
    new.completed_at := null;
  end if;

  return new;
end;
$$;

revoke all on function private.bucket_items_guard_insert() from public, anon, authenticated;

create trigger bucket_items_guard_insert
before insert on public.bucket_items
for each row execute function private.bucket_items_guard_insert();

-- 5. Trigger UPDATE: couple_id è immutabile senza eccezioni; created_by è
-- immutabile con lo stesso carve-out di sessione locale usato da M6A per
-- calendar_entries, per non rompere il trasferimento di re-pair di
-- claim_us_role (vedi la migration successiva). Le transizioni di lifecycle
-- sono una whitelist esplicita: qualunque salto non elencato è rifiutato,
-- incluso archived -> * (terminale) e lived -> idea/scheduled (nessuna
-- retrocessione). idea -> lived è in whitelist accanto a scheduled -> lived:
-- un'idea può essere vissuta senza mai passare da scheduled, sia perché non
-- esiste ancora una UI M7C che obblighi a collegare un calendar_entries, sia
-- perché un client legacy che scrive solo il booleano `completed` non ha
-- alcun concetto di "scheduled" da attraversare. Il link è rivalidato se
-- cambia.
--
-- Compatibilità booleano legacy: un client pre-M7A non conosce `status`,
-- solo `completed`. Se un update lascia `status` invariato (il client non lo
-- tocca) ma alza `completed` da false a true, è esattamente lo stesso intento
-- di un client M7A-aware che scrive status='lived' — viene quindi risolto
-- alla stessa transizione, soggetta alla stessa whitelist sopra (quindi
-- rifiutata se old.status è già archived: la scrittura legacy non bypassa il
-- terminale). Se invece un update lascia `status` invariato ma abbassa
-- `completed` da true a false (old.status già 'lived'), è un tentativo di
-- retrocessione mascherato da scrittura legacy e viene rifiutato con lo
-- stesso errcode delle transizioni illegali, mai applicato silenziosamente.
-- Un client M7A-aware che scrive `status` esplicitamente ha sempre la
-- precedenza su questa risoluzione legacy (la branch sotto si attiva solo a
-- status invariato).
--
-- completed/completed_at restano derivati da status, sempre: il client non
-- può scriverli direttamente (new.completed_at è ignorato: mai letto sotto),
-- completed_at è sempre server-side now() alla primissima transizione a
-- lived e resta "sticky" (mai riscritto) da lì in poi, anche attraverso
-- lived -> archived, perché archiviare non deve cancellare la prova che
-- l'idea è stata vissuta.
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

create trigger bucket_items_guard_update
before update on public.bucket_items
for each row execute function private.bucket_items_guard_update();

-- 6. Guardia hard-delete: cancellare una riga è permesso solo se non porta
-- nessuna storia da perdere — idea o archived, e mai collegata a un evento.
-- Uno scheduled/lived (o un archived che porta ancora il link storico) non
-- si cancella mai: si archivia. Trigger invece di sostituire la policy
-- DELETE di produzione (il cui nome esatto non è nel recon disponibile a
-- questa migration): la guardia vale comunque, indipendentemente da quale
-- sia la policy RLS attuale o futura.
create or replace function private.bucket_items_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status not in ('idea', 'archived') or old.calendar_entry_id is not null then
    raise exception using errcode = '42501', message = 'bucket_items_delete_requires_unlinked_idea_or_archived';
  end if;

  return old;
end;
$$;

revoke all on function private.bucket_items_guard_delete() from public, anon, authenticated;

create trigger bucket_items_guard_delete
before delete on public.bucket_items
for each row execute function private.bucket_items_guard_delete();
