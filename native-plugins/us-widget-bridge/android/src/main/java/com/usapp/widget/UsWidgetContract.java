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
    private static final Pattern CIVIL_DATE = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");

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
                .put("lastAnsweredAt", instantText(thinkIn.optString("lastAnsweredAt", "")));

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
                .put("frame", FRAME.matcher(frame).matches() ? frame : "");

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
            JSONObject photo = new JSONObject()
                .put("state", photoState)
                .put("key", key)
                .put("takenOn", photoState.equals("ready") ? civilDate(photoIn.optString("takenOn", "")) : "");

            return new JSONObject()
                .put("schemaVersion", SCHEMA_VERSION)
                .put("ownerHash", ownerHash)
                .put("updatedAt", instantText(input.optString("updatedAt", "")))
                .put("think", think)
                .put("couple", couple)
                .put("countdown", countdown)
                .put("photo", photo);
        } catch (Exception ignored) {
            return null;
        }
    }

    static JSONObject optObject(JSONObject parent, String key) {
        JSONObject value = parent == null ? null : parent.optJSONObject(key);
        return value == null ? new JSONObject() : value;
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
