package com.usapp.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.text.Layout;
import android.view.View;
import android.widget.RemoteViews;

/**
 * Ti penso (founder, 04/11/2026; widget del redesign 26/11/2026, tavola
 * Hkj3ojVe3bwEHfg9XeJf6A): the heart from your colour to theirs, the only
 * place where the two blend; the tap opens UsThinkHeartActivity, which sends
 * at once with the pop over the Home screen, and the widget says «Inviato» for
 * a few seconds. Their thought, still unanswered: their character in love,
 * «Bea ti pensa». The 4x2 is you two with the heart between you. Without the
 * send credential the heart is quieter and opens US. The class name is
 * stable: placed widgets keep working.
 * Ti penso ×N (founder, 27/11/2026): taps in a row show «×3» and leave as one
 * Ti penso of 3 (UsThinkWidgetActionReceiver); their Ti penso of 5 taps is
 * «Bea ti ha pensato 5 volte».
 */
public class UsThinkWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        UsWidgets.refreshAll(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int appWidgetId, Bundle newOptions) {
        UsWidgets.refresh(context, UsWidgets.THINK, appWidgetId);
    }

    @Override
    public void onDisabled(Context context) {
        UsWidgets.refreshAll(context);
    }

    static RemoteViews render(Context context, UsWidgets.State state, Bundle options) {
        UsWidgetModels.Think model = UsWidgetModels.think(state.snapshot, state.action, state.hasCredential, state.now);
        state.needsUpdateAt(model.nextChange);
        RemoteViews small = fill(context, state, new RemoteViews(context.getPackageName(), R.layout.us_widget_think), model, false);
        RemoteViews medium = fill(context, state, new RemoteViews(context.getPackageName(), R.layout.us_widget_think_medium), model, true);
        return UsWidgets.sized(options, small, medium);
    }

    private static RemoteViews fill(Context context, UsWidgets.State state, RemoteViews views, UsWidgetModels.Think model, boolean wide) {
        UsWidgetCharacter.Person me = UsWidgetCharacter.person(state.snapshot, true);
        UsWidgetCharacter.Person partner = UsWidgetCharacter.person(state.snapshot, false);
        String name = model.partner.isEmpty() ? "la tua persona" : model.partner;
        boolean got = !model.done && model.cta.equals("Ricambia");
        // Ti penso ×N (27/11/2026): their Ti penso of several taps, «Bea ti ha pensato 5 volte».
        boolean many = got && model.receivedTaps > 1;
        String gotTitle = many ? model.line : model.partner.isEmpty() ? "Ti pensa" : model.partner + " ti pensa";
        UsWidgetCharacter.heart(views, context, R.id.us_widget_heart, me, partner, wide ? 32 : 68, true);
        views.setInt(R.id.us_widget_heart, "setImageAlpha", !model.canSend || (model.busy && !model.done) ? 140 : 255);
        if (wide) {
            UsWidgetCharacter.put(views, context, R.id.us_think_me, me, UsWidgetCharacter.face(state, true), "", 76);
            UsWidgetCharacter.put(views, context, R.id.us_think_partner, partner, got ? "innamorato" : UsWidgetCharacter.face(state, false), "", 70);
            String title = model.done ? model.line : got ? gotTitle
                : model.canSend ? "Un pensiero,\nun tocco" : model.line;
            String label = model.done ? model.when : got ? (model.when.isEmpty() ? "Tocca per ricambiare" : model.when + " · tocca per ricambiare")
                : model.canSend ? "Tocca e " + name + " lo sente subito" : model.hint;
            UsWidgetArt.serif(views, context, R.id.us_think_title, title, many ? 19f : 21f, 170, 2, false, Layout.Alignment.ALIGN_NORMAL);
            views.setTextViewText(R.id.us_think_label, label);
        } else {
            views.setViewVisibility(R.id.us_think_send, got ? View.GONE : View.VISIBLE);
            views.setViewVisibility(R.id.us_think_got, got ? View.VISIBLE : View.GONE);
            if (got) {
                UsWidgetArt.serif(views, context, R.id.us_think_title, gotTitle, many ? 17f : 19f, 140, 2, false, Layout.Alignment.ALIGN_NORMAL);
                views.setTextViewText(R.id.us_think_when, model.when);
                UsWidgetCharacter.put(views, context, R.id.us_think_partner, partner, "innamorato", "", 84);
                UsWidgetCharacter.heart(views, context, R.id.us_think_badge, me, partner, 24, true);
            } else {
                String label = model.done ? model.line + (model.when.isEmpty() ? "" : " · " + model.when)
                    : model.canSend && model.cta.equals("Ti penso") ? (model.partner.isEmpty() ? "Manda un pensiero" : "Pensa a " + model.partner) : model.line;
                views.setTextViewText(R.id.us_think_label, label);
            }
        }
        String said = model.canSend ? context.getString(R.string.us_widget_send) : context.getString(R.string.us_widget_open);
        views.setContentDescription(R.id.us_widget_root, model.line.isEmpty() ? said : model.line + (model.when.isEmpty() ? "" : ", " + model.when) + ". " + said);
        // The whole widget is the heart. Busy: the tap reaches the receiver, which ignores it, without a second pop.
        PendingIntent heart = !model.canSend ? UsWidgets.open(context, "think", 4101) : model.busy ? sendIntent(context) : heartIntent(context);
        views.setOnClickPendingIntent(R.id.us_widget_root, heart);
        return views;
    }

    /** The heart: the app's animation over the Home screen, the send at once. */
    private static PendingIntent heartIntent(Context context) {
        Intent intent = new Intent(context, UsThinkHeartActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_ANIMATION | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS);
        return PendingIntent.getActivity(context, 4103, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent sendIntent(Context context) {
        Intent intent = new Intent(context, UsThinkWidgetActionReceiver.class);
        intent.setAction(UsThinkWidgetActionReceiver.ACTION_SEND_THINK);
        return PendingIntent.getBroadcast(context, 4102, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
