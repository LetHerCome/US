import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";
import { vapidSubject } from "../_shared/web-push-vapid.mjs";
const VAPID_PUBLIC_KEY="BChjUsr-rF5fq-qgLrbsFn76z9GQaWJ7-a-_UX0gzU6hkSRC4r4GLwmQLtkuad_ntDBE6Fhr76jr_r7OBQdfuss";
function secretKey(){const modern=Deno.env.get("SUPABASE_SECRET_KEYS");if(modern){try{const p=JSON.parse(modern);if(p?.default)return p.default;const first=Object.values(p||{})[0];if(typeof first==="string")return first;}catch(_){}}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";}
function romeParts(){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Rome",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(new Date());const get=(t:string)=>Number(parts.find(p=>p.type===t)?.value||0);return{year:get("year"),month:get("month"),day:get("day"),hour:get("hour")};}
function iso(y:number,m:number,d:number){return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;}
Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return new Response("Method not allowed",{status:405});
  try{
    const url=Deno.env.get("SUPABASE_URL")||"",key=secretKey();if(!url||!key)return new Response("Server config missing",{status:500});
    const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const supplied=req.headers.get("x-us-cron-key")||"";const {data:expected,error:keyError}=await admin.rpc("get_internal_monthiversary_cron_key");
    if(keyError||!expected||supplied!==expected)return new Response("Unauthorized",{status:401});
    const now=romeParts();if(now.hour!==9)return Response.json({skipped:true,reason:"outside-local-hour"});const today=iso(now.year,now.month,now.day);
    const {data:couples,error:couplesError}=await admin.from("couples").select("id,started_on");if(couplesError)throw couplesError;
    const {data:vapidPrivate,error:vapidError}=await admin.rpc("get_internal_vapid_private_key");if(vapidError||!vapidPrivate)throw new Error("VAPID unavailable");webpush.setVapidDetails(vapidSubject(),VAPID_PUBLIC_KEY,vapidPrivate as string);
    let awarded=0,delivered=0;
    for(const couple of couples||[]){
      const [sy,sm,sd]=String(couple.started_on||"").split("-").map(Number);if(!sy||!sm||!sd||sd!==now.day)continue;
      let months=(now.year-sy)*12+(now.month-sm);if(now.day<sd)months-=1;if(months<=0)continue;
      const kind=months%12===0?"anniversary":"monthiversary",xp=kind==="anniversary"?200:60;
      const {data:granted,error:awardError}=await admin.rpc("award_relationship_milestone",{target_couple_id:couple.id,target_milestone_date:today,target_months:months,target_kind:kind,target_xp:xp});
      if(awardError){console.error("milestone award",awardError);continue;}if(!granted)continue;awarded++;
      const {data:profiles}=await admin.from("profiles").select("id").eq("couple_id",couple.id);let ids=(profiles||[]).map((p:{id:string})=>p.id);if(!ids.length)continue;
      const {data:prefs}=await admin.from("notification_preferences").select("user_id,relationship").in("user_id",ids);const prefMap=new Map((prefs||[]).map((p:any)=>[p.user_id,p.relationship]));ids=ids.filter(id=>prefMap.has(id)?Boolean(prefMap.get(id)):true);if(!ids.length)continue;
      const {data:subs}=await admin.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth_key").in("user_id",ids);
      const title=kind==="anniversary"?"US. · Anniversario ♡":"US. · Mesiversario ♡";const body=kind==="anniversary"?`${months/12} ${months/12===1?"anno":"anni"} insieme · +${xp} XP Bond`:`Oggi sono ${months} mesi insieme · +${xp} XP Bond`;
      const payload=JSON.stringify({title,body,icon:"/icon-192.png",badge:"/icon-192.png",tag:`relationship-${today}`,target:"home",url:"/?open=home&from=push"});
      for(const sub of subs||[]){try{await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth_key}},payload,{TTL:60*60*24,urgency:"normal"});delivered++;}catch(error){const status=Number((error as {statusCode?:number})?.statusCode||0);if(status===404||status===410)await admin.from("push_subscriptions").delete().eq("id",sub.id);}}
    }
    return Response.json({ok:true,awarded,delivered,date:today});
  }catch(error){console.error(error);return Response.json({error:"job failed"},{status:500});}
});