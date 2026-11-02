package com.usapp.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Bundle;
import android.text.Layout;
import android.view.View;
import android.widget.RemoteViews;

/**
 * Ricordi a pila, Foto protagonista (founder, 02/11/2026): your photos of this
 * day in a past year ("Un anno fa"), or else the newest. US draws them while it
 * is open: in the 2x2 the newest fills the widget and the other two peek from
 * the top edge; in the 4x2 a fan of three prints. The widget adds the day on
 * its own line and the title in Fraunces, and how many photos in the 4x2.
 * Without memories, empty prints drawn by hand. The tap opens Ricordi.
 */
public final class UsMemoriesWidgetProvider extends AppWidgetProvider {
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        UsWidgets.refreshAll(context);
    }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        UsWidgets.refresh(context, UsWidgets.MEMORIES, id);
    }
    @Override public void onDisabled(Context context) { UsWidgets.refreshAll(context); }

    static RemoteViews render(Context context, UsWidgets.State state, Bundle options) {
        UsWidgetModels.Memories model = UsWidgetModels.memories(state.snapshot, state.now);
        state.needsUpdateAt(model.nextChange);
        RemoteViews small = fill(context, state, model, R.layout.us_widget_memories, "memories", options, false);
        RemoteViews medium = fill(context, state, model, R.layout.us_widget_memories_medium, "memories_wide", options, true);
        // 2x2: the day on its own line ("2 nov · un anno fa"), so the title is never cut beside it.
        String date = model.shortDate + (model.pill.isEmpty() ? "" : (model.shortDate.isEmpty() ? "" : " · ")
            + Character.toLowerCase(model.pill.charAt(0)) + model.pill.substring(1));
        small.setTextViewText(R.id.us_mem_date, date);
        small.setViewVisibility(R.id.us_mem_date, date.isEmpty() ? View.GONE : View.VISIBLE);
        UsWidgetArt.serif(small, context, R.id.us_mem_title, model.title, 18f, 144, 2, false, Layout.Alignment.ALIGN_NORMAL);
        medium.setTextViewText(R.id.us_mem_pill, model.pill);
        medium.setViewVisibility(R.id.us_mem_pill, model.pill.isEmpty() ? View.INVISIBLE : View.VISIBLE);
        UsWidgetArt.serif(medium, context, R.id.us_mem_title, model.title, 22f, 140, 2, false, Layout.Alignment.ALIGN_NORMAL);
        medium.setTextViewText(R.id.us_mem_line, model.line);
        return UsWidgets.sized(options, small, medium);
    }

    private static RemoteViews fill(Context context, UsWidgets.State state, UsWidgetModels.Memories model, int layout, String slot, Bundle options, boolean wide) {
        RemoteViews views = new RemoteViews(context.getPackageName(), layout);
        views.setOnClickPendingIntent(R.id.us_mem_root, UsWidgets.open(context, "memories", 4701));
        Bitmap stack = model.shown ? decode(state.store.readNoiPortrait(slot)) : null;
        boolean shown = stack != null;
        // The photos on a plain soft field; without them, the empty prints drawn by hand.
        UsWidgetArt.art(views, context, R.id.us_mem_art, R.id.us_mem_grain, shown ? R.drawable.us_widget_art_memories_back
            : wide ? R.drawable.us_widget_art_memories_m : R.drawable.us_widget_art_memories_s, options, wide);
        views.setViewVisibility(R.id.us_mem_content, shown ? View.VISIBLE : View.GONE);
        if (!wide) views.setViewVisibility(R.id.us_mem_caption, shown ? View.VISIBLE : View.GONE);
        if (!shown) {
            String empty = context.getString(state.snapshot == null ? R.string.us_widget_connect : R.string.us_widget_memories_empty);
            UsWidgetArt.serif(views, context, R.id.us_mem_empty, empty, wide ? 19f : 15f, wide ? 150 : 140, 3, true, wide ? Layout.Alignment.ALIGN_NORMAL : Layout.Alignment.ALIGN_CENTER);
            views.setContentDescription(R.id.us_mem_root, context.getString(R.string.us_widget_memories_name));
            return views;
        }
        views.setViewVisibility(R.id.us_mem_empty, View.GONE);
        views.setImageViewBitmap(R.id.us_mem_stack, stack);
        views.setContentDescription(R.id.us_mem_root, description(model));
        return views;
    }

    private static Bitmap decode(byte[] raw) {
        if (raw == null) return null;
        try { return BitmapFactory.decodeByteArray(raw, 0, raw.length); }
        catch (RuntimeException ignored) { return null; }
    }

    static String description(UsWidgetModels.Memories model) {
        String head = model.pill.isEmpty() ? "Ricordi" : model.pill;
        return head + ": " + model.title + (model.line.isEmpty() ? "" : ", " + model.line) + ". Apri Ricordi";
    }
}
