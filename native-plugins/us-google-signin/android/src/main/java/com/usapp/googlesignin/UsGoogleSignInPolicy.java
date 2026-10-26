package com.usapp.googlesignin;

import java.util.regex.Pattern;

/**
 * Pure rules of «Accedi con Google», tested on the JVM: what the web layer may
 * pass in, and the short error codes it gets back (never a token, never an
 * email, never a raw exception message).
 */
final class UsGoogleSignInPolicy {
    // The OAuth "Web application" client of the US Google Cloud project: the
    // ID token's audience, the one Supabase verifies.
    private static final Pattern CLIENT_ID = Pattern.compile("^[0-9]{6,20}-[a-z0-9]{8,64}\\.apps\\.googleusercontent\\.com$");
    // SHA-256 of the raw nonce, lowercase hex: the raw value only goes to Supabase.
    private static final Pattern NONCE = Pattern.compile("^[0-9a-f]{64}$");

    private UsGoogleSignInPolicy() {}

    static boolean validClientId(String value) {
        return value != null && CLIENT_ID.matcher(value).matches();
    }

    static boolean validNonce(String value) {
        return value != null && NONCE.matcher(value).matches();
    }

    /** Credential Manager exception type → short code for the web layer. */
    static String errorCode(String type) {
        if (type == null) return "failed";
        if (type.endsWith("TYPE_USER_CANCELED") || type.contains("CANCELLATION")) return "cancelled";
        if (type.endsWith("TYPE_NO_CREDENTIAL") || type.contains("NO_CREDENTIAL")) return "no_account";
        if (type.contains("INTERRUPTED")) return "interrupted";
        if (type.contains("PROVIDER_CONFIGURATION")) return "not_configured";
        return "failed";
    }
}
