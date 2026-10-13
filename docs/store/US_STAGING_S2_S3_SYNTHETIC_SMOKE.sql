-- US-STAGING ONLY. Disposable cross-couple smoke test, NO permanent Auth rows.
-- Explicitly refuses production and non-empty projects before touching data.
-- All synthetic inserts live inside a PL/pgSQL EXCEPTION subtransaction and
-- are deliberately rolled back on PZ001, including Auth users and FCM rows.
-- Real Auth signup, signed JWT, Android Firebase delivery are NOT exercised.
do $us_synthetic_s2_s3$
declare
 a constant uuid:='fa000000-0000-4000-8000-000000000001';
 b constant uuid:='fa000000-0000-4000-8000-000000000002';
 x constant uuid:='fa000000-0000-4000-8000-000000000003';
 c1 constant uuid:='fc000000-0000-4000-8000-000000000001';
 c2 constant uuid:='fc000000-0000-4000-8000-000000000002';
 inst constant uuid:='fd000000-0000-4000-8000-000000000001';
 a_result jsonb;
 b_result jsonb;
 x_result jsonb;
 removal jsonb;
 token text:='fcm:'||repeat('s',60);
begin
 if not exists(select 1 from supabase_migrations.schema_migrations
    where name='us_staging_baseline_from_20261004000000') then
   raise exception 'Refusing synthetic smoke on an unrecognized project: STAGING ONLY';
 end if;
 if exists(select 1 from public.profiles limit 1)
    or exists(select 1 from public.couples limit 1)
    or exists(select 1 from public.device_push_tokens limit 1)
    or exists(select 1 from cron.job where jobname like 'us-%' and active)
    or to_regprocedure('public.get_couple_week_participation_v1()') is null then
   raise exception 'STAGING must be empty, no active cron, S2 installed';
 end if;
 if exists(select 1 from auth.users where id in (a,b,x)) then
   raise exception 'synthetic account collision';
 end if;
 begin
  insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
   (a,'us-stage-a@example.invalid',now(),false),
   (b,'us-stage-b@example.invalid',now(),false),
   (x,'us-stage-x@example.invalid',now(),false);
  insert into public.couples(id,name,started_on) values
   (c1,'Synthetic Couple A',date '2026-01-01'),
   (c2,'Synthetic Couple B',date '2026-01-01');
  insert into public.profiles(id,display_name,couple_id,role) values
   (a,'Synthetic A',c1,'francesco'),
   (b,'Synthetic B',c1,'beatrice'),
   (x,'Synthetic X',c2,'francesco');
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  a_result:=public.get_couple_week_participation_v1();
  if a_result->>'timezone'<>'Europe/Rome'
      or (a_result->>'completed_days')::int<>0
      or jsonb_array_length(a_result->'days')<>7 then
   raise exception 'S2 invalid result for synthetic A';
  end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',b::text,true);
  b_result:=public.get_couple_week_participation_v1();
  if b_result is distinct from a_result then
   raise exception 'S2 same-couple partner summaries differ';
  end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',x::text,true);
  x_result:=public.get_couple_week_participation_v1();
  if (x_result->>'completed_days')::int<>0 then
   raise exception 'S2 cross-couple completion leaked';
  end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  perform public.register_native_push_device(inst,'android','fcm',token,null,null);
  if not exists(select 1 from public.device_push_tokens
      where installation_id=inst and user_id=a and couple_id=c1) then
   raise exception 'S3 FCM owner/couple incorrect';
  end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',x::text,true);
  removal:=public.unregister_native_push_device(inst);
  if removal->>'removed'<>'false' then
   raise exception 'S3 different couple revoked device';
  end if;
  begin
   perform public.register_native_push_device(inst,'android','fcm',token,null,null);
   raise exception 'S3 cross-owner token takeover was allowed';
  exception when insufficient_privilege then
   null; -- 42501 only. Any other SQLSTATE fails the smoke.
  end;
  if not exists(select 1 from public.device_push_tokens
      where installation_id=inst and user_id=a) then
   raise exception 'S3 original token owner was changed';
  end if;
  -- Always roll back the full synthetic seed, receipt and token operations.
  raise exception 'US_SYNTHETIC_ROLLBACK_SUCCESS' using errcode='PZ001';
 exception when sqlstate 'PZ001' then
  null; -- PL/pgSQL exception subtransaction automatically rolls back ALL writes.
 end;
end $us_synthetic_s2_s3$;

-- Verify again independently after running: synthetic users, profiles, couples
-- and native device tokens must all be zero and cron jobs all disabled.
select jsonb_build_object(
 'auth_synthetic_remaining',(select count(*) from auth.users where email like 'us-stage-%@example.invalid'),
 'profiles_remaining',(select count(*) from public.profiles),
 'couples_remaining',(select count(*) from public.couples),
 'device_tokens_remaining',(select count(*) from public.device_push_tokens),
 'us_cron_active',(select count(*) from cron.job where jobname like 'us-%' and active),
 's2_rpc_present',to_regprocedure('public.get_couple_week_participation_v1()') is not null
) as post_smoke;
