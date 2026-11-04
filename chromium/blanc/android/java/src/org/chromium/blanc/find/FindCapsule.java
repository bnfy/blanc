// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.find;

import android.app.Activity;
import android.app.Dialog;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.chromium.blanc.island.IslandStyle;
import org.chromium.blanc.island.R;
import org.chromium.build.annotations.NullMarked;

/**
 * Find in page: desktop's find capsule (a field, the "2/5" count, Previous and Next) as a bar
 * above the keyboard, with Done. It drives Chromium's find through {@link Finder}; back or Done
 * closes it and clears the highlight.
 */
@NullMarked
public final class FindCapsule extends Dialog {
    /** Chromium's find in page (FindInPageBridge on the phone). */
    public interface Finder {
        void find(String text, boolean forward);

        void stop();
    }

    private final Finder mFinder;
    private final EditText mField;
    private final TextView mCount;
    private final ImageButton mPrevious;
    private final ImageButton mNext;
    private final TextView mDone;

    private FindCapsule(Activity activity, Finder finder, boolean privateTab) {
        super(activity);
        mFinder = finder;
        float d = activity.getResources().getDisplayMetrics().density;
        boolean dark = (activity.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
        IslandStyle style = IslandStyle.forTab(privateTab, dark);
        int secondary = (style.text & 0x00FFFFFF) | 0x99000000;

        LinearLayout bar = new LinearLayout(activity);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(Math.round(16 * d), Math.round(4 * d), Math.round(8 * d), Math.round(4 * d));
        GradientDrawable capsule = new GradientDrawable();
        capsule.setColor(style.raised);
        capsule.setCornerRadius(24 * d);
        capsule.setStroke(Math.max(1, Math.round(0.5f * d)), style.border);
        bar.setBackground(capsule);

        mField = new EditText(activity);
        mField.setSingleLine(true);
        mField.setInputType(InputType.TYPE_CLASS_TEXT);
        mField.setImeOptions(EditorInfo.IME_ACTION_SEARCH | EditorInfo.IME_FLAG_NO_EXTRACT_UI
                | EditorInfo.IME_FLAG_NO_FULLSCREEN);
        mField.setHint(R.string.blanc_find_placeholder);
        mField.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        mField.setTextColor(style.text);
        mField.setHintTextColor(secondary);
        mField.setBackground(null);
        mField.setOnEditorActionListener((v, action, event) -> {
            step(true);
            return true;
        });
        bar.addView(mField, new LinearLayout.LayoutParams(0, Math.round(44 * d), 1));
        mCount = new TextView(activity);
        mCount.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        mCount.setTextColor(secondary);
        mCount.setPadding(Math.round(6 * d), 0, Math.round(6 * d), 0);
        bar.addView(mCount);
        mPrevious = button(activity, R.drawable.blanc_find_chevron_up, R.string.blanc_find_prev, style.text);
        mPrevious.setOnClickListener(v -> step(false));
        bar.addView(mPrevious, new LinearLayout.LayoutParams(Math.round(44 * d), Math.round(44 * d)));
        mNext = button(activity, R.drawable.blanc_palette_chevron_down, R.string.blanc_find_next, style.text);
        mNext.setOnClickListener(v -> step(true));
        bar.addView(mNext, new LinearLayout.LayoutParams(Math.round(44 * d), Math.round(44 * d)));
        mDone = new TextView(activity);
        mDone.setText(R.string.blanc_ws_editor_done);
        mDone.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        mDone.setTypeface(Typeface.DEFAULT_BOLD);
        mDone.setTextColor(style.text);
        mDone.setGravity(Gravity.CENTER);
        mDone.setMinWidth(Math.round(44 * d));
        mDone.setMinHeight(Math.round(44 * d));
        mDone.setPadding(Math.round(8 * d), 0, Math.round(8 * d), 0);
        mDone.setOnClickListener(v -> cancel());
        bar.addView(mDone);

        mField.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {}

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {}

            @Override
            public void afterTextChanged(Editable s) {
                mCount.setText("");
                if (s.length() == 0) {
                    mFinder.stop();
                } else {
                    mFinder.find(s.toString(), true);
                }
            }
        });
        setOnCancelListener(dialog -> mFinder.stop());

        // Above the keyboard and the navigation bar, from the window's insets (edge to edge).
        FrameLayout frame = new FrameLayout(activity);
        FrameLayout.LayoutParams barLp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        int margin = Math.round(12 * d);
        barLp.setMargins(margin, margin, margin, margin);
        frame.addView(bar, barLp);
        frame.setOnApplyWindowInsetsListener((v, insets) -> {
            int bottom;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                bottom = Math.max(insets.getInsets(WindowInsets.Type.ime()).bottom,
                        insets.getInsets(WindowInsets.Type.navigationBars()).bottom);
            } else {
                bottom = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(0, 0, 0, bottom);
            return insets;
        });
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        setContentView(frame);
        Window window = getWindow();
        if (window != null) {
            window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            window.setGravity(Gravity.BOTTOM);
            window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            // The page stays visible and scrolls to each match behind the bar.
            window.clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            window.addFlags(WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL);
            window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
        }
    }

    public static FindCapsule show(Activity activity, Finder finder, boolean privateTab) {
        FindCapsule capsule = new FindCapsule(activity, finder, privateTab);
        capsule.show();
        capsule.mField.requestFocus();
        return capsule;
    }

    /** Chromium's result: the active match and the total; nothing shows without matches. */
    public void setResult(int active, int total) {
        mCount.setText(total > 0 && mField.length() > 0 ? active + "/" + total : "");
    }

    private void step(boolean forward) {
        if (mField.length() > 0) mFinder.find(mField.getText().toString(), forward);
    }

    private static ImageButton button(Activity activity, int icon, int label, int tint) {
        ImageButton view = new ImageButton(activity);
        view.setImageResource(icon);
        view.setImageTintList(ColorStateList.valueOf(tint));
        view.setBackground(null);
        view.setContentDescription(activity.getString(label));
        return view;
    }

    public EditText field() {
        return mField;
    }

    public TextView count() {
        return mCount;
    }

    public View previousButton() {
        return mPrevious;
    }

    public View nextButton() {
        return mNext;
    }

    public View doneButton() {
        return mDone;
    }
}
