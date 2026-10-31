package com.usapp.widget;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Widget «Nota»: the Edge widget-note, only after a tap (tick, the writing
 * window, «Salva»). The note credential travels in the header; the address
 * is the one the app gave, re-checked against the two US projects. Never a
 * Supabase session, never a retry loop, nothing logged.
 */
final class UsWidgetNoteClient {
    static final int UNAUTHORIZED = 401;
    static final int NOT_FOUND = 404;
    static final int FAILED = 0;
    private static final int TIMEOUT_MS = 6000;

    static final class Result {
        final int status;
        /** The note as the server now has it (UsNoteModels.normalizeNote), or null. */
        final JSONObject note;
        Result(int status, JSONObject note) { this.status = status; this.note = note; }
        boolean ok() { return note != null; }
    }

    Result call(String functionsBase, String token, JSONObject request) {
        String base = UsWidgetEndpoints.functionsBase(functionsBase);
        if (base.isEmpty() || token == null || token.isEmpty()) return new Result(UNAUTHORIZED, null);
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(base + "/widget-note").openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);
            connection.setUseCaches(false);
            connection.setInstanceFollowRedirects(false);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("X-US-Widget-Token", token);
            byte[] payload = request.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(payload.length);
            try (OutputStream output = connection.getOutputStream()) { output.write(payload); }
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) return new Result(status, null);
            JSONObject body = new JSONObject(read(connection.getInputStream()));
            return new Result(status, UsNoteModels.normalizeNote(body.optJSONObject("note")));
        } catch (Exception ignored) {
            return new Result(FAILED, null);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static String read(InputStream input) throws Exception {
        if (input == null) return "";
        try (InputStream source = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[2048];
            int count;
            while ((count = source.read(buffer)) != -1 && output.size() < 65_536) output.write(buffer, 0, count);
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }
}
