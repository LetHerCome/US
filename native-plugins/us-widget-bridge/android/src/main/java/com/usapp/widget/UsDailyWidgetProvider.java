package com.usapp.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.graphics.Typeface;
import android.os.Bundle;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.StyleSpan;
import android.view.View;
import android.widget.RemoteViews;

/**
 * La domanda di oggi, Pastello (approved board, 02/11/2026): today's question
 * and who has answered, never an answer. 2x2 and 4x2 (with your portraits and
 * one segment each). A tap opens the question in US. At midnight in Rome it
 * asks to open US for the new one: the widget never reads the network.
 */
public final class UsDailyWidgetProvider extends AppWidgetProvider {
    private static final int TRACK = 0x2E3B1F5C;
    private static final int TRACK_NIGHT = 0xFF453A52;

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
        int me = UsWidgetModels.personColor(state.snapshot, true);
        int them = UsWidgetModels.personColor(state.snapshot, false);
        String question = daily.shown() ? daily.question : context.getString(daily.state.equals(UsWidgetModels.Daily.STALE)
            ? R.string.us_widget_daily_new : R.string.us_widget_daily_open);

        RemoteViews small = base(context, R.layout.us_widget_daily, question);
        // 2x2: one short line and the dot of whoever answered.
        String line;
        int dot = 0;
        switch (daily.state) {
            case "todo": line = context.getString(R.string.us_widget_daily_todo); break;
            case "your_turn": line = who + " ha risposto"; dot = them; break;
            case "waiting": line = "Hai risposto"; dot = me; break;
            case "ready": line = "Risposte pronte"; dot = them; break;
            default: line = "";
        }
        small.setTextViewText(R.id.us_daily_status, line);
        small.setViewVisibility(R.id.us_daily_dot, dot == 0 ? View.GONE : View.VISIBLE);
        small.setInt(R.id.us_daily_dot, "setColorFilter", dot);

        RemoteViews medium = base(context, R.layout.us_widget_daily_medium, question);
        medium.setTextViewText(R.id.us_daily_status, status(daily.state, who));
        UsWidgets.avatar(medium, state.store.readNoiPortrait("me"), R.id.us_daily_me, me);
        UsWidgets.avatar(medium, state.store.readNoiPortrait("partner"), R.id.us_daily_partner, them);
        UsWidgets.themedColor(medium, context, R.id.us_daily_me_done, "setColorFilter", daily.meAnswered() ? me : TRACK, daily.meAnswered() ? me : TRACK_NIGHT);
        UsWidgets.themedColor(medium, context, R.id.us_daily_partner_done, "setColorFilter", daily.partnerAnswered() ? them : TRACK, daily.partnerAnswered() ? them : TRACK_NIGHT);
        medium.setContentDescription(R.id.us_daily_root, context.getString(R.string.us_widget_daily_name) + ". " + question + ". " + status(daily.state, who));
        small.setContentDescription(R.id.us_daily_root, context.getString(R.string.us_widget_daily_name) + ". " + question + (line.isEmpty() ? "" : ". " + line));
        // The question turns at midnight in Rome.
        if (daily.shown()) state.needsUpdateAt(UsWidgetModels.nextRomeMidnight(state.now));
        return UsWidgets.sized(options, small, medium);
    }

    private static RemoteViews base(Context context, int layout, String question) {
        RemoteViews views = new RemoteViews(context.getPackageName(), layout);
        views.setOnClickPendingIntent(R.id.us_daily_root, UsWidgets.open(context, "daily", 4501));
        views.setTextViewText(R.id.us_daily_question, question);
        return views;
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
