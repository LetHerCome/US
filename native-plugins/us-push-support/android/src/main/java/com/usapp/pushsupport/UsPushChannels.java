package com.usapp.pushsupport;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * US Native Notifications V1 — the two Android notification channels.
 *
 * Pure Java (no Android types) so the table is tested on the JVM. The ids are
 * part of the server contract (native-push-transport.mjs ANDROID_CHANNELS):
 * changing one orphans the user's per-channel OS settings.
 */
public final class UsPushChannels {
    public static final String PARTNER = "us_partner";
    public static final String REMINDERS = "us_reminders";

    /** Importance values mirror android.app.NotificationManager (HIGH = 4, DEFAULT = 3). */
    public static final int IMPORTANCE_HIGH = 4;
    public static final int IMPORTANCE_DEFAULT = 3;

    public static final class Channel {
        public final String id;
        public final String name;
        public final String description;
        public final int importance;

        Channel(String id, String name, String description, int importance) {
            this.id = id;
            this.name = name;
            this.description = description;
            this.importance = importance;
        }
    }

    public static final List<Channel> ALL = Collections.unmodifiableList(Arrays.asList(
        new Channel(PARTNER, "Dalla tua persona", "Ti penso, Lasciato per te, risposte, quest e giochi.", IMPORTANCE_HIGH),
        new Channel(REMINDERS, "Promemoria", "Domanda del giorno, calendario e ricorrenze.", IMPORTANCE_DEFAULT)
    ));

    /**
     * Firebase is usable only when the Google Services plugin generated its
     * resources from android/app/google-services.json (google_app_id). Without
     * it FirebaseMessaging must never be touched: it would throw.
     */
    public static boolean firebaseConfigured(int googleAppIdResource, String googleAppId) {
        return googleAppIdResource != 0 && googleAppId != null && googleAppId.trim().matches("^\\d+:\\d+:android:[0-9a-f]+$");
    }

    private UsPushChannels() {}
}
