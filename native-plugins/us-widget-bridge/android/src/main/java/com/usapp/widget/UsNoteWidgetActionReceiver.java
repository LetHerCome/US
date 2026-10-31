package com.usapp.widget;

import android.appwidget.AppWidgetManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/**
 * Nota: a row tap ticks (or unticks) that item with US closed. The copy
 * changes at once; then the server, one request at a time (single thread),
 * changes only that item. Refused: the copy goes back and the footer says
 * "Non salvato" for a minute. Never a Supabase session (widget-nota-v1).
 */
public final class UsNoteWidgetActionReceiver extends BroadcastReceiver {
    public static final String ACTION_TOGGLE = "com.usapp.us.WIDGET_NOTE_TOGGLE";
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !ACTION_TOGGLE.equals(intent.getAction())) return;
        Context app = context.getApplicationContext();
        int widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        String noteId = intent.getStringExtra(UsNoteWidgetProvider.EXTRA_NOTE);
        String itemId = intent.getStringExtra(UsNoteWidgetProvider.EXTRA_ITEM);
        boolean done = intent.getBooleanExtra(UsNoteWidgetProvider.EXTRA_DONE, false);
        UsWidgetStore store = new UsWidgetStore(app);
        // A tap from a widget that now shows another note (or none) does nothing.
        if (noteId == null || itemId == null || !noteId.equals(store.noteFor(widgetId))) return;
        JSONObject before = UsNoteModels.find(store.readNotes(), noteId);
        JSONObject optimistic = before == null ? null : UsNoteModels.toggle(before, itemId, done);
        if (optimistic == null) return;
        String owner = store.owner();
        store.replaceNote(optimistic, "");
        UsWidgets.refreshAll(app);
        PendingResult pending = goAsync();
        EXECUTOR.execute(() -> {
            try {
                UsWidgetCredentialStore credentials = new UsWidgetCredentialStore(app, UsWidgetCredentialStore.NOTE);
                String token = credentials.readToken(owner);
                JSONObject request = new JSONObject().put("op", "toggle").put("noteId", noteId).put("itemId", itemId).put("done", done);
                UsWidgetNoteClient.Result result = token.isEmpty()
                    ? new UsWidgetNoteClient.Result(UsWidgetNoteClient.UNAUTHORIZED, null)
                    : new UsWidgetNoteClient().call(credentials.functionsBase(owner), token, request);
                // Logout or another account while the request was in flight: drop it.
                if (!owner.equals(store.owner())) return;
                if (result.ok()) {
                    store.replaceNote(result.note, "");
                } else {
                    if (result.status == UsWidgetNoteClient.UNAUTHORIZED) credentials.clear();
                    store.replaceNote(before, UsNoteModels.STATUS_FAILED);
                }
            } catch (Exception ignored) {
                if (owner.equals(store.owner())) store.replaceNote(before, UsNoteModels.STATUS_FAILED);
            } finally {
                UsWidgets.refreshAll(app);
                pending.finish();
            }
        });
    }
}
