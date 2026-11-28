package com.usapp.widget;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.DashPathEffect;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.widget.RemoteViews;
import java.util.List;
import org.json.JSONObject;

/**
 * Paints the characters (UsCharacterShapes) and the two-colour pieces of the
 * widgets as pictures: a widget cannot run the app's SVG. Each picture comes
 * in a night and a paper form; from Android 12 the launcher switches them with
 * the phone's theme by itself (setIcon with two icons), before it the form of
 * the theme at render time.
 */
final class UsWidgetCharacter {
    /** The app's viewBox with room for hats, hands and confetti: x -10..114, y -14..106. */
    static final float BOX_X = -10f, BOX_Y = -14f, BOX_W = 124f, BOX_H = 120f;

    private static Typeface figtree;

    private UsWidgetCharacter() {}

    /** One person as the widgets draw them. */
    static final class Person {
        String shape;
        int night;
        int day;
        String head = "";
        String face = "";
    }

    static final int ROSA = 0xFFFF7C96, LILLA = 0xFFA98BFF, ROSA_DAY = 0xFFE7A1AB, LILLA_DAY = 0xFFAB9DDB;

    /** me or partner from the snapshot; without a choice, the role's shape and rosa/lilla. */
    static Person person(JSONObject snapshot, boolean me) {
        JSONObject in = UsWidgetContract.optObject(UsWidgetContract.optObject(UsWidgetContract.optObject(snapshot, "couple"), "characters"), me ? "me" : "partner");
        Person p = new Person();
        p.shape = UsCharacterShapes.shapeOr(in.optString("shape", ""), !me);
        p.night = color(in.optString("color", ""), me ? ROSA : LILLA);
        p.day = color(in.optString("day", ""), me ? ROSA_DAY : LILLA_DAY);
        p.head = in.optString("head", "");
        p.face = in.optString("face", "");
        return p;
    }

    /**
     * The mood of the moment, as the app's (personaggi.js reactionOf, FACE and
     * THING): asleep from 22 to 6 on the phone's clock, otherwise their Come
     * stai while its twelve hours last (its face and what they hold, D8 of
     * 27/11/2026), otherwise happy. Not feeling well never falls asleep.
     * UsCharacterShapes.draw turns a Come stai key into its face and thing.
     * Asks the next refresh for the moment it changes.
     */
    static String face(UsWidgets.State state, boolean me) {
        java.time.ZonedDateTime local = state.now.atZone(java.time.ZoneId.systemDefault());
        int hour = local.getHour();
        java.time.ZonedDateTime next = hour >= 22 ? local.plusDays(1).withHour(6).withMinute(0).withSecond(0).withNano(0)
            : hour < 6 ? local.withHour(6).withMinute(0).withSecond(0).withNano(0)
            : local.withHour(22).withMinute(0).withSecond(0).withNano(0);
        state.needsUpdateAt(next.toInstant());
        JSONObject status = UsWidgetContract.optObject(UsWidgetContract.optObject(state.snapshot, "status"), me ? "me" : "partner");
        UsWidgetModels.StatusPerson person = UsWidgetModels.statusPerson(status, state.now);
        if (person.shown) state.needsUpdateAt(person.nextChange);
        String key = person.shown ? status.optString("status", "") : "";
        if (hour >= 22 || hour < 6) return "malato".equals(key) ? key : "dorme";
        return key.isEmpty() ? "felice" : key;
    }

    private static int color(String hex, int fallback) {
        if (hex == null || !hex.matches("^#[0-9a-fA-F]{6}$")) return fallback;
        return 0xFF000000 | Integer.parseInt(hex.substring(1), 16);
    }

    /**
     * The character in its two forms on an ImageView.
     * @param widthDp the width of the app's 108 units (the picture is a little wider, for what sticks out)
     */
    static void put(RemoteViews views, Context context, int id, Person p, String face, String reaction, float widthDp) {
        float density = UsWidgets.density(context);
        Bitmap night = paint(context, p, p.night, face, reaction, widthDp * density, 0xFFF7EFE9);
        Bitmap day = paint(context, p, p.day, face, reaction, widthDp * density, 0xFF231B1D);
        themed(views, context, id, day, night);
    }

    /** A picture per theme on an ImageView (Android 12+: the launcher switches them). */
    static void themed(RemoteViews views, Context context, int id, Bitmap day, Bitmap night) {
        if (day == null || night == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            views.setIcon(id, "setImageIcon", Icon.createWithBitmap(day), Icon.createWithBitmap(night));
        } else {
            views.setImageViewBitmap(id, UsWidgets.night(context) ? night : day);
        }
    }

    static Bitmap paint(Context context, Person p, int color, String face, String reaction, float unitsWidthPx, int zz) {
        try {
            List<UsCharacterShapes.Op> ops = UsCharacterShapes.draw(p.shape, color, face, reaction, p.head, p.face, zz);
            float scale = Math.max(0.2f, unitsWidthPx / 108f);
            int w = Math.max(1, Math.round(BOX_W * scale)), h = Math.max(1, Math.round(BOX_H * scale));
            Bitmap out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(out);
            canvas.scale(scale, scale);
            canvas.translate(-BOX_X, -BOX_Y);
            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
            for (UsCharacterShapes.Op op : ops) draw(context, canvas, paint, op);
            return out;
        } catch (Throwable ignored) {
            return null;
        }
    }

