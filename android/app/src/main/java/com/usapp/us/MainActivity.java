package com.usapp.us;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

/** The WebView paints behind the system bars; Capacitor owns CSS safe insets. */
public class MainActivity extends BridgeActivity {
    // Process-local visibility only. FCM service runs in the same app process;
    // never show a new OS banner over the currently open US UI.
    private static volatile boolean resumedForPush = false;
    public static boolean isResumedForPush() { return resumedForPush; }

    @Override
    protected void onResume() {
        super.onResume();
        resumedForPush = true;
    }

    @Override
    protected void onPause() {
        resumedForPush = false;
        super.onPause();
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Capacitor 8 does not enable edge-to-edge automatically on older
        // Android versions. Never hide clock, notifications or gesture bar.
        EdgeToEdge.enable(this);
    }
}
