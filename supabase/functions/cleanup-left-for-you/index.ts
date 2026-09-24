import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { supabaseSecretKey } from "../_shared/supabase-secret.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type,x-m5i-cleanup-secret",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const MEDIA_KINDS = new Set(["photo", "audio", "video"]);

type CleanupRow = {
  item_id: string;
  couple_id: string;
  sender_id: string;
  kind: string;
  media_path: string | null;
};

type FinalizeResult = CleanupRow & { status?: string };

function isOwnedMediaPath(row: CleanupRow): boolean {
  if (!MEDIA_KINDS.has(row.kind) || !row.media_path) return false;
  const prefix = `${row.couple_id}/${row.sender_id}/left/`;
  return row.media_path.startsWith(prefix)
    && !row.media_path.includes("..")
    && !row.media_path.startsWith("/")
    && !row.media_path.includes("\\");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expectedSecret = Deno.env.get("M5I_CLEANUP_SECRET") || "";
  const receivedSecret = request.headers.get("x-m5i-cleanup-secret") || "";
  if (!expectedSecret || receivedSecret !== expectedSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const secret = supabaseSecretKey();
    if (!url || !secret) return json({ error: "Server configuration missing" }, 500);

    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const body = await request.json().catch(() => ({}));
    const batchSize = Number.isInteger(body?.batch_size) ? Math.max(1, Math.min(body.batch_size, 100)) : 50;

    const { data: claimed, error: claimError } = await admin.rpc("claim_left_for_you_cleanup", {
      target_batch_size: batchSize,
    });
    if (claimError) throw claimError;

    const results: Array<{ item_id: string; status: string }> = [];
    for (const claimedRow of (claimed || []) as CleanupRow[]) {
      // Lock and delete the source first. The durable queue then becomes the
      // storage outbox, so a crash cannot lose the path or race Conserva.
      const { data: finalized, error: finalizeError } = await admin.rpc("finalize_left_for_you_cleanup", {
        target_item_id: claimedRow.item_id,
      });
      if (finalizeError) {
        console.error("cleanup finalize failed", claimedRow.item_id, finalizeError.message);
        results.push({ item_id: claimedRow.item_id, status: "finalize_retry_pending" });
        continue;
      }

      const row = finalized as FinalizeResult;
      if (row.status !== "source_deleted") {
        results.push({ item_id: claimedRow.item_id, status: row.status || "unknown" });
        continue;
      }

      if (MEDIA_KINDS.has(row.kind)) {
        if (!isOwnedMediaPath(row)) {
          results.push({ item_id: row.item_id, status: "unsafe_media_path_retained" });
          continue;
        }
        const { error: storageError } = await admin.storage.from("us-media").remove([row.media_path!]);
        if (storageError) {
          console.error("cleanup storage remove failed", row.item_id, storageError.message);
          results.push({ item_id: row.item_id, status: "storage_retry_pending" });
          continue;
        }
      }

      const { data: completed, error: completeError } = await admin.rpc("complete_left_for_you_cleanup", {
        target_item_id: row.item_id,
      });
      if (completeError) {
        console.error("cleanup outbox completion failed", row.item_id, completeError.message);
        results.push({ item_id: row.item_id, status: "complete_retry_pending" });
        continue;
      }
      results.push({ item_id: row.item_id, status: completed?.status || "unknown" });
    }

    return json({ claimed: (claimed || []).length, results });
  } catch (error) {
    console.error("cleanup-left-for-you fatal", error instanceof Error ? error.message : "unknown");
    return json({ error: "Cleanup failed" }, 500);
  }
});
