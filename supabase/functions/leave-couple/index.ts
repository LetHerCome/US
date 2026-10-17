import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { supabaseSecretKey } from "../_shared/supabase-secret.ts";
import { isOriginAllowed } from "../_shared/s32-account-deletion-core.mjs";
import { handleLeaveCouple } from "../_shared/s32-leave-couple-core.mjs";

// US Store 1.0 — leave the couple (founder decision 3, 2026-10-14). Closes
// the couple space like an account deletion but keeps the account.
// Inert unless US_LEAVE_COUPLE_ENABLED === "true". All logic lives in the
// pure core; logs carry step names and error codes only.

const BASE_HEADERS: Record<string, string> = {
  "Content-Type": "application/json;charset=utf-8",
  "Cache-Control": "no-store",
  "Pragma": "no-cache",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Vary": "Origin",
};

const makeHeaders = (origin: string | null): Record<string, string> => {
  if (!origin || !isOriginAllowed(origin, Deno.env.get("US_ALLOWED_ORIGINS") || "")) return { ...BASE_HEADERS };
  return {
    ...BASE_HEADERS,
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
  };
};

const log = (entry: Record<string, unknown>) => {
  console.log(JSON.stringify({ fn: "leave-couple", ...entry }));
};

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  const headers = makeHeaders(origin);
  try {
    const result = await handleLeaveCouple({
      method: request.method,
      origin,
      authorization: request.headers.get("authorization"),
      readBody: () => request.json(),
      env: {
        US_LEAVE_COUPLE_ENABLED: Deno.env.get("US_LEAVE_COUPLE_ENABLED"),
        US_ALLOWED_ORIGINS: Deno.env.get("US_ALLOWED_ORIGINS"),
      },
      nowSeconds: Math.floor(Date.now() / 1000),
      createClient: () => {
        const url = Deno.env.get("SUPABASE_URL") || "";
        const secret = supabaseSecretKey();
        if (!url || !secret) return null;
        return createClient(url, secret, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
      },
      log,
    });
    if (result.body === null) return new Response(null, { status: result.status, headers });
    return new Response(JSON.stringify(result.body), { status: result.status, headers });
  } catch (_error) {
    log({ step: "fatal", outcome: "error" });
    return new Response(JSON.stringify({ error: "leave_failed" }), { status: 500, headers });
  }
});
