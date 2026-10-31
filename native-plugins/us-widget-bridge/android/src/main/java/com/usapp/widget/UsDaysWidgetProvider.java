package com.usapp.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

/**
 * Giorni insieme (founder, 31/10/2026): the two round portraits with a heart
 * between them and, under them, the days together in a big serif number.
 * The same data as Foto & Noi (couple.startedOn); it turns at Rome midnight.
 */
public final class UsDaysWidgetProvider extends AppWidgetProvider {
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        UsWidgets.refreshAll(context);
    }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        UsWidgets.refresh(context, UsWidgets.DAYS, id);
    }
    @Override public void onDisabled(Context context) { UsWidgets.refreshAll(context); }

    static RemoteViews render(Context context, UsWidgets.State state) {
        UsWidgetModels.Days days = UsWidgetModels.days(state.snapshot, state.now);
        state.needsUpdateAt(days.nextChange);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.us_widget_days);
        views.setOnClickPendingIntent(R.id.us_days_root, UsWidgets.open(context, "days", 4701));
        views.setViewVisibility(R.id.us_days_value, days.empty ? View.GONE : View.VISIBLE);
        views.setTextViewText(R.id.us_days_value, days.value);
        views.setTextViewText(R.id.us_days_unit, days.unit);
        portrait(views, state.store.readNoiPortrait("me"), R.id.us_days_me_photo, R.id.us_days_me_empty);
        portrait(views, state.store.readNoiPortrait("partner"), R.id.us_days_partner_photo, R.id.us_days_partner_empty);
        views.setContentDescription(R.id.us_days_root, days.empty ? days.unit : days.value + " " + days.unit + ". Apri Noi");
        return views;
    }

    private static void portrait(RemoteViews views, byte[] raw, int photo, int empty) {
        Bitmap bitmap = null;
        if (raw != null) {
            try { bitmap = BitmapFactory.decodeByteArray(raw, 0, raw.length); }
            catch (RuntimeException ignored) {}
        }
        views.setViewVisibility(photo, bitmap == null ? View.GONE : View.VISIBLE);
        views.setViewVisibility(empty, bitmap == null ? View.VISIBLE : View.GONE);
        if (bitmap != null) views.setImageViewBitmap(photo, bitmap);
    }
}
