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
import android.view.View;
import android.widget.RemoteViews;

/**
 * Foto & giorni, Pastello (founder, 02/11/2026: "i 195 giorni insieme con la
 * foto che cambia"). Oggi's photo of this hour and of the next two (cached by
 * US while open, never a URL, never fetched here) change by themselves every
 * hour; the bars say which of the three. The days together in Fraunces; in
 * the 4x2 also your portraits and "dal 21 aprile · Lisbona, 12 ottobre".
 * Giorni insieme widgets placed before render the same (UsDaysWidgetProvider).
 */
public final class UsPhotoWidgetProvider extends AppWidgetProvider {
    private static final int MAX_EDGE_PX = 720;
    private static final int[] BARS = { R.id.us_photo_bar_1, R.id.us_photo_bar_2, R.id.us_photo_bar_3 };

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
        if (couple.days >= 0) state.needsUpdateAt(couple.nextChange);
        byte[] bytes = slot.ready() ? state.store.readPhoto(slot.key) : null;
        float density = UsWidgets.density(context);
        RemoteViews small = fill(context, new RemoteViews(context.getPackageName(), R.layout.us_widget_photo), state, couple, slot,
            bytes == null ? null : framed(bytes, 170, 170, density));
        RemoteViews medium = fill(context, new RemoteViews(context.getPackageName(), R.layout.us_widget_photo_medium), state, couple, slot,
            bytes == null ? null : framed(bytes, 350, 170, density));
        // The 2x2 shows which of the hour's photos this is.
        boolean several = bytes != null && slot.count > 1;
        small.setViewVisibility(R.id.us_photo_bars, several ? View.VISIBLE : View.GONE);
        for (int i = 0; i < BARS.length; i++) {
            small.setViewVisibility(BARS[i], i < slot.count ? View.VISIBLE : View.GONE);
            small.setImageViewResource(BARS[i], i == slot.index ? R.drawable.us_widget_pastel_bar_on : R.drawable.us_widget_pastel_bar_off);
        }
        // 4x2: the two of you, and since when, where and when the photo is.
        UsWidgets.avatar(medium, state.store.readNoiPortrait("me"), R.id.us_photo_me, UsWidgetModels.personColor(state.snapshot, true));
        UsWidgets.avatar(medium, state.store.readNoiPortrait("partner"), R.id.us_photo_partner, UsWidgetModels.personColor(state.snapshot, false));
        String line = UsWidgetModels.photoLine(state.snapshot, slot);
        medium.setTextViewText(R.id.us_photo_line, line);
        medium.setViewVisibility(R.id.us_photo_line, line.isEmpty() ? View.GONE : View.VISIBLE);
        return UsWidgets.sized(options, small, medium);
    }

    private static RemoteViews fill(Context context, RemoteViews views, UsWidgets.State state,
            UsWidgetModels.Couple couple, UsWidgetModels.PhotoSlot slot, Bitmap photo) {
        views.setOnClickPendingIntent(R.id.us_photo_root, UsWidgets.open(context, "photo", 4501));
        boolean days = couple.days >= 0;
        views.setViewVisibility(R.id.us_photo_days, days ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.us_photo_unit, days ? View.VISIBLE : View.GONE);
        views.setTextViewText(R.id.us_photo_days, days ? Long.toString(couple.days) : "");
        views.setTextViewText(R.id.us_photo_unit, couple.days == 1 ? "giorno insieme" : "giorni insieme");
        views.setViewVisibility(R.id.us_photo_image, photo == null ? View.GONE : View.VISIBLE);
        if (photo != null) views.setImageViewBitmap(R.id.us_photo_image, photo);
        views.setViewVisibility(R.id.us_photo_placeholder, photo == null ? View.VISIBLE : View.GONE);
        views.setTextViewText(R.id.us_photo_placeholder, context.getString(state.snapshot == null ? R.string.us_widget_connect : R.string.us_widget_photo_empty));
        String place = slot.label.isEmpty() ? "" : ", " + slot.label;
        views.setContentDescription(R.id.us_photo_root, (photo == null ? context.getString(R.string.us_widget_photo_name) : "La vostra foto di Oggi" + place)
            + (days ? ", " + couple.days + (couple.days == 1 ? " giorno insieme" : " giorni insieme") : ""));
        return views;
    }


    /** Decodes downsampled, crops to the shape and rounds the corners like the board's cards (26dp). */
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
            float radius = 26 * density * scale;
            canvas.drawRoundRect(new RectF(0, 0, outW, outH), radius, radius, paint);
            source.recycle();
            return out;
        } catch (Throwable ignored) {
            return null;
        }
    }
}
