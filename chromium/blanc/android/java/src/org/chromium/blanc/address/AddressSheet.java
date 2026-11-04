// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.address;

import android.app.Activity;
import android.app.Dialog;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.FrameLayout;

import org.chromium.blanc.island.IslandStyle;
import org.chromium.blanc.island.R;
import org.chromium.build.annotations.NullMarked;

import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The address sheet: the Blanc for iPhone palette's field (PaletteSheet.swift) in a bottom sheet
 * above the keyboard, opened from the Island's site. It opens with the current address selected;
 * Go turns the text into an address or a search (AddressInput) and hands the URL back. A2's
 * palette grows the Quick Switcher and slash commands under this field.
 */
@NullMarked
public final class AddressSheet extends Dialog {
    /** Receives the URL to open: an address, a DuckDuckGo search, or another app's link. */
    public interface Open {
        void open(String url);
    }

    private final EditText mField;
    private final Open mOpen;

    private AddressSheet(Activity activity, String current, Open open) {
        super(activity);
        mOpen = open;
        float d = activity.getResources().getDisplayMetrics().density;
        boolean dark =
                (activity.getResources().getConfiguration().uiMode
                                & Configuration.UI_MODE_NIGHT_MASK)
                        == Configuration.UI_MODE_NIGHT_YES;
        IslandStyle style = IslandStyle.forTab(false, dark);
        mField = new EditText(activity);
        mField.setSingleLine(true);
        mField.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        mField.setImeOptions(EditorInfo.IME_ACTION_GO);
        mField.setHint(R.string.blanc_ios_palette_placeholder);
        mField.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        mField.setTextColor(style.text);
        mField.setHintTextColor((style.text & 0x00FFFFFF) | 0x80000000);
        mField.setText(current);
        mField.setSelectAllOnFocus(true);
        mField.selectAll();
        mField.setOnEditorActionListener(
                (v, action, event) -> {
                    if (action != EditorInfo.IME_ACTION_GO) return false;
                    go();
                    return true;
                });
        GradientDrawable fieldBackground = new GradientDrawable();
        fieldBackground.setColor((style.text & 0x00FFFFFF) | 0x0F000000);
        fieldBackground.setCornerRadius(12 * d);
        mField.setBackground(fieldBackground);
        mField.setPadding((int) (14 * d), (int) (12 * d), (int) (14 * d), (int) (12 * d));
        FrameLayout panel = new FrameLayout(activity);
        GradientDrawable panelBackground = new GradientDrawable();
        panelBackground.setColor(style.raised);
        float r = activity.getResources().getDimension(R.dimen.blanc_island_corner_radius);
        panelBackground.setCornerRadii(new float[] {r, r, r, r, 0, 0, 0, 0});
        panel.setBackground(panelBackground);
        panel.setPadding((int) (16 * d), (int) (16 * d), (int) (16 * d), (int) (16 * d));
        panel.addView(mField, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        setContentView(panel);
        Window window = getWindow();
        if (window != null) {
            window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            window.setGravity(Gravity.BOTTOM);
            window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            // Above the keyboard, which opens with the sheet.
            window.setSoftInputMode(
                    WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
                            | WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
        }
    }

    public static AddressSheet show(Activity activity, String current, Open open) {
        AddressSheet sheet = new AddressSheet(activity, current, open);
        sheet.show();
        sheet.mField.requestFocus();
        return sheet;
    }

    public EditText field() {
        return mField;
    }

    private void go() {
        String text = mField.getText().toString();
        if (AddressInput.trim(text).isEmpty()) return;
        AddressInput.Result r = AddressInput.interpret(text);
        dismiss();
        if (r.kind == AddressInput.Kind.SEARCH) {
            mOpen.open(AddressInput.searchUrl(r.value));
            return;
        }
        // Blanc's own addresses open the pages Android serves (D34); the rest aren't pages here.
        Matcher page = BLANC_PAGE.matcher(r.value);
        if (!page.matches()) {
            mOpen.open(r.value);
        } else if (SERVED_PAGES.contains(page.group(1))) {
            mOpen.open("chrome://blanc/" + page.group(1) + ".html" + (page.group(2) == null ? "" : page.group(2)));
        }
    }

    // The pages chrome://blanc/ serves (tools/android-pages.mjs PAGES), as the adapter maps them.
    private static final List<String> SERVED_PAGES =
            List.of("newtab", "bookmarks", "history", "shortcuts", "error", "mahjong");
    private static final Pattern BLANC_PAGE =
            Pattern.compile("^blanc://([a-z-]+)/?([?#].*)?$", Pattern.CASE_INSENSITIVE);
}
