package com.usapp.widget;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import java.time.Instant;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;

/**
 * Sends "Ti penso" from the Home screen with US closed.
 *
 * Ti penso ×N (founder, 27/11/2026: «deve funzionare anche sul widget questa
 * cosa ripetuta»): every tap is one more on the heart. The taps are counted
 * in the action state («×3» at once on the widget) and ONE Ti penso leaves
 * UsWidgetModels.BURST_MS after the last tap, with all of them and one action
 * id for the whole burst; the 99th tap sends at once.
 *
 * Why this timer: each tap is a broadcast held open with goAsync(), and the
 * newest one stays open until the send has finished. While a broadcast is
 * open the process runs at receiver priority (not cached, not frozen), so a
 * 1.5 s in-process timer is reliable without any library. WorkManager is not
 * a dependency of US and JobScheduler may defer a 1.5 s job for minutes;
 * exact alarms need a permission Android 14 denies by default. If the
 * process dies anyway, the burst stays in the action file and the widget's
 * tick (UsWidgetSystemReceiver) sends it later with the same id.
 *
 * Double sends are prevented three ways: an in-process lock, the persisted
 * busy window (sending / just sent) re-checked on every tap, and a retry that
 * reuses the same actionId, which the server deduplicates.
 */
public final class UsThinkWidgetActionReceiver extends BroadcastReceiver {
    public static final String ACTION_SEND_THINK = "com.usapp.us.WIDGET_SEND_THINK";
    private static final AtomicBoolean IN_FLIGHT = new AtomicBoolean(false);
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    private static final ScheduledExecutorService TIMER = Executors.newSingleThreadScheduledExecutor();
    private static final Object LOCK = new Object();
    /** The newest tap's broadcast, open until its burst has been sent. */
    private static PendingResult held = null;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !ACTION_SEND_THINK.equals(intent.getAction())) return;
        Context app = context.getApplicationContext();
        UsWidgetModels.Tap tap;
        synchronized (LOCK) {
            UsWidgets.State state = new UsWidgets.State(app);
            UsWidgetModels.Think model = UsWidgetModels.think(state.snapshot, state.action, state.hasCredential, state.now);
            // A very short native gate after a send prevents accidental double
            // taps without keeping the confirmation on-screen.
            Instant previousSuccess = state.action == null ? null :
                UsWidgetContract.instant(state.action.optString("sentAt", ""));
            boolean cooldown = previousSuccess != null && !previousSuccess.isAfter(state.now)
                && state.now.toEpochMilli() - previousSuccess.toEpochMilli() < UsWidgetModels.SEND_COOLDOWN_MS;
            if (!model.canSend || model.busy || (cooldown && !model.counting) || IN_FLIGHT.get()) {
                UsWidgets.refreshThink(app);
                return;
            }
            // "Ricambiato" when the burst answers the partner's thought, "Inviato" otherwise.
            tap = UsWidgetModels.tap(state.action,
                UsWidgetModels.unanswered(UsWidgetContract.optObject(state.snapshot, "think"), state.action), state.now);
            if (!state.store.writeAction("counting", tap.actionId, tap.reply, tap.taps)) return;
            hold(goAsync());
        }
        // Paint «×N» at once, without re-encoding the photos.
        UsWidgets.refreshThink(app);
        // If the process dies before the timer, the tick sends the burst.
        UsWidgets.wakeAt(app, Instant.now().plusMillis(UsWidgetModels.BURST_MS + 500));
        String actionId = tap.actionId;
        boolean force = tap.full;
        TIMER.schedule(() -> flush(app, actionId, force), force ? 0 : UsWidgetModels.BURST_MS, TimeUnit.MILLISECONDS);
    }

    /**
     * The widget's tick (UsWidgetSystemReceiver): a burst still owed after
     * the process died leaves now, with the same id. True when it took the
     * broadcast over (the receiver must not finish it).
     */
    static boolean flushIfOwed(Context context, BroadcastReceiver receiver) {
        Context app = context.getApplicationContext();
        synchronized (LOCK) {
            UsWidgetStore store = new UsWidgetStore(app);
            if (IN_FLIGHT.get() || !UsWidgetModels.burstDue(store.readAction(), null, false, Instant.now())) return false;
            hold(receiver.goAsync());
        }
        flush(app, null, false);
        return true;
    }

    private static void hold(PendingResult next) {
        PendingResult previous = held;
        held = next;
        if (previous != null) previous.finish();
    }

    private static void release() {
        synchronized (LOCK) {
            if (held != null) held.finish();
            held = null;
        }
    }

    /** Sends the burst if it is due; a newer tap's own timer sends it otherwise. */
    private static void flush(Context app, String expectedId, boolean force) {
        String owner;
        String actionId;
        int taps;
        UsWidgetStore store;
        synchronized (LOCK) {
            store = new UsWidgetStore(app);
            JSONObject action = store.readAction();
            Instant now = Instant.now();
            if (!UsWidgetModels.burstDue(action, expectedId, force, now)) {
                // A newer tap's timer is coming and keeps the broadcast open;
                // otherwise (logout, a send already done) nothing is owed.
                if (!UsWidgetModels.burstWaiting(action, now)) release();
                return;
            }
            // A send in flight finishes the open broadcast itself.
            if (!IN_FLIGHT.compareAndSet(false, true)) return;
            owner = store.owner();
            actionId = action.optString("actionId", "");
            taps = UsWidgetModels.taps(action, "taps");
            store.writeAction("sending", actionId, action.optBoolean("reply", false), taps);
        }
        UsWidgets.refreshThink(app);
        String id = actionId;
        EXECUTOR.execute(() -> {
            try {
                UsWidgetCredentialStore credentials = new UsWidgetCredentialStore(app);
                String token = credentials.readToken(owner);
                String result = token.isEmpty() ? UsWidgetActionClient.UNAUTHORIZED
                    : new UsWidgetActionClient().send(credentials.functionsBase(owner), token, id, taps);
                // Logout or account switch while the request was in flight: drop the result.
                if (!owner.equals(store.owner())) return;
                if (UsWidgetActionClient.UNAUTHORIZED.equals(result)) credentials.clear();
                store.writeAction(result, id);
                if (UsWidgetActionClient.SENT.equals(result)) {
                    store.recordThinkSent(id, Instant.now());
                    // "Inviato ×N" in lilla is the success feedback: keep the
                    // "sent" state; the model shows it for SENT_VISIBLE_MS and
                    // schedules the return. (16/10: going idle at once made a
                    // real send look like nothing happened.)
                }
            } finally {
                IN_FLIGHT.set(false);
                UsWidgets.refreshAll(app);
                release();
            }
        });
    }
}