    private static void draw(Context context, Canvas canvas, Paint paint, UsCharacterShapes.Op op) {
        int save = canvas.save();
        if (op.rotate != 0f) canvas.rotate(op.rotate, op.rx, op.ry);
        if (op.clip != null) canvas.clipPath(path(op.clip));
        paint.reset();
        paint.setAntiAlias(true);
        if (op.text != null) {
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(op.fill);
            paint.setTextSize(op.textSize);
            paint.setTypeface(Typeface.create(figtree(context), Typeface.BOLD));
            paint.setTextAlign(op.centered ? Paint.Align.CENTER : Paint.Align.LEFT);
            canvas.drawText(op.text, op.tx, op.ty, paint);
            canvas.restoreToCount(save);
            return;
        }
        Path path = path(op.d);
        if (op.fill != 0) {
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(op.fill);
            if (op.alpha < 1f) paint.setAlpha(Math.round(((op.fill >>> 24) & 255) * op.alpha));
            canvas.drawPath(path, paint);
        }
        if (op.stroke != 0 && op.width > 0f) {
            paint.setStyle(Paint.Style.STROKE);
            paint.setColor(op.stroke);
            if (op.alpha < 1f) paint.setAlpha(Math.round(((op.stroke >>> 24) & 255) * op.alpha));
            paint.setStrokeWidth(op.width);
            paint.setStrokeJoin(op.round ? Paint.Join.ROUND : Paint.Join.MITER);
            paint.setStrokeCap(op.round ? Paint.Cap.ROUND : Paint.Cap.BUTT);
            paint.setPathEffect(op.dash == null ? null : new DashPathEffect(op.dash, 0f));
            canvas.drawPath(path, paint);
        }
        canvas.restoreToCount(save);
    }

    static Path path(String d) {
        Path path = new Path();
        for (UsCharacterShapes.Segment s : UsCharacterShapes.parse(d)) {
            float[] v = s.v;
            switch (s.type) {
                case UsCharacterShapes.Segment.MOVE: path.moveTo(v[0], v[1]); break;
                case UsCharacterShapes.Segment.LINE: path.lineTo(v[0], v[1]); break;
                case UsCharacterShapes.Segment.QUAD: path.quadTo(v[0], v[1], v[2], v[3]); break;
                case UsCharacterShapes.Segment.CUBIC: path.cubicTo(v[0], v[1], v[2], v[3], v[4], v[5]); break;
                case UsCharacterShapes.Segment.ARC: path.arcTo(new RectF(v[0], v[1], v[2], v[3]), v[4], v[5], false); break;
                default: path.close();
            }
        }
        return path;
    }

    private static synchronized Typeface figtree(Context context) {
        if (figtree != null) return figtree;
        try { figtree = context.getResources().getFont(R.font.us_figtree); }
        catch (RuntimeException ignored) { figtree = Typeface.DEFAULT_BOLD; }
        return figtree;
    }

    // ---------------------------------------------------------------- the two colours

    /** The Phosphor heart (256 units), the only place with the two colours blended (founder, 24/11/2026). */
    private static final String HEART = "M128 224 C128 224 24 168 24 102 A54 54 0 0 1 128 81.4 A54 54 0 0 1 232 102 C232 168 128 224 128 224 Z";

    /** The heart, from your colour to theirs (night) or in ceralacca (paper, where every action is ceralacca). */
    static void heart(RemoteViews views, Context context, int id, Person me, Person partner, float sizeDp, boolean blend) {
        float px = sizeDp * UsWidgets.density(context);
        Bitmap night = heart(px, me.night, blend ? partner.night : me.night);
        Bitmap day = heart(px, blend ? me.day : 0xFFB8452F, blend ? partner.day : 0xFFB8452F);
        themed(views, context, id, day, night);
    }

    static Bitmap heart(float px, int from, int to) {
        try {
            int side = Math.max(1, Math.round(px));
            Bitmap out = Bitmap.createBitmap(side, side, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(out);
            float scale = side / 256f;
            canvas.scale(scale, scale);
            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
            paint.setShader(new LinearGradient(24, 48, 232, 224, from, to, Shader.TileMode.CLAMP));
            canvas.drawPath(path(HEART), paint);
            return out;
        } catch (Throwable ignored) {
            return null;
        }
    }

    /** The main button's pill: the two of you blended at night, ceralacca on paper (colori.css, giorno.css). */
    static void pill(RemoteViews views, Context context, int id, Person me, Person partner, float widthDp, float heightDp) {
        float density = UsWidgets.density(context);
        Bitmap night = pill(widthDp * density, heightDp * density, me.night, partner.night);
        Bitmap day = pill(widthDp * density, heightDp * density, 0xFFB8452F, 0xFFB8452F);
        themed(views, context, id, day, night);
    }

    static Bitmap pill(float w, float h, int from, int to) {
        try {
            int width = Math.max(1, Math.round(w)), height = Math.max(1, Math.round(h));
            Bitmap out = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
            paint.setShader(new LinearGradient(0, 0, width, 0, from, to, Shader.TileMode.CLAMP));
            new Canvas(out).drawRoundRect(new RectF(0, 0, width, height), height / 2f, height / 2f, paint);
            return out;
        } catch (Throwable ignored) {
            return null;
        }
    }
}
