import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import webpush from "npm:web-push@3.6.7";
import { vapidSubject } from "../_shared/web-push-vapid.mjs";
import { nativeTransport } from "../_shared/native-push-env.ts";
import { supabaseSecretKey } from "../_shared/supabase-secret.ts";
import { ricordaCatchUp, ricordaSlot, romeHour, runRicordaPushJob } from "../_shared/us-ricorda-push-core.mjs";

// Avvisi di US vi ricorda (27/11/2026). Called every hour by cron
// `us-ricorda-push-hourly` with x-us-cron-key; acts at 10 and at 18 in Rome,
// and from 11 to 21 only for the lines that waited (Come stai lavoro/studio).
// By hand (staging, crons off): the same key and the body {"force":"mattina"}
// or {"force":"sera"}.
const VAPID_PUBLIC_KEY = "BChjUsr-rF5fq-qgLrbsFn76z9GQaWJ7-a-_UX0gzU6hkSRC4r4GLwmQLtkuad_ntDBE6Fhr76jr_r7OBQdfuss";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const url = Deno.env.get("SUPABASE_URL") || "", key = supabaseSecretKey();
    if (!url || !key) return new Response("Server config missing", { status: 500 });
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const supplied = req.headers.get("x-us-cron-key") || "";
    const { data: expected, error: keyError } = await admin.rpc("get_internal_ricorda_push_cron_key");
    if (keyError || !expected || supplied !== expected) return new Response("Unauthorized", { status: 401 });
    const body = await req.json().catch(() => ({}));
    const force = typeof body?.force === "string" ? body.force : undefined;
    const hour = romeHour(new Date());
    const slot = ricordaSlot(hour, force);
    // Come stai che conta (D11/D19): between the two hours, the lines that
    // waited for someone at work or studying (up to 21 in Rome).
    const catchUp = slot || force ? [] : ricordaCatchUp(hour);
    if (!slot && !catchUp.length) return Response.json({ skipped: true, reason: "outside-local-hour" });
    const { data: vapidPrivate, error: vapidError } = await admin.rpc("get_internal_vapid_private_key");
    if (vapidError || !vapidPrivate) throw new Error("VAPID unavailable");
    webpush.setVapidDetails(vapidSubject(), VAPID_PUBLIC_KEY, vapidPrivate as string);
    const web = { send: (s: unknown, p: string, o: unknown) => webpush.sendNotification(s as any, p, o as any) };
    const native = nativeTransport();
    if (slot) return Response.json(await runRicordaPushJob(admin, { slot, web, native }));
    const results: unknown[] = [];
    for (const waiting of catchUp) results.push(await runRicordaPushJob(admin, { slot: waiting, web, native, catchUp: true }));
    return Response.json({ ok: true, catchUp: results });
  } catch (error) {
    console.error("us-ricorda-push-worker", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "job failed" }, { status: 500 });
  }
});
