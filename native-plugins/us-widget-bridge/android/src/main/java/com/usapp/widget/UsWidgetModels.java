package com.usapp.widget;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Pure presentation models for the native widgets. They turn the semantic
 * snapshot plus "now" into what a widget shows and when it must next redraw.
 * Calendar maths always uses Europe/Rome civil days, exactly like the web
 * Countdown (countdown.js) and the server, never the phone's time zone.
 * Pure Java: unit-tested on the JVM.
 */
final class UsWidgetModels {
    static final ZoneId ROME = ZoneId.of("Europe/Rome");
    static final long DAY_MS = 86_400_000L;
    /** "Sent" stays visible this long; taps inside the first part are ignored. */
    static final long SENT_VISIBLE_MS = 2 * 60_000L;
    static final long SEND_COOLDOWN_MS = 8_000L;
    static final long FAILED_VISIBLE_MS = 10 * 60_000L;
    /** A "sending" older than this was interrupted (process killed). */
    static final long SENDING_STALE_MS = 45_000L;

    private UsWidgetModels() {}

    static LocalDate romeToday(Instant now) {
        return now.atZone(ROME).toLocalDate();
    }

    static Instant nextRomeMidnight(Instant now) {
        ZonedDateTime next = now.atZone(ROME).toLocalDate().plusDays(1).atStartOfDay(ROME);
        return next.toInstant().plusSeconds(30);
    }

    /** Days together on the Rome civil calendar; -1 when unknown or in the future. */
    static long daysTogether(String startedOn, Instant now) {
        String clean = UsWidgetContract.civilDate(startedOn);
        if (clean.isEmpty()) return -1;
        long days = ChronoUnit.DAYS.between(LocalDate.parse(clean), romeToday(now));
        return days >= 0 ? days : -1;
    }

    static String dayUnit(long n) {
        return n == 1 ? "giorno" : "giorni";
    }

    // ---------- Countdown ----------

    static final class Countdown {
        boolean empty = true;
        String title = "";
        String style = "editorial";
        /** Static number ("12") when not ticking. */
        String value = "";
        String unit = "";
        String sub = "";
        /** True during the final period: render a native count-down chronometer. */
        boolean ticking = false;
        long remainingMs = 0;
        Instant nextChange = null;
    }

    static Countdown countdown(JSONObject snapshot, Instant now) {
        Countdown out = new Countdown();
        JSONObject c = UsWidgetContract.optObject(snapshot, "countdown");
        out.style = c.optString("style", "editorial");
        if (!c.optBoolean("active", false)) return out;
        String kind = c.optString("kind", "");
        String target = c.optString("target", "");
        String title = c.optString("title", "");
        if (kind.equals("together")) {
            long days = daysTogether(target, now);
            if (days < 0) return out;
            out.empty = false;
            out.title = title.isEmpty() ? "Insieme da" : title;
            out.value = Long.toString(days);
            out.unit = dayUnit(days);
            out.nextChange = nextRomeMidnight(now);
            return out;
        }
        if (title.isEmpty()) title = "Il nostro momento";
        if (kind.equals("days")) {
            String clean = UsWidgetContract.civilDate(target);
            if (clean.isEmpty()) return out;
            long delta = ChronoUnit.DAYS.between(romeToday(now), LocalDate.parse(clean));
            long n = Math.max(0, delta);
            out.empty = false;
            out.title = title;
            out.value = Long.toString(n);
            out.unit = dayUnit(n);
            out.sub = delta <= 0 ? "Ci siamo" : "";
            out.nextChange = delta <= 0 ? null : nextRomeMidnight(now);
            return out;
        }
        if (kind.equals("clock")) {
            Instant at = UsWidgetContract.instant(target);
            if (at == null) return out;
            out.empty = false;
            out.title = title;
            long delta = at.toEpochMilli() - now.toEpochMilli();
            if (delta <= 0) {
                out.value = "00:00:00";
                out.sub = "Ci siamo";
                return out;
            }
            // Same rounding as the web display: whole seconds, rounded up.
            long seconds = (delta + 999) / 1000;
            long days = seconds / 86_400;
            if (days == 0) {
                out.ticking = true;
                out.remainingMs = delta;
                out.nextChange = at;
                return out;
            }
            long hours = (seconds % 86_400) / 3600;
            out.value = Long.toString(days);
            out.unit = dayUnit(days);
            out.sub = hours == 0 ? "" : hours == 1 ? "e 1 ora" : "e " + hours + " ore";
            // Redraw when the hour figure changes, or when the final day starts.
            long untilHourChange = (seconds % 3600) * 1000L;
            if (untilHourChange == 0) untilHourChange = 3_600_000L;
            Instant hourChange = now.plusMillis(untilHourChange + 1000);
            Instant finalDay = at.minusMillis(DAY_MS - 1000);
            out.nextChange = hourChange.isBefore(finalDay) ? hourChange : finalDay;
            return out;
        }
        out.empty = true;
        return out;
    }

