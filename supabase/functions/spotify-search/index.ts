import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { supabaseSecretKey } from "../_shared/supabase-secret.ts";
import {
  SpotifySearchError,
  normalizeQuery,
  getAccessToken,
  searchSpotifyTracks,
  normalizeTracks,
} from "../_shared/spotify-search-core.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Content-Type": "application/json"
};
const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, ...extraHeaders } });

// Warm-instance only: never written to storage, never returned to the client.
const tokenCache: { token?: string; expiresAt?: number } = {};

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
    const query = normalizeQuery(body?.query);

    const clientId = Deno.env.get("SPOTIFY_CLIENT_ID") || "";
    const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET") || "";
    if (!clientId || !clientSecret) return json({ error: "server_configuration_missing" }, 500);

    const token = await getAccessToken({ clientId, clientSecret, cache: tokenCache });
    const payload = await searchSpotifyTracks({ token, query, market: "IT", limit: 5 });
    const tracks = normalizeTracks(payload, 5);
    return json({ tracks });
  } catch (error) {
    if (error instanceof SpotifySearchError) {
      const headers: Record<string, string> = {};
      if (error.code === "quota_exceeded" && error.retryAfterSeconds != null) {
        headers["Retry-After"] = String(error.retryAfterSeconds);
      }
      console.error("spotify search failed", error.code);
      return json({ error: error.code }, error.status, headers);
    }
    console.error("spotify search failed", "unknown");
    return json({ error: "spotify_search_failed" }, 500);
  }
});
