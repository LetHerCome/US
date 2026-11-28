package com.usapp.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;
import android.widget.RemoteViews;
import org.json.JSONObject;

/**
 * Come stai (founder, 04/11/2026; widget del redesign 26/11/2026, «Voi due»
 * of personaggi D11): your characters, with the face of your Come stai and
 * what you wear, your names and the state; the 2x2 is the other person. The
 * tap opens the twelve in US, the widget never writes. A state lasts twelve
 * hours; from 22 to 6 the characters sleep, as in the app.
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
        UsWidgetCharacter.Person mine = UsWidgetCharacter.person(state.snapshot, true);
        UsWidgetCharacter.Person theirs = UsWidgetCharacter.person(state.snapshot, false);
        String myFace = UsWidgetCharacter.face(state, true);
        String theirFace = UsWidgetCharacter.face(state, false);

        RemoteViews small = new RemoteViews(context.getPackageName(), R.layout.us_widget_status);
        RemoteViews medium = new RemoteViews(context.getPackageName(), R.layout.us_widget_status_medium);
        String spoken = "Tu: " + (me.shown ? me.line : "nessuno stato") + ". " + spoken(name, partner) + ". Apri Come stai";
        UsWidgetCharacter.put(small, context, R.id.us_status_partner, theirs, theirFace, "", 88);
        UsWidgetCharacter.put(medium, context, R.id.us_status_me, mine, myFace, "", 80);
        UsWidgetCharacter.put(medium, context, R.id.us_status_partner, theirs, theirFace, "", 76);
        medium.setTextViewText(R.id.us_status_me_line, me.shown ? capital(me.line) : "Tocca per dirlo");
        for (RemoteViews views : new RemoteViews[] { small, medium }) {
            views.setOnClickPendingIntent(R.id.us_status_root, UsWidgets.open(context, "status", 4801));
            views.setTextViewText(R.id.us_status_partner_name, name);
            views.setTextViewText(R.id.us_status_partner_line, partner.shown ? capital(partner.line) : "Nessuno stato");
            views.setContentDescription(R.id.us_status_root, spoken);
        }
        return UsWidgets.sized(options, small, medium);
    }

    /** "innamorata · da 1 ora" → "Innamorata · da 1 ora". */
    static String capital(String line) {
        if (line == null || line.isEmpty()) return "";
        return line.substring(0, 1).toUpperCase(java.util.Locale.ITALIAN) + line.substring(1);
    }

    static String spoken(String name, UsWidgetModels.StatusPerson partner) {
        return name + ": " + (partner.shown ? partner.line : "nessuno stato");
    }
}
