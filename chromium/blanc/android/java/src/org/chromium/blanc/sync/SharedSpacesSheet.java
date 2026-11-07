// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import android.app.Activity;
import android.app.Dialog;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import org.chromium.blanc.island.R;
import org.chromium.blanc.spaces.SpacesController;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.HashMap;
import java.util.Map;

/**
 * Turning on "Keep Spaces and groups in sync on this phone": the phone's Spaces with their tab
 * counts and the library's room. Every Space that fits is ticked; one too large is greyed with the
 * reason; a dormant copy offers Rejoin or Add as a copy. SharedSpacesSheet.swift's rows and rules.
 */
@NullMarked
public final class SharedSpacesSheet {
    private final Activity mActivity;
    private final Runnable mDone;
    private final Dialog mDialog;
    private final LinearLayout mList;
    private final Map<String, String> mChosen = new HashMap<>();
    private JSONObject mPreview = new JSONObject();
    private @Nullable String mError;

    public SharedSpacesSheet(Activity activity, Runnable done) {
        mActivity = activity;
        mDone = done;
        mDialog = new Dialog(activity, android.R.style.Theme_DeviceDefault_DayNight);
        mList = new LinearLayout(activity);
        mList.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(20);
        mList.setPadding(pad, pad, pad, pad);
        ScrollView scroll = new ScrollView(activity);
        scroll.setFitsSystemWindows(true);
        scroll.addView(mList);
        mDialog.setContentView(scroll);
    }

    public void show() {
        mDialog.show();
        load();
    }

    private int dp(int value) {
        return Math.round(value * mActivity.getResources().getDisplayMetrics().density);
    }

    private void load() {
        try {
            SyncedSpaces.ask("spaces.preview", new JSONArray().put(new JSONObject().put("local", true)).toString(), value -> {
                if (value == null) return;
                mPreview = value;
                JSONArray choices = value.optJSONArray("choices");
                Map<String, String> next = new HashMap<>();
                for (int i = 0; choices != null && i < choices.length(); i++) {
                    JSONObject row = choices.optJSONObject(i);
                    if (row == null || row.optBoolean("shared")) continue;
                    String id = row.optString("id");
                    if (row.optBoolean("rejoin")) next.put(id, mChosen.getOrDefault(id, "rejoin"));
                    else if (row.isNull("reason")) next.put(id, mChosen.getOrDefault(id, "copy"));
                }
                mChosen.clear();
                mChosen.putAll(next);
                render();
            });
        } catch (JSONException e) {
            // The sheet stays as it was.
        }
    }

    private TextView line(String text) {
        TextView view = new TextView(mActivity);
        view.setText(text);
        view.setPadding(0, dp(4), 0, dp(4));
        mList.addView(view);
        return view;
    }

    private Button button(String label, View.OnClickListener click) {
        Button view = new Button(mActivity);
        view.setText(label);
        view.setAllCaps(false);
        view.setOnClickListener(click);
        mList.addView(view);
        return view;
    }

    private int room() {
        int copies = 0;
        for (String mode : mChosen.values()) if ("copy".equals(mode)) copies++;
        return mPreview.optInt("count") + copies;
    }

    private void render() {
        mList.removeAllViews();
        int limit = mPreview.optInt("limit", 25);
        TextView title = line(mActivity.getString(R.string.blanc_shared_spaces_title));
        title.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 24);
        line(mActivity.getString(R.string.blanc_shared_spaces_explanation));
        line(mActivity.getString(R.string.blanc_shared_spaces_count, String.valueOf(room()), String.valueOf(limit)));
        SpacesController spaces = SpacesController.current();
        if (spaces != null && spaces.library().shownId == null) {
            button(mActivity.getString(R.string.blanc_shared_spaces_save_this_phone), v -> {
                spaces.saveThisPhone(mActivity.getString(R.string.blanc_spaces_this_phone));
                load();
            });
        }
        JSONArray choices = mPreview.optJSONArray("choices");
        for (int i = 0; choices != null && i < choices.length(); i++) {
            JSONObject row = choices.optJSONObject(i);
            if (row != null) row(row);
        }
        if (choices != null && choices.length() > 0) line(mActivity.getString(R.string.blanc_shared_spaces_account_line));
        if (mError != null) line(mError);
        button(mActivity.getString(R.string.blanc_shared_spaces_cancel), v -> mDialog.dismiss());
        Button confirm = button(mActivity.getString(R.string.blanc_shared_spaces_confirm), v -> confirm());
        confirm.setEnabled(room() <= limit);
    }

    private void row(JSONObject row) {
        String id = row.optString("id"), name = row.optString("name");
        boolean shared = row.optBoolean("shared"), rejoin = row.optBoolean("rejoin");
        boolean blocked = !row.isNull("reason") && !rejoin && !shared;
        String tabs = mActivity.getString(R.string.blanc_shared_spaces_tabs, String.valueOf(row.optInt("tabCount")));
        CheckBox box = new CheckBox(mActivity);
        box.setText(name + "\n" + tabs + (shared ? "\n" + mActivity.getString(R.string.blanc_shared_spaces_shared) : ""));
        box.setChecked(shared || mChosen.containsKey(id));
        box.setEnabled(!shared && !blocked);
        box.setOnCheckedChangeListener((v, on) -> {
            if (on) mChosen.put(id, rejoin ? "rejoin" : "copy");
            else mChosen.remove(id);
            render();
        });
        mList.addView(box);
        if (blocked) line(mActivity.getString(R.string.blanc_shared_spaces_full));
        if (!rejoin || !mChosen.containsKey(id)) return;
        RadioGroup modes = new RadioGroup(mActivity);
        modes.setOrientation(LinearLayout.HORIZONTAL);
        for (String mode : new String[] {"rejoin", "copy"}) {
            RadioButton button = new RadioButton(mActivity);
            button.setText("rejoin".equals(mode) ? R.string.blanc_shared_spaces_rejoin : R.string.blanc_shared_spaces_copy);
            modes.addView(button);
            button.setChecked(mode.equals(mChosen.get(id)));
            button.setOnClickListener(v -> mChosen.put(id, mode));
        }
        mList.addView(modes);
    }

    private void confirm() {
        try {
            JSONArray selections = new JSONArray();
            for (Map.Entry<String, String> entry : mChosen.entrySet()) {
                selections.put(new JSONObject().put("id", entry.getKey()).put("mode", entry.getValue()));
            }
            String args = new JSONArray().put(new JSONObject().put("enabled", true).put("selections", selections)).toString();
            SyncedSpaces.ask("spaces.apply", args, value -> {
                if (value != null && value.optBoolean("ok")) {
                    mDialog.dismiss();
                    mDone.run();
                    return;
                }
                String code = value == null ? "" : value.optString("error");
                mError = mActivity.getString("full".equals(code) ? R.string.blanc_shared_spaces_full
                        : R.string.blanc_shared_spaces_unavailable);
                load();
            });
        } catch (JSONException e) {
            mError = mActivity.getString(R.string.blanc_shared_spaces_unavailable);
            render();
        }
    }
}
