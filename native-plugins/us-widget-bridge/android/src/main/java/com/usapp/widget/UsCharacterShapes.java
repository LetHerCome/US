package com.usapp.widget;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * I personaggi di US for the widgets (widget del redesign, founder 26/11/2026:
 * «se i personaggi cambiano di forma, in tutte le cose dove sono presenti ci
 * saranno quei personaggi»). The same drawing as personaggi.js (character,
 * lookSvg, reactionBack, reactionFront), as a list of steps in the app's
 * coordinates (viewBox -4 6 108 100): the five shapes, the faces of Come stai,
 * the reactions and the twelve things to wear. Pure Java, so the JVM tests
 * check every combination; UsWidgetCharacter paints the steps on a Canvas.
 * The sparkles of the precious accessories are animated in the app and left
 * out here, where nothing moves.
 */
final class UsCharacterShapes {
    static final int INK = 0xFF14120E;
    private static final int NONE = 0;

    private UsCharacterShapes() {}

    /** One shape: body, eyes x, eyes y, feet x, highlight, top of the head [x, y, half width], sides [left, right, y]. */
    static final class Shape {
        final String body; final double a, b, ey, f0, f1, hx, hy, headX, headY, headW, left, right, earY;
        Shape(String body, double a, double b, double ey, double f0, double f1, double hx, double hy,
              double headX, double headY, double headW, double left, double right, double earY) {
            this.body = body; this.a = a; this.b = b; this.ey = ey; this.f0 = f0; this.f1 = f1; this.hx = hx; this.hy = hy;
            this.headX = headX; this.headY = headY; this.headW = headW; this.left = left; this.right = right; this.earY = earY;
        }
    }

    static Shape shape(String name) {
        switch (name == null ? "" : name) {
            case "quadrato": return new Shape("M36 24 H64 Q86 24 86 46 V72 Q86 94 64 94 H36 Q14 94 14 72 V46 Q14 24 36 24 Z", 40, 60, 56, 36, 64, 32, 40, 50, 25, 19, 14, 86, 54);
            case "triangolo": return new Shape("M50 16 Q57 16 61 24 L89 81 Q94 94 79 94 H21 Q6 94 11 81 L39 24 Q43 16 50 16 Z", 41, 59, 66, 34, 66, 45, 38, 50, 21, 11, 23, 77, 60);
            case "goccia": return new Shape("M50 14 C61 30 86 44 86 64 A36 32 0 0 1 14 64 C14 44 39 30 50 14 Z", 40, 60, 62, 37, 63, 38, 44, 50, 21, 10, 16, 84, 60);
            case "nuvola": return new Shape("M27 52 C17 38 31 24 43 31 C47 18 67 17 71 30 C83 23 97 37 87 51 C97 60 92 93 66 93 H34 C9 93 6 61 27 52 Z", 40, 60, 64, 37, 63, 52, 30, 56, 22, 15, 12, 88, 60);
            default: return new Shape("M12 60 a38 36 0 1 0 76 0 a38 36 0 1 0 -76 0 Z", 40, 60, 58, 37, 63, 32, 40, 50, 26, 19, 12, 88, 56);
        }
    }

    /** The shape for a role when the person chose none (personaggi.js shapeOf). */
    static String shapeOr(String shape, boolean partnerRole) {
        return UsWidgetContract.SHAPE.matcher(shape == null ? "" : shape).matches() ? shape : (partnerRole ? "quadrato" : "palla");
    }

    /** One drawing step. */
    static final class Op {
        String d = "";
        int fill = NONE;
        int stroke = NONE;
        float width = 0f;
        boolean round = false;
        float[] dash = null;
        /** Paint only inside this path (the scarf inside the body). */
        String clip = null;
        float alpha = 1f;
        /** rotate(deg cx cy), as the SVG transform. */
        float rotate = 0f, rx = 0f, ry = 0f;
        String text = null;
        float tx = 0f, ty = 0f, textSize = 0f;
        boolean centered = false;
    }

    // ---------------------------------------------------------------- colours

    /** color-mix(in srgb, colour p%, other). */
    static int mix(int color, double p, int other) {
        int r = (int) Math.round(((color >> 16) & 255) * p + ((other >> 16) & 255) * (1 - p));
        int g = (int) Math.round(((color >> 8) & 255) * p + ((other >> 8) & 255) * (1 - p));
        int b = (int) Math.round((color & 255) * p + (other & 255) * (1 - p));
        return 0xFF000000 | (r << 16) | (g << 8) | b;
    }

    /** The thin outline in the dark of the character's own colour (Stile unico, 24/11/2026). */
    static int edge(int color) { return mix(color, 0.42, 0xFF1A1020); }

