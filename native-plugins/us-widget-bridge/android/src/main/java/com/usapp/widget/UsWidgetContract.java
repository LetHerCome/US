package com.usapp.widget;

import java.time.Instant;
import java.time.LocalDate;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The semantic widget snapshot written by the US WebView.
 *
 * It carries meaning (dates, names, the selected Countdown), never rendered
 * strings, URLs, media or secrets. Every field is re-validated here so a
 * malformed or hostile payload can only degrade a widget to its empty state.
 * Pure Java (java.time + org.json): unit-tested on the JVM.
 */
final class UsWidgetContract {
    static final int SCHEMA_VERSION = 2;
    static final Pattern OWNER_HASH = Pattern.compile("^[a-f0-9]{64}$");
    static final Pattern MEDIA_KEY = Pattern.compile("^[a-f0-9]{32}$");
    private static final Pattern STYLE = Pattern.compile("^(editorial|signal|glass|aurora|orbit|chrome)$");
    private static final Pattern FRAME = Pattern.compile("^[a-z0-9_]{1,24}$");
    private static final Pattern DISTANCE = Pattern.compile("^[0-9., ]{1,16} ?(km|m|mi|ft)$");
    private static final Pattern CIVIL_DATE = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");
    private static final Pattern DAILY_STATE = Pattern.compile("^(todo|your_turn|waiting|ready)$");
    private static final Pattern LEFT_KIND = Pattern.compile("^(text|photo|audio|video|music)$");
    // Come stai: the twelve keys of public.member_status.
    static final Pattern STATUS_KEY = Pattern.compile("^(innamorato|felice|stanco|giu|nervoso|malato|festa|lavoro|studio|palestra|viaggio|tavola)$");
    private static final Pattern COLOR = Pattern.compile("^#[0-9a-fA-F]{6}$");
    private static final Pattern PAPER = Pattern.compile("^(yellow|pink|blue|green)$");

    private UsWidgetContract() {}

    static boolean validOwner(String value) {
        return value != null && OWNER_HASH.matcher(value).matches();
    }

