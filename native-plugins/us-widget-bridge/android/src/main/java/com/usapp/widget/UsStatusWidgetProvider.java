package com.usapp.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;
import android.widget.RemoteViews;
import org.json.JSONObject;

/**
 * Come stai, Pastello (approved board, 02/11/2026; docs/missions/widget-come-stai-v1.md).
 * 2x2: the partner's state, big, with "innamorata · da 1 ora". 4x2: you on a
 * rosa half and the partner on a lilla half, a heart between. A state lasts
 * twelve hours. The tap opens the twelve in US: the widget never writes.
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
        String name = UsWidgetContract.optObject(state.snapshot, "think").optString("partnerName", "").trim();
        if (name.isEmpty()) name = "La tua persona";
        int meColour = UsWidgetModels.personColor(state.snapshot, true);
        int partnerColour = UsWidgetModels.personColor(state.snapshot, false);

        RemoteViews small = new RemoteViews(context.getPackageName(), R.layout.us_widget_status);
        RemoteViews medium = new RemoteViews(context.getPackageName(), R.layout.us_widget_status_medium);
        for (RemoteViews views : new RemoteViews[] { small, medium }) {
            views.setOnClickPendingIntent(R.id.us_status_root, UsWidgets.open(context, "status", 4801));
            UsWidgets.avatar(views, state.store.readNoiPortrait("partner"), R.id.us_status_partner_avatar, partnerColour);
            views.setTextViewText(R.id.us_status_partner_name, name);
            person(views, partner, R.id.us_status_partner_emoji, R.id.us_status_partner_line, "…", "ancora niente");
        }
        UsWidgets.avatar(medium, state.store.readNoiPortrait("me"), R.id.us_status_me_avatar, meColour);
        person(medium, me, R.id.us_status_me_emoji, R.id.us_status_me_line, "＋", "Scegli come stai in Oggi");
        small.setContentDescription(R.id.us_status_root, spoken(name, partner) + ". Apri Come stai");
        medium.setContentDescription(R.id.us_status_root, "Tu: " + (me.shown ? me.line : "nessuno stato") + ". " + spoken(name, partner) + ". Apri Come stai");
        return UsWidgets.sized(options, small, medium);
    }

    private static void person(RemoteViews views, UsWidgetModels.StatusPerson person, int emoji, int line, String emptyEmoji, String emptyLine) {
        views.setTextViewText(emoji, person.shown ? person.emoji : emptyEmoji);
        views.setTextViewText(line, person.shown ? person.line : emptyLine);
    }

    static String spoken(String name, UsWidgetModels.StatusPerson partner) {
        return name + ": " + (partner.shown ? partner.line : "nessuno stato");
    }
}
