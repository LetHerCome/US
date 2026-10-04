-- US 2.0 F2A.3 — Retention & Operations read-only pack
begin transaction read only;

-- r01. Database and technical-table sizes.
select jsonb_build_object(
  'database_bytes', pg_database_size(current_database()),
  'cron_job_run_details_rows', (select count(*) from cron.job_run_details),
  'cron_job_run_details_bytes', pg_total_relation_size('cron.job_run_details'::regclass),
  'push_event_log_rows', (select count(*) from public.push_event_log),
  'widget_action_tokens_rows', (select count(*) from public.widget_action_tokens)
) as f2a3_r01_sizes;

-- r02. Cron health and growth.
select coalesce(jsonb_agg(to_jsonb(x) order by x.jobid), '[]'::jsonb) as f2a3_r02_cron
from (
  select j.jobid,j.jobname,j.schedule,j.active,j.username,
         count(d.*)::bigint as runs_total,
         count(*) filter (where d.start_time >= now()-interval '7 days')::bigint as runs_7d,
         count(*) filter (where d.start_time >= now()-interval '7 days' and d.status <> 'succeeded')::bigint as non_success_7d,
         min(d.start_time) as oldest,max(d.start_time) as newest
  from cron.job j
  left join cron.job_run_details d on d.jobid=j.jobid
  group by j.jobid,j.jobname,j.schedule,j.active,j.username
) x;

-- r03. Retention preview; counts only.
select jsonb_build_object(
  'cron_success_14d', (select count(*) from cron.job_run_details where status='succeeded' and end_time < now()-interval '14 days'),
  'cron_failure_30d', (select count(*) from cron.job_run_details where status<>'succeeded' and end_time < now()-interval '30 days'),
  'push_event_log_180d', (select count(*) from public.push_event_log where created_at < now()-interval '180 days'),
  'widget_action_tokens_30d', (select count(*) from public.widget_action_tokens where revoked_at < now()-interval '30 days' or expires_at < now()-interval '30 days'),
  'widget_tokens_30d', (select count(*) from public.widget_tokens where revoked_at < now()-interval '30 days'),
  'setup_codes_30d', (select count(*) from public.widget_scriptable_setup_codes where (consumed_at is not null and consumed_at < now()-interval '30 days') or (revoked_at is not null and revoked_at < now()-interval '30 days') or expires_at < now()-interval '30 days'),
  'installations_30d', (select count(*) from public.widget_scriptable_installations where (revoked_at is not null and revoked_at < now()-interval '30 days') or expires_at < now()-interval '30 days'),
  'left_cleanup_queue_30d', (select count(*) from private.left_for_you_cleanup_queue where completed_at < now()-interval '30 days')
) as f2a3_r03_retention_preview;

-- r04. Widget lifecycle; never expose hashes.
select jsonb_build_object(
  'action_tokens_total', count(*),
  'action_tokens_revoked', count(*) filter (where revoked_at is not null),
  'action_tokens_active', count(*) filter (where revoked_at is null and expires_at > now()),
  'action_tokens_expired', count(*) filter (where expires_at <= now()),
  'revoked_older_30d', count(*) filter (where revoked_at < now()-interval '30 days')
) as f2a3_r04_widget
from public.widget_action_tokens;

-- r05. Left-for-You cleanup readiness.
select jsonb_build_object(
  'rows_total', count(*),
  'eligible_30d', count(*) filter (
    where cleanup_eligible_at is not null and seen_at is not null
      and seen_at < now()-interval '30 days'
      and not exists (select 1 from public.conserva_contributions c where c.source_item_id=left_for_you.id)
  ),
  'oldest_seen_at', min(seen_at) filter (where seen_at is not null)
) as f2a3_r05_left_for_you
from public.left_for_you;

-- r06. Storage orphan monitor; counts/bytes only, no paths.
with refs(path) as (
  select home_photo_path from public.couples where home_photo_path is not null
  union select avatar_path from public.profiles where avatar_path is not null
  union select storage_path from public.moments where storage_path is not null
  union select storage_path from public.moment_photos where storage_path is not null
  union select media_path from public.left_for_you where media_path is not null
  union select media_path from public.stories where media_path is not null
  union select media_path from private.left_for_you_cleanup_queue where media_path is not null and completed_at is null
)
select jsonb_build_object(
  'objects_total', count(*),
  'unreferenced', count(*) filter (where r.path is null),
  'bytes_total', coalesce(sum((o.metadata->>'size')::bigint),0),
  'bytes_unreferenced', coalesce(sum((o.metadata->>'size')::bigint) filter (where r.path is null),0),
  'oldest_unreferenced', min(o.created_at) filter (where r.path is null)
) as f2a3_r06_storage
from storage.objects o
left join refs r on r.path=o.name
where o.bucket_id='us-media';

-- r07. Required operational configuration names only; never decrypted values.
select jsonb_build_object(
  'vault_names', coalesce(jsonb_agg(name order by name), '[]'::jsonb),
  'cleanup_cron_key_present', bool_or(name='us_left_for_you_cleanup_cron_key')
) as f2a3_r07_vault
from vault.secrets;

rollback;
