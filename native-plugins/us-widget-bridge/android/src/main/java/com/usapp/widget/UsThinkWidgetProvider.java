package com.usapp.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.widget.RemoteViews;

/**
 * Ti penso (founder, 04/11/2026): only a heart. Empty, rosa outline, until it
 * is tapped; the tap opens UsThinkHeartActivity, which sends at once and fills
 * the heart with a pop over the Home screen; the widget then shows it full
 * for a few seconds ("Inviato", without waiting for the server) and empties
 * again. Without the send credential the heart is quieter and opens US. 2x2
 * and 4x2, the same heart. The class name is stable: placed widgets keep working.
 */
public class UsThinkWidgetProvider extends AppWidgetProvider {
    private static final int ROSA = 0xFFFF7C96;

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

    static RemoteViews render(Context context, UsWidgets.State state, Bundle options) {
        UsWidgetModels.Think model = UsWidgetModels.think(state.snapshot, state.action, state.hasCredential, state.now);
        state.needsUpdateAt(model.nextChange);
        RemoteViews small = fill(context, new RemoteViews(context.getPackageName(), R.layout.us_widget_think), model, options, false);
        RemoteViews medium = fill(context, new RemoteViews(context.getPackageName(), R.layout.us_widget_think_medium), model, options, true);
        return UsWidgets.sized(options, small, medium);
    }

    private static RemoteViews fill(Context context, RemoteViews views, UsWidgetModels.Think model, Bundle options, boolean wide) {
        UsWidgetArt.art(views, context, R.id.us_think_art, R.id.us_think_grain, wide ? R.drawable.us_widget_art_think_m : R.drawable.us_widget_art_think_s, options, wide);
        views.setImageViewResource(R.id.us_widget_heart, model.done ? R.drawable.us_widget_pastel_heart : R.drawable.us_widget_heart_outline);
        views.setInt(R.id.us_widget_heart, "setColorFilter", ROSA);
        views.setInt(R.id.us_widget_heart, "setImageAlpha", !model.canSend || (model.busy && !model.done) ? 140 : 255);
        String said = model.canSend ? context.getString(R.string.us_widget_send) : context.getString(R.string.us_widget_open);
        views.setContentDescription(R.id.us_widget_root, model.line.isEmpty() ? said : model.line + (model.when.isEmpty() ? "" : ", " + model.when) + ". " + said);
        // The whole widget is the heart. Busy: the tap reaches the receiver, which ignores it, without a second pop.
        PendingIntent heart = !model.canSend ? UsWidgets.open(context, "think", 4101) : model.busy ? sendIntent(context) : heartIntent(context);
        views.setOnClickPendingIntent(R.id.us_widget_root, heart);
        return views;
    }

    /** The heart: the app's animation over the Home screen, the send at once. */
    private static PendingIntent heartIntent(Context context) {
        Intent intent = new Intent(context, UsThinkHeartActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_ANIMATION | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS);
        return PendingIntent.getActivity(context, 4103, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent sendIntent(Context context) {
        Intent intent = new Intent(context, UsThinkWidgetActionReceiver.class);
        intent.setAction(UsThinkWidgetActionReceiver.ACTION_SEND_THINK);
        return PendingIntent.getBroadcast(context, 4102, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
