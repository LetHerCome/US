-- The data export on request (Edge export-user-data, D-7 in
-- docs/store/US_S3_2_ACCOUNT_DELETION_V1.md) covers what came after it
-- (03/11/2026): the shared notes the person wrote or last edited, their
-- battery reading and their "Come stai". Same function as 20261014120000,
-- plus those three entries; partner ids are stripped as before (updated_by
-- too). Still service_role only. Re-applying this migration changes nothing.
create or replace function public.s32_export_user_data(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare cid uuid; prof jsonb; cpl jsonb; media text[];
  strip constant text[] := array['couple_id','recipient_id','owner_id','user_id','sender_id','created_by','author_id','profile_id'];
begin
  if p_user is null then raise exception using errcode = '22023', message = 'user_required'; end if;
  if not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception using errcode = 'P0002', message = 'user_not_found';
  end if;
  select p.couple_id, pg_catalog.jsonb_build_object('display_name', p.display_name, 'role', p.role, 'created_at', p.created_at)
    into cid, prof from public.profiles p where p.id = p_user;
  select pg_catalog.jsonb_build_object('name', c.name, 'started_on', c.started_on, 'created_at', c.created_at)
    into cpl from public.couples c where c.id = cid;

  select coalesce(pg_catalog.array_agg(distinct p order by p), '{}') into media from (
    select m.storage_path p from public.moments m where m.couple_id = cid and m.created_by = p_user
    union all select m.thumbnail_path from public.moments m where m.couple_id = cid and m.created_by = p_user
    union all select mp.storage_path from public.moment_photos mp where mp.couple_id = cid and mp.created_by = p_user
    union all select l.media_path from public.left_for_you l where l.couple_id = cid and l.sender_id = p_user
    union all select s.media_path from public.stories s where s.couple_id = cid and s.author_id = p_user
    union all select pr.avatar_path from public.profiles pr where pr.id = p_user
  ) x where p is not null and p <> '' and pg_catalog.starts_with(p, cid::text || '/');

  return pg_catalog.jsonb_build_object(
    'schema_version', 1,
    'user_id', p_user,
    'profile', prof,
    'couple', cpl,
    'personal', pg_catalog.jsonb_build_object(
      'daily_answers', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'question_date', q.question_date, 'question', q.question, 'answer', a.answer, 'created_at', a.created_at) order by a.created_at), '[]')
        from public.daily_answers a left join public.daily_questions q on q.id = a.question_id where a.user_id = p_user),
      'moods', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.created_at), '[]') from public.moods x where x.user_id = p_user),
      'quiz_responses', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.created_at), '[]') from public.quiz_responses x where x.user_id = p_user),
      'partner_knowledge_attempts', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.completed_at), '[]') from public.partner_knowledge_attempts x where x.user_id = p_user),
      'personal_calendar', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.created_at), '[]') from public.calendar_entries x where x.entry_type = 'personal' and x.owner_id = p_user),
      'location', (select pg_catalog.to_jsonb(x) - strip from public.couple_locations x where x.user_id = p_user),
      'notification_preferences', (select pg_catalog.to_jsonb(x) - strip from public.notification_preferences x where x.user_id = p_user),
      'battery', (select pg_catalog.to_jsonb(x) - strip from public.couple_batteries x where x.user_id = p_user),
      'member_status', (select pg_catalog.to_jsonb(x) - strip from public.member_status x where x.user_id = p_user)
    ),
    'created', pg_catalog.jsonb_build_object(
      'moments', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.created_at), '[]') from public.moments x where x.couple_id = cid and x.created_by = p_user),
      'moment_photos', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.created_at), '[]') from public.moment_photos x where x.couple_id = cid and x.created_by = p_user),
      'messages_sent', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.created_at), '[]') from public.shared_messages x where x.couple_id = cid and x.sender_id = p_user),
      'left_for_you_sent', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.created_at), '[]') from public.left_for_you x where x.couple_id = cid and x.sender_id = p_user),
      'stories', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.created_at), '[]') from public.stories x where x.couple_id = cid and x.author_id = p_user),
      'shared_calendar', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.created_at), '[]') from public.calendar_entries x where x.couple_id = cid and x.entry_type = 'shared' and x.created_by = p_user),
      'events', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip order by x.created_at), '[]') from public.shared_events x where x.couple_id = cid and x.created_by = p_user),
      'wishes', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip - 'lived_proposed_by' order by x.created_at), '[]') from public.bucket_items x where x.couple_id = cid and x.created_by = p_user),
      'couple_notes', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) - strip - 'updated_by' order by x.created_at), '[]') from public.couple_notes x where x.couple_id = cid and (x.created_by = p_user or x.updated_by = p_user))
    ),
    'media', pg_catalog.to_jsonb(media)
  );
end;
$fn$;
revoke all on function public.s32_export_user_data(uuid) from public, anon, authenticated;
grant execute on function public.s32_export_user_data(uuid) to service_role;
