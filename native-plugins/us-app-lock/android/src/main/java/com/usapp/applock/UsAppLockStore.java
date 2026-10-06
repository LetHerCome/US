package com.usapp.applock;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Device-local protection record, Android Keystore backed.
 *
 *  - CONFIG key (AES-256-GCM, no user authentication): encrypts the small
 *    record {ownerHash, enabledAt, state} kept in private SharedPreferences.
 *    The ciphertext is useless off this device and GCM rejects tampering.
 *  - BIO key (AES-256-GCM, biometric-bound, invalidated by a new enrollment):
 *    every unlock must use it through BiometricPrompt's CryptoObject, so a
 *    successful prompt is proven by the secure hardware, not by a flag.
 *
 * Nothing here is a credential: the Supabase session stays in the WebView
 * (app sandbox, allowBackup=false) and is never copied or exported.
 */
final class UsAppLockStore {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String CONFIG_KEY = "com.usapp.applock.config.v1";
    private static final String BIO_KEY = "com.usapp.applock.bio.v1";
    private static final String PREFS = "us_app_lock_v1";
    private static final String PREF_CONFIG = "config";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_BITS = 128;

    private final SharedPreferences prefs;

    UsAppLockStore(Context context) {
        this.prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** null = protection off. A record that cannot be read is CORRUPTED (fail closed). */
    synchronized UsAppLockPolicy.Config read() {
        String stored = prefs.getString(PREF_CONFIG, null);
        if (stored == null || stored.isEmpty()) return null;
        try {
            return UsAppLockPolicy.decodeConfig(decrypt(stored));
        } catch (Exception error) {
            return new UsAppLockPolicy.Config("", 0L, UsAppLockPolicy.STATE_CORRUPTED);
        }
    }

    synchronized void write(String ownerHash, long enabledAt, String state) throws Exception {
        String encrypted = encrypt(UsAppLockPolicy.encodeConfig(ownerHash, enabledAt, state));
        if (!prefs.edit().putString(PREF_CONFIG, encrypted).commit()) {
            throw new IllegalStateException("App lock record not saved");
        }
    }

    synchronized void markInvalidated() {
        UsAppLockPolicy.Config current = read();
        if (current == null) return;
        try {
            if (UsAppLockPolicy.isOwnerHash(current.ownerHash)) {
                write(current.ownerHash, current.enabledAt, UsAppLockPolicy.STATE_INVALIDATED);
            }
        } catch (Exception ignored) {
            // Already fail-closed: an unreadable record decodes as CORRUPTED.
        }
    }

    /** Removes the record and both keys. Never grants access by itself. */
    synchronized void clear() {
        prefs.edit().remove(PREF_CONFIG).commit();
        try {
            KeyStore keyStore = keyStore();
            if (keyStore.containsAlias(BIO_KEY)) keyStore.deleteEntry(BIO_KEY);
            if (keyStore.containsAlias(CONFIG_KEY)) keyStore.deleteEntry(CONFIG_KEY);
        } catch (Exception ignored) {
            // The record is gone; a stale key is regenerated on the next enable.
        }
    }

    /** Fresh biometric-bound key for a new enable (old enrollment state discarded). */
    synchronized void createBiometricKey() throws Exception {
        KeyStore keyStore = keyStore();
        if (keyStore.containsAlias(BIO_KEY)) keyStore.deleteEntry(BIO_KEY);
        KeyGenParameterSpec.Builder spec = new KeyGenParameterSpec.Builder(
                BIO_KEY, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Every use needs a fresh strong-biometric authentication.
            spec.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(spec.build());
        generator.generateKey();
    }

    /**
     * Cipher for BiometricPrompt.CryptoObject. Throws
     * KeyPermanentlyInvalidatedException when a biometric was added/removed
     * since protection was enabled; the caller maps it to "invalidated".
     */
    synchronized Cipher biometricCipher() throws Exception {
        SecretKey key = (SecretKey) keyStore().getKey(BIO_KEY, null);
        if (key == null) throw new IllegalStateException("Biometric key missing");
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, key);
        return cipher;
    }

    /** Uses the authenticated cipher once: proof that the key really unlocked. */
    static void proveAuthenticated(Cipher cipher) throws Exception {
        byte[] challenge = new byte[16];
        new SecureRandom().nextBytes(challenge);
        cipher.doFinal(challenge);
    }

    private String encrypt(String plain) throws Exception {
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, configKey());
        byte[] iv = cipher.getIV();
        byte[] body = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
        return Base64.encodeToString(iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(body, Base64.NO_WRAP);
    }

    private String decrypt(String stored) throws Exception {
        int split = stored.indexOf(':');
        if (split <= 0) throw new IllegalArgumentException("record");
        byte[] iv = Base64.decode(stored.substring(0, split), Base64.NO_WRAP);
        byte[] body = Base64.decode(stored.substring(split + 1), Base64.NO_WRAP);
        SecretKey key = (SecretKey) keyStore().getKey(CONFIG_KEY, null);
        if (key == null) throw new IllegalStateException("Config key missing");
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_BITS, iv));
        return new String(cipher.doFinal(body), StandardCharsets.UTF_8);
    }

    private SecretKey configKey() throws Exception {
        KeyStore keyStore = keyStore();
        SecretKey existing = (SecretKey) keyStore.getKey(CONFIG_KEY, null);
        if (existing != null) return existing;
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(
                CONFIG_KEY, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build());
        return generator.generateKey();
    }

    private static KeyStore keyStore() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        return keyStore;
    }
}
