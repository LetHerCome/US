// Shared seed for the S3.2 lifecycle DB tests (two synthetic couples).
function seeder(db){
const q=async(sql,p=[])=>(await db.query(sql,p)).rows;
const one=async(sql,p=[])=>(await q(sql,p))[0];
const path=(c,u,f)=>`${c}/${u}/${f}`;

async function seedCouple(c,a,b,tag){
  const ins=async(sql,p)=>(await q(sql+' returning id',p))[0]?.id;
  const ids={};
  ids.msgAB=await ins("insert into public.shared_messages(couple_id,sender_id,recipient_id,body,kind) values($1,$2,$3,$4,'normal')",[c,a,b,tag+'_msg_a_to_b']);
  ids.msgBA=await ins("insert into public.shared_messages(couple_id,sender_id,recipient_id,body,kind) values($1,$2,$3,$4,'normal')",[c,b,a,tag+'_msg_b_to_a']);
  ids.msgSched=await ins("insert into public.shared_messages(couple_id,sender_id,recipient_id,body,kind,unlock_at) values($1,$2,$3,$4,'scheduled',now()+interval '3 days')",[c,a,b,tag+'_msg_scheduled']);
  ids.momA=await ins('insert into public.moments(couple_id,created_by,storage_path,thumbnail_path,caption) values($1,$2,$3,$4,$5)',[c,a,path(c,a,'m1.webp'),path(c,a,'derived-thumbnails/m1.webp'),tag+'_moment_a']);
  ids.momB=await ins('insert into public.moments(couple_id,created_by,storage_path,caption) values($1,$2,$3,$4)',[c,b,path(c,b,'m2.webp'),tag+'_moment_b']);
  ids.photoAinA=await ins('insert into public.moment_photos(moment_id,couple_id,created_by,storage_path,position) values($1,$2,$3,$4,1)',[ids.momA,c,a,path(c,a,'moment-albums/x/p1.webp')]);
  ids.photoBinA=await ins('insert into public.moment_photos(moment_id,couple_id,created_by,storage_path,position) values($1,$2,$3,$4,2)',[ids.momA,c,b,path(c,b,'moment-albums/x/p2.webp')]);
  ids.photoAinB=await ins('insert into public.moment_photos(moment_id,couple_id,created_by,storage_path,position) values($1,$2,$3,$4,1)',[ids.momB,c,a,path(c,a,'moment-albums/y/p3.webp')]);
  ids.calShared=await ins("insert into public.calendar_entries(couple_id,entry_type,created_by,title,is_all_day,start_date,end_date) values($1,'shared',$2,$3,true,'2026-10-20','2026-10-20')",[c,a,tag+'_cal_shared']);
  ids.calPersA=await ins("insert into public.calendar_entries(couple_id,entry_type,created_by,owner_id,title,is_all_day,start_date,end_date) values($1,'personal',$2,$2,$3,true,'2026-10-21','2026-10-21')",[c,a,tag+'_cal_personal_a']);
  ids.calPersB=await ins("insert into public.calendar_entries(couple_id,entry_type,created_by,owner_id,title,is_all_day,start_date,end_date) values($1,'personal',$2,$2,$3,true,'2026-10-22','2026-10-22')",[c,b,tag+'_cal_personal_b']);
  ids.event=await ins("insert into public.shared_events(couple_id,created_by,title,event_date) values($1,$2,$3,'2026-10-12')",[c,a,tag+'_event']);
  await q("insert into public.shared_event_completions(event_id,couple_id,occurrence_date,completed_by,xp_awarded) values($1,$2,'2026-10-12',$3,10)",[ids.event,c,a]);
  ids.bucket=await ins('insert into public.bucket_items(couple_id,created_by,title) values($1,$2,$3)',[c,a,tag+'_wish']);
  ids.leftKept=await ins("insert into public.left_for_you(couple_id,sender_id,recipient_id,kind,media_path) values($1,$2,$3,'photo',$4)",[c,a,b,path(c,a,'left/kept.webp')]);
  ids.leftGone=await ins("insert into public.left_for_you(couple_id,sender_id,recipient_id,kind,media_path) values($1,$2,$3,'photo',$4)",[c,a,b,path(c,a,'left/gone.webp')]);
  ids.leftToA=await ins("insert into public.left_for_you(couple_id,sender_id,recipient_id,kind,body) values($1,$2,$3,'text',$4)",[c,b,a,tag+'_left_b_to_a']);
  await q('insert into public.conserva_contributions(couple_id,source_item_id,conserved_by,source_sender_id) values($1,$2,$3,$4)',[c,ids.leftKept,b,a]);
  const dq=(await one("insert into public.daily_questions(question_date,question) values(('2026-10-1'||$1::text)::date,'Q') returning id",[tag==='A'?'1':'2'])).id;
  for(const u of [a,b]){
    await q("insert into public.daily_answers(question_id,user_id,couple_id,answer) values($1,$2,$3,'ans')",[dq,u,c]);
    await q("insert into public.moods(couple_id,user_id,mood) values($1,$2,'ok')",[c,u]);
    await q('insert into public.stories(couple_id,author_id,media_path) values($1,$2,$3)',[c,u,path(c,u,'story.webp')]);
    await q("insert into public.device_push_tokens(user_id,couple_id,token,platform,installation_id,provider) values($1,$2,$3,'android',gen_random_uuid(),'fcm')",[u,c,'tok_'+u]);
    await q('insert into public.couple_locations(user_id,couple_id,latitude,longitude) values($1,$2,45.123456,9.123456)',[u,c]);
    await q('insert into public.widget_tokens(couple_id,profile_id,token_hash) values($1,$2,$3)',[c,u,'hash_'+u]);
    await q('update public.profiles set avatar_path=$2 where id=$1',[u,path(c,u,'avatar.webp')]);
  }
  return ids;
}

// Every row of every public table that mentions a user id, as text.
async function rowsMentioning(user){
  const tables=await q("select table_name t from information_schema.tables where table_schema='public' and table_type='BASE TABLE'");
  const hits=[];
  for(const {t} of tables){
    // Storage locators of kept media keep their folder name (a random id
    // that no longer maps to any account); every other column must be clean.
    const r=await one(`select count(*)::int n from public.${t} x where position($1 in (to_jsonb(x)-'storage_path'-'thumbnail_path'-'media_path'-'avatar_path'-'home_photo_path')::text)>0`,[user]);
    if(r.n)hits.push(`${t}:${r.n}`);
  }
  return hits;
}
// Fingerprint of everything belonging to one couple, to prove isolation.
async function coupleFingerprint(c){
  const tables=await q("select table_name t from information_schema.columns where table_schema='public' and column_name='couple_id' and table_name in (select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE')");
  const out={};
  for(const {t} of tables) out[t]=(await one(`select coalesce(md5(string_agg(x::text,'|' order by x::text)),'') h from public.${t} x where couple_id=$1`,[c])).h;
  out.couple=(await one('select md5(x::text) h from public.couples x where id=$1',[c])).h;
  return out;
}

return {seedCouple,rowsMentioning,coupleFingerprint};
}
module.exports={seeder};
