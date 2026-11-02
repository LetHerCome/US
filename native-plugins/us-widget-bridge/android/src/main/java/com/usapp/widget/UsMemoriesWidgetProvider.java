package com.usapp.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

/**
 * Ricordi a pila, Pastello (approved board, 02/11/2026): your photos of this
 * day in a past year ("Un anno fa"), or else the newest, as a small stack of
 * prints. US draws the stack while it is open (one picture for the 2x2, one
 * for the 4x2); the widget adds the place, the day and how many photos.
 * The tap opens Ricordi.
 */
public final class UsMemoriesWidgetProvider extends AppWidgetProvider {
    private static final int[] DOTS = { R.id.us_mem_dot_0, R.id.us_mem_dot_1, R.id.us_mem_dot_2 };

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
        RemoteViews small = fill(context, state, model, R.layout.us_widget_memories, "memories");
        RemoteViews medium = fill(context, state, model, R.layout.us_widget_memories_medium, "memories_wide");
        small.setTextViewText(R.id.us_mem_date, model.shortDate);
        small.setViewVisibility(R.id.us_mem_date, model.shortDate.isEmpty() ? View.GONE : View.VISIBLE);
        medium.setTextViewText(R.id.us_mem_pill, model.pill);
        medium.setViewVisibility(R.id.us_mem_pill, model.pill.isEmpty() ? View.INVISIBLE : View.VISIBLE);
        medium.setTextViewText(R.id.us_mem_line, model.line);
        // One dot for each print in the stack, the one on top in rosa.
        for (int i = 0; i < DOTS.length; i++) {
            medium.setViewVisibility(DOTS[i], i < model.stack ? View.VISIBLE : View.GONE);
        }
        return UsWidgets.sized(options, small, medium);
    }

    private static RemoteViews fill(Context context, UsWidgets.State state, UsWidgetModels.Memories model, int layout, String slot) {
        RemoteViews views = new RemoteViews(context.getPackageName(), layout);
        views.setOnClickPendingIntent(R.id.us_mem_root, UsWidgets.open(context, "memories", 4701));
        Bitmap stack = model.shown ? decode(state.store.readNoiPortrait(slot)) : null;
        boolean shown = stack != null;
        views.setViewVisibility(R.id.us_mem_content, shown ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.us_mem_empty, shown ? View.GONE : View.VISIBLE);
        if (!shown) {
            views.setTextViewText(R.id.us_mem_empty, context.getString(state.snapshot == null ? R.string.us_widget_connect : R.string.us_widget_memories_empty));
            views.setContentDescription(R.id.us_mem_root, context.getString(R.string.us_widget_memories_name));
            return views;
        }
        views.setImageViewBitmap(R.id.us_mem_stack, stack);
        views.setTextViewText(R.id.us_mem_title, model.title);
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