    static int rgba(int r, int g, int b, double a) {
        return ((int) Math.round(a * 255) << 24) | (r << 16) | (g << 8) | b;
    }

    // ---------------------------------------------------------------- faces

    /** Come stai → the face (personaggi.js FACE); nothing said: happy. A face name stays itself. */
    static String faceOf(String status) {
        switch (status == null ? "" : status) {
            case "dorme": return "dorme";
            case "teso": return "teso";
            case "festa": case "innamorato": return "innamorato";
            case "giu": case "malato": return "giu";
            case "stanco": return "stanco";
            case "nervoso": return "teso";
            default: return "felice";
        }
    }

    /** Come stai che conta (27/11/2026, D8): what they hold or wear (personaggi.js THING); nothing for the others. */
    static String thingOf(String status) {
        switch (status == null ? "" : status) {
            case "lavoro": return "valigetta";
            case "studio": return "libro";
            case "palestra": return "fascia";
            case "viaggio": return "valigia";
            case "tavola": return "forchetta";
            case "malato": return "termometro";
            default: return "";
        }
    }

    // ---------------------------------------------------------------- the drawing

    /**
     * @param face felice, innamorato, dorme, giu, stanco, teso, or a Come stai key (its face and its thing)
     * @param reaction "", cuore, festa, saluta or sera (sera sleeps)
     * @param head one of personaggi.js LOOK_HEAD or ""
     * @param faceItem one of LOOK_FACE or ""
     * @param zz the colour of the sleeping z's (the ink of the card)
     */
    static List<Op> draw(String shapeName, int color, String face, String reaction, String head, String faceItem, int zz) {
        Shape s = shape(shapeName);
        String reactionNow = reaction == null ? "" : reaction;
        // Not feeling well never falls asleep at night (D8): the face of the state stays.
        if ("sera".equals(reactionNow) && "malato".equals(face)) reactionNow = "";
        String f = "sera".equals(reactionNow) ? "dorme" : !reactionNow.isEmpty() ? "felice" : faceOf(face);
        String thing = f.equals("dorme") ? "" : thingOf(face);
        boolean shut = f.equals("stanco") || f.equals("innamorato") || f.equals("dorme");
        boolean heartEyes = reactionNow.equals("cuore");
        boolean big = heartEyes || reactionNow.equals("festa");
        double a = s.a, b = s.b, y = s.ey;
        int edge = edge(color);
        List<Op> out = new ArrayList<>();

        reactionBack(out, reactionNow, s, color);
        add(out, ell(s.f0, 97, 9, 5) + " " + ell(s.f1, 97, 9, 5), color, edge, 2.4f, false);
        Op body = add(out, s.body, color, edge, 2.6f, false);
        body.round = true;
        add(out, ell(s.hx, s.hy, 8, 5), rgba(255, 255, 255, .5), NONE, 0, false);
        Op cheeks = add(out, ell(a - 8, y + 9, 5, 3) + " " + ell(b + 8, y + 9, 5, 3), edge, NONE, 0, false);
        cheeks.alpha = .3f;
        if (!shut && !heartEyes) {
            add(out, ell(a, y, 4.4, 5.8) + " " + ell(b, y, 4.4, 5.8), INK, NONE, 0, false);
            add(out, ell(a + 1.5, y - 2.3, 1.5, 1.5) + " " + ell(b + 1.5, y - 2.3, 1.5, 1.5), 0xFFFFFFFF, NONE, 0, false);
        }
        if (shut) {
            StringBuilder lids = new StringBuilder();
            for (double x : new double[] { a, b }) {
                if (f.equals("dorme")) lids.append("M").append(n(x - 5)).append(' ').append(n(y)).append(" Q").append(n(x)).append(' ').append(n(y + 4.5)).append(' ').append(n(x + 5)).append(' ').append(n(y)).append(' ');
                else if (f.equals("innamorato")) lids.append("M").append(n(x - 4.5)).append(' ').append(n(y + 1)).append(" Q").append(n(x)).append(' ').append(n(y - 5)).append(' ').append(n(x + 4.5)).append(' ').append(n(y + 1)).append(' ');
                else lids.append("M").append(n(x - 4.5)).append(' ').append(n(y)).append(" Q").append(n(x)).append(' ').append(n(y + 3.5)).append(' ').append(n(x + 4.5)).append(' ').append(n(y)).append(' ');
            }
            add(out, lids.toString().trim(), NONE, INK, 2.8f, true);
        }
        if (f.equals("teso")) {
            add(out, "M" + n(a - 6) + " " + n(y - 10) + " L" + n(a + 4) + " " + n(y - 7) + " M" + n(b + 6) + " " + n(y - 10) + " L" + n(b - 4) + " " + n(y - 7), NONE, INK, 2.6f, true);
        }
        String mouth = big ? "M44.5 " + n(y + 9) + " Q50 " + n(y + 17) + " 55.5 " + n(y + 9) + " Z"
            : f.equals("dorme") ? ell(50, y + 12, 2.4, 1.9)
            : f.equals("giu") ? "M46 " + n(y + 14) + " Q50 " + n(y + 9.5) + " 54 " + n(y + 14)
            : f.equals("teso") || f.equals("stanco") ? "M46.5 " + n(y + 11.5) + " H53.5"
            : f.equals("innamorato") ? "M44.5 " + n(y + 9) + " Q50 " + n(y + 16.5) + " 55.5 " + n(y + 9)
            : "M46 " + n(y + 10) + " Q50 " + n(y + 14.5) + " 54 " + n(y + 10);
        int mouthFill = big ? 0xFF7A2E3A : f.equals("dorme") ? INK : NONE;
        int mouthStroke = f.equals("dorme") && !big ? NONE : INK;
        add(out, mouth, mouthFill, mouthStroke, 2.6f, true);
        if (heartEyes) {
            lp(out, heart(a, y) + " " + heart(b, y), 0xFFFF4F6F, 1.8f);
        }
        if (f.equals("dorme")) {
            out.add(text("z", 84, 36, 19, zz, false));
            out.add(text("z", 97, 22, 13, zz, false));
        }
        if (!thing.isEmpty()) thing(out, thing, s);
        if (faceItem != null && !faceItem.isEmpty()) look(out, faceItem, shapeName, s);
        if (head != null && !head.isEmpty()) look(out, head, shapeName, s);
        return out;
    }

