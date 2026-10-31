package com.usapp.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.Bundle;
import android.util.ArrayMap;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;
import java.util.Map;

/**
 * Noi. From 4x2, "stile mappa" (founder, 31/10/2026): the two round
 * portraits with a Ti penso bubble above each, the distance on a dashed path
 * between them, the partner's battery under their portrait. Smaller (the 2x1
 * placed before), the compact card: the two-colour portrait, the distance and
 * the battery on the label row. Android 12+ picks the layout by size itself.
 */
public final class UsNoiWidgetProvider extends AppWidgetProvider {
    /** The smallest size (dp) the map layout fits in. */
    static final float MAP_MIN_WIDTH_DP = 220f;
    static final float MAP_MIN_HEIGHT_DP = 120f;

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        UsWidgets.refreshAll(context);
    }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        UsWidgets.refresh(context, UsWidgets.NOI, id);
    }
    @Override public void onDisabled(Context context) { UsWidgets.refreshAll(context); }

    static RemoteViews render(Context context, UsWidgets.State state, Bundle options) {
        UsWidgetModels.Couple couple = UsWidgetModels.couple(state.snapshot, state.now);
        String partner = UsWidgetContract.optObject(state.snapshot, "think").optString("partnerName", "");
        state.needsUpdateAt(couple.batteryNextChange);
        RemoteViews compact = compact(context, state, couple, partner);
        RemoteViews map = map(context, state, couple, partner);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Map<SizeF, RemoteViews> sizes = new ArrayMap<>();
            sizes.put(new SizeF(110f, 70f), compact);
            sizes.put(new SizeF(MAP_MIN_WIDTH_DP, MAP_MIN_HEIGHT_DP), map);
            return new RemoteViews(sizes);
        }
        return fitsMap(options) ? map : compact;
    }

    /** Before Android 12: the portrait-orientation size the launcher reports. */
    static boolean fitsMap(Bundle options) {
        if (options == null) return false;
        int width = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        int height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        return width >= MAP_MIN_WIDTH_DP && height >= MAP_MIN_HEIGHT_DP;
    }

    private static String distance(Context context, UsWidgetModels.Couple couple) {
        return couple.distanceText.isEmpty() ? context.getString(R.string.us_widget_noi_unknown) : couple.distanceText;
    }

    // One italic line under the distance, as in the app (no tiny capitals).
    private static String caption(Context context, UsWidgetModels.Couple couple) {
        return context.getString(couple.distanceText.isEmpty() ? R.string.us_widget_noi_open :
            (couple.distanceStale ? R.string.us_widget_noi_last : R.string.us_widget_noi_between));
    }

    private static String distanceDescription(UsWidgetModels.Couple couple) {
        return couple.distanceText.isEmpty() ? "Noi" :
            "Noi: " + (couple.distanceStale ? "ultima distanza " : "distanza ") + couple.distanceText;
    }

    private static RemoteViews compact(Context context, UsWidgets.State state, UsWidgetModels.Couple couple, String partner) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.us_widget_noi);
        views.setOnClickPendingIntent(R.id.us_noi_root, UsWidgets.open(context, "noi", 4401));
        views.setTextViewText(R.id.us_noi_distance, distance(context, couple));
        views.setTextViewText(R.id.us_noi_caption, caption(context, couple));
        renderBattery(views, couple, R.id.us_noi_battery_icon, R.id.us_noi_battery);
        Bitmap portrait = decode(state.store.readNoiPortrait("pair"));
        views.setViewVisibility(R.id.us_noi_portrait, portrait == null ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.us_noi_fallback, portrait == null ? View.VISIBLE : View.GONE);
        if (portrait != null) views.setImageViewBitmap(R.id.us_noi_portrait, portrait);
        views.setContentDescription(R.id.us_noi_root, distanceDescription(couple)
            + batteryDescription(couple, partner)
            + (couple.distanceText.isEmpty() && !couple.batteryShown() ? ": apri la pagina della coppia" : ". Apri Noi"));
        return views;
    }

    private static RemoteViews map(Context context, UsWidgets.State state, UsWidgetModels.Couple couple, String partner) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.us_widget_noi_map);
        views.setOnClickPendingIntent(R.id.us_noi_map_root, UsWidgets.open(context, "noi", 4401));
        views.setTextViewText(R.id.us_noi_map_distance, distance(context, couple));
        views.setTextViewText(R.id.us_noi_map_caption, caption(context, couple));
        UsWidgetModels.Bubbles bubbles = UsWidgetModels.noiBubbles(state.snapshot, state.action, state.now);
        state.needsUpdateAt(bubbles.nextChange);
        bubble(views, R.id.us_noi_me_bubble, R.id.us_noi_me_tail, bubbles.me);
        bubble(views, R.id.us_noi_partner_bubble, R.id.us_noi_partner_tail, bubbles.partner);
        portrait(views, decode(state.store.readNoiPortrait("me")), R.id.us_noi_me_photo, R.id.us_noi_me_empty);
        portrait(views, decode(state.store.readNoiPortrait("partner")), R.id.us_noi_partner_photo, R.id.us_noi_partner_empty);
        // Kept in place when unknown, so the two portraits stay level.
        views.setViewVisibility(R.id.us_noi_map_battery_row, couple.batteryShown() ? View.VISIBLE : View.INVISIBLE);
        renderBattery(views, couple, R.id.us_noi_map_battery_icon, R.id.us_noi_map_battery);
        String who = partner.isEmpty() ? "L’altra persona" : partner;
        views.setContentDescription(R.id.us_noi_map_root, distanceDescription(couple)
            + (bubbles.partner.isEmpty() ? "" : ". " + who + " " + bubbles.partner.replace(" · ", " "))
            + (bubbles.me.isEmpty() ? "" : ". " + capitalized(bubbles.me.replace(" · ", " ")))
            + batteryDescription(couple, partner) + ". Apri Noi");
        return views;
    }

    private static void bubble(RemoteViews views, int text, int tail, String value) {
        int visibility = value.isEmpty() ? View.GONE : View.VISIBLE;
        views.setViewVisibility(text, visibility);
        views.setViewVisibility(tail, visibility);
        views.setTextViewText(text, value);
    }

    private static void portrait(RemoteViews views, Bitmap bitmap, int photo, int empty) {
        views.setViewVisibility(photo, bitmap == null ? View.GONE : View.VISIBLE);
        views.setViewVisibility(empty, bitmap == null ? View.VISIBLE : View.GONE);
        if (bitmap != null) views.setImageViewBitmap(photo, bitmap);
    }

    private static Bitmap decode(byte[] raw) {
        if (raw == null) return null;
        try { return BitmapFactory.decodeByteArray(raw, 0, raw.length); }
        catch (RuntimeException ignored) { return null; }
    }

    private static String capitalized(String text) {
        return text.isEmpty() ? text : Character.toUpperCase(text.charAt(0)) + text.substring(1);
    }

    // Batteria del partner: the glyph and the percentage.
    // Older than an hour it is quieter; low and not charging, corallo.
    private static void renderBattery(RemoteViews views, UsWidgetModels.Couple couple, int icon, int text) {
        int visibility = couple.batteryShown() ? View.VISIBLE : View.GONE;
        views.setViewVisibility(icon, visibility);
        views.setViewVisibility(text, visibility);
        if (!couple.batteryShown()) return;
        int color = couple.batteryOld ? 0x80F7EFE9 : couple.batteryLow() ? 0xFFFF8B7B : 0xB8F7EFE9;
        int glyph;
        switch (couple.batteryGlyph()) {
            case "charging": glyph = R.drawable.us_widget_battery_charging; break;
            case "low": glyph = R.drawable.us_widget_battery_low; break;
            case "medium": glyph = R.drawable.us_widget_battery_medium; break;
            default: glyph = R.drawable.us_widget_battery_high;
        }
        views.setImageViewResource(icon, glyph);
        views.setInt(icon, "setColorFilter", color);
        views.setTextViewText(text, couple.batteryLevel + "%");
        views.setTextColor(text, color);
    }

    static String batteryDescription(UsWidgetModels.Couple couple, String partner) {
        if (!couple.batteryShown()) return "";
        return ". Batteria" + (partner.isEmpty() ? " " : " di " + partner + " ") + couple.batteryLevel + "%"
            + (couple.batteryCharging ? ", in carica" : "") + (couple.batteryOld ? ", più di un'ora fa" : "");
    }
}
