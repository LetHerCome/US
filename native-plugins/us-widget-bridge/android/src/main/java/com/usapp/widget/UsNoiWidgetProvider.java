package com.usapp.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

/** Noi: the two names and the days together, recalculated natively every Rome midnight. */
public final class UsNoiWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        UsWidgets.refreshAll(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int appWidgetId, Bundle newOptions) {
        UsWidgets.refresh(context, UsWidgets.NOI, appWidgetId);
    }

    @Override
    public void onDisabled(Context context) {
        UsWidgets.refreshAll(context);
    }

    /** The equipped Oggi frame becomes a quiet accent; unknown frames keep the US pink. */
    static int frameColor(String frame) {
        switch (frame == null ? "" : frame) {
            case "aurora": return 0xFFFFC8DF;
            case "chrome": return 0xFFC9D1DC;
            case "glow": return 0xFFFFD9A8;
            case "negative": return 0xFFF2F2F2;
            case "polaroid": return 0xFFFFF8EE;
            case "scrapbook": return 0xFFE8C9A0;
            default: return 0xFFFF8EAD;
        }
    }

    static RemoteViews render(Context context, UsWidgets.State state) {
        UsWidgetModels.Couple model = UsWidgetModels.couple(state.snapshot, state.now);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.us_widget_noi);
        // Existing widget root still opens Noi; the dedicated CTA opens Gioca.
        views.setOnClickPendingIntent(R.id.us_noi_root, UsWidgets.open(context, "noi", 4401));
        int accent = frameColor(model.frame);
        views.setInt(R.id.us_noi_accent, "setColorFilter", accent);
        boolean connected = state.snapshot != null && model.days >= 0;
        views.setTextViewText(R.id.us_noi_title, connected ? model.todayInvitation : "Un momento per voi");
        views.setTextViewText(R.id.us_noi_cta, connected ? "GIOCA  ›" : "APRI US  ›");
        views.setTextColor(R.id.us_noi_days, accent);
        views.setTextViewText(R.id.us_noi_days, connected
            ? model.days + (model.days == 1 ? " giorno" : " giorni")
            : "US · NOI");
        if (connected) state.needsUpdateAt(model.nextChange);
        views.setOnClickPendingIntent(R.id.us_noi_cta,
            UsWidgets.open(context, connected ? "noi/play" : "noi", 4402));
        views.setContentDescription(R.id.us_noi_root, connected
            ? "Noi: " + model.todayInvitation + ". " + model.days + " giorni insieme. Apri Noi."
            : "Apri US per collegare il widget Noi");
        views.setContentDescription(R.id.us_noi_cta, connected ? "Apri Gioca in US" : "Apri US");
        return views;
    }
}
