package com.usapp.pushsupport;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Device-local notification ownership gate. No account identity is ever put
 * into the FCM payload; each server row has a random installation UUID.
 *
 * SharedPreferences live in MODE_PRIVATE with app allowBackup=false. Clearing
 * rotates the epoch atomically, making delayed register responses fail closed.
 * The gate accepts bindings only AFTER the client successfully calls its
 * authenticated register_native_push_device RPC.
 */
public final class UsPushOwnerGate {
    private static final String STORE = "us_private_push_owner_v2";
    private static final String OWNER = "owner";
    private static final String INSTALLATION = "installation";
    private static final String EPOCH = "epoch";
    private static final Object LOCK = new Object();
    private static final Pattern UUID_PATTERN = Pattern.compile(
        "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
    );

    private UsPushOwnerGate() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(STORE, Context.MODE_PRIVATE);
    }

    public static boolean validUuid(String value) {
        return value != null && UUID_PATTERN.matcher(value).matches();
    }

    public static String epoch(Context context) {
        synchronized (LOCK) {
            final SharedPreferences store = prefs(context);
            String value = store.getString(EPOCH, null);
            if (validUuid(value)) return value;
            value = UUID.randomUUID().toString();
            if (!store.edit().remove(OWNER).remove(INSTALLATION).putString(EPOCH, value).commit()) return "";
            return value;
        }
    }

    public static boolean bind(Context context, String owner, String installation, String expectedEpoch) {
        synchronized (LOCK) {
            if (!validUuid(owner) || !validUuid(installation) || !validUuid(expectedEpoch)) return false;
            final SharedPreferences store = prefs(context);
            if (!expectedEpoch.equals(store.getString(EPOCH, null))) return false;
            return store.edit().putString(OWNER, owner.toLowerCase(java.util.Locale.ROOT))
                .putString(INSTALLATION, installation.toLowerCase(java.util.Locale.ROOT)).commit();
        }
    }

    public static boolean clear(Context context) {
        synchronized (LOCK) {
            return prefs(context).edit().remove(OWNER).remove(INSTALLATION)
                .putString(EPOCH, UUID.randomUUID().toString()).commit();
        }
    }

    /** Never accepts a message for the prior account after a local owner change. */
    public static boolean accepts(Context context, String installation) {
        synchronized (LOCK) {
            if (!validUuid(installation)) return false;
            final SharedPreferences store = prefs(context);
            return validUuid(store.getString(OWNER, null))
                && installation.equalsIgnoreCase(store.getString(INSTALLATION, ""));
        }
    }
}
