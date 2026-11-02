package com.usapp.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;

/**
 * Countdown, Pastello (approved board, 02/11/2026): the native face of the
 * same Countdown selected in Oggi. It has no editor and no data of its own;
 * it renders the semantic selection (together / days / clock) and ticks
 * natively in the final day. 2x2: "Mancano", the number, "giorni · Lisbona"
 * and the bar of the last two weeks; 4x2: the sky, "Lisbona · 14 novembre",
 * the number with the hours, 14 ticks. One look for every Countdown style.
 */
public final class UsCountdownWidgetProvider extends AppWidgetProvider {
    private static final int[] TICKS = {
        R.id.us_cd_tick_0, R.id.us_cd_tick_1, R.id.us_cd_tick_2, R.id.us_cd_tick_3, R.id.us_cd_tick_4,
        R.id.us_cd_tick_5, R.id.us_cd_tick_6, R.id.us_cd_tick_7, R.id.us_cd_tick_8, R.id.us_cd_tick_9,
        R.id.us_cd_tick_10, R.id.us_cd_tick_11, R.id.us_cd_tick_12, R.id.us_cd_tick_13
    };

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        UsWidgets.refreshAll(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int appWidgetId, Bundle newOptions) {
        UsWidgets.refresh(context, UsWidgets.COUNTDOWN, appWidgetId);
    }

    @Override
    public void onDisabled(Context context) {
        UsWidgets.refreshAll(context);
    }

    static RemoteViews render(Context context, UsWidgets.State state, Bundle options) {
        UsWidgetModels.Countdown model = UsWidgetModels.countdown(state.snapshot, state.now);
        state.needsUpdateAt(model.nextChange);
        RemoteViews small = fill(context, state, model, R.layout.us_widget_countdown);
        RemoteViews medium = fill(context, state, model, R.layout.us_widget_countdown_medium);
        if (!model.empty) {
            small.setTextViewText(R.id.us_cd_title, model.label);
            small.setTextViewText(R.id.us_cd_line, model.line);
            small.setProgressBar(R.id.us_cd_progress, 1000, model.progress, false);
            medium.setTextViewText(R.id.us_cd_title, model.headline);
            medium.setViewVisibility(R.id.us_cd_unit_column, model.ticking ? View.GONE : View.VISIBLE);
            medium.setTextViewText(R.id.us_cd_unit, model.unit);
            medium.setTextViewText(R.id.us_cd_sub, model.sub);
            medium.setViewVisibility(R.id.us_cd_sub, model.sub.isEmpty() ? View.GONE : View.VISIBLE);
            int lit = model.ticks();
            for (int i = 0; i < TICKS.length; i++) {
                medium.setImageViewResource(TICKS[i], i < lit ? R.drawable.us_widget_pastel_tick_on : R.drawable.us_widget_pastel_tick_off);
            }
        }
        return UsWidgets.sized(options, small, medium);
    }

    private static RemoteViews fill(Context context, UsWidgets.State state, UsWidgetModels.Countdown model, int layout) {
        RemoteViews views = new RemoteViews(context.getPackageName(), layout);
        views.setOnClickPendingIntent(R.id.us_cd_root, UsWidgets.open(context, "countdown", 4201));
        views.setChronometer(R.id.us_cd_clock, SystemClock.elapsedRealtime(), null, false);
        views.setViewVisibility(R.id.us_cd_clock, View.GONE);
        if (model.empty) {
            views.setViewVisibility(R.id.us_cd_content, View.GONE);
            views.setViewVisibility(R.id.us_cd_empty, View.VISIBLE);
            views.setTextViewText(R.id.us_cd_empty, context.getString(state.snapshot == null ? R.string.us_widget_connect : R.string.us_widget_countdown_empty));
            views.setContentDescription(R.id.us_cd_root, context.getString(R.string.us_widget_countdown_name));
            return views;
        }
        views.setViewVisibility(R.id.us_cd_empty, View.GONE);
        views.setViewVisibility(R.id.us_cd_content, View.VISIBLE);
        if (model.ticking) {
            views.setViewVisibility(R.id.us_cd_value, View.GONE);
            views.setViewVisibility(R.id.us_cd_clock, View.VISIBLE);
            // Counts down on its own with US closed; the alarm at the target redraws "Ci siamo".
            views.setChronometer(R.id.us_cd_clock, SystemClock.elapsedRealtime() + model.remainingMs, null, true);
            views.setChronometerCountDown(R.id.us_cd_clock, true);
        } else {
            views.setViewVisibility(R.id.us_cd_value, View.VISIBLE);
            views.setTextViewText(R.id.us_cd_value, model.value);
        }
        views.setContentDescription(R.id.us_cd_root, spoken(model));
        return views;
    }

    static String spoken(UsWidgetModels.Countdown model) {
        if (model.ticking) return model.title + ", ultimo giorno";
        String text = model.headline + ", " + model.value + " " + model.unit + (model.sub.isEmpty() ? "" : " " + model.sub);
        return text.trim();
    }
}
