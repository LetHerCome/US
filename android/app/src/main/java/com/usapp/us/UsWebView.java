package com.usapp.us;

import android.content.Context;
import android.text.InputType;
import android.util.AttributeSet;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;

import com.getcapacitor.CapacitorWebView;

/**
 * US WebView input bridge.
 *
 * Chromium marks ordinary HTML text fields as TYPE_TEXT_VARIATION_WEB_EDIT_TEXT.
 * Some Android IMEs/OEM skins render a reduced toolbar for that variation even
 * though the same field in Chrome/PWA gets the normal text toolbar. For plain
 * web text only, expose the editor as TYPE_TEXT_VARIATION_NORMAL while
 * preserving all other flags (including MULTI_LINE). Structured/sensitive
 * fields are untouched because their variation is not WEB_EDIT_TEXT.
 */
public final class UsWebView extends CapacitorWebView {

    public UsWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    public InputConnection onCreateInputConnection(EditorInfo outAttrs) {
        InputConnection connection = super.onCreateInputConnection(outAttrs);
        if (connection == null) {
            return null;
        }

        final int inputType = outAttrs.inputType;
        final int inputClass = inputType & InputType.TYPE_MASK_CLASS;
        final int variation = inputType & InputType.TYPE_MASK_VARIATION;

        if (inputClass == InputType.TYPE_CLASS_TEXT
                && variation == InputType.TYPE_TEXT_VARIATION_WEB_EDIT_TEXT) {
            int normalized = inputType & ~InputType.TYPE_MASK_VARIATION;
            normalized |= InputType.TYPE_TEXT_VARIATION_NORMAL;
            normalized &= ~InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS;
            outAttrs.inputType = normalized;
        }

        return connection;
    }
}
