package com.usapp.pushsupport;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

/**
 * US Native Notifications V1 — the native pieces the official
 * @capacitor/push-notifications plugin does not provide (Android):
 *
 *  - getStatus: is Firebase configured in this build (google-services.json),
 *    are notifications enabled for US, is either channel blocked;
 *  - the two US channels, created at startup (idempotent; the OS keeps the
 *    user's per-channel choices);
 *  - openSettings: the system notification settings of US.
 *
 * It never sees a push token, a payload or a Supabase credential.
 */
@CapacitorPlugin(name = "UsPushSupport")
public class UsPushSupportPlugin extends Plugin {

    @Override
    public void load() {
        createChannels();
    }

    private NotificationManager manager() {
        return (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
    }

    private void createChannels() {
        NotificationManager manager = manager();
        if (manager == null) return;
        for (UsPushChannels.Channel spec : UsPushChannels.ALL) {
            NotificationChannel channel = new NotificationChannel(spec.id, spec.name, spec.importance);
            channel.setDescription(spec.description);
            channel.setShowBadge(true);
            manager.createNotificationChannel(channel);
        }
    }

    private boolean firebaseConfigured() {
        Context context = getContext();
        int id = context.getResources().getIdentifier("google_app_id", "string", context.getPackageName());
        String value = null;
        if (id != 0) {
            try { value = context.getString(id); } catch (RuntimeException ignored) { value = null; }
        }
        return UsPushChannels.firebaseConfigured(id, value);
    }

    private boolean channelBlocked(NotificationManager manager, String id) {
        NotificationChannel channel = manager.getNotificationChannel(id);
        return channel != null && channel.getImportance() == NotificationManager.IMPORTANCE_NONE;
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        NotificationManager manager = manager();
        JSObject result = new JSObject();
        result.put("platform", "android");
        result.put("provider", "fcm");
        result.put("bindingEpoch", UsPushOwnerGate.epoch(getContext()));
        result.put("configured", firebaseConfigured());
        result.put("environment", JSONObject.NULL);
        result.put("notificationsEnabled", manager != null && manager.areNotificationsEnabled());
        result.put("partnerBlocked", manager != null && channelBlocked(manager, UsPushChannels.PARTNER));
        result.put("remindersBlocked", manager != null && channelBlocked(manager, UsPushChannels.REMINDERS));
        call.resolve(result);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve(new JSObject().put("opened", true));
        } catch (RuntimeException error) {
            call.resolve(new JSObject().put("opened", false));
        }
    }

    /**
     * Called only after authenticated registration RPC succeeds, with the
     * epoch observed before registration. Logout invalidates this epoch, so
     * a late completion from A cannot re-activate A under B.
     */
    @PluginMethod
    public void bindPushOwner(PluginCall call) {
        final boolean bound = UsPushOwnerGate.bind(
            getContext(),
            call.getString("ownerId"),
            call.getString("installationId"),
            call.getString("expectedEpoch")
        );
        call.resolve(new JSObject().put("bound", bound));
    }

    /**
     * Synchronous SharedPreferences commit before resolving to JS.
     * All app notifications are canceled as defense in depth.
     */
    @PluginMethod
    public void clearPushOwner(PluginCall call) {
        final boolean cleared = UsPushOwnerGate.clear(getContext());
        if (cleared) {
            NotificationManager manager = manager();
            if (manager != null) manager.cancelAll();
        }
        call.resolve(new JSObject().put("cleared", cleared));
    }

    /** Android shows badges from delivered notifications; the web layer clears those. */
    @PluginMethod
    public void setBadge(PluginCall call) {
        call.resolve(new JSObject().put("supported", false));
    }
}