    // ---------- Noi / Foto & Noi ----------

    static final class Couple {
        String names = "";
        long days = -1;
        String frame = "";
        String todayInvitation = "";
        Instant nextChange = null;
    }

    /** A tiny rotating invitation, not a fabricated question or fake game state.
     * Every invitation opens the EXISTING Gioca hub; nothing is sent by the widget. */
    static String noiInvitation(Instant now) {
        String[] invitations = {
            "Un momento per voi",
            "Una domanda per voi",
            "Giocate un po'",
            "Scopritevi ancora"
        };
        int index = (int) Math.floorMod(romeToday(now).toEpochDay(), (long) invitations.length);
        return invitations[index];
    }

    static Couple couple(JSONObject snapshot, Instant now) {
        Couple out = new Couple();
        out.todayInvitation = noiInvitation(now);
        JSONObject c = UsWidgetContract.optObject(snapshot, "couple");
        JSONArray names = c.optJSONArray("names");
        if (names != null && names.length() == 2) out.names = names.optString(0) + " + " + names.optString(1);
        else if (names != null && names.length() == 1) out.names = names.optString(0);
        out.days = daysTogether(c.optString("startedOn", ""), now);
        out.frame = c.optString("frame", "");
        out.nextChange = nextRomeMidnight(now);
        return out;
    }

    // ---------- Ti penso ----------

    static final class Think {
        String message = "";
        String cta = "";
        /** Heart tap sends; otherwise it opens US. */
        boolean canSend = false;
        /** A tap right now would be ignored (in flight or just sent). */
        boolean busy = false;
        boolean pulse = false;
        Instant nextChange = null;
    }