    /** Returns a clean v2 snapshot, or null when the payload is unusable. */
    static JSONObject normalize(JSONObject input) {
        if (input == null) return null;
        int version = input.optInt("schemaVersion", 0);
        if (version != SCHEMA_VERSION && version != 1) return null;
        String ownerHash = input.optString("ownerHash", "");
        if (!validOwner(ownerHash)) return null;
        try {
            JSONObject thinkIn = version == 1
                ? optObject(optObject(input, "modules"), "think")
                : optObject(input, "think");
            JSONObject think = new JSONObject()
                .put("partnerName", text(thinkIn.optString("partnerName", ""), 40))
                .put("lastReceivedAt", instantText(thinkIn.optString("lastReceivedAt", "")))
                .put("lastSentAt", instantText(thinkIn.optString("lastSentAt", "")))
                // A reaction to the partner's thought answers it as well as a thought does.
                .put("lastAnsweredAt", instantText(thinkIn.optString("lastAnsweredAt", "")))
                // How many times the two of them thought of each other that Rome day.
                .put("todayCount", Math.max(0, Math.min(999, thinkIn.optInt("todayCount", 0))))
                .put("todayDate", civilDate(thinkIn.optString("todayDate", "")));

            JSONObject coupleIn = optObject(input, "couple");
            JSONArray namesIn = coupleIn.optJSONArray("names");
            JSONArray names = new JSONArray();
            if (namesIn != null) {
                for (int i = 0; i < namesIn.length() && names.length() < 2; i++) {
                    String name = text(namesIn.optString(i, ""), 40);
                    if (!name.isEmpty()) names.put(name);
                }
            }
            String frame = coupleIn.optString("frame", "");
            JSONObject couple = new JSONObject()
                .put("names", names)
                .put("startedOn", civilDate(coupleIn.optString("startedOn", "")))
                .put("frame", FRAME.matcher(frame).matches() ? frame : "")
                .put("distanceText", DISTANCE.matcher(coupleIn.optString("distanceText", "")).matches()
                    ? coupleIn.optString("distanceText", "") : "")
                .put("distanceState", "stale".equals(coupleIn.optString("distanceState", ""))
                    ? "stale" : "ready")
                // Distanza e batteria: "meno di 3 km", and when the distance was read.
                .put("distanceNear", coupleIn.optBoolean("distanceNear", false))
                .put("distanceAt", instantText(coupleIn.optString("distanceAt", "")));
            // Batteria del partner: the level the partner last reported, whether
            // it was charging and when (server time). Unknown: level -1.
            int batteryLevel = coupleIn.optInt("batteryLevel", -1);
            String batteryAt = instantText(coupleIn.optString("batteryAt", ""));
            if (batteryLevel < 0 || batteryLevel > 100 || batteryAt.isEmpty()) { batteryLevel = -1; batteryAt = ""; }
            // Pastello: each person's colour as the app shows it (rosa, lilla or the one chosen).
            JSONObject colorsIn = optObject(coupleIn, "colors");
            String meColor = colorsIn.optString("me", "");
            String partnerColor = colorsIn.optString("partner", "");
            couple.put("colors", new JSONObject()
                .put("me", COLOR.matcher(meColor).matches() ? meColor.toLowerCase() : "")
                .put("partner", COLOR.matcher(partnerColor).matches() ? partnerColor.toLowerCase() : ""));
            couple.put("batteryLevel", batteryLevel)
                .put("batteryCharging", batteryLevel >= 0 && coupleIn.optBoolean("batteryCharging", false))
                .put("batteryAt", batteryAt);

            JSONObject countdownIn = optObject(input, "countdown");
            String kind = countdownIn.optString("kind", "");
            String target = countdownIn.optString("target", "");
            if (kind.equals("together") || kind.equals("days")) target = civilDate(target);
            else if (kind.equals("clock")) target = instantText(target);
            else { kind = ""; target = ""; }
            String style = countdownIn.optString("style", "");
            if (!STYLE.matcher(style).matches()) style = "editorial";
            boolean active = countdownIn.optBoolean("active", false) && !kind.isEmpty() && !target.isEmpty();
            JSONObject countdown = new JSONObject()
                .put("active", active)
                .put("kind", active ? kind : "")
                .put("title", active ? text(countdownIn.optString("title", ""), 60) : "")
                .put("target", active ? target : "")
                .put("style", style);

            JSONObject photoIn = optObject(input, "photo");
            String photoState = photoIn.optString("state", "none");
            String key = photoIn.optString("key", "");
            if (!photoState.equals("ready") || !MEDIA_KEY.matcher(key).matches()) { photoState = "none"; key = ""; }
            boolean ready = photoState.equals("ready");
            JSONObject photo = new JSONObject()
                .put("state", photoState)
                .put("key", key)
                .put("takenOn", ready ? civilDate(photoIn.optString("takenOn", "")) : "")
                // Foto & giorni (Pastello): the place or caption, the hour this
                // photo is Oggi's, and Oggi's photos of the next two hours.
                .put("label", ready ? text(photoIn.optString("label", ""), 60) : "")
                .put("hour", ready ? instantText(photoIn.optString("hour", "")) : "");
            JSONArray nextIn = photoIn.optJSONArray("next");
            JSONArray next = new JSONArray();
            for (int i = 0; ready && nextIn != null && i < nextIn.length() && next.length() < 2; i++) {
                JSONObject item = nextIn.optJSONObject(i);
                String nextKey = item == null ? "" : item.optString("key", "");
                if (!MEDIA_KEY.matcher(nextKey).matches()) continue;
                next.put(new JSONObject().put("key", nextKey)
                    .put("takenOn", civilDate(item.optString("takenOn", "")))
                    .put("label", text(item.optString("label", ""), 60)));
            }
            photo.put("next", next);

            // La domanda di oggi: the day, the question (shared content, never an
            // answer) and whose turn it is. Absent or malformed: no question.
            JSONObject dailyIn = optObject(input, "daily");
            String dailyDate = civilDate(dailyIn.optString("date", ""));
            String dailyState = dailyIn.optString("state", "");
            String question = text(dailyIn.optString("question", ""), 240);
            if (!DAILY_STATE.matcher(dailyState).matches() || dailyDate.isEmpty() || question.isEmpty()) {
                dailyState = "none"; dailyDate = ""; question = "";
            }
            JSONObject daily = new JSONObject()
                .put("date", dailyDate)
                .put("question", question)
                .put("state", dailyState);

            // Messaggio: the newest Lasciato per te still closed for me, by kind
            // and time only. Never its words, photo or link.
            JSONObject leftIn = optObject(input, "left");
            String leftKind = leftIn.optString("kind", "");
            String leftAt = instantText(leftIn.optString("at", ""));
            if (!LEFT_KIND.matcher(leftKind).matches() || leftAt.isEmpty()) { leftKind = ""; leftAt = ""; }
            JSONObject left = new JSONObject().put("kind", leftKind).put("at", leftAt);

            // Ricordi a pila: which memory the stack shows (the pictures are
            // separate files). Never a path, a URL or a photo.
            JSONObject memoriesIn = optObject(input, "memories");
            String memoriesDate = civilDate(memoriesIn.optString("date", ""));
            boolean memoriesReady = "ready".equals(memoriesIn.optString("state", "")) && !memoriesDate.isEmpty();
            JSONObject memories = new JSONObject()
                .put("state", memoriesReady ? "ready" : "none")
                .put("label", memoriesReady ? text(memoriesIn.optString("label", ""), 24) : "")
                .put("anniversary", memoriesReady && memoriesIn.optBoolean("anniversary", false))
                .put("day", memoriesReady ? civilDate(memoriesIn.optString("day", "")) : "")
                .put("date", memoriesReady ? memoriesDate : "")
                .put("title", memoriesReady ? text(memoriesIn.optString("title", ""), 60) : "")
                .put("count", memoriesReady ? Math.max(0, Math.min(9999, memoriesIn.optInt("count", 0))) : 0)
                .put("stack", memoriesReady ? Math.max(1, Math.min(3, memoriesIn.optInt("stack", 1))) : 0);

            // Lavagna: a drawing or not, who drew last (me or partner) and when
            // (server time). The drawing itself is two separate pictures.
            JSONObject lavagnaIn = optObject(input, "lavagna");
            String lavagnaState = lavagnaIn.optString("state", "");
            if (!lavagnaState.equals("ready") && !lavagnaState.equals("empty")) lavagnaState = "none";
            boolean drawn = lavagnaState.equals("ready");
            String lavagnaBy = lavagnaIn.optString("by", "");
            JSONObject lavagna = new JSONObject()
                .put("state", lavagnaState)
                .put("by", drawn && (lavagnaBy.equals("me") || lavagnaBy.equals("partner")) ? lavagnaBy : "")
                .put("at", drawn ? instantText(lavagnaIn.optString("at", "")) : "");

            // Post-it (04/11/2026): the newest post-it of the board, its paper,
            // who wrote it (me or partner) and how many others. The couple's own
            // words, cut at 120; never an id or a URL.
            JSONObject postitIn = optObject(input, "postit");
            String postitText = text(postitIn.optString("text", ""), 120);
            boolean written = "ready".equals(postitIn.optString("state", "")) && !postitText.isEmpty();
            String paper = postitIn.optString("color", "");
            String postitBy = postitIn.optString("by", "");
            JSONObject postit = new JSONObject()
                .put("state", written ? "ready" : "none")
                .put("text", written ? postitText : "")
                .put("color", written ? (PAPER.matcher(paper).matches() ? paper : "yellow") : "")
                .put("by", written && (postitBy.equals("me") || postitBy.equals("partner")) ? postitBy : "")
                .put("more", written ? Math.max(0, Math.min(99, postitIn.optInt("more", 0))) : 0)
                .put("at", written ? instantText(postitIn.optString("at", "")) : "");

            return new JSONObject()
                .put("schemaVersion", SCHEMA_VERSION)
                .put("ownerHash", ownerHash)
                .put("updatedAt", instantText(input.optString("updatedAt", "")))
                .put("think", think)
                .put("couple", couple)
                .put("countdown", countdown)
                .put("photo", photo)
                .put("daily", daily)
                .put("left", left)
                .put("memories", memories)
                .put("lavagna", lavagna)
                .put("postit", postit)
                .put("status", new JSONObject()
                    .put("me", statusPerson(optObject(optObject(input, "status"), "me")))
                    .put("partner", statusPerson(optObject(optObject(input, "status"), "partner"))));
        } catch (Exception ignored) {
            return null;
        }
    }

