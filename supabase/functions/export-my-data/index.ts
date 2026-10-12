import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import {
  EXPORT_DOMAINS, MAX_ROWS_PER_DOMAIN,
  buildPersonalExport, classifyExportError
} from "../_shared/s3-2-export-core.mjs";

// EARLY S3.2 PROTOTYPE — NEVER DEPLOYED, NO PUBLIC/PRODUCTION GATE.
// This route is deliberately hard-locked to US-STAGING. A later reviewed
// production release requires an explicit replacement, independent privacy
// review, verified rate limits and complete shared+media export.
const STAGING_URL = "https://dugmhngrfkuieeletatb.supabase.co";
const STAGING_ORIGIN = "https://us-staging-s31.pages.dev";
const DEFAULT_HEADERS = {
  "Cache-Control": "no-store, private, max-age=0",
  "Pragma": "no-cache",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Vary": "Origin",
};
const makeHeaders = (origin: string | null) => ({
  ...DEFAULT_HEADERS,
  ...(origin === STAGING_ORIGIN ? {
    "Access-Control-Allow-Origin": STAGING_ORIGIN,
    "Access-Control-Allow-Headers": "authorization,apikey,x-client-info,content-type",
    "Access-Control-Allow-Methods": "GET,OPTIONS"
  }:{}),
});
const response = (status: number,code: string,headers: ReturnType<typeof makeHeaders>) => new Response(JSON.stringify({error:code}),{
  status,headers:{...headers,"Content-Type":"application/json;charset=utf-8"}
});
const uuid = (value: unknown): value is string => typeof value==="string" &&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const getBearer = (request: Request): string => {
 const value=request.headers.get("authorization") || "";
 const m=value.match(/^Bearer ([A-Za-z0-9._~+/-]+)$/);
 return m?.[1] || "";
};

Deno.serve(async (request: Request) => {
 const origin=request.headers.get("origin");
 const headers=makeHeaders(origin);
 if(origin !== null && origin !== STAGING_ORIGIN)return response(403,"ORIGIN_DENIED",headers);
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(request.method!=="GET")return response(405,"METHOD_NOT_ALLOWED",headers);

 const url=Deno.env.get("SUPABASE_URL") || "";
 if(url!==STAGING_URL || Deno.env.get("US_S32_EXPORT_ENABLED")!=="true")
   return response(404,"NOT_AVAILABLE",headers);

 const key=Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
 // An anon/publishable key is REQUIRED. A service_role/secret key is NOT an
 // acceptable fallback; all selects must execute with the caller JWT and RLS.
 if(!key)return response(503,"EXPORT_UNAVAILABLE",headers);
 const token=getBearer(request);
 if(!token)return response(401,"AUTHENTICATION_REQUIRED",headers);

 try {
  const client=createClient(url,key,{
   auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
   global:{headers:{Authorization:"Bearer "+token}}
  });
  const {data:auth,error:authError}=await client.auth.getUser(token);
  const ownerId=auth?.user?.id;
  if(authError||!uuid(ownerId)||!auth.user.email)
    return response(401,"AUTHENTICATION_REQUIRED",headers);
  const {data:profile,error:profileError}=await client.from("profiles")
    .select("id,couple_id").eq("id",ownerId).maybeSingle();
  const coupleId=profile?.couple_id;
  if(profileError||profile?.id!==ownerId||!uuid(coupleId))
    return response(403,"MEMBERSHIP_UNAVAILABLE",headers);

  const rowsByDomain: Record<string, Record<string, unknown>[]> = {};
  for(const spec of EXPORT_DOMAINS as ReadonlyArray<{table: string; owner: string; select: string; tenant: boolean}>){
   let q=client.from(spec.table).select(spec.select).eq(spec.owner,ownerId);
   if(spec.tenant)q=q.eq("couple_id",coupleId);
   const {data, error}=await q.limit(MAX_ROWS_PER_DOMAIN+1);
   if(error || !Array.isArray(data))throw new Error("export_query_unavailable");
   if(data.length>MAX_ROWS_PER_DOMAIN){
     throw Object.assign(new Error("export_too_large"),{code:"export_too_large"});
   }
   rowsByDomain[spec.table]=data;
  }

  // Membership may change while the export executes. Refuse to return rows
  // collected before a separation or session revocation.
  const [{data:current,error:currentError},{data:session,error:sessionError}]
    =await Promise.all([
      client.from("profiles").select("id,couple_id").eq("id",ownerId).maybeSingle(),
      client.auth.getUser(token)
    ]);
  if(currentError||sessionError||session?.user?.id!==ownerId ||
     current?.id!==ownerId||current?.couple_id!==coupleId)
    return response(403,"MEMBERSHIP_CHANGED",headers);

  const output=buildPersonalExport({
   ownerId,coupleId,email:auth.user.email,profile,rowsByDomain,
   generatedAt:new Date().toISOString()
  });
  return new Response(JSON.stringify(output),{status:200,headers:{
    ...headers,
    "Content-Type":"application/json;charset=utf-8",
    "Content-Disposition":'attachment; filename="us-personal-export-partial.json"',
  }});
 } catch(error){
  // Never print auth tokens, raw table rows, private strings or full exception
  // objects (Supabase exceptions may contain personal metadata).
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
  return response(code==="export_too_large"?413:503,
    classifyExportError(error),headers);
 }
});
