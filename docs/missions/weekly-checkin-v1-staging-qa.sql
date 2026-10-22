-- Weekly check-in V1: end-to-end QA on US-STAGING through the real RPCs.
-- ONE statement, always rolled back: two synthetic users and their couple
-- exist only inside this block, which ends with an intentional exception
-- (QA_PASS ... on success, QA_FAIL ... otherwise). Nothing is ever committed.
do $qa$
declare
  f uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  week date := private.bond_week_start_rome(now());
  inv jsonb; s jsonb; h jsonb; k jsonb; e jsonb; n integer; msg text;
  ok text[] := '{}';
  as_user constant text := 'set local role authenticated';
begin
  if current_setting('request.jwt.claim.sub', true) is not null and current_setting('request.jwt.claim.sub', true) <> '' then
    raise exception 'QA_FAIL unexpected jwt context';
  end if;
  insert into auth.users(id, email, email_confirmed_at, is_anonymous, aud, role)
    values (f, 'qa-checkin-f-' || f || '@example.invalid', now(), false, 'authenticated', 'authenticated'),
           (b, 'qa-checkin-b-' || b || '@example.invalid', now(), false, 'authenticated', 'authenticated');

  -- Couple: F creates it and invites, B accepts (MC2 RPCs, as each user).
  perform set_config('request.jwt.claim.sub', f::text, true); execute as_user;
  perform public.create_couple('QA Francesco', date '2025-01-01', null);
  inv := public.create_partner_invite();
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', b::text, true); execute as_user;
  perform public.accept_partner_invite(inv->>'code', 'QA Bea');
  ok := array_append(ok, 'coppia creata'::text);

  -- 1. Nothing yet.
  s := public.get_weekly_checkin_state(null);
  if s->>'week_start' <> week::text or s->'me' <> 'null'::jsonb or (s->>'partner_submitted')::boolean then raise exception 'QA_FAIL 1 %', s; end if;
  ok := array_append(ok, '1 stato vuoto'::text);

  -- 2. F answers first.
  execute 'reset role'; perform set_config('request.jwt.claim.sub', f::text, true); execute as_user;
  s := public.submit_weekly_checkin('{"closeness":4,"closeness_note":"QA nota","energy":2,"appreciation":"QA grazie del caffe","support_request":"QA staccare la sera"}'::jsonb, 0);
  if (s->'me'->>'version')::int <> 1 or (s->>'revealed')::boolean then raise exception 'QA_FAIL 2 %', s; end if;
  ok := array_append(ok, '2 F risponde'::text);

  -- 3. B sees that F answered, and nothing of what F wrote.
  execute 'reset role'; perform set_config('request.jwt.claim.sub', b::text, true); execute as_user;
  s := public.get_weekly_checkin_state(null);
  if not (s->>'partner_submitted')::boolean or s->'partner' <> 'null'::jsonb or s::text like '%QA grazie%' or s::text like '%QA nota%' or s::text like '%staccare%' then
    raise exception 'QA_FAIL 3 sigillo %', s;
  end if;
  ok := array_append(ok, '3 sigillo ok'::text);

  -- 4. F edits before B answers.
  execute 'reset role'; perform set_config('request.jwt.claim.sub', f::text, true); execute as_user;
  s := public.submit_weekly_checkin('{"closeness":5,"appreciation":"QA grazie del caffe","support_request":"QA staccare la sera"}'::jsonb, 1);
  if (s->'me'->>'version')::int <> 2 or (s->'me'->>'closeness')::int <> 5 then raise exception 'QA_FAIL 4 %', s; end if;
  begin
    perform public.submit_weekly_checkin('{"appreciation":"QA vecchia"}'::jsonb, 1);
    raise exception 'QA_FAIL 4b stale version accepted';
  exception when others then
    if sqlerrm not like '%weekly_checkin_conflict%' then raise exception 'QA_FAIL 4b %', sqlerrm; end if;
  end;
  ok := array_append(ok, '4 modifica e conflitto'::text);

  -- 5. B answers: both see everything.
  execute 'reset role'; perform set_config('request.jwt.claim.sub', b::text, true); execute as_user;
  s := public.submit_weekly_checkin('{"closeness":4,"energy":4,"appreciation":"QA mi hai ascoltata"}'::jsonb, 0);
  if not (s->>'revealed')::boolean or s->'partner'->>'appreciation' <> 'QA grazie del caffe' or s->'partner'->>'support_request' <> 'QA staccare la sera' then
    raise exception 'QA_FAIL 5 %', s;
  end if;
  execute 'reset role'; perform set_config('request.jwt.claim.sub', f::text, true); execute as_user;
  s := public.get_weekly_checkin_state(null);
  if s->'partner'->>'appreciation' <> 'QA mi hai ascoltata' then raise exception 'QA_FAIL 5b %', s; end if;
  ok := array_append(ok, '5 reveal per entrambi'::text);

  -- 6. Sealed after the reveal.
  begin
    perform public.submit_weekly_checkin('{"appreciation":"QA troppo tardi"}'::jsonb, 2);
    raise exception 'QA_FAIL 6 edit after reveal accepted';
  exception when others then
    if sqlerrm not like '%weekly_checkin_sealed%' then raise exception 'QA_FAIL 6 %', sqlerrm; end if;
  end;
  ok := array_append(ok, '6 chiuso dopo il reveal'::text);

  -- 7. F reacts; B sees it.
  s := public.set_weekly_checkin_reaction(week, 'heart');
  if s->'me'->>'appreciation_reaction' <> 'heart' then raise exception 'QA_FAIL 7 %', s; end if;
  execute 'reset role'; perform set_config('request.jwt.claim.sub', b::text, true); execute as_user;
  s := public.get_weekly_checkin_state(null);
  if s->'partner'->>'appreciation_reaction' <> 'heart' then raise exception 'QA_FAIL 7b %', s; end if;
  ok := array_append(ok, '7 reazione'::text);

  -- 8. F keeps what B wrote; idempotent; both read it (Ricordi), nobody can change it.
  execute 'reset role'; perform set_config('request.jwt.claim.sub', f::text, true); execute as_user;
  k := public.keep_weekly_appreciation(week);
  if k->>'status' <> 'kept' then raise exception 'QA_FAIL 8 %', k; end if;
  k := public.keep_weekly_appreciation(week);
  if k->>'status' <> 'already_kept' then raise exception 'QA_FAIL 8b %', k; end if;
  select count(*) into n from public.weekly_checkin_keepsakes where appreciation = 'QA mi hai ascoltata';
  if n <> 1 then raise exception 'QA_FAIL 8c keepsake visible to F: %', n; end if;
  execute 'reset role'; perform set_config('request.jwt.claim.sub', b::text, true); execute as_user;
  select count(*) into n from public.weekly_checkin_keepsakes where appreciation = 'QA mi hai ascoltata';
  if n <> 1 then raise exception 'QA_FAIL 8d keepsake visible to B: %', n; end if;
  begin
    update public.weekly_checkin_keepsakes set appreciation = 'x';
    raise exception 'QA_FAIL 8e keepsake writable';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.weekly_checkins limit 1;
    raise exception 'QA_FAIL 8f table readable by a client';
  exception when insufficient_privilege then null;
  end;
  ok := array_append(ok, '8 conservato e protetto'::text);

  -- 9. History: this revealed week.
  h := public.get_weekly_checkin_history(8);
  if jsonb_array_length(h->'weeks') <> 1 or (h->'weeks'->0->>'me')::int <> 4 or (h->'weeks'->0->>'partner')::int <> 5 then raise exception 'QA_FAIL 9 %', h; end if;
  ok := array_append(ok, '9 andamento'::text);

  -- 10. anon is refused.
  execute 'reset role'; execute 'set local role anon';
  begin
    perform public.get_weekly_checkin_state(null);
    raise exception 'QA_FAIL 10 anon allowed';
  exception when insufficient_privilege then null;
  end;
  ok := array_append(ok, '10 anon rifiutato'::text);

  -- 11. Export and leaving the couple (S3.2, service role).
  execute 'reset role'; execute 'set local role service_role';
  e := public.s32_export_user_data(f);
  if jsonb_array_length(e->'personal'->'weekly_checkins') <> 1 then raise exception 'QA_FAIL 11 export %', e->'personal'->'weekly_checkins'; end if;
  perform public.s32_leave_couple(f, 'app');
  execute 'reset role';
  select count(*) into n from public.weekly_checkins where user_id = f;
  if n <> 0 then raise exception 'QA_FAIL 11b rows of the leaver: %', n; end if;
  select count(*) into n from public.weekly_checkin_keepsakes where appreciation = 'QA mi hai ascoltata';
  if n <> 1 then raise exception 'QA_FAIL 11c kept memory lost'; end if;
  ok := array_append(ok, '11 export e uscita'::text);

  raise exception 'QA_PASS %', array_to_string(ok, ' | ');
end;
$qa$;
