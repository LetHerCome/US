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
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;
import java.util.Arrays;
import java.util.List;

/**
 * Capacitor's WebChromeClient with three US changes.
 *
 * Location: US asks only for approximate location (ACCESS_COARSE_LOCATION).
 * Capacitor's default client requests FINE and COARSE together and, on
 * Android 8 to 11, refuses the WebView geolocation unless both are granted.
 * With FINE no longer in the manifest that would break the distance on those
 * versions, so the web prompt is answered with COARSE alone.
 *
 * Video: «Fai un video» in "Lasciato per te" records inside US where the
 * WebView can make an MP4 (getUserMedia, Capacitor's onPermissionRequest).
 * Older WebViews still use an input with accept video/* and capture: that
 * opens the camera app with the composer's limits, 30 seconds and a little
 * under 20 MB, so a recording fits instead of being refused afterwards.
 * Camera apps that ignore the limits still get the composer's message.
 *
 * Camera refused: «Scatta una foto» and the camera app for a video need the
 * CAMERA permission. When it is refused (also for good, "don't ask again")
 * the page gets a window event, uscamerapermissiondenied, and says where to
 * turn it back on instead of doing nothing. Every other picker stays Capacitor's.
 */
public final class UsWebChromeClient extends BridgeWebChromeClient {

    private static final int VIDEO_MAX_SECONDS = 30;
    private static final long VIDEO_MAX_BYTES = 19L * 1024 * 1024;
    static final String CAMERA_DENIED_EVENT = "uscamerapermissiondenied";

    private final Bridge bridge;
    private final ActivityResultLauncher<String> coarseLauncher;
    private final ActivityResultLauncher<String> cameraLauncher;
    private final ActivityResultLauncher<Intent> videoLauncher;
    private GeolocationPermissions.Callback pendingCallback;
    private String pendingOrigin;
    private ValueCallback<Uri[]> pendingVideo;
    private ValueCallback<Uri[]> pendingCapture;
    private Runnable pendingCaptureStart;

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
        List<String> accept = Arrays.asList(params.getAcceptTypes());
        boolean recordVideo = params.isCaptureEnabled() && Arrays.asList(params.getAcceptTypes()).contains("video/*")
            && videoIntent().resolveActivity(bridge.getActivity().getPackageManager()) != null;
        boolean takePhoto = !recordVideo && params.isCaptureEnabled() && accept.contains("image/*");
        if (!recordVideo && !takePhoto) {
            return super.onShowFileChooser(webView, callback, params);
        }
        Runnable start = recordVideo
            ? () -> startVideo(callback)
            : () -> super.onShowFileChooser(webView, callback, params);
        // CAMERA is in the manifest, so the camera app may only be started once it is granted.
        if (hasPermission(Manifest.permission.CAMERA)) {
            start.run();
            return true;
        }
        finishCapture(null);
        pendingCapture = callback;
        pendingCaptureStart = start;
        cameraLauncher.launch(Manifest.permission.CAMERA);
        return true;
    }

    private static Intent videoIntent() {
        Intent intent = new Intent(MediaStore.ACTION_VIDEO_CAPTURE);
        intent.putExtra(MediaStore.EXTRA_DURATION_LIMIT, VIDEO_MAX_SECONDS);
        intent.putExtra(MediaStore.EXTRA_SIZE_LIMIT, VIDEO_MAX_BYTES);
        return intent;
    }

    private void startVideo(ValueCallback<Uri[]> callback) {
        finishVideo(null);
        pendingVideo = callback;
        videoLauncher.launch(videoIntent());
    }

    private void onCameraResult(Boolean granted) {
        Runnable start = pendingCaptureStart;
        ValueCallback<Uri[]> callback = pendingCapture;
        pendingCapture = null;
        pendingCaptureStart = null;
        if (callback == null || start == null) {
            return;
        }
        if (Boolean.TRUE.equals(granted) && hasPermission(Manifest.permission.CAMERA)) {
            start.run();
            return;
        }
        callback.onReceiveValue(null);
        // No rationale after a refusal: Android will not ask again, only Settings can turn it on.
        boolean permanent = !ActivityCompat.shouldShowRequestPermissionRationale(bridge.getActivity(), Manifest.permission.CAMERA);
        bridge.triggerWindowJSEvent(CAMERA_DENIED_EVENT, "{ \"permanent\": " + permanent + " }");
    }

    private void finishCapture(Uri[] result) {
        ValueCallback<Uri[]> callback = pendingCapture;
        pendingCapture = null;
        pendingCaptureStart = null;
        if (callback != null) {
            callback.onReceiveValue(result);
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
