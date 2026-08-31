import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC_KEY = "BChjUsr-rF5fq-qgLrbsFn76z9GQaWJ7-a-_UX0gzU6hkSRC4r4GLwmQLtkuad_ntDBE6Fhr76jr_r7OBQdfuss";
const VAPID_SUBJECT = "https://usfinal.vercel.app";

type ThinkPushArgs = {
  senderId: string;
  senderName: string;
  recipientId: string;
  coupleId: string;
  messageId: string;
};

export async function dispatchThinkWebPush(admin: any, args: ThinkPushArgs) {
  const dedupeKey = `think:${args.messageId}`;
  const { data: preferences, error: preferenceError } = await admin
    .from("notification_preferences")
    .select("think")
    .eq("user_id", args.recipientId)
    .maybeSingle();
  if (preferenceError) throw preferenceError;
  if (preferences && !preferences.think) return { delivered: 0, failed: 0, reason: "disabled-by-preference" };

  const { data: vapidPrivate, error: vapidError } = await admin.rpc("get_internal_vapid_private_key");
  if (vapidError || !vapidPrivate) throw new Error("push_configuration_unavailable");
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, vapidPrivate as string);

  const { error: dedupeError } = await admin.from("push_event_log").insert({
    dedupe_key: dedupeKey,
    couple_id: args.coupleId,
    sender_id: args.senderId,
    event_type: "think"
  });
  if (dedupeError?.code === "23505") return { delivered: 0, failed: 0, deduplicated: true };
  if (dedupeError) throw dedupeError;

  const { data: subscriptions, error: subscriptionsError } = await admin
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth_key")
    .eq("user_id", args.recipientId);
  if (subscriptionsError) throw subscriptionsError;
  if (!subscriptions?.length) {
    await admin.from("push_event_log").delete().eq("dedupe_key", dedupeKey);
    return { delivered: 0, failed: 0, reason: "recipient-not-subscribed" };
  }

  const payload = JSON.stringify({
    title: "US.",
    body: `${args.senderName || "La tua persona"} ti sta pensando ♡`,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: `think-${args.messageId}`,
    target: "home",
    url: "/?open=home&from=push"
  });
  let delivered = 0;
  let failed = 0;
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth_key }
      }, payload, { TTL: 60 * 60 * 12, urgency: "high" });
      delivered += 1;
    } catch (error) {
      failed += 1;
      const status = Number((error as { statusCode?: number })?.statusCode || 0);
      if (status === 404 || status === 410) {
        await admin.from("push_subscriptions").delete().eq("id", subscription.id);
      }
    }
  }
  if (!delivered) await admin.from("push_event_log").delete().eq("dedupe_key", dedupeKey);
  return { delivered, failed };
}
