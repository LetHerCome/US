package com.usapp.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.os.Bundle;
import android.text.Layout;
import android.view.View;
import android.widget.RemoteViews;

/**
 * Foto & Noi, Foto protagonista (founder, 02/11/2026: "Segue il tema (B)"):
 * Oggi's photo edge to edge under a light grain, melting from below into the
 * paper of the phone's theme (cream in Pastello, the night in Midnight), the
 * days together in Fraunces. The photo still changes by itself every hour:
 * Oggi's photo of this hour and of the next two, cached by US while open
 * (never a URL, never fetched here). Without one, an illustration. One layout
 * for every size. Giorni insieme widgets placed before render the same
 * (UsDaysWidgetProvider).
 */
public final class UsPhotoWidgetProvider extends AppWidgetProvider {
    private static final int MAX_EDGE_PX = 720;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        UsWidgets.refreshAll(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int appWidgetId, Bundle newOptions) {
        UsWidgets.refresh(context, UsWidgets.PHOTO, appWidgetId);
    }

    @Override
    public void onDisabled(Context context) {
        UsWidgets.refreshAll(context);
    }

    static RemoteViews render(Context context, UsWidgets.State state, Bundle options) {
        UsWidgetModels.Couple couple = UsWidgetModels.couple(state.snapshot, state.now);
        UsWidgetModels.PhotoSlot slot = UsWidgetModels.photoSlot(state.snapshot, state.now);
        state.needsUpdateAt(slot.nextChange);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.us_widget_photo);
        views.setOnClickPendingIntent(R.id.us_photo_root, UsWidgets.open(context, "photo", 4501));
        boolean days = couple.days >= 0;
        if (days) state.needsUpdateAt(couple.nextChange);
        // "195 giorni insieme" in Fraunces, the unit in italic on two lines beside the number.
        UsWidgetArt.serif(views, context, R.id.us_photo_days, days ? Long.toString(couple.days) : "", 40f, 160, 1, false, Layout.Alignment.ALIGN_NORMAL);
        UsWidgetArt.serif(views, context, R.id.us_photo_unit, days ? (couple.days == 1 ? "giorno\ninsieme" : "giorni\ninsieme") : "", 14f, 90, 2, true, Layout.Alignment.ALIGN_NORMAL);

        byte[] bytes = slot.ready() ? state.store.readPhoto(slot.key) : null;
        Bitmap photo = null;
        if (bytes != null) {
            int widthDp = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
            int heightDp = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
            if (widthDp <= 0) widthDp = 160;
            if (heightDp <= 0) heightDp = widthDp;
            photo = framed(bytes, widthDp, heightDp, UsWidgets.density(context));
        }
        boolean shown = photo != null;
        if (shown) views.setImageViewBitmap(R.id.us_photo_image, photo);
        else UsWidgetArt.art(views, context, R.id.us_photo_art, R.id.us_photo_grain, R.drawable.us_widget_art_photo, options, true);
        views.setViewVisibility(R.id.us_photo_art, shown ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.us_photo_image, shown ? View.VISIBLE : View.GONE);
        // The photo melts into the theme's paper (founder, 02/11/2026: it follows the theme).
        views.setViewVisibility(R.id.us_photo_scrim, shown ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.us_photo_placeholder, shown ? View.GONE : View.VISIBLE);
        if (shown) views.setViewVisibility(R.id.us_photo_grain, UsWidgetArt.clips() ? View.VISIBLE : View.GONE);
        views.setTextViewText(R.id.us_photo_placeholder, context.getString(state.snapshot == null ? R.string.us_widget_connect : R.string.us_widget_photo_empty));
        String place = slot.label.isEmpty() ? "" : ", " + slot.label;
        views.setContentDescription(R.id.us_photo_root, (shown ? "La vostra foto di Oggi" + place : context.getString(R.string.us_widget_photo_name))
            + (days ? ", " + couple.days + (couple.days == 1 ? " giorno insieme" : " giorni insieme") : ""));
        return views;
    }

    /** Decodes downsampled, crops to the shape and rounds the corners like the US cards (24dp). */
    static Bitmap framed(byte[] bytes, int widthDp, int heightDp, float density) {
        try {
            float scale = Math.min(1f, MAX_EDGE_PX / (Math.max(widthDp, heightDp) * density));
            int outW = Math.max(1, Math.round(widthDp * density * scale));
            int outH = Math.max(1, Math.round(heightDp * density * scale));

            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null;
            int sample = 1;
            while (bounds.outWidth / (sample * 2) >= outW && bounds.outHeight / (sample * 2) >= outH) sample *= 2;
            BitmapFactory.Options decode = new BitmapFactory.Options();
            decode.inSampleSize = sample;
            Bitmap source = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, decode);
            if (source == null) return null;

            Bitmap out = Bitmap.createBitmap(outW, outH, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(out);
            float cover = Math.max(outW / (float) source.getWidth(), outH / (float) source.getHeight());
            Matrix matrix = new Matrix();
            matrix.setScale(cover, cover);
            matrix.postTranslate((outW - source.getWidth() * cover) / 2f, (outH - source.getHeight() * cover) / 2f);
            BitmapShader shader = new BitmapShader(source, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP);
            shader.setLocalMatrix(matrix);
            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
            paint.setShader(shader);
            float radius = 24 * density * scale;
            canvas.drawRoundRect(new RectF(0, 0, outW, outH), radius, radius, paint);
            source.recycle();
            return out;
        } catch (Throwable ignored) {
            return null;
        }
    }
}
