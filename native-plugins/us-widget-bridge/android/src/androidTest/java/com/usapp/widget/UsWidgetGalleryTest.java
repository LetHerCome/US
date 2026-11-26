package com.usapp.widget;

import static org.junit.Assert.assertTrue;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.RectF;
import android.os.Bundle;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.RemoteViews;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * The widget gallery (widget del redesign, 26/11/2026): every widget, every
 * size, by day and by night, drawn by the real providers with a sample couple
 * (Bea, a ball and a square), saved as PNG in the test app's files
 * (Android/data/com.usapp.widget.test/files/gallery). For checking the
 * widgets against the board and for the picker previews. Never real data.
 *
 * ./gradlew :us-widget-bridge:connectedDebugAndroidTest, then adb pull.
 */
@RunWith(AndroidJUnit4.class)
public class UsWidgetGalleryTest {
    private static final String OWNER = "a".repeat(64);
    private static final String KEY = "b".repeat(32);

    @Test
    public void drawsEveryWidget() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Context assets = InstrumentationRegistry.getInstrumentation().getContext();
        UsWidgets.gallery = true;
        File out = new File(context.getExternalFilesDir(null), "gallery");
        out.mkdirs();
        for (File old : out.listFiles() == null ? new File[0] : out.listFiles()) old.delete();

