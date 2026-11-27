package com.usapp.pushsupport;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Locale;
import org.junit.Test;

public class UsPushNoticesTest {
    private static final Locale IT = Locale.ITALY;
    private static final Locale EN = Locale.US;

    @Test
    public void thinkSaysWhoInTheirLanguage() {
        UsPushNotices.Notice it = UsPushNotices.forKind("think", "Bea", IT);
        assertEquals("US. · Ti penso", it.title);
        assertEquals("Bea ti sta pensando ♡", it.body);
        assertEquals("oggi", it.page);
        UsPushNotices.Notice en = UsPushNotices.forKind("think", "Bea", EN);
        assertEquals("Bea is thinking of you ♡", en.body);
    }

    @Test
    public void aThinkOfManyTapsSaysSoWithoutANumber() {
        UsPushNotices.Notice it = UsPushNotices.forKind("think_many", "Bea", IT);
        assertEquals("US. · Ti penso", it.title);
        assertEquals("Bea ti ha pensato tante volte ♡", it.body);
        assertEquals("oggi", it.page);
        assertEquals("Bea thought of you so many times ♡", UsPushNotices.forKind("think_many", "Bea", EN).body);
    }

    @Test
    public void aThinkOfManyTapsSaysTheNumberWhenFcmCarriesIt() {
        int five = UsPushNotices.times("think_many", "5");
        assertEquals(5, five);
        UsPushNotices.Notice it = UsPushNotices.forKind("think_many", "Bea", IT, five);
        assertEquals("US. · Ti penso", it.title);
        assertEquals("Bea ti ha pensato 5 volte ♡", it.body);
        assertEquals("oggi", it.page);
        assertEquals("Bea thought of you 99 times ♡", UsPushNotices.forKind("think_many", "Bea", EN, UsPushNotices.times("think_many", "99")).body);
        assertEquals("La tua persona ti ha pensato 2 volte ♡", UsPushNotices.forKind("think_many", "", IT, 2).body);
    }

    @Test
    public void onlyDigitsTwoToNinetyNineOnThePluralKindCount() {
        for (String raw : new String[] { null, "", "1", "0", "100", "05", "-3", "2.5", " 7", "7 ", "x", "٣" }) {
            assertEquals(raw, 0, UsPushNotices.times("think_many", raw));
        }
        // Another kind never reads a number, even a valid one.
        assertEquals(0, UsPushNotices.times("think", "5"));
        assertEquals(0, UsPushNotices.times("lavagna", "5"));
        assertEquals(0, UsPushNotices.times(null, "5"));
        // Without a number the plural sentence stays «tante volte»; a number on another kind changes nothing.
        assertEquals("Bea ti ha pensato tante volte ♡", UsPushNotices.forKind("think_many", "Bea", IT, 0).body);
        assertEquals("Bea ti sta pensando ♡", UsPushNotices.forKind("think", "Bea", IT, 5).body);
    }

    @Test
    public void withoutANameTheSentenceStaysKind() {
        assertEquals("La tua persona ti sta pensando ♡", UsPushNotices.forKind("think", "", IT).body);
        assertEquals("La tua persona ti sta pensando ♡", UsPushNotices.forKind("think", null, IT).body);
        assertEquals("Your person left something for you ♡", UsPushNotices.forKind("left_for_you", "  ", EN).body);
    }

    @Test
    public void theBoardSaysWhoDrewAndOpensNoi() {
        UsPushNotices.Notice it = UsPushNotices.forKind("lavagna", "Bea", IT);
        assertEquals("US. · Lavagna", it.title);
        assertEquals("Bea ha disegnato sulla lavagna", it.body);
        assertEquals("noi", it.page);
        assertEquals("Bea drew on the board", UsPushNotices.forKind("lavagna", "Bea", EN).body);
        assertEquals("La tua persona ha disegnato sulla lavagna", UsPushNotices.forKind("lavagna", null, IT).body);
    }

    @Test
    public void aPostItSaysWhoLeftItAndOpensNoi() {
        UsPushNotices.Notice it = UsPushNotices.forKind("postit", "Bea", IT);
        assertEquals("US. · Lavagna", it.title);
        assertEquals("Bea ti ha lasciato un post-it", it.body);
        assertEquals("noi", it.page);
        assertEquals("Bea left you a sticky note", UsPushNotices.forKind("postit", "Bea", EN).body);
    }

