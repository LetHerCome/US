package com.usapp.widget;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ArgbEvaluator;
import android.animation.Keyframe;
import android.animation.ObjectAnimator;
import android.animation.PropertyValuesHolder;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Rect;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.provider.Settings;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.PathInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;

/**
 * Ti penso from the widget (Pastello, founder 02/11/2026): the tap sends at
 * once (UsThinkWidgetActionReceiver paints "Ricambiato · adesso") and this
 * transparent moment over the Home screen plays the app's heart
 * (UsUiFoundation.heart): squeezed to .72, past its size to 1.3, settled, in
 * 440 ms, with a rosa wave that opens out and turns lilla. A widget cannot
 * animate itself. With animations off it only sends. Not exported: only the
 * widget's own PendingIntent opens it.
 */
public final class UsThinkHeartActivity extends Activity {
    private static final int ROSA = 0xFFFF7C96;
    private static final int LILLA = 0xFFA98BFF;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // The send first: it never waits for the animation.
        sendBroadcast(new Intent(this, UsThinkWidgetActionReceiver.class).setAction(UsThinkWidgetActionReceiver.ACTION_SEND_THINK));
        Rect bounds = getIntent().getSourceBounds();
        float motion = Settings.Global.getFloat(getContentResolver(), Settings.Global.ANIMATOR_DURATION_SCALE, 1f);
        if (bounds == null || bounds.isEmpty() || motion == 0f) {
            close();
            return;
        }
        getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        // Screen coordinates, like the widget's bounds.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS);
        FrameLayout root = new FrameLayout(this);
        int button = Math.min(bounds.width(), bounds.height());
        int left = bounds.centerX() - button / 2;
        int top = bounds.centerY() - button / 2;

        // The button as the widget now paints it: full rosa, the heart in white.
        ImageView circle = new ImageView(this);
        circle.setImageResource(R.drawable.us_widget_pastel_circle);
        circle.setColorFilter(ROSA);
        root.addView(circle, at(button, left, top));

        int glyph = Math.round(button * 0.5f);
        int size = Math.round(Math.max(20, glyph) * 1.6f);
        GradientDrawable ring = new GradientDrawable();
        ring.setShape(GradientDrawable.OVAL);
        ring.setColor(Color.TRANSPARENT);
        View wave = new View(this);
        wave.setBackground(ring);
        root.addView(wave, at(size, bounds.centerX() - size / 2, bounds.centerY() - size / 2));

        ImageView heart = new ImageView(this);
        heart.setImageResource(R.drawable.us_widget_pastel_heart);
        heart.setColorFilter(Color.WHITE);
        root.addView(heart, at(glyph, bounds.centerX() - glyph / 2, bounds.centerY() - glyph / 2));
        setContentView(root);
        root.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);

        // The heart: squeezed at the touch, snaps past its size, settles (440 ms).
        Keyframe k0 = Keyframe.ofFloat(0f, 1f);
        Keyframe k1 = Keyframe.ofFloat(0.14f, 0.72f);
        k1.setInterpolator(new PathInterpolator(0.4f, 0f, 1f, 1f));
        Keyframe k2 = Keyframe.ofFloat(0.48f, 1.3f);
        k2.setInterpolator(new PathInterpolator(0.2f, 1.4f, 0.4f, 1f));
        Keyframe k3 = Keyframe.ofFloat(0.74f, 0.96f);
        k3.setInterpolator(new AccelerateDecelerateInterpolator());
        Keyframe k4 = Keyframe.ofFloat(1f, 1f);
        k4.setInterpolator(new DecelerateInterpolator());
        ObjectAnimator pop = ObjectAnimator.ofPropertyValuesHolder(heart,
            PropertyValuesHolder.ofKeyframe(View.SCALE_X, k0, k1, k2, k3, k4),
            PropertyValuesHolder.ofKeyframe(View.SCALE_Y, k0.clone(), k1.clone(), k2.clone(), k3.clone(), k4.clone()));
        pop.setDuration(440);

        // The wave: a thick rosa ring that opens out, turns lilla and thins away (420 ms).
        float thick = size / 7f;
        ArgbEvaluator colors = new ArgbEvaluator();
        ValueAnimator opening = ValueAnimator.ofFloat(0f, 1f);
        opening.setStartDelay(30);
        opening.setDuration(420);
        opening.setInterpolator(new PathInterpolator(0.16f, 1f, 0.3f, 1f));
        opening.addUpdateListener((animation) -> {
            float t = (float) animation.getAnimatedValue();
            ring.setStroke(Math.max(0, Math.round(thick * (1 - t))), (int) colors.evaluate(t, ROSA, LILLA));
            float scale = 0.8f + (1.55f - 0.8f) * t;
            wave.setScaleX(scale);
            wave.setScaleY(scale);
            wave.setAlpha(0.85f * (1 - t));
        });
        opening.addListener(new AnimatorListenerAdapter() {
            @Override public void onAnimationEnd(Animator animation) { close(); }
        });
        pop.start();
        opening.start();
    }

    private static FrameLayout.LayoutParams at(int size, int left, int top) {
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(size, size);
        params.leftMargin = left;
        params.topMargin = top;
        return params;
    }

    private void close() {
        finish();
        overridePendingTransition(0, 0);
    }
}
