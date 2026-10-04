-- Production ledger 20260821122729 fix_repair_claim_us_role_order: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 1060f46f72e5faa72837d00a44727389; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

create or replace function public.claim_us_role(invite_code text, chosen_role text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','extensions'
as $function$
declare
  uid uuid := auth.uid();
  inv public.couple_invites%rowtype;
  old_uid uuid;
  old_avatar text;
  display text;
  is_anon boolean;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  select coalesce((raw_app_meta_data->>'provider') = 'anonymous', false)
      or coalesce((raw_user_meta_data->>'is_anonymous')::boolean, false)
      or email is null
  into is_anon
  from auth.users where id = uid;

  if not coalesce(is_anon, false) then
    raise exception 'Anonymous session required for private pairing';
  end if;

  if chosen_role not in ('francesco','beatrice') then
    raise exception 'Invalid role';
  end if;

  select * into inv
  from public.couple_invites
  where code_hash = encode(extensions.digest(upper(trim(invite_code))::text, 'sha256'::text), 'hex')
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

  select id, avatar_path into old_uid, old_avatar
  from public.profiles
  where couple_id = inv.couple_id and role = chosen_role
  order by created_at asc
  limit 1;

  display := case chosen_role when 'francesco' then 'Francesco' else 'Beatrice' end;

  if old_uid is not null and old_uid <> uid then
    -- Create the new profile FIRST so all profile foreign keys can safely move.
    insert into public.profiles(id, display_name, couple_id, role, avatar_path)
    values (uid, display, inv.couple_id, chosen_role, old_avatar)
    on conflict (id) do update
      set display_name = excluded.display_name,
          couple_id = excluded.couple_id,
          role = excluded.role,
          avatar_path = coalesce(public.profiles.avatar_path, excluded.avatar_path);

    -- Historical data.
    update public.daily_answers set user_id = uid where user_id = old_uid and couple_id = inv.couple_id;
    update public.quiz_responses set user_id = uid where user_id = old_uid and couple_id = inv.couple_id;
    update public.bucket_items set created_by = uid where created_by = old_uid and couple_id = inv.couple_id;
    update public.shared_messages set sender_id = uid where sender_id = old_uid and couple_id = inv.couple_id;
    update public.shared_messages set recipient_id = uid where recipient_id = old_uid and couple_id = inv.couple_id;
    update public.moods set user_id = uid where user_id = old_uid and couple_id = inv.couple_id;
    update public.activity set actor_id = uid where actor_id = old_uid and couple_id = inv.couple_id;

    -- Current US data.
    update public.couple_locations set user_id = uid where user_id = old_uid and couple_id = inv.couple_id;
    update public.device_push_tokens set user_id = uid where user_id = old_uid and couple_id = inv.couple_id;
    update public.moments set created_by = uid where created_by = old_uid and couple_id = inv.couple_id;
    update public.moment_photos set created_by = uid where created_by = old_uid and couple_id = inv.couple_id;
    update public.notification_preferences set user_id = uid where user_id = old_uid;
    update public.partner_knowledge_attempts set user_id = uid where user_id = old_uid and couple_id = inv.couple_id;
    update public.push_event_log set sender_id = uid where sender_id = old_uid and couple_id = inv.couple_id;
    update public.push_subscriptions set user_id = uid where user_id = old_uid and couple_id = inv.couple_id;
    update public.shared_event_completions set completed_by = uid where completed_by = old_uid and couple_id = inv.couple_id;
    update public.shared_events set created_by = uid where created_by = old_uid and couple_id = inv.couple_id;
    update public.stories set author_id = uid where author_id = old_uid and couple_id = inv.couple_id;
    update public.story_views set viewer_id = uid where viewer_id = old_uid;
    update public.widget_tokens set profile_id = uid where profile_id = old_uid and couple_id = inv.couple_id;

    update public.couple_invites set used_by = uid, used_at = now() where id = inv.id;
    delete from public.profiles where id = old_uid;
  else
    insert into public.profiles(id, display_name, couple_id, role, avatar_path)
    values (uid, display, inv.couple_id, chosen_role, old_avatar)
    on conflict (id) do update
      set display_name = excluded.display_name,
          couple_id = excluded.couple_id,
          role = excluded.role,
          avatar_path = coalesce(public.profiles.avatar_path, excluded.avatar_path);
  end if;

  update public.couple_invites
  set used_by = uid, used_at = now()
  where id = inv.id;

  return jsonb_build_object('couple_id', inv.couple_id, 'role', chosen_role, 'display_name', display);
end;
$function$;;
