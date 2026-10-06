import { createNativeTransport, nativePushConfig } from "./native-push-transport.mjs";

// Native Notifications V1: the ONLY place Edge Functions read native push
// configuration. Names are listed in supabase/SECRETS_MANIFEST.json; values live
// only in Supabase Edge secrets. Missing or malformed configuration yields a
// transport that is "not ready" (Web Push keeps working, nothing is consumed).
const NATIVE_PUSH_ENV: Record<string, () => string | undefined> = {
  FCM_SERVICE_ACCOUNT_JSON: () => Deno.env.get("FCM_SERVICE_ACCOUNT_JSON"),
  APNS_KEY_ID: () => Deno.env.get("APNS_KEY_ID"),
  APNS_TEAM_ID: () => Deno.env.get("APNS_TEAM_ID"),
  APNS_PRIVATE_KEY: () => Deno.env.get("APNS_PRIVATE_KEY"),
  APNS_TOPIC: () => Deno.env.get("APNS_TOPIC"),
};

export function nativeTransport() {
  return createNativeTransport({
    config: nativePushConfig((key: string) => NATIVE_PUSH_ENV[key]?.()),
    fetch: globalThis.fetch,
  });
}
