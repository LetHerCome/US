package com.usapp.widget;

import android.content.Context;
import android.util.AtomicFile;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HashSet;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Private, app-only widget storage (no-backup files dir, never exported).
 *
 * Three separate kinds of data, separately cleared:
 *  - semantic shared state: snapshot-v2.json (written by the WebView);
 *  - action state: think-action-v1.json (owned by the native send path);
 *  - cached private media: media/photo.jpg + media/photo-meta.json.
 * The send secret lives only in its own Keystore-encrypted store, never here.
 * Everything is bound to an account hash; a different account wipes it all.
 */
final class UsWidgetStore {
    static final int MAX_PHOTO_BYTES = 2 * 1024 * 1024;
    private final File directory;
    private final File mediaDirectory;
    private final AtomicFile ownerFile;
    private final AtomicFile snapshotFile;
    private final AtomicFile actionFile;
    private final AtomicFile thinkHistoryFile;
    private final AtomicFile photoFile;
    private final AtomicFile photoMetaFile;
    private final AtomicFile noiPortraitFile;

    UsWidgetStore(Context context) {
        directory = new File(context.getNoBackupFilesDir(), "us-widget");
        mediaDirectory = new File(directory, "media");
        if (!mediaDirectory.exists()) mediaDirectory.mkdirs();
        ownerFile = new AtomicFile(new File(directory, "owner-v1.txt"));
        snapshotFile = new AtomicFile(new File(directory, "snapshot-v2.json"));
        actionFile = new AtomicFile(new File(directory, "think-action-v1.json"));
        thinkHistoryFile = new AtomicFile(new File(directory, "think-history-v1.json"));
        photoFile = new AtomicFile(new File(mediaDirectory, "photo.jpg"));
        photoMetaFile = new AtomicFile(new File(mediaDirectory, "photo-meta.json"));
        noiPortraitFile = new AtomicFile(new File(mediaDirectory, "noi-portrait.jpg"));
        // V1 kept the action status inside the shared snapshot. It is superseded.
        new File(directory, "snapshot-v1.json").delete();
    }

    // ---------- account ----------

    synchronized boolean activateAccount(String ownerHash) {
        if (!UsWidgetContract.validOwner(ownerHash)) return false;
        String current = owner();
        if (!current.isEmpty() && !current.equals(ownerHash)) wipeAccountData();
        return writeAtomic(ownerFile, ownerHash);
    }

    synchronized String owner() {
        String value = readAtomic(ownerFile).trim();
        return UsWidgetContract.validOwner(value) ? value : "";
    }

    synchronized void clearAll() {
        wipeAccountData();
        ownerFile.delete();
    }

    private void wipeAccountData() {
        snapshotFile.delete();
        actionFile.delete();
        thinkHistoryFile.delete();
        photoFile.delete();
        photoMetaFile.delete();
        noiPortraitFile.delete();
    }

    // ---------- semantic snapshot ----------

    synchronized boolean write(JSONObject input) {
        JSONObject normalized = UsWidgetContract.normalize(input);
        if (normalized == null) return false;
        String owner = owner();
        if (owner.isEmpty() || !owner.equals(normalized.optString("ownerHash", ""))) return false;
        if (!writeAtomic(snapshotFile, normalized.toString())) return false;
        // The photo cache follows the snapshot: no current photo, no cached photo.
        JSONObject photo = normalized.optJSONObject("photo");
        if (photo == null || !"ready".equals(photo.optString("state"))) {
            photoFile.delete();
            photoMetaFile.delete();
        }
        return true;
    }

    synchronized JSONObject read() {
        String json = readAtomic(snapshotFile);
        if (json.isEmpty()) return null;
        try {
            JSONObject normalized = UsWidgetContract.normalize(new JSONObject(json));
            String owner = owner();
            if (normalized == null || owner.isEmpty() || !owner.equals(normalized.optString("ownerHash", ""))) return null;
            return normalized;
        } catch (Exception ignored) {
            return null;
        }
    }

    // ---------- Ti penso action state ----------

    synchronized JSONObject readAction() {
        try {
            JSONObject action = new JSONObject(readAtomic(actionFile));
            String owner = owner();
            if (owner.isEmpty() || !owner.equals(action.optString("ownerHash", ""))) return null;
            return action;
        } catch (Exception ignored) {
            return null;
        }
    }

    /** Records the action status; keeps the pending action id for idempotent retries. */
    synchronized boolean writeAction(String status, String actionId) {
        String owner = owner();
        if (owner.isEmpty()) return false;
        JSONObject previous = readAction();
        try {
            String now = Instant.now().toString();
            JSONObject next = new JSONObject()
                .put("ownerHash", owner)
                .put("status", status)
                .put("at", now)
                .put("actionId", actionId == null ? "" : actionId)
                .put("sentAt", status.equals("sent") ? now : previous == null ? "" : previous.optString("sentAt", ""));
            return writeAtomic(actionFile, next.toString());
        } catch (Exception ignored) {
            return false;
        }
    }

