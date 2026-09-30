import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import webpush from "npm:web-push@3.6.7";
import { supabaseSecretKey } from "../_shared/supabase-secret.ts";
import { dispatchGameV2PendingPushes } from "../_shared/game-v2-push-core.mjs";

// M11D — Game V2 system pushes: the weekly turn and recovery of "tocca a te",
// "risposte pronte" and "domanda della settimana" events the fast path missed.
// Called ONLY by the pg_cron job `us-game-v2-push` (header x-us-cron-key, a
// DEDICATED vault key). Not a user endpoint: it takes no parameters; events,
// recipients and copy are derived server-side (public.game_v2_pending_pushes).

const VAPID_PUBLIC_KEY = "BChjUsr-rF5fq-qgLrbsFn76z9GQaWJ7-a-_UX0gzU6hkSRC4r4GLwmQLtkuad_ntDBE6Fhr76jr_r7OBQdfuss";
const VAPID_SUBJECT = "https://usfinal.vercel.app";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type,x-us-cron-key",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const secret = supabaseSecretKey();
    if (!url || !secret) return json({ error: "Server configuration missing" }, 500);
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

    const cronKey = (request.headers.get("x-us-cron-key") || "").trim();
    if (!cronKey) return json({ error: "Unauthorized" }, 401);
    const { data: expectedKey, error: keyError } = await admin.rpc("get_internal_game_v2_push_cron_key");
    if (keyError || !expectedKey || cronKey !== expectedKey) return json({ error: "Unauthorized" }, 401);

    let vapidReady = false;
    const ensureVapid = async () => {
      if (vapidReady) return;
      const { data: vapidPrivate, error: vapidError } = await admin.rpc("get_internal_vapid_private_key");
      if (vapidError || !vapidPrivate) throw new Error("push_configuration_unavailable");
      webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, vapidPrivate as string);
      vapidReady = true;
    };

    const result = await dispatchGameV2PendingPushes(admin, {
      now: new Date(),
      ensureVapid,
      sendNotification: (subscription: unknown, payload: string, options: unknown) => webpush.sendNotification(subscription as any, payload, options as any),
    });
    // Aggregates only: no ids, no endpoints, no content.
    const outcomes: Record<string, number> = {};
    for (const event of result.events) outcomes[`${event.kind}:${event.outcome}`] = (outcomes[`${event.kind}:${event.outcome}`] || 0) + 1;
    return json({ ok: true, reason: result.reason || null, delivered: result.delivered, outcomes });
  } catch (error) {
    console.error("game-v2-push-worker fatal", error instanceof Error ? error.message : "unknown");
    return json({ error: "Game push failed" }, 500);
  }
});
