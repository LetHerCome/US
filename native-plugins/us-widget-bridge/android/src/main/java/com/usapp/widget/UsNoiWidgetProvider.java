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
        views.setOnClickPendingIntent(R.id.us_noi_root, UsWidgets.open(context, "noi", 4401));
        int accent = frameColor(model.frame);
        views.setInt(R.id.us_noi_accent, "setColorFilter", accent);
        if (state.snapshot == null || model.days < 0) {
            views.setViewVisibility(R.id.us_noi_days, View.GONE);
            views.setViewVisibility(R.id.us_noi_unit, View.GONE);
            views.setTextViewText(R.id.us_noi_names, state.snapshot == null ? context.getString(R.string.us_widget_connect) : model.names);
            views.setContentDescription(R.id.us_noi_root, context.getString(R.string.us_widget_noi_name));
            return views;
        }
        state.needsUpdateAt(model.nextChange);
        views.setViewVisibility(R.id.us_noi_days, View.VISIBLE);
        views.setViewVisibility(R.id.us_noi_unit, View.VISIBLE);
        views.setTextViewText(R.id.us_noi_names, model.names.isEmpty() ? "Noi" : model.names);
        views.setTextViewText(R.id.us_noi_days, Long.toString(model.days));
        views.setTextViewText(R.id.us_noi_unit, model.days == 1 ? "giorno insieme" : "giorni insieme");
        views.setTextColor(R.id.us_noi_unit, accent);
        views.setContentDescription(R.id.us_noi_root, (model.names.isEmpty() ? "Noi" : model.names) + ", " + model.days + " giorni insieme");
        return views;
    }
}
