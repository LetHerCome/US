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
    /** "Ricambiato · adesso" stays a minute; taps inside the first part are ignored. */
    static final long SENT_VISIBLE_MS = 60_000L;
    static final long SEND_COOLDOWN_MS = 1_800L;
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

    static final class Daily {
        static final String NONE = "none";
        static final String STALE = "stale";
        final String question;
        final String state;
        Daily(String question, String state) { this.question = question; this.state = state; }
        boolean shown() { return !question.isEmpty(); }
        boolean partnerAnswered() { return "your_turn".equals(state) || "ready".equals(state); }
        boolean meAnswered() { return "waiting".equals(state) || "ready".equals(state); }
    }

    /** Each person's colour (ARGB): the app's, or rosa for me and lilla for the partner. */
    static int personColor(JSONObject snapshot, boolean me) {
        String hex = UsWidgetContract.optObject(UsWidgetContract.optObject(snapshot, "couple"), "colors").optString(me ? "me" : "partner", "");
        if (hex.length() == 7 && hex.charAt(0) == '#') {
            try { return 0xFF000000 | Integer.parseInt(hex.substring(1), 16); }
            catch (NumberFormatException ignored) {}
        }
        return me ? 0xFFFF7C96 : 0xFFA98BFF;
    }

    /** The question of the day while it is still the same day in Rome. */
    static Daily daily(JSONObject snapshot, Instant now) {
        JSONObject in = snapshot == null ? null : snapshot.optJSONObject("daily");
        if (in == null) return new Daily("", Daily.NONE);
        String state = in.optString("state", Daily.NONE);
        String date = in.optString("date", "");
        String question = in.optString("question", "");
        if (Daily.NONE.equals(state) || date.isEmpty() || question.isEmpty()) return new Daily("", Daily.NONE);
        if (!date.equals(romeToday(now).toString())) return new Daily("", Daily.STALE);
        return new Daily(question, state);
    }

    /** Batteria del partner: quieter after an hour, gone after a day. */
    static final long BATTERY_FRESH_MS = 60 * 60_000L;
    static final long BATTERY_VISIBLE_MS = 24 * 60 * 60_000L;
    static final int BATTERY_LOW = 20;

    static final class Couple {
        String names = "";
        long days = -1;
        String frame = "";
        String todayInvitation = "";
        String distanceText = "";
        boolean distanceStale = false;
        /** "vicini": closer than the app writes a number for. */
        boolean distanceNear = false;
        /** "aggiornato 10 min fa"; "" when unknown or a week old. */
        String distanceAgo = "";
        Instant distanceNextChange = null;
        /** The partner's battery, -1 when unknown or older than a day. */
        int batteryLevel = -1;
        boolean batteryCharging = false;
        boolean batteryOld = false;
        /** When the battery goes quiet or disappears. */
        Instant batteryNextChange = null;
        Instant nextChange = null;

        boolean batteryShown() { return batteryLevel >= 0; }
        /** Phosphor glyph, same thresholds as the app (partner-battery.js). */
        String batteryGlyph() {
            if (batteryCharging) return "charging";
            if (batteryLevel <= BATTERY_LOW) return "low";
            return batteryLevel <= 60 ? "medium" : "high";
        }
        boolean batteryLow() { return batteryShown() && !batteryCharging && batteryLevel <= BATTERY_LOW; }
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
        out.distanceText = c.optString("distanceText", "");
        out.distanceStale = "stale".equals(c.optString("distanceState", ""));
        out.distanceNear = c.optBoolean("distanceNear", false);
        Instant distanceAt = UsWidgetContract.instant(c.optString("distanceAt", ""));
        String ago = bubbleAgo(distanceAt, now);
        out.distanceAgo = ago.isEmpty() ? "" : ago.equals("proprio ora") ? "aggiornato ora" : "aggiornato " + ago;
        if (!ago.isEmpty()) out.distanceNextChange = bubbleNextChange(distanceAt, now);
        int level = c.optInt("batteryLevel", -1);
        Instant at = UsWidgetContract.instant(c.optString("batteryAt", ""));
        if (level >= 0 && level <= 100 && at != null) {
            long age = Math.max(0L, Duration.between(at, now).toMillis());
            if (age < BATTERY_VISIBLE_MS) {
                out.batteryLevel = level;
                out.batteryCharging = c.optBoolean("batteryCharging", false);
                out.batteryOld = age >= BATTERY_FRESH_MS;
                out.batteryNextChange = at.plusMillis(out.batteryOld ? BATTERY_VISIBLE_MS : BATTERY_FRESH_MS);
            }
        }
        out.nextChange = nextRomeMidnight(now);
        return out;
    }

    // ---------- Ti penso ----------

    /**
     * Pastello (founder, 02/11/2026): the partner's last thought ("Bea ti ha
     * pensato · 2 min fa", "Ricambia"); a tap turns it at once into
     * "Ricambiato · adesso" and the send goes behind; "Ancora" sends again.
     */
    static final class Think {
        String line = "";
        String when = "";
        String cta = "";
        /** Heart tap sends; otherwise it opens US. */
        boolean canSend = false;
        /** A tap right now would be ignored (in flight or just tapped). */
        boolean busy = false;
        /** Just tapped: the heart button is full rosa, "adesso". */
        boolean done = false;
        /** The other person's name, as the app shows it. */
        String partner = "";
        Instant nextChange = null;
    }

    /**
     * @param action native action state: status (idle|sending|sent|failed|unauthorized|rate_limited), at, sentAt, reply
     * @param hasCredential the device-scoped send credential exists for this account
     */
    static Think think(JSONObject snapshot, JSONObject action, boolean hasCredential, Instant now) {
        Think out = new Think();
        if (snapshot == null) {
            out.line = "Apri US per collegare il widget";
            out.cta = "Apri";
            return out;
        }
        JSONObject t = UsWidgetContract.optObject(snapshot, "think");
        String partner = t.optString("partnerName", "").trim();
        out.partner = partner;
        String who = partner.isEmpty() ? "L’altra persona" : partner;
        String status = action == null ? "idle" : action.optString("status", "idle");
        Instant actionAt = action == null ? null : UsWidgetContract.instant(action.optString("at", ""));
        long sinceAction = actionAt == null ? Long.MAX_VALUE : Math.max(0, now.toEpochMilli() - actionAt.toEpochMilli());

        if (!hasCredential || status.equals("unauthorized")) {
            out.line = "Apri US per riattivare l’invio";
            out.cta = "Apri";
            return out;
        }
        out.canSend = true;
        boolean sending = status.equals("sending") && sinceAction < SENDING_STALE_MS;
        if (sending || (status.equals("sent") && sinceAction < SENT_VISIBLE_MS)) {
            // Shown the moment the heart is tapped, before the server answers.
            out.done = true;
            out.line = action.optBoolean("reply", false) ? "Ricambiato" : "Inviato";
            out.when = "adesso";
            out.cta = "Ancora";
            out.busy = sending || sinceAction < SEND_COOLDOWN_MS;
            out.nextChange = actionAt.plusMillis(sending ? SENDING_STALE_MS : out.busy ? SEND_COOLDOWN_MS : SENT_VISIBLE_MS);
            return out;
        }
        if ((status.equals("failed") || (status.equals("sending") && sinceAction >= SENDING_STALE_MS)) && sinceAction < FAILED_VISIBLE_MS) {
            out.line = "Non è partito";
            out.cta = "Riprova";
            out.nextChange = actionAt.plusMillis(FAILED_VISIBLE_MS);
            return out;
        }
        if (status.equals("rate_limited") && sinceAction < FAILED_VISIBLE_MS) {
            out.line = "Un attimo di pausa";
            out.cta = "Riprova";
            out.nextChange = actionAt.plusMillis(FAILED_VISIBLE_MS);
            return out;
        }

        Instant received = UsWidgetContract.instant(t.optString("lastReceivedAt", ""));
        if (unanswered(t, action)) {
            out.line = who + " ti ha pensato";
            out.when = bubbleAgo(received, now);
            out.cta = "Ricambia";
            if (!out.when.isEmpty()) out.nextChange = bubbleNextChange(received, now);
            return out;
        }
        out.line = partner.isEmpty() ? "Manda un pensiero" : "Pensa a " + partner;
        out.cta = "Ti penso";
        return out;
    }

    /**
     * "Ricambia" only while the partner's thought is the latest one and still
     * unanswered (a thought or a reaction answers it, a widget send too).
     */
    static boolean unanswered(JSONObject think, JSONObject action) {
        Instant received = UsWidgetContract.instant(think.optString("lastReceivedAt", ""));
        Instant sent = UsWidgetContract.instant(think.optString("lastSentAt", ""));
        Instant nativeSent = action == null ? null : UsWidgetContract.instant(action.optString("sentAt", ""));
        if (nativeSent != null && (sent == null || nativeSent.isAfter(sent))) sent = nativeSent;
        Instant answered = UsWidgetContract.instant(think.optString("lastAnsweredAt", ""));
        return received != null
            && (sent == null || received.isAfter(sent))
            && (answered == null || received.isAfter(answered));
    }

    /**
     * How many times the two of you thought of each other today (Rome day): the
     * app's count plus the widget's own sends after it. -1 when nothing knows.
     */
    static int thinkCount(JSONObject snapshot, int widgetSendsAfter, Instant now) {
        JSONObject t = snapshot == null ? null : snapshot.optJSONObject("think");
        String date = t == null ? "" : t.optString("todayDate", "");
        if (date.isEmpty()) return widgetSendsAfter > 0 ? widgetSendsAfter : -1;
        int app = date.equals(romeToday(now).toString()) ? Math.max(0, t.optInt("todayCount", 0)) : 0;
        return app + Math.max(0, widgetSendsAfter);
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

    // ---------- Relative times, shared by the widgets ----------

    static final long BUBBLE_VISIBLE_MS = 7 * DAY_MS;

    /** "proprio ora", then 5-minute steps in the first hour; "" after a week. */
    static String bubbleAgo(Instant at, Instant now) {
        if (at == null) return "";
        long ms = now.toEpochMilli() - at.toEpochMilli();
        // A couple of minutes of clock skew between phone and server is "now".
        if (ms < -120_000L || ms >= BUBBLE_VISIBLE_MS) return "";
        long minutes = Math.max(0, ms / 60_000L);
        if (minutes < 5) return "proprio ora";
        if (minutes < 60) return (minutes / 5 * 5) + " min fa";
        if (minutes < 120) return "1 ora fa";
        if (minutes < 1440) return (minutes / 60) + " ore fa";
        if (minutes < 2880) return "ieri";
        return (minutes / 1440) + " giorni fa";
    }

    /** When bubbleAgo next changes: every 5 minutes, then hourly, then daily. */
    static Instant bubbleNextChange(Instant at, Instant now) {
        long minutes = Math.max(0, Duration.between(at, now).toMinutes());
        long step = minutes < 60 ? 5 : minutes < 1440 ? 60 : 1440;
        return at.plus((minutes / step + 1) * step, ChronoUnit.MINUTES);
    }

    // ---------- Foto & giorni (Pastello) ----------

    /** The photo shown now: Oggi's of this hour, then of the next two, with US closed. */
    static final class PhotoSlot {
        String key = "";
        String takenOn = "";
        String label = "";
        int index = 0;
        int count = 0;
        Instant nextChange = null;
        boolean ready() { return !key.isEmpty(); }
    }

    static PhotoSlot photoSlot(JSONObject snapshot, Instant now) {
        PhotoSlot out = new PhotoSlot();
        JSONObject photo = UsWidgetContract.optObject(snapshot, "photo");
        if (!"ready".equals(photo.optString("state")) || photo.optString("key", "").isEmpty()) return out;
        JSONArray next = photo.optJSONArray("next");
        out.count = 1 + (next == null ? 0 : next.length());
        Instant hour = UsWidgetContract.instant(photo.optString("hour", ""));
        long elapsed = hour == null ? 0 : Math.floorDiv(now.toEpochMilli() - hour.toEpochMilli(), 3_600_000L);
        out.index = (int) Math.max(0, Math.min(out.count - 1, elapsed));
        JSONObject current = out.index == 0 ? photo : next.optJSONObject(out.index - 1);
        out.key = current.optString("key", "");
        out.takenOn = current.optString("takenOn", "");
        out.label = current.optString("label", "");
        if (hour != null && out.index < out.count - 1) out.nextChange = hour.plusSeconds(3600L * (out.index + 1));
        return out;
    }

    private static final String[] MONTHS = { "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
        "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre" };

    /** "21 aprile"; "" for anything that is not a civil date. */
    static String italianDay(String civil) {
        String clean = UsWidgetContract.civilDate(civil);
        if (clean.isEmpty()) return "";
        LocalDate day = LocalDate.parse(clean);
        return day.getDayOfMonth() + " " + MONTHS[day.getMonthValue() - 1];
    }

    /** "dal 21 aprile · Lisbona, 12 ottobre": since when, and where and when the photo is. */
    static String photoLine(JSONObject snapshot, PhotoSlot slot) {
        String since = italianDay(UsWidgetContract.optObject(snapshot, "couple").optString("startedOn", ""));
        String when = italianDay(slot.takenOn);
        String photo = slot.label.isEmpty() ? when : when.isEmpty() ? slot.label : slot.label + ", " + when;
        String head = since.isEmpty() ? "" : "dal " + since;
        return head.isEmpty() ? photo : photo.isEmpty() ? head : head + " · " + photo;
    }

    // ---------- Messaggio ----------

    /** The partner's last Ti penso, or the Lasciato per te still closed, whichever is newer. */
    static final class Message {
        boolean empty = true;
        String text = "";
        /** "10 min fa"; empty when it would be older than a week. */
        String when = "";
        /** us://widget/<destination>: the Ti penso, the envelope, or just US. */
        String destination = "message";
        Instant nextChange = null;
    }

    static Message message(JSONObject snapshot, Instant now) {
        Message out = new Message();
        if (snapshot == null) {
            out.text = "Apri US per collegare il widget";
            return out;
        }
        Instant received = UsWidgetContract.instant(UsWidgetContract.optObject(snapshot, "think").optString("lastReceivedAt", ""));
        // A Ti penso older than a week is not news; a closed envelope still waits.
        if (received != null && bubbleAgo(received, now).isEmpty()) received = null;
        JSONObject left = UsWidgetContract.optObject(snapshot, "left");
        Instant leftAt = UsWidgetContract.instant(left.optString("at", ""));
        String leftKind = left.optString("kind", "");
        if (leftKind.isEmpty()) leftAt = null;
        if (received == null && leftAt == null) {
            out.text = "Il suo prossimo pensiero arriverà qui";
            return out;
        }
        out.empty = false;
        boolean envelope = leftAt != null && (received == null || leftAt.isAfter(received));
        Instant at = envelope ? leftAt : received;
        out.text = envelope ? "Ti ha lasciato " + leftNoun(leftKind) : "Ti ha pensato";
        out.destination = envelope ? "message/left" : "message/think";
        out.when = bubbleAgo(at, now);
        if (!out.when.isEmpty()) out.nextChange = bubbleNextChange(at, now);
        return out;
    }

    static String leftNoun(String kind) {
        switch (kind) {
            case "photo": return "una foto";
            case "audio": return "un vocale";
            case "video": return "un video";
            case "music": return "una canzone";
            default: return "un messaggio";
        }
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
