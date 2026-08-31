package com.usapp.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import java.time.Duration;
import java.time.Instant;
import org.json.JSONObject;

public class UsThinkWidgetProvider extends AppWidgetProvider {
    private static final long RECENT_MINUTES = 60;
    private static final long STALE_HOURS = 24;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        updateAll(context, manager, appWidgetIds);
    }

    static void updateAll(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        UsWidgetSnapshotStore store = new UsWidgetSnapshotStore(context);
        JSONObject snapshot = store.read();
        for (int id : appWidgetIds) manager.updateAppWidget(id, render(context, snapshot));
    }

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        android.content.ComponentName component = new android.content.ComponentName(context, UsThinkWidgetProvider.class);
        updateAll(context, manager, manager.getAppWidgetIds(component));
    }

    private static RemoteViews render(Context context, JSONObject snapshot) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.us_widget_think);
        String message = messageFor(snapshot);
        views.setTextViewText(R.id.us_widget_message, message);
        views.setTextViewText(R.id.us_widget_cta, ctaFor(message));
        boolean sending = "sending".equals(actionStatus(snapshot));
        views.setViewVisibility(R.id.us_widget_heart, sending ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.us_widget_heart_pulse, sending ? View.VISIBLE : View.GONE);
        views.setOnClickPendingIntent(R.id.us_widget_root, launchIntent(context));
        views.setOnClickPendingIntent(R.id.us_widget_heart, sendIntent(context));
        views.setOnClickPendingIntent(R.id.us_widget_heart_pulse, sendIntent(context));
        return views;
    }

    private static PendingIntent launchIntent(Context context) {
        Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (intent == null) intent = new Intent();
        intent.setPackage(context.getPackageName());
        intent.setAction("com.usapp.us.WIDGET_OPEN");
        intent.setData(Uri.parse("us://widget/think/open"));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, 4101, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent sendIntent(Context context) {
        Intent intent = new Intent(context, UsThinkWidgetActionReceiver.class);
        intent.setAction(UsThinkWidgetActionReceiver.ACTION_SEND_THINK);
        return PendingIntent.getBroadcast(context, 4102, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static String actionStatus(JSONObject snapshot) {
        JSONObject modules = snapshot == null ? null : snapshot.optJSONObject("modules");
        JSONObject think = modules == null ? null : modules.optJSONObject("think");
        return think == null ? "idle" : think.optString("lastActionStatus", "idle");
    }

    private static String messageFor(JSONObject snapshot) {
        if (snapshot == null) return "Apri l’app per collegarti";
        Instant updatedAt = instant(snapshot.optString("updatedAt", ""));
        if (updatedAt == null || Duration.between(updatedAt, Instant.now()).toHours() >= STALE_HOURS) return "Apri l’app per aggiornare";
        JSONObject modules = snapshot.optJSONObject("modules");
        JSONObject think = modules == null ? null : modules.optJSONObject("think");
        if (think == null) return "Mandagli un pensiero";
        String partnerName = think.optString("partnerName", "").trim();
        if (partnerName.isEmpty()) partnerName = "L’altra persona";
        Instant actionAt = instant(think.optString("lastActionAt", ""));
        String action = think.optString("lastActionStatus", "idle");
        if (actionAt != null && Duration.between(actionAt, Instant.now()).toMinutes() < 10) {
            if (action.equals("sent")) return "Pensiero inviato";
            if (action.equals("failed")) return "Non è partito";
            if (action.equals("sending")) return "Invio…";
        }
        Instant receivedAt = instant(think.optString("lastReceivedAt", ""));
        if (receivedAt == null) return "Mandagli un pensiero";
        long minutes = Math.max(0, Duration.between(receivedAt, Instant.now()).toMinutes());
        if (minutes < RECENT_MINUTES) return partnerName + " ti sta pensando ✨";
        if (minutes < 120) return partnerName + " ti ha pensato\n1 ora fa";
        if (minutes < 1440) return partnerName + " ti ha pensato\n" + (minutes / 60) + " ore fa";
        long days = minutes / 1440;
        return partnerName + " ti ha pensato\n" + days + (days == 1 ? " giorno fa" : " giorni fa");
    }

    private static String ctaFor(String message) {
        if (message.startsWith("Apri l’app")) return "Apri";
        if (message.equals("Mandagli un pensiero")) return "Invia";
        if (message.equals("Pensiero inviato")) return "Inviato";
        if (message.equals("Non è partito")) return "Riprova";
        if (message.equals("Invio…")) return "Invio…";
        return "Ricambia";
    }

    private static Instant instant(String value) {
        try { return value == null || value.isEmpty() ? null : Instant.parse(value); }
        catch (Exception ignored) { return null; }
    }
}