        for (String variant : new String[] { "base", "got", "preview" }) {
            UsWidgetStore store = new UsWidgetStore(context);
            store.clearAll();
            assertTrue(store.activateAccount(OWNER));
            // A made-up send credential (43 characters) so the Ti penso shows its real states; it never leaves the emulator.
            assertTrue(new UsWidgetCredentialStore(context).write(OWNER, "g".repeat(43), Instant.now().plus(Duration.ofDays(30)).toString()));
            assertTrue(store.writePhoto(OWNER, KEY, read(assets, "photo.jpg")));
            for (String slot : new String[] { "memories", "memories_wide", "lavagna", "lavagna_night" }) {
                assertTrue(slot, store.writeNoiPortrait(OWNER, slot, read(assets, slot + (slot.startsWith("memories") ? ".webp" : ".png"))));
            }
            JSONObject sample = sample(variant.equals("got"));
            // The picker previews are generic: no name anywhere (the widgets say «La tua persona»).
            if (variant.equals("preview")) sample.getJSONObject("think").put("partnerName", "");
            assertTrue(store.write(sample));
            UsWidgets.State state = new UsWidgets.State(context);
            if (variant.equals("preview")) {
                // The picture the phone's widget list shows (us_widget_preview_*.png, 2x): square 168dp,
                // Distanza 192x96dp, the wide ones 240x120dp; the 2:1 ones drawn at 300x150dp, all scaled to 2x into res/drawable(-night)-nodpi.
                String[][] previews = { { UsWidgets.THINK, "168", "168" }, { UsWidgets.POSTIT, "168", "168" }, { UsWidgets.PHOTO, "168", "168" },
                    { UsWidgets.MESSAGE, "168", "168" }, { UsWidgets.MEMORIES, "168", "168" }, { UsWidgets.LAVAGNA, "168", "168" },
                    { UsWidgets.NOI, "300", "150" }, { UsWidgets.DAILY, "300", "150" }, { UsWidgets.STATUS, "300", "150" } };
                for (String[] p : previews) {
                    int w = Integer.parseInt(p[1]), h = Integer.parseInt(p[2]);
                    RemoteViews views = UsWidgets.render(context, p[0], state, options(w, h));
                    for (boolean night : new boolean[] { false, true }) {
                        save(draw(themed(context, night), views, w, h), new File(out, "preview_" + p[0] + (night ? "_notte" : "_giorno") + ".png"));
                    }
                }
                continue;
            }
            String[][] widgets = variant.equals("got")
                ? new String[][] { { UsWidgets.THINK, "s" }, { UsWidgets.THINK, "m" } }
                : new String[][] {
                    { UsWidgets.THINK, "s" }, { UsWidgets.THINK, "m" }, { UsWidgets.PHOTO, "s" }, { UsWidgets.PHOTO, "m" },
                    { UsWidgets.DAILY, "s" }, { UsWidgets.DAILY, "m" }, { UsWidgets.STATUS, "s" }, { UsWidgets.STATUS, "m" },
                    { UsWidgets.NOI, "r" }, { UsWidgets.NOI, "s" }, { UsWidgets.NOI, "m" }, { UsWidgets.MESSAGE, "s" }, { UsWidgets.MESSAGE, "m" },
                    { UsWidgets.MEMORIES, "s" }, { UsWidgets.MEMORIES, "m" }, { UsWidgets.LAVAGNA, "s" }, { UsWidgets.LAVAGNA, "m" },
                    { UsWidgets.POSTIT, "s" }, { UsWidgets.POSTIT, "m" } };
            for (String[] widget : widgets) {
                int w = widget[1].equals("m") ? 356 : 172;
                int h = widget[1].equals("r") ? 84 : 172;
                RemoteViews views = UsWidgets.render(context, widget[0], state, options(w, h));
                for (boolean night : new boolean[] { false, true }) {
                    String name = widget[0] + "_" + widget[1] + (variant.equals("got") ? "_got" : "") + (night ? "_notte" : "_giorno") + ".png";
                    save(draw(themed(context, night), views, w, h), new File(out, name));
                }
            }
        }
    }

    private static Bundle options(int w, int h) {
        Bundle options = new Bundle();
        options.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, w);
        options.putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, w);
        options.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, h);
        options.putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, h);
        return options;
    }

    private static Context themed(Context context, boolean night) {
        Configuration conf = new Configuration(context.getResources().getConfiguration());
        conf.uiMode = (conf.uiMode & ~Configuration.UI_MODE_NIGHT_MASK) | (night ? Configuration.UI_MODE_NIGHT_YES : Configuration.UI_MODE_NIGHT_NO);
        return context.createConfigurationContext(conf);
    }

    private static Bitmap draw(Context context, RemoteViews views, int wDp, int hDp) {
        float density = context.getResources().getDisplayMetrics().density;
        int w = Math.round(wDp * density), h = Math.round(hDp * density);
        FrameLayout parent = new FrameLayout(context);
        View view = views.apply(context, parent);
        parent.addView(view, new FrameLayout.LayoutParams(w, h));
        parent.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY));
        parent.layout(0, 0, w, h);
        Bitmap raw = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        parent.draw(new Canvas(raw));
        // The launcher clips the card's corners (clipToOutline); a software draw does not.
        Bitmap round = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(round);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        canvas.drawRoundRect(new RectF(0, 0, w, h), 24 * density, 24 * density, paint);
        paint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_IN));
        canvas.drawBitmap(raw, 0, 0, paint);
        return round;
    }

    private static void save(Bitmap bitmap, File file) throws Exception {
        try (FileOutputStream stream = new FileOutputStream(file)) {
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream);
        }
    }

    private static byte[] read(Context context, String name) throws Exception {
        try (InputStream in = context.getAssets().open(name); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            for (int n; (n = in.read(buffer)) > 0; ) bytes.write(buffer, 0, n);
            return bytes.toByteArray();
        }
    }

    /** A sample couple: Bea (lilla square with a bow) and you (rosa ball with glasses). */
    private static JSONObject sample(boolean got) throws Exception {
        Instant now = Instant.now();
        LocalDate today = UsWidgetModels.romeToday(now);
        String hour = now.truncatedTo(ChronoUnit.HOURS).toString();
        return new JSONObject()
            .put("schemaVersion", 2)
            .put("ownerHash", OWNER)
            .put("updatedAt", now.toString())
            .put("think", new JSONObject().put("partnerName", "Bea")
                .put("lastReceivedAt", now.minus(got ? Duration.ofMinutes(2) : Duration.ofHours(5)).toString())
                .put("lastSentAt", now.minus(got ? Duration.ofHours(6) : Duration.ofHours(1)).toString()))
            .put("couple", new JSONObject()
                .put("names", new JSONArray().put("Fra").put("Bea"))
                .put("startedOn", today.minusDays(195).toString())
                .put("distanceText", "12 km").put("distanceState", "ready").put("distanceAt", now.minus(Duration.ofMinutes(10)).toString())
                .put("batteryLevel", 78).put("batteryAt", now.minus(Duration.ofMinutes(10)).toString())
                .put("colors", new JSONObject().put("me", "#ff7c96").put("partner", "#a98bff"))
                .put("characters", new JSONObject()
                    .put("me", new JSONObject().put("shape", "palla").put("face", "occhiali").put("color", "#ff7c96").put("day", "#e7a1ab"))
                    .put("partner", new JSONObject().put("shape", "quadrato").put("head", "fiocco").put("color", "#a98bff").put("day", "#ab9ddb"))))
            .put("photo", new JSONObject().put("state", "ready").put("key", KEY).put("hour", hour).put("takenOn", "2025-11-02").put("label", "Pescara"))
            .put("daily", new JSONObject().put("date", today.toString()).put("state", "your_turn").put("question", "Quale piccolo momento vorresti rivivere insieme?"))
            .put("left", new JSONObject().put("kind", "photo").put("at", now.minus(Duration.ofMinutes(10)).toString()))
            .put("memories", new JSONObject().put("state", "ready").put("label", "Un anno fa").put("anniversary", true).put("day", today.toString())
                .put("date", today.minusYears(1).toString()).put("title", "Al bar di Pescara").put("count", 4).put("stack", 2))
            .put("lavagna", new JSONObject().put("state", "ready").put("by", "partner").put("at", now.minus(Duration.ofHours(1)).toString()))
            .put("postit", new JSONObject().put("state", "ready").put("text", "prenotare la cena di sabato").put("color", "yellow").put("by", "partner").put("more", 2)
                .put("at", now.minus(Duration.ofHours(3)).toString())
                .put("second", new JSONObject().put("text", "comprare le lucine per il balcone").put("color", "pink").put("by", "me")))
            .put("status", new JSONObject()
                .put("me", new JSONObject().put("status", "felice").put("form", "m").put("at", now.minus(Duration.ofHours(1)).toString()).put("until", now.plus(Duration.ofHours(11)).toString()))
                .put("partner", new JSONObject().put("status", "innamorato").put("form", "f").put("at", now.minus(Duration.ofHours(2)).toString()).put("until", now.plus(Duration.ofHours(10)).toString())));
    }
}
