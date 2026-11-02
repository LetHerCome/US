package com.usapp.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;
import android.os.SystemClock;
import android.text.Layout;
import android.view.View;
import android.widget.RemoteViews;

/**
 * Countdown, Foto protagonista (founder, 02/11/2026): the native face of the
 * same Countdown selected in Oggi, always illustrated (a sun on the horizon).
 * It has no editor and no data of its own; it renders the semantic selection
 * (together / days / clock) and ticks natively in the final day. The frosted
 * "Mancano", the number in Fraunces, "giorni / Lisbona" in italic and the 14
 * ticks of the last two weeks; the 4x2 adds "Lisbona · 14 novembre · 4 ore".
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
        RemoteViews small = fill(context, state, model, R.layout.us_widget_countdown, R.drawable.us_widget_art_countdown_s, options, false);
        RemoteViews medium = fill(context, state, model, R.layout.us_widget_countdown_medium, R.drawable.us_widget_art_countdown_m, options, true);
        if (!model.empty) {
            // 2x2: "giorni / Lisbona" in italic beside the number. 4x2: "giorni", and the place and date under the ticks.
            UsWidgetArt.serif(small, context, R.id.us_cd_line, model.line.replace(" · ", "\n"), 15f, 90, 2, true, Layout.Alignment.ALIGN_NORMAL);
            UsWidgetArt.serif(medium, context, R.id.us_cd_line, model.unit, 17f, 120, 2, true, Layout.Alignment.ALIGN_NORMAL);
            String sub = model.headline + (model.sub.isEmpty() ? "" : " · " + model.sub);
            medium.setTextViewText(R.id.us_cd_sub, sub);
            medium.setViewVisibility(R.id.us_cd_sub, sub.isEmpty() ? View.GONE : View.VISIBLE);
        }
        return UsWidgets.sized(options, small, medium);
    }

    private static RemoteViews fill(Context context, UsWidgets.State state, UsWidgetModels.Countdown model, int layout, int art, Bundle options, boolean wide) {
        RemoteViews views = new RemoteViews(context.getPackageName(), layout);
        views.setOnClickPendingIntent(R.id.us_cd_root, UsWidgets.open(context, "countdown", 4201));
        UsWidgetArt.art(views, context, R.id.us_cd_art, R.id.us_cd_grain, art, options, wide);
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
        views.setTextViewText(R.id.us_cd_title, model.label);
        if (model.ticking) {
            views.setViewVisibility(R.id.us_cd_value, View.GONE);
            views.setViewVisibility(R.id.us_cd_clock, View.VISIBLE);
            // Counts down on its own with US closed; the alarm at the target redraws "Ci siamo".
            views.setChronometer(R.id.us_cd_clock, SystemClock.elapsedRealtime() + model.remainingMs, null, true);
            views.setChronometerCountDown(R.id.us_cd_clock, true);
        } else {
            UsWidgetArt.serif(views, context, R.id.us_cd_value, model.value, wide ? 64f : 56f, wide ? 200 : 110, 1, false, Layout.Alignment.ALIGN_NORMAL);
        }
        // The last two weeks: at 12 days 2 of 14 are lit, the day itself all of them.
        int lit = model.ticks();
        for (int i = 0; i < TICKS.length; i++) {
            views.setImageViewResource(TICKS[i], i < lit ? R.drawable.us_widget_pastel_tick_on : R.drawable.us_widget_pastel_tick_off);
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
