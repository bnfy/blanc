// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import android.app.Activity;
import android.app.Dialog;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import org.chromium.blanc.island.R;
import org.chromium.blanc.spaces.BlancSpaces;
import org.chromium.blanc.spaces.SpacesController;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

/**
 * Bring a Space, with the switch off: another device's Space reviewed and copied here as a local
 * Space. The record is read for this sheet only and goes with it. BringSpaceSheet.swift's rows.
 */
@NullMarked
public final class BringSpaceSheet {
    private final Activity mActivity;
    private final JSONObject mRemote;
    private final Dialog mDialog;
    private final LinearLayout mList;
    private @Nullable JSONObject mProjection;
    private boolean mLoading = true;

    public BringSpaceSheet(Activity activity, JSONObject remote) {
        mActivity = activity;
        mRemote = remote;
        mDialog = new Dialog(activity, android.R.style.Theme_DeviceDefault_DayNight);
        mList = new LinearLayout(activity);
        mList.setOrientation(LinearLayout.VERTICAL);
        int pad = Math.round(20 * activity.getResources().getDisplayMetrics().density);
        mList.setPadding(pad, pad, pad, pad);
        ScrollView scroll = new ScrollView(activity);
        scroll.setFitsSystemWindows(true);
        scroll.addView(mList);
        mDialog.setContentView(scroll);
        mDialog.setOnDismissListener(d -> mProjection = null);
    }

    public void show() {
        mDialog.show();
        render();
        SyncedSpaces.ask("spaces.previewSpace", new JSONArray().put(mRemote.optString("id")).toString(), value -> {
            mProjection = value;
            mLoading = false;
            render();
        });
    }

    private TextView line(String text) {
        TextView view = new TextView(mActivity);
        view.setText(text);
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

    private void render() {
        mList.removeAllViews();
        String device = mRemote.optString("device");
        TextView title = line(mRemote.optString("name"));
        title.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 24);
        line(mActivity.getString(R.string.blanc_spaces_on_device, device));
        JSONObject projection = mProjection;
        JSONArray urls = projection == null ? null : projection.optJSONArray("urls");
        if (mLoading) {
            line(mActivity.getString(R.string.blanc_ios_settings_working));
        } else if (urls == null) {
            line(mActivity.getString(R.string.blanc_shared_spaces_unavailable));
        } else {
            int count = urls.length();
            line(mActivity.getResources().getQuantityString(R.plurals.blanc_newtab_groups_count, count, count));
            JSONArray meta = projection.optJSONArray("meta");
            for (int i = 0; i < count; i++) {
                JSONObject info = meta == null ? null : meta.optJSONObject(i);
                String page = info == null ? "" : info.optString("title");
                line(page.isEmpty() ? urls.optString(i) : page);
            }
        }
        Button bring = button(mActivity.getString(R.string.blanc_bring_space_action_android), v -> bring());
        bring.setEnabled(urls != null && urls.length() > 0);
        line(mActivity.getString(R.string.blanc_bring_space_copy_note, device));
        button(mActivity.getString(R.string.blanc_shared_spaces_cancel), v -> mDialog.dismiss());
    }

    private void bring() {
        SpacesController spaces = SpacesController.current();
        JSONObject projection = mProjection;
        if (spaces == null || projection == null) return;
        try {
            spaces.bring(mRemote.optString("name"), mRemote.optString("color"), mRemote.optString("symbol"), set(projection));
        } catch (JSONException e) {
            return;
        }
        mDialog.dismiss();
    }

    /** Fresh tabs and no link, so later changes on the other device don't reach this copy. */
    static BlancSpaces.SavedSet set(JSONObject projection) throws JSONException {
        BlancSpaces.SavedSet set = new BlancSpaces.SavedSet();
        JSONArray groups = projection.getJSONArray("groups");
        for (int i = 0; i < groups.length(); i++) {
            JSONObject group = groups.getJSONObject(i);
            set.groups.add(new BlancSpaces.SavedGroup(group.getString("id"), group.optString("name"),
                    group.isNull("color") ? null : group.optString("color"), group.optBoolean("collapsed")));
        }
        JSONArray urls = projection.getJSONArray("urls"), meta = projection.getJSONArray("meta");
        JSONArray pinned = projection.getJSONArray("pinned"), groupIds = projection.getJSONArray("groupIds");
        for (int i = 0; i < urls.length(); i++) {
            set.tabs.add(new BlancSpaces.SavedTab("r" + i, urls.getString(i), meta.getJSONObject(i).optString("title"),
                    pinned.optBoolean(i), groupIds.isNull(i) ? null : groupIds.optString(i)));
        }
        return set;
    }
}
