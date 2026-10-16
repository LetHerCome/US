package com.usapp.us;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.RemoteMessage;
import com.usapp.pushsupport.UsPushChannels;
import com.usapp.pushsupport.UsPushNotices;
import com.usapp.pushsupport.UsPushOwnerGate;
import com.usapp.pushsupport.UsPushSupportPlugin;
import java.util.Locale;
import java.util.Map;

/**
 * The only effective MESSAGING_EVENT service after manifest merge.
 * FCM v2 is data-only, so Android cannot auto-render it before this gate.
 * No private sender, calendar text, content ref or account id reaches FCM.
 */
public final class UsGuardedMessagingService extends MessagingService {
    // Contract with native-push-transport.mjs (ANDROID_SAFE_COPY, collapse
    // key, data v='2' and the allow-listed kind k): tests/s3-fcm-android-
    // contract.test.js keeps them equal. TITLE/BODY are the fallback when the
    // kind is missing (older server) or unknown.
    private static final String CHANNEL = UsPushChannels.PARTNER;
    private static final String TITLE = "US.";
    private static final String BODY = "Apri US per vedere le novità.";
    private static final String NOTICE_TAG = "us-private-notice";
    private static final int NOTICE_ID = 1701;

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        final Map<String, String> data = message.getData();
        // Old payloads are not owner-bound; never call Capacitor's generic
        // fireNotification for them. OS auto-display of OLD notification-type
        // packets must be addressed by safe coordinated rollout and QA.
        if (message.getNotification() != null || !"2".equals(data.get("v"))) return;
        if (!UsPushOwnerGate.accepts(this, data.get("installation"))) return;
        // Preserve presentationOptions=[]: no OS banner while US is visible.
        // The v2 event has no private target/ref and no JS navigation action.
        if (!UsPushSupportPlugin.isActivityResumed()) {
            postPrivateSafeNotice(data.get("installation"), data.get("k"));
        }
        PushNotificationsPlugin.sendRemoteMessage(message);
    }

    private void postPrivateSafeNotice(String installation, String kind) {
        if (Build.VERSION.SDK_INT >= 33
            && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        final NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || !manager.areNotificationsEnabled()) return;
        final NotificationChannel channel = ensureChannel(manager);
        if (channel == null || channel.getImportance() == NotificationManager.IMPORTANCE_NONE) return;
        if (!UsPushOwnerGate.accepts(this, installation)) return;
        final Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launch == null || launch.getComponent() == null) return;
        // Under the SAME lock used for native logout/clear: the owner check,
        // the partner name and notify() happen together. If the account
        // changed, nothing is posted and no other account's name is read.
        try {
            UsPushOwnerGate.postIfCurrent(this, installation, (String partnerName) -> {
                final UsPushNotices.Notice notice = UsPushNotices.forKind(kind, partnerName, Locale.getDefault());
                final boolean known = kind != null && java.util.Arrays.asList(UsPushNotices.KINDS).contains(kind);
                // Opens the matching tab through the public app link (app-links.mjs):
                // a tab, never an action, a ref or private data.
                final Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("com.usapp.us://open/" + notice.page));
                intent.setComponent(launch.getComponent());
                intent.setPackage(getPackageName());
                intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                final PendingIntent action = PendingIntent.getActivity(
                    this, 1701, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                final Notification notification = new NotificationCompat.Builder(this, CHANNEL)
                    .setSmallIcon(R.drawable.us_adaptive_foreground_v1)
                    .setContentTitle(known ? notice.title : TITLE)
                    .setContentText(known ? notice.body : BODY)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(known ? notice.body : BODY))
                    .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                    .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                    .setAutoCancel(true)
                    .setOnlyAlertOnce(true)
                    .setContentIntent(action)
                    .build();
                manager.notify(NOTICE_TAG, NOTICE_ID, notification);
            });
        } catch (RuntimeException ignored) {
            // Permission was revoked or NotificationManager failed: fail closed.
        }
    }

    /**
     * The channel normally exists (UsPushSupportPlugin.load() creates both US
     * channels at app start). Create it only when missing, from the same
     * UsPushChannels spec: re-creating an existing channel would rename it
     * and could lower its importance, and the user's own choices must stay.
     */
    private static NotificationChannel ensureChannel(NotificationManager manager) {
        final NotificationChannel existing = manager.getNotificationChannel(CHANNEL);
        if (existing != null) return existing;
        for (UsPushChannels.Channel spec : UsPushChannels.ALL) {
            if (!CHANNEL.equals(spec.id)) continue;
            final NotificationChannel channel = new NotificationChannel(spec.id, spec.name, spec.importance);
            channel.setDescription(spec.description);
            channel.setShowBadge(true);
            manager.createNotificationChannel(channel);
        }
        return manager.getNotificationChannel(CHANNEL);
    }

    // onNewToken() intentionally inherited from Capacitor's MessagingService:
    // registration and rotation callbacks remain compatible with the plugin.
}
