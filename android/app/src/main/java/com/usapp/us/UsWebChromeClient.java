package com.usapp.us;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.MediaStore;
import android.webkit.GeolocationPermissions;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;
import java.util.Arrays;

/**
 * Capacitor's WebChromeClient with two US changes.
 *
 * Location: US asks only for approximate location (ACCESS_COARSE_LOCATION).
 * Capacitor's default client requests FINE and COARSE together and, on
 * Android 8 to 11, refuses the WebView geolocation unless both are granted.
 * With FINE no longer in the manifest that would break the distance on those
 * versions, so the web prompt is answered with COARSE alone.
 *
 * Video: «Fai un video» in "Lasciato per te" (an input with accept video/*
 * and capture) opens the camera app with the composer's limits, 30 seconds
 * and a little under 20 MB, so a recording fits instead of being refused
 * afterwards. Camera apps that ignore the limits still get the composer's
 * message. Photos and every other picker stay Capacitor's.
 */
public final class UsWebChromeClient extends BridgeWebChromeClient {

    private static final int VIDEO_MAX_SECONDS = 30;
    private static final long VIDEO_MAX_BYTES = 19L * 1024 * 1024;

    private final Bridge bridge;
    private final ActivityResultLauncher<String> coarseLauncher;
    private final ActivityResultLauncher<String> cameraLauncher;
    private final ActivityResultLauncher<Intent> videoLauncher;
    private GeolocationPermissions.Callback pendingCallback;
    private String pendingOrigin;
    private ValueCallback<Uri[]> pendingVideo;

    public UsWebChromeClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
        this.coarseLauncher = bridge.registerForActivityResult(
            new ActivityResultContracts.RequestPermission(),
            this::onCoarseResult
        );
        this.cameraLauncher = bridge.registerForActivityResult(
            new ActivityResultContracts.RequestPermission(),
            this::onCameraResult
        );
        this.videoLauncher = bridge.registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            this::onVideoResult
        );
    }

    @Override
    public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
        if (hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)) {
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
            callback.invoke(origin, Boolean.TRUE.equals(granted) && hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION), false);
        }
    }

    @Override
    public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
        boolean recordVideo = params.isCaptureEnabled() && Arrays.asList(params.getAcceptTypes()).contains("video/*");
        if (!recordVideo || videoIntent().resolveActivity(bridge.getActivity().getPackageManager()) == null) {
            return super.onShowFileChooser(webView, callback, params);
        }
        finishVideo(null);
        pendingVideo = callback;
        // CAMERA is in the manifest, so the camera app may only be started once it is granted.
        if (hasPermission(Manifest.permission.CAMERA)) {
            videoLauncher.launch(videoIntent());
        } else {
            cameraLauncher.launch(Manifest.permission.CAMERA);
        }
        return true;
    }

    private static Intent videoIntent() {
        Intent intent = new Intent(MediaStore.ACTION_VIDEO_CAPTURE);
        intent.putExtra(MediaStore.EXTRA_DURATION_LIMIT, VIDEO_MAX_SECONDS);
        intent.putExtra(MediaStore.EXTRA_SIZE_LIMIT, VIDEO_MAX_BYTES);
        return intent;
    }

    private void onCameraResult(Boolean granted) {
        if (Boolean.TRUE.equals(granted) && pendingVideo != null) {
            videoLauncher.launch(videoIntent());
        } else {
            finishVideo(null);
        }
    }

    private void onVideoResult(ActivityResult result) {
        Intent data = result.getData();
        Uri video = result.getResultCode() == Activity.RESULT_OK && data != null ? data.getData() : null;
        finishVideo(video == null ? null : new Uri[] { video });
    }

    private void finishVideo(Uri[] result) {
        ValueCallback<Uri[]> callback = pendingVideo;
        pendingVideo = null;
        if (callback != null) {
            callback.onReceiveValue(result);
        }
    }

    private boolean hasPermission(String permission) {
        return ContextCompat.checkSelfPermission(bridge.getContext(), permission) == PackageManager.PERMISSION_GRANTED;
    }
}