    static JSONObject optObject(JSONObject parent, String key) {
        JSONObject value = parent == null ? null : parent.optJSONObject(key);
        return value == null ? new JSONObject() : value;
    }

    /** Come stai: a key of the twelve, the words' form and the server's times. Never free text. */
    static JSONObject statusPerson(JSONObject in) throws Exception {
        String status = in.optString("status", "");
        String at = instantText(in.optString("at", ""));
        String until = instantText(in.optString("until", ""));
        boolean shown = STATUS_KEY.matcher(status).matches() && !at.isEmpty() && !until.isEmpty();
        String form = in.optString("form", "");
        return new JSONObject()
            .put("status", shown ? status : "")
            .put("form", form.equals("m") || form.equals("f") ? form : "")
            .put("at", shown ? at : "")
            .put("until", shown ? until : "");
    }

    static String text(String value, int max) {
        if (value == null) return "";
        String clean = value.replaceAll("[\\p{Cntrl}]", " ").trim();
        return clean.length() <= max ? clean : clean.substring(0, max);
    }

    static String civilDate(String value) {
        if (value == null || !CIVIL_DATE.matcher(value).matches()) return "";
        try { return LocalDate.parse(value).toString(); }
        catch (Exception ignored) { return ""; }
    }

    static String instantText(String value) {
        if (value == null || value.length() > 40) return "";
        Instant parsed = instant(value);
        return parsed == null ? "" : parsed.toString();
    }

    /** ISO instants, with "Z" or a numeric offset (Postgres timestamptz). */
    static Instant instant(String value) {
        if (value == null || value.isEmpty()) return null;
        try { return Instant.parse(value); }
        catch (Exception ignored) {}
        try { return java.time.OffsetDateTime.parse(value).toInstant(); }
        catch (Exception ignored) { return null; }
    }
}
