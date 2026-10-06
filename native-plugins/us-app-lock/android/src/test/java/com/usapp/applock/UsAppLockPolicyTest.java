package com.usapp.applock;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import org.junit.Test;

public class UsAppLockPolicyTest {
    private static final String OWNER = "a".repeat(64);

    @Test
    public void protectionOffNeverLocks() {
        assertFalse(UsAppLockPolicy.shouldLockOnForeground(false, 0L, 10 * 60_000L, UsAppLockPolicy.GRACE_MS));
    }

    @Test
    public void shortInterruptionStaysUnlockedAndLongBackgroundLocks() {
        long grace = UsAppLockPolicy.GRACE_MS;
        assertFalse(UsAppLockPolicy.shouldLockOnForeground(true, 1_000L, 1_000L + grace - 1, grace));
        assertTrue(UsAppLockPolicy.shouldLockOnForeground(true, 1_000L, 1_000L + grace, grace));
        assertFalse("never backgrounded", UsAppLockPolicy.shouldLockOnForeground(true, -1L, 5_000_000L, grace));
    }

    @Test
    public void clockGoingBackwardsFailsClosed() {
        assertTrue(UsAppLockPolicy.shouldLockOnForeground(true, 50_000L, 10_000L, UsAppLockPolicy.GRACE_MS));
    }

    @Test
    public void mirroredConstantsMatchAndroidxBiometric() {
        assertEquals(BiometricPrompt.ERROR_HW_UNAVAILABLE, UsAppLockPolicy.BP_ERROR_HW_UNAVAILABLE);
        assertEquals(BiometricPrompt.ERROR_UNABLE_TO_PROCESS, UsAppLockPolicy.BP_ERROR_UNABLE_TO_PROCESS);
        assertEquals(BiometricPrompt.ERROR_TIMEOUT, UsAppLockPolicy.BP_ERROR_TIMEOUT);
        assertEquals(BiometricPrompt.ERROR_NO_SPACE, UsAppLockPolicy.BP_ERROR_NO_SPACE);
        assertEquals(BiometricPrompt.ERROR_CANCELED, UsAppLockPolicy.BP_ERROR_CANCELED);
        assertEquals(BiometricPrompt.ERROR_LOCKOUT, UsAppLockPolicy.BP_ERROR_LOCKOUT);
        assertEquals(BiometricPrompt.ERROR_VENDOR, UsAppLockPolicy.BP_ERROR_VENDOR);
        assertEquals(BiometricPrompt.ERROR_LOCKOUT_PERMANENT, UsAppLockPolicy.BP_ERROR_LOCKOUT_PERMANENT);
        assertEquals(BiometricPrompt.ERROR_USER_CANCELED, UsAppLockPolicy.BP_ERROR_USER_CANCELED);
        assertEquals(BiometricPrompt.ERROR_NO_BIOMETRICS, UsAppLockPolicy.BP_ERROR_NO_BIOMETRICS);
        assertEquals(BiometricPrompt.ERROR_HW_NOT_PRESENT, UsAppLockPolicy.BP_ERROR_HW_NOT_PRESENT);
        assertEquals(BiometricPrompt.ERROR_NEGATIVE_BUTTON, UsAppLockPolicy.BP_ERROR_NEGATIVE_BUTTON);
        assertEquals(BiometricPrompt.ERROR_NO_DEVICE_CREDENTIAL, UsAppLockPolicy.BP_ERROR_NO_DEVICE_CREDENTIAL);
        assertEquals(BiometricPrompt.ERROR_SECURITY_UPDATE_REQUIRED, UsAppLockPolicy.BP_ERROR_SECURITY_UPDATE_REQUIRED);
        assertEquals(BiometricManager.BIOMETRIC_SUCCESS, UsAppLockPolicy.BM_SUCCESS);
        assertEquals(BiometricManager.BIOMETRIC_STATUS_UNKNOWN, UsAppLockPolicy.BM_STATUS_UNKNOWN);
        assertEquals(BiometricManager.BIOMETRIC_ERROR_UNSUPPORTED, UsAppLockPolicy.BM_ERROR_UNSUPPORTED);
        assertEquals(BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE, UsAppLockPolicy.BM_ERROR_HW_UNAVAILABLE);
        assertEquals(BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED, UsAppLockPolicy.BM_ERROR_NONE_ENROLLED);
        assertEquals(BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE, UsAppLockPolicy.BM_ERROR_NO_HARDWARE);
        assertEquals(BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED, UsAppLockPolicy.BM_ERROR_SECURITY_UPDATE_REQUIRED);
    }

