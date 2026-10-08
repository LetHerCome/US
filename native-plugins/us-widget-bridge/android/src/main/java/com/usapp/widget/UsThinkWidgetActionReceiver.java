package com.usapp.widget;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Sends "Ti penso" from the Home screen with US closed.
 *
 * Double sends are prevented three ways: an in-process lock, the persisted
 * busy window (sending / just sent) re-checked on every tap, and a retry that
 * reuses the same actionId, which the server deduplicates.
 */
public final class UsThinkWidgetActionReceiver extends BroadcastReceiver {
    public static final String ACTION_SEND_THINK = "com.usapp.us.WIDGET_SEND_THINK";
    private static final AtomicBoolean IN_FLIGHT = new AtomicBoolean(false);
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !ACTION_SEND_THINK.equals(intent.getAction())) return;
        Context app = context.getApplicationContext();
        UsWidgets.State state = new UsWidgets.State(app);
        UsWidgetModels.Think model = UsWidgetModels.think(state.snapshot, state.action, state.hasCredential, state.now);
        if (!model.canSend || model.busy) {
            UsWidgets.refreshThink(app);
            return;
        }
        if (!IN_FLIGHT.compareAndSet(false, true)) return;
        String actionId = UsWidgetModels.actionIdFor(state.action, state.now);
        UsWidgetStore store = state.store;
        String owner = store.owner();
        store.writeAction("sending", actionId);
        // Immediately paint Invio... without re-encoding Foto & Noi.
        UsWidgets.refreshThink(app);
        PendingResult pending = goAsync();
        EXECUTOR.execute(() -> {
            try {
                UsWidgetCredentialStore credentials = new UsWidgetCredentialStore(app);
                String token = credentials.readToken(owner);
                String result = token.isEmpty() ? UsWidgetActionClient.UNAUTHORIZED : new UsWidgetActionClient().send(token, actionId);
                // Logout or account switch while the request was in flight: drop the result.
                if (!owner.equals(store.owner())) return;
                if (UsWidgetActionClient.UNAUTHORIZED.equals(result)) credentials.clear();
                store.writeAction(result, actionId);
            } finally {
                IN_FLIGHT.set(false);
                UsWidgets.refreshAll(app);
                pending.finish();
            }
        });
    }
}