    /** personaggi.js thingSvg: the same steps, held at the left or worn. */
    static void thing(List<Op> out, String thing, Shape s) {
        double y = s.ey, r = s.right;
        switch (thing) {
            case "valigetta":
                add(out, "M5 75 V72 Q5 69 8 69 H12 Q15 69 15 72 V75", NONE, INK, 2.4f, true);
                lp(out, "M1 77 Q1 75 3 75 H17 Q19 75 19 77 V91 Q19 93 17 93 H3 Q1 93 1 91 Z", 0xFF9B6A43, 2.4f);
                add(out, "M1 82 H19", NONE, INK, 1.6f, true);
                lp(out, "M8.5 80.5 H11.5 V83.5 H8.5 Z", 0xFFF3D27A, 1.2f);
                return;
            case "valigia":
                add(out, "M6 70 V60 H14 V70", NONE, INK, 2.4f, true);
                lp(out, "M0 72 Q0 70 2 70 H18 Q20 70 20 72 V92 Q20 94 18 94 H2 Q0 94 0 92 Z", 0xFFF3A64B, 2.4f);
                add(out, "M6 73 V91 M14 73 V91", NONE, 0xFFD9822B, 2f, true);
                lp(out, ell(4, 96, 2.2, 2.2) + " " + ell(16, 96, 2.2, 2.2), 0xFF3A3446, 1.4f);
                return;
            case "libro": {
                Op cover = lp(out, "M1 74 H17 Q19 74 19 76 V92 Q19 94 17 94 H1 Z", 0xFFA98BFF, 2.4f);
                Op pages = add(out, "M4 91 H17", NONE, 0xFFFFFDF9, 2.4f, true);
                Op lines = add(out, "M6 79 H14 M6 83 H12", NONE, 0xFFFFFDF9, 1.8f, true);
                for (Op op : new Op[] { cover, pages, lines }) { op.rotate = -12; op.rx = 10; op.ry = 84; }
                return;
            }
            case "forchetta":
                lp(out, "M7 70 H11 V92 Q11 94 9 94 Q7 94 7 92 Z", 0xFFD7DCE3, 2f);
                add(out, "M4 57 V65 M9 57 V65 M14 57 V65", NONE, INK, 2.6f, true);
                add(out, "M4 64 Q4 70 9 70 Q14 70 14 64", NONE, INK, 2.6f, true);
                return;
            case "fascia": {
                double y0 = y - 18;
                Op band = add(out, "M0 " + n(y0) + " Q50 " + n(y0 - 4) + " 110 " + n(y0) + " V" + n(y0 + 7) + " Q50 " + n(y0 + 3) + " 0 " + n(y0 + 7) + " Z", 0xFFFF5A7A, INK, 2.2f, false);
                band.clip = s.body;
                Op stripe = add(out, "M0 " + n(y0 + 3.5) + " Q50 " + n(y0 - 0.5) + " 110 " + n(y0 + 3.5), NONE, 0xFFFFFFFF, 1.6f, false);
                stripe.clip = s.body;
                lp(out, "M" + n(r - 7) + " " + n(y0 + 3) + " l9 -6 l2 7 Z", 0xFFFF5A7A, 1.8f);
                lp(out, "M" + n(r - 7) + " " + n(y0 + 4) + " l10 3 l-4 6 Z", 0xFFFF5A7A, 1.8f);
                return;
            }
            case "termometro":
                add(out, "M53 " + n(y + 12) + " L68 " + n(y + 5), NONE, INK, 5.4f, true);
                add(out, "M53 " + n(y + 12) + " L68 " + n(y + 5), NONE, 0xFFFFFFFF, 3f, true);
                add(out, "M53 " + n(y + 12) + " L59 " + n(y + 9.2), NONE, 0xFFE8484A, 3f, true);
                lp(out, ell(53, y + 12, 2.6, 2.6), 0xFFE8484A, 1.4f);
                return;
            default:
        }
    }

