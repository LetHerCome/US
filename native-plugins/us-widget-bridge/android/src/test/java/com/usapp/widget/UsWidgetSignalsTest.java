package com.usapp.widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/** Widget signals (27/11/2026): the partner's new look patched into the snapshot. */
public class UsWidgetSignalsTest {
    private static final String OWNER = "a".repeat(64);

    private static JSONObject snapshot() throws Exception {
        return UsWidgetContract.normalize(new JSONObject()
            .put("schemaVersion", 2)
            .put("ownerHash", OWNER)
            .put("think", new JSONObject().put("partnerName", "Beatrice"))
            .put("couple", new JSONObject()
                .put("names", new JSONArray().put("Francesco").put("Beatrice"))
                .put("colors", new JSONObject().put("me", "#ff7c96").put("partner", "#a98bff"))
                .put("characters", new JSONObject()
                    .put("me", new JSONObject().put("shape", "palla").put("color", "#ff7c96"))
                    .put("partner", new JSONObject().put("shape", "quadrato").put("head", "fiocco").put("color", "#a98bff"))))
            .put("status", new JSONObject().put("partner", new JSONObject().put("status", "felice")
                .put("at", "2026-11-27T08:00:00Z").put("until", "2026-11-27T20:00:00Z"))));
    }

    @Test
    public void theNewLookReplacesOnlyThePartner() throws Exception {
        JSONObject look = new JSONObject().put("shape", "goccia").put("head", "").put("face", "sole").put("color", "#6FD6C8").put("day", "#8ac6ba");
        JSONObject next = UsWidgetContract.withPartnerLook(snapshot(), look);
        JSONObject couple = next.getJSONObject("couple");
        JSONObject partner = couple.getJSONObject("characters").getJSONObject("partner");
        assertEquals("goccia", partner.getString("shape"));
        assertEquals("", partner.getString("head"));
        assertEquals("sole", partner.getString("face"));
        assertEquals("#6fd6c8", partner.getString("color"));
        assertEquals("#8ac6ba", partner.getString("day"));
        assertEquals("#6fd6c8", couple.getJSONObject("colors").getString("partner"));
        // Everything else stays: my character, the names, Come stai, the owner.
        assertEquals("palla", couple.getJSONObject("characters").getJSONObject("me").getString("shape"));
        assertEquals("#ff7c96", couple.getJSONObject("colors").getString("me"));
        assertEquals("Beatrice", couple.getJSONArray("names").getString(1));
        assertEquals("felice", next.getJSONObject("status").getJSONObject("partner").getString("status"));
        assertEquals(OWNER, next.getString("ownerHash"));
    }

    @Test
    public void aHostileLookOnlyEmptiesFields() throws Exception {
        JSONObject look = new JSONObject().put("shape", "<b>").put("head", "corona").put("face", "x").put("color", "red").put("day", "");
        JSONObject partner = UsWidgetContract.withPartnerLook(snapshot(), look)
            .getJSONObject("couple").getJSONObject("characters").getJSONObject("partner");
        assertEquals("", partner.getString("shape"));
        assertEquals("corona", partner.getString("head"));
        assertEquals("", partner.getString("color"));
        // No colour in the look: the partner's dots keep theirs.
        assertEquals("#a98bff", UsWidgetContract.withPartnerLook(snapshot(), look).getJSONObject("couple").getJSONObject("colors").getString("partner"));
    }

    @Test
    public void noSnapshotNoLookNothing() throws Exception {
        assertNull(UsWidgetContract.withPartnerLook(null, new JSONObject()));
        assertNull(UsWidgetContract.withPartnerLook(snapshot(), null));
    }
}
