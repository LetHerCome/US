package com.usapp.widget;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Widget «Nota» (docs/missions/widget-nota-v1.md), the pure parts: the copy
 * of the couple's notes the app writes (same limits as couple_notes_v1),
 * what the widget shows, the optimistic tick. The Edge address is
 * UsWidgetEndpoints' (the same rule as Ti penso).
 * Pure Java (org.json, java.time): unit-tested on the JVM.
 */
final class UsNoteModels {
    static final int MAX_NOTES = 40;
    static final int ROWS = 6;
    static final String STATUS_FAILED = "failed";
    /** "Non salvato" stays this long after a refused tick. */
    static final long FAILED_VISIBLE_MS = 60_000L;
    private static final int TITLE = 80;
    private static final int BODY = 4000;
    private static final int ITEMS = 100;
    private static final int ITEM_TEXT = 200;
    private static final int ITEM_ID = 40;
    private static final Pattern NOTE_ID = Pattern.compile("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$");

    private UsNoteModels() {}

    static boolean validNoteId(String value) {
        return value != null && NOTE_ID.matcher(value).matches();
    }

    /** The app's copy, only for the active account; invalid notes are dropped. */
    static JSONObject normalizeCache(JSONObject input, String owner) {
        if (input == null || owner == null || owner.isEmpty() || !owner.equals(input.optString("ownerHash", ""))) return null;
        try {
            JSONArray in = input.optJSONArray("notes");
            JSONArray notes = new JSONArray();
            for (int i = 0; in != null && i < in.length() && notes.length() < MAX_NOTES; i++) {
                JSONObject note = normalizeNote(in.optJSONObject(i));
                if (note != null) notes.put(note);
            }
            return new JSONObject().put("ownerHash", owner).put("notes", notes);
        } catch (Exception ignored) {
            return null;
        }
    }

    /** One note, from the app's copy or the server's answer; null when it breaks a limit. */
    static JSONObject normalizeNote(JSONObject in) {
        if (in == null) return null;
        try {
            String id = in.optString("id", "");
            String title = in.optString("title", "").trim();
            String body = in.optString("body", "");
            if (!validNoteId(id) || title.length() > TITLE || body.length() > BODY) return null;
            JSONArray itemsIn = in.optJSONArray("items");
            if (itemsIn != null && itemsIn.length() > ITEMS) return null;
            JSONArray items = new JSONArray();
            Set<String> seen = new HashSet<>();
            for (int i = 0; itemsIn != null && i < itemsIn.length(); i++) {
                JSONObject item = itemsIn.optJSONObject(i);
                if (item == null) return null;
                String itemId = item.optString("id", "");
                Object text = item.opt("text");
                Object done = item.opt("done");
                if (itemId.isEmpty() || itemId.length() > ITEM_ID || !seen.add(itemId)
                    || !(text instanceof String) || ((String) text).length() > ITEM_TEXT || !(done instanceof Boolean)) return null;
                items.put(new JSONObject().put("id", itemId).put("text", text).put("done", done));
            }
            JSONObject out = new JSONObject()
                .put("id", id)
                .put("title", title)
                .put("body", body)
                .put("items", items)
                .put("updatedAt", UsWidgetContract.instantText(in.optString("updatedAt", "")))
                .put("byName", UsWidgetContract.text(in.optString("byName", ""), 40))
                .put("byMe", in.optBoolean("byMe", false))
                .put("revision", Math.max(1, in.optInt("revision", 1)));
            // The phone's own mark: a tick not saved by the server ("failed").
            String status = in.optString("status", "");
            String statusAt = UsWidgetContract.instantText(in.optString("statusAt", ""));
            if (STATUS_FAILED.equals(status) && !statusAt.isEmpty()) out.put("status", status).put("statusAt", statusAt);
            return out;
        } catch (Exception ignored) {
            return null;
        }
    }

    static JSONObject find(JSONObject cache, String noteId) {
        JSONArray notes = cache == null ? null : cache.optJSONArray("notes");
        for (int i = 0; notes != null && i < notes.length(); i++) {
            JSONObject note = notes.optJSONObject(i);
            if (note != null && note.optString("id", "").equals(noteId)) return note;
        }
        return null;
    }

    static final class Row {
        final String id;
        final String text;
        final boolean done;
        Row(String id, String text, boolean done) { this.id = id; this.text = text; this.done = done; }
    }

    /** What the widget shows: the title, the text or up to six items, who and when. */
    static final class View {
        boolean empty = true;
        String title = "";
        String body = "";
        final List<Row> rows = new ArrayList<>();
        /** "+3" when more items than rows. */
        String more = "";
        String footer = "";
        /** The last tick was refused: the footer says "Non salvato" for a minute. */
        boolean failed = false;
        Instant nextChange = null;
    }

    static View view(JSONObject note, Instant now) {
        View out = new View();
        if (note == null) {
            out.title = "Tocca per scegliere una nota";
            return out;
        }
        out.empty = false;
        out.title = note.optString("title", "");
        JSONArray items = note.optJSONArray("items");
        int count = items == null ? 0 : items.length();
        if (count == 0) out.body = note.optString("body", "");
        for (int i = 0; i < count && out.rows.size() < ROWS; i++) {
            JSONObject item = items.optJSONObject(i);
            out.rows.add(new Row(item.optString("id"), item.optString("text"), item.optBoolean("done")));
        }
        if (count > ROWS) out.more = "+" + (count - ROWS);
        String name = note.optBoolean("byMe", false) ? "Tu" : note.optString("byName", "");
        Instant at = UsWidgetContract.instant(note.optString("updatedAt", ""));
        String ago = UsWidgetModels.bubbleAgo(at, now);
        out.footer = name.isEmpty() ? ago : ago.isEmpty() ? name : name + " · " + ago;
        if (!ago.isEmpty()) out.nextChange = UsWidgetModels.bubbleNextChange(at, now);
        Instant failed = STATUS_FAILED.equals(note.optString("status", "")) ? UsWidgetContract.instant(note.optString("statusAt", "")) : null;
        if (failed != null && now.toEpochMilli() - failed.toEpochMilli() < FAILED_VISIBLE_MS) {
            out.footer = "Non salvato";
            out.failed = true;
            Instant back = failed.plusMillis(FAILED_VISIBLE_MS);
            if (out.nextChange == null || back.isBefore(out.nextChange)) out.nextChange = back;
        }
        return out;
    }

    /** The optimistic tick: a new copy with that one item changed, or null. */
    static JSONObject toggle(JSONObject note, String itemId, boolean done) {
        try {
            JSONObject copy = new JSONObject(note.toString());
            JSONArray items = copy.optJSONArray("items");
            for (int i = 0; items != null && i < items.length(); i++) {
                JSONObject item = items.getJSONObject(i);
                if (item.optString("id").equals(itemId)) {
                    item.put("done", done);
                    return copy;
                }
            }
        } catch (Exception ignored) {}
        return null;
    }
}