    private static String heart(double x, double y) {
        return "M" + n(x) + " " + n(y + 5) + " C" + n(x - 9) + " " + n(y - 1) + " " + n(x - 6) + " " + n(y - 9) + " " + n(x) + " " + n(y - 4)
            + " C" + n(x + 6) + " " + n(y - 9) + " " + n(x + 9) + " " + n(y - 1) + " " + n(x) + " " + n(y + 5) + " Z";
    }

    private static void reactionBack(List<Op> out, String reaction, Shape s, int color) {
        if (reaction.equals("festa")) {
            Object[][] bits = { { 6, 30, 0xFFFF5A7A, 20 }, { 94, 26, 0xFF6F9BFF, -25 }, { 2, 70, 0xFFF3D27A, 40 },
                { 98, 66, 0xFF8FD49B, -10 }, { 20, 12, 0xFFA98BFF, 15 }, { 82, 10, 0xFFFF9F6E, -30 } };
            for (Object[] bit : bits) {
                double cx = (Integer) bit[0], cy = (Integer) bit[1];
                Op op = add(out, "M" + n(cx - 3) + " " + n(cy - 1.6) + " H" + n(cx + 3) + " V" + n(cy + 1.6) + " H" + n(cx - 3) + " Z", (Integer) bit[2], NONE, 0, false);
                op.rotate = (Integer) bit[3]; op.rx = (float) cx; op.ry = (float) cy;
            }
        } else if (reaction.equals("saluta")) {
            double er = s.right, ey = s.earY;
            String arm = "M" + n(er - 3) + " " + n(ey + 14) + " Q" + n(er + 8) + " " + n(ey + 6) + " " + n(er + 11) + " " + n(ey - 6);
            add(out, arm, NONE, INK, 8.5f, true);
            add(out, arm, NONE, color, 4.2f, true);
            add(out, ell(er + 12, ey - 9, 6, 6), color, INK, 2.8f, false);
        }
    }

