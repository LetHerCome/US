package com.usapp.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;

/**
 * Countdown: the native face of the same Countdown selected in Oggi. It has
 * no editor and no data of its own; it renders the semantic selection
 * (together / days / clock + style) and ticks natively in the final day.
 */
public final class UsCountdownWidgetProvider extends AppWidgetProvider {
    private static final int[] VALUES = { R.id.us_cd_value_light, R.id.us_cd_value_serif, R.id.us_cd_value_bold };
    private static final int[] CLOCKS = { R.id.us_cd_clock_light, R.id.us_cd_clock_serif, R.id.us_cd_clock_bold };
    private static final int LIGHT = 0, SERIF = 1, BOLD = 2;

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

    /** How each US Countdown style translates to RemoteViews constraints. */
    static final class Look {
        int background = R.drawable.us_widget_background;
        int deco = 0;
        int titleBackground = 0;
        int titleColor = 0xE6FFF8FD;
        int face = LIGHT;
        int valueColor = 0xFFFFF8FD;
        boolean unitCaps = false;
        int unitColor = 0xF0FFF8FD;
        int subColor = 0xFFFF8EAD;
    }

    static Look look(String style) {
        Look look = new Look();
        switch (style == null ? "" : style) {
            case "signal":
                look.background = R.drawable.us_widget_cd_signal_bg;
                look.titleBackground = R.drawable.us_widget_cd_signal_tag;
                look.titleColor = 0xFFF3D28B;
                look.face = BOLD;
                look.valueColor = 0xFFF4EFE4;
                look.unitCaps = true;
                look.unitColor = 0xD1F4EFE4;
                look.subColor = 0xFFF3D28B;
                break;
            case "glass":
                look.background = R.drawable.us_widget_cd_glass_bg;
                look.unitColor = 0xE6FFFFFF;
                look.subColor = 0xE6FFFFFF;
                break;
            case "aurora":
                look.background = R.drawable.us_widget_cd_aurora_bg;
                look.deco = R.drawable.us_widget_cd_aurora_glow;
                look.titleColor = 0xFFFFF4ED;
                look.face = SERIF;
                look.valueColor = 0xFFFFC8DF;
                look.unitCaps = true;
                look.unitColor = 0xFFF5DCF0;
                look.subColor = 0xFFDDD2FF;
                break;
            case "orbit":
                look.deco = R.drawable.us_widget_cd_orbit_ring;
                look.titleColor = 0xD9FFEBDC;
                look.subColor = 0xFFFFD5AA;
                break;
            case "chrome":
                look.titleBackground = R.drawable.us_widget_cd_chrome_tag;
                look.titleColor = 0xFF262C37;
                look.face = BOLD;
                look.valueColor = 0xFFE0E6EF;
                look.unitCaps = true;
                look.unitColor = 0xFFE3E7EE;
                look.subColor = 0xFFE3E7EE;
                break;
            default:
                break;
        }
        return look;
    }

    static RemoteViews render(Context context, UsWidgets.State state) {
        UsWidgetModels.Countdown model = UsWidgetModels.countdown(state.snapshot, state.now);
        state.needsUpdateAt(model.nextChange);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.us_widget_countdown);
        views.setOnClickPendingIntent(R.id.us_cd_root, UsWidgets.open(context, "countdown", 4201));
        Look look = look(model.style);
        views.setInt(R.id.us_cd_root, "setBackgroundResource", look.background);
        for (int id : VALUES) views.setViewVisibility(id, View.GONE);
        for (int id : CLOCKS) {
            views.setChronometer(id, SystemClock.elapsedRealtime(), null, false);
            views.setViewVisibility(id, View.GONE);
        }
        if (model.empty) {
            views.setViewVisibility(R.id.us_cd_deco, View.GONE);
            views.setViewVisibility(R.id.us_cd_title, View.GONE);
            views.setViewVisibility(R.id.us_cd_unit_serif, View.GONE);
            views.setViewVisibility(R.id.us_cd_unit_caps, View.GONE);
            views.setViewVisibility(R.id.us_cd_sub, View.GONE);
            views.setViewVisibility(R.id.us_cd_empty, View.VISIBLE);
            views.setTextViewText(R.id.us_cd_empty, context.getString(state.snapshot == null ? R.string.us_widget_connect : R.string.us_widget_countdown_empty));
            views.setContentDescription(R.id.us_cd_root, context.getString(R.string.us_widget_countdown_name));
            return views;
        }
        views.setViewVisibility(R.id.us_cd_empty, View.GONE);
        views.setViewVisibility(R.id.us_cd_deco, look.deco == 0 ? View.GONE : View.VISIBLE);
        if (look.deco != 0) views.setImageViewResource(R.id.us_cd_deco, look.deco);
        views.setViewVisibility(R.id.us_cd_title, View.VISIBLE);
        views.setTextViewText(R.id.us_cd_title, model.title);
        views.setTextColor(R.id.us_cd_title, look.titleColor);
        views.setInt(R.id.us_cd_title, "setBackgroundResource", look.titleBackground);

        if (model.ticking) {
            int clock = CLOCKS[look.face];
            views.setViewVisibility(clock, View.VISIBLE);
            views.setTextColor(clock, look.valueColor);
            // Counts down on its own with US closed; the alarm at the target redraws "Ci siamo".
            views.setChronometer(clock, SystemClock.elapsedRealtime() + model.remainingMs, null, true);
            views.setChronometerCountDown(clock, true);
        } else {
            int value = VALUES[look.face];
            views.setViewVisibility(value, View.VISIBLE);
            views.setTextViewText(value, model.value);
            views.setTextColor(value, look.valueColor);
        }
        int unit = look.unitCaps ? R.id.us_cd_unit_caps : R.id.us_cd_unit_serif;
        views.setViewVisibility(R.id.us_cd_unit_caps, View.GONE);
        views.setViewVisibility(R.id.us_cd_unit_serif, View.GONE);
        if (!model.unit.isEmpty()) {
            views.setViewVisibility(unit, View.VISIBLE);
            views.setTextViewText(unit, model.unit);
            views.setTextColor(unit, look.unitColor);
        }
        views.setViewVisibility(R.id.us_cd_sub, model.sub.isEmpty() ? View.GONE : View.VISIBLE);
        views.setTextViewText(R.id.us_cd_sub, model.sub);
        views.setTextColor(R.id.us_cd_sub, look.subColor);
        String spoken = model.ticking ? model.title + ", ultimo giorno" : model.title + ", " + model.value + " " + model.unit + " " + model.sub;
        views.setContentDescription(R.id.us_cd_root, spoken.trim());
        return views;
    }
}
