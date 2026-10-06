package com.usapp.widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.time.Instant;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class UsWidgetModelsTest {
    private static final String OWNER = "a".repeat(64);

    private static JSONObject snapshot(JSONObject countdown) throws Exception {
        return UsWidgetContract.normalize(new JSONObject()
            .put("schemaVersion", 2)
            .put("ownerHash", OWNER)
            .put("updatedAt", "2026-10-06T10:00:00.000Z")
            .put("think", new JSONObject().put("partnerName", "Beatrice"))
            .put("couple", new JSONObject().put("names", new JSONArray().put("Francesco").put("Beatrice")).put("startedOn", "2026-04-21").put("frame", "aurora"))
            .put("countdown", countdown == null ? new JSONObject() : countdown)
            .put("photo", new JSONObject().put("state", "none")));
    }

    private static JSONObject countdown(String kind, String target, String style) throws Exception {
        return new JSONObject().put("active", true).put("kind", kind).put("title", "Il viaggio").put("target", target).put("style", style);
    }

    // ---------- contract ----------

    @Test
    public void contractRejectsForeignOwnersAndUnknownSchemas() throws Exception {
        assertNull(UsWidgetContract.normalize(new JSONObject().put("schemaVersion", 2).put("ownerHash", "raw-user-id")));
        assertNull(UsWidgetContract.normalize(new JSONObject().put("schemaVersion", 9).put("ownerHash", OWNER)));
    }

    @Test
    public void contractKeepsOnlySemanticFields() throws Exception {
        JSONObject input = snapshot(null)
            .put("accessToken", "secret").put("refreshToken", "secret").put("signedUrl", "https://x");
        input.getJSONObject("photo").put("url", "https://x");
        JSONObject clean = UsWidgetContract.normalize(input);
        String serialized = clean.toString();
        assertFalse(serialized.contains("secret"));
        assertFalse(serialized.contains("https://"));
        assertFalse(serialized.contains("accessToken"));
    }

    @Test
    public void contractMigratesV1ThinkAndSanitizesText() throws Exception {
        JSONObject v1 = new JSONObject().put("schemaVersion", 1).put("ownerHash", OWNER)
            .put("modules", new JSONObject().put("think", new JSONObject()
                .put("partnerName", "Bea\ntrice").put("lastReceivedAt", "2026-10-06T09:00:00.123456+00:00").put("lastActionStatus", "sent")));
        JSONObject clean = UsWidgetContract.normalize(v1);
        assertEquals(2, clean.getInt("schemaVersion"));
        assertEquals("Bea trice", clean.getJSONObject("think").getString("partnerName"));
        assertEquals("2026-10-06T09:00:00.123456Z", clean.getJSONObject("think").getString("lastReceivedAt"));
        assertFalse(clean.getJSONObject("think").has("lastActionStatus"));
    }

    @Test
    public void contractDropsInvalidCountdownAndUnknownStyle() throws Exception {
        JSONObject bad = snapshot(countdown("clock", "domani", "neon"));
        assertFalse(bad.getJSONObject("countdown").getBoolean("active"));
        assertEquals("editorial", bad.getJSONObject("countdown").getString("style"));
        JSONObject date = snapshot(countdown("days", "2026-02-30", "orbit"));
        assertFalse(date.getJSONObject("countdown").getBoolean("active"));
    }

    @Test
    public void contractPhotoNeedsAKey() throws Exception {
        JSONObject input = snapshot(null);
        input.put("photo", new JSONObject().put("state", "ready").put("key", "not-a-key"));
        assertEquals("none", UsWidgetContract.normalize(input).getJSONObject("photo").getString("state"));
        input.put("photo", new JSONObject().put("state", "ready").put("key", "0123456789abcdef0123456789abcdef").put("takenOn", "2026-10-01"));
        assertEquals("ready", UsWidgetContract.normalize(input).getJSONObject("photo").getString("state"));
    }

    // ---------- days together / Rome civil day ----------

    @Test
    public void daysTogetherRollsAtRomeMidnightNotUtc() {
        // 21:59Z on 6 Oct is 23:59 in Rome (CEST): still the 6th.
        assertEquals(168, UsWidgetModels.daysTogether("2026-04-21", Instant.parse("2026-10-06T21:59:00Z")));
        // 22:00Z is 00:00 on the 7th in Rome.
        assertEquals(169, UsWidgetModels.daysTogether("2026-04-21", Instant.parse("2026-10-06T22:00:00Z")));
        // After the DST change (CET, UTC+1) midnight is 23:00Z.
        assertEquals(189, UsWidgetModels.daysTogether("2026-04-21", Instant.parse("2026-10-26T23:00:00Z")));
        assertEquals(-1, UsWidgetModels.daysTogether("2027-01-01", Instant.parse("2026-10-06T10:00:00Z")));
        assertEquals(-1, UsWidgetModels.daysTogether("", Instant.parse("2026-10-06T10:00:00Z")));
    }

    @Test
    public void nextMidnightIsRomeMidnight() {
        Instant next = UsWidgetModels.nextRomeMidnight(Instant.parse("2026-10-06T12:00:00Z"));
        assertEquals(Instant.parse("2026-10-06T22:00:30Z"), next);
    }

    // ---------- Countdown ----------

    @Test
    public void countdownTogetherFollowsOggiSelection() throws Exception {
        UsWidgetModels.Countdown view = UsWidgetModels.countdown(snapshot(countdown("together", "2026-04-21", "aurora").put("title", "Insieme da")), Instant.parse("2026-10-06T10:00:00Z"));
        assertFalse(view.empty);
        assertEquals("Insieme da", view.title);
        assertEquals("168", view.value);
        assertEquals("giorni", view.unit);
        assertEquals("aurora", view.style);
    }

    @Test
    public void countdownCivilDays() throws Exception {
        Instant now = Instant.parse("2026-10-06T10:00:00Z");
        UsWidgetModels.Countdown view = UsWidgetModels.countdown(snapshot(countdown("days", "2026-10-07", "signal")), now);
        assertEquals("1", view.value);
        assertEquals("giorno", view.unit);
        assertEquals("", view.sub);
        UsWidgetModels.Countdown arrived = UsWidgetModels.countdown(snapshot(countdown("days", "2026-10-06", "signal")), now);
        assertEquals("0", arrived.value);
        assertEquals("Ci siamo", arrived.sub);
        assertNull(arrived.nextChange);
    }

    @Test
    public void countdownClockShowsDaysThenTicksInTheFinalDay() throws Exception {
        Instant now = Instant.parse("2026-10-06T10:00:00Z");
        UsWidgetModels.Countdown far = UsWidgetModels.countdown(snapshot(countdown("clock", "2026-10-09T15:30:00Z", "orbit")), now);
        assertFalse(far.ticking);
        assertEquals("3", far.value);
        assertEquals("e 5 ore", far.sub);
        assertNotNull(far.nextChange);

        UsWidgetModels.Countdown last = UsWidgetModels.countdown(snapshot(countdown("clock", "2026-10-06T20:00:00Z", "orbit")), now);
        assertTrue(last.ticking);
        assertEquals(10 * 3_600_000L, last.remainingMs);
        assertEquals(Instant.parse("2026-10-06T20:00:00Z"), last.nextChange);

        UsWidgetModels.Countdown done = UsWidgetModels.countdown(snapshot(countdown("clock", "2026-10-06T09:00:00Z", "orbit")), now);
        assertFalse(done.ticking);
        assertEquals("Ci siamo", done.sub);
    }

    @Test
    public void countdownFarClockSwitchesToTickingWhenTheFinalDayStarts() throws Exception {
        Instant now = Instant.parse("2026-10-06T10:00:00Z");
        UsWidgetModels.Countdown view = UsWidgetModels.countdown(snapshot(countdown("clock", "2026-10-07T10:30:00Z", "editorial")), now);
        assertEquals("1", view.value);
        assertTrue(!view.nextChange.isAfter(Instant.parse("2026-10-06T10:30:01Z")));
    }

    @Test
    public void countdownInactiveIsEmpty() throws Exception {
        assertTrue(UsWidgetModels.countdown(snapshot(null), Instant.now()).empty);
        assertTrue(UsWidgetModels.countdown(null, Instant.now()).empty);
    }

    // ---------- Ti penso ----------

    private static JSONObject action(String status, String at) throws Exception {
        return new JSONObject().put("status", status).put("at", at).put("actionId", "6f1c1f0e-5d2b-4a9b-9a51-1c2d3e4f5a6b");
    }

    @Test
    public void thinkNeedsAccountAndCredential() throws Exception {
        Instant now = Instant.parse("2026-10-06T10:00:00Z");
        UsWidgetModels.Think none = UsWidgetModels.think(null, null, false, now);
        assertFalse(none.canSend);
        UsWidgetModels.Think noCredential = UsWidgetModels.think(snapshot(null), null, false, now);
        assertFalse(noCredential.canSend);
        assertEquals("Apri", noCredential.cta);
    }

    @Test
    public void thinkSendingAndJustSentAreBusy() throws Exception {
        Instant now = Instant.parse("2026-10-06T10:00:05Z");
        UsWidgetModels.Think sending = UsWidgetModels.think(snapshot(null), action("sending", "2026-10-06T10:00:00Z"), true, now);
        assertTrue(sending.busy);
        assertEquals("Invio…", sending.cta);
        UsWidgetModels.Think sent = UsWidgetModels.think(snapshot(null), action("sent", "2026-10-06T10:00:00Z"), true, now);
        assertTrue(sent.busy);
        assertEquals("Inviato a Beatrice", sent.message);
        UsWidgetModels.Think later = UsWidgetModels.think(snapshot(null), action("sent", "2026-10-06T10:00:00Z"), true, Instant.parse("2026-10-06T10:00:30Z"));
        assertFalse(later.busy);
        assertEquals("Inviato", later.cta);
    }

    @Test
    public void thinkInterruptedSendBecomesRetry() throws Exception {
        UsWidgetModels.Think stale = UsWidgetModels.think(snapshot(null), action("sending", "2026-10-06T10:00:00Z"), true, Instant.parse("2026-10-06T10:01:00Z"));
        assertFalse(stale.busy);
        assertEquals("Riprova", stale.cta);
    }

    @Test
    public void ricambiaOnlyWhileThePartnerThoughtIsUnanswered() throws Exception {
        Instant now = Instant.parse("2026-10-06T12:00:00Z");
        JSONObject s = snapshot(null);
        s.getJSONObject("think").put("lastReceivedAt", "2026-10-06T11:30:00Z").put("lastSentAt", "2026-10-06T08:00:00Z");
        UsWidgetModels.Think unanswered = UsWidgetModels.think(s, null, true, now);
        assertEquals("Ricambia", unanswered.cta);
        assertEquals("Beatrice ti sta pensando", unanswered.message);

        s.getJSONObject("think").put("lastSentAt", "2026-10-06T11:45:00Z");
        UsWidgetModels.Think answered = UsWidgetModels.think(s, null, true, now);
        assertEquals("Ti penso", answered.cta);
        assertTrue(answered.message.startsWith("Hai pensato a Beatrice"));

        // A send made from the widget answers too, before the app has synced.
        s.getJSONObject("think").put("lastSentAt", "2026-10-06T08:00:00Z");
        JSONObject nativeSent = action("sent", "2026-10-06T11:40:00Z").put("sentAt", "2026-10-06T11:40:00Z");
        assertEquals("Ti penso", UsWidgetModels.think(s, nativeSent, true, now).cta);

        // A reaction to the partner's thought answers it too.
        s.getJSONObject("think").put("lastAnsweredAt", "2026-10-06T11:35:00Z");
        assertEquals("Ti penso", UsWidgetModels.think(s, null, true, now).cta);

        UsWidgetModels.Think fresh = UsWidgetModels.think(snapshot(null), null, true, now);
        assertEquals("Pensa a Beatrice", fresh.message);
        assertEquals("Ti penso", fresh.cta);
    }

    @Test
    public void retryReusesTheActionIdOnlyRightAfterAFailure() throws Exception {
        Instant now = Instant.parse("2026-10-06T10:00:30Z");
        JSONObject failed = action("failed", "2026-10-06T10:00:00Z");
        assertEquals(failed.getString("actionId"), UsWidgetModels.actionIdFor(failed, now));
        assertNotEquals(failed.getString("actionId"), UsWidgetModels.actionIdFor(action("sent", "2026-10-06T10:00:00Z"), now));
        assertNotEquals(failed.getString("actionId"), UsWidgetModels.actionIdFor(failed, Instant.parse("2026-10-06T10:05:00Z")));
    }

    @Test
    public void coupleNamesAndDays() throws Exception {
        UsWidgetModels.Couple couple = UsWidgetModels.couple(snapshot(null), Instant.parse("2026-10-06T10:00:00Z"));
        assertEquals("Francesco + Beatrice", couple.names);
        assertEquals(168, couple.days);
        assertEquals("aurora", couple.frame);
    }
}
