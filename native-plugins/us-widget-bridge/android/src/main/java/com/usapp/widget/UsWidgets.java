package com.usapp.widget;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.ArrayMap;
import android.util.SizeF;
import android.widget.RemoteViews;
import java.time.Instant;
import java.util.Map;
import org.json.JSONObject;

/**
 * One refresh path for every US widget: read the private state once, render
 * each placed widget, then schedule a single inexact alarm for the earliest
 * moment any widget needs to change (midnight in Rome, the final Countdown
 * period, the end of a "sent" state). No polling, no background network.
 */
final class UsWidgets {
    static final String THINK = "think";
    static final String COUNTDOWN = "countdown";
    static final String NOI = "noi";
    static final String PHOTO = "photo";
    static final String DAILY = "daily";
    static final String MESSAGE = "message";
    static final String DAYS = "days";
    static final String[] KINDS = { THINK, COUNTDOWN, NOI, PHOTO, DAILY, MESSAGE, DAYS };
    static final String ACTION_TICK = "com.usapp.us.WIDGET_TICK";
    static final String ACTION_PINNED = "com.usapp.us.WIDGET_PINNED";
    static final String EXTRA_KIND = "us_widget_kind";

    private UsWidgets() {}

    static Class<?> providerFor(String kind) {
        switch (kind) {
            case THINK: return UsThinkWidgetProvider.class;
            case COUNTDOWN: return UsCountdownWidgetProvider.class;
            case NOI: return UsNoiWidgetProvider.class;
            case PHOTO: return UsPhotoWidgetProvider.class;
            case DAILY: return UsDailyWidgetProvider.class;
            case MESSAGE: return UsMessageWidgetProvider.class;
            case DAYS: return UsDaysWidgetProvider.class;
            default: return null;
        }
    }

    static boolean validKind(String kind) {
        return providerFor(kind == null ? "" : kind) != null;
    }

    static int[] ids(Context context, String kind) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        return manager.getAppWidgetIds(new ComponentName(context, providerFor(kind)));
    }

    /** Snapshot of everything a render needs, read once per refresh. */
    static final class State {
        final JSONObject snapshot;
        final JSONObject action;
        final boolean hasCredential;
        final UsWidgetStore store;
        final Instant now = Instant.now();
        Instant nextChange = null;

        State(Context context) {
            store = new UsWidgetStore(context);
            snapshot = store.read();
            action = store.readAction();
            String owner = store.owner();
            hasCredential = !owner.isEmpty() && !new UsWidgetCredentialStore(context).readToken(owner).isEmpty();
        }

        void needsUpdateAt(Instant at) {
            if (at == null || !at.isAfter(now)) return;
            if (nextChange == null || at.isBefore(nextChange)) nextChange = at;
        }
    }

    static synchronized void refreshAll(Context context) {
        Context app = context.getApplicationContext();
        State state = new State(app);
        AppWidgetManager manager = AppWidgetManager.getInstance(app);
        boolean any = false;
        for (String kind : KINDS) {
            int[] ids = manager.getAppWidgetIds(new ComponentName(app, providerFor(kind)));
            for (int id : ids) {
                any = true;
                try {
                    manager.updateAppWidget(id, render(app, kind, state, manager.getAppWidgetOptions(id)));
                } catch (RuntimeException ignored) {
                    // A launcher may reject one oversized/invalid update; the others still refresh.
                }
            }
        }
        schedule(app, any ? state.nextChange : null);
    }

    /** Quick local response for the Ti penso tap: do not decode/refresh the
     * private Photo widget before showing Invio.... The final async result
     * uses refreshAll to keep global scheduling unchanged. */
    static void refreshThink(Context context) {
        Context app = context.getApplicationContext();
        AppWidgetManager manager = AppWidgetManager.getInstance(app);
        int[] placed = manager.getAppWidgetIds(new ComponentName(app, UsThinkWidgetProvider.class));
        if (placed.length == 0) return;
        State state = new State(app);
        for (int id : placed) {
            try { manager.updateAppWidget(id, UsThinkWidgetProvider.render(app, state, manager.getAppWidgetOptions(id))); }
            catch (RuntimeException ignored) { /* launcher cannot block widget send */ }
        }
    }

    static void refresh(Context context, String kind, int appWidgetId) {
        Context app = context.getApplicationContext();
        AppWidgetManager manager = AppWidgetManager.getInstance(app);
        State state = new State(app);
        manager.updateAppWidget(appWidgetId, render(app, kind, state, manager.getAppWidgetOptions(appWidgetId)));
    }

    static RemoteViews render(Context context, String kind, State state, Bundle options) {
        switch (kind) {
            case THINK: return UsThinkWidgetProvider.render(context, state, options);
            case COUNTDOWN: return UsCountdownWidgetProvider.render(context, state, options);
            case NOI: return UsNoiWidgetProvider.render(context, state, options);
            case DAILY: return UsDailyWidgetProvider.render(context, state, options);
            case MESSAGE: return UsMessageWidgetProvider.render(context, state);
            case DAYS: return UsDaysWidgetProvider.render(context, state, options);
            default: return UsPhotoWidgetProvider.render(context, state, options);
        }
    }

    private static void schedule(Context context, Instant at) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        PendingIntent tick = PendingIntent.getBroadcast(context, 4300,
            new Intent(context, UsWidgetSystemReceiver.class).setAction(ACTION_TICK),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        if (at == null) {
            alarms.cancel(tick);
            return;
        }
        // Inexact and non-waking: the widget is only seen with the screen on,
        // and the alarm is delivered as soon as the phone wakes.
        alarms.set(AlarmManager.RTC, at.toEpochMilli(), tick);
    }

    /** Pastello: from this width (dp) the 4x2 layout instead of the 2x2. */
    static final float MEDIUM_MIN_WIDTH_DP = 250f;

    /** The 2x2 and the 4x2 layout: Android 12+ picks by size itself, before it the reported width decides. */
    static RemoteViews sized(Bundle options, RemoteViews small, RemoteViews medium) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Map<SizeF, RemoteViews> sizes = new ArrayMap<>();
            sizes.put(new SizeF(110f, 110f), small);
            sizes.put(new SizeF(MEDIUM_MIN_WIDTH_DP, 110f), medium);
            return new RemoteViews(sizes);
        }
        int width = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        return width >= MEDIUM_MIN_WIDTH_DP ? medium : small;
    }

    /**
     * Pastello portrait: the round photo with its ring (prepared by US), or
     * a plain circle in that person's colour until it arrives.
     */
    static void avatar(RemoteViews views, byte[] raw, int id, int colour) {
        android.graphics.Bitmap bitmap = null;
        if (raw != null) {
            try { bitmap = android.graphics.BitmapFactory.decodeByteArray(raw, 0, raw.length); }
            catch (RuntimeException ignored) {}
        }
        if (bitmap != null) {
            views.setImageViewBitmap(id, bitmap);
            views.setInt(id, "setColorFilter", 0);
        } else {
            views.setImageViewResource(id, R.drawable.us_widget_pastel_circle);
            views.setInt(id, "setColorFilter", colour);
        }
    }

    /** Opens US on a destination. ACTION_VIEW so @capacitor/app emits appUrlOpen on a warm app too. */
    static PendingIntent open(Context context, String destination, int requestCode) {
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("us://widget/" + destination));
        intent.setPackage(context.getPackageName());
        if (launch != null && launch.getComponent() != null) intent.setComponent(launch.getComponent());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static float density(Context context) {
        return context.getResources().getDisplayMetrics().density;
    }
}
