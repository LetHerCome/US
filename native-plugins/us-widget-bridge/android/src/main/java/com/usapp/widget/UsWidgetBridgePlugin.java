package com.usapp.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.lang.ref.WeakReference;
import java.util.Locale;

/**
 * The only door between the US WebView and the widgets. It accepts semantic
 * state, a device-scoped send credential and a downscaled private photo.
 * It never accepts or returns a Supabase session, URL or raw account id.
 */
@CapacitorPlugin(name = "UsWidgetBridge")
public class UsWidgetBridgePlugin extends Plugin {
    private static WeakReference<UsWidgetBridgePlugin> active = new WeakReference<>(null);
    private UsWidgetStore store;
    private UsWidgetCredentialStore credentials;

    @Override
    public void load() {
        store = new UsWidgetStore(getContext());
        credentials = new UsWidgetCredentialStore(getContext());
        active = new WeakReference<>(this);
    }

    static void notifyPinned(String kind, boolean placed) {
        UsWidgetBridgePlugin plugin = active.get();
        if (plugin == null) return;
        plugin.notifyListeners("widgetPinned", new JSObject().put("kind", kind).put("placed", placed));
    }

    @PluginMethod
    public void activateAccount(PluginCall call) {
        String ownerHash = call.getString("ownerHash", "");
        credentials.clearForOwnerChange(ownerHash);
        if (!store.activateAccount(ownerHash)) {
            call.reject("Invalid widget account");
            return;
        }
        UsWidgets.refreshAll(getContext());
        call.resolve(new JSObject().put("credential", credentials.status(ownerHash)));
    }

    @PluginMethod
    public void getDeviceIdentity(PluginCall call) {
        String deviceId = credentials.deviceId();
        if (deviceId.isEmpty()) {
            call.reject("Widget device identity unavailable");
            return;
        }
        call.resolve(new JSObject().put("deviceId", deviceId));
    }

