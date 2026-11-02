package com.usapp.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.text.Layout;
import android.view.View;
import android.widget.RemoteViews;
import java.time.Instant;

/**
 * Ti penso, Foto protagonista (founder, 02/11/2026): an illustration, the
 * partner's round portrait (or the initial on a soft field), "Bea ti ha
 * pensato" in Fraunces and only the heart to answer, no "Ricambia". The heart
 * opens UsThinkHeartActivity: the send goes at once and the app's heart plays
 * over the Home screen; the widget turns into "Ricambiato · adesso" without
 * waiting for the server. 2x2 and 4x2 (with today's count). The class name is
 * stable: placed widgets keep working.
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
        byte[] avatar = state.store.readNoiPortrait("partner");
        RemoteViews small = fill(context, new RemoteViews(context.getPackageName(), R.layout.us_widget_think), model, avatar, options, false);
        RemoteViews medium = fill(context, new RemoteViews(context.getPackageName(), R.layout.us_widget_think_medium), model, avatar, options, true);
        UsWidgetArt.serif(small, context, R.id.us_think_line, model.line, 19f, 96, 3, false, Layout.Alignment.ALIGN_NORMAL);
        UsWidgetArt.serif(medium, context, R.id.us_think_line, model.line, 23f, 170, 2, false, Layout.Alignment.ALIGN_NORMAL);
        int count = UsWidgetModels.thinkCount(state.snapshot, state.store.countThinkSentSince(countSince(state), state.now), state.now);
        renderCount(context, medium, count);
        // The count turns at Rome midnight.
        state.needsUpdateAt(UsWidgetModels.nextRomeMidnight(state.now));
        return UsWidgets.sized(options, small, medium);
    }

    private static RemoteViews fill(Context context, RemoteViews views, UsWidgetModels.Think model, byte[] avatar, Bundle options, boolean wide) {
        UsWidgetArt.art(views, context, R.id.us_think_art, R.id.us_think_grain, wide ? R.drawable.us_widget_art_think_m : R.drawable.us_widget_art_think_s, options, wide);
        UsWidgetArt.avatar(views, context, avatar, R.id.us_think_avatar, R.id.us_think_initial, model.partner, wide ? 44 : 34);
        views.setTextViewText(R.id.us_think_when, model.when);
        views.setViewVisibility(R.id.us_think_when, model.when.isEmpty() ? View.INVISIBLE : View.VISIBLE);
        views.setTextViewText(R.id.us_think_hint, model.hint);
        views.setViewVisibility(R.id.us_think_hint, model.hint.isEmpty() ? View.GONE : View.VISIBLE);
        // Only the heart answers (founder, 02/11/2026: no "Ricambia"): frosted glass with a rosa
        // heart; full rosa with a white heart the moment it is tapped; quieter when it only opens US.
        UsWidgets.themedColor(views, context, R.id.us_widget_heart_bg, "setColorFilter", model.done ? ROSA : 0, model.done ? ROSA : 0);
        views.setInt(R.id.us_widget_heart, "setColorFilter", model.done ? 0xFFFFFFFF : ROSA);
        views.setInt(R.id.us_widget_heart, "setImageAlpha", !model.canSend || (model.busy && !model.done) ? 140 : 255);
        views.setContentDescription(R.id.us_widget_heart_button, model.canSend ? context.getString(R.string.us_widget_send) : context.getString(R.string.us_widget_open));
        views.setContentDescription(R.id.us_widget_root, model.line + (model.when.isEmpty() ? "" : ", " + model.when));
        views.setOnClickPendingIntent(R.id.us_widget_root, UsWidgets.open(context, "think", 4101));
        // Busy: the tap reaches the receiver, which ignores it, without a second animation.
        PendingIntent heart = !model.canSend ? UsWidgets.open(context, "think", 4101) : model.busy ? sendIntent(context) : heartIntent(context);
        views.setOnClickPendingIntent(R.id.us_widget_heart_button, heart);
        return views;
    }

    /** "12 volte oggi" in rosa Fraunces beside the heart (4x2 only); nothing when no one knows yet. */
    private static void renderCount(Context context, RemoteViews views, int count) {
        views.setViewVisibility(R.id.us_think_count_row, count < 0 ? View.GONE : View.VISIBLE);
        if (count > 0) UsWidgetArt.serif(views, context, R.id.us_think_count, Integer.toString(count), 30f, 90, 1, false, Layout.Alignment.ALIGN_NORMAL, ROSA, ROSA);
        else views.setViewVisibility(R.id.us_think_count, View.GONE);
        views.setTextViewText(R.id.us_think_count_label, count == 0 ? "Ancora nessuno oggi" : count == 1 ? "volta oggi" : "volte oggi");
    }

    /** The widget's own sends after the app last counted, and only today's. */
    private static Instant countSince(UsWidgets.State state) {
        Instant midnight = UsWidgetModels.romeToday(state.now).atStartOfDay(UsWidgetModels.ROME).toInstant();
        Instant counted = state.snapshot == null ? null : UsWidgetContract.instant(state.snapshot.optString("updatedAt", ""));
        return counted != null && counted.isAfter(midnight) ? counted : midnight;
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
