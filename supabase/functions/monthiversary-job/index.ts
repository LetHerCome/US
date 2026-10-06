import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";
import { vapidSubject } from "../_shared/web-push-vapid.mjs";
import { buildNotification, deliverNotification } from "../_shared/notification-core.mjs";
import { nativeTransport } from "../_shared/native-push-env.ts";
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
      const title=kind==="anniversary"?"US. · Anniversario ♡":"US. · Mesiversario ♡";const body=kind==="anniversary"?`${months/12} ${months/12===1?"anno":"anni"} insieme · +${xp} XP Bond`:`Oggi sono ${months} mesi insieme · +${xp} XP Bond`;
      const result=await deliverNotification(admin,{notification:buildNotification("relationship",{title,body,tag:`relationship-${today}`}),recipientIds:ids,coupleId:couple.id,eventType:kind,web:{send:(s:unknown,p:string,o:unknown)=>webpush.sendNotification(s as any,p,o as any)},native:nativeTransport()});delivered+=result.delivered||0;
    }
    return Response.json({ok:true,awarded,delivered,date:today});
  }catch(error){console.error(error);return Response.json({error:"job failed"},{status:500});}
});