    /**
     * @param action native action state: status (idle|sending|sent|failed|unauthorized|rate_limited), at, sentAt
     * @param hasCredential the device-scoped send credential exists for this account
     */
    static Think think(JSONObject snapshot, JSONObject action, boolean hasCredential, Instant now) {
        Think out = new Think();
        if (snapshot == null) {
            out.message = "Apri US per collegare il widget";
            out.cta = "Apri";
            return out;
        }
        JSONObject t = UsWidgetContract.optObject(snapshot, "think");
        String partner = t.optString("partnerName", "").trim();
        String status = action == null ? "idle" : action.optString("status", "idle");
        Instant actionAt = action == null ? null : UsWidgetContract.instant(action.optString("at", ""));
        long sinceAction = actionAt == null ? Long.MAX_VALUE : Math.max(0, now.toEpochMilli() - actionAt.toEpochMilli());

        if (!hasCredential || status.equals("unauthorized")) {
            out.message = "Apri US per riattivare l’invio";
            out.cta = "Apri";
            return out;
        }
        out.canSend = true;
        if (status.equals("sending") && sinceAction < SENDING_STALE_MS) {
            out.message = "Invio…";
            out.cta = "Invio…";
            out.busy = true;
            out.pulse = true;
            out.nextChange = actionAt.plusMillis(SENDING_STALE_MS);
            return out;
        }
        if (status.equals("sent") && sinceAction < SENT_VISIBLE_MS) {
            out.message = partner.isEmpty() ? "Pensiero inviato" : "Inviato a " + partner;
            out.cta = "Inviato";
            out.busy = sinceAction < SEND_COOLDOWN_MS;
            out.nextChange = actionAt.plusMillis(out.busy ? SEND_COOLDOWN_MS : SENT_VISIBLE_MS);
            return out;
        }
        if ((status.equals("failed") || (status.equals("sending") && sinceAction >= SENDING_STALE_MS)) && sinceAction < FAILED_VISIBLE_MS) {
            out.message = "Non è partito";
            out.cta = "Riprova";
            out.nextChange = actionAt.plusMillis(FAILED_VISIBLE_MS);
            return out;
        }
        if (status.equals("rate_limited") && sinceAction < FAILED_VISIBLE_MS) {
            out.message = "Un attimo di pausa";
            out.cta = "Riprova";
            out.nextChange = actionAt.plusMillis(FAILED_VISIBLE_MS);
            return out;
        }

        Instant received = UsWidgetContract.instant(t.optString("lastReceivedAt", ""));
        Instant sent = UsWidgetContract.instant(t.optString("lastSentAt", ""));
        Instant nativeSent = action == null ? null : UsWidgetContract.instant(action.optString("sentAt", ""));
        if (nativeSent != null && (sent == null || nativeSent.isAfter(sent))) sent = nativeSent;
        String who = partner.isEmpty() ? "L’altra persona" : partner;

        // "Ricambia" only while the partner's thought is the latest one and
        // still unanswered. Once answered it becomes a plain "Ti penso".
        Instant answered = UsWidgetContract.instant(t.optString("lastAnsweredAt", ""));
        boolean unanswered = received != null
            && (sent == null || received.isAfter(sent))
            && (answered == null || received.isAfter(answered));
        if (unanswered) {
            long minutes = Math.max(0, Duration.between(received, now).toMinutes());
            out.message = minutes < 60 ? who + " ti sta pensando" : who + " ti ha pensato\n" + ago(minutes);
            out.cta = "Ricambia";
            out.nextChange = nextAgoChange(received, now);
            return out;
        }
        if (sent != null && (received == null || !received.isAfter(sent))) {
            long minutes = Math.max(0, Duration.between(sent, now).toMinutes());
            out.message = partner.isEmpty() ? "Pensiero inviato\n" + ago(minutes) : "Hai pensato a " + partner + "\n" + ago(minutes);
            out.cta = "Ti penso";
            out.nextChange = nextAgoChange(sent, now);
            return out;
        }
        out.message = partner.isEmpty() ? "Manda un pensiero" : "Pensa a " + partner;
        out.cta = "Ti penso";
        return out;
    }

    static String ago(long minutes) {
        if (minutes < 60) return "poco fa";
        if (minutes < 120) return "1 ora fa";
        if (minutes < 1440) return (minutes / 60) + " ore fa";
        long days = minutes / 1440;
        return days == 1 ? "ieri" : days + " giorni fa";
    }

    /** When the relative label next changes; coarse beyond one hour. */
    static Instant nextAgoChange(Instant from, Instant now) {
        long minutes = Math.max(0, Duration.between(from, now).toMinutes());
        if (minutes < 60) return from.plus(60, ChronoUnit.MINUTES).plusSeconds(1);
        if (minutes < 1440) return from.plus((minutes / 60 + 1) * 60, ChronoUnit.MINUTES).plusSeconds(1);
        return nextRomeMidnight(now);
    }

    static final long RETRY_SAME_ACTION_MS = 2 * 60_000L;

    /**
     * A retry right after a failed or interrupted send reuses the action id:
     * the server then answers "duplicate" instead of sending a second thought.
     */
    static String actionIdFor(JSONObject previous, Instant now) {
        if (previous != null) {
            String status = previous.optString("status", "");
            Instant at = UsWidgetContract.instant(previous.optString("at", ""));
            String id = previous.optString("actionId", "");
            boolean retryable = status.equals("failed") || status.equals("sending") || status.equals("rate_limited");
            if (retryable && at != null && now.toEpochMilli() - at.toEpochMilli() < RETRY_SAME_ACTION_MS && isUuid(id)) return id;
        }
        return UUID.randomUUID().toString();
    }

    private static boolean isUuid(String value) {
        try { return UUID.fromString(value).toString().equals(value); }
        catch (Exception ignored) { return false; }
    }
}
