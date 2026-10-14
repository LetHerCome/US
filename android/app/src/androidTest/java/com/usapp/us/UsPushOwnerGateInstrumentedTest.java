package com.usapp.us;

import static org.junit.Assert.*;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.usapp.pushsupport.UsPushOwnerGate;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * S3 isolated Android device tests. No Firebase registration, network,
 * production credentials or real user/couple data is required.
 *
 * Calls the SAME persisted native owner gate that UsGuardedMessagingService
 * invokes for data-only delayed FCM. This does NOT test FCM transport,
 * Android OS banners or a literal killed-process restart.
 */
@RunWith(AndroidJUnit4.class)
public final class UsPushOwnerGateInstrumentedTest {
    private static final String A_OWNER = "a1f03ee8-f59d-4563-b2eb-e2cb656db57e";
    private static final String B_OWNER = "bfd23089-12a3-4ac6-a4b2-61a6f719d101";
    private static final String A_INSTALL = "aeb99e23-6005-45a2-a575-0be90e814a19";
    private static final String B_INSTALL = "bb051c7d-b413-41a6-8c71-f66e635d162c";
    private Context app;

    @Before public void setup() {
        app = InstrumentationRegistry.getInstrumentation().getTargetContext().getApplicationContext();
        assertTrue(UsPushOwnerGate.clear(app));
    }

    @After public void cleanup() {
        assertTrue(UsPushOwnerGate.clear(app));
    }

    private void bind(String owner, String installation) {
        final String epoch = UsPushOwnerGate.epoch(app);
        assertTrue(UsPushOwnerGate.validUuid(epoch));
        assertTrue(UsPushOwnerGate.bind(app, owner, installation, epoch));
    }

    private boolean post(String installation, AtomicInteger notices) {
        return UsPushOwnerGate.postIfCurrent(app, installation, notices::incrementAndGet);
    }

    @Test public void delayedPacketForAIsRejectedAfterBBecomesOwner() {
        final AtomicInteger posted = new AtomicInteger();
        bind(A_OWNER, A_INSTALL);
        assertTrue(post(A_INSTALL, posted));
        assertEquals(1, posted.get());

        // Simulate logout + install B before the already-routed A packet arrives.
        assertTrue(UsPushOwnerGate.clear(app));
        bind(B_OWNER, B_INSTALL);
        assertFalse(UsPushOwnerGate.accepts(app, A_INSTALL));
        assertFalse(post(A_INSTALL, posted));
        assertEquals("a late packet for A must never call NotificationManager.notify", 1, posted.get());
        assertTrue(post(B_INSTALL, posted));
        assertEquals(2, posted.get());
    }

    @Test public void offlineLogoutRejectsDelayedPacketWithoutServerOrFirebase() {
        final AtomicInteger posted = new AtomicInteger();
        bind(A_OWNER, A_INSTALL);
        // A local logout must fail closed without waiting for a backend response.
        assertTrue(UsPushOwnerGate.clear(app));
        assertFalse(UsPushOwnerGate.hasOwner(app));
        assertFalse(post(A_INSTALL, posted));
        assertFalse(UsPushOwnerGate.accepts(app, A_INSTALL));
        assertEquals(0, posted.get());
    }

    @Test public void persistedGateReadAfterReentryRejectsStaleInstallation() {
        final AtomicInteger posted = new AtomicInteger();
        bind(A_OWNER, A_INSTALL);
        final String staleEpoch = UsPushOwnerGate.epoch(app);
        assertTrue(UsPushOwnerGate.clear(app));
        bind(B_OWNER, B_INSTALL);
        // Re-read from Android SharedPreferences; no in-memory test double.
        assertFalse(UsPushOwnerGate.accepts(app, A_INSTALL));
        assertFalse(post(A_INSTALL, posted));
        assertTrue(UsPushOwnerGate.accepts(app, B_INSTALL));
        assertFalse("delayed A registration cannot resurrect A", UsPushOwnerGate.bind(app, A_OWNER, A_INSTALL, staleEpoch));
        assertFalse(post(A_INSTALL, posted));
        assertTrue(post(B_INSTALL, posted));
        assertEquals(1, posted.get());
    }

    @Test public void missingLegacyAndMalformedInstallationAreRejected() {
        final AtomicInteger posted = new AtomicInteger();
        bind(B_OWNER, B_INSTALL);
        for (String installation : new String[] {"", "legacy", A_INSTALL, UUID.randomUUID().toString()}) {
            assertFalse(post(installation, posted));
        }
        assertFalse(UsPushOwnerGate.accepts(app, null));
        assertFalse(UsPushOwnerGate.postIfCurrent(app, null, posted::incrementAndGet));
        assertFalse(UsPushOwnerGate.postIfCurrent(app, B_INSTALL, null));
        assertEquals(0, posted.get());
    }

    @Test public void logoutCannotInterleaveInsideCheckedNotificationPost() throws Exception {
        final AtomicInteger posted = new AtomicInteger();
        bind(A_OWNER, A_INSTALL);
        final CountDownLatch inPost = new CountDownLatch(1);
        final CountDownLatch releasePost = new CountDownLatch(1);
        final ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            final Future<Boolean> delivering = executor.submit(() ->
                UsPushOwnerGate.postIfCurrent(app, A_INSTALL, () -> {
                    inPost.countDown();
                    try {
                        if (!releasePost.await(5, TimeUnit.SECONDS)) throw new AssertionError("post blocked");
                        posted.incrementAndGet();
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        throw new AssertionError(e);
                    }
                })
            );
            assertTrue("notification entered native critical section", inPost.await(5, TimeUnit.SECONDS));
            final Future<Boolean> logout = executor.submit(() -> UsPushOwnerGate.clear(app));
            try {
                logout.get(150, TimeUnit.MILLISECONDS);
                fail("clear must not interleave between installation check and notify");
            } catch (TimeoutException expected) {
                // clear waits on the very lock held by the notification.
            }
            releasePost.countDown();
            assertTrue(delivering.get(5, TimeUnit.SECONDS));
            assertTrue(logout.get(5, TimeUnit.SECONDS));
            assertEquals(1, posted.get());
            assertFalse(post(A_INSTALL, posted));
            assertEquals(1, posted.get());
        } finally {
            releasePost.countDown();
            executor.shutdownNow();
        }
    }
}
