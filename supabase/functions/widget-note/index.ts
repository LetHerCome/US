import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { parseWidgetNoteRequest, sha256Hex, widgetNoteStatus } from "../_shared/widget-note-contract.mjs";
import { supabaseSecretKey } from "../_shared/supabase-secret.ts";

// Widget «Nota» (docs/missions/widget-nota-v1.md): read, tick and save one
// note of the couple with the device token of the Nota widget. The couple
// check, the author, the time and the revision are the RPC's.
const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (request) => {
  let parsed;
  try {
    parsed = await parseWidgetNoteRequest(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_request";
    if (message === "method_not_allowed") return json({ error: message }, 405);
    if (message === "invalid_widget_token") return json({ error: message }, 401);
    if (message === "request_too_large") return json({ error: message }, 413);
    return json({ error: message }, 400);
  }
  try {
    const { token, op, noteId, payload } = parsed;
    const url = Deno.env.get("SUPABASE_URL") || "";
    const secret = supabaseSecretKey();
    if (!url || !secret) return json({ error: "server_configuration_missing" }, 500);
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const tokenHash = await sha256Hex(token);
    const { data, error } = await admin.rpc("widget_note_internal", {
      p_token_hash: tokenHash,
      p_op: op,
      p_note_id: noteId,
      p_payload: payload
    });
    if (error) {
      const status = widgetNoteStatus(error);
      if (status === 500) console.error("widget note failed", error.code || "unknown");
      return json({ error: status === 401 ? "invalid_widget_credential" : status === 404 ? "note_not_found" : status === 429 ? "rate_limited" : status === 400 ? "invalid_note" : "widget_note_failed" }, status);
    }
    return json({ note: data });
  } catch (error) {
    console.error("widget note failed", error instanceof Error ? error.name : "unknown");
    return json({ error: "widget_note_failed" }, 500);
  }
});
