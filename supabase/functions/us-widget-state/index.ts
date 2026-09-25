import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type,x-us-widget-token",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Cache-Control": "no-store, max-age=0"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function romeToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateOnlyUtc(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function daysBetween(from: string, to: string) {
  return Math.round((dateOnlyUtc(to) - dateOnlyUtc(from)) / 86400000);
}

function isActiveScriptableInstallation(installation: any, tokenRow: any, now = Date.now()) {
  if (!installation || !tokenRow) return false;
  if (installation.profile_id !== tokenRow.profile_id || installation.couple_id !== tokenRow.couple_id) return false;
  if (installation.revoked_at !== null) return false;
  const expiresAt = Date.parse(String(installation.expires_at || ""));
  return Number.isFinite(expiresAt) && expiresAt > now;
}

function isOrphanedScriptableToken(tokenRow: any, installation: any) {
  // The label only fails closed on an orphan; a linked installation is the lifecycle authority.
  return tokenRow?.device_label === "Scriptable" && !installation;
}

function makeScriptableWidgetState(todayDate: string, generatedAt: string, me: any, partner: any, couple: any, homePhotoUrl: string | null) {
  const daysTogether = couple.started_on ? Math.max(0, daysBetween(couple.started_on, todayDate)) : null;
  return {
    version: 1,
    generatedAt,
    todayDate,
    user: { displayName: me.display_name, partnerName: partner?.display_name || "Partner" },
    relationship: { startedOn: couple.started_on, daysTogether },
    homePhotoUrl
  };
}

function resolveHomePhotoUrl(homePhotoPath: string | null, signed: any, signingError: any) {
  if (!homePhotoPath) return null;
  if (signingError || !signed?.signedUrl) throw new Error("home_photo_signing_failed");
  return signed.signedUrl;
}

function bondLevelInfo(totalXp = 0) {
  const total = Math.max(0, Number(totalXp) || 0);
  let level = 1, floor = 0, needed = 200;
  while (total >= floor + needed) {
    floor += needed;
    level += 1;
    needed = 200 + (level - 1) * 150;
    if (level > 999) break;
  }
  const current = total - floor;
  return { xp: total, level, current, needed, progress: Math.max(0, Math.min(100, current / needed * 100)) };
}

function nextOccurrence(event: any, today: string) {
  const raw = String(event.event_date || "");
  if (!raw) return null;
  let effective = raw;
  if (event.recurs_yearly) {
    const [, month, day] = raw.split("-");
    const year = Number(today.slice(0, 4));
    effective = `${year}-${month}-${day}`;
    if (effective < today) effective = `${year + 1}-${month}-${day}`;
  } else if (raw < today) {
    return null;
  }
  return { ...event, effective_date: effective, days_left: daysBetween(today, effective) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  try {
    const url = new URL(req.url);
    const token = (url.searchParams.get("token") || req.headers.get("x-us-widget-token") || "").trim();
    if (!token || token.length < 32) return json({ error: "invalid_token" }, 401);

    const tokenHash = await sha256Hex(token);
    const { data: tokenRow, error: tokenError } = await admin
      .from("widget_tokens")
      .select("id,couple_id,profile_id,device_label,revoked_at")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .maybeSingle();

    if (tokenError) throw tokenError;
    if (!tokenRow) return json({ error: "invalid_token" }, 401);

    const { data: scriptableInstallation, error: installationError } = await admin
      .from("widget_scriptable_installations")
      .select("profile_id,couple_id,revoked_at,expires_at")
      .eq("state_token_hash", tokenHash)
      .maybeSingle();
    if (installationError) throw installationError;
    if (isOrphanedScriptableToken(tokenRow, scriptableInstallation)) return json({ error: "invalid_token" }, 401);
    const isScriptableToken = Boolean(scriptableInstallation);
    if (isScriptableToken && !isActiveScriptableInstallation(scriptableInstallation, tokenRow)) {
      return json({ error: "invalid_token" }, 401);
    }

    await admin.from("widget_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tokenRow.id);

    if (isScriptableToken) {
      const today = romeToday();
      const [coupleResult, profilesResult] = await Promise.all([
        admin.from("couples").select("started_on,home_photo_path").eq("id", tokenRow.couple_id).single(),
        admin.from("profiles").select("id,display_name").eq("couple_id", tokenRow.couple_id)
      ]);
      if (coupleResult.error) throw coupleResult.error;
      if (profilesResult.error) throw profilesResult.error;
      const couple = coupleResult.data;
      const profiles = profilesResult.data || [];
      const me = profiles.find((profile: any) => profile.id === tokenRow.profile_id);
      const partner = profiles.find((profile: any) => profile.id !== tokenRow.profile_id) || null;
      if (!me) return json({ error: "invalid_token" }, 401);

      const signedResult = couple.home_photo_path
        ? await admin.storage.from("us-media").createSignedUrl(couple.home_photo_path, 86400)
        : { data: null, error: null };
      const homePhotoUrl = resolveHomePhotoUrl(couple.home_photo_path, signedResult.data, signedResult.error);
      return json(makeScriptableWidgetState(
        today,
        new Date().toISOString(),
        me,
        partner,
        couple,
        homePhotoUrl
      ));
    }

    const today = romeToday();
    const [coupleResult, profileResult, profilesResult, eventsResult, questionResult, thinkResult] = await Promise.all([
      admin.from("couples").select("id,name,started_on,home_photo_path,bond_xp").eq("id", tokenRow.couple_id).single(),
      admin.from("profiles").select("id,display_name,role").eq("id", tokenRow.profile_id).single(),
      admin.from("profiles").select("id,display_name,role").eq("couple_id", tokenRow.couple_id),
      admin.from("shared_events").select("id,title,event_date,event_time,location,note,recurs_yearly").eq("couple_id", tokenRow.couple_id),
      admin.from("daily_questions").select("id").eq("question_date", today).maybeSingle(),
      admin.from("shared_messages").select("sender_id,created_at").eq("couple_id", tokenRow.couple_id).eq("recipient_id", tokenRow.profile_id).eq("kind", "think").order("created_at", { ascending: false }).limit(1).maybeSingle()
    ]);

    if (coupleResult.error) throw coupleResult.error;
    if (profileResult.error) throw profileResult.error;
    if (profilesResult.error) throw profilesResult.error;
    if (eventsResult.error) throw eventsResult.error;
    if (questionResult.error) throw questionResult.error;
    if (thinkResult.error) throw thinkResult.error;

    const couple = coupleResult.data;
    const me = profileResult.data;
    const profiles = profilesResult.data || [];
    const partner = profiles.find((p: any) => p.id !== me.id) || null;

    let homePhotoUrl: string | null = null;
    if (couple.home_photo_path) {
      const { data: signed } = await admin.storage.from("us-media").createSignedUrl(couple.home_photo_path, 86400);
      homePhotoUrl = signed?.signedUrl || null;
    }

    const upcoming = (eventsResult.data || [])
      .map((event: any) => nextOccurrence(event, today))
      .filter(Boolean)
      .sort((a: any, b: any) => {
        const byDate = String(a.effective_date).localeCompare(String(b.effective_date));
        if (byDate !== 0) return byDate;
        return String(a.event_time || "23:59:59").localeCompare(String(b.event_time || "23:59:59"));
      });

    const nextEvent: any = upcoming[0] || null;

    let todayState = "none";
    if (questionResult.data?.id) {
      const { data: answers, error: answersError } = await admin
        .from("daily_answers")
        .select("user_id")
        .eq("couple_id", tokenRow.couple_id)
        .eq("question_id", questionResult.data.id);
      if (answersError) throw answersError;
      const ids = new Set((answers || []).map((row: any) => row.user_id));
      const mine = ids.has(me.id);
      const theirs = partner ? ids.has(partner.id) : false;
      todayState = mine && theirs ? "reveal" : mine ? "waiting" : "todo";
    }

    let lastThink: any = null;
    if (thinkResult.data?.created_at) {
      const createdAt = new Date(thinkResult.data.created_at);
      const ageMinutes = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 60000));
      const sender = profiles.find((p: any) => p.id === thinkResult.data.sender_id);
      lastThink = { from: sender?.display_name || partner?.display_name || "Partner", createdAt: thinkResult.data.created_at, ageMinutes };
    }

    const relationshipDays = couple.started_on ? Math.max(0, daysBetween(couple.started_on, today)) : null;
    const bond = bondLevelInfo(couple.bond_xp || 0);

    return json({
      version: 1,
      generatedAt: new Date().toISOString(),
      todayDate: today,
      user: { displayName: me.display_name, partnerName: partner?.display_name || "Partner", role: me.role },
      relationship: { startedOn: couple.started_on, daysTogether: relationshipDays },
      homePhotoUrl,
      nextEvent: nextEvent ? {
        id: nextEvent.id,
        title: nextEvent.title,
        date: nextEvent.effective_date,
        originalDate: nextEvent.event_date,
        time: nextEvent.event_time || null,
        location: nextEvent.location || null,
        note: nextEvent.note || null,
        recurring: Boolean(nextEvent.recurs_yearly),
        daysLeft: nextEvent.days_left
      } : null,
      today: { state: todayState },
      lastThink,
      bond
    });
  } catch (error) {
    console.error("[US Widget]", error);
    return json({ error: "widget_state_failed" }, 500);
  }
});
