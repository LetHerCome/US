import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { sha256Hex, validDeviceHash } from "../_shared/widget-think-contract.mjs";
import { supabaseSecretKey } from "../_shared/supabase-secret.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Content-Type": "application/json"
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const secret = supabaseSecretKey();
    const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!url || !secret) return json({ error: "server_configuration_missing" }, 500);
    if (!bearer) return json({ error: "authentication_required" }, 401);
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(bearer);
    if (authError || !authData.user) return json({ error: "invalid_session" }, 401);
    const body = await request.json().catch(() => ({}));
    const operation = String(body?.operation || "");
    const deviceIdHash = String(body?.deviceIdHash || "");
    if (!validDeviceHash(deviceIdHash)) return json({ error: "invalid_device" }, 400);
    if (operation !== "issue" && operation !== "revoke") return json({ error: "invalid_operation" }, 400);
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id,couple_id")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (profileError || !profile?.couple_id) return json({ error: "profile_not_linked" }, 403);

    let active = admin.from("widget_action_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("device_id_hash", deviceIdHash)
      .eq("scope", "think:send")
      .is("revoked_at", null);
    if (operation === "revoke") active = active.eq("profile_id", profile.id);
    const { error: revokeError } = await active;
    if (revokeError) throw revokeError;
    if (operation === "revoke") return json({ revoked: true });
    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
    const { error: insertError } = await admin.from("widget_action_tokens").insert({
      couple_id: profile.couple_id,
      profile_id: profile.id,
      device_id_hash: deviceIdHash,
      token_hash: tokenHash,
      scope: "think:send",
      expires_at: expiresAt
    });
    if (insertError) throw insertError;
    return json({ token, expiresAt });
  } catch (error) {
    console.error("widget credential operation failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "widget_credential_failed" }, 500);
  }
});
