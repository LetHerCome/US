package com.usapp.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;
import android.widget.RemoteViews;
import org.json.JSONObject;

/**
 * Come stai (founder, 04/11/2026; docs/missions/widget-come-stai-v1.md): only
 * your two round portraits, each with its emoji as a sticker, in 2x2 and 4x2.
 * No names, no lines: the tap opens the twelve in US, the widget never writes.
 * A state lasts twelve hours.
 */
public final class UsStatusWidgetProvider extends AppWidgetProvider {
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        UsWidgets.refreshAll(context);
    }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        UsWidgets.refresh(context, UsWidgets.STATUS, id);
    }
    @Override public void onDisabled(Context context) { UsWidgets.refreshAll(context); }

    static RemoteViews render(Context context, UsWidgets.State state, Bundle options) {
        JSONObject status = UsWidgetContract.optObject(state.snapshot, "status");
        UsWidgetModels.StatusPerson me = UsWidgetModels.statusPerson(UsWidgetContract.optObject(status, "me"), state.now);
        UsWidgetModels.StatusPerson partner = UsWidgetModels.statusPerson(UsWidgetContract.optObject(status, "partner"), state.now);
        state.needsUpdateAt(me.nextChange);
        state.needsUpdateAt(partner.nextChange);
        String partnerName = UsWidgetContract.optObject(state.snapshot, "think").optString("partnerName", "").trim();
        String name = partnerName.isEmpty() ? "La tua persona" : partnerName;
        byte[] mine = state.store.readNoiPortrait("me");
        byte[] theirs = state.store.readNoiPortrait("partner");

        RemoteViews small = new RemoteViews(context.getPackageName(), R.layout.us_widget_status);
        RemoteViews medium = new RemoteViews(context.getPackageName(), R.layout.us_widget_status_medium);
        UsWidgetArt.art(small, context, R.id.us_status_art, R.id.us_status_grain, R.drawable.us_widget_art_status_s, options, false);
        UsWidgetArt.art(medium, context, R.id.us_status_art, R.id.us_status_grain, R.drawable.us_widget_art_status_m, options, true);
        String spoken = "Tu: " + (me.shown ? me.line : "nessuno stato") + ". " + spoken(name, partner) + ". Apri Come stai";
        for (RemoteViews views : new RemoteViews[] { small, medium }) {
            int size = views == small ? 60 : 96;
            views.setOnClickPendingIntent(R.id.us_status_root, UsWidgets.open(context, "status", 4801));
            UsWidgetArt.avatar(views, context, mine, R.id.us_status_me_avatar, R.id.us_status_me_initial, "Tu", size);
            UsWidgetArt.avatar(views, context, theirs, R.id.us_status_partner_avatar, R.id.us_status_partner_initial, partnerName, size);
            views.setTextViewText(R.id.us_status_me_emoji, me.shown ? me.emoji : "＋");
            views.setTextViewText(R.id.us_status_partner_emoji, partner.shown ? partner.emoji : "…");
            views.setContentDescription(R.id.us_status_root, spoken);
        }
        return UsWidgets.sized(options, small, medium);
    }

    static String spoken(String name, UsWidgetModels.StatusPerson partner) {
        return name + ": " + (partner.shown ? partner.line : "nessuno stato");
    }
}
