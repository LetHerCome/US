import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import webpush from "npm:web-push@3.6.7";
import { vapidSubject } from "../_shared/web-push-vapid.mjs";
import { supabaseSecretKey } from "../_shared/supabase-secret.ts";
import { dispatchGameSessionPush, dispatchGameWeeklyPush } from "../_shared/game-v2-push-core.mjs";

// M11D — Game V2 fast path, called by the actor's own client right after it
// finalizes a round (game_session) or creates this week's question
// (game_weekly). It is separate from send-web-push, which stays byte-identical.
// The client names only the round / question id: what to send, to whom
// (couple + stable role) and the dedupe key are derived in SQL
// (public.game_v2_push_for_session / game_v2_push_for_weekly).

const VAPID_PUBLIC_KEY = "BChjUsr-rF5fq-qgLrbsFn76z9GQaWJ7-a-_UX0gzU6hkSRC4r4GLwmQLtkuad_ntDBE6Fhr76jr_r7OBQdfuss";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type", "Access-Control-Allow-Methods": "POST,OPTIONS", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const secret = supabaseSecretKey();
    const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!url || !secret) return json({ error: "Server configuration missing" }, 500);
    if (!token) return json({ error: "Authentication required" }, 401);
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Invalid session" }, 401);
    const body = await request.json().catch(() => ({}));
    const type = body?.type;
    if (type !== "game_session" && type !== "game_weekly") return json({ error: "Invalid notification type" }, 400);
    if (typeof body.reference_id !== "string" || !UUID.test(body.reference_id)) return json({ error: "Missing game reference" }, 400);

    const options = {
      // The actor is the verified session user; nothing else from the body is read.
      actorId: authData.user.id,
      ensureVapid: async () => {
        const { data: vapidPrivate, error: vapidError } = await admin.rpc("get_internal_vapid_private_key");
        if (vapidError || !vapidPrivate) throw new Error("push_configuration_unavailable");
        webpush.setVapidDetails(vapidSubject(), VAPID_PUBLIC_KEY, vapidPrivate as string);
      },
      sendNotification: (subscription: unknown, payload: string, options: unknown) => webpush.sendNotification(subscription as any, payload, options as any),
    };
    const result = type === "game_session"
      ? await dispatchGameSessionPush(admin, { sessionId: body.reference_id, ...options })
      : await dispatchGameWeeklyPush(admin, { questionId: body.reference_id, ...options });
    return json({ kind: result.kind || null, outcome: result.outcome, delivered: result.delivered, failed: result.failed });
  } catch (error) {
    console.error("game-v2-push fatal", error instanceof Error ? error.message : "unknown");
    return json({ error: "Game push failed" }, 500);
  }
});
