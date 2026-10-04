-- US backend recovered source: storage_realtime.sql
-- us-media bucket, storage.objects policies and supabase_realtime membership.
-- GENERATED from the production capture by scripts/build-supabase-baseline.mjs.
-- A documentation slice of supabase/baseline (same text, same order). It is not
-- a migration and is not applied by itself; the baseline files are.

-- from 80_realtime.sql
alter publication supabase_realtime add table only public.bond_weekly_quests;
alter publication supabase_realtime add table only public.couple_locations;
alter publication supabase_realtime add table only public.couples;
alter publication supabase_realtime add table only public.daily_answers;
alter publication supabase_realtime add table only public.left_for_you;
alter publication supabase_realtime add table only public.moment_photos;
alter publication supabase_realtime add table only public.moments;
alter publication supabase_realtime add table only public.quiz_responses;
alter publication supabase_realtime add table only public.relationship_milestones;
alter publication supabase_realtime add table only public.shared_event_completions;
alter publication supabase_realtime add table only public.shared_events;
alter publication supabase_realtime add table only public.shared_messages;
alter publication supabase_realtime add table only public.stories;
alter publication supabase_realtime add table only public.story_views;
alter publication supabase_realtime add table only public.think_reactions;

-- from 85_storage.sql
insert into storage.buckets (allowed_mime_types, avif_autodetection, file_size_limit, id, lifecycle_configuration, lifecycle_configuration_generation, name, public, type, versioning_status)
select allowed_mime_types, avif_autodetection, file_size_limit, id, lifecycle_configuration, lifecycle_configuration_generation, name, public, type, versioning_status
from jsonb_populate_record(null::storage.buckets, $bucket${"allowed_mime_types":["image/jpeg","image/png","image/webp","image/heic","image/heif","audio/webm","audio/mp4","audio/mpeg","audio/ogg","video/mp4","video/webm","video/quicktime"],"avif_autodetection":false,"file_size_limit":41943040,"id":"us-media","lifecycle_configuration":null,"lifecycle_configuration_generation":null,"name":"us-media","public":false,"type":"STANDARD","versioning_status":"DISABLED"}$bucket$::jsonb)
on conflict (id) do update set allowed_mime_types = excluded.allowed_mime_types, avif_autodetection = excluded.avif_autodetection, file_size_limit = excluded.file_size_limit, lifecycle_configuration = excluded.lifecycle_configuration, lifecycle_configuration_generation = excluded.lifecycle_configuration_generation, name = excluded.name, public = excluded.public, type = excluded.type, versioning_status = excluded.versioning_status;
create policy us_media_delete_own on storage.objects as permissive for delete to authenticated
  using (((bucket_id = 'us-media'::text) AND (owner_id = ( SELECT (auth.uid())::text AS uid)) AND ((storage.foldername(name))[1] = ( SELECT (private.current_couple_id())::text AS current_couple_id))));
create policy us_media_insert_own_folder on storage.objects as permissive for insert to authenticated
  with check (((bucket_id = 'us-media'::text) AND ((storage.foldername(name))[1] = ( SELECT (private.current_couple_id())::text AS current_couple_id)) AND ((storage.foldername(name))[2] = ( SELECT (auth.uid())::text AS uid))));
create policy us_media_select_same_couple on storage.objects as permissive for select to authenticated
  using (((bucket_id = 'us-media'::text) AND ((storage.foldername(name))[1] = ( SELECT (private.current_couple_id())::text AS current_couple_id))));
create policy us_media_update_own on storage.objects as permissive for update to authenticated
  using (((bucket_id = 'us-media'::text) AND (owner_id = ( SELECT (auth.uid())::text AS uid)) AND ((storage.foldername(name))[1] = ( SELECT (private.current_couple_id())::text AS current_couple_id))))
  with check (((bucket_id = 'us-media'::text) AND (owner_id = ( SELECT (auth.uid())::text AS uid)) AND ((storage.foldername(name))[1] = ( SELECT (private.current_couple_id())::text AS current_couple_id)) AND ((storage.foldername(name))[2] = ( SELECT (auth.uid())::text AS uid))));
