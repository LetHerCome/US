package com.usapp.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;
import android.widget.RemoteViews;

/**
 * La domanda di oggi 4x2: today's question and whose turn it is, never an
 * answer. A tap opens the question in US. At midnight in Rome it asks to
 * open US for the new one: the widget never reads the network.
 */
public final class UsDailyWidgetProvider extends AppWidgetProvider {
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        UsWidgets.refreshAll(context);
    }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        UsWidgets.refresh(context, UsWidgets.DAILY, id);
    }
    @Override public void onDisabled(Context context) { UsWidgets.refreshAll(context); }

    static RemoteViews render(Context context, UsWidgets.State state) {
        UsWidgetModels.Daily daily = UsWidgetModels.daily(state.snapshot, state.now);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.us_widget_daily);
        views.setOnClickPendingIntent(R.id.us_daily_root, UsWidgets.open(context, "daily", 4501));
        String partner = UsWidgetContract.optObject(state.snapshot, "think").optString("partnerName", "");
        String question = daily.shown() ? daily.question : context.getString(R.string.us_widget_daily_open);
        String status;
        switch (daily.state) {
            case "todo": status = context.getString(R.string.us_widget_daily_todo); break;
            case "your_turn": status = partner.isEmpty() ? context.getString(R.string.us_widget_daily_your_turn_plain)
                : context.getString(R.string.us_widget_daily_your_turn, partner); break;
            case "waiting": status = partner.isEmpty() ? context.getString(R.string.us_widget_daily_waiting_plain)
                : context.getString(R.string.us_widget_daily_waiting, partner); break;
            case "ready": status = context.getString(R.string.us_widget_daily_ready); break;
            default: status = context.getString(R.string.us_widget_daily_new);
        }
        views.setTextViewText(R.id.us_daily_question, question);
        views.setTextViewText(R.id.us_daily_status, status);
        views.setContentDescription(R.id.us_daily_root,
            context.getString(R.string.us_widget_daily_name) + ". " + question + ". " + status);
        // The question turns at midnight in Rome.
        if (daily.shown()) state.needsUpdateAt(UsWidgetModels.nextRomeMidnight(state.now));
        return views;
    }
}
