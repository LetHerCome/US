package com.usapp.googlesignin;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class UsGoogleSignInPolicyTest {
    @Test
    public void onlyAGoogleWebClientIdIsAccepted() {
        assertTrue(UsGoogleSignInPolicy.validClientId("123456789012-abcdefghijklmnop0123456789abcdef.apps.googleusercontent.com"));
        assertFalse(UsGoogleSignInPolicy.validClientId(""));
        assertFalse(UsGoogleSignInPolicy.validClientId(null));
        assertFalse(UsGoogleSignInPolicy.validClientId("123456789012-abc.apps.googleusercontent.com.evil.tld"));
        assertFalse(UsGoogleSignInPolicy.validClientId("https://accounts.google.com"));
    }

    @Test
    public void theNonceIsTheSha256Hex() {
        assertTrue(UsGoogleSignInPolicy.validNonce("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"));
        assertFalse(UsGoogleSignInPolicy.validNonce("0123456789ABCDEF0123456789abcdef0123456789abcdef0123456789abcdef"));
        assertFalse(UsGoogleSignInPolicy.validNonce("raw-nonce"));
        assertFalse(UsGoogleSignInPolicy.validNonce(null));
    }

    @Test
    public void errorsBecomeShortCodes() {
        assertEquals("cancelled", UsGoogleSignInPolicy.errorCode("android.credentials.GetCredentialException.TYPE_USER_CANCELED"));
        assertEquals("no_account", UsGoogleSignInPolicy.errorCode("android.credentials.GetCredentialException.TYPE_NO_CREDENTIAL"));
        assertEquals("interrupted", UsGoogleSignInPolicy.errorCode("android.credentials.GetCredentialException.TYPE_INTERRUPTED"));
        assertEquals("not_configured", UsGoogleSignInPolicy.errorCode("androidx.credentials.TYPE_GET_CREDENTIAL_PROVIDER_CONFIGURATION_EXCEPTION"));
        assertEquals("failed", UsGoogleSignInPolicy.errorCode("android.credentials.GetCredentialException.TYPE_UNKNOWN"));
        assertEquals("failed", UsGoogleSignInPolicy.errorCode(null));
    }
}
