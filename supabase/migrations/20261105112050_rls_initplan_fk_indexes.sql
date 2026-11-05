-- Database lighter at scale (audit della produzione, 05/11/2026, punto 13).
-- Generated from the repo schema rebuilt in PGlite, after checking that each
-- of these policies is identical in production (05/11, read-only).
--
-- 1. RLS: 81 policies of schema public call auth.uid() or
--    private.current_couple_id() once per row. Wrapped in a sub-select they are
--    computed once per statement (Supabase advisor auth_rls_initplan; for
--    current_couple_id, which reads profiles, it is the larger saving). Same
--    policies, same roles, same meaning: only the call is wrapped.
-- 2. Foreign keys: 50 have no index on the referencing column. Deleting an
--    account or a couple scans those tables (advisor unindexed_foreign_keys).
--    Plain CREATE INDEX: the tables are small; the migration runs in one
--    transaction, so CONCURRENTLY is not possible.
-- Re-applying it changes nothing.

-- 1. RLS ---------------------------------------------------------------------

alter policy activity_insert_same_couple on public.activity
  with check (((couple_id = (select private.current_couple_id())) AND (actor_id = (select auth.uid()))));

alter policy activity_read_same_couple on public.activity
  using ((couple_id = (select private.current_couple_id())));

alter policy bond_quests_select on public.bond_weekly_quests
  using ((couple_id = (select private.current_couple_id())));

alter policy bond_weekly_state_select on public.bond_weekly_state
  using ((couple_id = (select private.current_couple_id())));

alter policy bucket_delete_same_couple on public.bucket_items
  using ((couple_id = (select private.current_couple_id())));

alter policy bucket_insert_same_couple on public.bucket_items
  with check (((couple_id = (select private.current_couple_id())) AND (created_by = (select auth.uid()))));

alter policy bucket_read_same_couple on public.bucket_items
  using ((couple_id = (select private.current_couple_id())));

alter policy bucket_update_same_couple on public.bucket_items
  using ((couple_id = (select private.current_couple_id())))
  with check ((couple_id = (select private.current_couple_id())));

alter policy calendar_entries_delete_departed_author on public.calendar_entries
  using (((entry_type = 'shared'::text) AND (created_by IS NULL) AND (couple_id = (select private.current_couple_id()))));

alter policy calendar_entries_delete_personal on public.calendar_entries
  using (((entry_type = 'personal'::text) AND (couple_id = (select private.current_couple_id())) AND (owner_id = (select auth.uid()))));

alter policy calendar_entries_delete_shared on public.calendar_entries
  using (((entry_type = 'shared'::text) AND (couple_id = (select private.current_couple_id())) AND (created_by = (select auth.uid()))));

alter policy calendar_entries_insert_personal on public.calendar_entries
  with check (((entry_type = 'personal'::text) AND (couple_id = (select private.current_couple_id())) AND (created_by = (select auth.uid())) AND (owner_id = (select auth.uid()))));

alter policy calendar_entries_insert_shared on public.calendar_entries
  with check (((entry_type = 'shared'::text) AND (couple_id = (select private.current_couple_id())) AND (created_by = (select auth.uid())) AND (owner_id IS NULL)));

alter policy calendar_entries_select_couple on public.calendar_entries
  using ((couple_id = (select private.current_couple_id())));

alter policy calendar_entries_update_departed_author on public.calendar_entries
  using (((entry_type = 'shared'::text) AND (created_by IS NULL) AND (couple_id = (select private.current_couple_id()))))
  with check (((entry_type = 'shared'::text) AND (created_by IS NULL) AND (couple_id = (select private.current_couple_id()))));

alter policy calendar_entries_update_personal on public.calendar_entries
  using (((entry_type = 'personal'::text) AND (couple_id = (select private.current_couple_id())) AND (owner_id = (select auth.uid()))))
  with check (((entry_type = 'personal'::text) AND (couple_id = (select private.current_couple_id())) AND (owner_id = (select auth.uid()))));

alter policy calendar_entries_update_shared on public.calendar_entries
  using (((entry_type = 'shared'::text) AND (couple_id = (select private.current_couple_id())) AND (created_by = (select auth.uid()))))
  with check (((entry_type = 'shared'::text) AND (couple_id = (select private.current_couple_id())) AND (created_by = (select auth.uid()))));

