import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { supabaseSecretKey } from "../_shared/supabase-secret.ts";
import { handleDataExport } from "../_shared/s32-data-export-core.mjs";
import { createEmailSender } from "../_shared/us-email.mjs";

// US Store 1.0 — copy of a user's data on request (founder decision 8,
// 2026-10-14). Operator only: x-us-operator-key checked against the Vault
// secret `us_operator_key`. Inert unless US_DATA_EXPORT_ENABLED === "true".
// Without US_EMAIL_PROVIDER the response carries the download link for the
// operator to send by hand. Logs carry step names and codes only.

const HEADERS: Record<string, string> = {
  "Content-Type": "application/json;charset=utf-8",
  "Cache-Control": "no-store",
};

const log = (entry: Record<string, unknown>) => {
  console.log(JSON.stringify({ fn: "export-user-data", ...entry }));
};

Deno.serve(async (request: Request) => {
  try {
    const env = {
      US_DATA_EXPORT_ENABLED: Deno.env.get("US_DATA_EXPORT_ENABLED"),
      US_SUPPORT_EMAIL: Deno.env.get("US_SUPPORT_EMAIL"),
      US_EMAIL_PROVIDER: Deno.env.get("US_EMAIL_PROVIDER"),
      US_EMAIL_FROM: Deno.env.get("US_EMAIL_FROM"),
      US_EMAIL_API_KEY: Deno.env.get("US_EMAIL_API_KEY"),
    };
    const result = await handleDataExport({
      method: request.method,
      operatorKey: request.headers.get("x-us-operator-key"),
      readBody: () => request.json(),
      env,
      createClient: () => {
        const url = Deno.env.get("SUPABASE_URL") || "";
        const secret = supabaseSecretKey();
        if (!url || !secret) return null;
        return createClient(url, secret, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
      },
      sendEmail: createEmailSender(env, fetch),
      log,
    });
    return new Response(JSON.stringify(result.body), { status: result.status, headers: HEADERS });
  } catch (_error) {
    log({ step: "fatal", outcome: "error" });
    return new Response(JSON.stringify({ error: "export_failed" }), { status: 500, headers: HEADERS });
  }
});