    private static void look(List<Op> out, String item, String shapeName, Shape s) {
        double x = s.headX, y = s.headY, w0 = s.headW, l = s.left, r = s.right, ey = s.earY, a = s.a, b = s.b, fy = s.ey, neck = s.ey + 21;
        switch (item) {
            case "cappello":
                lp(out, "M" + n(x - w0 - 3) + " " + n(y + 3) + " Q" + n(x - w0 - 3) + " " + n(y - 19) + " " + n(x) + " " + n(y - 21) + " Q" + n(x + w0 + 3) + " " + n(y - 19) + " " + n(x + w0 + 3) + " " + n(y + 3) + " Z", 0xFFF7B58E, 2.6f);
                lp(out, "M" + n(x - w0 - 5) + " " + n(y - 1) + " H" + n(x + w0 + 5) + " Q" + n(x + w0 + 8) + " " + n(y + 3) + " " + n(x + w0 + 5) + " " + n(y + 7) + " H" + n(x - w0 - 5) + " Q" + n(x - w0 - 8) + " " + n(y + 3) + " " + n(x - w0 - 5) + " " + n(y - 1) + " Z", 0xFFE8875C, 2.6f);
                lp(out, ell(x, y - 24, 5.5, 5.5), 0xFFFFF4E6, 2.6f);
                return;
            case "fiocco": {
                double fx = x + w0 * 0.85, f = y + 3;
                lp(out, "M" + n(fx) + " " + n(f) + " L" + n(fx - 13) + " " + n(f - 10) + " Q" + n(fx - 17) + " " + n(f) + " " + n(fx - 13) + " " + n(f + 10) + " Z", 0xFFFF5A7A, 2.6f);
                lp(out, "M" + n(fx) + " " + n(f) + " L" + n(fx + 13) + " " + n(f - 10) + " Q" + n(fx + 17) + " " + n(f) + " " + n(fx + 13) + " " + n(f + 10) + " Z", 0xFFFF5A7A, 2.6f);
                lp(out, ell(fx, f, 4.2, 4.2), 0xFFFF8DA2, 2.6f);
                return;
            }
            case "cuffie": {
                double top = y - 9;
                String band = "M" + n(l + 1) + " " + n(ey - 6) + " C" + n(l - 2) + " " + n(top - 4) + " " + n(r + 2) + " " + n(top - 4) + " " + n(r - 1) + " " + n(ey - 6);
                add(out, band, NONE, INK, 7.5f, true);
                add(out, band, NONE, 0xFF3A3446, 3.6f, true);
                lp(out, "M" + n(l - 7) + " " + n(ey - 10) + " h12 v22 h-12 q-4 -11 0 -22 Z", 0xFF6FD6C8, 2.6f);
                lp(out, "M" + n(r + 7) + " " + n(ey - 10) + " h-12 v22 h12 q4 -11 0 -22 Z", 0xFF6FD6C8, 2.6f);
                note(out, r + 10, ey - 12);
                note(out, r + 14, ey - 4);
                return;
            }
            case "corona": {
                double k = Math.max(w0, 14) + 2;
                lp(out, "M" + n(x - k) + " " + n(y + 4) + " L" + n(x - k - 2) + " " + n(y - 16) + " L" + n(x - k / 2) + " " + n(y - 6) + " L" + n(x) + " " + n(y - 22) + " L" + n(x + k / 2) + " " + n(y - 6) + " L" + n(x + k + 2) + " " + n(y - 16) + " L" + n(x + k) + " " + n(y + 4) + " Z", 0xFFF3D27A, 2.6f);
                add(out, "M" + n(x - k + 2) + " " + n(y) + " H" + n(x + k - 2), NONE, 0xFFD9A93F, 2.4f, false);
                lp(out, ell(x, y - 4, 3.2, 3.2), 0xFFFF5A7A, 1.6f);
                lp(out, ell(x - k / 2 - 1, y - 1, 2.5, 2.5), 0xFF6F9BFF, 1.4f);
                lp(out, ell(x + k / 2 + 1, y - 1, 2.5, 2.5), 0xFF6F9BFF, 1.4f);
                lp(out, ell(x - k - 2, y - 16, 2, 2), 0xFFFFF4C8, 1.2f);
                lp(out, ell(x, y - 22, 2.2, 2.2), 0xFFFFF4C8, 1.2f);
                lp(out, ell(x + k + 2, y - 16, 2, 2), 0xFFFFF4C8, 1.2f);
                return;
            }
            case "coroncina": {
                double k = w0 + 6;
                double[] ts = { -1, -0.5, 0, 0.5, 1 };
                int[] cols = { 0xFFFF9FB5, 0xFFFFE07A, 0xFFFFFFFF, 0xFFFFE07A, 0xFFFF9FB5 };
                double[][] pts = new double[5][];
                for (int i = 0; i < 5; i++) pts[i] = new double[] { x + ts[i] * k, y + 2 - (1 - ts[i] * ts[i]) * 8 };
                add(out, "M" + n(pts[0][0]) + " " + n(pts[0][1]) + " Q" + n(x) + " " + n(y - 11) + " " + n(pts[4][0]) + " " + n(pts[4][1]), NONE, 0xFF5E9E6E, 3.2f, true);
                double[][] leaves = { { -0.75, 1 }, { 0.25, -1 }, { 0.8, 1 } };
                for (double[] leaf : leaves) {
                    double t = leaf[0], sg = leaf[1];
                    add(out, "M" + n(x + t * k) + " " + n(y - 3 - (1 - t * t) * 6) + " q" + n(4 * sg) + " -6 " + n(9 * sg) + " -3 q" + n(-4 * sg) + " 5 " + n(-9 * sg) + " 3 Z", 0xFF7DBE86, INK, 1.2f, false);
                }
                for (int i = 0; i < 5; i++) {
                    double rr = i == 2 ? 7.5 : 6.5, px = pts[i][0], py = pts[i][1];
                    for (int p = 0; p < 5; p++) {
                        double an = Math.toRadians(p * 72 - 90);
                        add(out, ell(px + Math.cos(an) * rr * 0.62, py + Math.sin(an) * rr * 0.62, rr * 0.5, rr * 0.5), cols[i], INK, 1.4f, false);
                    }
                    add(out, ell(px, py, rr * 0.34, rr * 0.34), 0xFFF2B33D, INK, 1.2f, false);
                }
                return;
            }
            case "festa": {
                double k = Math.max(w0 * 0.75, 9);
                Op hat = lp(out, "M" + n(x - k) + " " + n(y + 3) + " L" + n(x) + " " + n(y - 25) + " L" + n(x + k) + " " + n(y + 3) + " Z", 0xFFA98BFF, 2.6f);
                Op stripes = add(out, "M" + n(x - k * 0.62) + " " + n(y - 6) + " L" + n(x + k * 0.35) + " " + n(y - 2) + " M" + n(x - k * 0.3) + " " + n(y - 15) + " L" + n(x + k * 0.15) + " " + n(y - 13), NONE, 0xFFFFE07A, 2.6f, true);
                Op pom = lp(out, ell(x, y - 26, 4, 4), 0xFFFF5A7A, 2.6f);
                for (Op op : new Op[] { hat, stripes, pom }) { op.rotate = -12; op.rx = (float) x; op.ry = (float) y; }
                return;
            }
            case "cento": {
                double k = Math.max(w0, 13) + 3;
                String arc = "M" + n(x - k) + " " + n(y + 3) + " Q" + n(x) + " " + n(y - 7) + " " + n(x + k) + " " + n(y + 3);
                add(out, arc, NONE, INK, 6.5f, true);
                add(out, arc, NONE, 0xFFF3D27A, 3f, true);
                lp(out, ell(x, y - 7, 10, 8), 0xFFFFFDF9, 2.2f);
                out.add(text("100", (float) x, (float) (y - 4.3), 8.5f, INK, true));
                return;
            }
            case "occhiali":
                lp(out, ell(a, fy, 10, 9) + " " + ell(b, fy, 10, 9), rgba(190, 225, 255, .3), 2.8f);
                add(out, "M" + n(a + 10) + " " + n(fy - 1) + " Q50 " + n(fy - 5) + " " + n(b - 10) + " " + n(fy - 1), NONE, INK, 2.8f, true);
                add(out, "M" + n(a - 5) + " " + n(fy - 3) + " l4 -3 M" + n(b - 5) + " " + n(fy - 3) + " l4 -3", NONE, rgba(255, 255, 255, .85), 1.8f, true);
                return;
            case "sole":
                lp(out, "M" + n(a - 10) + " " + n(fy - 6) + " H" + n(a + 9) + " Q" + n(a + 9) + " " + n(fy + 8) + " " + n(a - 1) + " " + n(fy + 8) + " Q" + n(a - 10) + " " + n(fy + 8) + " " + n(a - 10) + " " + n(fy - 6) + " Z"
                    + " M" + n(b - 9) + " " + n(fy - 6) + " H" + n(b + 10) + " Q" + n(b + 10) + " " + n(fy + 8) + " " + n(b + 1) + " " + n(fy + 8) + " Q" + n(b - 9) + " " + n(fy + 8) + " " + n(b - 9) + " " + n(fy - 6) + " Z"
                    + " M" + n(a + 9) + " " + n(fy - 3) + " H" + n(b - 9), 0xFF231E2C, 2.6f);
                add(out, "M" + n(a - 6) + " " + n(fy - 2) + " l4 -2.5 M" + n(b - 5) + " " + n(fy - 2) + " l4 -2.5", NONE, rgba(255, 255, 255, .7), 1.6f, true);
                return;
            case "sciarpina": {
                Op band = add(out, "M0 " + n(neck - 7) + " Q50 " + n(neck + 3) + " 110 " + n(neck - 7) + " V" + n(neck + 5) + " Q50 " + n(neck + 15) + " 0 " + n(neck + 5) + " Z", 0xFFE8604C, INK, 2.4f, false);
                band.clip = s.body;
                Op stitch = add(out, "M6 " + n(neck) + " Q50 " + n(neck + 9) + " 104 " + n(neck), NONE, 0xFFFFE07A, 2.2f, false);
                stitch.dash = new float[] { 5, 5 };
                stitch.clip = s.body;
                lp(out, "M60 " + n(neck + 4) + " q6 2 8 9 l-3 14 q-4 2 -7 0 l1 -13 Z", 0xFFE8604C, 2.2f);
                lp(out, "M57 " + n(neck + 5) + " q-2 7 -8 18 q3 3 7 1 l5 -16 Z", 0xFFD9503D, 2.2f);
                lp(out, ell(59, neck + 4, 5, 4), 0xFFF07A62, 2.2f);
                return;
            }
            case "gala": {
                double g = neck + 2;
                lp(out, "M38 " + n(g - 6) + " L50 " + n(g + 4) + " L44 " + n(g + 10) + " Z", 0xFFFFFDF9, 2f);
                lp(out, "M62 " + n(g - 6) + " L50 " + n(g + 4) + " L56 " + n(g + 10) + " Z", 0xFFFFFDF9, 2f);
                lp(out, "M50 " + n(g + 2) + " L33 " + n(g - 8) + " Q30 " + n(g + 2) + " 33 " + n(g + 12) + " Z M50 " + n(g + 2) + " L67 " + n(g - 8) + " Q70 " + n(g + 2) + " 67 " + n(g + 12) + " Z", 0xFF2B2433, 2.4f);
                lp(out, ell(50, g + 2, 4.6, 4.2), 0xFF4A3F57, 2.2f);
                add(out, "M36 " + n(g - 3) + " l5 3", NONE, rgba(255, 255, 255, .55), 1.6f, true);
                return;
            }
            case "macchinetta": {
                double m = neck - 2;
                Op strap = add(out, "M42 " + n(m - 4) + " L" + n(l + 10) + " " + n(fy + 12) + " M58 " + n(m - 4) + " L" + n(r - 10) + " " + n(fy + 12), NONE, INK, 2.2f, true);
                strap.alpha = .85f;
                lp(out, "M39 " + n(m - 6) + " H61 Q63 " + n(m - 6) + " 63 " + n(m - 4) + " V" + n(m + 8) + " Q63 " + n(m + 10) + " 61 " + n(m + 10) + " H39 Q37 " + n(m + 10) + " 37 " + n(m + 8) + " V" + n(m - 4) + " Q37 " + n(m - 6) + " 39 " + n(m - 6) + " Z", 0xFFFFFDF9, 2.2f);
                lp(out, ell(50, m + 2, 4.6, 4.6), 0xFF3A3446, 1.8f);
                lp(out, ell(58, m - 2.5, 1.6, 1.6), 0xFFFF5A7A, 1f);
                return;
            }
            default:
        }
    }