alter policy calendar_reminders_delete_requester on public.calendar_reminders
  using (((couple_id = (select private.current_couple_id())) AND ((requested_by = (select auth.uid())) OR (recipient_id = (select auth.uid())))));

alter policy calendar_reminders_select_couple on public.calendar_reminders
  using ((couple_id = (select private.current_couple_id())));

alter policy calendar_reminders_update_requester on public.calendar_reminders
  using (((couple_id = (select private.current_couple_id())) AND (requested_by = (select auth.uid()))))
  with check (((couple_id = (select private.current_couple_id())) AND (requested_by = (select auth.uid()))));

alter policy conserva_select_same_couple on public.conserva_contributions
  using ((couple_id = (select private.current_couple_id())));

alter policy couple_batteries_insert_self on public.couple_batteries
  with check (((user_id = ( SELECT auth.uid() AS uid)) AND (couple_id = (select private.current_couple_id()))));

alter policy couple_batteries_select_same_couple on public.couple_batteries
  using (((user_id = ( SELECT auth.uid() AS uid)) OR ((couple_id = (select private.current_couple_id())) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = couple_batteries.user_id) AND (p.couple_id = couple_batteries.couple_id)))))));

alter policy couple_batteries_update_self on public.couple_batteries
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check (((user_id = ( SELECT auth.uid() AS uid)) AND (couple_id = (select private.current_couple_id()))));

alter policy couple_locations_insert_self on public.couple_locations
  with check (((user_id = ( SELECT auth.uid() AS uid)) AND (couple_id = (select private.current_couple_id()))));

alter policy couple_locations_update_self on public.couple_locations
  using (((user_id = ( SELECT auth.uid() AS uid)) AND (couple_id = (select private.current_couple_id()))))
  with check (((user_id = ( SELECT auth.uid() AS uid)) AND (couple_id = (select private.current_couple_id()))));

alter policy couple_notes_delete_same_couple on public.couple_notes
  using ((couple_id = (select private.current_couple_id())));

alter policy couple_notes_insert_same_couple on public.couple_notes
  with check ((couple_id = (select private.current_couple_id())));

alter policy couple_notes_read_same_couple on public.couple_notes
  using ((couple_id = (select private.current_couple_id())));

alter policy couple_notes_update_same_couple on public.couple_notes
  using ((couple_id = (select private.current_couple_id())))
  with check ((couple_id = (select private.current_couple_id())));

alter policy couple_weekly_challenge_photos_select_same_couple on public.couple_weekly_challenge_photos
  using ((couple_id = (select private.current_couple_id())));

alter policy couple_weekly_challenges_select_same_couple on public.couple_weekly_challenges
  using ((couple_id = (select private.current_couple_id())));

alter policy couples_select_own on public.couples
  using ((id = (select private.current_couple_id())));

alter policy couples_update_own on public.couples
  using ((id = (select private.current_couple_id())))
  with check ((id = (select private.current_couple_id())));

alter policy daily_answers_insert_own on public.daily_answers
  with check (((user_id = (select auth.uid())) AND (couple_id = (select private.current_couple_id()))));

alter policy daily_answers_read_own on public.daily_answers
  using ((user_id = (select auth.uid())));

alter policy daily_answers_update_own on public.daily_answers
  using ((user_id = (select auth.uid())))
  with check (((user_id = (select auth.uid())) AND (couple_id = (select private.current_couple_id()))));

alter policy daily_question_keepsakes_select_same_couple on public.daily_question_keepsakes
  using ((couple_id = (select private.current_couple_id())));

alter policy daily_question_outcomes_select_after_reveal on public.daily_question_outcomes
  using (((couple_id = (select private.current_couple_id())) AND private.daily_question_reveal_ready(question_id)));

alter policy lavagna_boards_read_same_couple on public.lavagna_boards
  using ((couple_id = (select private.current_couple_id())));

alter policy lavagna_strokes_delete_same_couple on public.lavagna_strokes
  using ((couple_id = (select private.current_couple_id())));

