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
        UsWidgetModels.Think sent = UsWidgetModels.think(snapshot(null), action("sent", "2026-10-06T10:00:04Z"), true, now);
        assertTrue(sent.busy);
        assertEquals("Inviato a Beatrice", sent.message);
        // Past the cooldown the heart sends again, while "Inviato a …" is still readable.
        UsWidgetModels.Think readable = UsWidgetModels.think(snapshot(null), action("sent", "2026-10-06T10:00:04Z"), true, Instant.parse("2026-10-06T10:00:07Z"));
        assertFalse(readable.busy);
        assertEquals("Inviato a Beatrice", readable.message);
        UsWidgetModels.Think later = UsWidgetModels.think(snapshot(null), action("sent", "2026-10-06T10:00:04Z"), true, Instant.parse("2026-10-06T10:00:10Z"));
        assertFalse(later.busy);
        assertEquals("Ti penso", later.cta);
        assertEquals("Pensa a Beatrice", later.message);
    }

    @Test
    public void thinkInterruptedSendBecomesRetry() throws Exception {
        UsWidgetModels.Think stale = UsWidgetModels.think(snapshot(null), action("sending", "2026-10-06T10:00:00Z"), true, Instant.parse("2026-10-06T10:01:00Z"));
        assertFalse(stale.busy);
        assertEquals("Riprova", stale.cta);
    }

    @Test
    public void thinkToneSaysWhoseMoveItIs() throws Exception {
        // "Due colori": rosa for the other person's thought, lilla for mine, quiet otherwise.
        Instant now = Instant.parse("2026-10-06T12:00:00Z");
        JSONObject s = snapshot(null);
        assertEquals(UsWidgetModels.TONE_QUIET, UsWidgetModels.think(s, null, true, now).tone);
        assertEquals("Beatrice", UsWidgetModels.think(s, null, true, now).partner);
        s.getJSONObject("think").put("lastReceivedAt", "2026-10-06T11:30:00Z");
        assertEquals(UsWidgetModels.TONE_PARTNER, UsWidgetModels.think(s, null, true, now).tone);
        Instant sentNow = Instant.parse("2026-10-06T10:00:05Z");
        assertEquals(UsWidgetModels.TONE_ME, UsWidgetModels.think(snapshot(null), action("sending", "2026-10-06T10:00:00Z"), true, sentNow).tone);
        assertEquals(UsWidgetModels.TONE_ME, UsWidgetModels.think(snapshot(null), action("sent", "2026-10-06T10:00:04Z"), true, sentNow).tone);
        assertEquals(UsWidgetModels.TONE_QUIET, UsWidgetModels.think(snapshot(null), action("sending", "2026-10-06T10:00:00Z"), true, Instant.parse("2026-10-06T10:01:00Z")).tone);
        assertEquals(UsWidgetModels.TONE_QUIET, UsWidgetModels.think(null, null, false, now).tone);
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
        assertEquals("Pensa a Beatrice", answered.message);

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

    // ---------- Noi stile mappa: the Ti penso bubbles ----------

    @Test
    public void noiBubblesSayEachPersonsLastTiPensoWithTheTime() throws Exception {
        JSONObject snap = snapshot(null);
        snap.getJSONObject("think").put("lastReceivedAt", "2026-10-31T10:50:00Z").put("lastSentAt", "2026-10-31T08:00:00Z");
        Instant now = Instant.parse("2026-10-31T11:00:00Z");
        UsWidgetModels.Bubbles bubbles = UsWidgetModels.noiBubbles(UsWidgetContract.normalize(snap), null, now);
        assertEquals("ti ha pensato · 10 min fa", bubbles.partner);
        assertEquals("hai pensato a Beatrice · 3 ore fa", bubbles.me);
        // "10 min fa" moves to "15 min fa" at 11:05; nothing ticks every minute.
        assertEquals(Instant.parse("2026-10-31T11:05:00Z"), bubbles.nextChange);
    }

    @Test
    public void noiBubblesRoundTheFirstHourAndHideAfterAWeek() throws Exception {
        Instant at = Instant.parse("2026-10-31T10:00:00Z");
        assertEquals("proprio ora", UsWidgetModels.bubbleAgo(at, at.plusSeconds(4 * 60)));
        assertEquals("5 min fa", UsWidgetModels.bubbleAgo(at, at.plusSeconds(9 * 60)));
        assertEquals("55 min fa", UsWidgetModels.bubbleAgo(at, at.plusSeconds(59 * 60)));
        assertEquals("1 ora fa", UsWidgetModels.bubbleAgo(at, at.plusSeconds(119 * 60)));
        assertEquals("2 ore fa", UsWidgetModels.bubbleAgo(at, at.plusSeconds(120 * 60)));
        assertEquals("ieri", UsWidgetModels.bubbleAgo(at, at.plusSeconds(30 * 3600)));
        assertEquals("6 giorni fa", UsWidgetModels.bubbleAgo(at, at.plusSeconds(6 * 86400 + 60)));
        assertEquals("a week old: no bubble", "", UsWidgetModels.bubbleAgo(at, at.plusSeconds(7 * 86400)));
        assertEquals("from the future: no bubble", "", UsWidgetModels.bubbleAgo(at, at.minusSeconds(3600)));
        assertEquals("", UsWidgetModels.bubbleAgo(null, at));
    }

    @Test
    public void noiBubblesWithoutThoughtsOrNamesAndWithTheWidgetSend() throws Exception {
        Instant now = Instant.parse("2026-10-31T11:00:00Z");
        UsWidgetModels.Bubbles empty = UsWidgetModels.noiBubbles(snapshot(null), null, now);
        assertEquals("", empty.partner);
        assertEquals("", empty.me);
        assertNull(empty.nextChange);
        JSONObject snap = snapshot(null);
        snap.getJSONObject("think").put("partnerName", "").put("lastSentAt", "2026-10-31T08:00:00Z");
        // A Ti penso sent from the widget a moment ago is newer than the app's last read.
        JSONObject action = new JSONObject().put("status", "sent").put("sentAt", "2026-10-31T10:58:00Z");
        UsWidgetModels.Bubbles mine = UsWidgetModels.noiBubbles(UsWidgetContract.normalize(snap), action, now);
        assertEquals("Ti penso · proprio ora", mine.me);
        assertNull(UsWidgetModels.noiBubbles(null, null, now).nextChange);
    }

    // ---------- Messaggio: the partner's last Ti penso or Lasciato per te ----------

    @Test
    public void messageShowsTheNewestOfTiPensoAndAWaitingLasciatoPerTe() throws Exception {
        Instant now = Instant.parse("2026-10-31T11:00:00Z");
        JSONObject snap = snapshot(null);
        snap.getJSONObject("think").put("lastReceivedAt", "2026-10-31T10:50:00Z");
        UsWidgetModels.Message think = UsWidgetModels.message(UsWidgetContract.normalize(snap), now);
        assertEquals("Ti ha pensato", think.text);
        assertEquals("10 min fa", think.when);
        assertEquals("message/think", think.destination);
        assertEquals(Instant.parse("2026-10-31T11:05:00Z"), think.nextChange);

        snap.put("left", new JSONObject().put("kind", "photo").put("at", "2026-10-31T10:55:00Z").put("body", "SEGRETO"));
        JSONObject clean = UsWidgetContract.normalize(snap);
        assertFalse("never the content", clean.toString().contains("SEGRETO"));
        UsWidgetModels.Message left = UsWidgetModels.message(clean, now);
        assertEquals("Ti ha lasciato una foto", left.text);
        assertEquals("5 min fa", left.when);
        assertEquals("message/left", left.destination);

        // A Ti penso newer than the waiting envelope wins.
        snap.getJSONObject("think").put("lastReceivedAt", "2026-10-31T10:58:00Z");
        assertEquals("Ti ha pensato", UsWidgetModels.message(UsWidgetContract.normalize(snap), now).text);
    }

    @Test
    public void messageKindsOldEnvelopesAndEmptyStates() throws Exception {
        Instant now = Instant.parse("2026-10-31T11:00:00Z");
        String[][] kinds = { { "text", "un messaggio" }, { "audio", "un vocale" }, { "video", "un video" }, { "music", "una canzone" } };
        for (String[] kind : kinds) {
            JSONObject snap = snapshot(null).put("left", new JSONObject().put("kind", kind[0]).put("at", "2026-10-31T09:00:00Z"));
            assertEquals("Ti ha lasciato " + kind[1], UsWidgetModels.message(UsWidgetContract.normalize(snap), now).text);
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
