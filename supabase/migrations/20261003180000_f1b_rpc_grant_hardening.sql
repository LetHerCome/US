-- US 2.0 F1B — RPC / SECURITY DEFINER grant hardening.
--
-- Grant-only migration: no function body, owner, search_path, SECURITY
-- DEFINER flag, table, policy or row changes. Every revoked function keeps its
-- definition (migration history and pglite tests stay valid) and stays
-- executable by its owner (postgres) and, where it already was, service_role.
-- Evidence for every line is in docs/us-2.0/F1B_RPC_GRANT_HARDENING.md.
--
-- PUBLIC is revoked alongside anon/authenticated because Postgres' default
-- function ACL lives there (Supabase advisor 0028/0029 remediation).

-- 1. CLIENT_REQUIRED, authenticated only: drop the needless anon/PUBLIC
--    surface. Both partners call these signed in (settings.js, events.js).
revoke execute on function public.get_notification_preferences() from public, anon;
revoke execute on function public.set_notification_preference(text, boolean) from public, anon;
revoke execute on function public.complete_shared_event(uuid, date) from public, anon;

-- 2. LEGACY_CANDIDATE — Gioca v1 (weekly quiz + partner knowledge). Every
--    client call was removed by b3bc863 (M11B, 2026-09-30); no Edge Function,
--    trigger, policy, constraint, cron or SQL caller; last quiz_responses
--    write 2026-09-30, last partner_knowledge_attempts write 2026-08-31.
revoke execute on function public.get_weekly_quiz_sets() from public, anon, authenticated;
revoke execute on function public.get_quiz_state(uuid) from public, anon, authenticated;
revoke execute on function public.save_quiz_answer(uuid, smallint) from public, anon, authenticated;
revoke execute on function public.get_weekly_game_sets() from public, anon, authenticated;
revoke execute on function public.get_partner_knowledge_hub() from public, anon, authenticated;
revoke execute on function public.complete_partner_knowledge_deck(smallint, jsonb) from public, anon, authenticated;

-- 3. LEGACY_CANDIDATE — M11A custom-question management, superseded by
--    Game V2 (client calls removed by b3bc863; couple_questions has 0 rows).
--    Same treatment M11A.1 already gave create_couple_question and
--    start_custom_game_session.
revoke execute on function public.list_couple_questions() from public, anon, authenticated;
revoke execute on function public.list_game_sessions() from public, anon, authenticated;
revoke execute on function public.update_couple_question(uuid, integer, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.archive_couple_question(uuid) from public, anon, authenticated;

-- 4. LEGACY_CANDIDATE — pre-repo push RPCs. register_push_token: native push
--    was never wired (push-bootstrap.js deleted 2026-08-19, 0
--    device_push_tokens rows). get_web_push_status: no reference anywhere in
--    the repo and no recorded call since 2026-08-18. Web Push uses
--    register_/remove_web_push_subscription, which stay.
revoke execute on function public.register_push_token(text, text) from public, anon, authenticated;
revoke execute on function public.get_web_push_status() from public, anon, authenticated;

-- 5. INTERNAL_HELPER — trigger-only. Trigger functions are not checked for
--    EXECUTE when a trigger fires; the default PUBLIC grant only exposed them.
revoke execute on function private.us_touch_updated_at() from public, anon, authenticated;

comment on function public.get_weekly_quiz_sets() is 'RETIRED (US 2.0 F1B): Gioca v1, no client caller since M11B. EXECUTE revoked from public/anon/authenticated.';
comment on function public.get_quiz_state(uuid) is 'RETIRED (US 2.0 F1B): Gioca v1, no client caller since M11B. EXECUTE revoked from public/anon/authenticated.';
comment on function public.save_quiz_answer(uuid, smallint) is 'RETIRED (US 2.0 F1B): Gioca v1, no client caller since M11B. EXECUTE revoked from public/anon/authenticated.';
comment on function public.get_weekly_game_sets() is 'RETIRED (US 2.0 F1B): Gioca v1, no client caller since M11B. EXECUTE revoked from public/anon/authenticated.';
comment on function public.get_partner_knowledge_hub() is 'RETIRED (US 2.0 F1B): Gioca v1 partner knowledge, no client caller since M11B. EXECUTE revoked from public/anon/authenticated.';
comment on function public.complete_partner_knowledge_deck(smallint, jsonb) is 'RETIRED (US 2.0 F1B): Gioca v1 partner knowledge, no client caller since M11B. EXECUTE revoked from public/anon/authenticated.';
comment on function public.list_couple_questions() is 'RETIRED (US 2.0 F1B): M11A, superseded by Game V2. EXECUTE revoked from public/anon/authenticated.';
comment on function public.list_game_sessions() is 'RETIRED (US 2.0 F1B): M11A, superseded by Game V2. EXECUTE revoked from public/anon/authenticated.';
comment on function public.update_couple_question(uuid, integer, text, text, jsonb) is 'RETIRED (US 2.0 F1B): M11A, superseded by Game V2. EXECUTE revoked from public/anon/authenticated.';
comment on function public.archive_couple_question(uuid) is 'RETIRED (US 2.0 F1B): M11A, superseded by Game V2. EXECUTE revoked from public/anon/authenticated.';
comment on function public.register_push_token(text, text) is 'RETIRED (US 2.0 F1B): native push token RPC, never wired. EXECUTE revoked from public/anon/authenticated.';
comment on function public.get_web_push_status() is 'RETIRED (US 2.0 F1B): no caller. EXECUTE revoked from public/anon/authenticated.';

-- Self-check: abort the whole migration if the intended matrix does not hold.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.get_notification_preferences()', 'public.set_notification_preference(text, boolean)',
    'public.complete_shared_event(uuid, date)'
  ] loop
    if has_function_privilege('anon', fn, 'execute') or not has_function_privilege('authenticated', fn, 'execute') then
      raise exception 'F1B: % must be authenticated-only', fn;
    end if;
  end loop;

  foreach fn in array array[
    'public.get_weekly_quiz_sets()', 'public.get_quiz_state(uuid)', 'public.save_quiz_answer(uuid, smallint)',
    'public.get_weekly_game_sets()', 'public.get_partner_knowledge_hub()',
    'public.complete_partner_knowledge_deck(smallint, jsonb)', 'public.list_couple_questions()',
    'public.list_game_sessions()', 'public.update_couple_question(uuid, integer, text, text, jsonb)',
    'public.archive_couple_question(uuid)', 'public.register_push_token(text, text)',
    'public.get_web_push_status()', 'private.us_touch_updated_at()', 'public.claim_us_role(text, text)'
  ] loop
    if has_function_privilege('anon', fn, 'execute') or has_function_privilege('authenticated', fn, 'execute') then
      raise exception 'F1B: % is still executable by a client role', fn;
    end if;
  end loop;
end
$$;
