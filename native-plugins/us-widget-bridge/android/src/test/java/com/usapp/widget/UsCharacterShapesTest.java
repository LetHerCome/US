package com.usapp.widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/** Widget del redesign (26/11/2026): the characters the widgets draw are the app's (personaggi.js). */
public class UsCharacterShapesTest {
    private static final String[] SHAPES = { "palla", "quadrato", "triangolo", "goccia", "nuvola" };
    private static final String[] HEADS = { "", "cappello", "fiocco", "cuffie", "corona", "coroncina", "festa", "cento" };
    private static final String[] FACES = { "", "occhiali", "sole", "sciarpina", "gala", "macchinetta" };
    private static final String[] MOODS = { "felice", "innamorato", "dorme", "giu", "stanco", "teso" };
    private static final String[] REACTIONS = { "", "cuore", "festa", "saluta", "sera" };

    @Test
    public void everyCombinationDrawsAndParses() {
        for (String shape : SHAPES) for (String head : HEADS) for (String face : FACES) for (String mood : MOODS) for (String reaction : REACTIONS) {
            List<UsCharacterShapes.Op> ops = UsCharacterShapes.draw(shape, 0xFFFF7C96, mood, reaction, head, face, 0xFFF7EFE9);
            assertTrue(ops.size() >= 6);
            for (UsCharacterShapes.Op op : ops) {
                if (op.text != null) continue;
                List<UsCharacterShapes.Segment> segments = UsCharacterShapes.parse(op.d);
                assertFalse(shape + head + face + mood + reaction + ": " + op.d, segments.isEmpty());
                for (UsCharacterShapes.Segment s : segments) for (float v : s.v) assertTrue(op.d, Float.isFinite(v));
                if (op.clip != null) assertFalse(UsCharacterShapes.parse(op.clip).isEmpty());
            }
        }
    }

    @Test
    public void theEllipseIsTwoHalfArcs() {
        List<UsCharacterShapes.Segment> s = UsCharacterShapes.parse(UsCharacterShapes.ell(50, 60, 10, 5));
        assertEquals(UsCharacterShapes.Segment.MOVE, s.get(0).type);
        assertEquals(UsCharacterShapes.Segment.ARC, s.get(1).type);
        // The oval around (50, 60), radii 10 and 5, half a turn each.
        assertEquals(40f, s.get(1).v[0], 0.01f);
        assertEquals(55f, s.get(1).v[1], 0.01f);
        assertEquals(60f, s.get(1).v[2], 0.01f);
        assertEquals(65f, s.get(1).v[3], 0.01f);
        assertEquals(180f, Math.abs(s.get(1).v[5]), 0.01f);
        assertEquals(UsCharacterShapes.Segment.CLOSE, s.get(s.size() - 1).type);
    }

    @Test
    public void relativeCommandsFollowTheCurrentPoint() {
        List<UsCharacterShapes.Segment> s = UsCharacterShapes.parse("M10 20 h12 v22 h-12 q-4 -11 0 -22 Z");
        assertEquals(22f, s.get(1).v[0], 0f);
        assertEquals(42f, s.get(2).v[1], 0f);
        assertEquals(10f, s.get(3).v[0], 0f);
        assertEquals(10f, s.get(4).v[2], 0f);
        assertEquals(20f, s.get(4).v[3], 0f);
    }

    @Test
    public void facesAndReactionsAreTheApps() {
        assertEquals("innamorato", UsCharacterShapes.faceOf("festa"));
        assertEquals("giu", UsCharacterShapes.faceOf("malato"));
        assertEquals("teso", UsCharacterShapes.faceOf("nervoso"));
        assertEquals("felice", UsCharacterShapes.faceOf("lavoro"));
        assertEquals("felice", UsCharacterShapes.faceOf(""));
        // Asleep: no open eyes, the z's.
        List<UsCharacterShapes.Op> sleeping = UsCharacterShapes.draw("palla", 0xFFFF7C96, "felice", "sera", "", "", 0xFFF7EFE9);
        assertTrue(sleeping.stream().anyMatch(op -> "z".equals(op.text)));
        // Heart eyes are the red hearts (#FF4F6F).
        assertTrue(UsCharacterShapes.draw("palla", 0xFFFF7C96, "felice", "cuore", "", "", 0).stream().anyMatch(op -> op.fill == 0xFFFF4F6F));
        // The outline is the dark of the colour, never black (Stile unico).
        assertEquals(UsCharacterShapes.mix(0xFFFF7C96, 0.42, 0xFF1A1020), UsCharacterShapes.edge(0xFFFF7C96));
    }

    @Test
    public void withoutAChoiceTheRolesShape() {
        assertEquals("palla", UsCharacterShapes.shapeOr("", false));
        assertEquals("quadrato", UsCharacterShapes.shapeOr("", true));
        assertEquals("nuvola", UsCharacterShapes.shapeOr("nuvola", true));
        assertEquals("quadrato", UsCharacterShapes.shapeOr("stella", true));
    }

    @Test
    public void theContractKeepsOnlyKnownCharacters() throws Exception {
        JSONObject clean = UsWidgetContract.normalize(new JSONObject()
            .put("schemaVersion", 2)
            .put("ownerHash", "a".repeat(64))
            .put("updatedAt", "2026-11-26T10:00:00.000Z")
            .put("couple", new JSONObject().put("names", new JSONArray())
                .put("characters", new JSONObject()
                    .put("me", new JSONObject().put("shape", "nuvola").put("head", "corona").put("face", "gala").put("color", "#6F9BFF").put("day", "#8faad6"))
                    .put("partner", new JSONObject().put("shape", "<svg>").put("head", "elmo").put("face", "occhiali").put("color", "red")))));
        JSONObject me = clean.getJSONObject("couple").getJSONObject("characters").getJSONObject("me");
        assertEquals("nuvola", me.getString("shape"));
        assertEquals("corona", me.getString("head"));
        assertEquals("gala", me.getString("face"));
        assertEquals("#6f9bff", me.getString("color"));
        JSONObject partner = clean.getJSONObject("couple").getJSONObject("characters").getJSONObject("partner");
        assertEquals("", partner.getString("shape"));
        assertEquals("", partner.getString("head"));
        assertEquals("occhiali", partner.getString("face"));
        assertEquals("", partner.getString("color"));
    }
}
