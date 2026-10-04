-- Production ledger 20260818190722 anonymous_private_pairing_v2: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 36c2be8c20eb446dcedf2d05cd816a31; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

create schema if not exists private;

create or replace function private.current_couple_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select couple_id from public.profiles where id = auth.uid()
$$;

revoke all on function public.current_couple_id() from public, anon, authenticated;
revoke all on function public.join_us(text,text) from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.current_couple_id() to authenticated;

-- Move RLS helper references to the non-exposed private schema.
drop policy if exists couples_select_own on public.couples;
create policy couples_select_own on public.couples
for select to authenticated
using (id = private.current_couple_id());

drop policy if exists profiles_select_same_couple on public.profiles;
create policy profiles_select_same_couple on public.profiles
for select to authenticated
using (id = auth.uid() or couple_id = private.current_couple_id());

drop policy if exists daily_answers_insert_own on public.daily_answers;
create policy daily_answers_insert_own on public.daily_answers
for insert to authenticated
with check (user_id = auth.uid() and couple_id = private.current_couple_id());

drop policy if exists daily_answers_update_own on public.daily_answers;
create policy daily_answers_update_own on public.daily_answers
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid() and couple_id = private.current_couple_id());

drop policy if exists daily_answers_read_same_couple on public.daily_answers;
create policy daily_answers_read_own on public.daily_answers
for select to authenticated
using (user_id = auth.uid());

drop policy if exists quiz_responses_insert_own on public.quiz_responses;
create policy quiz_responses_insert_own on public.quiz_responses
for insert to authenticated
with check (user_id = auth.uid() and couple_id = private.current_couple_id());

drop policy if exists quiz_responses_update_own on public.quiz_responses;
create policy quiz_responses_update_own on public.quiz_responses
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid() and couple_id = private.current_couple_id());

drop policy if exists quiz_responses_read_same_couple on public.quiz_responses;
create policy quiz_responses_read_own on public.quiz_responses
for select to authenticated
using (user_id = auth.uid());

drop policy if exists bucket_read_same_couple on public.bucket_items;
create policy bucket_read_same_couple on public.bucket_items
for select to authenticated using (couple_id = private.current_couple_id());
drop policy if exists bucket_insert_same_couple on public.bucket_items;
create policy bucket_insert_same_couple on public.bucket_items
for insert to authenticated with check (couple_id = private.current_couple_id() and created_by = auth.uid());
drop policy if exists bucket_update_same_couple on public.bucket_items;
create policy bucket_update_same_couple on public.bucket_items
for update to authenticated using (couple_id = private.current_couple_id()) with check (couple_id = private.current_couple_id());
drop policy if exists bucket_delete_same_couple on public.bucket_items;
create policy bucket_delete_same_couple on public.bucket_items
for delete to authenticated using (couple_id = private.current_couple_id());

drop policy if exists messages_read_own_couple on public.shared_messages;
create policy messages_read_own_couple on public.shared_messages
for select to authenticated
using (couple_id = private.current_couple_id() and (sender_id = auth.uid() or recipient_id = auth.uid()));
drop policy if exists messages_insert_own on public.shared_messages;
create policy messages_insert_own on public.shared_messages
for insert to authenticated
with check (couple_id = private.current_couple_id() and sender_id = auth.uid());
drop policy if exists messages_update_recipient on public.shared_messages;
create policy messages_update_recipient on public.shared_messages
for update to authenticated
using (recipient_id = auth.uid())
with check (couple_id = private.current_couple_id() and recipient_id = auth.uid());

drop policy if exists moods_read_same_couple on public.moods;
create policy moods_read_same_couple on public.moods
for select to authenticated using (couple_id = private.current_couple_id());
drop policy if exists moods_insert_own on public.moods;
create policy moods_insert_own on public.moods
for insert to authenticated with check (couple_id = private.current_couple_id() and user_id = auth.uid());
drop policy if exists moods_update_own on public.moods;
create policy moods_update_own on public.moods
for update to authenticated using (user_id = auth.uid()) with check (couple_id = private.current_couple_id() and user_id = auth.uid());

