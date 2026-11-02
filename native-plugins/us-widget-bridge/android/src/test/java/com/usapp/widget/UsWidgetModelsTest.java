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
        // Pastello: the year towards the next anniversary.
        assertEquals("Insieme da", view.label);
        assertEquals("Insieme dal 21 aprile", view.headline);
        assertEquals("giorni insieme", view.line);
        assertEquals(168 * 1000 / 365, view.progress);
    }

    @Test
    public void countdownPastelLabelsAndTheLastTwoWeeks() throws Exception {
        Instant now = Instant.parse("2026-11-02T10:00:00Z");
        UsWidgetModels.Countdown view = UsWidgetModels.countdown(snapshot(countdown("days", "2026-11-14", "editorial").put("title", "Lisbona")), now);
        assertEquals("12", view.value);
        assertEquals("Mancano", view.label);
        assertEquals("Lisbona · 14 novembre", view.headline);
        assertEquals("giorni · Lisbona", view.line);
        assertEquals(2, view.ticks());
        // Far away: the ticks are all dark; on the day, all lit.
        assertEquals(0, UsWidgetModels.countdown(snapshot(countdown("days", "2026-12-25", "editorial")), now).ticks());
        UsWidgetModels.Countdown today = UsWidgetModels.countdown(snapshot(countdown("days", "2026-11-02", "editorial")), now);
        assertEquals("Ci siamo", today.label);
        assertEquals(14, today.ticks());
        assertEquals(1000, UsWidgetModels.fortnight(-3));
        // The clock: the day in Rome, the hours apart, the title alone in the final day.
        UsWidgetModels.Countdown clock = UsWidgetModels.countdown(snapshot(countdown("clock", "2026-11-05T23:30:00Z", "editorial").put("title", "Concerto")), now);
        assertEquals("Concerto · 6 novembre", clock.headline);
        assertEquals("13 ore", clock.sub);
        assertEquals(11, clock.ticks());
        UsWidgetModels.Countdown last = UsWidgetModels.countdown(snapshot(countdown("clock", "2026-11-02T20:00:00Z", "editorial").put("title", "Concerto")), now);
        assertTrue(last.ticking);
        assertEquals("Concerto", last.line);
        assertEquals(14, last.ticks());
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
        assertEquals("5 ore", far.sub);
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

    // Pastello (founder, 02/11/2026): the tap turns the widget at once into
    // "Ricambiato · adesso" and sends behind it; "Ancora" sends again.
    @Test
    public void thinkTapIsDoneAtOnceAndSendsBehind() throws Exception {
        JSONObject s = snapshot(null);
        s.getJSONObject("think").put("lastReceivedAt", "2026-10-06T09:58:00Z");
        Instant now = Instant.parse("2026-10-06T10:00:01Z");
        UsWidgetModels.Think sending = UsWidgetModels.think(s, action("sending", "2026-10-06T10:00:00Z").put("reply", true), true, now);
        assertTrue(sending.done);
        assertTrue("in flight: a second tap waits", sending.busy);
        assertEquals("Ricambiato", sending.line);
        assertEquals("adesso", sending.when);
        assertEquals("Ancora", sending.cta);
        UsWidgetModels.Think sent = UsWidgetModels.think(s, action("sent", "2026-10-06T10:00:00Z").put("reply", true), true, Instant.parse("2026-10-06T10:00:30Z"));
        assertTrue(sent.done);
        assertFalse("past the cooldown the heart sends again", sent.busy);
        assertEquals("Ricambiato", sent.line);
        // Not a reply: "Inviato".
        assertEquals("Inviato", UsWidgetModels.think(snapshot(null), action("sent", "2026-10-06T10:00:00Z"), true, Instant.parse("2026-10-06T10:00:30Z")).line);
        // After a minute the widget tells the day again.
        UsWidgetModels.Think later = UsWidgetModels.think(snapshot(null), action("sent", "2026-10-06T10:00:00Z"), true, Instant.parse("2026-10-06T10:01:01Z"));
        assertFalse(later.done);
        assertEquals("Pensa a Beatrice", later.line);
        assertEquals("Ti penso", later.cta);
        assertEquals(Instant.parse("2026-10-06T10:01:00Z"), sent.nextChange);
    }

    @Test
    public void thinkFailureAndPauseAskToRetry() throws Exception {
        UsWidgetModels.Think stale = UsWidgetModels.think(snapshot(null), action("sending", "2026-10-06T10:00:00Z"), true, Instant.parse("2026-10-06T10:01:00Z"));
        assertFalse(stale.busy);
        assertFalse(stale.done);
        assertEquals("Non è partito", stale.line);
        assertEquals("Riprova", stale.cta);
        assertEquals("Riprova", UsWidgetModels.think(snapshot(null), action("rate_limited", "2026-10-06T10:00:00Z"), true, Instant.parse("2026-10-06T10:00:30Z")).cta);
        UsWidgetModels.Think unauthorized = UsWidgetModels.think(snapshot(null), action("unauthorized", "2026-10-06T10:00:00Z"), true, Instant.parse("2026-10-06T10:00:30Z"));
        assertFalse(unauthorized.canSend);
        assertEquals("Apri", unauthorized.cta);
    }

    @Test
    public void ricambiaOnlyWhileThePartnerThoughtIsUnanswered() throws Exception {
        Instant now = Instant.parse("2026-10-06T12:00:00Z");
        JSONObject s = snapshot(null);
        s.getJSONObject("think").put("lastReceivedAt", "2026-10-06T11:50:00Z").put("lastSentAt", "2026-10-06T08:00:00Z");
        UsWidgetModels.Think unanswered = UsWidgetModels.think(s, null, true, now);
        assertEquals("Ricambia", unanswered.cta);
        assertEquals("Beatrice ti ha pensato", unanswered.line);
        assertEquals("10 min fa", unanswered.when);
        assertEquals("Beatrice", unanswered.partner);

        s.getJSONObject("think").put("lastSentAt", "2026-10-06T11:55:00Z");
        UsWidgetModels.Think answered = UsWidgetModels.think(s, null, true, now);
        assertEquals("Ti penso", answered.cta);
        assertEquals("Pensa a Beatrice", answered.line);
        assertEquals("", answered.when);

        // A send made from the widget answers too, before the app has synced.
        s.getJSONObject("think").put("lastSentAt", "2026-10-06T08:00:00Z");
        JSONObject nativeSent = action("sent", "2026-10-06T11:40:00Z").put("sentAt", "2026-10-06T11:52:00Z");
        assertEquals("Ti penso", UsWidgetModels.think(s, nativeSent, true, now).cta);

        // A reaction to the partner's thought answers it too.
        s.getJSONObject("think").put("lastAnsweredAt", "2026-10-06T11:55:00Z");
        assertEquals("Ti penso", UsWidgetModels.think(s, null, true, now).cta);
    }

    @Test
    public void thinkCountIsTodayInRomeFromTheAppPlusTheWidgetSends() throws Exception {
        Instant now = Instant.parse("2026-10-06T12:00:00Z");
        JSONObject s = snapshot(null);
        assertEquals("an older app says nothing", -1, UsWidgetModels.thinkCount(UsWidgetContract.normalize(s), 0, now));
        s.getJSONObject("think").put("todayCount", 11).put("todayDate", "2026-10-06");
        JSONObject clean = UsWidgetContract.normalize(s);
        assertEquals(11, UsWidgetModels.thinkCount(clean, 0, now));
        assertEquals("plus the widget's own sends after the app's count", 12, UsWidgetModels.thinkCount(clean, 1, now));
        // Midnight in Rome: yesterday's count is not today's.
        assertEquals(0, UsWidgetModels.thinkCount(clean, 0, Instant.parse("2026-10-06T22:30:00Z")));
        s.getJSONObject("think").put("todayCount", -4);
        assertEquals(0, UsWidgetModels.thinkCount(UsWidgetContract.normalize(s), 0, now));
        assertEquals(1, UsWidgetModels.thinkCount(null, 1, now));
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
    @Test
    public void noiInvitationUsesRomeCivilDayAndIsStableUntilMidnight() throws Exception {
        Instant before = Instant.parse("2026-10-06T21:59:00Z");
        Instant after = Instant.parse("2026-10-06T22:00:00Z");
        String text = UsWidgetModels.noiInvitation(before);
        assertEquals(text, UsWidgetModels.noiInvitation(Instant.parse("2026-10-06T12:00:00Z")));
        assertNotEquals(text, UsWidgetModels.noiInvitation(after));
        assertTrue(text.equals("Un momento per voi") || text.equals("Una domanda per voi")
            || text.equals("Giocate un po'") || text.equals("Scopritevi ancora"));
        UsWidgetModels.Couple model = UsWidgetModels.couple(snapshot(null), before);
        assertEquals(text, model.todayInvitation);
        assertEquals(UsWidgetModels.nextRomeMidnight(before), model.nextChange);
    }

    @Test
    public void noiEmptyCoupleOffersInvitationWithoutInventingPersonalData() {
        UsWidgetModels.Couple empty = UsWidgetModels.couple(null, Instant.parse("2026-10-06T10:00:00Z"));
        assertEquals(-1, empty.days);
        assertNotNull(empty.todayInvitation);
        assertEquals("", empty.names);
    }

    @Test
    public void noiDistanceIsPresentationOnlyAndSanitized() throws Exception {
        JSONObject snap = snapshot(null);
        snap.getJSONObject("couple").put("distanceText", "12,5 km").put("distanceState", "stale")
            .put("latitude", "42.4").put("longitude", "14.2").put("signedUrl", "https://x");
        JSONObject clean = UsWidgetContract.normalize(snap);
        assertEquals("12,5 km", clean.getJSONObject("couple").getString("distanceText"));
        assertEquals("stale", clean.getJSONObject("couple").getString("distanceState"));
        assertFalse(clean.toString().contains("latitude"));
        assertFalse(clean.toString().contains("longitude"));
        assertEquals("12,5 km", UsWidgetModels.couple(clean, Instant.parse("2026-10-06T10:00:00Z")).distanceText);
        snap.getJSONObject("couple").put("distanceText", "42.4,14.2");
        assertEquals("", UsWidgetContract.normalize(snap).getJSONObject("couple").getString("distanceText"));
    }

    // ---------- Batteria del partner ----------

    @Test
    public void partnerBatteryIsShownForADayAndQuieterAfterAnHour() throws Exception {
        JSONObject snap = snapshot(null);
        snap.getJSONObject("couple").put("batteryLevel", 18).put("batteryCharging", false).put("batteryAt", "2026-10-31T10:00:00Z");
        JSONObject clean = UsWidgetContract.normalize(snap);
        assertEquals(18, clean.getJSONObject("couple").getInt("batteryLevel"));
        assertEquals("2026-10-31T10:00:00Z", clean.getJSONObject("couple").getString("batteryAt"));

        UsWidgetModels.Couple fresh = UsWidgetModels.couple(clean, Instant.parse("2026-10-31T10:20:00Z"));
        assertTrue(fresh.batteryShown());
        assertFalse(fresh.batteryOld);
        assertTrue(fresh.batteryLow());
        assertEquals("low", fresh.batteryGlyph());
        assertEquals(Instant.parse("2026-10-31T11:00:00Z"), fresh.batteryNextChange);

        UsWidgetModels.Couple old = UsWidgetModels.couple(clean, Instant.parse("2026-10-31T13:00:00Z"));
        assertTrue(old.batteryOld);
        assertEquals(Instant.parse("2026-11-01T10:00:00Z"), old.batteryNextChange);

        UsWidgetModels.Couple gone = UsWidgetModels.couple(clean, Instant.parse("2026-11-01T10:00:00Z"));
        assertFalse(gone.batteryShown());
        assertNull(gone.batteryNextChange);
    }

    @Test
    public void partnerBatteryGlyphsAndBadInputs() throws Exception {
        JSONObject snap = snapshot(null);
        JSONObject couple = snap.getJSONObject("couple").put("batteryAt", "2026-10-31T10:00:00Z");
        Instant now = Instant.parse("2026-10-31T10:05:00Z");
        couple.put("batteryLevel", 18).put("batteryCharging", true);
        UsWidgetModels.Couple charging = UsWidgetModels.couple(UsWidgetContract.normalize(snap), now);
        assertEquals("charging", charging.batteryGlyph());
        assertFalse(charging.batteryLow());
        couple.put("batteryLevel", 60).put("batteryCharging", false);
        assertEquals("medium", UsWidgetModels.couple(UsWidgetContract.normalize(snap), now).batteryGlyph());
        couple.put("batteryLevel", 61);
        assertEquals("high", UsWidgetModels.couple(UsWidgetContract.normalize(snap), now).batteryGlyph());

        for (Object level : new Object[] { 101, -5, "pieno" }) {
            couple.put("batteryLevel", level);
            JSONObject clean = UsWidgetContract.normalize(snap);
            assertEquals(-1, clean.getJSONObject("couple").getInt("batteryLevel"));
            assertFalse(UsWidgetModels.couple(clean, now).batteryShown());
        }
        couple.put("batteryLevel", 50).put("batteryAt", "ieri");
        assertFalse(UsWidgetModels.couple(UsWidgetContract.normalize(snap), now).batteryShown());
        // An older app writes no battery at all.
        assertFalse(UsWidgetModels.couple(snapshot(null), now).batteryShown());
    }

    // ---------- Relative times ("10 min fa"), shared by the widgets ----------

    @Test
    public void relativeTimesRoundTheFirstHourAndStopAfterAWeek() throws Exception {
        Instant at = Instant.parse("2026-10-31T10:00:00Z");
        assertEquals("proprio ora", UsWidgetModels.bubbleAgo(at, at.plusSeconds(4 * 60)));
        assertEquals("5 min fa", UsWidgetModels.bubbleAgo(at, at.plusSeconds(9 * 60)));
        assertEquals("55 min fa", UsWidgetModels.bubbleAgo(at, at.plusSeconds(59 * 60)));
        assertEquals("1 ora fa", UsWidgetModels.bubbleAgo(at, at.plusSeconds(119 * 60)));
        assertEquals("2 ore fa", UsWidgetModels.bubbleAgo(at, at.plusSeconds(120 * 60)));
        assertEquals("ieri", UsWidgetModels.bubbleAgo(at, at.plusSeconds(30 * 3600)));
        assertEquals("6 giorni fa", UsWidgetModels.bubbleAgo(at, at.plusSeconds(6 * 86400 + 60)));
        assertEquals("a week old: nothing", "", UsWidgetModels.bubbleAgo(at, at.plusSeconds(7 * 86400)));
        assertEquals("from the future: nothing", "", UsWidgetModels.bubbleAgo(at, at.minusSeconds(3600)));
        assertEquals("", UsWidgetModels.bubbleAgo(null, at));
        assertEquals(at.plusSeconds(10 * 60), UsWidgetModels.bubbleNextChange(at, at.plusSeconds(7 * 60)));
    }

    // ---------- Distanza e batteria (Pastello) ----------

    @Test
    public void distanceSaysCloseAndHowOldTheReadingIs() throws Exception {
        Instant now = Instant.parse("2026-10-31T11:00:00Z");
        JSONObject snap = snapshot(null);
        snap.getJSONObject("couple").put("distanceText", "12 km").put("distanceAt", "2026-10-31T10:50:00Z");
        UsWidgetModels.Couple couple = UsWidgetModels.couple(UsWidgetContract.normalize(snap), now);
        assertEquals("12 km", couple.distanceText);
        assertEquals("aggiornato 10 min fa", couple.distanceAgo);
        assertEquals(Instant.parse("2026-10-31T11:05:00Z"), couple.distanceNextChange);
        snap.getJSONObject("couple").put("distanceText", "").put("distanceNear", true).put("distanceAt", "2026-10-31T10:58:00Z");
        UsWidgetModels.Couple near = UsWidgetModels.couple(UsWidgetContract.normalize(snap), now);
        assertTrue(near.distanceNear);
        assertEquals("aggiornato ora", near.distanceAgo);
        // A reading of last month says nothing about when.
        snap.getJSONObject("couple").put("distanceAt", "2026-10-01T10:00:00Z");
        assertEquals("", UsWidgetModels.couple(UsWidgetContract.normalize(snap), now).distanceAgo);
        assertFalse(UsWidgetModels.couple(snapshot(null), now).distanceNear);
    }

    // ---------- Lasciato per te: only the kind and the time of the closed envelope ----------

    @Test
    public void messageShowsOnlyTheWaitingLasciatoPerTe() throws Exception {
        Instant now = Instant.parse("2026-10-31T11:00:00Z");
        JSONObject snap = snapshot(null);
        // A Ti penso alone is for the Ti penso widget.
        snap.getJSONObject("think").put("lastReceivedAt", "2026-10-31T10:58:00Z");
        UsWidgetModels.Message none = UsWidgetModels.message(UsWidgetContract.normalize(snap), now);
        assertTrue(none.empty);
        assertEquals("Il prossimo Lasciato per te arriverà qui", none.text);
        assertEquals("", none.hint);
        assertEquals("message", none.destination);

        snap.put("left", new JSONObject().put("kind", "photo").put("at", "2026-10-31T10:50:00Z").put("body", "SEGRETO"));
        JSONObject clean = UsWidgetContract.normalize(snap);
        assertFalse("never the content", clean.toString().contains("SEGRETO"));
        UsWidgetModels.Message left = UsWidgetModels.message(clean, now);
        assertEquals("Ti ha lasciato una foto", left.text);
        assertEquals("la scopri solo dentro US", left.hint);
        assertEquals("10 min fa", left.when);
        assertEquals("message/left", left.destination);
        assertEquals(Instant.parse("2026-10-31T11:05:00Z"), left.nextChange);
    }

    @Test
    public void messageKindsOldEnvelopesAndEmptyStates() throws Exception {
        Instant now = Instant.parse("2026-10-31T11:00:00Z");
        String[][] kinds = { { "text", "un messaggio", "lo" }, { "audio", "un vocale", "lo" }, { "video", "un video", "lo" }, { "music", "una canzone", "la" } };
        for (String[] kind : kinds) {
            JSONObject snap = snapshot(null).put("left", new JSONObject().put("kind", kind[0]).put("at", "2026-10-31T09:00:00Z"));
            UsWidgetModels.Message view = UsWidgetModels.message(UsWidgetContract.normalize(snap), now);
            assertEquals("Ti ha lasciato " + kind[1], view.text);
            assertEquals(kind[2] + " scopri solo dentro US", view.hint);
        }
        // An envelope still closed after ten days still waits; only the time goes.
        JSONObject old = snapshot(null).put("left", new JSONObject().put("kind", "text").put("at", "2026-10-21T09:00:00Z"));
        UsWidgetModels.Message waiting = UsWidgetModels.message(UsWidgetContract.normalize(old), now);
        assertEquals("Ti ha lasciato un messaggio", waiting.text);
        assertEquals("", waiting.when);
        // A Ti penso of last month is not news.
        JSONObject stale = snapshot(null);
        stale.getJSONObject("think").put("lastReceivedAt", "2026-10-01T09:00:00Z");
        UsWidgetModels.Message quiet = UsWidgetModels.message(UsWidgetContract.normalize(stale), now);
        assertTrue(quiet.empty);
        assertEquals("message", quiet.destination);
        assertEquals("unknown kind", "", UsWidgetContract.normalize(snapshot(null).put("left", new JSONObject().put("kind", "secret").put("at", "2026-10-31T09:00:00Z"))).getJSONObject("left").getString("kind"));
        assertTrue(UsWidgetModels.message(null, now).empty);
    }

    // ---------- Foto & giorni (Pastello) ----------

    private static JSONObject photos(String hour) throws Exception {
        JSONObject snap = snapshot(null);
        snap.put("photo", new JSONObject().put("state", "ready").put("key", "a".repeat(32)).put("takenOn", "2026-10-12")
            .put("label", "Lisbona").put("hour", hour)
            .put("next", new JSONArray()
                .put(new JSONObject().put("key", "b".repeat(32)).put("takenOn", "2026-09-01").put("label", "Ricordo al mare"))
                .put(new JSONObject().put("key", "c".repeat(32)).put("takenOn", "").put("label", ""))));
        return UsWidgetContract.normalize(snap);
    }

    @Test
    public void thePhotoChangesEveryHourLikeOggiWithUsClosed() throws Exception {
        JSONObject snap = photos("2026-10-31T10:00:00Z");
        UsWidgetModels.PhotoSlot first = UsWidgetModels.photoSlot(snap, Instant.parse("2026-10-31T10:20:00Z"));
        assertEquals("a".repeat(32), first.key);
        assertEquals(0, first.index);
        assertEquals(3, first.count);
        assertEquals("Lisbona", first.label);
        assertEquals(Instant.parse("2026-10-31T11:00:00Z"), first.nextChange);
        UsWidgetModels.PhotoSlot second = UsWidgetModels.photoSlot(snap, Instant.parse("2026-10-31T11:05:00Z"));
        assertEquals("b".repeat(32), second.key);
        assertEquals(1, second.index);
        // After the third hour it stays on the last one until US is opened again.
        UsWidgetModels.PhotoSlot last = UsWidgetModels.photoSlot(snap, Instant.parse("2026-10-31T15:00:00Z"));
        assertEquals("c".repeat(32), last.key);
        assertNull(last.nextChange);
        assertFalse(UsWidgetModels.photoSlot(snapshot(null), Instant.parse("2026-10-31T10:00:00Z")).ready());
    }

    @Test
    public void thePhotoLineSaysSinceWhenAndWhereInItalian() throws Exception {
        JSONObject snap = photos("2026-10-31T10:00:00Z");
        Instant now = Instant.parse("2026-10-31T10:20:00Z");
        assertEquals("dal 21 aprile · Lisbona, 12 ottobre", UsWidgetModels.photoLine(snap, UsWidgetModels.photoSlot(snap, now)));
        assertEquals("dal 21 aprile · Ricordo al mare, 1 settembre", UsWidgetModels.photoLine(snap, UsWidgetModels.photoSlot(snap, Instant.parse("2026-10-31T11:00:00Z"))));
        assertEquals("dal 21 aprile", UsWidgetModels.photoLine(snap, UsWidgetModels.photoSlot(snap, Instant.parse("2026-10-31T12:00:00Z"))));
        assertEquals("21 aprile", UsWidgetModels.italianDay("2026-04-21"));
        assertEquals("", UsWidgetModels.italianDay("ieri"));
    }

    // ---------- Colori delle persone (Pastello) ----------

    @Test
    public void eachPersonsColourOrTheUsualOne() throws Exception {
        JSONObject snap = snapshot(null);
        assertEquals(0xFFFF7C96, UsWidgetModels.personColor(UsWidgetContract.normalize(snap), true));
        assertEquals(0xFFA98BFF, UsWidgetModels.personColor(UsWidgetContract.normalize(snap), false));
        snap.getJSONObject("couple").put("colors", new JSONObject().put("me", "#a98bff").put("partner", "#6FB8FF"));
        JSONObject clean = UsWidgetContract.normalize(snap);
        assertEquals(0xFFA98BFF, UsWidgetModels.personColor(clean, true));
        assertEquals(0xFF6FB8FF, UsWidgetModels.personColor(clean, false));
        snap.getJSONObject("couple").put("colors", new JSONObject().put("me", "red").put("partner", "#12345"));
        clean = UsWidgetContract.normalize(snap);
        assertEquals("only #rrggbb", "", clean.getJSONObject("couple").getJSONObject("colors").getString("me"));
        assertEquals(0xFFFF7C96, UsWidgetModels.personColor(clean, true));
    }

    @Test
    public void dailyKnowsWhoHasAnswered() throws Exception {
        JSONObject snap = snapshot(null);
        snap.put("daily", new JSONObject().put("date", "2026-10-25").put("question", "Una domanda").put("state", "your_turn"));
        UsWidgetModels.Daily daily = UsWidgetModels.daily(UsWidgetContract.normalize(snap), Instant.parse("2026-10-25T10:00:00Z"));
        assertTrue(daily.partnerAnswered());
        assertFalse(daily.meAnswered());
        snap.getJSONObject("daily").put("state", "ready");
        UsWidgetModels.Daily both = UsWidgetModels.daily(UsWidgetContract.normalize(snap), Instant.parse("2026-10-25T10:00:00Z"));
        assertTrue(both.partnerAnswered() && both.meAnswered());
    }

    // ---------- La domanda di oggi ----------

    @Test
    public void dailyCarriesOnlyTheQuestionAndWhoseTurnItIs() throws Exception {
        JSONObject snap = snapshot(null);
        snap.put("daily", new JSONObject().put("date", "2026-10-25").put("question", "Quale momento vorresti rivivere?")
            .put("state", "your_turn").put("answer", "SEGRETO").put("partnerAnswer", "SEGRETO"));
        JSONObject clean = UsWidgetContract.normalize(snap);
        assertEquals("your_turn", clean.getJSONObject("daily").getString("state"));
        assertFalse("never an answer", clean.toString().contains("SEGRETO"));
        UsWidgetModels.Daily daily = UsWidgetModels.daily(clean, Instant.parse("2026-10-25T10:00:00Z"));
        assertTrue(daily.shown());
        assertEquals("Quale momento vorresti rivivere?", daily.question);
        assertEquals("your_turn", daily.state);
    }

    @Test
    public void dailyTurnsStaleAtMidnightInRomeAndRejectsUnknownStates() throws Exception {
        JSONObject snap = snapshot(null);
        snap.put("daily", new JSONObject().put("date", "2026-10-25").put("question", "Una domanda").put("state", "todo"));
        JSONObject clean = UsWidgetContract.normalize(snap);
        // 23:30 UTC on the 25th is already the 26th in Rome (UTC+1 after the clocks change).
        UsWidgetModels.Daily late = UsWidgetModels.daily(clean, Instant.parse("2026-10-25T23:30:00Z"));
        assertFalse(late.shown());
        assertEquals(UsWidgetModels.Daily.STALE, late.state);
        snap.getJSONObject("daily").put("state", "hacked");
        assertEquals("none", UsWidgetContract.normalize(snap).getJSONObject("daily").getString("state"));
        assertEquals("", UsWidgetContract.normalize(snap).getJSONObject("daily").getString("question"));
        assertEquals(UsWidgetModels.Daily.NONE, UsWidgetModels.daily(snapshot(null), Instant.parse("2026-10-25T10:00:00Z")).state);
    }

}
