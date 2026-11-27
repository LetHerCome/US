import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { missingTapsSignature, parseWidgetThinkRequest, sha256Hex, widgetThinkRpcArgs } from "../_shared/widget-think-contract.mjs";
import { dispatchThinkWebPush } from "../_shared/think-web-push.ts";
import { supabaseSecretKey } from "../_shared/supabase-secret.ts";

const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (request) => {
  try {
    const { token, actionId, taps } = await parseWidgetThinkRequest(request);
    const url = Deno.env.get("SUPABASE_URL") || "";
    const secret = supabaseSecretKey();
    if (!url || !secret) return json({ error: "server_configuration_missing" }, 500);
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const tokenHash = await sha256Hex(token);
    // Ti penso ×N dai widget (27/11/2026): the burst's taps. Before the
    // migration (Edge deployed first) the same Ti penso leaves with 1.
    let { data, error } = await admin.rpc("widget_send_think_internal", widgetThinkRpcArgs(tokenHash, actionId, taps));
    if (error && taps > 1 && missingTapsSignature(error)) {
      ({ data, error } = await admin.rpc("widget_send_think_internal", widgetThinkRpcArgs(tokenHash, actionId, 1)));
    }
    if (error) {
      if (error.code === "28000") return json({ error: "invalid_widget_credential" }, 401);
      if (String(error.message || "").includes("rate_limited")) return json({ error: "rate_limited" }, 429);
      throw error;
    }
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.message_id) throw new Error("widget_send_result_missing");
    const { data: sender } = await admin.from("profiles").select("display_name").eq("id", result.sender_id).single();
    let push = { delivered: 0, failed: 0 };
    try {
      push = await dispatchThinkWebPush(admin, {
        senderId: result.sender_id,
        senderName: sender?.display_name || "La tua persona",
        recipientId: result.recipient_id,
        coupleId: result.couple_id,
        messageId: result.message_id
      });
    } catch (pushError) {
      console.error("widget think push failed", pushError instanceof Error ? pushError.message : "unknown");
    }
    return json({ sent: true, duplicate: Boolean(result.duplicate), push });
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_request";
    if (/method|query|token|action|taps/.test(message)) return json({ error: message }, message.includes("method") ? 405 : 400);
    console.error("widget think send failed", message);
    return json({ error: "widget_think_send_failed" }, 500);
  }
});
