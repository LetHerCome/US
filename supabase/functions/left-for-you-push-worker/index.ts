import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import webpush from "npm:web-push@3.6.7";
import { vapidSubject } from "../_shared/web-push-vapid.mjs";
import { supabaseSecretKey } from "../_shared/supabase-secret.ts";
import { dispatchLeftForYouPush, leftForYouDedupeKey } from "../_shared/left-for-you-push-core.mjs";

// M9A — Rete di sicurezza per le notifiche di "Lasciato per te".
// Chiamato SOLO dal cron pg_cron (header x-us-cron-key, chiave DEDICATA nel
// vault). NON è un endpoint utente.
//
// Il percorso veloce resta send-web-push, chiamato dal mittente subito dopo
// l'insert. Se quella richiesta si perde (PWA sospesa/chiusa subito dopo
// "Lasciato ♡", rete assente, cold start), la riga resta in public.left_for_you
// senza chiave `left-for-you:<id>` in push_event_log: questo worker la trova
// e la notifica con la stessa logica e la stessa chiave (nessun duplicato).

const VAPID_PUBLIC_KEY = "BChjUsr-rF5fq-qgLrbsFn76z9GQaWJ7-a-_UX0gzU6hkSRC4r4GLwmQLtkuad_ntDBE6Fhr76jr_r7OBQdfuss";
// Lascia al percorso veloce il tempo di completare prima di intervenire.
const GRACE_SECONDS = 45;
// Oltre questa finestra una notifica "ti ha lasciato qualcosa" non ha più senso.
const WINDOW_MINUTES = 15;
const BATCH_LIMIT = 100;

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
    const { data: expectedKey, error: keyError } = await admin.rpc("get_internal_left_for_you_push_cron_key");
    if (keyError || !expectedKey || cronKey !== expectedKey) return json({ error: "Unauthorized" }, 401);

    const now = Date.now();
    const { data: pending, error: pendingError } = await admin.from("left_for_you")
      .select("id")
      .is("seen_at", null)
      .gte("created_at", new Date(now - WINDOW_MINUTES * 60_000).toISOString())
      .lte("created_at", new Date(now - GRACE_SECONDS * 1000).toISOString())
      .order("created_at", { ascending: true })
      .limit(BATCH_LIMIT);
    if (pendingError) throw pendingError;
    const ids = (pending || []).map((row: { id: string }) => row.id);
    if (!ids.length) return json({ ok: true, pending: 0, delivered: 0 });

    const { data: logged, error: loggedError } = await admin.from("push_event_log")
      .select("dedupe_key")
      .in("dedupe_key", ids.map(leftForYouDedupeKey));
    if (loggedError) throw loggedError;
    const alreadyNotified = new Set((logged || []).map((row: { dedupe_key: string }) => row.dedupe_key));
    const missing = ids.filter((id: string) => !alreadyNotified.has(leftForYouDedupeKey(id)));
    if (!missing.length) return json({ ok: true, pending: 0, delivered: 0 });

    let vapidReady = false;
    const ensureVapid = async () => {
      if (vapidReady) return;
      const { data: vapidPrivate, error: vapidError } = await admin.rpc("get_internal_vapid_private_key");
      if (vapidError || !vapidPrivate) throw new Error("push_configuration_unavailable");
      webpush.setVapidDetails(vapidSubject(), VAPID_PUBLIC_KEY, vapidPrivate as string);
      vapidReady = true;
    };

    let delivered = 0;
    const outcomes: Record<string, number> = {};
    for (const itemId of missing) {
      const result = await dispatchLeftForYouPush(admin, {
        itemId,
        skipIfSeen: true,
        ensureVapid,
        sendNotification: (subscription: unknown, payload: string, options: unknown) => webpush.sendNotification(subscription as any, payload, options as any),
      });
      if (result.delivered) delivered += 1;
      const outcome = result.delivered ? "delivered" : (result.deduplicated ? "deduplicated" : (result.reason || "failed"));
      outcomes[outcome] = (outcomes[outcome] || 0) + 1;
    }
    return json({ ok: true, pending: missing.length, delivered, outcomes });
  } catch (error) {
    console.error("left-for-you-push-worker fatal", error instanceof Error ? error.message : "unknown");
    return json({ error: "Left for You push sweep failed" }, 500);
  }
});
