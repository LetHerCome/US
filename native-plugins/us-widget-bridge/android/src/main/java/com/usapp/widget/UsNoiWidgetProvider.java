package com.usapp.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

/** Noi 2x1: two profile portraits and the cached distance from Noi. */
public final class UsNoiWidgetProvider extends AppWidgetProvider {
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        UsWidgets.refreshAll(context);
    }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        UsWidgets.refresh(context, UsWidgets.NOI, id);
    }
    @Override public void onDisabled(Context context) { UsWidgets.refreshAll(context); }

    static RemoteViews render(Context context, UsWidgets.State state) {
        UsWidgetModels.Couple couple = UsWidgetModels.couple(state.snapshot, state.now);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.us_widget_noi);
        views.setOnClickPendingIntent(R.id.us_noi_root, UsWidgets.open(context, "noi", 4401));
        String distance = couple.distanceText.isEmpty() ? "Distanza non nota" : couple.distanceText;
        views.setTextViewText(R.id.us_noi_distance, distance);
        views.setTextViewText(R.id.us_noi_caption, couple.distanceText.isEmpty() ? "APRI NOI" :
            (couple.distanceStale ? "ULTIMA DISTANZA" : "TRA VOI"));
        byte[] raw = state.store.readNoiPortrait();
        Bitmap portrait = null;
        if (raw != null) {
            try { portrait = BitmapFactory.decodeByteArray(raw, 0, raw.length); }
            catch (RuntimeException ignored) {}
        }
        views.setViewVisibility(R.id.us_noi_portrait, portrait == null ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.us_noi_fallback, portrait == null ? View.VISIBLE : View.GONE);
        if (portrait != null) views.setImageViewBitmap(R.id.us_noi_portrait, portrait);
        views.setContentDescription(R.id.us_noi_root,
            couple.distanceText.isEmpty() ? "Noi: apri la pagina della coppia" :
            "Noi: " + (couple.distanceStale ? "ultima distanza " : "distanza ") + couple.distanceText + ". Apri Noi");
        return views;
    }
}
