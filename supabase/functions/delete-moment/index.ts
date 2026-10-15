import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { supabaseSecretKey } from "../_shared/supabase-secret.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// US 1.0 (R2 + S3.2 Policy A): a memory or an album photo can be deleted by
// the person who created it, or, once its author deleted the account or left
// the couple (created_by is null), by the member still in that couple. The
// same rule as the moments/moment_photos *_delete_own and
// *_delete_departed_author RLS policies this service-role path bypasses.
const mayDelete = (createdBy: string | null, profileId: string) => createdBy === profileId || createdBy === null;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const secret = supabaseSecretKey();
    const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!url || !secret) return json({ error: "Server configuration missing" }, 500);
    if (!token) return json({ error: "Authentication required" }, 401);

    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Invalid session" }, 401);

    const body = await request.json().catch(() => ({}));
    const momentId = typeof body?.moment_id === "string" ? body.moment_id : "";
    const photoId = typeof body?.photo_id === "string" ? body.photo_id : "";
    if (photoId ? (momentId || !UUID.test(photoId)) : !UUID.test(momentId)) return json({ error: "Invalid moment" }, 400);

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id,couple_id")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.couple_id) return json({ error: "Profile unavailable" }, 403);
    const prefix = `${profile.couple_id}/`;

    // One album photo whose author is gone: the survivor cannot remove the file
    // through Storage (objects belong to their uploader), so it happens here.
    if (photoId) {
      const { data: photo, error: photoError } = await admin
        .from("moment_photos")
        .select("id,couple_id,created_by,storage_path")
        .eq("id", photoId)
        .maybeSingle();
      if (photoError) throw photoError;
      if (!photo) return json({ error: "Photo not found" }, 404);
      if (photo.couple_id !== profile.couple_id) return json({ error: "Forbidden" }, 403);
      if (photo.created_by !== null) return json({ error: "Only photos without an author are deleted here" }, 403);

      const { data: deleted, error: deleteError } = await admin
        .from("moment_photos")
        .delete()
        .eq("id", photoId)
        .eq("couple_id", profile.couple_id)
        .is("created_by", null)
        .select("id");
      if (deleteError) throw deleteError;
      if (!deleted?.length) return json({ error: "Photo not deleted" }, 409);

      const paths = typeof photo.storage_path === "string" && photo.storage_path.startsWith(prefix) ? [photo.storage_path] : [];
      let storageCleanup = true;
      if (paths.length) {
        const { error: storageError } = await admin.storage.from("us-media").remove(paths);
        if (storageError) {
          storageCleanup = false;
          console.error("delete-moment photo storage cleanup", storageError);
        }
      }
      return json({ deleted: true, storage_cleanup: storageCleanup, removed_objects: storageCleanup ? paths.length : 0 });
    }

    const { data: moment, error: momentError } = await admin
      .from("moments")
      .select("id,couple_id,created_by,storage_path,thumbnail_path")
      .eq("id", momentId)
      .maybeSingle();
    if (momentError) throw momentError;
    if (!moment) return json({ error: "Moment not found" }, 404);
    if (moment.couple_id !== profile.couple_id) {
      return json({ error: "Forbidden" }, 403);
    }
    if (!mayDelete(moment.created_by, profile.id)) {
      return json({ error: "Only the creator can delete this memory" }, 403);
    }

    const { data: albumRows, error: albumError } = await admin
      .from("moment_photos")
      .select("storage_path")
      .eq("moment_id", momentId)
      .eq("couple_id", profile.couple_id);
    if (albumError) throw albumError;

    const paths = [...new Set([
      moment.storage_path,
      moment.thumbnail_path,
      ...(albumRows || []).map((row) => row.storage_path),
    ].filter((path) => typeof path === "string" && path.startsWith(prefix)))];

    const owned = admin
      .from("moments")
      .delete()
      .eq("id", momentId)
      .eq("couple_id", profile.couple_id);
    const { data: deleted, error: deleteError } = await (moment.created_by === null
      ? owned.is("created_by", null)
      : owned.eq("created_by", profile.id)
    ).select("id");
    if (deleteError) throw deleteError;
    if (!deleted?.length) return json({ error: "Moment not deleted" }, 409);

    let storageCleanup = true;
    if (paths.length) {
      const { error: storageError } = await admin.storage.from("us-media").remove(paths);
      if (storageError) {
        storageCleanup = false;
        console.error("delete-moment storage cleanup", storageError);
      }
    }

    return json({ deleted: true, storage_cleanup: storageCleanup, removed_objects: storageCleanup ? paths.length : 0 });
  } catch (error) {
    console.error("delete-moment fatal", error);
    return json({ error: "Moment deletion failed" }, 500);
  }
});
