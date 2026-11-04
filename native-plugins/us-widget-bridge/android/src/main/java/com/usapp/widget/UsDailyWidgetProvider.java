package com.usapp.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.graphics.Typeface;
import android.os.Bundle;
import android.text.Layout;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.StyleSpan;
import android.widget.RemoteViews;

/**
 * La domanda di oggi (founder, 04/11/2026): the question first, in Fraunces
 * and as big as it fits, then «Rispondi», which opens it in US; the 4x2 also
 * says who has answered. Never an answer. At midnight in Rome it asks to open
 * US for the new one: the widget never reads the network.
 */
public final class UsDailyWidgetProvider extends AppWidgetProvider {
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        UsWidgets.refreshAll(context);
    }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        UsWidgets.refresh(context, UsWidgets.DAILY, id);
    }
    @Override public void onDisabled(Context context) { UsWidgets.refreshAll(context); }

    static RemoteViews render(Context context, UsWidgets.State state, Bundle options) {
        UsWidgetModels.Daily daily = UsWidgetModels.daily(state.snapshot, state.now);
        String partner = UsWidgetContract.optObject(state.snapshot, "think").optString("partnerName", "").trim();
        String who = partner.isEmpty() ? "L’altra persona" : partner;
        String question = daily.shown() ? daily.question : context.getString(daily.state.equals(UsWidgetModels.Daily.STALE)
            ? R.string.us_widget_daily_new : R.string.us_widget_daily_open);
        String button = button(daily.state);

        RemoteViews small = base(context, R.layout.us_widget_daily, R.drawable.us_widget_art_daily_s, options, false, button);
        UsWidgetArt.serif(small, context, R.id.us_daily_question, question, 18f, 140, 4, false, Layout.Alignment.ALIGN_NORMAL);
        RemoteViews medium = base(context, R.layout.us_widget_daily_medium, R.drawable.us_widget_art_daily_m, options, true, button);
        UsWidgetArt.serif(medium, context, R.id.us_daily_question, question, 23f, 300, 3, false, Layout.Alignment.ALIGN_NORMAL);
        medium.setTextViewText(R.id.us_daily_status, status(daily.state, who));
        String spoken = context.getString(R.string.us_widget_daily_name) + ". " + question + ". " + status(daily.state, who);
        small.setContentDescription(R.id.us_daily_root, spoken);
        medium.setContentDescription(R.id.us_daily_root, spoken);
        // The question turns at midnight in Rome.
        if (daily.shown()) state.needsUpdateAt(UsWidgetModels.nextRomeMidnight(state.now));
        return UsWidgets.sized(options, small, medium);
    }

    private static RemoteViews base(Context context, int layout, int art, Bundle options, boolean wide, String button) {
        RemoteViews views = new RemoteViews(context.getPackageName(), layout);
        views.setOnClickPendingIntent(R.id.us_daily_root, UsWidgets.open(context, "daily", 4501));
        views.setOnClickPendingIntent(R.id.us_daily_answer, UsWidgets.open(context, "daily", 4502));
        views.setTextViewText(R.id.us_daily_answer, button);
        views.setContentDescription(R.id.us_daily_answer, button);
        UsWidgetArt.art(views, context, R.id.us_daily_art, R.id.us_daily_grain, art, options, wide);
        return views;
    }

    /** The pill: «Rispondi» while you can answer, «Leggi» once both have, «Apri» otherwise. */
    static String button(String state) {
        switch (state) {
            case "todo": case "your_turn": return "Rispondi";
            case "ready": return "Leggi";
            default: return "Apri";
        }
    }

    /** "Bea ha risposto · tocca a te", the part that asks something in bold. */
    static CharSequence status(String state, String who) {
        String plain;
        String bold;
        switch (state) {
            case "todo": plain = ""; bold = "Rispondi quando vuoi"; break;
            case "your_turn": plain = who + " ha risposto · "; bold = "tocca a te"; break;
            case "waiting": plain = "Hai risposto · "; bold = "aspettiamo " + who; break;
            case "ready": plain = ""; bold = "Le vostre risposte sono pronte"; break;
            default: return "Apri US per la domanda nuova";
        }
        SpannableString text = new SpannableString(plain + bold);
        text.setSpan(new StyleSpan(Typeface.BOLD), plain.length(), text.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        return text;
    }

}
