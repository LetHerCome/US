package com.usapp.splash;

import android.app.Activity;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 18/10/2026: the launch splash takes the colour of the app theme ("Atmosfera").
 * Android 13+ remembers the splash theme an app sets for its next cold start
 * (SplashScreen.setSplashScreenTheme); older versions keep the default colour.
 * The web layer sends a theme id from a closed list, never a resource name.
 */
@CapacitorPlugin(name = "UsSplashTheme")
public class UsSplashThemePlugin extends Plugin {
    static final String DEFAULT_STYLE = "AppTheme.NoActionBarLaunch";

    /** Theme id → style of the app (android/app/src/main/res/values*/styles.xml). */
    static String styleFor(String theme) {
        if (theme == null) return DEFAULT_STYLE;
        switch (theme) {
            case "rose": return DEFAULT_STYLE + ".Rose";
            case "midnight": return DEFAULT_STYLE + ".Midnight";
            case "film": return DEFAULT_STYLE + ".Film";
            case "blue_hour": return DEFAULT_STYLE + ".BlueHour";
            case "graphite": return DEFAULT_STYLE + ".Graphite";
            default: return DEFAULT_STYLE;
        }
    }

    @PluginMethod
    public void set(PluginCall call) {
        Activity activity = getActivity();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || activity == null) {
            call.resolve(new JSObject().put("applied", false));
            return;
        }
        String name = styleFor(call.getString("theme", "")).replace('.', '_');
        int style = activity.getResources().getIdentifier(name, "style", activity.getPackageName());
        if (style == 0) {
            call.resolve(new JSObject().put("applied", false));
            return;
        }
        activity.runOnUiThread(() -> {
            boolean applied;
            try {
                activity.getSplashScreen().setSplashScreenTheme(style);
                applied = true;
            } catch (RuntimeException error) {
                applied = false;
            }
            call.resolve(new JSObject().put("applied", applied));
        });
    }
}