    private static void note(List<Op> out, double nx, double ny) {
        add(out, "M" + n(nx) + " " + n(ny) + " v-11 l7 -2 v10", NONE, INK, 1.8f, true);
        add(out, ell(nx - 2, ny, 2.6, 2.1) + " " + ell(nx + 5, ny - 2, 2.6, 2.1), INK, NONE, 0, false);
    }

    // ---------------------------------------------------------------- helpers

    /** An ellipse as personaggi.js writes it (two arcs). */
    static String ell(double x, double y, double rx, double ry) {
        return "M" + n(x - rx) + " " + n(y) + " a" + n(rx) + " " + n(ry) + " 0 1 0 " + n(2 * rx) + " 0 a" + n(rx) + " " + n(ry) + " 0 1 0 " + n(-2 * rx) + " 0 Z";
    }

    static String n(double v) {
        if (Math.abs(v - Math.rint(v)) < 1e-9) return Long.toString(Math.round(v));
        return String.format(Locale.ROOT, "%.3f", v).replaceAll("0+$", "");
    }

    private static Op add(List<Op> out, String d, int fill, int stroke, float width, boolean round) {
        Op op = new Op();
        op.d = d; op.fill = fill; op.stroke = stroke; op.width = width; op.round = round;
        out.add(op);
        return op;
    }

