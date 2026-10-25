// Valid private-state witnesses in every client-readable tenant table.
const h=require('./mc2-db');
async function seedTenant(db,cid,u,v,n){
  const qid=h.uid(100),setid=h.uid(101),quizid=h.uid(102);
  await db.exec(`insert into public.daily_questions(id,question_date,question) values('${qid}','2026-01-01','Shared question?') on conflict do nothing;
    insert into public.quiz_sets(id,slug,title,category) values('${setid}','mc2_test','Quiz','test') on conflict do nothing;
    insert into public.quiz_questions(id,set_id,position,question,options) values('${quizid}','${setid}',1,'Question?','["a","b"]') on conflict do nothing;`);
  const id=k=>h.uid(n*1000+k);
  await db.exec(`
    insert into public.activity(couple_id,actor_id,type) values('${cid}','${u}','mc2_test');
    insert into public.bucket_items(id,couple_id,created_by,title) values('${id(1)}','${cid}','${u}','Private idea ${n}');
    insert into public.calendar_entries(id,couple_id,entry_type,created_by,title,is_all_day,start_date,end_date)
      values('${id(2)}','${cid}','shared','${u}','Private calendar ${n}',true,'2026-01-01','2026-01-01');
    insert into public.calendar_reminders(couple_id,entry_id,recipient_id,offset_minutes,requested_by) values('${cid}','${id(2)}','${v}',1440,'${u}');
    insert into public.couple_locations(user_id,couple_id,latitude,longitude) values('${u}','${cid}',41,12),('${v}','${cid}',42,13);
    insert into public.daily_answers(question_id,user_id,couple_id,answer) values('${qid}','${u}','${cid}','PRIVATE-${n}-one'),('${qid}','${v}','${cid}','PRIVATE-${n}-two');
    insert into public.daily_question_keepsakes(couple_id,question_id,question_text,question_date,francesco_answer,beatrice_answer,revealed_at,kept_by_role)
      values('${cid}','${qid}','Private kept ${n}','2026-01-01','Private one','Private two',now(),'francesco');
    insert into public.daily_question_outcomes(couple_id,question_id,author_role,body,last_operation_id) values('${cid}','${qid}','francesco','Private outcome ${n}','${id(3)}');
    insert into public.left_for_you(id,couple_id,sender_id,recipient_id,kind,body) values('${id(4)}','${cid}','${u}','${v}','text','Private gift ${n}');
    insert into public.conserva_contributions(couple_id,source_item_id,source_sender_id,conserved_by) values('${cid}','${id(4)}','${u}','${v}');
    insert into public.moments(id,couple_id,created_by,storage_path,moment_date) values('${id(5)}','${cid}','${u}','${cid}/${u}/moment.jpg','2026-01-01');
    insert into public.moment_photos(moment_id,couple_id,created_by,storage_path) values('${id(5)}','${cid}','${u}','${cid}/${u}/detail.jpg');
    insert into public.moods(couple_id,user_id,mood) values('${cid}','${u}','happy'),('${cid}','${v}','happy');
    insert into public.notification_preferences(user_id) values('${u}'),('${v}');
    insert into public.partner_knowledge_attempts(couple_id,user_id,week_start,deck,guesses,score,xp_awarded)
      values('${cid}','${u}','2026-01-05',1,'[]',0,0),('${cid}','${v}','2026-01-05',1,'[]',0,0);
    insert into public.push_event_log(dedupe_key,couple_id,event_type) values('mc2-test-${n}','${cid}','test');
    insert into public.push_subscriptions(user_id,couple_id,endpoint,p256dh,auth_key) values('${u}','${cid}','https://example.test/${u}','key','auth'),('${v}','${cid}','https://example.test/${v}','key','auth');
    insert into public.quiz_responses(set_id,question_id,user_id,couple_id,answer_index) values('${setid}','${quizid}','${u}','${cid}',0),('${setid}','${quizid}','${v}','${cid}',0);
    insert into public.relationship_milestones(couple_id,milestone_date,kind,months_together,xp_awarded) values('${cid}','2026-01-01','monthiversary',1,0);
    insert into public.shared_events(id,couple_id,created_by,title,event_date) values('${id(6)}','${cid}','${u}','Private event ${n}','2026-01-01');
    insert into public.shared_event_completions(id,event_id,couple_id,occurrence_date,completed_by,xp_awarded) values('${id(7)}','${id(6)}','${cid}','2026-01-01','${u}',0);
    insert into public.living_provenance(couple_id,source_kind,source_ref,source_bucket_item_id,target_kind,target_ref,target_moment_id,linked_by_role)
      values('${cid}','da_vivere','${id(1)}','${id(1)}','moment','${id(5)}','${id(5)}','francesco');
    insert into public.shared_messages(id,couple_id,sender_id,recipient_id,body) values('${id(8)}','${cid}','${u}','${v}','Private message ${n}');
    insert into public.stories(id,couple_id,author_id,media_path) values('${id(9)}','${cid}','${u}','${cid}/${u}/story.jpg');
    insert into public.story_views(story_id,viewer_id) values('${id(9)}','${v}');
    insert into public.think_reactions(message_id,reaction) values('${id(8)}','heart');
    insert into public.weekly_quiz_rewards(couple_id,set_id,week_start,score,xp_awarded) values('${cid}','${setid}','2026-01-05',0,0);
  `);
  await h.as(db,u,'select public.ensure_bond_week() r');
}
module.exports={seedTenant};
