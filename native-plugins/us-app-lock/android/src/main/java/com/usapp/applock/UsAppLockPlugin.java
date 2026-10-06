package com.usapp.applock;

import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import javax.crypto.Cipher;

/**
 * US Native Security V1 — device-local biometric app lock (Android).
 *
 * The web app owns the lock screen; this plugin owns what must be native:
 * the strong-biometric prompt bound to a Keystore key, the protection record,
 * the lifecycle lock policy and a privacy cover over the WebView while US is
 * in the background. It never sees or stores Supabase credentials.
 */
@CapacitorPlugin(name = "UsAppLock")
public class UsAppLockPlugin extends Plugin {
    private static final int AUTHENTICATORS = BiometricManager.Authenticators.BIOMETRIC_STRONG;
    private static final int COVER_COLOR = Color.rgb(8, 4, 14); // #08040E, launch background
    private static final long COVER_SAFETY_MS = 1_500L;

    private final Handler main = new Handler(Looper.getMainLooper());
    private UsAppLockStore store;
    private volatile boolean locked = false;
    private volatile long backgroundedAt = -1L;
    private volatile boolean promptInFlight = false;
    private volatile boolean protectedOn = false;
    private View cover;

    @Override
    public void load() {
        store = new UsAppLockStore(getContext());
        // Cold start / process recreation: protected means locked.
        protectedOn = store.read() != null;
        locked = protectedOn;
        applyRecentsPolicy();
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(status());
    }

    @PluginMethod
    public void enable(PluginCall call) {
        String ownerHash = call.getString("ownerHash", "");
        if (!UsAppLockPolicy.isOwnerHash(ownerHash)) {
            reject(call, UsAppLockPolicy.ERR_INVALID_ARGUMENT);
            return;
        }
        String capability = capability();
        if (!"ok".equals(capability)) {
            reject(call, capabilityError(capability));
            return;
        }
        boolean hadRecord = store.read() != null;
        Cipher cipher;
        try {
            store.createBiometricKey();
            cipher = store.biometricCipher();
        } catch (Exception error) {
            if (!hadRecord) store.clear();
            reject(call, UsAppLockPolicy.ERR_UNAVAILABLE);
            return;
        }
        prompt(call, cipher, new Outcome() {
            @Override
            public void success() throws Exception {
                store.write(ownerHash, System.currentTimeMillis(), UsAppLockPolicy.STATE_OK);
                protectedOn = true;
                locked = false;
                applyRecentsPolicy();
                call.resolve(status());
            }

            @Override
            public void failure(String code) {
                if (!hadRecord) store.clear();
                reject(call, code);
            }
        });
    }

    @PluginMethod
    public void disable(PluginCall call) {
        UsAppLockPolicy.Config config = store.read();
        if (config == null) {
            call.resolve(status());
            return;
        }
        if (!UsAppLockPolicy.STATE_OK.equals(config.state)) {
            reject(call, UsAppLockPolicy.ERR_INVALIDATED);
            return;
        }
        if (!"ok".equals(capability())) {
            // Biometrics are gone from this phone: confirming is no longer
            // feasible, and the caller is already inside an unlocked session.
            clearProtection();
            call.resolve(status());
            return;
        }
        Cipher cipher = cipherOrInvalidate(call);
        if (cipher == null) return;
        prompt(call, cipher, new Outcome() {
            @Override
            public void success() {
                clearProtection();
                call.resolve(status());
            }

            @Override
            public void failure(String code) {
                reject(call, code);
            }
        });
    }

    @PluginMethod
    public void unlock(PluginCall call) {
        UsAppLockPolicy.Config config = store.read();
        if (config == null) {
            locked = false;
            call.resolve(status());
            return;
        }
        if (!UsAppLockPolicy.STATE_OK.equals(config.state)) {
            reject(call, UsAppLockPolicy.ERR_INVALIDATED);
            return;
        }
        String capability = capability();
        if (!"ok".equals(capability)) {
            reject(call, capabilityError(capability));
            return;
        }
        Cipher cipher = cipherOrInvalidate(call);
        if (cipher == null) return;
        prompt(call, cipher, new Outcome() {
            @Override
            public void success() {
                locked = false;
                call.resolve(status());
            }

            @Override
            public void failure(String code) {
                reject(call, code);
            }
        });
    }

    /** Logout, account switch or recovery after the session was destroyed. */
    @PluginMethod
    public void reset(PluginCall call) {
        clearProtection();
        call.resolve(status());
    }

    /** The web lock screen is painted (or nothing needs hiding): drop the cover. */
    @PluginMethod
    public void releaseCover(PluginCall call) {
        main.post(this::removeCover);
        call.resolve();
    }

    @Override
    protected void handleOnStop() {
        if (!protectedOn) return;
        backgroundedAt = SystemClock.elapsedRealtime();
        main.post(this::showCover);
    }

    @Override
    protected void handleOnStart() {
        long since = backgroundedAt;
        backgroundedAt = -1L;
        if (since < 0) return;
        if (UsAppLockPolicy.shouldLockOnForeground(protectedOn, since, SystemClock.elapsedRealtime(), UsAppLockPolicy.GRACE_MS)) {
            locked = true;
            JSObject data = new JSObject();
            data.put("reason", "background");
            notifyListeners("lockRequired", data, true);
            // The web layer releases the cover once its lock screen is up.
            main.postDelayed(this::removeCover, COVER_SAFETY_MS);
        } else {
            main.post(this::removeCover);
        }
    }

    private interface Outcome {
        void success() throws Exception;

        void failure(String code);
    }

