package com.usapp.widget;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

/**
 * Foto protagonista (founder, 02/11/2026): the pieces every widget shares.
 * A soft illustration under the card (Pastello and Midnight, by resource),
 * a light grain over it, the round portrait or the initial on a soft field,
 * and the titles and numbers in Fraunces. The launcher draws widget text in
 * its own font, so Fraunces is drawn here as a white picture and tinted with
 * the theme; the small text stays real text in the system font.
 */
final class UsWidgetArt {
    static final int INK = 0xFF1A1020;
    static final int INK_NIGHT = 0xFFF7EFE9;
    static final int ROSA = 0xFFFF7C96;
    private static final int MAX_ART_EDGE_PX = 720;

    private static Typeface serif;

    private UsWidgetArt() {}

    /** From Android 12 the card clips the illustration and the photo itself (clipToOutline). */
    static boolean clips() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S;
    }

    /**
     * The illustration of this widget: from Android 12 the resource itself, so
     * the launcher switches Pastello and Midnight with the phone; before, a
     * picture with the card's rounded corners, in the theme of this render.
     * The grain goes only where the card clips it.
     */
    static void art(RemoteViews views, Context context, int artId, int grainId, int drawable, Bundle options, boolean wide) {
        views.setViewVisibility(grainId, clips() ? View.VISIBLE : View.GONE);
        if (clips()) {
            views.setImageViewResource(artId, drawable);
            return;
        }
        Bitmap source = null;
        try { source = BitmapFactory.decodeResource(context.getResources(), drawable); }
        catch (RuntimeException ignored) {}
        int[] size = sizeDp(options, wide);
        Bitmap framed = source == null ? null : frame(source, size[0], size[1], UsWidgets.density(context), true);
        if (framed != null) views.setImageViewBitmap(artId, framed);
        else views.setImageViewResource(artId, drawable);
    }

    /** The widget's size in dp from the launcher's options, or the board's when it says nothing. */
    static int[] sizeDp(Bundle options, boolean wide) {
        int width = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        int height = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        if (width <= 0) width = wide ? 368 : 176;
        if (height <= 0) height = 176;
        return new int[] { width, height };
    }

    /** Covers the shape with the picture (centre crop); with round, the US card corners (24dp). */
    static Bitmap frame(Bitmap source, int widthDp, int heightDp, float density, boolean round) {
        try {
            float scale = Math.min(1f, MAX_ART_EDGE_PX / (Math.max(widthDp, heightDp) * density));
            int outW = Math.max(1, Math.round(widthDp * density * scale));
            int outH = Math.max(1, Math.round(heightDp * density * scale));
            Bitmap out = Bitmap.createBitmap(outW, outH, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(out);
            float cover = Math.max(outW / (float) source.getWidth(), outH / (float) source.getHeight());
            Matrix matrix = new Matrix();
            matrix.setScale(cover, cover);
            matrix.postTranslate((outW - source.getWidth() * cover) / 2f, (outH - source.getHeight() * cover) / 2f);
            BitmapShader shader = new BitmapShader(source, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP);
            shader.setLocalMatrix(matrix);
            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
            paint.setShader(shader);
            float radius = round ? 24 * density * scale : 0f;
            canvas.drawRoundRect(new RectF(0, 0, outW, outH), radius, radius, paint);
            return out;
        } catch (Throwable ignored) {
            return null;
        }
    }

    /**
     * A round portrait: the photo US prepared, or the person's initial in
     * Fraunces on a soft field (never a flat disc of colour).
     */
    static void avatar(RemoteViews views, Context context, byte[] raw, int imageId, int letterId, String name, int sizeDp) {
        Bitmap photo = round(decode(raw));
        if (photo != null) {
            views.setImageViewBitmap(imageId, photo);
            views.setViewVisibility(letterId, View.GONE);
            return;
        }
        views.setImageViewResource(imageId, R.drawable.us_widget_art_field);
        serif(views, context, letterId, initial(name), sizeDp * 0.46f, sizeDp, 1, true, Layout.Alignment.ALIGN_CENTER);
    }

    /** Always round, even when a portrait arrives square: the centre, cut in a circle. */
    static Bitmap round(Bitmap source) {
        if (source == null) return null;
        try {
            int side = Math.min(source.getWidth(), source.getHeight());
            Bitmap out = Bitmap.createBitmap(side, side, Bitmap.Config.ARGB_8888);
            BitmapShader shader = new BitmapShader(source, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP);
            Matrix matrix = new Matrix();
            matrix.setTranslate((side - source.getWidth()) / 2f, (side - source.getHeight()) / 2f);
            shader.setLocalMatrix(matrix);
            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
            paint.setShader(shader);
            new Canvas(out).drawCircle(side / 2f, side / 2f, side / 2f, paint);
            return out;
        } catch (Throwable ignored) {
            return source;
        }
    }

    static String initial(String name) {
        String clean = name == null ? "" : name.trim();
        if (clean.isEmpty()) return "♥";
        return new String(Character.toChars(Character.toUpperCase(clean.codePointAt(0))));
    }

    static Bitmap decode(byte[] raw) {
        if (raw == null) return null;
        try { return BitmapFactory.decodeByteArray(raw, 0, raw.length); }
        catch (RuntimeException ignored) { return null; }
    }

    /** Fraunces in the ink of the theme. */
    static void serif(RemoteViews views, Context context, int id, CharSequence text, float sp, int widthDp, int maxLines, boolean italic, Layout.Alignment align) {
        serif(views, context, id, text, sp, widthDp, maxLines, italic, align, INK, INK_NIGHT);
    }

    /** Fraunces in any colour, light and dark (opaque: a filter keeps white under a translucent one). */
    static void serif(RemoteViews views, Context context, int id, CharSequence text, float sp, int widthDp, int maxLines, boolean italic, Layout.Alignment align, int light, int dark) {
        Bitmap bitmap = TextUtils.isEmpty(text) ? null : text(context, text, sp, widthDp, maxLines, italic, align);
        if (bitmap == null) {
            views.setViewVisibility(id, View.GONE);
            return;
        }
        views.setImageViewBitmap(id, bitmap);
        UsWidgets.themedColor(views, context, id, "setColorFilter", light, dark);
        views.setViewVisibility(id, View.VISIBLE);
    }

    /** The text as a white picture, as wide as its longest line (at most widthDp). */
    static Bitmap text(Context context, CharSequence text, float sp, int widthDp, int maxLines, boolean italic, Layout.Alignment align) {
        try {
            TextPaint paint = new TextPaint(Paint.ANTI_ALIAS_FLAG | Paint.SUBPIXEL_TEXT_FLAG);
            paint.setColor(0xFFFFFFFF);
            paint.setTextSize(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, sp, context.getResources().getDisplayMetrics()));
            Typeface base = typeface(context);
            paint.setTypeface(italic ? Typeface.create(base, Typeface.ITALIC) : base);
            int width = Math.max(1, Math.round(widthDp * UsWidgets.density(context)));
            StaticLayout layout = layout(text, paint, width, maxLines, align);
            float longest = 0f;
            for (int i = 0; i < layout.getLineCount(); i++) longest = Math.max(longest, layout.getLineWidth(i));
            int tight = Math.min(width, (int) Math.ceil(longest) + 2);
            if (tight < width) layout = layout(text, paint, tight, maxLines, align);
            // A little room for the italic's overhang.
            int pad = italic ? Math.round(paint.getTextSize() * 0.12f) : 0;
            Bitmap bitmap = Bitmap.createBitmap(layout.getWidth() + pad, Math.max(1, layout.getHeight()), Bitmap.Config.ARGB_8888);
            layout.draw(new Canvas(bitmap));
            return bitmap;
        } catch (Throwable ignored) {
            return null;
        }
    }

    private static StaticLayout layout(CharSequence text, TextPaint paint, int width, int maxLines, Layout.Alignment align) {
        return StaticLayout.Builder.obtain(text, 0, text.length(), paint, width)
            .setAlignment(align)
            .setMaxLines(maxLines)
            .setEllipsize(TextUtils.TruncateAt.END)
            .setIncludePad(false)
            .setLineSpacing(0f, 1.02f)
            .build();
    }

    private static synchronized Typeface typeface(Context context) {
        if (serif != null) return serif;
        try { serif = context.getResources().getFont(R.font.us_fraunces); }
        catch (RuntimeException ignored) { serif = Typeface.SERIF; }
        return serif;
    }
}
