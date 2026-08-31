import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import webpush from "npm:web-push@3.6.7";
import { dispatchThinkWebPush } from "../_shared/think-web-push.ts";
import { supabaseSecretKey } from "../_shared/supabase-secret.ts";

const VAPID_PUBLIC_KEY = "BChjUsr-rF5fq-qgLrbsFn76z9GQaWJ7-a-_UX0gzU6hkSRC4r4GLwmQLtkuad_ntDBE6Fhr76jr_r7OBQdfuss";
const VAPID_SUBJECT = "https://usfinal.vercel.app";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type", "Access-Control-Allow-Methods": "POST,OPTIONS", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
type EventType = "test" | "think" | "daily_answer" | "quest_confirmed";

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
    const type = body?.type as EventType;
    if (!type || !["test", "think", "daily_answer", "quest_confirmed"].includes(type)) return json({ error: "Invalid notification type" }, 400);
    const { data: sender, error: senderError } = await admin.from("profiles").select("id,couple_id,display_name,role").eq("id", authData.user.id).maybeSingle();
    if (senderError || !sender?.couple_id) return json({ error: "Profile not linked" }, 403);
    const { data: partner } = await admin.from("profiles").select("id,display_name,role").eq("couple_id", sender.couple_id).neq("id", sender.id).maybeSingle();

    if (type === "think") {
      if (!partner || !body.reference_id) return json({ error: "Missing think reference" }, 400);
      const { data: message } = await admin.from("shared_messages")
        .select("id,couple_id,sender_id,recipient_id,kind")
        .eq("id", body.reference_id).maybeSingle();
      if (!message || message.kind !== "think" || message.sender_id !== sender.id || message.couple_id !== sender.couple_id || message.recipient_id !== partner.id) {
        return json({ error: "Invalid think event" }, 403);
      }
      return json(await dispatchThinkWebPush(admin, {
        senderId: sender.id,
        senderName: sender.display_name || "La tua persona",
        recipientId: partner.id,
        coupleId: sender.couple_id,
        messageId: message.id
      }));
    }

    const { data: vapidPrivate, error: vapidError } = await admin.rpc("get_internal_vapid_private_key");
    if (vapidError || !vapidPrivate) return json({ error: "Push configuration unavailable" }, 500);
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, vapidPrivate as string);
    let recipientIds: string[] = [];
    let title = "US.";
    let notificationBody = "";
    let target = "home";
    let tag = "us";
    let dedupeKey: string | null = null;
    let prefKey: "today" | "bond" | null = null;
    if (type === "test") {
      recipientIds = [sender.id];
      notificationBody = "Notifiche attive. US può raggiungerti anche quando è chiusa ♡";
      tag = "us-push-test";
    }
    if (type === "daily_answer") {
      if (!partner || !body.reference_id) return json({ error: "Missing daily reference" }, 400);
      const questionId = body.reference_id;
      const { data: question } = await admin.from("daily_questions").select("id").eq("id", questionId).maybeSingle();
      if (!question) return json({ error: "Question not found" }, 404);
      const { data: answers, error } = await admin.from("daily_answers").select("user_id").eq("couple_id", sender.couple_id).eq("question_id", questionId);
      if (error) throw error;
      const answered = new Set((answers || []).map((row: { user_id: string }) => row.user_id));
      if (!answered.has(sender.id)) return json({ error: "Answer not saved" }, 409);
      title = "US. · Today";
      target = "today";
      prefKey = "today";
      if (answered.has(partner.id)) {
        recipientIds = [sender.id, partner.id];
        notificationBody = "Le vostre risposte sono pronte ♡";
        tag = `daily-reveal-${questionId}`;
        dedupeKey = `daily-reveal:${sender.couple_id}:${questionId}`;
      } else {
        recipientIds = [partner.id];
        notificationBody = `${sender.display_name || "La tua persona"} ha risposto. Ora tocca a te.`;
        tag = `daily-answer-${questionId}`;
        dedupeKey = `daily-answer:${questionId}:${sender.id}`;
      }
    }
    if (type === "quest_confirmed") {
      if (!partner || !body.reference_id) return json({ error: "Missing quest reference" }, 400);
      const questId = body.reference_id;
      const { data: quest, error } = await admin.from("bond_weekly_quests").select("id,couple_id,title,confirmed_by").eq("id", questId).maybeSingle();
      if (error || !quest || quest.couple_id !== sender.couple_id || !(quest.confirmed_by || []).includes(sender.id)) return json({ error: "Quest confirmation not found" }, 409);
      recipientIds = [partner.id];
      title = "US. · Bond";
      notificationBody = `${sender.display_name || "La tua persona"} ha confermato la quest.`;
      target = "bond";
      tag = `quest-${questId}`;
      dedupeKey = `quest-confirmed:${questId}:${sender.id}`;
      prefKey = "bond";
    }
    if (!recipientIds.length) return json({ delivered: 0, reason: "no-recipient" });
    if (prefKey) {
      const { data: preferences } = await admin.from("notification_preferences").select("user_id,think,today,bond").in("user_id", recipientIds);
      const byUser = new Map((preferences || []).map((preference: any) => [preference.user_id, preference]));
      recipientIds = recipientIds.filter((id) => byUser.has(id) ? Boolean(byUser.get(id)[prefKey!]) : true);
      if (!recipientIds.length) return json({ delivered: 0, reason: "disabled-by-preference" });
    }
    if (dedupeKey) {
      const { error } = await admin.from("push_event_log").insert({ dedupe_key: dedupeKey, couple_id: sender.couple_id, sender_id: sender.id, event_type: type });
      if (error?.code === "23505") return json({ delivered: 0, deduplicated: true });
      if (error) throw error;
    }
    const { data: subscriptions, error: subscriptionError } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth_key").in("user_id", recipientIds);
    if (subscriptionError) throw subscriptionError;
    if (!subscriptions?.length) {
      if (dedupeKey) await admin.from("push_event_log").delete().eq("dedupe_key", dedupeKey);
      return json({ delivered: 0, reason: "recipient-not-subscribed" });
    }
    const payload = JSON.stringify({ title, body: notificationBody, icon: "/icon-192.png", badge: "/icon-192.png", tag, target, url: `/?open=${encodeURIComponent(target)}&from=push` });
    let delivered = 0;
    let failed = 0;
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_key } }, payload, { TTL: 60 * 60 * 12, urgency: "normal" });
        delivered += 1;
      } catch (error) {
        failed += 1;
        const status = Number((error as { statusCode?: number })?.statusCode || 0);
        if (status === 404 || status === 410) await admin.from("push_subscriptions").delete().eq("id", subscription.id);
      }
    }
    if (!delivered && dedupeKey) await admin.from("push_event_log").delete().eq("dedupe_key", dedupeKey);
    return json({ delivered, failed });
  } catch (error) {
    console.error("send-web-push fatal", error instanceof Error ? error.message : "unknown");
    return json({ error: "Push send failed" }, 500);
  }
});
