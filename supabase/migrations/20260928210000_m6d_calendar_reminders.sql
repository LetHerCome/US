-- M6D — Calendar Reminders.
--
-- Reminder semplici e couple-scoped per gli eventi di public.calendar_entries.
-- Niente ricorrenze, niente snooze, niente AI: un destinatario, un offset,
-- un invio. La tabelle dei reminder NON duplica gli eventi: referenzia la
-- riga autoritativa di calendar_entries (M6A) e ne eredità i tempi al
-- momento dell'invio (il worker calcola il momento della notifica dai campi
-- reali dell'evento, così una modifica all'evento sposta o cancella i
-- reminder senza copie derivate da aggiornare).
--
-- Additive only. Forward-only. Non tocca calendar_entries (solo foreign key
-- in uscita), push_subscriptions, push_event_log, notification_preferences.

-- Helper per il check constraint sopra ( SECURITY DEFINER: legge profiles
-- senza richiedere policy RLS supplementari dentro un check constraint).
create or replace function public.calendar_reminder_recipient_in_couple(
  p_couple_id uuid,
  p_recipient_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = p_recipient_id and couple_id = p_couple_id
  );
$$;

revoke all on function public.calendar_reminder_recipient_in_couple(uuid, uuid) from public, anon;
grant execute on function public.calendar_reminder_recipient_in_couple(uuid, uuid) to authenticated;

create table public.calendar_reminders (
  id uuid not null default gen_random_uuid() primary key,
  couple_id uuid not null references public.couples(id) on delete cascade,
  entry_id uuid not null references public.calendar_entries(id) on delete cascade,
  -- Il destinatario della notifica: sempre un profilo della stessa coppia.
  -- "Me" = creator; "Partner" = l'altro profilo; "Entrambi" = due righe
  -- (una per partner), mai una colonna separata: una riga = un invio.
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  -- Offset dalla finestra dell'evento, in minuti. La semantica "quando"
  -- dipende dal tipo di evento ed è calcolata dal worker al momento
  -- dell'invio (timed: prima di starts_at; all-day: il pomeriggio prima
  -- del giorno, ora fissa 18:00 Europe/Rome — mai una conversione
  -- fuso salvata nello schema).
  offset_minutes int not null,
  -- Chi ha chiesto il reminder: il creatore dell'entry. Serve alla copia
  -- ("Francesco ti ricorda — …") e alla regola "il destinatario deve
  -- sapere chi lo ha creato". Per un personal entry è sempre l'owner.
  requested_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Sent tracking: null = in attesa. Un invio riuscito imposta sent_at;
  -- il worker non ritenta una riga già inviata (no spam/duplicati).
  sent_at timestamptz,

  constraint calendar_reminders_offset_check
    check (offset_minutes in (10, 30, 60, 1440)),

  -- All-day: solo "1 giorno prima" — un reminder 10/30/60 min prima non
  -- ha senso per una giornata senza ora (la UI nasconde le opzioni; il
  -- check lo impone anche server-side).
  constraint calendar_reminders_allday_offset_check
    check (
      not exists (
        select 1 from public.calendar_entries e
        where e.id = entry_id and e.is_all_day and offset_minutes <> 1440
      )
    ),

  -- Un reminder per evento/destinatario/offset: la modifica della scelta
  -- nel form è sempre update/delete della riga, mai un secondo insert
  -- (no duplicati a livello di constraint, non solo di UX).
  constraint calendar_reminders_entry_recipient_offset_unique
    unique (entry_id, recipient_id, offset_minutes),

  -- Il destinatario appartiene alla stessa coppia dell'evento (isolation).
  constraint calendar_reminders_recipient_in_couple_check
    check (public.calendar_reminder_recipient_in_couple(couple_id, recipient_id))
);

create index calendar_reminders_pending_idx
  on public.calendar_reminders (offset_minutes, recipient_id)
  where sent_at is null;

create index calendar_reminders_entry_idx
  on public.calendar_reminders (entry_id);

-- ACL minimo, come da convenzione repo (le default privileges del progetto
-- concedono troppo su ogni tabella nuova; restringiamo).
revoke all on table public.calendar_reminders from anon, authenticated;
grant select, insert, update, delete on table public.calendar_reminders to authenticated;

alter table public.calendar_reminders enable row level security;
alter table public.calendar_reminders force row level security;

-- SELECT: i partner leggono i reminder della propria coppia (il destinatario
-- vede i suoi, ma anche il creator vede ciò che ha chiesto per il partner —
-- nessun reminder nascosto, come da regola M6D).
create policy calendar_reminders_select_couple
  on public.calendar_reminders
  for select to authenticated
  using (couple_id = private.current_couple_id());

-- INSERT: solo per se stessi come DESTINATARI? No: qui si crea a nome del
-- partner (è il caso "Ricordamelo → Partner"), quindi la policy verifica
-- che il richiedente sia della coppia, il destinatario sia uno dei due
-- profili della coppia, e requested_by sia il richiedente stesso.
create policy calendar_reminders_insert_couple
  on public.calendar_reminders
  for insert to authenticated
  with check (
    couple_id = private.current_couple_id()
    and requested_by = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = recipient_id and p.couple_id = couple_id
    )
    and exists (
      select 1 from public.calendar_entries e
      where e.id = entry_id
        and e.couple_id = couple_id
        -- personal: solo l'owner può mettere un reminder sul SUO evento
        -- (il partner non aggiunge reminder a un evento personale altrui).
        -- shared: chiunque della coppia (authority M6A per la lettura).
        and (e.entry_type = 'shared' or e.owner_id = auth.uid())
    )
  );

-- UPDATE/DELETE: solo chi ha richiesto il reminder (o il worker di sistema
-- che imposta sent_at — servizio separato, non via RLS utente).
create policy calendar_reminders_update_requester
  on public.calendar_reminders
  for update to authenticated
  using (couple_id = private.current_couple_id() and requested_by = auth.uid())
  with check (couple_id = private.current_couple_id() and requested_by = auth.uid());

create policy calendar_reminders_delete_requester
  on public.calendar_reminders
  for delete to authenticated
  using (couple_id = private.current_couple_id() and requested_by = auth.uid());



-- Il worker di sistema (Edge Function con service role) aggiorna sent_at e
-- legge le righe in attesa: bypassa RLS via service role, ma gli diamo anche
-- i grant espliciti (come da pattern send-web-push sulle tabelle push).
-- Nessun grant extra all'utente: sent_at non è modificabile dal client.

-- ⚠️ NOTA DEPLOY: questa migration NON include il cron job pg_cron per il
-- worker dei reminder: viene registrata separatamente al deploy della Edge
-- Function (stesso pattern monthiversary-job), con la cron key in vault.
-- Il cron schedule vive nella repo solo come documentazione del worker
-- (supabase/functions/calendar-reminders-worker/README.md), perché la chiave
-- non è committabile.
