package com.usapp.widget;

import android.content.Context;
import android.util.AtomicFile;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;
import org.json.JSONObject;

final class UsWidgetSnapshotStore {
    private static final int SCHEMA_VERSION = 1;
    private static final Pattern OWNER_HASH = Pattern.compile("^[a-f0-9]{64}$");
    private final AtomicFile snapshotFile;
    private final AtomicFile ownerFile;

    UsWidgetSnapshotStore(Context context) {
        File directory = new File(context.getNoBackupFilesDir(), "us-widget");
        if (!directory.exists()) directory.mkdirs();
        snapshotFile = new AtomicFile(new File(directory, "snapshot-v1.json"));
        ownerFile = new AtomicFile(new File(directory, "owner-v1.txt"));
    }

    synchronized boolean activateAccount(String ownerHash) {
        if (!validOwner(ownerHash)) return false;
        String currentOwner = readOwner();
        if (!currentOwner.isEmpty() && !currentOwner.equals(ownerHash)) snapshotFile.delete();
        return writeAtomic(ownerFile, ownerHash);
    }

    synchronized boolean write(JSONObject input) {
        JSONObject normalized = normalize(input);
        if (normalized == null) return false;
        String ownerHash = normalized.optString("ownerHash", "");
        if (!ownerHash.equals(readOwner())) return false;
        return writeAtomic(snapshotFile, normalized.toString());
    }

    synchronized JSONObject read() {
        String json = readAtomic(snapshotFile);
        if (json.isEmpty()) return null;
        try {
            JSONObject normalized = normalize(new JSONObject(json));
            if (normalized == null || !normalized.optString("ownerHash", "").equals(readOwner())) return null;
            return normalized;
        } catch (Exception ignored) {
            return null;
        }
    }

    synchronized void clear() {
        snapshotFile.delete();
        ownerFile.delete();
    }

    synchronized boolean updateActionStatus(String status) {
        if (!status.equals("sending") && !status.equals("sent") && !status.equals("failed")) return false;
        JSONObject current = read();
        if (current == null) return false;
        try {
            JSONObject think = current.getJSONObject("modules").getJSONObject("think");
            think.put("lastActionStatus", status);
            think.put("lastActionAt", java.time.Instant.now().toString());
            current.put("updatedAt", java.time.Instant.now().toString());
            return write(current);
        } catch (Exception ignored) {
            return false;
        }
    }

    private JSONObject normalize(JSONObject input) {
        if (input == null || input.optInt("schemaVersion", 0) != SCHEMA_VERSION) return null;
        String ownerHash = input.optString("ownerHash", "");
        if (!validOwner(ownerHash)) return null;
        JSONObject inputThink = input.optJSONObject("modules") == null
            ? null
            : input.optJSONObject("modules").optJSONObject("think");
        if (inputThink == null) inputThink = new JSONObject();
        String status = inputThink.optString("lastActionStatus", "idle");
        if (!status.equals("idle") && !status.equals("sending") && !status.equals("sent") && !status.equals("failed")) status = "idle";
        try {
            JSONObject think = new JSONObject()
                .put("partnerName", limit(inputThink.optString("partnerName", ""), 80))
                .put("lastReceivedAt", limit(inputThink.optString("lastReceivedAt", ""), 40))
                .put("lastSentAt", limit(inputThink.optString("lastSentAt", ""), 40))
                .put("lastActionStatus", status)
                .put("lastActionAt", limit(inputThink.optString("lastActionAt", ""), 40));
            return new JSONObject()
                .put("schemaVersion", SCHEMA_VERSION)
                .put("ownerHash", ownerHash)
                .put("updatedAt", limit(input.optString("updatedAt", ""), 40))
                .put("modules", new JSONObject().put("think", think));
        } catch (Exception ignored) {
            return null;
        }
    }

    private static boolean validOwner(String value) {
        return value != null && OWNER_HASH.matcher(value).matches();
    }

    private static String limit(String value, int max) {
        if (value == null) return "";
        return value.length() <= max ? value : value.substring(0, max);
    }

    private String readOwner() {
        return readAtomic(ownerFile).trim();
    }

    private static String readAtomic(AtomicFile file) {
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

    private static boolean writeAtomic(AtomicFile file, String value) {
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
