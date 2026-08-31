package com.usapp.widget;

import android.appwidget.AppWidgetManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public final class UsThinkWidgetActionReceiver extends BroadcastReceiver {
    public static final String ACTION_SEND_THINK = "com.usapp.us.WIDGET_SEND_THINK";
    private static final AtomicBoolean IN_FLIGHT = new AtomicBoolean(false);
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !ACTION_SEND_THINK.equals(intent.getAction())) return;
        if (!IN_FLIGHT.compareAndSet(false, true)) return;
        Context appContext = context.getApplicationContext();
        PendingResult pending = goAsync();
        UsWidgetSnapshotStore snapshot = new UsWidgetSnapshotStore(appContext);
        snapshot.updateActionStatus("sending");
        UsThinkWidgetProvider.updateAll(appContext);
        EXECUTOR.execute(() -> {
            boolean sent = false;
            try {
                String token = new UsWidgetCredentialStore(appContext).readToken();
                if (!token.isEmpty()) sent = new UsWidgetActionClient().send(token, UUID.randomUUID().toString());
                snapshot.updateActionStatus(sent ? "sent" : "failed");
                UsThinkWidgetProvider.updateAll(appContext);
            } finally {
                IN_FLIGHT.set(false);
                pending.finish();
            }
        });
    }
}
