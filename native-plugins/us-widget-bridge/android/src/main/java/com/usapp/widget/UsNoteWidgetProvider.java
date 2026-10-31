package com.usapp.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.StrikethroughSpan;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONObject;

/**
 * Nota (founder, 31/10/2026; docs/missions/widget-nota-v1.md): one note of
 * the couple, chosen per widget. The items tick from the widget (a row tap,
 * UsNoteWidgetActionReceiver); the pencil opens the writing window over the
 * Home screen (UsNoteEditActivity), never the app. Rendered from the copy
 * the app writes; the widget goes online only after a tap.
 */
public final class UsNoteWidgetProvider extends AppWidgetProvider {
    static final String EXTRA_NOTE = "us_note_id";
    static final String EXTRA_ITEM = "us_note_item";
    static final String EXTRA_DONE = "us_note_done";
    private static final int[] ROWS = { R.id.us_note_row_1, R.id.us_note_row_2, R.id.us_note_row_3, R.id.us_note_row_4, R.id.us_note_row_5, R.id.us_note_row_6 };
    private static final int[] CHECKS = { R.id.us_note_check_1, R.id.us_note_check_2, R.id.us_note_check_3, R.id.us_note_check_4, R.id.us_note_check_5, R.id.us_note_check_6 };
    private static final int[] ITEMS = { R.id.us_note_item_1, R.id.us_note_item_2, R.id.us_note_item_3, R.id.us_note_item_4, R.id.us_note_item_5, R.id.us_note_item_6 };

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        UsWidgets.refreshAll(context);
    }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        UsWidgets.refresh(context, UsWidgets.NOTE, id);
    }

    /** A removed widget forgets its note; with the last one the copy and the token go too. */
    @Override public void onDeleted(Context context, int[] removed) {
        Context app = context.getApplicationContext();
        boolean noneLeft = UsWidgets.ids(app, UsWidgets.NOTE).length == 0;
        UsWidgetStore store = new UsWidgetStore(app);
        store.forgetNoteWidgets(removed, noneLeft);
        if (noneLeft) retire(app, store);
    }

    @Override public void onDisabled(Context context) {
        Context app = context.getApplicationContext();
        UsWidgetStore store = new UsWidgetStore(app);
        store.clearNotes();
        retire(app, store);
        UsWidgets.refreshAll(app);
    }

    /** No Nota widget left: the token goes from the phone, the server's at the next app launch. */
    private static void retire(Context app, UsWidgetStore store) {
        UsWidgetCredentialStore credentials = new UsWidgetCredentialStore(app, UsWidgetCredentialStore.NOTE);
        if (!credentials.status(store.owner()).equals("missing")) store.setNoteRevokePending(true);
        credentials.clear();
    }

    static RemoteViews render(Context context, UsWidgets.State state, int widgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.us_widget_note);
        String noteId = state.store.noteFor(widgetId);
        JSONObject note = noteId.isEmpty() ? null : UsNoteModels.find(state.notes(), noteId);
        UsNoteModels.View view = UsNoteModels.view(note, state.now);
        state.needsUpdateAt(view.nextChange);
        if (view.empty) {
            // Not chosen yet, or no longer in the copy: a tap opens the choice.
            views.setTextViewText(R.id.us_note_title, state.snapshot == null
                ? context.getString(R.string.us_widget_connect) : context.getString(R.string.us_widget_note_choose));
            views.setViewVisibility(R.id.us_note_edit, View.GONE);
            views.setViewVisibility(R.id.us_note_body, View.GONE);
            for (int row : ROWS) views.setViewVisibility(row, View.GONE);
            views.setViewVisibility(R.id.us_note_more, View.GONE);
            views.setTextViewText(R.id.us_note_footer, "");
            views.setOnClickPendingIntent(R.id.us_note_root, state.snapshot == null
                ? UsWidgets.open(context, "note", 4801) : choose(context, widgetId));
            views.setContentDescription(R.id.us_note_root, context.getString(R.string.us_widget_note_choose));
            return views;
        }
        views.setTextViewText(R.id.us_note_title, view.title);
        views.setViewVisibility(R.id.us_note_title, view.title.isEmpty() ? View.INVISIBLE : View.VISIBLE);
        views.setViewVisibility(R.id.us_note_edit, View.VISIBLE);
        views.setInt(R.id.us_note_edit, "setColorFilter", 0xB8F7EFE9);
        PendingIntent edit = edit(context, widgetId, noteId);
        views.setOnClickPendingIntent(R.id.us_note_edit, edit);
        views.setOnClickPendingIntent(R.id.us_note_root, edit);
        views.setViewVisibility(R.id.us_note_body, view.body.isEmpty() ? View.GONE : View.VISIBLE);
        views.setTextViewText(R.id.us_note_body, view.body);
        for (int i = 0; i < ROWS.length; i++) {
            if (i >= view.rows.size()) { views.setViewVisibility(ROWS[i], View.GONE); continue; }
            UsNoteModels.Row row = view.rows.get(i);
            views.setViewVisibility(ROWS[i], View.VISIBLE);
            // Done: struck through and quieter (a span: paint flags are not remotable).
            SpannableString text = new SpannableString(row.text);
            if (row.done) text.setSpan(new StrikethroughSpan(), 0, text.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            views.setTextViewText(ITEMS[i], text);
            views.setTextColor(ITEMS[i], row.done ? 0x80F7EFE9 : 0xFFF7EFE9);
            views.setImageViewResource(CHECKS[i], row.done ? R.drawable.us_widget_note_check_square : R.drawable.us_widget_note_square);
            views.setInt(CHECKS[i], "setColorFilter", row.done ? 0xFFA98BFF : 0xB8F7EFE9);
            views.setOnClickPendingIntent(ROWS[i], toggle(context, widgetId, i, noteId, row.id, !row.done));
            views.setContentDescription(ROWS[i], (row.done ? "Fatto: " : "Da fare: ") + row.text + (row.done ? ". Tocca per togliere la spunta" : ". Tocca per spuntare"));
        }
        views.setViewVisibility(R.id.us_note_more, view.more.isEmpty() ? View.GONE : View.VISIBLE);
        views.setTextViewText(R.id.us_note_more, view.more);
        views.setTextViewText(R.id.us_note_footer, view.footer);
        views.setTextColor(R.id.us_note_footer, view.failed ? 0xFFFF8B7B : 0xB8F7EFE9);
        views.setContentDescription(R.id.us_note_root, (view.title.isEmpty() ? "Nota" : "Nota: " + view.title)
            + (view.footer.isEmpty() ? "" : ", " + view.footer) + ". Tocca per scriverci");
        return views;
    }

    /** Each row its own broadcast, distinct by data so the extras never mix. */
    private static PendingIntent toggle(Context context, int widgetId, int row, String noteId, String itemId, boolean done) {
        Intent intent = new Intent(context, UsNoteWidgetActionReceiver.class)
            .setAction(UsNoteWidgetActionReceiver.ACTION_TOGGLE)
            .setData(Uri.parse("us-widget-note://toggle/" + widgetId + "/" + row))
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            .putExtra(EXTRA_NOTE, noteId)
            .putExtra(EXTRA_ITEM, itemId)
            .putExtra(EXTRA_DONE, done);
        return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static PendingIntent edit(Context context, int widgetId, String noteId) {
        Intent intent = new Intent(context, UsNoteEditActivity.class)
            .setData(Uri.parse("us-widget-note://edit/" + widgetId))
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            .putExtra(EXTRA_NOTE, noteId)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static PendingIntent choose(Context context, int widgetId) {
        Intent intent = new Intent(context, UsNoteChooseActivity.class)
            .setData(Uri.parse("us-widget-note://choose/" + widgetId))
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