alter policy lavagna_strokes_insert_same_couple on public.lavagna_strokes
  with check ((couple_id = (select private.current_couple_id())));

alter policy lavagna_strokes_read_same_couple on public.lavagna_strokes
  using ((couple_id = (select private.current_couple_id())));

alter policy left_for_you_insert_own on public.left_for_you
  with check (((couple_id = (select private.current_couple_id())) AND (sender_id = (select auth.uid())) AND (recipient_id <> sender_id) AND (seen_at IS NULL) AND (EXISTS ( SELECT 1
   FROM profiles partner
  WHERE ((partner.id = left_for_you.recipient_id) AND (partner.couple_id = (select private.current_couple_id()))))) AND ((kind <> ALL (ARRAY['photo'::text, 'audio'::text, 'video'::text])) OR starts_with(media_path, ((((couple_id)::text || '/'::text) || ((select auth.uid()))::text) || '/left/'::text))) AND ((kind <> 'music'::text) OR (NOT starts_with(media_path, ((((couple_id)::text || '/'::text) || ((select auth.uid()))::text) || '/left/'::text))))));

alter policy left_for_you_select_participants on public.left_for_you
  using (((couple_id = (select private.current_couple_id())) AND (((select auth.uid()) = sender_id) OR ((select auth.uid()) = recipient_id))));

alter policy living_provenance_select_same_couple on public.living_provenance
  using ((couple_id = (select private.current_couple_id())));

alter policy member_status_insert_self on public.member_status
  with check (((user_id = ( SELECT auth.uid() AS uid)) AND (couple_id = (select private.current_couple_id()))));

alter policy member_status_select_same_couple on public.member_status
  using (((user_id = ( SELECT auth.uid() AS uid)) OR ((couple_id = (select private.current_couple_id())) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = member_status.user_id) AND (p.couple_id = member_status.couple_id)))))));

alter policy member_status_update_self on public.member_status
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check (((user_id = ( SELECT auth.uid() AS uid)) AND (couple_id = (select private.current_couple_id()))));

alter policy moment_photos_delete_departed_author on public.moment_photos
  using (((created_by IS NULL) AND (couple_id = (select private.current_couple_id()))));

alter policy moment_photos_delete_own on public.moment_photos
  using (((couple_id = (select private.current_couple_id())) AND (created_by = (select auth.uid()))));

alter policy moment_photos_insert_own on public.moment_photos
  with check (((couple_id = (select private.current_couple_id())) AND (created_by = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM moments m
  WHERE ((m.id = moment_photos.moment_id) AND (m.couple_id = (select private.current_couple_id())))))));

alter policy moment_photos_select_same_couple on public.moment_photos
  using (((couple_id = (select private.current_couple_id())) AND (EXISTS ( SELECT 1
   FROM moments m
  WHERE ((m.id = moment_photos.moment_id) AND (m.couple_id = (select private.current_couple_id())))))));

alter policy moment_photos_update_own on public.moment_photos
  using (((couple_id = (select private.current_couple_id())) AND (created_by = (select auth.uid()))))
  with check (((couple_id = (select private.current_couple_id())) AND (created_by = (select auth.uid()))));

alter policy moments_delete_departed_author on public.moments
  using (((created_by IS NULL) AND (couple_id = (select private.current_couple_id()))));

alter policy moments_delete_own on public.moments
  using (((couple_id = (select private.current_couple_id())) AND (created_by = (select auth.uid()))));

alter policy moments_insert_own on public.moments
  with check (((couple_id = (select private.current_couple_id())) AND (created_by = (select auth.uid()))));

alter policy moments_select_same_couple on public.moments
  using ((couple_id = (select private.current_couple_id())));

alter policy moments_update_own on public.moments
  using (((couple_id = (select private.current_couple_id())) AND (created_by = (select auth.uid()))))
  with check (((couple_id = (select private.current_couple_id())) AND (created_by = (select auth.uid()))));

alter policy moods_insert_own on public.moods
  with check (((couple_id = (select private.current_couple_id())) AND (user_id = (select auth.uid()))));

alter policy moods_read_same_couple on public.moods
  using ((couple_id = (select private.current_couple_id())));

