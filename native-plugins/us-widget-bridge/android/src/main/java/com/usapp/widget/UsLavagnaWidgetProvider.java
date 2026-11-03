package com.usapp.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.Bundle;
import android.text.Layout;
import android.view.View;
import android.widget.RemoteViews;

/**
 * Lavagna 2x2 (founder, 03/11/2026): the last drawing on the couple's board
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
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.us_widget_lavagna);
        views.setOnClickPendingIntent(R.id.us_lav_root, UsWidgets.open(context, "lavagna", 4901));
        Bitmap light = model.shown ? UsWidgetArt.decode(state.store.readNoiPortrait("lavagna")) : null;
        Bitmap dark = model.shown ? UsWidgetArt.decode(state.store.readNoiPortrait("lavagna_night")) : null;
        boolean shown = light != null && dark != null;
        if (shown) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                views.setIcon(R.id.us_lav_drawing, "setImageIcon", Icon.createWithBitmap(light), Icon.createWithBitmap(dark));
            } else {
                views.setImageViewBitmap(R.id.us_lav_drawing, UsWidgets.night(context) ? dark : light);
            }
        }
        views.setViewVisibility(R.id.us_lav_drawing, shown ? View.VISIBLE : View.GONE);
        views.setTextViewText(R.id.us_lav_line, shown ? model.line : "");
        views.setViewVisibility(R.id.us_lav_line, shown && !model.line.isEmpty() ? View.VISIBLE : View.GONE);
        if (shown) {
            views.setViewVisibility(R.id.us_lav_empty, View.GONE);
            views.setContentDescription(R.id.us_lav_root, description(model));
            return views;
        }
        String empty = context.getString(state.snapshot == null ? R.string.us_widget_connect : R.string.us_widget_lavagna_empty);
        UsWidgetArt.serif(views, context, R.id.us_lav_empty, empty, 16f, 136, 3, true, Layout.Alignment.ALIGN_CENTER);
        views.setContentDescription(R.id.us_lav_root, context.getString(R.string.us_widget_lavagna_name) + ": " + empty);
        return views;
    }

    static String description(UsWidgetModels.Lavagna model) {
        return "Lavagna" + (model.line.isEmpty() ? "" : ", ultimo tratto: " + model.line) + ". Apri la lavagna";
    }
}
