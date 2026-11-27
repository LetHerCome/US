package com.usapp.widget;

import android.content.Context;
import java.util.Map;
import org.json.JSONObject;

/**
 * Widget signals (founder, 27/11/2026): the other person changed colour,
 * shape or outfit, or left the couple, while US was closed. The server sends
 * a silent FCM v3 packet (native-push-transport.mjs widgetSignal); the app's
 * messaging service checks the installation and calls apply() under the
 * owner gate's lock. Nothing else in the packet: no name, photo or text.
 *
 *  - "look": shape, head, face and two colours, validated again here by
 *    UsWidgetContract.character, written into this account's snapshot;
 *  - "clear": the same cleanup as logout (credential, snapshot, photos,
 *    portraits), so the widgets forget the partner's name, photo and Come stai.
 */
public final class UsWidgetSignals {
    private UsWidgetSignals() {}

    /** True when the widget state changed and the widgets should be redrawn. */
    public static boolean apply(Context context, Map<String, String> data) {
        if (context == null || data == null) return false;
        final Context app = context.getApplicationContext();
        final String signal = data.get("s");
        if ("clear".equals(signal)) {
            new UsWidgetCredentialStore(app).clear();
            new UsWidgetStore(app).clearAll();
            return true;
        }
        if (!"look".equals(signal)) return false;
        try {
            final JSONObject look = new JSONObject();
            for (String key : new String[] { "shape", "head", "face", "color", "day" }) {
                final String value = data.get(key);
                look.put(key, value == null ? "" : value);
            }
            return new UsWidgetStore(app).writePartnerLook(look);
        } catch (Exception ignored) {
            return false;
        }
    }

    public static void refresh(Context context) {
        UsWidgets.refreshAll(context);
    }
}
