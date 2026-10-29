package com.usapp.appicon;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Premi Sintonia V2 (29/10/2026): the app icon is a reward the couple picks.
 * Each icon is a launcher activity-alias of the app (AndroidManifest.xml);
 * exactly one is enabled. The web layer sends an icon id from a closed list,
 * never a component name. The new one is enabled before the others are
 * disabled, so the app always has a launcher entry.
 */
@CapacitorPlugin(name = "UsAppIcon")
public class UsAppIconPlugin extends Plugin {
    /** The app's namespace: the alias classes do not change with the staging applicationId. */
    static final String NAMESPACE = "com.usapp.us";
    static final String[] IDS = { "us", "night", "gold", "neon" };
    static final String[] ALIASES = { ".MainActivity", ".LauncherNight", ".LauncherGold", ".LauncherNeon" };

    static int indexOf(String icon) {
        if (icon == null) return -1;
        for (int i = 0; i < IDS.length; i++) if (IDS[i].equals(icon)) return i;
        return -1;
    }

    private static ComponentName component(Context context, int i) {
        return new ComponentName(context.getPackageName(), NAMESPACE + ALIASES[i]);
    }

    private static boolean enabled(PackageManager pm, ComponentName name, boolean byDefault) {
        int state = pm.getComponentEnabledSetting(name);
        if (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) return byDefault;
        return state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED;
    }

    @PluginMethod
    public void get(PluginCall call) {
        Context context = getContext();
        PackageManager pm = context.getPackageManager();
        String current = IDS[0];
        for (int i = 0; i < IDS.length; i++) {
            if (enabled(pm, component(context, i), i == 0)) { current = IDS[i]; break; }
        }
        call.resolve(new JSObject().put("icon", current));
    }

    @PluginMethod
    public void set(PluginCall call) {
        int chosen = indexOf(call.getString("icon", ""));
        if (chosen < 0) {
            call.resolve(new JSObject().put("applied", false));
            return;
        }
        Context context = getContext();
        PackageManager pm = context.getPackageManager();
        try {
            pm.setComponentEnabledSetting(component(context, chosen), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
            for (int i = 0; i < IDS.length; i++) {
                if (i == chosen) continue;
                pm.setComponentEnabledSetting(component(context, i), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
            }
            call.resolve(new JSObject().put("applied", true).put("icon", IDS[chosen]));
        } catch (RuntimeException error) {
            call.resolve(new JSObject().put("applied", false));
        }
    }
}