alter policy moods_update_own on public.moods
  using ((user_id = (select auth.uid())))
  with check (((couple_id = (select private.current_couple_id())) AND (user_id = (select auth.uid()))));

alter policy notification_preferences_insert_self on public.notification_preferences
  with check ((user_id = (select auth.uid())));

alter policy notification_preferences_select_self on public.notification_preferences
  using ((user_id = (select auth.uid())));

alter policy notification_preferences_update_self on public.notification_preferences
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy partner_knowledge_attempts_read_own on public.partner_knowledge_attempts
  using ((user_id = (select auth.uid())));

alter policy plus_entitlements_select_own on public.plus_entitlements
  using ((user_id = (select auth.uid())));

alter policy profiles_select_same_couple on public.profiles
  using (((id = (select auth.uid())) OR (couple_id = (select private.current_couple_id()))));

alter policy profiles_update_self on public.profiles
  using ((id = (select auth.uid())))
  with check ((id = (select auth.uid())));

alter policy quiz_responses_read_own on public.quiz_responses
  using ((user_id = (select auth.uid())));

alter policy relationship_milestones_select_same_couple on public.relationship_milestones
  using ((couple_id = (select private.current_couple_id())));

alter policy shared_event_completions_select_same_couple on public.shared_event_completions
  using ((couple_id = (select private.current_couple_id())));

alter policy shared_events_delete_same_couple on public.shared_events
  using ((couple_id = (select private.current_couple_id())));

alter policy shared_events_insert_same_couple on public.shared_events
  with check (((couple_id = (select private.current_couple_id())) AND (created_by = (select auth.uid()))));

alter policy shared_events_select_same_couple on public.shared_events
  using ((couple_id = (select private.current_couple_id())));

alter policy shared_events_update_same_couple on public.shared_events
  using ((couple_id = (select private.current_couple_id())))
  with check ((couple_id = (select private.current_couple_id())));

alter policy messages_insert_own on public.shared_messages
  with check (((couple_id = (select private.current_couple_id())) AND (sender_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = shared_messages.recipient_id) AND (p.couple_id = (select private.current_couple_id())))))));

alter policy messages_read_own_couple on public.shared_messages
  using (((couple_id = (select private.current_couple_id())) AND ((sender_id = (select auth.uid())) OR (recipient_id = (select auth.uid())))));

alter policy messages_update_recipient on public.shared_messages
  using ((recipient_id = (select auth.uid())))
  with check (((couple_id = (select private.current_couple_id())) AND (recipient_id = (select auth.uid()))));

alter policy think_reactions_select_couple_members on public.think_reactions
  using ((EXISTS ( SELECT 1
   FROM shared_messages message
  WHERE ((message.id = think_reactions.message_id) AND (message.kind = 'think'::text) AND (message.couple_id = (select private.current_couple_id())) AND ((message.sender_id = (select auth.uid())) OR (message.recipient_id = (select auth.uid())))))));

alter policy weekly_quiz_rewards_same_couple_select on public.weekly_quiz_rewards
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.couple_id = weekly_quiz_rewards.couple_id)))));

-- 2. Foreign key indexes -------------------------------------------------------

