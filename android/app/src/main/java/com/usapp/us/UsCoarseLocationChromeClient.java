package com.usapp.us;

import android.Manifest;
import android.content.pm.PackageManager;
import android.webkit.GeolocationPermissions;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * US asks only for approximate location (ACCESS_COARSE_LOCATION).
 *
 * Capacitor's default client requests FINE and COARSE together and, on
 * Android 8 to 11, refuses the WebView geolocation unless both are granted.
 * With FINE no longer in the manifest that would break the distance on those
 * versions, so the web prompt is answered with COARSE alone.
 */
public final class UsCoarseLocationChromeClient extends BridgeWebChromeClient {

    private final Bridge bridge;
    private final ActivityResultLauncher<String> coarseLauncher;
    private GeolocationPermissions.Callback pendingCallback;
    private String pendingOrigin;

    public UsCoarseLocationChromeClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
        this.coarseLauncher = bridge.registerForActivityResult(
            new ActivityResultContracts.RequestPermission(),
            this::onCoarseResult
        );
    }

    @Override
    public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
        if (hasCoarse()) {
            callback.invoke(origin, true, false);
            return;
        }
        if (pendingCallback != null) {
            pendingCallback.invoke(pendingOrigin, false, false);
        }
        pendingCallback = callback;
        pendingOrigin = origin;
        coarseLauncher.launch(Manifest.permission.ACCESS_COARSE_LOCATION);
    }

    private void onCoarseResult(Boolean granted) {
        GeolocationPermissions.Callback callback = pendingCallback;
        String origin = pendingOrigin;
        pendingCallback = null;
        pendingOrigin = null;
        if (callback != null) {
            callback.invoke(origin, Boolean.TRUE.equals(granted) && hasCoarse(), false);
        }
    }

    private boolean hasCoarse() {
        return ContextCompat.checkSelfPermission(bridge.getContext(), Manifest.permission.ACCESS_COARSE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
    }
}
