package com.usapp.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;
import java.time.Instant;

/**
 * Ti penso, Pastello (founder, 02/11/2026: "Beatrice ti ha pensato e sotto
 * ricambia, più veloce, toccando il cuore con la stessa animazione del Ti
 * penso dentro l'app"). The heart opens UsThinkHeartActivity: the send goes
 * at once and the app's heart plays over the Home screen; the widget turns
 * into "Ricambiato · adesso" without waiting for the server. 2x2 and 4x2
 * (with today's count). The class name is stable: placed widgets keep working.
 */
public class UsThinkWidgetProvider extends AppWidgetProvider {
    private static final int ROSA = 0xFFFF7C96;
    private static final int LILLA = 0xFFA98BFF;

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
        Bitmap avatar = decode(state.store.readNoiPortrait("partner"));
        RemoteViews small = fill(context, new RemoteViews(context.getPackageName(), R.layout.us_widget_think), model, avatar);
        RemoteViews medium = fill(context, new RemoteViews(context.getPackageName(), R.layout.us_widget_think_medium), model, avatar);
        int count = UsWidgetModels.thinkCount(state.snapshot, state.store.countThinkSentSince(countSince(state), state.now), state.now);
        renderCount(medium, count);
        // The count turns at Rome midnight.
        state.needsUpdateAt(UsWidgetModels.nextRomeMidnight(state.now));
        return UsWidgets.sized(options, small, medium);
    }

    private static RemoteViews fill(Context context, RemoteViews views, UsWidgetModels.Think model, Bitmap avatar) {
        views.setTextViewText(R.id.us_widget_message, model.line);
        views.setTextViewText(R.id.us_think_when, model.when);
        views.setViewVisibility(R.id.us_think_when, model.when.isEmpty() ? View.INVISIBLE : View.VISIBLE);
        views.setTextViewText(R.id.us_widget_cta, model.cta);
        if (avatar != null) {
            views.setImageViewBitmap(R.id.us_think_avatar, avatar);
            views.setInt(R.id.us_think_avatar, "setColorFilter", 0);
        } else {
            views.setImageViewResource(R.id.us_think_avatar, R.drawable.us_widget_pastel_circle);
            views.setInt(R.id.us_think_avatar, "setColorFilter", LILLA);
        }
        // White with a rosa heart; full rosa with a white heart the moment it is tapped.
        views.setInt(R.id.us_widget_heart_bg, "setColorFilter", model.done ? ROSA : 0xFFFFFFFF);
        views.setInt(R.id.us_widget_heart, "setColorFilter", model.done ? 0xFFFFFFFF : ROSA);
        views.setInt(R.id.us_widget_heart, "setImageAlpha", model.busy && !model.done ? 140 : 255);
        views.setContentDescription(R.id.us_widget_heart_button, model.canSend ? context.getString(R.string.us_widget_send) : context.getString(R.string.us_widget_open));
        views.setContentDescription(R.id.us_widget_root, model.line + (model.when.isEmpty() ? "" : ", " + model.when));
        views.setOnClickPendingIntent(R.id.us_widget_root, UsWidgets.open(context, "think", 4101));
        // Busy: the tap reaches the receiver, which ignores it, without a second animation.
        PendingIntent heart = !model.canSend ? UsWidgets.open(context, "think", 4101) : model.busy ? sendIntent(context) : heartIntent(context);
        views.setOnClickPendingIntent(R.id.us_widget_heart_button, heart);
        views.setOnClickPendingIntent(R.id.us_widget_cta, heart);
        return views;
    }

    /** "12 volte che vi siete pensati oggi" (4x2 only); nothing when no one knows yet. */
    private static void renderCount(RemoteViews views, int count) {
        views.setViewVisibility(R.id.us_think_count_row, count < 0 ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.us_think_count, count > 0 ? View.VISIBLE : View.GONE);
        views.setTextViewText(R.id.us_think_count, Integer.toString(Math.max(0, count)));
        views.setTextViewText(R.id.us_think_count_label, count == 0 ? "Oggi ancora nessun Ti penso"
            : count == 1 ? "volta che vi siete pensati oggi" : "volte che vi siete pensati oggi");
    }

    /** The widget's own sends after the app last counted, and only today's. */
    private static Instant countSince(UsWidgets.State state) {
        Instant midnight = UsWidgetModels.romeToday(state.now).atStartOfDay(UsWidgetModels.ROME).toInstant();
        Instant counted = state.snapshot == null ? null : UsWidgetContract.instant(state.snapshot.optString("updatedAt", ""));
        return counted != null && counted.isAfter(midnight) ? counted : midnight;
    }

    private static Bitmap decode(byte[] raw) {
        if (raw == null) return null;
        try { return BitmapFactory.decodeByteArray(raw, 0, raw.length); }
        catch (RuntimeException ignored) { return null; }
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
