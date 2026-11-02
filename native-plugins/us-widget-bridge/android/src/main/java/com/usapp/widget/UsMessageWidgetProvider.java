package com.usapp.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

/**
 * Lasciato per te, Pastello (approved board, 02/11/2026); it replaces
 * Messaggio. The partner's portrait and, in a white bubble, what they left
 * that is still closed for me ("Ti ha lasciato una foto") with how long ago;
 * the tap opens it in US. Only the kind and the time (founder, 31/10/2026:
 * "Solo tipo e ora"): never the words, photo or link. 2x2 and 4x2.
 */
public final class UsMessageWidgetProvider extends AppWidgetProvider {
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        UsWidgets.refreshAll(context);
    }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        UsWidgets.refresh(context, UsWidgets.MESSAGE, id);
    }
    @Override public void onDisabled(Context context) { UsWidgets.refreshAll(context); }

    static RemoteViews render(Context context, UsWidgets.State state, Bundle options) {
        UsWidgetModels.Message message = UsWidgetModels.message(state.snapshot, state.now);
        state.needsUpdateAt(message.nextChange);
        String partner = UsWidgetContract.optObject(state.snapshot, "think").optString("partnerName", "").trim();
        RemoteViews small = fill(context, state, message, partner, R.layout.us_widget_message);
        RemoteViews medium = fill(context, state, message, partner, R.layout.us_widget_message_medium);
        small.setTextViewText(R.id.us_message_when, message.when);
        // 4x2: "la scopri solo dentro US", "Bea · 10 min fa" and the "Apri" pill.
        medium.setTextViewText(R.id.us_message_hint, message.hint);
        medium.setViewVisibility(R.id.us_message_hint, message.hint.isEmpty() ? View.GONE : View.VISIBLE);
        String who = partner.isEmpty() || message.when.isEmpty() ? partner + message.when : partner + " · " + message.when;
        medium.setTextViewText(R.id.us_message_who, who);
        medium.setViewVisibility(R.id.us_message_open, message.empty ? View.GONE : View.VISIBLE);
        return UsWidgets.sized(options, small, medium);
    }

    private static RemoteViews fill(Context context, UsWidgets.State state, UsWidgetModels.Message message, String partner, int layout) {
        RemoteViews views = new RemoteViews(context.getPackageName(), layout);
        views.setOnClickPendingIntent(R.id.us_message_root, UsWidgets.open(context, message.destination, 4601));
        UsWidgets.avatar(views, state.store.readNoiPortrait("partner"), R.id.us_message_photo, UsWidgetModels.personColor(state.snapshot, false));
        views.setTextViewText(R.id.us_message_text, message.text);
        views.setContentDescription(R.id.us_message_root, description(message, partner));
        return views;
    }

    static String description(UsWidgetModels.Message message, String partner) {
        if (message.empty) return message.text;
        String who = partner.isEmpty() ? "L’altra persona" : partner;
        return who + " " + Character.toLowerCase(message.text.charAt(0)) + message.text.substring(1)
            + (message.when.isEmpty() ? "" : ", " + message.when) + ". Apri US";
    }
}