    /** personaggi.js lp: filled, inked outline, round joins and caps. */
    private static Op lp(List<Op> out, String d, int fill, float width) {
        return add(out, d, fill, INK, width, true);
    }

    private static Op text(String value, float x, float y, float size, int color, boolean centered) {
        Op op = new Op();
        op.text = value; op.tx = x; op.ty = y; op.textSize = size; op.fill = color; op.centered = centered;
        return op;
    }

    // ---------------------------------------------------------------- path data

    /** A parsed segment, in absolute coordinates. ARC: the oval (l, t, r, b), start and sweep in degrees. */
    static final class Segment {
        static final int MOVE = 0, LINE = 1, QUAD = 2, CUBIC = 3, ARC = 4, CLOSE = 5;
        final int type;
        final float[] v;
        Segment(int type, float... v) { this.type = type; this.v = v; }
    }

    /** SVG path data (M L H V Q C A Z, absolute and relative) → segments; arcs without rotation, as the app draws them. */
    static List<Segment> parse(String d) {
        List<Segment> out = new ArrayList<>();
        List<String> tokens = tokens(d);
        int i = 0;
        char cmd = 'M';
        double x = 0, y = 0, sx = 0, sy = 0;
        while (i < tokens.size()) {
            String t = tokens.get(i);
            if (Character.isLetter(t.charAt(0))) { cmd = t.charAt(0); i++; if (cmd == 'Z' || cmd == 'z') { out.add(new Segment(Segment.CLOSE)); x = sx; y = sy; } continue; }
            boolean rel = Character.isLowerCase(cmd);
            double ox = rel ? x : 0, oy = rel ? y : 0;
            switch (Character.toUpperCase(cmd)) {
                case 'M': x = ox + num(tokens, i++); y = oy + num(tokens, i++); sx = x; sy = y; out.add(new Segment(Segment.MOVE, (float) x, (float) y)); cmd = rel ? 'l' : 'L'; break;
                case 'L': x = ox + num(tokens, i++); y = oy + num(tokens, i++); out.add(new Segment(Segment.LINE, (float) x, (float) y)); break;
                case 'H': x = (rel ? x : 0) + num(tokens, i++); out.add(new Segment(Segment.LINE, (float) x, (float) y)); break;
                case 'V': y = (rel ? y : 0) + num(tokens, i++); out.add(new Segment(Segment.LINE, (float) x, (float) y)); break;
                case 'Q': {
                    double x1 = ox + num(tokens, i++), y1 = oy + num(tokens, i++);
                    x = ox + num(tokens, i++); y = oy + num(tokens, i++);
                    out.add(new Segment(Segment.QUAD, (float) x1, (float) y1, (float) x, (float) y));
                    break;
                }
                case 'C': {
                    double x1 = ox + num(tokens, i++), y1 = oy + num(tokens, i++), x2 = ox + num(tokens, i++), y2 = oy + num(tokens, i++);
                    x = ox + num(tokens, i++); y = oy + num(tokens, i++);
                    out.add(new Segment(Segment.CUBIC, (float) x1, (float) y1, (float) x2, (float) y2, (float) x, (float) y));
                    break;
                }
                case 'A': {
                    double rx = Math.abs(num(tokens, i++)), ry = Math.abs(num(tokens, i++));
                    i++; // rotation: always 0 in US
                    boolean large = num(tokens, i++) != 0, sweep = num(tokens, i++) != 0;
                    double x2 = ox + num(tokens, i++), y2 = oy + num(tokens, i++);
                    arc(out, x, y, x2, y2, rx, ry, large, sweep);
                    x = x2; y = y2;
                    break;
                }
                default: throw new IllegalArgumentException("path command " + cmd);
            }
        }
        return out;
    }

