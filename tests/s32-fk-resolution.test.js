// S3.2 — every reference to a user has an explicit account-deletion outcome.
// Rebuilds the real schema (all migrations) in PGlite and fails when a
// foreign key to auth.users or public.profiles is added or changed without
// being classified here. Personal data may cascade; shared content must be
// NO ACTION (fail closed) and detached by s32_delete_account_data().
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const h=require('./helpers/mc2-db');

const PERSONAL_CASCADE=new Set([
  'auth.users>profiles.id','auth.users>daily_answers.user_id','auth.users>moods.user_id','auth.users>quiz_responses.user_id',
  // US Plus (29/10/2026): the entitlement goes with the account (Play's subscription is warned about before deletion, D4).
  'auth.users>plus_entitlements.user_id',
  'profiles>calendar_entries.owner_id','profiles>calendar_reminders.recipient_id','profiles>calendar_reminders.requested_by',
  'profiles>conserva_contributions.conserved_by','profiles>couple_locations.user_id',
  // Batteria del partner (31/10/2026): the last level reported goes with the person.
  'profiles>couple_batteries.user_id','profiles>device_push_tokens.user_id',
  'profiles>notification_preferences.user_id','profiles>partner_knowledge_attempts.user_id','profiles>progression_reward_views.profile_id',
  'profiles>push_event_log.sender_id','profiles>push_subscriptions.user_id','profiles>stories.author_id','profiles>story_views.viewer_id',
  'profiles>widget_action_tokens.profile_id','profiles>widget_scriptable_installations.profile_id',
  'profiles>widget_scriptable_setup_codes.profile_id','profiles>widget_tokens.profile_id',
]);
const OPERATIONAL_SET_NULL=new Set([
  'auth.users>activity.actor_id','auth.users>couple_invites.used_by','auth.users>user_reports.reporter_id','profiles>couple_invites.created_by',
  'profiles>couple_progression_preferences.updated_by','profiles>progression_events.actor_id',
]);
const SHARED_FAIL_CLOSED=new Set([
  'auth.users>shared_messages.sender_id','auth.users>shared_messages.recipient_id','auth.users>bucket_items.created_by',
  'profiles>moments.created_by','profiles>moment_photos.created_by','profiles>calendar_entries.created_by',
  'profiles>shared_events.created_by','profiles>shared_event_completions.completed_by',
  'profiles>left_for_you.sender_id','profiles>left_for_you.recipient_id','profiles>conserva_contributions.source_sender_id',
  // Note condivise V1 (31/10/2026): detached by s32_close_membership.
  'profiles>couple_notes.created_by','profiles>couple_notes.updated_by',
]);

test('every user reference is classified, and shared content fails closed',async()=>{
  const db=await h.database({seed:false});
  try{
    const rows=(await db.query(`select c.confrelid::regclass::text ref, c.conrelid::regclass::text tbl, a.attname col, a.attnotnull nn, c.confdeltype d
      from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
      where c.contype='f' and c.connamespace='public'::regnamespace and c.confrelid in ('auth.users'::regclass,'public.profiles'::regclass)`)).rows;
    // Shared content is detached by the membership closing used by both
    // account deletion and leaving the couple.
    const fn=(await db.query("select prosrc from pg_proc where proname='s32_close_membership'")).rows[0].prosrc;
    const seen=new Set();
    for(const r of rows){
      const key=`${r.ref}>${r.tbl}.${r.col}`;seen.add(key);
      if(PERSONAL_CASCADE.has(key))assert.equal(r.d,'c',key+' must cascade (personal data)');
      else if(OPERATIONAL_SET_NULL.has(key))assert.equal(r.d,'n',key+' must be SET NULL');
      else if(SHARED_FAIL_CLOSED.has(key)){
        assert.equal(r.d,'a',key+' must be NO ACTION');
        assert.equal(r.nn,false,key+' must allow an anonymous author');
        assert.match(fn,new RegExp(`public\\.${r.tbl} set [^;]*${r.col} = null`),key+' must be detached by the deletion');
      }
      else assert.fail('unclassified user reference: '+key+' — decide what account deletion does with it');
    }
    for(const key of [...PERSONAL_CASCADE,...OPERATIONAL_SET_NULL,...SHARED_FAIL_CLOSED])assert.ok(seen.has(key),'stale classification '+key);
    assert.equal(seen.size,42);
  }finally{await db.close();}
});

test('the deletion entry points stay service-role only in the migration source',()=>{
  const dir=path.join(__dirname,'../supabase/migrations');
  const sql=fs.readFileSync(path.join(dir,fs.readdirSync(dir).find(f=>/_s32_account_deletion_v1\.sql$/.test(f))),'utf8');
  for(const sig of ['public.s32_delete_account_data(uuid, text)','public.s32_account_deletion_storage_plan(uuid)','public.s32_mark_account_deletion(uuid, text, text)',
    'public.s32_claim_pending_account_deletions(integer)','public.s32_purge_account_deletion_receipts()','public.get_internal_account_deletion_cron_key()']){
    assert.ok(sql.includes(`revoke all on function ${sig} from public, anon, authenticated;`),sig);
    assert.ok(sql.includes(`grant execute on function ${sig} to service_role;`),sig);
  }
  assert.doesNotMatch(sql,/grant[^;]+to (anon|authenticated)/i);
  assert.doesNotMatch(sql,/delete from auth\.users/i,'Auth users are deleted only by the Admin API');
});

test('leave, report and export entry points: service_role only, reports the single client entry',()=>{
  const dir=path.join(__dirname,'../supabase/migrations');
  const sql=fs.readFileSync(path.join(dir,fs.readdirSync(dir).find(f=>/_s32_leave_couple_reports_export\.sql$/.test(f))),'utf8');
  for(const sig of ['public.s32_delete_account_data(uuid, text)','public.s32_leave_couple(uuid, text)','public.s32_couple_departure_plan(uuid, uuid)',
    'public.s32_mark_couple_departure(uuid, uuid, text, text)','public.s32_claim_pending_couple_departures(integer)','public.s32_purge_account_deletion_receipts()',
    'public.s32_export_user_data(uuid)','public.s32_user_id_by_email(text)','public.get_internal_operator_key()']){
    assert.ok(sql.includes(`revoke all on function ${sig} from public, anon, authenticated;`),sig);
    assert.ok(sql.includes(`grant execute on function ${sig} to service_role;`),sig);
  }
  const clientGrants=sql.match(/grant[^;]+to (anon|authenticated)[^;]*;/gi)||[];
  assert.deepEqual(clientGrants,['grant execute on function public.submit_user_report(text, text) to authenticated;']);
  assert.doesNotMatch(sql,/delete from auth\.users/i);
  assert.doesNotMatch(sql,/create policy/i,'no client policy on reports, departures or exports');
});