    @Test
    public void aPostItOnTheBoardSaysWhoWroteNeverTheTextAndOpensRicordi() {
        UsPushNotices.Notice it = UsPushNotices.forKind("bacheca_postit", "Bea", IT);
        assertEquals("US. · Bacheca", it.title);
        assertEquals("Bea ha scritto su un ricordo in bacheca", it.body);
        assertEquals("ricordi", it.page);
        assertEquals("Bea wrote on a memory on your board", UsPushNotices.forKind("bacheca_postit", "Bea", EN).body);
        assertEquals("La tua persona ha scritto su un ricordo in bacheca", UsPushNotices.forKind("bacheca_postit", null, IT).body);
    }

    @Test
    public void unknownOrMissingKindIsTheGenericNotice() {
        for (String kind : new String[] { null, "", "drop_table", "THINK" }) {
            UsPushNotices.Notice notice = UsPushNotices.forKind(kind, "Bea", IT);
            assertEquals(UsPushNotices.FALLBACK_TITLE, notice.title);
            assertEquals(UsPushNotices.FALLBACK_BODY, notice.body);
            assertFalse(notice.body.contains("Bea"));
            assertEquals("oggi", notice.page);
        }
    }

    @Test
    public void everyKindHasItsOwnSentenceAndAPublicPage() {
        for (String kind : UsPushNotices.KINDS) {
            UsPushNotices.Notice notice = UsPushNotices.forKind(kind, "Bea", IT);
            assertFalse(kind, UsPushNotices.FALLBACK_BODY.equals(notice.body));
            assertTrue(kind, notice.page.equals("oggi") || notice.page.equals("noi")
                || notice.page.equals("ricordi") || notice.page.equals("gioca"));
        }
        assertEquals("gioca", UsPushNotices.forKind("game_turn", "Bea", IT).page);
        assertEquals("noi", UsPushNotices.forKind("calendar", "Bea", IT).page);
        // A calendar reminder never repeats its private title: a generic line.
        assertEquals("Hai un promemoria in calendario", UsPushNotices.forKind("calendar", "Bea", IT).body);
    }

    @Test
    public void theWeeklyChallengeOpensGioca() {
        assertEquals("gioca", UsPushNotices.forKind("challenge", "Bea", IT).page);
        assertEquals("US. · La sfida della settimana", UsPushNotices.forKind("challenge_reminder", "Bea", IT).title);
        assertEquals("Bea ha messo la sua foto: manca solo la tua", UsPushNotices.forKind("challenge_photo", "Bea", IT).body);
        assertEquals("Bea added their photo: only yours is missing", UsPushNotices.forKind("challenge_photo", "Bea", EN).body);
    }

    @Test
    public void anAnswerToMyComeStaiSaysTheGestureLikeATiPenso() {
        UsPushNotices.Notice hug = UsPushNotices.forKind("status_abbraccio", "Bea", IT);
        assertEquals("US. · Come stai", hug.title);
        assertEquals("Bea: Ti mando un abbraccio", hug.body);
        assertEquals("oggi", hug.page);
        assertEquals("Bea: Sending you a hug", UsPushNotices.forKind("status_abbraccio", "Bea", EN).body);
        assertEquals("US. · How are you", UsPushNotices.forKind("status_abbraccio", "Bea", EN).title);
        assertEquals("Bea: Respira, ci sono io", UsPushNotices.forKind("status_respira", "Bea", IT).body);
        assertEquals("Bea ti manda un cuore ♡", UsPushNotices.forKind("status_cuore", "Bea", IT).body);
        assertEquals("Bea: Spacca tutto!", UsPushNotices.forKind("status_spacca", "Bea", IT).body);
        assertEquals("La tua persona: Buon viaggio", UsPushNotices.forKind("status_buon_viaggio", "", IT).body);
        assertEquals("Bea ha risposto al tuo Come stai ♡", UsPushNotices.forKind("status_reply", "Bea", IT).body);
    }

    @Test
    public void namesAreCleanedAndBounded() {
        assertEquals("Bea trice", UsPushNotices.cleanName("Bea\ntrice"));
        StringBuilder longName = new StringBuilder();
        for (int i = 0; i < 80; i++) longName.append('x');
        assertEquals(40, UsPushNotices.cleanName(longName.toString()).length());
        assertEquals("", UsPushNotices.cleanName("   "));
    }
}
