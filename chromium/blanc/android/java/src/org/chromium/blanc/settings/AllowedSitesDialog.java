// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.settings;

import android.app.Activity;
import android.app.Dialog;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.chromium.blanc.island.R;
import org.chromium.build.annotations.NullMarked;

import java.util.List;

/**
 * Settings → Privacy → Allowed sites: where Blanc Blocker is off. The iPhone's page (a list with a
 * remove button on each site, an address field and an Add button) as a full-screen dialog, so it needs
 * no Settings sub-page of Chromium's (docs/android/a5a-settings-spike.md, R8).
 */
@NullMarked
public final class AllowedSitesDialog {
    /** The list's storage; the app's is the blocker's profile preference. */
    public interface Backend {
        List<String> sites();

        void setAllowed(String host, boolean allow);
    }

    private final Activity mActivity;
    private final Backend mBackend;
    private final Dialog mDialog;
    private final LinearLayout mList;
    private final LinearLayout mSites;
    private final EditText mField;
    private final TextView mError;

    public AllowedSitesDialog(Activity activity, Backend backend) {
        mActivity = activity;
        mBackend = backend;
        mDialog = new Dialog(activity, android.R.style.Theme_DeviceDefault_DayNight);
        mList = new LinearLayout(activity);
        mList.setOrientation(LinearLayout.VERTICAL);
        int pad = dimen(R.dimen.blanc_settings_dialog_padding);
        mList.setPadding(pad, pad, pad, pad);
        ScrollView scroll = new ScrollView(activity);
        scroll.setFitsSystemWindows(true);
        scroll.addView(mList);
        mDialog.setContentView(scroll);

        TextView title = text(activity.getString(R.string.blanc_ios_settings_exceptions), R.dimen.blanc_settings_dialog_title_size, true);
        mList.addView(title);
        mList.addView(text(activity.getString(R.string.blanc_ios_settings_exceptions_help), R.dimen.blanc_settings_dialog_body_size, false));
        mSites = new LinearLayout(activity);
        mSites.setOrientation(LinearLayout.VERTICAL);
        mList.addView(mSites);

        mField = new EditText(activity);
        mField.setTag("allowed.field");
        mField.setHint(R.string.blanc_ios_settings_site);
        mField.setSingleLine(true);
        mField.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        mField.setImeOptions(EditorInfo.IME_ACTION_DONE);
        mField.setOnEditorActionListener((v, actionId, event) -> {
            add();
            return true;
        });
        mList.addView(mField);
        Button addButton = new Button(activity);
        addButton.setTag("allowed.add");
        addButton.setText(R.string.blanc_ios_settings_add_site);
        addButton.setOnClickListener(v -> add());
        mList.addView(addButton);
        mError = text("", R.dimen.blanc_settings_dialog_body_size, false);
        mError.setTag("allowed.error");
        mError.setTextColor(mActivity.getColor(R.color.blanc_settings_error));
        mError.setVisibility(View.GONE);
        mList.addView(mError);
        Button done = new Button(activity);
        done.setText(R.string.blanc_ws_editor_done);
        done.setOnClickListener(v -> mDialog.dismiss());
        mList.addView(done);
        render();
    }

    public void show() {
        render();
        mDialog.show();
    }

    public View root() {
        return mList;
    }

    private void add() {
        AllowedSites.Result result = AllowedSites.add(mBackend.sites(), mField.getText().toString());
        if (result.error == AllowedSites.Problem.INVALID) {
            showError(R.string.blanc_ios_settings_invalid_site);
            return;
        }
        if (result.error == AllowedSites.Problem.DUPLICATE) {
            showError(R.string.blanc_ios_settings_duplicate_site);
            return;
        }
        // AllowedSites.add appends the new host last.
        mBackend.setAllowed(result.sites.get(result.sites.size() - 1), true);
        mField.setText("");
        mError.setVisibility(View.GONE);
        render();
    }

    private void showError(int message) {
        mError.setText(message);
        mError.setVisibility(View.VISIBLE);
    }

    private void render() {
        mSites.removeAllViews();
        for (String host : mBackend.sites()) {
            LinearLayout row = new LinearLayout(mActivity);
            row.setTag("allowed.site");
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            TextView name = text(host, R.dimen.blanc_settings_dialog_row_size, false);
            row.addView(name, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            Button remove = new Button(mActivity);
            remove.setTag("allowed.remove");
            remove.setText("−");
            remove.setMinWidth(dimen(R.dimen.blanc_settings_dialog_touch));
            remove.setMinHeight(dimen(R.dimen.blanc_settings_dialog_touch));
            remove.setContentDescription(
                    mActivity.getString(R.string.blanc_ios_settings_remove_site) + ": " + host);
            remove.setOnClickListener(v -> {
                mBackend.setAllowed(host, false);
                render();
            });
            row.addView(remove);
            mSites.addView(row);
        }
    }

    private TextView text(String value, int sizeRes, boolean bold) {
        TextView view = new TextView(mActivity);
        view.setText(value);
        view.setTextSize(TypedValue.COMPLEX_UNIT_PX, mActivity.getResources().getDimension(sizeRes));
        if (bold) view.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        int gap = dimen(R.dimen.blanc_settings_dialog_gap);
        view.setPadding(0, gap, 0, gap);
        return view;
    }

    private int dimen(int res) {
        return mActivity.getResources().getDimensionPixelSize(res);
    }
}
