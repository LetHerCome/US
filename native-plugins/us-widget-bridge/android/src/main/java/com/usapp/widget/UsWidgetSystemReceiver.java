package com.usapp.widget;

import android.appwidget.AppWidgetManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Not exported: only the system (time changes, app update), our own alarm and
 * the launcher's pin confirmation (a PendingIntent we created) reach it.
 */
public final class UsWidgetSystemReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String action = intent.getAction();
        if (UsWidgets.ACTION_PINNED.equals(action)) {
            String kind = intent.getStringExtra(UsWidgets.EXTRA_KIND);
            int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
            if (UsWidgets.validKind(kind)) UsWidgetBridgePlugin.notifyPinned(kind, id != AppWidgetManager.INVALID_APPWIDGET_ID);
        }
        switch (action) {
            case UsWidgets.ACTION_TICK:
            case UsWidgets.ACTION_PINNED:
            case Intent.ACTION_TIME_CHANGED:
            case Intent.ACTION_TIMEZONE_CHANGED:
            case Intent.ACTION_MY_PACKAGE_REPLACED:
            case Intent.ACTION_LOCALE_CHANGED:
                UsWidgets.refreshAll(context);
                break;
            default:
                break;
        }
    }
}
