package com.usapp.widget;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * The look of the Nota windows over the Home screen (writing, choosing):
 * the widgets' night card, latte text, the tab colours. Plain Android views,
 * no AppCompat, no WebView.
 */
final class UsNoteSheet {
    static final int SURFACE = 0xFF17111C;
    static final int TEXT = 0xFFF7EFE9;
    static final int TEXT_2 = 0xB8F7EFE9;
    static final int MUTED = 0x80F7EFE9;
    static final int ORCHIDEA = 0xFFD98BE0;
    static final int LILLA = 0xFFA98BFF;
    static final int CORALLO = 0xFFFF8B7B;

    private UsNoteSheet() {}

    static int dp(Activity activity, float value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, activity.getResources().getDisplayMetrics()));
    }

    /** A rounded night card, 92% of the screen width, over a dimmed Home screen. */
    static LinearLayout card(Activity activity) {
        Window window = activity.getWindow();
        window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        LinearLayout root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(activity, 20);
        root.setPadding(pad, dp(activity, 18), pad, dp(activity, 14));
        GradientDrawable background = new GradientDrawable();
        background.setColor(SURFACE);
        background.setCornerRadius(dp(activity, 26));
        background.setStroke(dp(activity, 1), 0x2BF7EFE9);
        root.setBackground(background);
        return root;
    }

    static void fit(Activity activity) {
        int width = Math.round(activity.getResources().getDisplayMetrics().widthPixels * 0.92f);
        activity.getWindow().setLayout(width, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    static TextView kicker(Activity activity, String text) {
        TextView view = text(activity, text, 11, ORCHIDEA);
        view.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
        view.setLetterSpacing(0.14f);
        view.setAllCaps(true);
        return view;
    }

    static TextView text(Activity activity, String text, float sp, int color) {
        TextView view = new TextView(activity);
        view.setText(text);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        view.setTextColor(color);
        return view;
    }

    static Button button(Activity activity, String label, boolean primary) {
        Button button = new Button(activity, null, android.R.attr.borderlessButtonStyle);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        button.setTextColor(primary ? 0xFF0F0B13 : TEXT_2);
        button.setMinHeight(dp(activity, 48));
        if (primary) {
            GradientDrawable pill = new GradientDrawable();
            pill.setColor(0xFFFF7C96);
            pill.setCornerRadius(dp(activity, 24));
            button.setBackground(pill);
            button.setPadding(dp(activity, 22), 0, dp(activity, 22), 0);
        }
        button.setGravity(Gravity.CENTER);
        return button;
    }

    /** Only a widget of this app's Nota provider. */
    static boolean isNoteWidget(Activity activity, int widgetId) {
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return false;
        android.appwidget.AppWidgetProviderInfo info = AppWidgetManager.getInstance(activity).getAppWidgetInfo(widgetId);
        return info != null && new ComponentName(activity, UsNoteWidgetProvider.class).equals(info.provider);
    }
}
