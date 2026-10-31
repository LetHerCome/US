package com.usapp.widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.time.Instant;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/** Widget «Nota» (docs/missions/widget-nota-v1.md): the pure parts. */
public class UsNoteModelsTest {
    private static final String OWNER = "b".repeat(64);
    private static final String NOTE = "5a86d7aa-37d8-48ed-9122-a8f42d80ff9e";
    private static final Instant NOW = Instant.parse("2026-10-31T11:00:00Z");

    private static JSONObject item(String id, String text, boolean done) throws Exception {
        return new JSONObject().put("id", id).put("text", text).put("done", done);
    }

    private static JSONObject note(int items) throws Exception {
        JSONArray list = new JSONArray();
        for (int i = 1; i <= items; i++) list.put(item("i" + i, "Voce " + i, i == 2));
        return new JSONObject().put("id", NOTE).put("title", "Spesa").put("body", "Per sabato").put("items", list)
            .put("updatedAt", "2026-10-31T10:40:00Z").put("byName", "Bea").put("byMe", false).put("revision", 4);
    }

    @Test
    public void cacheIsBoundToTheOwnerAndKeepsTheAppLimits() throws Exception {
        JSONObject bad = note(1).put("title", "x".repeat(81));
        JSONObject input = new JSONObject().put("ownerHash", OWNER)
            .put("notes", new JSONArray().put(note(2)).put(bad).put(new JSONObject().put("id", "nota-1")));
        JSONObject clean = UsNoteModels.normalizeCache(input, OWNER);
        assertNotNull(clean);
        assertEquals("only valid notes stay", 1, clean.getJSONArray("notes").length());
        assertNull("another account's notes are dropped", UsNoteModels.normalizeCache(input, "c".repeat(64)));
        JSONObject found = UsNoteModels.find(clean, NOTE);
        assertEquals("Spesa", found.getString("title"));
        assertNull(UsNoteModels.find(clean, "00000000-0000-4000-8000-000000000000"));
        // At most 40 notes travel to the phone.
        JSONArray many = new JSONArray();
        for (int i = 0; i < 50; i++) many.put(note(0).put("id", String.format("5a86d7aa-37d8-48ed-9122-%012d", i)));
        assertEquals(40, UsNoteModels.normalizeCache(new JSONObject().put("ownerHash", OWNER).put("notes", many), OWNER).getJSONArray("notes").length());
    }

    @Test
    public void viewShowsTitleSixItemsMoreAndWhoAndWhen() throws Exception {
        UsNoteModels.View view = UsNoteModels.view(UsNoteModels.normalizeNote(note(9)), NOW);
        assertEquals("Spesa", view.title);
        assertEquals("with a list the text steps aside", "", view.body);
        assertEquals(6, view.rows.size());
        assertEquals("i2", view.rows.get(1).id);
        assertTrue(view.rows.get(1).done);
        assertEquals("+3", view.more);
        assertEquals("Bea · 20 min fa", view.footer);
        assertEquals(Instant.parse("2026-10-31T11:05:00Z"), view.nextChange);
        UsNoteModels.View text = UsNoteModels.view(UsNoteModels.normalizeNote(note(0).put("byMe", true)), NOW);
        assertEquals("Per sabato", text.body);
        assertEquals(0, text.rows.size());
        assertEquals("", text.more);
        assertEquals("Tu · 20 min fa", text.footer);
        UsNoteModels.View missing = UsNoteModels.view(null, NOW);
        assertTrue(missing.empty);
        assertEquals("Tocca per scegliere una nota", missing.title);
    }

    @Test
    public void toggleChangesOnlyThatItem() throws Exception {
        JSONObject before = UsNoteModels.normalizeNote(note(3));
        JSONObject after = UsNoteModels.toggle(before, "i1", true);
        assertTrue(after.getJSONArray("items").getJSONObject(0).getBoolean("done"));
        assertTrue("i2 stays done", after.getJSONArray("items").getJSONObject(1).getBoolean("done"));
        assertFalse(after.getJSONArray("items").getJSONObject(2).getBoolean("done"));
        assertFalse("the copy is new", before.getJSONArray("items").getJSONObject(0).getBoolean("done"));
        assertNull("an unknown item", UsNoteModels.toggle(before, "i9", true));
    }
}
