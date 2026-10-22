package com.usapp.pushsupport;

import java.util.Locale;

/**
 * The phone writes what the notification says (founder decision 16/10/2026).
 *
 * FCM v2 carries one allow-listed kind (native-push-transport.mjs
 * ANDROID_NOTICE_KINDS), never text, names or ids. The other person's name
 * comes only from this device's owner gate, which the app filled for the
 * account that owns the installation, and is read under the same lock that
 * posts the notification. Unknown kind or no name: a calm generic sentence.
 * The page is one of the four public app-link pages (app-links.mjs).
 */
public final class UsPushNotices {
    public static final String FALLBACK_TITLE = "US.";
    public static final String FALLBACK_BODY = "Apri US per vedere le novità.";
    private static final int MAX_NAME = 40;

    public static final class Notice {
        public final String title;
        public final String body;
        /** com.usapp.us://open/<page>: oggi, noi, ricordi or gioca. */
        public final String page;

        Notice(String title, String body, String page) {
            this.title = title;
            this.body = body;
            this.page = page;
        }
    }

    private UsPushNotices() {}

    /** Every kind the server may send. Tests keep it equal to ANDROID_NOTICE_KINDS. */
    public static final String[] KINDS = {
        "test", "think", "think_reply", "daily_turn", "daily_ready", "daily_reaction", "daily_new",
        "quest", "left_for_you", "game_turn", "game_ready", "game_weekly", "game_weekly_turn",
        "calendar", "anniversary", "partner_joined", "checkin_turn", "checkin_ready",
    };

    /** A display name: no control characters, trimmed, at most 40 characters. */
    public static String cleanName(String value) {
        if (value == null) return "";
        String clean = value.replaceAll("[\\u0000-\\u001f\\u007f]", " ").trim();
        return clean.length() > MAX_NAME ? clean.substring(0, MAX_NAME).trim() : clean;
    }

    public static boolean english(Locale locale) {
        return locale != null && "en".equals(locale.getLanguage());
    }

    public static Notice forKind(String kind, String partnerName, Locale locale) {
        final boolean en = english(locale);
        final String name = cleanName(partnerName);
        final String who = name.isEmpty() ? (en ? "Your person" : "La tua persona") : name;
        switch (kind == null ? "" : kind) {
            case "test":
                return notice(en, "US.", "US.", "Notifiche attive ♡", "Notifications are on ♡", "oggi");
            case "think":
                return notice(en, "US. · Ti penso", "US. · Thinking of you",
                    who + " ti sta pensando ♡", who + " is thinking of you ♡", "oggi");
            case "think_reply":
                return notice(en, "US. · Ti penso", "US. · Thinking of you",
                    who + " ha risposto al tuo Ti penso ♡", who + " answered your thought ♡", "oggi");
            case "daily_turn":
                return notice(en, "US. · Domanda di oggi", "US. · Today's question",
                    who + " ha risposto. Ora tocca a te.", who + " answered. Your turn now.", "oggi");
            case "daily_ready":
                return notice(en, "US. · Domanda di oggi", "US. · Today's question",
                    "Le vostre risposte sono pronte ♡", "Your answers are ready ♡", "oggi");
            case "daily_reaction":
                return notice(en, "US. · Domanda di oggi", "US. · Today's question",
                    who + " ha reagito alla tua risposta", who + " reacted to your answer", "oggi");
            case "daily_new":
                return notice(en, "US. · Domanda di oggi", "US. · Today's question",
                    "C'è una nuova domanda per voi.", "There is a new question for you two.", "oggi");
            case "quest":
                return notice(en, "US. · Missioni", "US. · Missions",
                    who + " ha completato una missione. Ora tocca a te", who + " completed a mission. Your turn now", "noi");
            case "left_for_you":
                return notice(en, "US.", "US.",
                    who + " ti ha lasciato qualcosa ♡", who + " left something for you ♡", "oggi");
            case "game_turn":
                return notice(en, "US. · Gioca", "US. · Play",
                    who + " ha giocato: tocca a te", who + " played: your turn", "gioca");
            case "game_ready":
                return notice(en, "US. · Gioca", "US. · Play",
                    "Le vostre risposte sono pronte ♡", "Your answers are ready ♡", "gioca");
            case "game_weekly":
                return notice(en, "US. · Gioca", "US. · Play",
                    who + " ha lasciato la domanda della settimana ♡", who + " left this week's question ♡", "gioca");
            case "game_weekly_turn":
                return notice(en, "US. · Gioca", "US. · Play",
                    "Questa settimana la domanda la scegli tu.", "This week you choose the question.", "gioca");
            case "calendar":
                return notice(en, "US. · Calendario", "US. · Calendar",
                    "Hai un promemoria in calendario", "You have a calendar reminder", "noi");
            case "anniversary":
                return notice(en, "US.", "US.",
                    "Oggi è un giorno speciale per voi ♡", "Today is a special day for you two ♡", "oggi");
            case "partner_joined":
                return notice(en, "US.", "US.",
                    who + " ha accettato l'invito: il vostro spazio è pronto", who + " joined: your space is ready", "oggi");
            case "checkin_turn":
                return notice(en, "US. · Il punto della settimana", "US. · Weekly check-in",
                    who + " ha fatto il punto della settimana. Ora tocca a te.", who + " did the weekly check-in. Your turn now.", "oggi");
            case "checkin_ready":
                return notice(en, "US. · Il punto della settimana", "US. · Weekly check-in",
                    "Il vostro punto della settimana è pronto ♡", "Your weekly check-in is ready ♡", "oggi");
            default:
                return new Notice(FALLBACK_TITLE, FALLBACK_BODY, "oggi");
        }
    }

    private static Notice notice(boolean en, String titleIt, String titleEn, String bodyIt, String bodyEn, String page) {
        return new Notice(en ? titleEn : titleIt, en ? bodyEn : bodyIt, page);
    }
}
