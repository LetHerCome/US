package com.usapp.us;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

/**
 * The WebView paints behind the system bars; Capacitor owns CSS safe insets.
 * Location is approximate only and «Fai un video» has its limits (see UsWebChromeClient).
 * Launched through the activity-alias entries of AndroidManifest.xml: the
 * default one keeps the old name .MainActivity, so the icon a phone already
 * has on its home screen survives the update (app icons, 29/10/2026).
 */
public class UsActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Approximate location only, and the video limits of Lasciato per te.
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().setWebChromeClient(new UsWebChromeClient(bridge));
        }
        // Capacitor 8 does not enable edge-to-edge automatically on older
        // Android versions. Never hide clock, notifications or gesture bar.
        EdgeToEdge.enable(this);
    }
}
