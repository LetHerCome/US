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
 * Post-it 2x2 (founder, 04/11/2026; tavola Main.dc.html): it took the
 * Countdown's place. The newest post-it of the couple's board on its paper
 * (yellow, pink, blue, green, the same in both themes), its words in Fraunces
 * italic, who wrote it with that person's dot and "+2" when there are others.
 * The tap opens the board in Noi; nobody writes on the widget.
 */
public final class UsPostitWidgetProvider extends AppWidgetProvider {
    private static final int INK = 0xFF3B2A10;

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

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.us_widget_postit);
        views.setOnClickPendingIntent(R.id.us_postit_root, UsWidgets.open(context, "postit", 5001));
        views.setInt(R.id.us_postit_root, "setBackgroundResource", paper(color));
        UsWidgetArt.serif(views, context, R.id.us_postit_text, text, 19f, 140, 4, true, Layout.Alignment.ALIGN_NORMAL, INK, INK);
        views.setTextViewText(R.id.us_postit_by, who);
        views.setViewVisibility(R.id.us_postit_by, who.isEmpty() ? View.INVISIBLE : View.VISIBLE);
        views.setViewVisibility(R.id.us_postit_dot, who.isEmpty() ? View.GONE : View.VISIBLE);
        if (!who.isEmpty()) views.setInt(R.id.us_postit_dot, "setColorFilter", UsWidgetModels.personColor(state.snapshot, by.equals("me")));
        views.setTextViewText(R.id.us_postit_more, "+" + more);
        views.setViewVisibility(R.id.us_postit_more, more > 0 ? View.VISIBLE : View.GONE);
        views.setContentDescription(R.id.us_postit_root, "Post-it" + (who.isEmpty() ? "" : " di " + who) + ": " + text
            + (more > 0 ? ". Altri " + more + " sulla bacheca" : "") + ". Apri la bacheca");
        return views;
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
