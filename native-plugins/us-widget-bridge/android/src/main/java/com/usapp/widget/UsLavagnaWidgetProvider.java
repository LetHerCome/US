package com.usapp.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.text.Layout;
import android.view.View;
import android.widget.RemoteViews;

/**
 * Lavagna (founder, 03/11/2026; 2x2 and 4x2 since the widget del redesign,
 * 26/11/2026, with the pencil and whoever drew): the last drawing on the board
 * and who drew last, when. US paints the drawing while it is open, twice: in
 * Pastello ink for the light Home and in Midnight ink for the dark one (the
 * paper is this widget's resource). From Android 12 the launcher switches the
 * two pictures with the theme itself. The tap opens US on the board; nobody
 * draws on the widget.
 */
public final class UsLavagnaWidgetProvider extends AppWidgetProvider {
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        UsWidgets.refreshAll(context);
    }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        UsWidgets.refresh(context, UsWidgets.LAVAGNA, id);
    }
    @Override public void onDisabled(Context context) { UsWidgets.refreshAll(context); }

    static RemoteViews render(Context context, UsWidgets.State state, Bundle options) {
        UsWidgetModels.Lavagna model = UsWidgetModels.lavagna(state.snapshot, state.now);
        state.needsUpdateAt(model.nextChange);
        Bitmap light = model.shown ? UsWidgetArt.decode(state.store.readNoiPortrait("lavagna")) : null;
        Bitmap dark = model.shown ? UsWidgetArt.decode(state.store.readNoiPortrait("lavagna_night")) : null;
        UsWidgetCharacter.Person me = UsWidgetCharacter.person(state.snapshot, true);
        UsWidgetCharacter.Person them = UsWidgetCharacter.person(state.snapshot, false);
        RemoteViews small = fill(context, state, model, light, dark, R.layout.us_widget_lavagna, false, me, them);
        RemoteViews medium = fill(context, state, model, light, dark, R.layout.us_widget_lavagna_medium, true, me, them);
        return UsWidgets.sized(options, small, medium);
    }

    private static RemoteViews fill(Context context, UsWidgets.State state, UsWidgetModels.Lavagna model, Bitmap light, Bitmap dark,
                                    int layout, boolean wide, UsWidgetCharacter.Person me, UsWidgetCharacter.Person them) {
        RemoteViews views = new RemoteViews(context.getPackageName(), layout);
        views.setOnClickPendingIntent(R.id.us_lav_root, UsWidgets.open(context, "lavagna", 4901));
        // The pencil: the two of you blended at night, ceralacca on paper (widget del redesign, 26/11/2026).
        UsWidgetCharacter.pill(views, context, R.id.us_lav_pen_bg, me, them, wide ? 112 : 40, wide ? 36 : 40);
        boolean shown = light != null && dark != null;
        if (shown) UsWidgetCharacter.themed(views, context, R.id.us_lav_drawing, light, dark);
        views.setViewVisibility(R.id.us_lav_drawing, shown ? View.VISIBLE : View.GONE);
        views.setTextViewText(R.id.us_lav_line, shown ? model.line : "");
        views.setViewVisibility(R.id.us_lav_line, shown && !model.line.isEmpty() ? View.VISIBLE : View.GONE);
        if (wide) {
            UsWidgets.themedColor(views, context, R.id.us_lav_label, "setTextColor", 0xFFB8452F, me.night);
            String by = UsWidgetContract.optObject(state.snapshot, "lavagna").optString("by", "");
            boolean someone = shown && (by.equals("me") || by.equals("partner"));
            views.setViewVisibility(R.id.us_lav_by, someone ? View.VISIBLE : View.GONE);
            if (someone) UsWidgetCharacter.put(views, context, R.id.us_lav_by, by.equals("me") ? me : them, UsWidgetCharacter.face(state, by.equals("me")), "", 30);
        }
        if (shown) {
            views.setViewVisibility(R.id.us_lav_empty, View.GONE);
            views.setContentDescription(R.id.us_lav_root, description(model));
            return views;
        }
        String empty = context.getString(state.snapshot == null ? R.string.us_widget_connect : R.string.us_widget_lavagna_empty);
        UsWidgetArt.serif(views, context, R.id.us_lav_empty, empty, 16f, wide ? 220 : 136, 3, true, Layout.Alignment.ALIGN_CENTER);
        views.setContentDescription(R.id.us_lav_root, context.getString(R.string.us_widget_lavagna_name) + ": " + empty);
        return views;
    }

    static String description(UsWidgetModels.Lavagna model) {
        return "Lavagna" + (model.line.isEmpty() ? "" : ", ultimo tratto: " + model.line) + ". Apri la lavagna";
    }
}
