package com.usapp.pushsupport;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class UsPushChannelsTest {
    @Test
    public void channelIdsMatchTheServerContract() {
        assertEquals(2, UsPushChannels.ALL.size());
        assertEquals("us_partner", UsPushChannels.ALL.get(0).id);
        assertEquals(UsPushChannels.IMPORTANCE_HIGH, UsPushChannels.ALL.get(0).importance);
        assertEquals("us_reminders", UsPushChannels.ALL.get(1).id);
        assertEquals(UsPushChannels.IMPORTANCE_DEFAULT, UsPushChannels.ALL.get(1).importance);
    }

    @Test
    public void firebaseIsConfiguredOnlyWithAGeneratedAppId() {
        assertFalse(UsPushChannels.firebaseConfigured(0, null));
        assertFalse(UsPushChannels.firebaseConfigured(0, "1:1234567890:android:abc123"));
        assertFalse(UsPushChannels.firebaseConfigured(42, ""));
        assertFalse(UsPushChannels.firebaseConfigured(42, "placeholder"));
        assertTrue(UsPushChannels.firebaseConfigured(42, "1:1234567890:android:0123456789abcdef"));
    }
}
