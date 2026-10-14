package com.usapp.us;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

/**
 * The WebView paints behind the system bars; Capacitor owns CSS safe insets.
 * Location is approximate only (see UsCoarseLocationChromeClient).
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Approximate location only: answer the WebView prompt with COARSE.
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().setWebChromeClient(new UsCoarseLocationChromeClient(bridge));
        }
        // Capacitor 8 does not enable edge-to-edge automatically on older
        // Android versions. Never hide clock, notifications or gesture bar.
        EdgeToEdge.enable(this);
    }
}
