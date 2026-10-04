// US 2.0 F2C — the Web Push VAPID subject, one source for every push producer.
//
// The subject is the sender contact a push service may use (`https:` or
// `mailto:`), not a frontend URL. It is Edge configuration, set with
// `supabase secrets set VAPID_SUBJECT=…`, so changing the app domain never
// needs a code change or a redeploy. Missing or invalid → fail closed with the
// same error the producers already use for a missing VAPID private key,
// before any dedupe key is consumed or any notification is attempted.

/** True for a subject push services accept: https://host[...] or mailto:addr. */
export function isValidVapidSubject(value) {
  if (typeof value !== 'string' || value !== value.trim() || !value) return false;
  let url;
  try { url = new URL(value); } catch { return false; }
  if (url.protocol === 'mailto:') return /^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/.test(url.pathname);
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return false;
  // Apple's push service rejects a localhost subject.
  return url.hostname !== 'localhost' && !url.hostname.endsWith('.localhost') && url.hostname !== '127.0.0.1' && url.hostname !== '[::1]';
}

/** The configured VAPID subject; throws `push_configuration_unavailable` when unset or invalid. */
export function vapidSubject() {
  const subject = (Deno.env.get("VAPID_SUBJECT") || "").trim();
  if (!isValidVapidSubject(subject)) throw new Error('push_configuration_unavailable');
  return subject;
}
