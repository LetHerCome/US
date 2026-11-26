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
 * Ricordi (founder, 02/11/2026; widget del redesign 26/11/2026, polaroids as
 * in Ricordi): your photos of this day in a past year ("Un anno fa"), or else
 * the newest. US draws them while it is open (widgets.js composeStack): in the
 * 2x2 one polaroid with the date under the photo and the tape of whoever
 * added it, in the 4x2 two, with «Un anno fa» in Fraunces and the place
 * beside them. Without memories, one line. The tap opens Ricordi.
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
        RemoteViews small = fill(context, state, model, R.layout.us_widget_memories, "memories", false);
        RemoteViews medium = fill(context, state, model, R.layout.us_widget_memories_medium, "memories_wide", true);
        // 4x2: «Un anno fa» in Fraunces, then the place and the photos of that day.
        UsWidgetArt.serif(medium, context, R.id.us_mem_title, model.pill.isEmpty() ? model.title : model.pill, 21f, 150, 2, false, Layout.Alignment.ALIGN_NORMAL);
        String line = model.pill.isEmpty() ? model.line : model.title + (model.title.isEmpty() || model.line.isEmpty() ? "" : " · ") + model.line;
        medium.setTextViewText(R.id.us_mem_line, line);
        medium.setViewVisibility(R.id.us_mem_line, line.isEmpty() ? View.GONE : View.VISIBLE);
        UsWidgets.themedColor(medium, context, R.id.us_mem_label, "setTextColor", 0xFFB8452F, UsWidgetCharacter.person(state.snapshot, true).night);
        return UsWidgets.sized(options, small, medium);
    }

    private static RemoteViews fill(Context context, UsWidgets.State state, UsWidgetModels.Memories model, int layout, String slot, boolean wide) {
        RemoteViews views = new RemoteViews(context.getPackageName(), layout);
        views.setOnClickPendingIntent(R.id.us_mem_root, UsWidgets.open(context, "memories", 4701));
        Bitmap stack = model.shown ? decode(state.store.readNoiPortrait(slot)) : null;
        boolean shown = stack != null;
        // The polaroids US drew; without them, one line in Fraunces.
        views.setViewVisibility(R.id.us_mem_stack, shown ? View.VISIBLE : View.GONE);
        if (wide) views.setViewVisibility(R.id.us_mem_content, shown ? View.VISIBLE : View.GONE);
        if (!shown) {
            String empty = context.getString(state.snapshot == null ? R.string.us_widget_connect : R.string.us_widget_memories_empty);
            UsWidgetArt.serif(views, context, R.id.us_mem_empty, empty, wide ? 19f : 16f, wide ? 220 : 136, 3, true, wide ? Layout.Alignment.ALIGN_NORMAL : Layout.Alignment.ALIGN_CENTER);
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
