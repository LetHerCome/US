package com.usapp.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;
import android.text.Layout;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONObject;

/**
 * Post-it (founder, 04/11/2026; widget del redesign 26/11/2026): the newest
 * post-it of the couple's board on its paper (yellow, pink, blue, green, the
 * same in both themes), turned a little on the card, its words in Fraunces
 * italic, the tape in the colour of whoever wrote it and "+2" when there are
 * others. The 4x2 shows the last two, one each when you both wrote. The tap
 * opens the board in Noi; nobody writes on the widget.
 */
public final class UsPostitWidgetProvider extends AppWidgetProvider {
    private static final int INK = 0xFF1A1020;

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        UsWidgets.refreshAll(context);
    }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        UsWidgets.refresh(context, UsWidgets.POSTIT, id);
    }
    @Override public void onDisabled(Context context) { UsWidgets.refreshAll(context); }

    static RemoteViews render(Context context, UsWidgets.State state, Bundle options) {
        JSONObject postit = UsWidgetContract.optObject(state.snapshot, "postit");
        boolean written = "ready".equals(postit.optString("state", "")) && !postit.optString("text", "").isEmpty();
        String text = written ? postit.optString("text", "")
            : context.getString(state.snapshot == null ? R.string.us_widget_connect : R.string.us_widget_postit_empty);
        String color = written ? postit.optString("color", "yellow") : "yellow";
        String by = postit.optString("by", "");
        int more = written ? postit.optInt("more", 0) : 0;
        String partner = UsWidgetContract.optObject(state.snapshot, "think").optString("partnerName", "").trim();
        String who = !written ? "" : by.equals("me") ? "Tu" : by.equals("partner") ? (partner.isEmpty() ? "La tua persona" : partner) : "";
        JSONObject second = UsWidgetContract.optObject(postit, "second");
        String secondText = written ? second.optString("text", "") : "";

        RemoteViews small = new RemoteViews(context.getPackageName(), R.layout.us_widget_postit);
        RemoteViews medium = new RemoteViews(context.getPackageName(), R.layout.us_widget_postit_medium);
        String spoken = "Post-it" + (who.isEmpty() ? "" : " di " + who) + ": " + text
            + (more > 0 ? ". Altri " + more + " sulla bacheca" : "") + ". Apri la bacheca";
        for (RemoteViews views : new RemoteViews[] { small, medium }) {
            boolean wide = views == medium;
            views.setOnClickPendingIntent(R.id.us_postit_root, UsWidgets.open(context, "postit", 5001));
            views.setInt(R.id.us_postit_paper, "setBackgroundResource", paper(color));
            UsWidgetArt.serif(views, context, R.id.us_postit_text, text, wide ? 16f : 17f, wide ? 130 : 120, 4, true, Layout.Alignment.ALIGN_NORMAL, INK, INK);
            tape(views, context, state, R.id.us_postit_tape, written ? by : "");
            // The 4x2 counts what is not on it.
            int left = wide && !secondText.isEmpty() ? more - 1 : more;
            views.setTextViewText(R.id.us_postit_more, "+" + left);
            views.setViewVisibility(R.id.us_postit_more, left > 0 ? View.VISIBLE : View.GONE);
            views.setContentDescription(R.id.us_postit_root, spoken);
        }
        medium.setViewVisibility(R.id.us_postit_second, secondText.isEmpty() ? View.INVISIBLE : View.VISIBLE);
        if (!secondText.isEmpty()) {
            medium.setInt(R.id.us_postit_paper2, "setBackgroundResource", paper(second.optString("color", "yellow")));
            UsWidgetArt.serif(medium, context, R.id.us_postit_text2, secondText, 16f, 130, 4, true, Layout.Alignment.ALIGN_NORMAL, INK, INK);
            tape(medium, context, state, R.id.us_postit_tape2, second.optString("by", ""));
        }
        return UsWidgets.sized(options, small, medium);
    }

    /** The tape in the colour of whoever wrote it; nobody known, none. */
    private static void tape(RemoteViews views, Context context, UsWidgets.State state, int id, String by) {
        boolean known = by.equals("me") || by.equals("partner");
        views.setViewVisibility(id, known ? View.VISIBLE : View.INVISIBLE);
        if (!known) return;
        UsWidgetCharacter.Person p = UsWidgetCharacter.person(state.snapshot, by.equals("me"));
        UsWidgets.themedColor(views, context, id, "setColorFilter", p.day, p.night);
    }

    static int paper(String color) {
        switch (color) {
            case "pink": return R.drawable.us_widget_postit_pink;
            case "blue": return R.drawable.us_widget_postit_blue;
            case "green": return R.drawable.us_widget_postit_green;
            default: return R.drawable.us_widget_postit_yellow;
        }
    }
}