    /** The endpoint arc (SVG F.6.5) as an oval, a start angle and a sweep. */
    private static void arc(List<Segment> out, double x1, double y1, double x2, double y2, double rx, double ry, boolean large, boolean sweep) {
        if (rx == 0 || ry == 0) { out.add(new Segment(Segment.LINE, (float) x2, (float) y2)); return; }
        double dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
        double lambda = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
        if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }
        double num = rx * rx * ry * ry - rx * rx * dy * dy - ry * ry * dx * dx;
        double den = rx * rx * dy * dy + ry * ry * dx * dx;
        double coef = (large == sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
        double cxp = coef * (rx * dy / ry), cyp = coef * (-ry * dx / rx);
        double cx = cxp + (x1 + x2) / 2, cy = cyp + (y1 + y2) / 2;
        double start = Math.toDegrees(Math.atan2((dy - cyp) / ry, (dx - cxp) / rx));
        double end = Math.toDegrees(Math.atan2((-dy - cyp) / ry, (-dx - cxp) / rx));
        double delta = end - start;
        if (sweep && delta < 0) delta += 360;
        if (!sweep && delta > 0) delta -= 360;
        out.add(new Segment(Segment.ARC, (float) (cx - rx), (float) (cy - ry), (float) (cx + rx), (float) (cy + ry), (float) start, (float) delta));
    }

    private static double num(List<String> tokens, int i) {
        return Double.parseDouble(tokens.get(i));
    }

    private static List<String> tokens(String d) {
        List<String> out = new ArrayList<>();
        int i = 0, len = d.length();
        while (i < len) {
            char c = d.charAt(i);
            if (Character.isWhitespace(c) || c == ',') { i++; continue; }
            if (Character.isLetter(c) && c != 'e' && c != 'E') { out.add(String.valueOf(c)); i++; continue; }
            int start = i;
            if (c == '-' || c == '+') i++;
            boolean dot = false;
            while (i < len) {
                char k = d.charAt(i);
                if (Character.isDigit(k)) i++;
                else if (k == '.' && !dot) { dot = true; i++; }
                else if ((k == 'e' || k == 'E') && i + 1 < len) { i++; if (d.charAt(i) == '-' || d.charAt(i) == '+') i++; }
                else break;
            }
            if (i == start) throw new IllegalArgumentException("path data at " + i + ": " + d);
            out.add(d.substring(start, i));
        }
        return out;
    }
}