    // Confirmed native-widget sends are kept on the device, scoped to the active account.
    // A rolling 24-hour interval is used; no additional backend endpoint is called.
    private JSONArray recentThinkEvents(Instant now) {
        JSONArray events = new JSONArray();
        String ownerHash = owner();
        if (ownerHash.isEmpty()) return events;
        try {
            JSONObject stored = new JSONObject(readAtomic(thinkHistoryFile));
            if (!ownerHash.equals(stored.optString("ownerHash", ""))) return events;
            JSONArray previous = stored.optJSONArray("events");
            if (previous == null) return events;
            HashSet<String> seen = new HashSet<>();
            long cutoff = now.minusSeconds(86400).toEpochMilli();
            for (int i = 0; i < previous.length(); i++) {
                JSONObject entry = previous.optJSONObject(i);
                if (entry == null) continue;
                String id = entry.optString("id", "");
                Instant timestamp = UsWidgetContract.instant(entry.optString("at", ""));
                if (id.isEmpty() || timestamp == null || timestamp.toEpochMilli() <= cutoff
                    || timestamp.isAfter(now) || !seen.add(id)) continue;
                events.put(entry);
            }
        } catch (Exception ignored) {}
        return events;
    }

    synchronized boolean recordThinkSent(String actionId, Instant now) {
        if (actionId == null || actionId.isEmpty() || owner().isEmpty()) return false;
        JSONArray events = recentThinkEvents(now);
        for (int i = 0; i < events.length(); i++) {
            if (actionId.equals(events.optJSONObject(i).optString("id"))) return true;
        }
        try {
            events.put(new JSONObject().put("id", actionId).put("at", now.toString()));
            return writeAtomic(thinkHistoryFile, new JSONObject()
                .put("ownerHash", owner()).put("events", events).toString());
        } catch (Exception ignored) { return false; }
    }

    synchronized int countThinkSent24h(Instant now) {
        return recentThinkEvents(now).length();
    }

    synchronized Instant nextThinkExpiry(Instant now) {
        JSONArray events = recentThinkEvents(now);
        Instant next = null;
        for (int i = 0; i < events.length(); i++) {
            Instant at = UsWidgetContract.instant(events.optJSONObject(i).optString("at", ""));
            if (at == null) continue;
            Instant expiry = at.plusSeconds(86400).plusMillis(1000);
            if (next == null || expiry.isBefore(next)) next = expiry;
        }
        return next;
    }

    // WebView-prepared two-person portrait, never a signed URL.
    synchronized boolean writeNoiPortrait(String ownerHash, byte[] bytes) {
        if (!owner().equals(ownerHash) || ownerHash.isEmpty() || bytes == null ||
            bytes.length < 64 || bytes.length > MAX_PHOTO_BYTES || !isImage(bytes)) return false;
        FileOutputStream output = null;
        try {
            output = noiPortraitFile.startWrite();
            output.write(bytes);
            output.flush();
            noiPortraitFile.finishWrite(output);
            return true;
        } catch (Exception ignored) {
            if (output != null) noiPortraitFile.failWrite(output);
            return false;
        }
    }

    synchronized byte[] readNoiPortrait() {
        if (owner().isEmpty()) return null;
        try { return noiPortraitFile.readFully(); }
        catch (Exception ignored) { return null; }
    }

    // ---------- cached private photo ----------

    synchronized boolean writePhoto(String ownerHash, String key, byte[] bytes) {
        String owner = owner();
        if (owner.isEmpty() || !owner.equals(ownerHash) || key == null || !UsWidgetContract.MEDIA_KEY.matcher(key).matches()) return false;
        if (bytes == null || bytes.length < 64 || bytes.length > MAX_PHOTO_BYTES || !isImage(bytes)) return false;
        FileOutputStream output = null;
        try {
            output = photoFile.startWrite();
            output.write(bytes);
            output.flush();
            photoFile.finishWrite(output);
        } catch (Exception ignored) {
            if (output != null) photoFile.failWrite(output);
            return false;
        }
        try {
            return writeAtomic(photoMetaFile, new JSONObject().put("ownerHash", owner).put("key", key).toString());
        } catch (Exception ignored) {
            return false;
        }
    }

    /** The cached photo bytes, only when they belong to this account and match the snapshot key. */
    synchronized byte[] readPhoto(String expectedKey) {
        try {
            JSONObject meta = new JSONObject(readAtomic(photoMetaFile));
            String owner = owner();
            if (owner.isEmpty() || !owner.equals(meta.optString("ownerHash")) || !meta.optString("key").equals(expectedKey)) return null;
            return photoFile.readFully();
        } catch (Exception ignored) {
            return null;
        }
    }

    synchronized String photoKey() {
        try {
            JSONObject meta = new JSONObject(readAtomic(photoMetaFile));
            return owner().equals(meta.optString("ownerHash")) ? meta.optString("key", "") : "";
        } catch (Exception ignored) {
            return "";
        }
    }

    synchronized void clearPhoto() {
        photoFile.delete();
        photoMetaFile.delete();
    }

    static boolean isImage(byte[] bytes) {
        boolean jpeg = (bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xD8;
        boolean png = (bytes[0] & 0xFF) == 0x89 && bytes[1] == 'P' && bytes[2] == 'N' && bytes[3] == 'G';
        boolean webp = bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F' && bytes[8] == 'W' && bytes[9] == 'E';
        return jpeg || png || webp;
    }

    // ---------- files ----------

    static String readAtomic(AtomicFile file) {
        try (FileInputStream input = file.openRead()) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[2048];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            return output.toString(StandardCharsets.UTF_8.name());
        } catch (Exception ignored) {
            return "";
        }
    }

    static boolean writeAtomic(AtomicFile file, String value) {
        FileOutputStream output = null;
        try {
            output = file.startWrite();
            output.write(value.getBytes(StandardCharsets.UTF_8));
            output.flush();
            file.finishWrite(output);
            return true;
        } catch (Exception error) {
            if (output != null) file.failWrite(output);
            return false;
        }
    }
}