create index if not exists activity_actor_id_fk_idx on public.activity (actor_id);
create index if not exists bucket_items_created_by_fk_idx on public.bucket_items (created_by);
create index if not exists calendar_entries_created_by_fk_idx on public.calendar_entries (created_by);
create index if not exists calendar_entries_owner_id_fk_idx on public.calendar_entries (owner_id);
create index if not exists calendar_reminders_couple_id_fk_idx on public.calendar_reminders (couple_id);
create index if not exists calendar_reminders_recipient_id_fk_idx on public.calendar_reminders (recipient_id);
create index if not exists calendar_reminders_requested_by_fk_idx on public.calendar_reminders (requested_by);
create index if not exists conserva_contributions_source_sender_id_fk_idx on public.conserva_contributions (source_sender_id);
create index if not exists couple_invites_created_by_fk_idx on public.couple_invites (created_by);
create index if not exists couple_invites_used_by_fk_idx on public.couple_invites (used_by);
create index if not exists couple_notes_created_by_fk_idx on public.couple_notes (created_by);
create index if not exists couple_notes_updated_by_fk_idx on public.couple_notes (updated_by);
create index if not exists couple_progression_preferences_accent_reward_id_fk_idx on public.couple_progression_preferences (accent_reward_id);
create index if not exists couple_progression_preferences_badge_reward_id_fk_idx on public.couple_progression_preferences (badge_reward_id);
create index if not exists couple_progression_preferences_effect_reward_id_fk_idx on public.couple_progression_preferences (effect_reward_id);
create index if not exists couple_progression_preferences_frame_reward_id_fk_idx on public.couple_progression_preferences (frame_reward_id);
create index if not exists couple_progression_preferences_ring_reward_id_fk_idx on public.couple_progression_preferences (ring_reward_id);
create index if not exists couple_progression_preferences_sticker_reward_id_fk_idx on public.couple_progression_preferences (sticker_reward_id);
create index if not exists couple_progression_preferences_theme_reward_id_fk_idx on public.couple_progression_preferences (theme_reward_id);
create index if not exists couple_progression_preferences_updated_by_fk_idx on public.couple_progression_preferences (updated_by);
create index if not exists couple_reward_unlocks_reward_id_fk_idx on public.couple_reward_unlocks (reward_id);
create index if not exists daily_answers_user_id_fk_idx on public.daily_answers (user_id);
create index if not exists daily_question_keepsakes_question_id_fk_idx on public.daily_question_keepsakes (question_id);
create index if not exists daily_question_outcomes_question_id_fk_idx on public.daily_question_outcomes (question_id);
create index if not exists game_v2_catalog_cooldown_class_fk_idx on public.game_v2_catalog (cooldown_class);
create index if not exists game_v2_recipes_cooldown_class_fk_idx on public.game_v2_recipes (cooldown_class);
create index if not exists lavagna_strokes_author_id_fk_idx on public.lavagna_strokes (author_id);
create index if not exists left_for_you_sender_id_fk_idx on public.left_for_you (sender_id);
create index if not exists living_provenance_target_moment_id_fk_idx on public.living_provenance (target_moment_id);
create index if not exists moment_photos_created_by_fk_idx on public.moment_photos (created_by);
create index if not exists moments_couple_id_fk_idx on public.moments (couple_id);
create index if not exists moments_created_by_fk_idx on public.moments (created_by);
create index if not exists moods_couple_id_fk_idx on public.moods (couple_id);
create index if not exists partner_knowledge_attempts_user_id_fk_idx on public.partner_knowledge_attempts (user_id);
create index if not exists progression_events_actor_id_fk_idx on public.progression_events (actor_id);
create index if not exists progression_reward_views_profile_id_fk_idx on public.progression_reward_views (profile_id);
create index if not exists progression_reward_views_reward_id_fk_idx on public.progression_reward_views (reward_id);
create index if not exists push_event_log_couple_id_fk_idx on public.push_event_log (couple_id);
create index if not exists push_event_log_sender_id_fk_idx on public.push_event_log (sender_id);
create index if not exists quiz_responses_set_id_fk_idx on public.quiz_responses (set_id);
create index if not exists quiz_responses_user_id_fk_idx on public.quiz_responses (user_id);
create index if not exists shared_event_completions_completed_by_fk_idx on public.shared_event_completions (completed_by);
create index if not exists shared_events_created_by_fk_idx on public.shared_events (created_by);
create index if not exists user_reports_couple_id_fk_idx on public.user_reports (couple_id);
create index if not exists weekly_quiz_rewards_set_id_fk_idx on public.weekly_quiz_rewards (set_id);
create index if not exists widget_action_receipts_message_id_fk_idx on public.widget_action_receipts (message_id);
create index if not exists widget_action_tokens_couple_id_fk_idx on public.widget_action_tokens (couple_id);
create index if not exists widget_scriptable_installations_couple_id_fk_idx on public.widget_scriptable_installations (couple_id);
create index if not exists widget_scriptable_setup_codes_couple_id_fk_idx on public.widget_scriptable_setup_codes (couple_id);
create index if not exists widget_tokens_couple_id_fk_idx on public.widget_tokens (couple_id);
