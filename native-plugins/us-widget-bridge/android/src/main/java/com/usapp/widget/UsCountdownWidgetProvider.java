package com.usapp.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import org.json.JSONObject;

public final class UsCountdownWidgetProvider extends AppWidgetProvider {
    private static final ZoneId ROME = ZoneId.of("Europe/Rome");
    private static final long DAY_MS = 86_400_000L;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        updateAll(context, manager, appWidgetIds);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int appWidgetId, android.os.Bundle newOptions) {
        manager.updateAppWidget(appWidgetId, render(context, new UsWidgetSnapshotStore(context).read()));
    }

    static void updateAll(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        JSONObject snapshot = new UsWidgetSnapshotStore(context).read();
        for (int id : appWidgetIds) manager.updateAppWidget(id, render(context, snapshot));
    }

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName component = new ComponentName(context, UsCountdownWidgetProvider.class);
        updateAll(context, manager, manager.getAppWidgetIds(component));
    }

    private static RemoteViews render(Context context, JSONObject snapshot) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.us_widget_countdown);
        views.setOnClickPendingIntent(R.id.us_countdown_widget_root, launchIntent(context));
        views.setTextViewText(R.id.us_countdown_widget_brand, context.getString(R.string.us_widget_countdown_brand));

        JSONObject modules = snapshot == null ? null : snapshot.optJSONObject("modules");
        JSONObject countdown = modules == null ? null : modules.optJSONObject("countdown");
        if (countdown == null || !countdown.optBoolean("active", false)) {
            empty(context, views);
            return views;
        }

        String title = countdown.optString("title", "").trim();
        if (title.isEmpty()) title = "Il nostro momento";
        String mode = countdown.optString("mode", "");
        String target = countdown.optString("target", "");
        views.setTextViewText(R.id.us_countdown_widget_title, title);
        views.setViewVisibility(R.id.us_countdown_widget_empty, View.GONE);
        views.setViewVisibility(R.id.us_countdown_widget_title, View.VISIBLE);

        try {
            if (mode.equals("relationship")) {
                LocalDate started = LocalDate.parse(target);
                long days = Math.max(0, ChronoUnit.DAYS.between(started, LocalDate.now(ROME)));
                showValue(views, Long.toString(days), days == 1 ? "giorno" : "giorni", "");
                return views;
            }
            if (mode.equals("days")) {
                LocalDate date = LocalDate.parse(target);
                long days = Math.max(0, ChronoUnit.DAYS.between(LocalDate.now(ROME), date));
                showValue(views, Long.toString(days), days == 1 ? "giorno" : "giorni", days == 0 ? "Ci siamo" : "");
                return views;
            }
            if (mode.equals("clock")) {
                Instant targetInstant = Instant.parse(target);
                long remaining = Math.max(0, Duration.between(Instant.now(), targetInstant).toMillis());
                if (remaining < DAY_MS) {
                    showClock(views, remaining);
                } else {
                    long days = remaining / DAY_MS;
                    long hours = (remaining % DAY_MS) / 3_600_000L;
                    showValue(views, Long.toString(days), days == 1 ? "giorno" : "giorni", hours > 0 ? hours + "h ancora" : "");
                }
                return views;
            }
        } catch (Exception ignored) {
            // Invalid semantic state is treated as unavailable, never as zero.
        }
        empty(context, views);
        return views;
    }

    private static void showValue(RemoteViews views, String value, String unit, String sub) {
        views.setViewVisibility(R.id.us_countdown_widget_value, View.VISIBLE);
        views.setViewVisibility(R.id.us_countdown_widget_clock, View.GONE);
        views.setViewVisibility(R.id.us_countdown_widget_unit, View.VISIBLE);
        views.setViewVisibility(R.id.us_countdown_widget_sub, sub.isEmpty() ? View.GONE : View.VISIBLE);
        views.setTextViewText(R.id.us_countdown_widget_value, value);
        views.setTextViewText(R.id.us_countdown_widget_unit, unit);
        views.setTextViewText(R.id.us_countdown_widget_sub, sub);
    }

    private static void showClock(RemoteViews views, long remainingMs) {
        views.setViewVisibility(R.id.us_countdown_widget_value, View.GONE);
        views.setViewVisibility(R.id.us_countdown_widget_clock, View.VISIBLE);
        views.setViewVisibility(R.id.us_countdown_widget_unit, View.GONE);
        views.setViewVisibility(R.id.us_countdown_widget_sub, remainingMs <= 0 ? View.VISIBLE : View.GONE);
        long base = SystemClock.elapsedRealtime() + remainingMs;
        views.setChronometer(R.id.us_countdown_widget_clock, base, "%s", true);
        views.setChronometerCountDown(R.id.us_countdown_widget_clock, true);
        views.setTextViewText(R.id.us_countdown_widget_sub, remainingMs <= 0 ? "Ci siamo" : "");
    }

    private static void empty(Context context, RemoteViews views) {
        views.setViewVisibility(R.id.us_countdown_widget_title, View.GONE);
        views.setViewVisibility(R.id.us_countdown_widget_value, View.GONE);
        views.setViewVisibility(R.id.us_countdown_widget_clock, View.GONE);
        views.setViewVisibility(R.id.us_countdown_widget_unit, View.GONE);
        views.setViewVisibility(R.id.us_countdown_widget_sub, View.GONE);
        views.setViewVisibility(R.id.us_countdown_widget_empty, View.VISIBLE);
        views.setTextViewText(R.id.us_countdown_widget_empty, context.getString(R.string.us_widget_countdown_empty));
    }

    private static PendingIntent launchIntent(Context context) {
        Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (intent == null) intent = new Intent();
        intent.setPackage(context.getPackageName());
        intent.setAction("com.usapp.us.WIDGET_COUNTDOWN_OPEN");
        intent.setData(Uri.parse("us://widget/countdown/open"));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, 4201, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
