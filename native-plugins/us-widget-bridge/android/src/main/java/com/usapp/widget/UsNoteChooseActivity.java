package com.usapp.widget;

import android.app.Activity;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.os.Bundle;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Nota: which note this widget shows. The list is the copy the app wrote
 * (never fetched from here); without it, "Apri US". Not exported: only the
 * widget's own PendingIntent opens it (widget-nota-v1, no launcher configure).
 */
public final class UsNoteChooseActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        int widgetId = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (!UsNoteSheet.isNoteWidget(this, widgetId)) { finish(); return; }
        UsWidgetStore store = new UsWidgetStore(this);
        JSONObject cache = store.readNotes();
        JSONArray notes = cache == null ? null : cache.optJSONArray("notes");

        LinearLayout card = UsNoteSheet.card(this);
        card.addView(UsNoteSheet.kicker(this, "Nota"));
        TextView heading = UsNoteSheet.text(this, notes == null || notes.length() == 0 ? "Apri US per scegliere una nota" : "Quale nota sulla Home?", 21, UsNoteSheet.TEXT);
        heading.setTypeface(android.graphics.Typeface.SERIF);
        heading.setPadding(0, UsNoteSheet.dp(this, 6), 0, UsNoteSheet.dp(this, 10));
        card.addView(heading);

        if (notes == null || notes.length() == 0) {
            card.addView(UsNoteSheet.text(this, "Le vostre note arrivano qui quando apri US.", 14, UsNoteSheet.TEXT_2));
            android.widget.Button open = UsNoteSheet.button(this, "Apri US", true);
            open.setOnClickListener((view) -> {
                try { UsWidgets.open(this, "note", 4801).send(); } catch (PendingIntent.CanceledException ignored) {}
                finish();
            });
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            params.topMargin = UsNoteSheet.dp(this, 16);
            params.gravity = android.view.Gravity.END;
            card.addView(open, params);
        } else {
            LinearLayout list = new LinearLayout(this);
            list.setOrientation(LinearLayout.VERTICAL);
            for (int i = 0; i < notes.length(); i++) {
                JSONObject note = notes.optJSONObject(i);
                if (note == null) continue;
                String id = note.optString("id");
                TextView row = UsNoteSheet.text(this, label(note), 16, UsNoteSheet.TEXT);
                row.setMinHeight(UsNoteSheet.dp(this, 48));
                row.setGravity(android.view.Gravity.CENTER_VERTICAL);
                row.setSingleLine(true);
                row.setEllipsize(android.text.TextUtils.TruncateAt.END);
                row.setBackground(new android.graphics.drawable.RippleDrawable(
                    android.content.res.ColorStateList.valueOf(0x22F7EFE9), null, new android.graphics.drawable.ColorDrawable(0xFFFFFFFF)));
                row.setOnClickListener((view) -> {
                    if (store.selectNote(widgetId, id)) UsWidgets.refreshAll(getApplicationContext());
                    finish();
                });
                list.addView(row);
            }
            ScrollView scroll = new ScrollView(this);
            scroll.addView(list);
            card.addView(scroll, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,
                Math.min(UsNoteSheet.dp(this, 48) * notes.length(), UsNoteSheet.dp(this, 360))));
        }
        android.widget.Button close = UsNoteSheet.button(this, "Chiudi", false);
        close.setOnClickListener((View view) -> finish());
        LinearLayout.LayoutParams closeParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        closeParams.gravity = android.view.Gravity.END;
        card.addView(close, closeParams);
        setContentView(card);
        UsNoteSheet.fit(this);
    }

    /** The title, else the first words of the text or of the first item. */
    static String label(JSONObject note) {
        String title = note.optString("title", "").trim();
        if (!title.isEmpty()) return title;
        String body = note.optString("body", "").trim();
        if (!body.isEmpty()) return body.split("\n", 2)[0];
        JSONArray items = note.optJSONArray("items");
        String first = items != null && items.length() > 0 ? items.optJSONObject(0).optString("text", "").trim() : "";
        return first.isEmpty() ? "Nota" : first;
    }
}
