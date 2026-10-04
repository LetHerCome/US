import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import webpush from "npm:web-push@3.6.7";
import { vapidSubject } from "../_shared/web-push-vapid.mjs";
import { supabaseSecretKey } from "../_shared/supabase-secret.ts";

// M6D — Calendar reminders worker.
// Chiamato SOLO dal cron pg_cron (chiave dedicata via Edge secret,
// header x-us-cron-key). NON è un endpoint utente.
// Trova i reminder scaduti non ancora inviati, li spedice via web-push
// riutilizzando push_subscriptions/push_event_log, e marca sent_at.
// Un reminder è "scaduto" quando è il momento della notifica per l'evento
// collegato: timed → starts_at - offset; all-day → le 18:00 Europe/Rome
// del giorno precedente a start_date (i reminder all-day "1 giorno prima"
// arrivano la sera prima, gli altri all-day col 1 giorno prima pure).

const VAPID_PUBLIC_KEY = "BChjUsr-rF5fq-qgLrbsFn76z9GQaWJ7-a-_UX0gzU6hkSRC4r4GLwmQLtkuad_ntDBE6Fhr76jr_r7OBQdfuss";
// L'app vive in Italia: l'ora fissa all-day è decisa qui, non nello schema.
const TIMEZONE = "Europe/Rome";
const ALLDAY_REMINDER_HOUR = 18; // 18:00 locali del giorno precedente

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type,x-us-cron-key",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

type PendingReminder = {
  id: string;
  couple_id: string;
  entry_id: string;
  recipient_id: string;
  offset_minutes: number;
  requested_by: string;
};

type EntryRow = {
  id: string;
  couple_id: string;
  entry_type: "personal" | "shared";
  title: string;
  is_all_day: boolean;
  starts_at: string | null;
  start_date: string | null;
};

function dueFor(entry: EntryRow, offsetMinutes: number, nowMs: number): boolean {
  if (entry.is_all_day) {
    // Momento all-day: 18:00 Europe/Rome del giorno prima di start_date,
    // indipendentemente dall'offset (l'offset resta nello schema per
    // coerenza, ma l'unico istante sensato per un all-day è la sera prima).
    const [y, m, d] = String(entry.start_date || "").split("-").map(Number);
    if (!y || !m || !d) return false;
    // 18:00 del giorno (d-1) in Europe/Rome: costruito via UTC offset fisso
    // sarebbe sbagliato con DST; qui usiamo la conversione Intl per trovare
    // l'offset del fuso in quel giorno, poi l'istante UTC equivalente.
    const dayPrevUtc = Date.UTC(y, m - 1, d - 1, 12); // mezzogiorno UTC del giorno prima
    const tzOffsetMin = tzOffsetMinutes(new Date(dayPrevUtc));
    // 18:00 locali = (18*60 - tzOffsetMin) minuti da mezzanotte UTC del giorno
    const targetUtc = Date.UTC(y, m - 1, d - 1, 0, 0) + (ALLDAY_REMINDER_HOUR * 60 - tzOffsetMin) * 60000;
    return nowMs >= targetUtc;
  }
  const startsAt = entry.starts_at ? Date.parse(entry.starts_at) : NaN;
  if (Number.isNaN(startsAt)) return false;
  return nowMs >= startsAt - offsetMinutes * 60000;
}

function tzOffsetMinutes(at: Date): number {
  // Offset in minuti del fuso Europe/Rome all'istante `at` (positivo = est di UTC).
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = dtf.formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return (asUtc - at.getTime()) / 60000;
}

