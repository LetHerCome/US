package com.usapp.us;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.RemoteMessage;
import com.usapp.pushsupport.UsPushOwnerGate;
import java.util.Map;

/**
 * The only effective MESSAGING_EVENT service after manifest merge.
 * FCM v2 is data-only, so Android cannot auto-render it before this gate.
 * No private sender, calendar text, content ref or account id reaches FCM.
 */
public final class UsGuardedMessagingService extends MessagingService {
    private static final String CHANNEL = "us_partner";
    private static final String TITLE = "US.";
    private static final String BODY = "Apri US per vedere le novità.";
    private static final int NOTICE_ID = 1701;

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        final Map<String, String> data = message.getData();
        // Old payloads are not owner-bound; never call Capacitor's generic
        // fireNotification for them. OS auto-display of OLD notification-type
        // packets must be addressed by safe coordinated rollout and QA.
        if (message.getNotification() != null || !"2".equals(data.get("v"))) return;
        if (!UsPushOwnerGate.accepts(this, data.get("installation"))) return;
        // Recheck the owner once at actual notification posting time as well.
        postPrivateSafeNotice(data.get("installation"));
        // Keep Capacitor listeners working on a running WebView, but the v2
        // envelope has no private target/ref and is not navigable by JS.
        PushNotificationsPlugin.sendRemoteMessage(message);
    }

    private void postPrivateSafeNotice(String installation) {
        if (Build.VERSION.SDK_INT >= 33
            && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        final NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || !manager.areNotificationsEnabled()) return;
        final NotificationChannel channel = new NotificationChannel(
            CHANNEL, "US · La vostra attività", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("Notifiche private di US");
        manager.createNotificationChannel(channel);
        if (manager.getNotificationChannel(CHANNEL).getImportance() == NotificationManager.IMPORTANCE_NONE) return;
        if (!UsPushOwnerGate.accepts(this, installation)) return;
        final Intent intent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (intent == null) return;
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        final PendingIntent action = PendingIntent.getActivity(
            this, 1701, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        final Notification notification = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.us_adaptive_foreground_v1)
            .setContentTitle(TITLE)
            .setContentText(BODY)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(action)
            .build();
        // Single tag/id, never per-person or per-event metadata on the tray.
        manager.notify("us-private-notice", NOTICE_ID, notification);
    }

    // onNewToken() intentionally inherited from Capacitor's MessagingService:
    // registration and rotation callbacks remain compatible with the plugin.
}
