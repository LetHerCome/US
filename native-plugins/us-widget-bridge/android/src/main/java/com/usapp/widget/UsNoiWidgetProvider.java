package com.usapp.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.text.Layout;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.RelativeSizeSpan;
import android.util.ArrayMap;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;
import java.util.Map;

/**
 * Distanza e batteria, Foto protagonista (founder, 02/11/2026); it replaced
 * Noi and its map. An illustration with a dotted path and a heart, your two
 * small portraits, the distance the app computed in Fraunces (never a map,
 * never where you are), how old it is and the partner's battery. 2x2 and 4x2;
 * a Noi placed before as 2x1 gets a one-row card. The class name is stable:
 * placed widgets keep working.
 */
public final class UsNoiWidgetProvider extends AppWidgetProvider {
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        UsWidgets.refreshAll(context);
    }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        UsWidgets.refresh(context, UsWidgets.NOI, id);
    }
    @Override public void onDisabled(Context context) { UsWidgets.refreshAll(context); }

    static RemoteViews render(Context context, UsWidgets.State state, Bundle options) {
        UsWidgetModels.Couple couple = UsWidgetModels.couple(state.snapshot, state.now);
        String partner = UsWidgetContract.optObject(state.snapshot, "think").optString("partnerName", "").trim();
        state.needsUpdateAt(couple.batteryNextChange);
        state.needsUpdateAt(couple.distanceNextChange);
        RemoteViews row = fill(context, state, couple, partner, R.layout.us_widget_noi, R.drawable.us_widget_art_noi_m, options, 34, 24f, 150);
        RemoteViews small = fill(context, state, couple, partner, R.layout.us_widget_noi_small, R.drawable.us_widget_art_noi_s, options, 22, 34f, 150);
        RemoteViews medium = fill(context, state, couple, partner, R.layout.us_widget_noi_medium, R.drawable.us_widget_art_noi_m, options, 46, 40f, 230);
        // 2x1: the battery, or how old the distance is when the battery is unknown.
        if (!couple.batteryShown()) row.setTextViewText(R.id.us_noi_battery, couple.distanceAgo);
        // 2x2: "Bea 78%" beside her portrait. 4x2: the name, the battery beside it. Both: the age under the distance.
        small.setViewVisibility(R.id.us_noi_battery_row, couple.batteryShown() ? View.VISIBLE : View.GONE);
        if (couple.batteryShown()) small.setTextViewText(R.id.us_noi_battery, (partner.isEmpty() ? "" : partner + " ") + couple.batteryLevel + "%");
        small.setTextViewText(R.id.us_noi_caption, couple.distanceAgo);
        small.setViewVisibility(R.id.us_noi_caption, couple.distanceAgo.isEmpty() ? View.GONE : View.VISIBLE);
        medium.setTextViewText(R.id.us_noi_partner_name, partner.isEmpty() ? "La tua persona" : partner);
        medium.setTextViewText(R.id.us_noi_caption, couple.distanceAgo);
        medium.setViewVisibility(R.id.us_noi_caption, couple.distanceAgo.isEmpty() ? View.GONE : View.VISIBLE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Map<SizeF, RemoteViews> sizes = new ArrayMap<>();
            sizes.put(new SizeF(110f, 40f), row);
            sizes.put(new SizeF(110f, 110f), small);
            sizes.put(new SizeF(UsWidgets.MEDIUM_MIN_WIDTH_DP, 110f), medium);
            return new RemoteViews(sizes);
        }
        int width = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        int height = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        if (width >= UsWidgets.MEDIUM_MIN_WIDTH_DP && height >= 110) return medium;
        return height >= 110 ? small : row;
    }

    private static RemoteViews fill(Context context, UsWidgets.State state, UsWidgetModels.Couple couple, String partner, int layout,
                                    int art, Bundle options, int portraitDp, float distanceSp, int distanceWidthDp) {
        RemoteViews views = new RemoteViews(context.getPackageName(), layout);
        views.setOnClickPendingIntent(R.id.us_noi_root, UsWidgets.open(context, "noi", 4401));
        UsWidgetArt.art(views, context, R.id.us_noi_art, R.id.us_noi_grain, art, options, art == R.drawable.us_widget_art_noi_m);
        UsWidgetArt.avatar(views, context, state.store.readNoiPortrait("me"), R.id.us_noi_me, R.id.us_noi_me_initial, "Tu", portraitDp);
        UsWidgetArt.avatar(views, context, state.store.readNoiPortrait("partner"), R.id.us_noi_partner, R.id.us_noi_partner_initial, partner, portraitDp);
        UsWidgetArt.serif(views, context, R.id.us_noi_distance, distance(context, couple), distanceSp, distanceWidthDp, 2, false, Layout.Alignment.ALIGN_CENTER);
        renderBattery(context, views, couple);
        views.setContentDescription(R.id.us_noi_root, description(couple, partner));
        return views;
    }

    /** "12 km" with a smaller unit, as on the board; "vicini"; or "Distanza non ancora nota". */
    static CharSequence distance(Context context, UsWidgetModels.Couple couple) {
        if (couple.distanceNear) return "vicini";
        if (couple.distanceText.isEmpty()) {
            // A sentence, not a number: small, so it never covers the portraits.
            SpannableString unknown = new SpannableString(context.getString(R.string.us_widget_noi_unknown));
            unknown.setSpan(new RelativeSizeSpan(0.36f), 0, unknown.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            return unknown;
        }
        SpannableString text = new SpannableString(couple.distanceText);
        int space = couple.distanceText.lastIndexOf(' ');
        if (space > 0) text.setSpan(new RelativeSizeSpan(0.47f), space + 1, text.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        return text;
    }

    // Batteria del partner: the glyph and the percentage. Older than an hour it
    // is quieter; low and not charging, corallo.
    private static void renderBattery(Context context, RemoteViews views, UsWidgetModels.Couple couple) {
        int visibility = couple.batteryShown() ? View.VISIBLE : View.GONE;
        views.setViewVisibility(R.id.us_noi_battery_icon, visibility);
        views.setViewVisibility(R.id.us_noi_battery, visibility);
        if (!couple.batteryShown()) return;
        int color = couple.batteryOld ? 0x995B4A63 : couple.batteryLow() ? 0xFFE5484D : 0xFF5B4A63;
        int dark = couple.batteryOld ? 0x66F7EFE9 : couple.batteryLow() ? 0xFFFF8B7B : 0xB8F7EFE9;
        int glyph;
        switch (couple.batteryGlyph()) {
            case "charging": glyph = R.drawable.us_widget_battery_charging; break;
            case "low": glyph = R.drawable.us_widget_battery_low; break;
            case "medium": glyph = R.drawable.us_widget_battery_medium; break;
            default: glyph = R.drawable.us_widget_battery_high;
        }
        views.setImageViewResource(R.id.us_noi_battery_icon, glyph);
        UsWidgets.themedColor(views, context, R.id.us_noi_battery_icon, "setColorFilter", color, dark);
        views.setTextViewText(R.id.us_noi_battery, couple.batteryLevel + "%");
        UsWidgets.themedColor(views, context, R.id.us_noi_battery, "setTextColor", color, dark);
    }

    static String description(UsWidgetModels.Couple couple, String partner) {
        String distance = couple.distanceNear ? "Siete vicini"
            : couple.distanceText.isEmpty() ? "Distanza non ancora nota" : "Distanza tra voi " + couple.distanceText;
        return distance + (couple.distanceAgo.isEmpty() ? "" : ", " + couple.distanceAgo)
            + batteryDescription(couple, partner) + ". Apri Noi";
    }

    static String batteryDescription(UsWidgetModels.Couple couple, String partner) {
        if (!couple.batteryShown()) return "";
        return ". Batteria" + (partner.isEmpty() ? " " : " di " + partner + " ") + couple.batteryLevel + "%"
            + (couple.batteryCharging ? ", in carica" : "") + (couple.batteryOld ? ", più di un'ora fa" : "");
    }
}
