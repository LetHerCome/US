package com.usapp.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;
import android.text.Layout;
import android.view.View;
import android.widget.RemoteViews;

/**
 * Lasciato per te (founder, 04/11/2026): a letter. The sealed envelope is the
 * art; at the top, in Fraunces, what they left that is still closed for me
 * ("Ti ha lasciato una foto") and "da Bea · 10 min fa"; the tap opens it in
 * US. The surprise stays closed: only the kind and the time (founder,
 * 31/10/2026: "Solo tipo e ora"), never the words, photo or link. 2x2 and 4x2.
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
        RemoteViews small = fill(context, state, message, partner, R.layout.us_widget_message, R.drawable.us_widget_art_message_s, options, false);
        RemoteViews medium = fill(context, state, message, partner, R.layout.us_widget_message_medium, R.drawable.us_widget_art_message_m, options, true);
        UsWidgetArt.serif(small, context, R.id.us_message_text, message.text, 18f, 140, 3, false, Layout.Alignment.ALIGN_NORMAL);
        UsWidgetArt.serif(medium, context, R.id.us_message_text, message.text, 21f, 300, 2, false, Layout.Alignment.ALIGN_NORMAL);
        // "da Bea · 10 min fa" under it; the 4x2 adds "la scopri solo dentro US".
        String who = partner.isEmpty() || message.empty ? message.when
            : message.when.isEmpty() ? "da " + partner : "da " + partner + " · " + message.when;
        for (RemoteViews views : new RemoteViews[] { small, medium }) {
            views.setTextViewText(R.id.us_message_when, who);
            views.setViewVisibility(R.id.us_message_when, who.isEmpty() ? View.GONE : View.VISIBLE);
        }
        medium.setTextViewText(R.id.us_message_hint, message.hint);
        medium.setViewVisibility(R.id.us_message_hint, message.hint.isEmpty() ? View.GONE : View.VISIBLE);
        return UsWidgets.sized(options, small, medium);
    }

    private static RemoteViews fill(Context context, UsWidgets.State state, UsWidgetModels.Message message, String partner, int layout, int art, Bundle options, boolean wide) {
        RemoteViews views = new RemoteViews(context.getPackageName(), layout);
        views.setOnClickPendingIntent(R.id.us_message_root, UsWidgets.open(context, message.destination, 4601));
        UsWidgetArt.art(views, context, R.id.us_message_art, R.id.us_message_grain, art, options, wide);
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
