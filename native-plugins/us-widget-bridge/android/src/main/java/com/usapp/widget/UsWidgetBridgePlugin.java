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

    @Override
    public void load() {
        store = new UsWidgetSnapshotStore(getContext());
    }

    @PluginMethod
    public void activateAccount(PluginCall call) {
        if (!store.activateAccount(call.getString("ownerHash", ""))) {
            call.reject("Invalid widget account");
            return;
        }
        refreshWidgets();
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

    private void refreshWidgets() {
        AppWidgetManager manager = AppWidgetManager.getInstance(getContext());
        ComponentName component = new ComponentName(getContext(), UsThinkWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(component);
        UsThinkWidgetProvider.updateAll(getContext(), manager, ids);
    }
}
