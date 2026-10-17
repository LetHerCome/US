import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { supabaseSecretKey } from "../_shared/supabase-secret.ts";
import { runDeletionWorker } from "../_shared/s32-account-deletion-core.mjs";

// US Store S3.2 — retry worker for account deletions left in pending_cleanup
// (Storage or Auth step failed after the database transaction) and purge of
// expired receipts. Cron/operator only: x-us-cron-key checked against the
// Vault secret `us_account_deletion_cron_key`. Inert unless
// US_ACCOUNT_DELETION_ENABLED === "true". Logs carry step names and codes only.

const HEADERS: Record<string, string> = {
  "Content-Type": "application/json;charset=utf-8",
  "Cache-Control": "no-store",
};

const log = (entry: Record<string, unknown>) => {
  console.log(JSON.stringify({ fn: "account-deletion-worker", ...entry }));
};

Deno.serve(async (request: Request) => {
  try {
    const result = await runDeletionWorker({
      method: request.method,
      cronKey: request.headers.get("x-us-cron-key"),
      readBody: () => request.json(),
      env: { US_ACCOUNT_DELETION_ENABLED: Deno.env.get("US_ACCOUNT_DELETION_ENABLED") },
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
    return new Response(JSON.stringify(result.body), { status: result.status, headers: HEADERS });
  } catch (_error) {
    log({ step: "fatal", outcome: "error" });
    return new Response(JSON.stringify({ error: "worker_failed" }), { status: 500, headers: HEADERS });
  }
});
