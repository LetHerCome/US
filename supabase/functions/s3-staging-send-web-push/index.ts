// Store S3 QA ONLY. Deploy as slug "send-web-push" to US-STAGING
// (dugmhngrfkuieeletatb) and NEVER to production.
// The client may request ONLY a generic, self-addressed test notification.
// Firebase FCM service account MUST belong to our dedicated STAGING project.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { buildNotification, deliverNotification } from "../_shared/notification-core.mjs";
import { nativePushConfig, createNativeTransport } from "../_shared/native-push-transport.mjs";
import { supabaseSecretKey } from "../_shared/supabase-secret.ts";

const STAGE_URL = "https://dugmhngrfkuieeletatb.supabase.co";
const STAGE_FIREBASE_PROJECT = "us-staging-45e0f";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEADERS = {
  "Content-Type": "application/json", "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,content-type,apikey,x-client-info",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: HEADERS });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  // Fail closed if mistakenly deployed to production or another Supabase project.
  if (Deno.env.get("SUPABASE_URL") !== STAGE_URL) return json({ error: "wrong_environment" }, 503);
  const bearer = (request.headers.get("authorization") || "").match(/^Bearer\s+(\S+)$/i)?.[1] || "";
  if (!bearer) return json({ error: "authentication_required" }, 401);
  const secret = supabaseSecretKey();
  if (!secret) return json({ error: "staging_backend_unconfigured" }, 503);
  try {
    const admin = createClient(STAGE_URL, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // The gateway also has verify_jwt=true. Revalidate against Auth because
    // a signed token does not necessarily represent a CURRENT user session.
    const { data: auth, error: authError } = await admin.auth.getUser(bearer);
    const userId = String(auth?.user?.id || "");
    if (authError || !UUID.test(userId)) return json({ error: "invalid_session" }, 401);

    const requestBody = await request.json().catch(() => null);
    // Reject arbitrary tokens, recipients, event types, URLs and private text.
    if (!requestBody || typeof requestBody !== "object" || Array.isArray(requestBody)
        || Object.keys(requestBody).length !== 1 || requestBody.type !== "test") {
      return json({ error: "test_only" }, 400);
    }
    const { data: profile, error: profileError } = await admin.from("profiles")
      .select("id,couple_id").eq("id", userId).maybeSingle();
    if (profileError || !profile || !UUID.test(String(profile.couple_id || ""))) {
      return json({ error: "no_staging_couple" }, 403);
    }

    const provider = nativePushConfig((key: string) =>
      key === "FCM_SERVICE_ACCOUNT_JSON" ? Deno.env.get(key) : undefined);
    if (!provider.fcm || provider.fcm.projectId !== STAGE_FIREBASE_PROJECT) {
      return json({ error: "staging_fcm_service_account_missing_or_wrong" }, 503);
    }
    const native = createNativeTransport({
      config: { fcm: provider.fcm, apns: null },
      fetch: globalThis.fetch,
    });
    // The existing dispatcher enforces recipient's couple ID on every token.
    // Same authenticated user only. Logical dedupe = one per minute.
    const result = await deliverNotification(admin, {
      notification: buildNotification("test"),
      recipientIds: [userId],
      coupleId: profile.couple_id,
      senderId: userId,
      dedupeKey: `s3-self-test:${userId}:${Math.floor(Date.now() / 60_000)}`,
      eventType: "test",
      native,
    });
    return json({
      delivered: result.delivered || 0,
      failed: result.failed || 0,
      deduplicated: Boolean(result.deduplicated),
      reason: result.reason || null,
    });
  } catch (_) {
    // No private text, token, user ID, Firebase response or credential in logs.
    return json({ error: "staging_test_push_failed" }, 500);
  }
});
