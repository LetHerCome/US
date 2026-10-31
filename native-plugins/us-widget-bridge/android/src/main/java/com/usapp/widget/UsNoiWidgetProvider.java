package com.usapp.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

/** Noi 2x1: two profile portraits, the cached distance from Noi and the partner's battery. */
public final class UsNoiWidgetProvider extends AppWidgetProvider {
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        UsWidgets.refreshAll(context);
    }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        UsWidgets.refresh(context, UsWidgets.NOI, id);
    }
    @Override public void onDisabled(Context context) { UsWidgets.refreshAll(context); }

    static RemoteViews render(Context context, UsWidgets.State state) {
        UsWidgetModels.Couple couple = UsWidgetModels.couple(state.snapshot, state.now);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.us_widget_noi);
        views.setOnClickPendingIntent(R.id.us_noi_root, UsWidgets.open(context, "noi", 4401));
        String distance = couple.distanceText.isEmpty() ? context.getString(R.string.us_widget_noi_unknown) : couple.distanceText;
        views.setTextViewText(R.id.us_noi_distance, distance);
        // One italic line under the distance, as in the app (no tiny capitals).
        views.setTextViewText(R.id.us_noi_caption, context.getString(couple.distanceText.isEmpty() ? R.string.us_widget_noi_open :
            (couple.distanceStale ? R.string.us_widget_noi_last : R.string.us_widget_noi_between)));
        renderBattery(views, couple);
        state.needsUpdateAt(couple.batteryNextChange);
        byte[] raw = state.store.readNoiPortrait();
        Bitmap portrait = null;
        if (raw != null) {
            try { portrait = BitmapFactory.decodeByteArray(raw, 0, raw.length); }
            catch (RuntimeException ignored) {}
        }
        views.setViewVisibility(R.id.us_noi_portrait, portrait == null ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.us_noi_fallback, portrait == null ? View.VISIBLE : View.GONE);
        if (portrait != null) views.setImageViewBitmap(R.id.us_noi_portrait, portrait);
        String partner = UsWidgetContract.optObject(state.snapshot, "think").optString("partnerName", "");
        views.setContentDescription(R.id.us_noi_root,
            (couple.distanceText.isEmpty() ? "Noi" :
            "Noi: " + (couple.distanceStale ? "ultima distanza " : "distanza ") + couple.distanceText)
            + batteryDescription(couple, partner)
            + (couple.distanceText.isEmpty() && !couple.batteryShown() ? ": apri la pagina della coppia" : ". Apri Noi"));
        return views;
    }

    // Batteria del partner: the glyph and the percentage on the label row.
    // Older than an hour it is quieter; low and not charging, corallo.
    private static void renderBattery(RemoteViews views, UsWidgetModels.Couple couple) {
        int visibility = couple.batteryShown() ? View.VISIBLE : View.GONE;
        views.setViewVisibility(R.id.us_noi_battery_icon, visibility);
        views.setViewVisibility(R.id.us_noi_battery, visibility);
        if (!couple.batteryShown()) return;
        int color = couple.batteryOld ? 0x80F7EFE9 : couple.batteryLow() ? 0xFFFF8B7B : 0xB8F7EFE9;
        int glyph;
        switch (couple.batteryGlyph()) {
            case "charging": glyph = R.drawable.us_widget_battery_charging; break;
            case "low": glyph = R.drawable.us_widget_battery_low; break;
            case "medium": glyph = R.drawable.us_widget_battery_medium; break;
            default: glyph = R.drawable.us_widget_battery_high;
        }
        views.setImageViewResource(R.id.us_noi_battery_icon, glyph);
        views.setInt(R.id.us_noi_battery_icon, "setColorFilter", color);
        views.setTextViewText(R.id.us_noi_battery, couple.batteryLevel + "%");
        views.setTextColor(R.id.us_noi_battery, color);
    }

    static String batteryDescription(UsWidgetModels.Couple couple, String partner) {
        if (!couple.batteryShown()) return "";
        return ". Batteria" + (partner.isEmpty() ? " " : " di " + partner + " ") + couple.batteryLevel + "%"
            + (couple.batteryCharging ? ", in carica" : "") + (couple.batteryOld ? ", più di un'ora fa" : "");
    }
}