drop policy if exists activity_read_same_couple on public.activity;
create policy activity_read_same_couple on public.activity
for select to authenticated using (couple_id = private.current_couple_id());
drop policy if exists activity_insert_same_couple on public.activity;
create policy activity_insert_same_couple on public.activity
for insert to authenticated with check (couple_id = private.current_couple_id() and actor_id = auth.uid());

create or replace function public.claim_us_role(invite_code text, chosen_role text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  inv public.couple_invites%rowtype;
  old_uid uuid;
  display text;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  if chosen_role not in ('francesco','beatrice') then
    raise exception 'Invalid role';
  end if;

  select * into inv
  from public.couple_invites
  where code_hash = encode(digest(upper(trim(invite_code)), 'sha256'), 'hex')
    and role = chosen_role
  for update;

  if inv.id is null then
    raise exception 'Invalid private code';
  end if;

  if exists (
    select 1 from public.profiles
    where id = uid and (couple_id is distinct from inv.couple_id or role is distinct from chosen_role)
  ) then
    raise exception 'This device is already linked to another profile';
  end if;

  select id into old_uid
  from public.profiles
  where couple_id = inv.couple_id and role = chosen_role
  limit 1;

  display := case chosen_role when 'francesco' then 'Francesco' else 'Beatrice' end;

  if old_uid is not null and old_uid <> uid then
    -- Transfer data owned by the previous account for this role.
    update public.daily_answers set user_id = uid where user_id = old_uid and couple_id = inv.couple_id;
    update public.quiz_responses set user_id = uid where user_id = old_uid and couple_id = inv.couple_id;
    update public.bucket_items set created_by = uid where created_by = old_uid and couple_id = inv.couple_id;
    update public.shared_messages set sender_id = uid where sender_id = old_uid and couple_id = inv.couple_id;
    update public.shared_messages set recipient_id = uid where recipient_id = old_uid and couple_id = inv.couple_id;
    update public.moods set user_id = uid where user_id = old_uid and couple_id = inv.couple_id;
    update public.activity set actor_id = uid where actor_id = old_uid and couple_id = inv.couple_id;
    update public.couple_invites set used_by = uid, used_at = now() where id = inv.id;
    delete from public.profiles where id = old_uid;
  end if;

  insert into public.profiles(id, display_name, couple_id, role)
  values (uid, display, inv.couple_id, chosen_role)
  on conflict (id) do update
    set display_name = excluded.display_name,
        couple_id = excluded.couple_id,
        role = excluded.role;

  update public.couple_invites
  set used_by = uid, used_at = now()
  where id = inv.id;

  return jsonb_build_object('couple_id', inv.couple_id, 'role', chosen_role, 'display_name', display);
end;
$$;

revoke all on function public.claim_us_role(text,text) from public, anon;
grant execute on function public.claim_us_role(text,text) to authenticated;

create or replace function public.get_daily_state(target_question_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cid uuid;
  mine text;
  partner_answer text;
  answered_count integer;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select couple_id into cid from public.profiles where id = uid;
  if cid is null then raise exception 'Profile not linked'; end if;

  select answer into mine
  from public.daily_answers
  where question_id = target_question_id and couple_id = cid and user_id = uid;

  select count(*) into answered_count
  from public.daily_answers
  where question_id = target_question_id and couple_id = cid;

  if answered_count >= 2 then
    select answer into partner_answer
    from public.daily_answers
    where question_id = target_question_id and couple_id = cid and user_id <> uid
    limit 1;
  end if;

  return jsonb_build_object(
    'my_answer', mine,
    'partner_has_answer', exists(
      select 1 from public.daily_answers
      where question_id = target_question_id and couple_id = cid and user_id <> uid
    ),
    'both_answered', answered_count >= 2,
    'partner_answer', partner_answer
  );
end;
$$;

revoke all on function public.get_daily_state(uuid) from public, anon;
grant execute on function public.get_daily_state(uuid) to authenticated;;
