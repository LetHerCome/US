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
import android.view.View;
import android.widget.RemoteViews;

/**
 * La domanda di oggi, Foto protagonista (founder, 02/11/2026): an
 * illustration with two speech bubbles, today's question in Fraunces and who
 * has answered, with their small portrait; never an answer. 2x2 and 4x2 (your
 * two portraits, quieter for whoever has not answered). A tap opens the
 * question in US. At midnight in Rome it asks to open US for the new one:
 * the widget never reads the network.
 */
public final class UsDailyWidgetProvider extends AppWidgetProvider {
    /** A portrait that has not answered yet: quieter, not gone. */
    private static final int QUIET = 110;

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
        byte[] mine = state.store.readNoiPortrait("me");
        byte[] theirs = state.store.readNoiPortrait("partner");

        RemoteViews small = base(context, R.layout.us_widget_daily, R.drawable.us_widget_art_daily_s, options, false);
        UsWidgetArt.serif(small, context, R.id.us_daily_question, question, 15.5f, 148, 4, false, Layout.Alignment.ALIGN_NORMAL);
        // 2x2: one short line beside the portrait of whoever answered.
        String line;
        boolean partnerActed = true;
        switch (daily.state) {
            case "todo": line = context.getString(R.string.us_widget_daily_todo); partnerActed = false; break;
            case "your_turn": line = "ha risposto · tocca a te"; break;
            case "waiting": line = "Hai risposto"; partnerActed = false; break;
            case "ready": line = "Risposte pronte"; break;
            default: line = ""; partnerActed = false;
        }
        boolean face = daily.state.equals("your_turn") || daily.state.equals("ready") || daily.state.equals("waiting");
        small.setViewVisibility(R.id.us_daily_who_frame, face ? View.VISIBLE : View.GONE);
        if (face) UsWidgetArt.avatar(small, context, partnerActed ? theirs : mine, R.id.us_daily_who, R.id.us_daily_who_initial, partnerActed ? partner : "Tu", 18);
        small.setTextViewText(R.id.us_daily_status, line);

        RemoteViews medium = base(context, R.layout.us_widget_daily_medium, R.drawable.us_widget_art_daily_m, options, true);
        UsWidgetArt.serif(medium, context, R.id.us_daily_question, question, 20f, 210, 3, false, Layout.Alignment.ALIGN_NORMAL);
        medium.setTextViewText(R.id.us_daily_status, status(daily.state, who));
        UsWidgetArt.avatar(medium, context, theirs, R.id.us_daily_partner, R.id.us_daily_partner_initial, partner, 24);
        UsWidgetArt.avatar(medium, context, mine, R.id.us_daily_me, R.id.us_daily_me_initial, "Tu", 24);
        medium.setInt(R.id.us_daily_partner, "setImageAlpha", daily.partnerAnswered() ? 255 : QUIET);
        medium.setInt(R.id.us_daily_me, "setImageAlpha", daily.meAnswered() ? 255 : QUIET);
        medium.setContentDescription(R.id.us_daily_root, context.getString(R.string.us_widget_daily_name) + ". " + question + ". " + status(daily.state, who));
        small.setContentDescription(R.id.us_daily_root, context.getString(R.string.us_widget_daily_name) + ". " + question
            + (line.isEmpty() ? "" : ". " + (daily.state.equals("your_turn") ? who + " " + line : line)));
        // The question turns at midnight in Rome.
        if (daily.shown()) state.needsUpdateAt(UsWidgetModels.nextRomeMidnight(state.now));
        return UsWidgets.sized(options, small, medium);
    }

    private static RemoteViews base(Context context, int layout, int art, Bundle options, boolean wide) {
        RemoteViews views = new RemoteViews(context.getPackageName(), layout);
        views.setOnClickPendingIntent(R.id.us_daily_root, UsWidgets.open(context, "daily", 4501));
        UsWidgetArt.art(views, context, R.id.us_daily_art, R.id.us_daily_grain, art, options, wide);
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