    @Test
    public void promptErrorsMapToTheSharedCodes() {
        assertEquals("cancelled", UsAppLockPolicy.mapPromptError(BiometricPrompt.ERROR_USER_CANCELED));
        assertEquals("cancelled", UsAppLockPolicy.mapPromptError(BiometricPrompt.ERROR_CANCELED));
        assertEquals("fallback", UsAppLockPolicy.mapPromptError(BiometricPrompt.ERROR_NEGATIVE_BUTTON));
        assertEquals("lockout", UsAppLockPolicy.mapPromptError(BiometricPrompt.ERROR_LOCKOUT));
        assertEquals("lockout_permanent", UsAppLockPolicy.mapPromptError(BiometricPrompt.ERROR_LOCKOUT_PERMANENT));
        assertEquals("not_enrolled", UsAppLockPolicy.mapPromptError(BiometricPrompt.ERROR_NO_BIOMETRICS));
        assertEquals("unsupported", UsAppLockPolicy.mapPromptError(BiometricPrompt.ERROR_HW_NOT_PRESENT));
        assertEquals("unavailable", UsAppLockPolicy.mapPromptError(BiometricPrompt.ERROR_HW_UNAVAILABLE));
        assertEquals("failed", UsAppLockPolicy.mapPromptError(BiometricPrompt.ERROR_TIMEOUT));
        assertEquals("error", UsAppLockPolicy.mapPromptError(999));
    }

    @Test
    public void capabilityMapsEveryBiometricManagerResult() {
        assertEquals("ok", UsAppLockPolicy.mapCapability(BiometricManager.BIOMETRIC_SUCCESS));
        assertEquals("not_enrolled", UsAppLockPolicy.mapCapability(BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED));
        assertEquals("unsupported", UsAppLockPolicy.mapCapability(BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE));
        assertEquals("unsupported", UsAppLockPolicy.mapCapability(BiometricManager.BIOMETRIC_ERROR_UNSUPPORTED));
        assertEquals("unavailable", UsAppLockPolicy.mapCapability(BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE));
        assertEquals("unavailable", UsAppLockPolicy.mapCapability(BiometricManager.BIOMETRIC_STATUS_UNKNOWN));
        assertEquals("security_update", UsAppLockPolicy.mapCapability(BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED));
    }

    @Test
    public void configRoundTripsWithoutAnyCredential() {
        String raw = UsAppLockPolicy.encodeConfig(OWNER, 1234L, UsAppLockPolicy.STATE_OK);
        UsAppLockPolicy.Config config = UsAppLockPolicy.decodeConfig(raw);
        assertEquals(OWNER, config.ownerHash);
        assertEquals(1234L, config.enabledAt);
        assertEquals(UsAppLockPolicy.STATE_OK, config.state);
        assertFalse(raw.contains("token"));
        assertFalse(raw.contains("password"));
    }

    @Test
    public void corruptedOrForeignRecordsFailClosed() {
        assertNull(UsAppLockPolicy.decodeConfig(null));
        assertNull(UsAppLockPolicy.decodeConfig(""));
        assertEquals(UsAppLockPolicy.STATE_CORRUPTED, UsAppLockPolicy.decodeConfig("{not json").state);
        assertEquals(UsAppLockPolicy.STATE_CORRUPTED, UsAppLockPolicy.decodeConfig("{\"v\":2,\"ownerHash\":\"" + OWNER + "\",\"state\":\"ok\"}").state);
        assertEquals(UsAppLockPolicy.STATE_CORRUPTED, UsAppLockPolicy.decodeConfig("{\"v\":1,\"ownerHash\":\"xyz\",\"state\":\"ok\"}").state);
        assertEquals(UsAppLockPolicy.STATE_CORRUPTED, UsAppLockPolicy.decodeConfig("{\"v\":1,\"ownerHash\":\"" + OWNER + "\",\"state\":\"open\"}").state);
        assertEquals(UsAppLockPolicy.STATE_INVALIDATED,
            UsAppLockPolicy.decodeConfig(UsAppLockPolicy.encodeConfig(OWNER, 1L, UsAppLockPolicy.STATE_INVALIDATED)).state);
    }

    @Test(expected = IllegalArgumentException.class)
    public void refusesARecordWithoutAValidOwner() {
        UsAppLockPolicy.encodeConfig("not-a-hash", 0L, UsAppLockPolicy.STATE_OK);
    }
}
