// I personaggi sempre aggiornati (founder, 27/11/2026). When the other person
// changes colour, shape or outfit, or leaves the couple, the phone's widgets
// must follow even with US closed: a silent data push (native-push-transport
// widgetSignal, FCM v3) that only the widget bridge reads.
//
// Pure/injectable like the other *-core.mjs: Deno in the Edge, Node in tests.
//
// * The look is rebuilt here from profiles exactly as widgets.js
//   syncCharacters builds it (shape, outfit, the colour at night and on
//   paper), so a phone that gets the push writes what the app would write.
// * Android: data-only v3 behind the same installation gate as v2.
// * iOS: off (IOS_WIDGET_SIGNALS). The app has no background mode yet
//   (UIBackgroundModes is not declared, tests/ios-native-baseline.test.js);
//   the open app still follows over Realtime and on return to the foreground.
import { widgetSignal } from './native-push-transport.mjs';

// The person colours of person-colors.js (PALETTE, PALETTE_GIORNO): kept equal by tests.
export const PERSON_PALETTE = Object.freeze({
  rosa: ['#ff7c96', '#e7a1ab'], lilla: ['#a98bff', '#ab9ddb'], blu: ['#6f9bff', '#8faad6'], salvia: ['#8fd49b', '#a2c29c'],
  pesca: ['#ff9f6e', '#e9ab80'], prugna: ['#c98bd6', '#bb93bf'], menta: ['#6fd6c8', '#8ac6ba'], perla: ['#e8e1f0', '#ddd5de'],
});
const RETIRED = Object.freeze({ cielo: 'blu', rubino: 'prugna', oro: 'pesca' });
export const IOS_WIDGET_SIGNALS = false;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The look of one profile row, as the widgets draw it (personaggi.js shapeOf/lookOf, widgets.js syncCharacters). */
export function lookSignal(profile) {
  const beatrice = profile?.role === 'beatrice';
  const chosen = Object.hasOwn(PERSON_PALETTE, profile?.person_color || '') ? profile.person_color : RETIRED[profile?.person_color] || null;
  const [color, day] = PERSON_PALETTE[chosen || (beatrice ? 'lilla' : 'rosa')];
  return widgetSignal({
    s: 'look',
    shape: profile?.character_shape || (beatrice ? 'quadrato' : 'palla'),
    head: profile?.character_head || '',
    face: profile?.character_face || '',
    color,
    day,
  });
}

export const CLEAR_SIGNAL = widgetSignal({ s: 'clear' });

async function releaseClaim(admin, dedupeKey) {
  if (dedupeKey) await admin.from('push_event_log').delete().eq('dedupe_key', dedupeKey);
}

/**
 * Sends one widget signal to every native device of the recipients.
 * @param options.signal        lookSignal(...) or CLEAR_SIGNAL
 * @param options.recipientIds  already authorized by the producer
 * @param options.coupleId      rows registered under another couple are skipped
 * @param options.dedupeKey     push_event_log key (null = none)
 * @param options.native        native transport with sendSignal(device, signal, ownerHash)
 * @param options.ownerHash     async (userId) => sha256 hex of the user id (iOS only)
 */
export async function deliverWidgetSignal(admin, options) {
  const { signal, recipientIds = [], coupleId = null, senderId = null, dedupeKey = null, eventType = 'widget_signal', native = null, ownerHash = null } = options || {};
  const recipients = [...new Set(recipientIds.filter((id) => UUID.test(String(id || ''))))];
  if (!signal || !recipients.length) return { delivered: 0, failed: 0, reason: 'no-recipient' };
  const providers = ['fcm', ...(IOS_WIDGET_SIGNALS ? ['apns'] : [])];
  if (!native || typeof native.sendSignal !== 'function' || !providers.some((p) => native.ready(p))) {
    return { delivered: 0, failed: 0, reason: 'transport-unconfigured' };
  }
  const { data, error } = await admin.from('device_push_tokens')
    .select('id,user_id,couple_id,installation_id,token,platform,provider,apns_environment')
    .in('user_id', recipients);
  if (error) throw error;
  const devices = (data || []).filter((d) => (!coupleId || d.couple_id === coupleId) && providers.includes(d.provider) && native.ready(d.provider));
  if (!devices.length) return { delivered: 0, failed: 0, reason: 'recipient-not-subscribed' };

  if (dedupeKey) {
    const { error: claimError } = await admin.from('push_event_log').insert({ dedupe_key: dedupeKey, couple_id: coupleId, sender_id: senderId, event_type: eventType });
    if (claimError?.code === '23505') return { delivered: 0, failed: 0, deduplicated: true };
    if (claimError) throw claimError;
  }
  let delivered = 0;
  let failed = 0;
  for (const device of devices) {
    let result;
    try {
      const owner = device.provider === 'apns' && typeof ownerHash === 'function' ? await ownerHash(device.user_id) : '';
      result = await native.sendSignal(device, signal, owner);
    } catch (_) {
      result = { ok: false, outcome: 'transient' };
    }
    if (result?.ok) { delivered += 1; continue; }
    failed += 1;
    if (result?.outcome === 'invalid-token') await admin.from('device_push_tokens').delete().eq('id', device.id);
  }
  if (!delivered) await releaseClaim(admin, dedupeKey);
  return { delivered, failed };
}

/**
 * send-web-push type partner_look: the caller just changed their look. The
 * look is read back from the server, never from the request, and one signal
 * per couple_sync 'looks' revision reaches the partner's phones.
 */
export async function dispatchPartnerLook(admin, { sender, partner, native, ownerHash = null }) {
  if (!sender?.id || !sender.couple_id || !partner?.id) return { delivered: 0, reason: 'no-recipient' };
  const { data: me, error } = await admin.from('profiles')
    .select('id,couple_id,role,person_color,character_shape,character_head,character_face')
    .eq('id', sender.id).maybeSingle();
  if (error) throw error;
  if (!me || me.couple_id !== sender.couple_id) return { delivered: 0, reason: 'no-recipient' };
  const { data: sync, error: syncError } = await admin.from('couple_sync')
    .select('revision').eq('couple_id', sender.couple_id).eq('kind', 'looks').maybeSingle();
  if (syncError) throw syncError;
  // No look ever changed in this couple: nothing to tell.
  if (!sync?.revision) return { delivered: 0, reason: 'no-change' };
  return deliverWidgetSignal(admin, {
    signal: lookSignal(me),
    recipientIds: [partner.id],
    coupleId: sender.couple_id,
    senderId: sender.id,
    dedupeKey: `partner-look:${sender.id}:${sync.revision}`,
    eventType: 'partner_look',
    native,
    ownerHash,
  });
}

/**
 * Leaving the couple or deleting the account: the phones of who stays clear
 * the partner from their widgets (name, photo, Come stai: the whole widget
 * state, as a logout does). Best effort: never blocks the leave itself.
 */
export async function notifyPartnerLeft(admin, { coupleId, partnerIds, native, ownerHash = null }) {
  return deliverWidgetSignal(admin, { signal: CLEAR_SIGNAL, recipientIds: partnerIds, coupleId, eventType: 'partner_left', native, ownerHash });
}
