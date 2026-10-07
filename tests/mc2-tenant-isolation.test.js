const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const {pathToFileURL}=require('node:url');
const h=require('./helpers/mc2-db');const {seedTenant}=require('./helpers/mc2-tenant-seed');
let db,bcid;
test.before(async()=>{
  db=await h.database();bcid=(await h.create(db)).couple_id;const i=await h.invite(db);await h.accept(db,h.U2,i.code);
  await seedTenant(db,h.A,h.F,h.B,1);await seedTenant(db,bcid,h.U1,h.U2,2);
});
test.after(async()=>await db?.close());
const ident=s=>'"'+s.replaceAll('"','""')+'"';
const catalog=async()=> (await db.query("select c.oid,c.relname,c.relkind,array_agg(a.attname::text) cols from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped where n.nspname='public' and c.relkind in('r','p','v','m') and has_table_privilege('authenticated',c.oid,'SELECT') group by c.oid,c.relname,c.relkind order by c.relname")).rows;
function scope(t,cid,users){
  if(t.cols.includes('couple_id'))return `couple_id='${cid}'`;
  if(t.relname==='couples')return `id='${cid}'`;
  if(t.relname==='notification_preferences')return `user_id in('${users.join("','")}')`;
  if(t.relname==='story_views')return `story_id in(select id from public.stories where couple_id='${cid}')`;
  if(t.relname==='think_reactions')return `message_id in(select id from public.shared_messages where couple_id='${cid}')`;
  return null;
}
test('ISO-01: every catalog-discovered readable private table has witnesses and bidirectional denial',async(t)=>{
  const tables=await catalog();assert.ok(tables.length>=36);
  for(const table of tables){
    const name=`public.${ident(table.relname)}`;
    const pa=scope(table,h.A,[h.F,h.B]),pb=scope(table,bcid,[h.U1,h.U2]);
    if(!pa){t.diagnostic(`${table.relname}: shared catalog, no private tenant rows`);continue;}
    for(const [predicate,users,owner] of [[pa,[h.U1,h.U2],h.F],[pb,[h.F,h.B],h.U1]]){
      // The history view explicitly resolves auth.uid(), even for postgres.
      const foreign=table.relkind==='v' ? await h.as(db,owner,`select * from ${name} where ${predicate}`)
        : (await db.query(`select * from ${name} where ${predicate}`)).rows;
      assert.ok(foreign.length>0,`${table.relname} populated foreign control`);
      // Compare actual foreign row identities, including indirect tenant tables.
      for(const u of users){const visible=await h.as(db,u,`select * from ${name}`);assert.ok(!visible.some(r=>foreign.some(f=>JSON.stringify(f)===JSON.stringify(r))),`${table.relname}: ${u} cannot observe foreign rows`);}
    }
  }
});
test('ISO-02: every INSERT-policy table rejects cross-tenant/cross-owner writes',async()=>{
  const tables=(await db.query("select distinct c.oid,c.relname from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and p.polcmd in('a','*')")).rows;
  for(const table of tables)for(const [u,cid,foreignUsers] of [[h.U1,h.A,[h.F,h.B]],[h.F,bcid,[h.U1,h.U2]]]){
    const meta=(await catalog()).find(t=>t.oid===table.oid);assert.ok(meta,`${table.relname} catalogued`);
    const rows=(await db.query(`select * from public.${ident(table.relname)} where ${scope(meta,cid,foreignUsers)}`)).rows;
    assert.ok(rows.length);const payload={...rows[0]};
    if(payload.id)payload.id=h.uid(9000);
    // Keep a foreign tenant or foreign parent resource while satisfying actor identity.
    for(const key of ['created_by','actor_id','sender_id','author_id','requested_by'])if(key in payload)payload[key]=u;
    if('user_id' in payload && 'couple_id' in payload)payload.user_id=u;
    if('viewer_id' in payload)payload.viewer_id=u;
    await assert.rejects(h.as(db,u,`insert into public.${ident(table.relname)} select (jsonb_populate_record(null::public.${ident(table.relname)},$1::jsonb)).*`,[payload]),e=>e.code==='42501',`${table.relname}: rejected by authorization`);
  }
});
test('ISO mutation: every client-updatable/deletable private table denies foreign rows',async()=>{
  for(const table of await catalog()){
    for(const [u,cid,users] of [[h.U1,h.A,[h.F,h.B]],[h.F,bcid,[h.U1,h.U2]]]){
      const pred=scope(table,cid,users);if(!pred)continue;
      const name=`public.${ident(table.relname)}`;const before=(await db.query(`select * from ${name} where ${pred}`)).rows;
      const cols=(await db.query("select attname from pg_attribute where attrelid=$1 and attnum>0 and not attisdropped and has_column_privilege('authenticated',attrelid,attnum,'UPDATE')",[table.oid])).rows;
      for(const c of cols)assert.deepEqual(await h.as(db,u,`update ${name} set ${ident(c.attname)}=${ident(c.attname)} where ${pred} returning *`),[],`${table.relname}.${c.attname}`);
      if((await db.query("select has_table_privilege('authenticated',$1::oid,'DELETE') ok",[table.oid])).rows[0].ok)assert.deepEqual(await h.as(db,u,`delete from ${name} where ${pred} returning *`),[]);
      assert.deepEqual((await db.query(`select * from ${name} where ${pred}`)).rows,before);
    }
  }
});
test('ISO-03: Storage own-folder positive controls and foreign CRUD denials for both couples',async()=>{
  await db.exec('grant select,insert,update,delete on storage.objects to authenticated');
  for(const [u,cid,other,otherU] of [[h.U1,bcid,h.A,h.F],[h.F,h.A,bcid,h.U1]]){
    const own=`${cid}/${u}/mc2.jpg`,foreign=`${other}/${otherU}/mc2.jpg`;
    await h.as(db,u,'insert into storage.objects(bucket_id,name,owner_id) values(\'us-media\',$1,$2)',[own,u]);
    assert.equal((await h.as(db,u,'select name from storage.objects where name=$1',[own])).length,1);
    assert.deepEqual(await h.as(db,u,'select name from storage.objects where name like $1',[`${other}/%`]),[]);
    await assert.rejects(h.as(db,u,'insert into storage.objects(bucket_id,name,owner_id) values(\'us-media\',$1,$2)',[foreign,u]),e=>e.code==='42501');
    assert.deepEqual(await h.as(db,u,'update storage.objects set name=name where name like $1 returning id',[`${other}/%`]),[]);
    assert.deepEqual(await h.as(db,u,'delete from storage.objects where name like $1 returning id',[`${other}/%`]),[]);
  }
});
const smoke=async(d,u,forbidden)=>{
  const q=(await d.query("select id from public.daily_questions where question_date='2026-01-01'")).rows[0]?.id;
  for(const sql of ['select public.get_daily_state($1::uuid) r','select public.get_progression_v1() r','select public.get_game_v2_home() r','select public.ensure_bond_week() r','select public.get_or_create_daily_question() r']){
    const value=await h.as(d,u,sql,sql.includes('$1')?[q]:[]);assert.ok(!JSON.stringify(value).includes(forbidden),sql);
  }
  await assert.rejects(h.as(d,u,'select public.list_couple_questions() r'),e=>e.code==='42501' && !e.message.includes(forbidden));
};
test('ISO-04/05: existing RPCs work for both B members and a one-member MC2 couple',async()=>{
  await smoke(db,h.U1,h.A);await smoke(db,h.U2,h.A);
  await h.create(db,h.U3);await smoke(db,h.U3,h.A);
});
test('ISO-06: callable definer authority input inventory stays reviewed',async(t)=>{
  const rows=(await db.query("select p.oid::regprocedure::text signature,p.prosrc,p.proargnames from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and p.prosecdef and has_function_privilege('authenticated',p.oid,'EXECUTE')")).rows;
  const ids=rows.filter(r=>(r.proargnames||[]).some(n=>/couple_id/.test(n)));
  for(const r of ids){t.diagnostic(r.signature);assert.match(r.prosrc,/auth\.uid\(\)|current_couple_id\(\)|m11a_actor/);}
  for(const r of rows.filter(r=>/create_couple\(|partner_invite\(|get_couple_membership\(/.test(r.signature)))assert.ok(!(r.proargnames||[]).some(n=>/couple_id|invite_id|user_id|role/.test(n)));
});
test('NOTIF-01/02: join enables registrations under B; dispatcher for A excludes B devices',async()=>{
  const token='mc2_fcm_'+ 'a'.repeat(64);const install=h.uid(9010);
  for(const sql of ["select public.register_native_push_device($1,'android','fcm',$2) r","select public.register_web_push_subscription('https://example.test/new','abcdefghijklmnopqrst','abcdefgh') r"])
    await assert.rejects(h.as(db,h.U4,sql,sql.includes('$1')?[install,token]:[]),e=>/couple membership required|Profile not linked/.test(e.message));
  await h.as(db,h.U2,"select public.register_native_push_device($1,'android','fcm',$2) r",[install,token]);
  await h.as(db,h.U2,"select public.register_web_push_subscription('https://example.test/joined','abcdefghijklmnopqrst','abcdefgh') r");
  const rows=(await db.query('select * from public.device_push_tokens where user_id=$1',[h.U2])).rows;assert.equal(rows[0].couple_id,bcid);
  assert.equal((await db.query("select couple_id from public.push_subscriptions where endpoint='https://example.test/joined'")).rows[0].couple_id,bcid);
  const {buildNotification,deliverNotification}=await import(pathToFileURL(path.join(h.ROOT,'supabase/functions/_shared/notification-core.mjs')));
  // DB-backed admin query adapter; only transport is replaced to avoid delivery.
  const admin={from:table=>({select:()=>({in:async(col,ids)=>({data:(await db.query(`select * from public.${ident(table)} where ${ident(col)}=any($1::uuid[])`,[ids])).rows,error:null})})})};
  const sent=[];const native={ready:()=>true,send:async device=>{sent.push(device);return{ok:true};}};
  const result=await deliverNotification(admin,{notification:buildNotification('test'),recipientIds:[h.U2],coupleId:h.A,native});
  assert.equal(result.delivered,0);assert.deepEqual(sent,[]);
  const positive=await deliverNotification(admin,{notification:buildNotification('test'),recipientIds:[h.U2],coupleId:bcid,native});
  assert.equal(positive.delivered,1);assert.equal(sent[0].couple_id,bcid);
});
