package com.usapp.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

/** Ti penso. Class name is stable: widgets already on a Home screen keep working. */
public class UsThinkWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        UsWidgets.refreshAll(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int appWidgetId, Bundle newOptions) {
        UsWidgets.refresh(context, UsWidgets.THINK, appWidgetId);
    }

    @Override
    public void onDisabled(Context context) {
        UsWidgets.refreshAll(context);
    }

    static RemoteViews render(Context context, UsWidgets.State state) {
        UsWidgetModels.Think model = UsWidgetModels.think(state.snapshot, state.action, state.hasCredential, state.now);
        state.needsUpdateAt(model.nextChange);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.us_widget_think);
        views.setTextViewText(R.id.us_widget_message, model.message);
        views.setTextViewText(R.id.us_widget_cta, model.cta);
        int sent24h = state.store.countThinkSent24h(state.now);
        views.setTextViewText(R.id.us_widget_count_24h, sent24h + " inviati · 24h");
        state.needsUpdateAt(state.store.nextThinkExpiry(state.now));
        views.setViewVisibility(R.id.us_widget_heart, model.pulse ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.us_widget_heart_pulse, model.pulse ? View.VISIBLE : View.GONE);
        views.setInt(R.id.us_widget_heart, "setImageAlpha", model.busy && !model.pulse ? 140 : 255);
        views.setContentDescription(R.id.us_widget_heart, model.canSend ? context.getString(R.string.us_widget_send) : context.getString(R.string.us_widget_open));
        views.setOnClickPendingIntent(R.id.us_widget_root, UsWidgets.open(context, "think", 4101));
        // The heart sends only when sending makes sense; otherwise it opens US.
        PendingIntent heart = model.canSend ? sendIntent(context) : UsWidgets.open(context, "think", 4101);
        views.setOnClickPendingIntent(R.id.us_widget_heart, heart);
        views.setOnClickPendingIntent(R.id.us_widget_heart_pulse, heart);
        views.setOnClickPendingIntent(R.id.us_widget_cta, heart);
        return views;
    }

    private static PendingIntent sendIntent(Context context) {
        Intent intent = new Intent(context, UsThinkWidgetActionReceiver.class);
        intent.setAction(UsThinkWidgetActionReceiver.ACTION_SEND_THINK);
        return PendingIntent.getBroadcast(context, 4102, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