    @PluginMethod
    public void setActionCredential(PluginCall call) {
        String ownerHash = call.getString("ownerHash", "");
        if (!ownerHash.equals(store.owner()) || !credentials.write(ownerHash, call.getString("token", ""), call.getString("expiresAt", ""))) {
            call.reject("Invalid widget action credential");
            return;
        }
        UsWidgets.refreshAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void clearActionCredential(PluginCall call) {
        credentials.clear();
        UsWidgets.refreshAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void writeSnapshot(PluginCall call) {
        JSObject snapshot = call.getObject("snapshot");
        if (snapshot == null || !store.write(snapshot)) {
            call.reject("Invalid widget snapshot");
            return;
        }
        UsWidgets.refreshAll(getContext());
        call.resolve(new JSObject().put("photoKey", store.photoKey()));
    }

    /**
     * The last semantic state of the active account, so a fresh WebView starts
     * from what the widgets show instead of overwriting them with blanks.
     */
    @PluginMethod
    public void readSnapshot(PluginCall call) {
        JSObject result = new JSObject().put("photoKey", store.photoKey());
        org.json.JSONObject snapshot = store.read();
        if (snapshot != null) {
            try { result.put("snapshot", JSObject.fromJSONObject(snapshot)); }
            catch (Exception ignored) {}
        }
        call.resolve(result);
    }

    @PluginMethod
    public void writePhoto(PluginCall call) {
        String ownerHash = call.getString("ownerHash", "");
        String key = call.getString("key", "");
        String data = call.getString("data", "");
        byte[] bytes;
        try { bytes = data.length() > UsWidgetStore.MAX_PHOTO_BYTES * 2 ? null : Base64.decode(data, Base64.DEFAULT); }
        catch (IllegalArgumentException ignored) { bytes = null; }
        if (!store.writePhoto(ownerHash, key, bytes)) {
            call.reject("Invalid widget photo");
            return;
        }
        UsWidgets.refreshAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void writeNoiPortrait(PluginCall call) {
        String ownerHash = call.getString("ownerHash", "");
        String data = call.getString("data", "");
        byte[] bytes;
        try { bytes = data.length() > UsWidgetStore.MAX_PHOTO_BYTES * 2 ? null : Base64.decode(data, Base64.DEFAULT); }
        catch (IllegalArgumentException ignored) { bytes = null; }
        if (!store.writeNoiPortrait(ownerHash, bytes)) {
            call.reject("Invalid Noi portrait");
            return;
        }
        UsWidgets.refreshAll(getContext());
        call.resolve();
    }

    /** Logout: semantic state, action state, cached photo and credential all go. */
    @PluginMethod
    public void clearAll(PluginCall call) {
        credentials.clear();
        store.clearAll();
        UsWidgets.refreshAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void clearSnapshot(PluginCall call) {
        clearAll(call);
    }

    @PluginMethod
    public void getInstalledWidgets(PluginCall call) {
        JSObject counts = new JSObject();
        for (String kind : UsWidgets.KINDS) counts.put(kind, UsWidgets.ids(getContext(), kind).length);
        AppWidgetManager manager = AppWidgetManager.getInstance(getContext());
        call.resolve(new JSObject()
            .put("installed", counts)
            .put("pinSupported", manager.isRequestPinAppWidgetSupported())
            .put("vendor", vendor()));
    }

    @PluginMethod
    public void requestPin(PluginCall call) {
        String kind = call.getString("kind", "");
        JSObject result = new JSObject().put("kind", kind);
        if (!UsWidgets.validKind(kind)) {
            call.reject("Unknown widget");
            return;
        }
        AppWidgetManager manager = AppWidgetManager.getInstance(getContext());
        if (!manager.isRequestPinAppWidgetSupported()) {
            call.resolve(result.put("supported", false).put("requested", false));
            return;
        }
        // Mutable: the launcher adds EXTRA_APPWIDGET_ID when the widget is placed.
        Intent placed = new Intent(getContext(), UsWidgetSystemReceiver.class)
            .setAction(UsWidgets.ACTION_PINNED)
            .putExtra(UsWidgets.EXTRA_KIND, kind);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0);
        PendingIntent callback = PendingIntent.getBroadcast(getContext(), 4600 + indexOf(kind), placed, flags);
        try {
            boolean requested = manager.requestPinAppWidget(new ComponentName(getContext(), UsWidgets.providerFor(kind)), null, callback);
            call.resolve(result.put("supported", true).put("requested", requested));
        } catch (RuntimeException error) {
            call.resolve(result.put("supported", true).put("requested", false));
        }
    }

    /** Opens the screen where Home-screen shortcut/widget permission lives (Xiaomi first). */
    @PluginMethod
    public void openWidgetSettings(PluginCall call) {
        String pkg = getContext().getPackageName();
        if (vendor().equals("xiaomi")) {
            Intent miui = new Intent("miui.intent.action.APP_PERM_EDITOR")
                .putExtra("extra_pkgname", pkg)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (tryStart(miui)) { call.resolve(new JSObject().put("opened", "vendor")); return; }
        }
        Intent details = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        call.resolve(new JSObject().put("opened", tryStart(details) ? "app" : "none"));
    }

    private boolean tryStart(Intent intent) {
        // No resolveActivity(): package visibility hides vendor screens. Starting
        // and catching is the reliable probe (not found / not exported).
        try {
            getContext().startActivity(intent);
            return true;
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private static int indexOf(String kind) {
        for (int i = 0; i < UsWidgets.KINDS.length; i++) if (UsWidgets.KINDS[i].equals(kind)) return i;
        return 0;
    }

    static String vendor() {
        String brand = (Build.MANUFACTURER + " " + Build.BRAND).toLowerCase(Locale.ROOT);
        if (brand.contains("xiaomi") || brand.contains("redmi") || brand.contains("poco")) return "xiaomi";
        if (brand.contains("samsung")) return "samsung";
        return "android";
    }
}
