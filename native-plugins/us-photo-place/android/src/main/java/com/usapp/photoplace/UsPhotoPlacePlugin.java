package com.usapp.photoplace;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Mappa dei Ricordi (founder, 29/10/2026): the photos of a new Ricordo, with
 * the place where they were taken. The WebView file input goes through the
 * photo picker or a MediaStore URI, and Android removes the GPS position from
 * both. Here the user picks with the system document picker
 * (ACTION_OPEN_DOCUMENT, no READ_MEDIA_IMAGES); with ACCESS_MEDIA_LOCATION,
 * asked by the web layer after its own explanation, the position is read from
 * the original (MediaStore.getMediaUri + setRequireOriginal). It leaves this
 * class already rounded to three decimals (about 100 m). Any failure means
 * "no place", never "no photo". The photos are copied to the app cache, which
 * the next pick empties, and the web layer reads them from there.
 */
@CapacitorPlugin(
    name = "UsPhotoPlace",
    permissions = { @Permission(alias = "mediaLocation", strings = { Manifest.permission.ACCESS_MEDIA_LOCATION }) }
)
public class UsPhotoPlacePlugin extends Plugin {
    static final String[] TYPES = { "image/jpeg", "image/png", "image/webp" };
    static final int MAX_PHOTOS = 10;
    static final long MAX_BYTES = 20L * 1024 * 1024;
    static final String CACHE_DIR = "us-photo-place";

    static double round3(double value) {
        return Math.round(value * 1000d) / 1000d;
    }

    static boolean allowedType(String type) {
        if (type == null) return false;
        for (String allowed : TYPES) if (allowed.equals(type)) return true;
        return false;
    }

    @PluginMethod
    public void pick(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, TYPES);
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, call.getBoolean("multiple", true));
        startActivityForResult(call, intent, "picked");
    }

    @ActivityCallback
    private void picked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null) {
            call.resolve(new JSObject().put("photos", new JSArray()).put("cancelled", true));
            return;
        }
        List<Uri> uris = new ArrayList<>();
        ClipData clip = data.getClipData();
        if (clip != null) {
            for (int i = 0; i < clip.getItemCount(); i++) uris.add(clip.getItemAt(i).getUri());
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }
        boolean withPlace = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || getPermissionState("mediaLocation") == PermissionState.GRANTED;
        new Thread(() -> {
            try {
                call.resolve(read(uris, withPlace));
            } catch (Exception error) {
                call.reject("Photos not readable", error);
            }
        }, "us-photo-place").start();
    }

    private JSObject read(List<Uri> uris, boolean withPlace) {
        Context context = getContext();
        ContentResolver resolver = context.getContentResolver();
        File dir = new File(context.getCacheDir(), CACHE_DIR);
        File[] old = dir.listFiles();
        if (old != null) for (File file : old) file.delete();
        dir.mkdirs();
        JSArray photos = new JSArray();
        int skipped = 0;
        for (Uri uri : uris) {
            if (photos.length() >= MAX_PHOTOS) { skipped++; continue; }
            String type = resolver.getType(uri);
            long size = size(resolver, uri);
            if (!allowedType(type) || size > MAX_BYTES) { skipped++; continue; }
            File copy = new File(dir, UUID.randomUUID() + (type.equals("image/png") ? ".png" : type.equals("image/webp") ? ".webp" : ".jpg"));
            try (InputStream in = resolver.openInputStream(uri); OutputStream out = new FileOutputStream(copy)) {
                if (in == null) { skipped++; continue; }
                byte[] buffer = new byte[64 * 1024];
                long total = 0;
                int n;
                while ((n = in.read(buffer)) > 0) {
                    total += n;
                    if (total > MAX_BYTES) throw new IllegalStateException("too large");
                    out.write(buffer, 0, n);
                }
            } catch (Exception error) {
                copy.delete();
                skipped++;
                continue;
            }
            JSObject photo = new JSObject();
            photo.put("path", copy.getAbsolutePath());
            photo.put("type", type);
            photo.put("name", copy.getName());
            photo.put("lastModified", lastModified(resolver, uri));
            double[] place = withPlace && type.equals("image/jpeg") ? place(context, uri) : null;
            if (place != null) {
                photo.put("lat", round3(place[0]));
                photo.put("lon", round3(place[1]));
            }
            photos.put(photo);
        }
        return new JSObject().put("photos", photos).put("skipped", skipped).put("withPlace", withPlace);
    }

    /** The GPS of the original photo, or null. The original first; the document itself if it has one. */
    private static double[] place(Context context, Uri uri) {
        ContentResolver resolver = context.getContentResolver();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                Uri media = MediaStore.getMediaUri(context, uri);
                if (media != null) {
                    double[] found = latLong(resolver, MediaStore.setRequireOriginal(media));
                    if (found != null) return found;
                }
            } catch (Exception ignored) {
                // Not a MediaStore document (Android 10–11 for the Images root), or no permission.
            }
        }
        try {
            return latLong(resolver, uri);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static double[] latLong(ContentResolver resolver, Uri uri) throws Exception {
        try (InputStream in = resolver.openInputStream(uri)) {
            if (in == null) return null;
            float[] out = new float[2];
            if (!new ExifInterface(in).getLatLong(out)) return null;
            if (out[0] == 0f && out[1] == 0f) return null;
            if (Math.abs(out[0]) > 90 || Math.abs(out[1]) > 180) return null;
            return new double[] { out[0], out[1] };
        }
    }

    private static long size(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(uri, new String[] { OpenableColumns.SIZE }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) return cursor.getLong(0);
        } catch (Exception ignored) {}
        return 0;
    }

    private static long lastModified(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(uri, new String[] { "last_modified" }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) return cursor.getLong(0);
        } catch (Exception ignored) {}
        return 0;
    }
}
