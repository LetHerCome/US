package com.usapp.widget;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.graphics.Typeface;
import android.os.Bundle;
import android.text.Editable;
import android.text.InputFilter;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Nota: the writing window over the Home screen (founder, 31/10/2026: on
 * Android one cannot type inside a widget). Title, text and items; «Salva»
 * sends the whole note and the last save wins, as in the app. It opens on the
 * copy, then reads the server's version unless one has started typing.
 * Not exported: only the widget's PendingIntent, checked against the note the
 * widget shows. The note credential, never a Supabase session.
 */
public final class UsNoteEditActivity extends Activity {
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    private static final int TITLE = 80;
    private static final int BODY = 4000;
    private static final int ITEMS = 100;
    private static final int ITEM_TEXT = 200;

    private int widgetId;
    private String noteId;
    private String owner;
    private UsWidgetStore store;
    private EditText title;
    private EditText body;
    private LinearLayout itemsBox;
    private TextView status;
    private Button save;
    private Button add;
    private boolean touched = false;
    private boolean filling = false;
    private final List<Row> rows = new ArrayList<>();

    private static final class Row {
        String id;
        CheckBox done;
        EditText text;
        View root;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        widgetId = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        noteId = getIntent().getStringExtra(UsNoteWidgetProvider.EXTRA_NOTE);
        store = new UsWidgetStore(this);
        if (!UsNoteSheet.isNoteWidget(this, widgetId) || !UsNoteModels.validNoteId(noteId) || !noteId.equals(store.noteFor(widgetId))) {
            finish();
            return;
        }
        owner = store.owner();
        JSONObject note = UsNoteModels.find(store.readNotes(), noteId);
        if (note == null) {
            startActivity(new android.content.Intent(this, UsNoteChooseActivity.class)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId));
            finish();
            return;
        }
        setContentView(build());
        UsNoteSheet.fit(this);
        fill(note);
        // The server's version, unless one has already started typing.
        EXECUTOR.execute(() -> {
            UsWidgetNoteClient.Result result = call(new JSONObjectBuilder().put("op", "get").put("noteId", noteId).json);
            runOnUiThread(() -> {
                if (isFinishing() || !owner.equals(store.owner())) return;
                if (result.ok()) {
                    store.replaceNote(result.note, "");
                    UsWidgets.refreshAll(getApplicationContext());
                    if (!touched) fill(result.note);
                } else if (result.status == UsWidgetNoteClient.NOT_FOUND) {
                    say("Questa nota non c'è più. Scegline un'altra.");
                    save.setEnabled(false);
                }
            });
        });
    }

    private View build() {
        LinearLayout card = UsNoteSheet.card(this);
        card.addView(UsNoteSheet.kicker(this, "Nota"));
        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        title = field("Titolo", TITLE, false);
        title.setTypeface(Typeface.SERIF);
        title.setTextSize(20);
        form.addView(title);
        body = field("Scrivi qui", BODY, true);
        form.addView(body);
        itemsBox = new LinearLayout(this);
        itemsBox.setOrientation(LinearLayout.VERTICAL);
        form.addView(itemsBox);
        add = UsNoteSheet.button(this, "+ Aggiungi voce", false);
        add.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        add.setOnClickListener((view) -> {
            Row row = addRow(UUID.randomUUID().toString(), "", false);
            row.text.requestFocus();
            changed();
        });
        form.addView(add);
        ScrollView scroll = new ScrollView(this);
        scroll.addView(form);
        LinearLayout.LayoutParams scrollParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f);
        card.addView(scroll, scrollParams);
        status = UsNoteSheet.text(this, "", 13, UsNoteSheet.CORALLO);
        status.setVisibility(View.GONE);
        card.addView(status);

        LinearLayout actions = new LinearLayout(this);
        actions.setGravity(Gravity.CENTER_VERTICAL);
        Button other = UsNoteSheet.button(this, "Cambia nota", false);
        other.setOnClickListener((view) -> {
            startActivity(new android.content.Intent(this, UsNoteChooseActivity.class)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId));
            finish();
        });
        actions.addView(other);
        View space = new View(this);
        actions.addView(space, new LinearLayout.LayoutParams(0, 1, 1f));
        Button cancel = UsNoteSheet.button(this, "Annulla", false);
        cancel.setOnClickListener((view) -> finish());
        actions.addView(cancel);
        save = UsNoteSheet.button(this, "Salva", true);
        save.setOnClickListener((view) -> save());
        actions.addView(save);
        LinearLayout.LayoutParams actionParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        actionParams.topMargin = UsNoteSheet.dp(this, 8);
        card.addView(actions, actionParams);
        return card;
    }

    private EditText field(String hint, int max, boolean multiLine) {
        EditText field = new EditText(this);
        field.setHint(hint);
        field.setHintTextColor(UsNoteSheet.MUTED);
        field.setTextColor(UsNoteSheet.TEXT);
        field.setTextSize(15);
        field.setFilters(new InputFilter[] { new InputFilter.LengthFilter(max) });
        field.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            | (multiLine ? InputType.TYPE_TEXT_FLAG_MULTI_LINE : 0));
        if (multiLine) { field.setMinLines(2); field.setMaxLines(8); field.setGravity(Gravity.TOP | Gravity.START); }
        field.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {}
            @Override public void afterTextChanged(Editable s) { changed(); }
        });
        return field;
    }

    private Row addRow(String id, String text, boolean done) {
        Row row = new Row();
        row.id = id;
        LinearLayout line = new LinearLayout(this);
        line.setGravity(Gravity.CENTER_VERTICAL);
        row.done = new CheckBox(this);
        row.done.setChecked(done);
        row.done.setButtonTintList(android.content.res.ColorStateList.valueOf(UsNoteSheet.LILLA));
        row.done.setOnCheckedChangeListener((button, checked) -> changed());
        line.addView(row.done);
        row.text = field("Voce", ITEM_TEXT, false);
        row.text.setText(text);
        line.addView(row.text, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        TextView remove = UsNoteSheet.text(this, "×", 22, UsNoteSheet.TEXT_2);
        remove.setContentDescription("Togli la voce");
        remove.setGravity(Gravity.CENTER);
        remove.setMinWidth(UsNoteSheet.dp(this, 44));
        remove.setMinHeight(UsNoteSheet.dp(this, 44));
        remove.setOnClickListener((view) -> {
            itemsBox.removeView(row.root);
            rows.remove(row);
            add.setEnabled(rows.size() < ITEMS);
            changed();
        });
        line.addView(remove);
        row.root = line;
        rows.add(row);
        itemsBox.addView(line);
        add.setEnabled(rows.size() < ITEMS);
        return row;
    }

    private void fill(JSONObject note) {
        filling = true;
        title.setText(note.optString("title", ""));
        body.setText(note.optString("body", ""));
        itemsBox.removeAllViews();
        rows.clear();
        JSONArray items = note.optJSONArray("items");
        for (int i = 0; items != null && i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item != null) addRow(item.optString("id"), item.optString("text"), item.optBoolean("done"));
        }
        add.setEnabled(rows.size() < ITEMS);
        filling = false;
        touched = false;
    }

    private void changed() {
        if (!filling) touched = true;
        if (status != null && status.getVisibility() == View.VISIBLE && !filling) status.setVisibility(View.GONE);
    }

    private void say(String message) {
        status.setText(message);
        status.setVisibility(View.VISIBLE);
    }

    private void save() {
        try {
            JSONArray items = new JSONArray();
            for (Row row : rows) items.put(new JSONObject().put("id", row.id).put("text", row.text.getText().toString()).put("done", row.done.isChecked()));
            String titleText = title.getText().toString().trim();
            String bodyText = body.getText().toString();
            if (titleText.isEmpty() && bodyText.trim().isEmpty() && items.length() == 0) {
                say("Scrivi qualcosa prima di salvare.");
                return;
            }
            JSONObject request = new JSONObject().put("op", "save").put("noteId", noteId)
                .put("title", titleText).put("body", bodyText).put("items", items);
            save.setEnabled(false);
            say("Salvo…");
            status.setTextColor(UsNoteSheet.TEXT_2);
            EXECUTOR.execute(() -> {
                UsWidgetNoteClient.Result result = call(request);
                runOnUiThread(() -> {
                    if (isFinishing() || !owner.equals(store.owner())) return;
                    status.setTextColor(UsNoteSheet.CORALLO);
                    save.setEnabled(true);
                    if (result.ok()) {
                        store.replaceNote(result.note, "");
                        UsWidgets.refreshAll(getApplicationContext());
                        finish();
                    } else if (result.status == UsWidgetNoteClient.UNAUTHORIZED) {
                        new UsWidgetCredentialStore(this, UsWidgetCredentialStore.NOTE).clear();
                        say("Apri US per riattivare la nota, poi riprova.");
                    } else if (result.status == UsWidgetNoteClient.NOT_FOUND) {
                        say("Questa nota non c'è più. Scegline un'altra.");
                        save.setEnabled(false);
                    } else {
                        say("Non salvato. Riprova.");
                    }
                });
            });
        } catch (Exception ignored) {
            say("Non salvato. Riprova.");
        }
    }

    private UsWidgetNoteClient.Result call(JSONObject request) {
        UsWidgetCredentialStore credentials = new UsWidgetCredentialStore(getApplicationContext(), UsWidgetCredentialStore.NOTE);
        String token = credentials.readToken(owner);
        if (token.isEmpty()) return new UsWidgetNoteClient.Result(UsWidgetNoteClient.UNAUTHORIZED, null);
        return new UsWidgetNoteClient().call(credentials.functionsBase(owner), token, request);
    }

    /** JSONObject.put throws checked exceptions; the request here is fixed. */
    private static final class JSONObjectBuilder {
        final JSONObject json = new JSONObject();
        JSONObjectBuilder put(String key, Object value) {
            try { json.put(key, value); } catch (Exception ignored) {}
            return this;
        }
    }
}