    private void prompt(PluginCall call, Cipher cipher, Outcome outcome) {
        AppCompatActivity activity = getActivity();
        if (activity == null || promptInFlight) {
            reject(call, activity == null ? UsAppLockPolicy.ERR_UNAVAILABLE : UsAppLockPolicy.ERR_BUSY);
            return;
        }
        promptInFlight = true;
        BiometricPrompt.PromptInfo info;
        try {
            BiometricPrompt.PromptInfo.Builder builder = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(text(call, "title", "Sblocca US", 60))
                .setNegativeButtonText(text(call, "cancel", "Annulla", 30))
                .setAllowedAuthenticators(AUTHENTICATORS)
                .setConfirmationRequired(false);
            String subtitle = text(call, "subtitle", "", 80);
            if (!subtitle.isEmpty()) builder.setSubtitle(subtitle);
            info = builder.build();
        } catch (IllegalArgumentException error) {
            promptInFlight = false;
            reject(call, UsAppLockPolicy.ERR_INVALID_ARGUMENT);
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                BiometricPrompt prompt = new BiometricPrompt(activity, ContextCompat.getMainExecutor(activity),
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                            promptInFlight = false;
                            BiometricPrompt.CryptoObject crypto = result.getCryptoObject();
                            try {
                                if (crypto == null || crypto.getCipher() == null) throw new IllegalStateException("No crypto");
                                UsAppLockStore.proveAuthenticated(crypto.getCipher());
                                outcome.success();
                            } catch (Exception error) {
                                outcome.failure(UsAppLockPolicy.ERR_ERROR);
                            }
                        }

                        @Override
                        public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                            promptInFlight = false;
                            outcome.failure(UsAppLockPolicy.mapPromptError(errorCode));
                        }

                        @Override
                        public void onAuthenticationFailed() {
                            // Not recognised: the system sheet stays up and lets the user retry.
                        }
                    });
                prompt.authenticate(info, new BiometricPrompt.CryptoObject(cipher));
            } catch (Exception error) {
                promptInFlight = false;
                outcome.failure(UsAppLockPolicy.ERR_UNAVAILABLE);
            }
        });
    }

    private Cipher cipherOrInvalidate(PluginCall call) {
        try {
            return store.biometricCipher();
        } catch (KeyPermanentlyInvalidatedException error) {
            // A fingerprint was added or removed since protection was enabled.
            store.markInvalidated();
        } catch (Exception error) {
            // Key lost or unusable: fail closed, the account login recovers.
            store.markInvalidated();
        }
        reject(call, UsAppLockPolicy.ERR_INVALIDATED);
        return null;
    }

    private void clearProtection() {
        store.clear();
        protectedOn = false;
        locked = false;
        backgroundedAt = -1L;
        applyRecentsPolicy();
        main.post(this::removeCover);
    }

    private JSObject status() {
        UsAppLockPolicy.Config config = store.read();
        String capability = capability();
        JSObject biometry = new JSObject();
        biometry.put("available", "ok".equals(capability));
        biometry.put("kind", biometryKind());
        biometry.put("reason", capability);
        JSObject protection = new JSObject();
        protection.put("enabled", config != null);
        protection.put("ownerHash", config == null ? "" : config.ownerHash);
        protection.put("state", config == null ? "off" : config.state);
        JSObject result = new JSObject();
        result.put("platform", "android");
        result.put("biometry", biometry);
        result.put("protection", protection);
        result.put("locked", config != null && locked);
        result.put("graceMs", UsAppLockPolicy.GRACE_MS);
        return result;
    }

    private String capability() {
        try {
            return UsAppLockPolicy.mapCapability(BiometricManager.from(getContext()).canAuthenticate(AUTHENTICATORS));
        } catch (Exception error) {
            return "unavailable";
        }
    }

    private static String capabilityError(String capability) {
        if ("not_enrolled".equals(capability)) return UsAppLockPolicy.ERR_NOT_ENROLLED;
        if ("unsupported".equals(capability)) return UsAppLockPolicy.ERR_UNSUPPORTED;
        return UsAppLockPolicy.ERR_UNAVAILABLE;
    }

    private String biometryKind() {
        PackageManager pm = getContext().getPackageManager();
        if (pm.hasSystemFeature(PackageManager.FEATURE_FINGERPRINT)) return "fingerprint";
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && pm.hasSystemFeature(PackageManager.FEATURE_FACE)) return "face";
        return "biometric";
    }

    /** Android 13+: no app-switcher thumbnail while protected; screenshots stay allowed. */
    private void applyRecentsPolicy() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        AppCompatActivity activity = getActivity();
        if (activity == null) return;
        boolean protectedNow = protectedOn;
        activity.runOnUiThread(() -> activity.setRecentsScreenshotEnabled(!protectedNow));
    }

    private void showCover() {
        AppCompatActivity activity = getActivity();
        if (activity == null || cover != null) return;
        ViewGroup content = activity.findViewById(android.R.id.content);
        if (content == null) return;
        FrameLayout view = new FrameLayout(activity);
        view.setBackgroundColor(COVER_COLOR);
        view.setClickable(true); // swallows touches until removed
        view.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        content.addView(view, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        cover = view;
    }

    private void removeCover() {
        View view = cover;
        cover = null;
        if (view != null && view.getParent() instanceof ViewGroup) ((ViewGroup) view.getParent()).removeView(view);
    }

    private static String text(PluginCall call, String key, String fallback, int max) {
        String value = call.getString(key, fallback);
        if (value == null) value = fallback;
        value = value.replaceAll("[\\u0000-\\u001f\\u007f]", " ").trim();
        if (value.isEmpty()) value = fallback;
        return value.length() > max ? value.substring(0, max) : value;
    }

    private static void reject(PluginCall call, String code) {
        call.reject(code, code);
    }
}
