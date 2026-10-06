package com.usapp.widget;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * The only network call a widget makes: "Ti penso" with the device-scoped
 * widget credential (never a Supabase session). The server deduplicates on
 * (credential, actionId), so repeating the same actionId cannot send twice.
 */
final class UsWidgetActionClient {
    static final String SENT = "sent";
    static final String FAILED = "failed";
    static final String UNAUTHORIZED = "unauthorized";
    static final String RATE_LIMITED = "rate_limited";
    private static final String ENDPOINT = "https://iiakdfsxpywdkxravqjh.supabase.co/functions/v1/widget-think-send";
    private static final int TIMEOUT_MS = 4000;

    String send(String token, String actionId) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(ENDPOINT).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);
            connection.setUseCaches(false);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("X-US-Widget-Token", token);
            byte[] payload = new JSONObject().put("actionId", actionId).toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(payload.length);
            try (OutputStream output = connection.getOutputStream()) { output.write(payload); }
            int status = connection.getResponseCode();
            if (status == 401 || status == 403) return UNAUTHORIZED;
            if (status == 429) return RATE_LIMITED;
            InputStream input = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
            String response = read(input);
            return status >= 200 && status < 300 && new JSONObject(response).optBoolean("sent", false) ? SENT : FAILED;
        } catch (Exception ignored) {
            return FAILED;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static String read(InputStream input) throws Exception {
        if (input == null) return "";
        try (InputStream source = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[1024];
            int count;
            while ((count = source.read(buffer)) != -1 && output.size() < 16_384) output.write(buffer, 0, count);
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }
}
