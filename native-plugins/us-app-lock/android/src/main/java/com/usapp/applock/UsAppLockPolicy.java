package com.usapp.applock;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Pure (Android-free) rules of the US app lock, mirrored by
 * ios/Sources/UsAppLockPlugin/UsAppLockPolicy.swift and app-lock.js.
 *
 * Locking policy (Native Security V1):
 *  - protection OFF: never locks;
 *  - cold start / process recreation with protection ON: locked;
 *  - back to the foreground after at least GRACE_MS in the background: locked;
 *  - shorter interruptions (a call, a permission dialog, the photo picker,
 *    the biometric sheet itself) never re-prompt.
 * Times are monotonic and include deep sleep (SystemClock.elapsedRealtime),
 * so changing the wall clock cannot extend the grace period.
 */
final class UsAppLockPolicy {
    static final long GRACE_MS = 60_000L;
    static final int CONFIG_VERSION = 1;

    static final String STATE_OK = "ok";
    static final String STATE_INVALIDATED = "invalidated";
    static final String STATE_CORRUPTED = "corrupted";

    // Error codes returned to JavaScript (same set on iOS).
    static final String ERR_CANCELLED = "cancelled";
    static final String ERR_FALLBACK = "fallback";
    static final String ERR_FAILED = "failed";
    static final String ERR_LOCKOUT = "lockout";
    static final String ERR_LOCKOUT_PERMANENT = "lockout_permanent";
    static final String ERR_NOT_ENROLLED = "not_enrolled";
    static final String ERR_UNAVAILABLE = "unavailable";
    static final String ERR_UNSUPPORTED = "unsupported";
    static final String ERR_INVALIDATED = "invalidated";
    static final String ERR_NOT_ENABLED = "not_enabled";
    static final String ERR_BUSY = "busy";
    static final String ERR_INVALID_ARGUMENT = "invalid_argument";
    static final String ERR_ERROR = "error";

    // androidx.biometric.BiometricPrompt error constants (stable public API values),
    // repeated here so this class stays testable on a plain JVM.
    static final int BP_ERROR_HW_UNAVAILABLE = 1;
    static final int BP_ERROR_UNABLE_TO_PROCESS = 2;
    static final int BP_ERROR_TIMEOUT = 3;
    static final int BP_ERROR_NO_SPACE = 4;
    static final int BP_ERROR_CANCELED = 5;
    static final int BP_ERROR_LOCKOUT = 7;
    static final int BP_ERROR_VENDOR = 8;
    static final int BP_ERROR_LOCKOUT_PERMANENT = 9;
    static final int BP_ERROR_USER_CANCELED = 10;
    static final int BP_ERROR_NO_BIOMETRICS = 11;
    static final int BP_ERROR_HW_NOT_PRESENT = 12;
    static final int BP_ERROR_NEGATIVE_BUTTON = 13;
    static final int BP_ERROR_NO_DEVICE_CREDENTIAL = 14;
    static final int BP_ERROR_SECURITY_UPDATE_REQUIRED = 15;

    // androidx.biometric.BiometricManager.canAuthenticate results.
    static final int BM_SUCCESS = 0;
    static final int BM_STATUS_UNKNOWN = -1;
    static final int BM_ERROR_UNSUPPORTED = -2;
    static final int BM_ERROR_HW_UNAVAILABLE = 1;
    static final int BM_ERROR_NONE_ENROLLED = 11;
    static final int BM_ERROR_NO_HARDWARE = 12;
    static final int BM_ERROR_SECURITY_UPDATE_REQUIRED = 15;

    private UsAppLockPolicy() {}

    /** True when returning to the foreground must lock again. Fails closed. */
    static boolean shouldLockOnForeground(boolean enabled, long backgroundedAt, long now, long graceMs) {
        if (!enabled || backgroundedAt < 0) return false;
        if (now < backgroundedAt) return true; // clock went backwards: never trust it
        return now - backgroundedAt >= graceMs;
    }

    static String mapPromptError(int code) {
        switch (code) {
            case BP_ERROR_USER_CANCELED:
            case BP_ERROR_CANCELED:
                return ERR_CANCELLED;
            case BP_ERROR_NEGATIVE_BUTTON:
                return ERR_FALLBACK;
            case BP_ERROR_TIMEOUT:
            case BP_ERROR_UNABLE_TO_PROCESS:
                return ERR_FAILED;
            case BP_ERROR_LOCKOUT:
                return ERR_LOCKOUT;
            case BP_ERROR_LOCKOUT_PERMANENT:
                return ERR_LOCKOUT_PERMANENT;
            case BP_ERROR_NO_BIOMETRICS:
                return ERR_NOT_ENROLLED;
            case BP_ERROR_HW_NOT_PRESENT:
                return ERR_UNSUPPORTED;
            case BP_ERROR_HW_UNAVAILABLE:
            case BP_ERROR_NO_SPACE:
            case BP_ERROR_VENDOR:
            case BP_ERROR_NO_DEVICE_CREDENTIAL:
            case BP_ERROR_SECURITY_UPDATE_REQUIRED:
                return ERR_UNAVAILABLE;
            default:
                return ERR_ERROR;
        }
    }

    /** BiometricManager.canAuthenticate(BIOMETRIC_STRONG) → capability reason. */
    static String mapCapability(int result) {
        switch (result) {
            case BM_SUCCESS:
                return "ok";
            case BM_ERROR_NONE_ENROLLED:
                return "not_enrolled";
            case BM_ERROR_NO_HARDWARE:
            case BM_ERROR_UNSUPPORTED:
                return "unsupported";
            case BM_ERROR_SECURITY_UPDATE_REQUIRED:
                return "security_update";
            case BM_ERROR_HW_UNAVAILABLE:
            case BM_STATUS_UNKNOWN:
            default:
                return "unavailable";
        }
    }

    static boolean isOwnerHash(String value) {
        return value != null && value.matches("^[a-f0-9]{64}$");
    }

    /** Serialized protection record. Never holds credentials or tokens. */
    static String encodeConfig(String ownerHash, long enabledAt, String state) {
        if (!isOwnerHash(ownerHash)) throw new IllegalArgumentException("ownerHash");
        try {
            JSONObject json = new JSONObject();
            json.put("v", CONFIG_VERSION);
            json.put("ownerHash", ownerHash);
            json.put("enabledAt", Math.max(0L, enabledAt));
            json.put("state", STATE_INVALIDATED.equals(state) ? STATE_INVALIDATED : STATE_OK);
            return json.toString();
        } catch (JSONException error) {
            throw new IllegalStateException(error);
        }
    }

    /** Decoded record; anything unexpected becomes CORRUPTED (fail closed). */
    static final class Config {
        final String ownerHash;
        final long enabledAt;
        final String state;

        Config(String ownerHash, long enabledAt, String state) {
            this.ownerHash = ownerHash;
            this.enabledAt = enabledAt;
            this.state = state;
        }
    }

    static Config decodeConfig(String raw) {
        if (raw == null || raw.isEmpty()) return null;
        try {
            JSONObject json = new JSONObject(raw);
            String owner = json.optString("ownerHash", "");
            String state = json.optString("state", "");
            if (json.optInt("v", -1) != CONFIG_VERSION || !isOwnerHash(owner)
                    || !(STATE_OK.equals(state) || STATE_INVALIDATED.equals(state))) {
                return new Config("", 0L, STATE_CORRUPTED);
            }
            return new Config(owner, Math.max(0L, json.optLong("enabledAt", 0L)), state);
        } catch (JSONException error) {
            return new Config("", 0L, STATE_CORRUPTED);
        }
    }
}
