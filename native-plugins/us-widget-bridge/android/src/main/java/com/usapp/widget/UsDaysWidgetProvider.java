package com.usapp.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;
import android.widget.RemoteViews;

/**
 * Giorni insieme (31/10/2026) was the same as Foto & Noi (founder, 02/11/2026:
 * "lasciamone uno solo"). Only Foto & Noi is offered; this class stays, out of
 * the widget list (hide_from_picker) and named Foto & Noi, because removing a
 * provider turns the widgets already on a Home screen into "Impossibile
 * caricare il widget". They render Foto & Noi.
 */
public final class UsDaysWidgetProvider extends AppWidgetProvider {
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        UsWidgets.refreshAll(context);
    }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        UsWidgets.refresh(context, UsWidgets.DAYS, id);
    }
    @Override public void onDisabled(Context context) { UsWidgets.refreshAll(context); }

    static RemoteViews render(Context context, UsWidgets.State state, Bundle options) {
        return UsPhotoWidgetProvider.render(context, state, options);
    }
}
