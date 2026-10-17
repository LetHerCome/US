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
    /** The other person's display name for this owner's notices (16/10/2026). */
    private static final String PARTNER = "partner";
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
            if (!store.edit().remove(OWNER).remove(INSTALLATION).remove(PARTNER).putString(EPOCH, value).commit()) return "";
            return value;
        }
    }

    public static boolean bind(Context context, String owner, String installation, String expectedEpoch) {
        synchronized (LOCK) {
            if (!validUuid(owner) || !validUuid(installation) || !validUuid(expectedEpoch)) return false;
            final SharedPreferences store = prefs(context);
            if (!expectedEpoch.equals(store.getString(EPOCH, null))) return false;
            final String next = owner.toLowerCase(java.util.Locale.ROOT);
            final SharedPreferences.Editor edit = store.edit();
            // A name belongs to one owner: binding another account drops it.
            if (!next.equals(store.getString(OWNER, null))) edit.remove(PARTNER);
            return edit.putString(OWNER, next)
                .putString(INSTALLATION, installation.toLowerCase(java.util.Locale.ROOT)).commit();
        }
    }

    public static boolean clear(Context context) {
        synchronized (LOCK) {
            return prefs(context).edit().remove(OWNER).remove(INSTALLATION).remove(PARTNER)
                .putString(EPOCH, UUID.randomUUID().toString()).commit();
        }
    }

    private static boolean isCurrent(Context context, String installation) {
        if (!validUuid(installation)) return false;
        final SharedPreferences store = prefs(context);
        return validUuid(store.getString(OWNER, null))
            && installation.equalsIgnoreCase(store.getString(INSTALLATION, ""));
    }

    /** Atomic read for safe shutdown; do not delete a provider token with an active local owner. */
    public static boolean hasOwner(Context context) {
        synchronized (LOCK) {
            final SharedPreferences store = prefs(context);
            return validUuid(store.getString(OWNER, null));
        }
    }

    /**
     * Stores the other person's name for notices, only for the account that
     * currently owns the gate (a late call from a previous account is ignored).
     * Empty or invalid: the name is removed and notices say "La tua persona".
     */
    public static boolean setPartnerName(Context context, String owner, String partnerName) {
        synchronized (LOCK) {
            if (!validUuid(owner)) return false;
            final SharedPreferences store = prefs(context);
            if (!owner.toLowerCase(java.util.Locale.ROOT).equals(store.getString(OWNER, null))) return false;
            final String name = UsPushNotices.cleanName(partnerName);
            final SharedPreferences.Editor edit = store.edit();
            if (name.isEmpty()) edit.remove(PARTNER); else edit.putString(PARTNER, name);
            return edit.commit();
        }
    }

    public interface NoticePost { void post(String partnerName); }

    /**
     * Same critical section as postIfCurrent, and the partner name is read
     * inside it: a notice can never show the name of another account.
     */
    public static boolean postIfCurrent(Context context, String installation, NoticePost post) {
        synchronized (LOCK) {
            if (!isCurrent(context, installation) || post == null) return false;
            post.post(prefs(context).getString(PARTNER, ""));
            return true;
        }
    }

    /** Read-only early rejection; never use as the only pre-notify check. */
    public static boolean accepts(Context context, String installation) {
        synchronized (LOCK) { return isCurrent(context, installation); }
    }

    /**
     * Critical section: owner check and NotificationManager.notify() run
     * under the SAME lock as clear() and bind(). No A notify can interleave
     * between B account's retirement commit and the subsequent cancelAll().
     */
    public static boolean postIfCurrent(Context context, String installation, Runnable post) {
        synchronized (LOCK) {
            if (!isCurrent(context, installation) || post == null) return false;
            post.run();
            return true;
        }
    }
}
