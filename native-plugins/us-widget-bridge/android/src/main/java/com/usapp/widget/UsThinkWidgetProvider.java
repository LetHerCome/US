package com.usapp.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.graphics.Typeface;
import android.os.Bundle;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.text.style.StyleSpan;
import android.view.View;
import android.widget.RemoteViews;

/** Ti penso. Class name is stable: widgets already on a Home screen keep working. */
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

    static RemoteViews render(Context context, UsWidgets.State state) {
        UsWidgetModels.Think model = UsWidgetModels.think(state.snapshot, state.action, state.hasCredential, state.now);
        state.needsUpdateAt(model.nextChange);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.us_widget_think);
        int tone = toneColor(model.tone);
        boolean quiet = UsWidgetModels.TONE_QUIET.equals(model.tone);
        views.setTextColor(R.id.us_widget_kicker, quiet ? 0x80F7EFE9 : tone);
        views.setTextViewText(R.id.us_widget_message, styledMessage(model, tone));
        views.setTextViewText(R.id.us_widget_cta, model.cta);
        views.setTextColor(R.id.us_widget_cta, quiet ? 0xB8F7EFE9 : tone);
        views.setInt(R.id.us_widget_cta, "setBackgroundResource", pillFor(model.tone));
        // Quiet: a line heart in latte; a move to make: the filled heart in its person's colour.
        int heartIcon = quiet ? R.drawable.us_widget_heart_outline : R.drawable.us_widget_heart;
        views.setImageViewResource(R.id.us_widget_heart, heartIcon);
        views.setImageViewResource(R.id.us_widget_heart_pulse, R.drawable.us_widget_heart);
        // Always set: a launcher may reapply actions on the live view, so a stale tint must not survive.
        views.setInt(R.id.us_widget_heart, "setColorFilter", quiet ? 0xCCF7EFE9 : tone);
        views.setInt(R.id.us_widget_heart_pulse, "setColorFilter", toneColor(UsWidgetModels.TONE_ME));
        // 1.0: no sent counter on the widget. A Ti penso is a gesture, not a score.
        views.setViewVisibility(R.id.us_widget_count_24h, View.GONE);
        views.setViewVisibility(R.id.us_widget_heart, model.pulse ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.us_widget_heart_pulse, model.pulse ? View.VISIBLE : View.GONE);
        views.setInt(R.id.us_widget_heart, "setImageAlpha", model.busy && !model.pulse ? 140 : 255);
        views.setContentDescription(R.id.us_widget_heart, model.canSend ? context.getString(R.string.us_widget_send) : context.getString(R.string.us_widget_open));
        views.setOnClickPendingIntent(R.id.us_widget_root, UsWidgets.open(context, "think", 4101));
        // The heart sends only when sending makes sense; otherwise it opens US.
        PendingIntent heart = model.canSend ? sendIntent(context) : UsWidgets.open(context, "think", 4101);
        views.setOnClickPendingIntent(R.id.us_widget_heart, heart);
        views.setOnClickPendingIntent(R.id.us_widget_heart_pulse, heart);
        views.setOnClickPendingIntent(R.id.us_widget_cta, heart);
        return views;
    }

    /** "Due colori": rosa for the other person, lilla for you, latte when nothing is pending. */
    static int toneColor(String tone) {
        if (UsWidgetModels.TONE_PARTNER.equals(tone)) return 0xFFFF7C96;
        if (UsWidgetModels.TONE_ME.equals(tone)) return 0xFFA98BFF;
        return 0xFFF7EFE9;
    }

    static int pillFor(String tone) {
        if (UsWidgetModels.TONE_PARTNER.equals(tone)) return R.drawable.us_widget_pill_rosa;
        if (UsWidgetModels.TONE_ME.equals(tone)) return R.drawable.us_widget_pill_lilla;
        return R.drawable.us_widget_pill_dim;
    }

    /** The other person's name in italic and in the tone colour, as in the app's arrival title. */
    static CharSequence styledMessage(UsWidgetModels.Think model, int tone) {
        String message = model.message == null ? "" : model.message;
        int at = model.partner.isEmpty() ? -1 : message.indexOf(model.partner);
        if (at < 0) return message;
        SpannableString styled = new SpannableString(message);
        int end = at + model.partner.length();
        styled.setSpan(new StyleSpan(Typeface.ITALIC), at, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        if (!UsWidgetModels.TONE_QUIET.equals(model.tone)) {
            styled.setSpan(new ForegroundColorSpan(tone), at, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        }
        return styled;
    }

    private static PendingIntent sendIntent(Context context) {
        Intent intent = new Intent(context, UsThinkWidgetActionReceiver.class);
        intent.setAction(UsThinkWidgetActionReceiver.ACTION_SEND_THINK);
        return PendingIntent.getBroadcast(context, 4102, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
