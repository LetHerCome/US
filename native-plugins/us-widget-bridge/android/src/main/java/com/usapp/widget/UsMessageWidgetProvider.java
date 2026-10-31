package com.usapp.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

/**
 * Messaggio (founder, 31/10/2026): the partner's round photo, and in a latte
 * bubble with a small heart their last Ti penso or the Lasciato per te still
 * closed for me, with how long ago. The tap opens that message in US. Never
 * the words of a Lasciato per te: the snapshot only knows its kind and time.
 */
public final class UsMessageWidgetProvider extends AppWidgetProvider {
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        UsWidgets.refreshAll(context);
    }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        UsWidgets.refresh(context, UsWidgets.MESSAGE, id);
    }
    @Override public void onDisabled(Context context) { UsWidgets.refreshAll(context); }

    static RemoteViews render(Context context, UsWidgets.State state) {
        UsWidgetModels.Message message = UsWidgetModels.message(state.snapshot, state.now);
        state.needsUpdateAt(message.nextChange);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.us_widget_message);
        views.setOnClickPendingIntent(R.id.us_message_root, UsWidgets.open(context, message.destination, 4601));
        views.setTextViewText(R.id.us_message_text, message.text);
        views.setViewVisibility(R.id.us_message_when, message.when.isEmpty() ? View.GONE : View.VISIBLE);
        views.setTextViewText(R.id.us_message_when, message.when);
        // A full heart for a message, its outline while nothing has arrived.
        views.setImageViewResource(R.id.us_message_heart, message.empty ? R.drawable.us_widget_heart_outline : R.drawable.us_widget_heart);
        views.setInt(R.id.us_message_heart, "setColorFilter", 0xFFFF7C96);
        Bitmap photo = null;
        byte[] raw = state.store.readNoiPortrait("partner");
        if (raw != null) {
            try { photo = BitmapFactory.decodeByteArray(raw, 0, raw.length); }
            catch (RuntimeException ignored) {}
        }
        views.setViewVisibility(R.id.us_message_photo, photo == null ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.us_message_empty, photo == null ? View.VISIBLE : View.GONE);
        if (photo != null) views.setImageViewBitmap(R.id.us_message_photo, photo);
        String partner = UsWidgetContract.optObject(state.snapshot, "think").optString("partnerName", "").trim();
        String who = partner.isEmpty() ? "L’altra persona" : partner;
        views.setContentDescription(R.id.us_message_root, message.empty
            ? message.text
            : who + " " + Character.toLowerCase(message.text.charAt(0)) + message.text.substring(1)
                + (message.when.isEmpty() ? "" : ", " + message.when) + ". Apri US");
        return views;
    }
}
