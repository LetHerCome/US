import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import webpush from "npm:web-push@3.6.7";
import { vapidSubject } from "../_shared/web-push-vapid.mjs";
import { supabaseSecretKey } from "../_shared/supabase-secret.ts";
import { nativeTransport } from "../_shared/native-push-env.ts";
import { dispatchDailyQuestionPush } from "../_shared/daily-question-push-core.mjs";

// M10C — Push di sistema "Domanda del giorno".
// Chiamato SOLO dal cron pg_cron `us-daily-question-push` (header
// x-us-cron-key, chiave DEDICATA nel vault). NON è un endpoint utente: non
// accetta parametri (domanda, destinatari e testo sono decisi lato server) e
// nessun client può chiedere una push di sistema arbitraria.
//
// Il cron materializza la domanda del giorno Europe/Rome subito prima della
// chiamata, quindi funziona anche se nessuno apre US.

const VAPID_PUBLIC_KEY = "BChjUsr-rF5fq-qgLrbsFn76z9GQaWJ7-a-_UX0gzU6hkSRC4r4GLwmQLtkuad_ntDBE6Fhr76jr_r7OBQdfuss";

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
    // Native Notifications V1: FCM / APNs from Edge secrets; unconfigured = skipped (fail closed).
    const native = nativeTransport();

    const cronKey = (request.headers.get("x-us-cron-key") || "").trim();
    if (!cronKey) return json({ error: "Unauthorized" }, 401);
    const { data: expectedKey, error: keyError } = await admin.rpc("get_internal_daily_question_push_cron_key");
    if (keyError || !expectedKey || cronKey !== expectedKey) return json({ error: "Unauthorized" }, 401);

    let vapidReady = false;
    const ensureVapid = async () => {
      if (vapidReady) return;
      const { data: vapidPrivate, error: vapidError } = await admin.rpc("get_internal_vapid_private_key");
      if (vapidError || !vapidPrivate) throw new Error("push_configuration_unavailable");
      webpush.setVapidDetails(vapidSubject(), VAPID_PUBLIC_KEY, vapidPrivate as string);
      vapidReady = true;
    };

    const result = await dispatchDailyQuestionPush(admin, {
      now: new Date(),
      ensureVapid,
      sendNotification: (subscription: unknown, payload: string, options: unknown) => webpush.sendNotification(subscription as any, payload, options as any),
        native,
    });
    // Solo esiti aggregati: niente testo della domanda, niente endpoint.
    const outcomes: Record<string, number> = {};
    for (const recipient of result.recipients) outcomes[recipient.outcome] = (outcomes[recipient.outcome] || 0) + 1;
    return json({ ok: true, day: result.day, reason: result.reason || null, delivered: result.delivered, outcomes });
  } catch (error) {
    console.error("daily-question-push-worker fatal", error instanceof Error ? error.message : "unknown");
    return json({ error: "Daily Question push failed" }, 500);
  }
});
