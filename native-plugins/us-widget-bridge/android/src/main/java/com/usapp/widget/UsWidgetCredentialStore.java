package com.usapp.widget;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.UUID;
import java.util.regex.Pattern;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

final class UsWidgetCredentialStore {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "us.widget.think.action.v1";
    private static final Pattern OWNER = Pattern.compile("^[a-f0-9]{64}$");
    private static final Pattern TOKEN = Pattern.compile("^[A-Za-z0-9_-]{43}$");
    private final AtomicFile credentialFile;
    private final AtomicFile deviceFile;

    UsWidgetCredentialStore(Context context) {
        File directory = new File(context.getNoBackupFilesDir(), "us-widget");
        if (!directory.exists()) directory.mkdirs();
        credentialFile = new AtomicFile(new File(directory, "action-credential-v1.json"));
        deviceFile = new AtomicFile(new File(directory, "device-id-v1.txt"));
    }

    synchronized String deviceId() {
        String current = readAtomic(deviceFile).trim();
        try { if (!current.isEmpty()) return UUID.fromString(current).toString(); }
        catch (Exception ignored) {}
        String created = UUID.randomUUID().toString();
        return writeAtomic(deviceFile, created) ? created : "";
    }

    synchronized boolean write(String ownerHash, String token) {
        if (!OWNER.matcher(ownerHash).matches() || !TOKEN.matcher(token).matches()) return false;
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            byte[] encrypted = cipher.doFinal(token.getBytes(StandardCharsets.UTF_8));
            JSONObject payload = new JSONObject()
                .put("ownerHash", ownerHash)
                .put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .put("ciphertext", Base64.encodeToString(encrypted, Base64.NO_WRAP));
            return writeAtomic(credentialFile, payload.toString());
        } catch (Exception ignored) {
            return false;
        }
    }

    synchronized String readToken() {
        try {
            JSONObject payload = new JSONObject(readAtomic(credentialFile));
            if (!OWNER.matcher(payload.optString("ownerHash", "")).matches()) return "";
            byte[] iv = Base64.decode(payload.getString("iv"), Base64.NO_WRAP);
            byte[] encrypted = Base64.decode(payload.getString("ciphertext"), Base64.NO_WRAP);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
            String token = new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
            return TOKEN.matcher(token).matches() ? token : "";
        } catch (Exception ignored) {
            return "";
        }
    }

    synchronized void clearForOwnerChange(String ownerHash) {
        if (!OWNER.matcher(ownerHash == null ? "" : ownerHash).matches()) return;
        try {
            JSONObject payload = new JSONObject(readAtomic(credentialFile));
            String current = payload.optString("ownerHash", "");
            if (!current.isEmpty() && !current.equals(ownerHash)) clear();
        } catch (Exception ignored) {}
    }

    synchronized void clear() {
        credentialFile.delete();
    }

    private static SecretKey key() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        KeyStore.Entry existing = keyStore.getEntry(KEY_ALIAS, null);
        if (existing instanceof KeyStore.SecretKeyEntry) return ((KeyStore.SecretKeyEntry) existing).getSecretKey();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .build());
        return generator.generateKey();
    }

    private static String readAtomic(AtomicFile file) {
        try (FileInputStream input = file.openRead()) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[1024];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            return output.toString(StandardCharsets.UTF_8.name());
        } catch (Exception ignored) { return ""; }
    }

    private static boolean writeAtomic(AtomicFile file, String value) {
        FileOutputStream output = null;
        try {
            output = file.startWrite();
            output.write(value.getBytes(StandardCharsets.UTF_8));
            output.flush();
            file.finishWrite(output);
            return true;
        } catch (Exception ignored) {
            if (output != null) file.failWrite(output);
            return false;
        }
    }
}
