package com.usapp.widget;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "UsWidgetBridge")
public class UsWidgetBridgePlugin extends Plugin {
    private UsWidgetSnapshotStore store;
    private UsWidgetCredentialStore credentials;

    @Override
    public void load() {
        store = new UsWidgetSnapshotStore(getContext());
        credentials = new UsWidgetCredentialStore(getContext());
    }

    @PluginMethod
    public void activateAccount(PluginCall call) {
        String ownerHash = call.getString("ownerHash", "");
        credentials.clearForOwnerChange(ownerHash);
        if (!store.activateAccount(ownerHash)) {
            call.reject("Invalid widget account");
            return;
        }
        refreshWidgets();
        call.resolve();
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
        if (!credentials.write(call.getString("ownerHash", ""), call.getString("token", ""))) {
            call.reject("Invalid widget action credential");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void clearActionCredential(PluginCall call) {
        credentials.clear();
        call.resolve();
    }

    @PluginMethod
    public void writeSnapshot(PluginCall call) {
        JSObject snapshot = call.getObject("snapshot");
        if (snapshot == null || !store.write(snapshot)) {
            call.reject("Invalid widget snapshot");
            return;
        }
        refreshWidgets();
        call.resolve();
    }

    @PluginMethod
    public void clearSnapshot(PluginCall call) {
        store.clear();
        refreshWidgets();
        call.resolve();
    }

    @PluginMethod
    public void pinCountdownWidget(PluginCall call) {
        JSObject result = new JSObject();
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.O) {
            call.resolve(result.put("supported", false).put("requested", false));
            return;
        }
        AppWidgetManager manager = AppWidgetManager.getInstance(getContext());
        if (!manager.isRequestPinAppWidgetSupported()) {
            call.resolve(result.put("supported", false).put("requested", false));
            return;
        }
        try {
            ComponentName provider = new ComponentName(getContext(), UsCountdownWidgetProvider.class);
            boolean requested = manager.requestPinAppWidget(provider, null, null);
            call.resolve(result.put("supported", true).put("requested", requested));
        } catch (IllegalStateException error) {
            call.resolve(result.put("supported", true).put("requested", false));
        }
    }

    private void refreshWidgets() {
        AppWidgetManager manager = AppWidgetManager.getInstance(getContext());
        ComponentName thinkComponent = new ComponentName(getContext(), UsThinkWidgetProvider.class);
        UsThinkWidgetProvider.updateAll(getContext(), manager, manager.getAppWidgetIds(thinkComponent));
        ComponentName countdownComponent = new ComponentName(getContext(), UsCountdownWidgetProvider.class);
        UsCountdownWidgetProvider.updateAll(getContext(), manager, manager.getAppWidgetIds(countdownComponent));
    }
}
