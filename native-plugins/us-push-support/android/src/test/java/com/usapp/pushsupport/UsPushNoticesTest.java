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
    public void withoutANameTheSentenceStaysKind() {
        assertEquals("La tua persona ti sta pensando ♡", UsPushNotices.forKind("think", "", IT).body);
        assertEquals("La tua persona ti sta pensando ♡", UsPushNotices.forKind("think", null, IT).body);
        assertEquals("Your person left something for you ♡", UsPushNotices.forKind("left_for_you", "  ", EN).body);
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
    public void namesAreCleanedAndBounded() {
        assertEquals("Bea trice", UsPushNotices.cleanName("Bea\ntrice"));
        StringBuilder longName = new StringBuilder();
        for (int i = 0; i < 80; i++) longName.append('x');
        assertEquals(40, UsPushNotices.cleanName(longName.toString()).length());
        assertEquals("", UsPushNotices.cleanName("   "));
    }
}
