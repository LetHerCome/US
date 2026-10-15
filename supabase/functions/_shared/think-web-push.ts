import webpush from "npm:web-push@3.6.7";
import { vapidSubject } from "./web-push-vapid.mjs";
import { buildNotification, deliverNotification, recipientLocale } from "./notification-core.mjs";
import { nativeTransport } from "./native-push-env.ts";

// Ti penso and its reaction. The file name is historical: since Native
// Notifications V1 both go through the shared dispatcher, so one logical event
// reaches Web Push AND the native apps under one dedupe key.
// US 1.0 (O7): the reaction push says which reaction ("Bea ti manda un
// abbraccio"), in the recipient's language.

const VAPID_PUBLIC_KEY = "BChjUsr-rF5fq-qgLrbsFn76z9GQaWJ7-a-_UX0gzU6hkSRC4r4GLwmQLtkuad_ntDBE6Fhr76jr_r7OBQdfuss";

type ThinkPushArgs = {
  senderId: string;
  senderName: string;
  recipientId: string;
  coupleId: string;
  messageId: string;
};

function transports(admin: any) {
  return {
    web: {
      ensure: async () => {
        const { data: vapidPrivate, error: vapidError } = await admin.rpc("get_internal_vapid_private_key");
        if (vapidError || !vapidPrivate) throw new Error("push_configuration_unavailable");
        webpush.setVapidDetails(vapidSubject(), VAPID_PUBLIC_KEY, vapidPrivate as string);
      },
      send: (subscription: unknown, payload: string, options: unknown) => webpush.sendNotification(subscription as any, payload, options as any),
    },
    native: nativeTransport(),
  };
}

async function thinkPreferenceEnabled(admin: any, recipientId: string) {
  const { data: preferences, error: preferenceError } = await admin
    .from("notification_preferences")
    .select("think")
    .eq("user_id", recipientId)
    .maybeSingle();
  if (preferenceError) throw preferenceError;
  return !(preferences && !preferences.think);
}

// US 1.0 (O6): at most one Ti penso push every 2 minutes from the same person.
// The ones in between still reach the app; the next push counts them
// ("Bea ti ha pensato 3 volte"), looking back at most 10 minutes.
export const THINK_PUSH_GAP_MS = 2 * 60 * 1000;
const THINK_COUNT_WINDOW_MS = 10 * 60 * 1000;

export async function thinkPushWindow(admin: any, args: ThinkPushArgs, now = Date.now()) {
  const { data: last, error } = await admin.from("push_event_log").select("created_at")
    .eq("event_type", "think").eq("sender_id", args.senderId).eq("couple_id", args.coupleId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  const lastAt = last?.created_at ? Date.parse(last.created_at) : 0;
  if (lastAt && now - lastAt < THINK_PUSH_GAP_MS) return { throttled: true, count: 0 };
  const since = new Date(Math.max(lastAt, now - THINK_COUNT_WINDOW_MS)).toISOString();
  const { count, error: countError } = await admin.from("shared_messages").select("id", { count: "exact", head: true })
    .eq("kind", "think").eq("sender_id", args.senderId).eq("recipient_id", args.recipientId).gt("created_at", since);
  return { throttled: false, count: countError ? 1 : Math.max(1, Number(count) || 1) };
}

export async function dispatchThinkWebPush(admin: any, args: ThinkPushArgs) {
  if (!(await thinkPreferenceEnabled(admin, args.recipientId))) return { delivered: 0, failed: 0, reason: "disabled-by-preference" };
  const window = await thinkPushWindow(admin, args);
  if (window.throttled) return { delivered: 0, failed: 0, reason: "throttled" };
  return deliverNotification(admin, {
    notification: buildNotification("think", { senderName: args.senderName, messageId: args.messageId, count: window.count, locale: await recipientLocale(admin, args.recipientId) }),
    recipientIds: [args.recipientId],
    coupleId: args.coupleId,
    senderId: args.senderId,
    dedupeKey: `think:${args.messageId}`,
    eventType: "think",
    ...transports(admin),
  });
}

type ThinkReactionPushArgs = ThinkPushArgs & { reaction: "heart" | "hug" | "miss_you" };

export async function dispatchThinkReactionWebPush(admin: any, args: ThinkReactionPushArgs) {
  if (!(await thinkPreferenceEnabled(admin, args.recipientId))) return { delivered: 0, failed: 0, reason: "disabled-by-preference" };
  return deliverNotification(admin, {
    notification: buildNotification("think_reaction", { messageId: args.messageId, senderName: args.senderName, reaction: args.reaction, locale: await recipientLocale(admin, args.recipientId) }),
    recipientIds: [args.recipientId],
    coupleId: args.coupleId,
    senderId: args.senderId,
    dedupeKey: `think-reaction:${args.messageId}`,
    eventType: "think_reaction",
    ...transports(admin),
  });
}