function humanOffset(offsetMinutes: number): string {
  if (offsetMinutes === 1440) return "Domani";
  if (offsetMinutes === 60) return "Tra un'ora";
  return `Tra ${offsetMinutes} minuti`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const secret = supabaseSecretKey();
    if (!url || !secret) return json({ error: "Server configuration missing" }, 500);


    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    // Solo il cron: la chiave DEDICATA vive nel vault (mai in env, mai nel
    // repo); il worker la legge con la funzione SECURITY DEFINER della
    // migration, eseguibile solo da service_role.
    const cronKey = (request.headers.get("x-us-cron-key") || "").trim();
    if (!cronKey) return json({ error: "Unauthorized" }, 401);
    const { data: expectedKey, error: keyError } = await admin.rpc("get_internal_calendar_reminders_cron_key");
    if (keyError || !expectedKey || cronKey !== expectedKey) return json({ error: "Unauthorized" }, 401);
    const nowMs = Date.now();

    // Reminder in attesa: le righe non inviate. La finestra è piccola
    // (eventi entro ~1 giorno), quindi carichiamo gli eventi solo per
    // questi reminder e filtriamo per due qui (gli offset reali vivono
    // negli eventi; calcolare l istante in SQL duplicherebbe la logica
    // di fuso all-day in due lingue — la fonte di verità resta il TS).
    const { data: pending, error: pendingError } = await admin
      .from("calendar_reminders")
      .select("id,couple_id,entry_id,recipient_id,offset_minutes,requested_by")
      .is("sent_at", null)
      .limit(200);
    if (pendingError) throw pendingError;
    const rows = (pending || []) as PendingReminder[];
    if (!rows.length) return json({ ok: true, due: 0, delivered: 0, failed: 0 });

    const entryIds = [...new Set(rows.map((r) => r.entry_id))];
    const { data: entries, error: entriesError } = await admin
      .from("calendar_entries")
      .select("id,couple_id,entry_type,title,is_all_day,starts_at,start_date")
      .in("id", entryIds);
    if (entriesError) throw entriesError;
    const entryById = new Map((entries || []).map((e: EntryRow) => [e.id, e]));

    // Nome del richiedente per la copia "X ti ricorda — …" (display name
    // reale dal profilo, mai hardcoded).
    const requesterIds = [...new Set(rows.map((r) => r.requested_by))];
    const { data: requesters, error: requestersError } = await admin
      .from("profiles")
      .select("id,display_name")
      .in("id", requesterIds);
    if (requestersError) throw requestersError;
    const nameByRequester = new Map((requesters || []).map((p: { id: string; display_name: string | null }) => [p.id, p.display_name || "La tua persona"]));

    let delivered = 0;
    let failed = 0;
    const dueRows: { reminder: PendingReminder; entry: EntryRow }[] = [];
    for (const reminder of rows) {
      const entry = entryById.get(reminder.entry_id);
      if (!entry || entry.couple_id !== reminder.couple_id) {
        // Evento sparito (cascade cancella le righe, ma una race è possibile):
        // marca inviato per non ritentare all'infinito.
        await admin.from("calendar_reminders").update({ sent_at: new Date().toISOString() }).eq("id", reminder.id);
        continue;
      }
      if (dueFor(entry, reminder.offset_minutes, nowMs)) dueRows.push({ reminder, entry });
    }
    if (!dueRows.length) return json({ ok: true, due: 0, delivered: 0, failed: 0 });

    // F2C: identità VAPID configurata PRIMA di consumare qualsiasi chiave
    // dedupe (come gli altri worker push). Senza, il push service rifiuta
    // l'invio e il reminder andava perso al giro successivo (23505).
    // Configurazione mancante → 500, nessuna chiave consumata, si ritenta.
    const { data: vapidPrivate, error: vapidError } = await admin.rpc("get_internal_vapid_private_key");
    if (vapidError || !vapidPrivate) throw new Error("push_configuration_unavailable");
    webpush.setVapidDetails(vapidSubject(), VAPID_PUBLIC_KEY, vapidPrivate as string);

    // Dedupe a livello evento: push_event_log con chiave stabile
    // `calendar-reminder:<reminder_id>` — anche se il cron riparte, un
    // reminder già inviato non viene mai duplicato.
    for (const { reminder, entry } of dueRows) {
      const dedupeKey = `calendar-reminder:${reminder.id}`;
      const { error: dedupeError } = await admin.from("push_event_log").insert({
        dedupe_key: dedupeKey,
        couple_id: reminder.couple_id,
        sender_id: reminder.requested_by,
        event_type: "calendar_reminder"
      });
      if (dedupeError?.code === "23505") {
        await admin.from("calendar_reminders").update({ sent_at: new Date().toISOString() }).eq("id", reminder.id);
        continue;
      }
      if (dedupeError) throw dedupeError;

      const requesterName = nameByRequester.get(reminder.requested_by) || "La tua persona";
      // Copia: se il destinatario È il richiedente → "Tra un'ora — Titolo";
      // se è l'altro → "Francesco ti ricorda — Cena alle 20:30 ♡".
      const isSelf = reminder.recipient_id === reminder.requested_by;
      const when = entry.is_all_day
        ? "oggi"
        : formatWhen(entry.starts_at);
      const body = isSelf
        ? `${humanOffset(reminder.offset_minutes)} — ${entry.title}`
        : `${requesterName} ti ricorda — ${entry.title}${when && when !== "oggi" ? ` alle ${when}` : ""} ♡`;

      const payload = JSON.stringify({
        title: "US. · Calendar",
        body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: `calendar-reminder-${reminder.id}`,
        target: "home",
        url: "/?open=home&from=calendar-reminder"
      });

      const { data: subscriptions, error: subsError } = await admin
        .from("push_subscriptions")
        .select("id,endpoint,p256dh,auth_key")
        .eq("user_id", reminder.recipient_id);
      if (subsError) throw subsError;
      let sent = 0;
      for (const subscription of (subscriptions || [])) {
        try {
          await webpush.sendNotification({
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth_key }
          }, payload, { TTL: 60 * 60 * 12, urgency: "high" });
          sent += 1;
        } catch (error) {
          const status = Number((error as { statusCode?: number })?.statusCode || 0);
          if (status === 404 || status === 410) {
            await admin.from("push_subscriptions").delete().eq("id", subscription.id);
          }
        }
      }
      if (sent > 0) {
        await admin.from("calendar_reminders").update({ sent_at: new Date().toISOString() }).eq("id", reminder.id);
        delivered += 1;
      } else {
        failed += 1;
      }
    }

    return json({ ok: true, due: dueRows.length, delivered, failed });
  } catch (error) {
    console.error("calendar-reminders-worker fatal", error instanceof Error ? error.message : "unknown");
    return json({ error: "Reminder dispatch failed" }, 500);
  }
});

function formatWhen(startsAtIso: string | null): string {
  if (!startsAtIso) return "";
  const d = new Date(startsAtIso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
