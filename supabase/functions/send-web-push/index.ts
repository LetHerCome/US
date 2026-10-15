import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import webpush from "npm:web-push@3.6.7";
import { vapidSubject } from "../_shared/web-push-vapid.mjs";
import { dispatchThinkReactionWebPush, dispatchThinkWebPush } from "../_shared/think-web-push.ts";
import { dispatchLeftForYouPush } from "../_shared/left-for-you-push-core.mjs";
import { supabaseSecretKey } from "../_shared/supabase-secret.ts";
import { buildNotification, deliverNotification, recipientLocale } from "../_shared/notification-core.mjs";
import { nativeTransport } from "../_shared/native-push-env.ts";

const VAPID_PUBLIC_KEY = "BChjUsr-rF5fq-qgLrbsFn76z9GQaWJ7-a-_UX0gzU6hkSRC4r4GLwmQLtkuad_ntDBE6Fhr76jr_r7OBQdfuss";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type", "Access-Control-Allow-Methods": "POST,OPTIONS", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
type EventType = "test" | "think" | "think_reaction" | "daily_answer" | "daily_reaction" | "quest_confirmed" | "left_for_you" | "partner_joined";
const EVENT_TYPES: EventType[] = ["test", "think", "think_reaction", "daily_answer", "daily_reaction", "quest_confirmed", "left_for_you", "partner_joined"];
// US 1.0 (A2): a join older than this is not "just joined" (legacy couples, stale retries).
const PARTNER_JOINED_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    if (!type || !EVENT_TYPES.includes(type)) return json({ error: "Invalid notification type" }, 400);
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

    if (type === "think_reaction") {
      if (!partner || !body.reference_id || !["heart", "hug", "miss_you"].includes(body.reaction)) {
        return json({ error: "Missing or invalid think reaction" }, 400);
      }
      const { data: message } = await admin.from("shared_messages")
        .select("id,couple_id,sender_id,recipient_id,kind")
        .eq("id", body.reference_id).maybeSingle();
      const { data: reaction } = await admin.from("think_reactions")
        .select("message_id,reaction")
        .eq("message_id", body.reference_id).maybeSingle();
      if (!message || message.kind !== "think" || message.recipient_id !== sender.id || message.sender_id !== partner.id || message.couple_id !== sender.couple_id || reaction?.reaction !== body.reaction) {
        return json({ error: "Invalid think reaction event" }, 403);
      }
      return json(await dispatchThinkReactionWebPush(admin, {
        senderId: sender.id,
        senderName: sender.display_name || "La tua persona",
        recipientId: message.sender_id,
        coupleId: sender.couple_id,
        messageId: message.id,
        reaction: body.reaction
      }));
    }

    if (type === "left_for_you") {
      if (!partner || !body.reference_id) return json({ error: "Missing left_for_you reference" }, 400);
      const { data: row, error: rowError } = await admin.from("left_for_you")
        .select("id,couple_id,sender_id,recipient_id")
        .eq("id", body.reference_id)
        .maybeSingle();
      if (rowError || !row || row.sender_id !== sender.id || row.couple_id !== sender.couple_id || row.recipient_id !== partner.id) {
        return json({ error: "Invalid left_for_you event" }, 403);
      }
      // M9A: una notifica logica per riga (dedupe `left-for-you:<row id>`),
      // stessa logica del worker di recupero left-for-you-push-worker.
      return json(await dispatchLeftForYouPush(admin, {
        itemId: row.id,
        expectedSenderId: sender.id,
        ensureVapid: async () => {
          const { data: vapidPrivate, error: vapidError } = await admin.rpc("get_internal_vapid_private_key");
          if (vapidError || !vapidPrivate) throw new Error("push_configuration_unavailable");
          webpush.setVapidDetails(vapidSubject(), VAPID_PUBLIC_KEY, vapidPrivate as string);
        },
        sendNotification: (subscription: unknown, payload: string, options: unknown) => webpush.sendNotification(subscription as any, payload, options as any),
        native: nativeTransport(),
      }));
    }

    // Native Notifications V1: one canonical notification per logical event,
    // delivered by the shared dispatcher to Web Push AND the native apps.
    // US 1.0: every event below has ONE recipient, and the copy is built in
    // that recipient's language (profiles.locale) once the recipient is known.
    let recipientIds: string[] = [];
    let compose: ((locale: string) => Promise<ReturnType<typeof buildNotification>>) | null = null;
    let dedupeKey: string | null = null;
    let prefKey: "today" | "bond" | null = null;
    if (type === "test") {
      recipientIds = [sender.id];
      compose = async (locale) => buildNotification("test", { locale });
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
      prefKey = "today";
      recipientIds = [partner.id];
      if (answered.has(partner.id)) {
        // US 1.0 (A6): "Risposte pronte" only to the partner; the sender just saw it.
        compose = async (locale) => buildNotification("daily_reveal", { questionId, locale });
        dedupeKey = `daily-reveal:${sender.couple_id}:${questionId}`;
      } else {
        compose = async (locale) => buildNotification("daily_answer", { questionId, senderName: sender.display_name, locale });
        dedupeKey = `daily-answer:${questionId}:${sender.id}`;
      }
    }
    if (type === "daily_reaction") {
      // US 1.0 (O2): reference_id = the Daily Question id the caller just
      // reacted to (set_daily_answer_reaction). The reaction is read back from
      // the server; only ♥ and "mi hai commosso" notify the answer's author.
      if (!partner || typeof body.reference_id !== "string" || !UUID.test(body.reference_id)) return json({ error: "Missing daily reaction reference" }, 400);
      if (!["francesco", "beatrice"].includes(sender.role)) return json({ error: "Invalid daily reaction event" }, 403);
      const questionId = body.reference_id;
      const { data: state, error: stateError } = await admin.from("daily_question_reveal_states")
        .select("couple_id,question_id,actor_role,reaction")
        .eq("couple_id", sender.couple_id).eq("question_id", questionId).eq("actor_role", sender.role)
        .maybeSingle();
      if (stateError) throw stateError;
      if (!state || !["heart", "cry"].includes(state.reaction)) return json({ error: "Reaction not saved" }, 409);
      const { data: answer, error: answerError } = await admin.from("daily_answers")
        .select("id,user_id,couple_id")
        .eq("couple_id", sender.couple_id).eq("question_id", questionId).eq("user_id", partner.id)
        .maybeSingle();
      if (answerError) throw answerError;
      if (!answer) return json({ error: "Answer not found" }, 409);
      recipientIds = [partner.id];
      compose = async (locale) => buildNotification("daily_reaction", { questionId, senderName: sender.display_name, reaction: state.reaction, locale });
      dedupeKey = `daily-reaction:${questionId}:${sender.id}`;
      prefKey = "today";
    }
    if (type === "quest_confirmed") {
      if (!partner || !body.reference_id) return json({ error: "Missing quest reference" }, 400);
      const questId = body.reference_id;
      const { data: quest, error } = await admin.from("bond_weekly_quests").select("id,couple_id,title,template_key,confirmed_by").eq("id", questId).maybeSingle();
      if (error || !quest || quest.couple_id !== sender.couple_id || !(quest.confirmed_by || []).includes(sender.id)) return json({ error: "Quest confirmation not found" }, 409);
      // US 1.0 (N5): "Ora tocca a te" only while the partner still has to confirm.
      if ((quest.confirmed_by || []).includes(partner.id)) return json({ delivered: 0, reason: "already-confirmed" });
      recipientIds = [partner.id];
      compose = async (locale) => {
        let questTitle = typeof quest.title === "string" ? quest.title : "";
        if (locale === "en" && quest.template_key) {
          const { data: template } = await admin.from("bond_quest_templates").select("key,title_en").eq("key", quest.template_key).maybeSingle();
          if (typeof template?.title_en === "string" && template.title_en.trim()) questTitle = template.title_en;
        }
        return buildNotification("quest_confirmed", { questId, senderName: sender.display_name, questTitle, locale });
      };
      dedupeKey = `quest-confirmed:${questId}:${sender.id}`;
      prefKey = "bond";
    }
    if (type === "partner_joined") {
      // US 1.0 (A2): the joiner's own client, right after accept_partner_invite,
      // names its couple. Server-side: the caller used this couple's invite
      // (couple_invites.used_by), recently, and the couple now has two members.
      if (!partner || typeof body.reference_id !== "string" || !UUID.test(body.reference_id)) return json({ error: "Missing partner_joined reference" }, 400);
      if (body.reference_id !== sender.couple_id) return json({ error: "Invalid partner_joined event" }, 403);
      const { data: invite, error: inviteError } = await admin.from("couple_invites")
        .select("couple_id,role,used_by,used_at")
        .eq("couple_id", sender.couple_id).eq("used_by", sender.id)
        .maybeSingle();
      if (inviteError) throw inviteError;
      const usedAt = Date.parse(String(invite?.used_at || ""));
      if (!invite || invite.role !== sender.role || !Number.isFinite(usedAt) || Date.now() - usedAt > PARTNER_JOINED_MAX_AGE_MS) {
        return json({ error: "Invalid partner_joined event" }, 403);
      }
      const { data: members, error: membersError } = await admin.from("profiles").select("id").eq("couple_id", sender.couple_id);
      if (membersError) throw membersError;
      if ((members || []).length !== 2) return json({ error: "Couple not complete" }, 409);
      recipientIds = [partner.id];
      compose = async (locale) => buildNotification("partner_joined", { senderName: sender.display_name, locale });
      dedupeKey = `partner-joined:${sender.couple_id}`;
    }
    if (!recipientIds.length || !compose) return json({ delivered: 0, reason: "no-recipient" });
    if (prefKey) {
      const { data: preferences } = await admin.from("notification_preferences").select("user_id,think,today,bond,relationship").in("user_id", recipientIds);
      const byUser = new Map((preferences || []).map((preference: any) => [preference.user_id, preference]));
      recipientIds = recipientIds.filter((id) => byUser.has(id) ? Boolean(byUser.get(id)[prefKey!]) : true);
      if (!recipientIds.length) return json({ delivered: 0, reason: "disabled-by-preference" });
    }
    const notification = await compose(await recipientLocale(admin, recipientIds[0]));
    let result;
    try {
      result = await deliverNotification(admin, {
        notification,
        recipientIds,
        coupleId: sender.couple_id,
        senderId: sender.id,
        dedupeKey,
        eventType: type,
        web: {
          ensure: async () => {
            const { data: vapidPrivate, error: vapidError } = await admin.rpc("get_internal_vapid_private_key");
            if (vapidError || !vapidPrivate) throw new Error("push_configuration_unavailable");
            webpush.setVapidDetails(vapidSubject(), VAPID_PUBLIC_KEY, vapidPrivate as string);
          },
          send: (subscription: unknown, payload: string, options: unknown) => webpush.sendNotification(subscription as any, payload, options as any),
        },
        native: nativeTransport(),
      });
    } catch (error) {
      if (error instanceof Error && error.message === "push_configuration_unavailable") return json({ error: "Push configuration unavailable" }, 500);
      throw error;
    }
    if (result.deduplicated) return json({ delivered: 0, deduplicated: true });
    if (result.reason) return json({ delivered: 0, reason: result.reason });
    return json({ delivered: result.delivered, failed: result.failed });
  } catch (error) {
    console.error("send-web-push fatal", error instanceof Error ? error.message : "unknown");
    return json({ error: "Push send failed" }, 500);
  }
});
