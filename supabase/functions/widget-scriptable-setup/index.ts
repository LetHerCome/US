import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { sha256Hex, validDeviceHash } from "../_shared/widget-think-contract.mjs";
import { supabaseSecretKey } from "../_shared/supabase-secret.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function client(url: string, secret: string) {
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function authenticatedProfile(admin: ReturnType<typeof client>, request: Request) {
  const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!bearer) return { error: "authentication_required" as const };
  const { data, error } = await admin.auth.getUser(bearer);
  if (error || !data.user) return { error: "invalid_session" as const };
  const { data: profile, error: profileError } = await admin.from("profiles")
    .select("id,couple_id").eq("id", data.user.id).maybeSingle();
  if (profileError || !profile?.couple_id) return { error: "profile_not_linked" as const };
  return { profile };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const secret = supabaseSecretKey();
    if (!url || !secret) return json({ error: "server_configuration_missing" }, 500);
    const admin = client(url, secret);
    const body = await request.json().catch(() => ({}));
    const operation = String(body?.operation || "");

    if (operation === "exchange") {
      const setupCode = String(body?.setupCode || "").trim();
      const deviceIdHash = String(body?.deviceIdHash || "").trim();
      if (!TOKEN_PATTERN.test(setupCode) || !validDeviceHash(deviceIdHash)) {
        return json({ error: "invalid_setup_request" }, 400);
      }
      const stateToken = randomToken();
      const thinkToken = randomToken();
      const { data, error } = await admin.rpc("widget_scriptable_exchange_internal", {
        p_setup_token_hash: await sha256Hex(setupCode),
        p_device_id_hash: deviceIdHash,
        p_state_token_hash: await sha256Hex(stateToken),
        p_action_token_hash: await sha256Hex(thinkToken)
      });
      if (error) {
        if (error.code === "28000") return json({ error: "invalid_or_expired_setup_code" }, 401);
        throw error;
      }
      const result = Array.isArray(data) ? data[0] : data;
      if (!result?.installation_id || !result?.expires_at) throw new Error("scriptable_exchange_result_missing");
      return json({ stateToken, thinkToken, expiresAt: result.expires_at });
    }

    if (!new Set(["issue", "status", "revoke"]).has(operation)) return json({ error: "invalid_operation" }, 400);
    const auth = await authenticatedProfile(admin, request);
    if ("error" in auth) return json({ error: auth.error }, 401);

    if (operation === "status") {
      const now = new Date().toISOString();
      const { data: installations, error: installationsError } = await admin.from("widget_scriptable_installations")
        .select("id,state_token_hash,action_token_id").eq("profile_id", auth.profile.id)
        .is("revoked_at", null).gt("expires_at", now);
      if (installationsError) throw installationsError;
      const rows = installations || [];
      if (!rows.length) return json({ active: false, stateActive: false, thinkActive: false, installations: 0 });
      const [stateResult, thinkResult] = await Promise.all([
        admin.from("widget_tokens").select("token_hash")
          .in("token_hash", rows.map((row) => row.state_token_hash)).is("revoked_at", null),
        admin.from("widget_action_tokens").select("id")
          .in("id", rows.map((row) => row.action_token_id)).eq("scope", "think:send")
          .is("revoked_at", null).gt("expires_at", now)
      ]);
      if (stateResult.error) throw stateResult.error;
      if (thinkResult.error) throw thinkResult.error;
      const stateActive = Boolean(stateResult.data?.length);
      const thinkActive = Boolean(thinkResult.data?.length);
      return json({ active: stateActive || thinkActive, stateActive, thinkActive, installations: rows.length });
    }

    if (operation === "revoke") {
      const { data, error } = await admin.rpc("widget_scriptable_revoke_internal", {
        p_profile_id: auth.profile.id
      });
      if (error) throw error;
      return json({ revoked: true, installations: Number(data) || 0 });
    }

    const setupCode = randomToken();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { error } = await admin.rpc("widget_scriptable_issue_code_internal", {
      p_profile_id: auth.profile.id,
      p_couple_id: auth.profile.couple_id,
      p_token_hash: await sha256Hex(setupCode),
      p_expires_at: expiresAt
    });
    if (error) throw error;
    return json({ setupCode, expiresAt });
  } catch (error) {
    console.error("scriptable setup operation failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "scriptable_setup_failed" }, 500);
  }
});
