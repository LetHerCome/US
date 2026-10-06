import webpush from "npm:web-push@3.6.7";
import { vapidSubject } from "./web-push-vapid.mjs";
import { buildNotification, deliverNotification } from "./notification-core.mjs";
import { nativeTransport } from "./native-push-env.ts";

// Ti penso and its reaction. The file name is historical: since Native
// Notifications V1 both go through the shared dispatcher, so one logical event
// reaches Web Push AND the native apps under one dedupe key.

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

export async function dispatchThinkWebPush(admin: any, args: ThinkPushArgs) {
  if (!(await thinkPreferenceEnabled(admin, args.recipientId))) return { delivered: 0, failed: 0, reason: "disabled-by-preference" };
  return deliverNotification(admin, {
    notification: buildNotification("think", { senderName: args.senderName, messageId: args.messageId }),
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
    notification: buildNotification("think_reaction", { messageId: args.messageId }),
    recipientIds: [args.recipientId],
    coupleId: args.coupleId,
    senderId: args.senderId,
    dedupeKey: `think-reaction:${args.messageId}`,
    eventType: "think_reaction",
    ...transports(admin),
  });
}
