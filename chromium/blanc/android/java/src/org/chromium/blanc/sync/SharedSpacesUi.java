// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import android.app.Activity;
import android.content.Context;
import android.text.format.DateUtils;
import android.util.TypedValue;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import org.chromium.blanc.island.R;
import org.chromium.blanc.spaces.BlancSpaces.Space;
import org.chromium.blanc.spaces.SpacesCard;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

/** Shared Spaces in the Spaces card: each Space's state, and other devices' Spaces. */
@NullMarked
public final class SharedSpacesUi implements SpacesCard.Marks {
    private static boolean sInstalled;

    private final Context mContext;
    private JSONObject mStatus = new JSONObject();

    private SharedSpacesUi(Context context) {
        mContext = context.getApplicationContext();
    }

    /** Once, when the first Island is drawn. */
    public static void install(Context context) {
        if (sInstalled) return;
        sInstalled = true;
        SyncedSpaces.setRecoveryFormat(context.getString(R.string.blanc_shared_spaces_recovery_name_android, "{name}"));
        SpacesCard.setMarks(new SharedSpacesUi(context));
    }

    @Override
    public @Nullable String mark(Space space) {
        if (space.sharedId == null || !"active".equals(space.sharedLink)) return null;
        JSONObject each = mStatus.optJSONObject("each");
        JSONObject status = each == null ? null : each.optJSONObject(space.id);
        if (status == null) return mContext.getString(R.string.blanc_shared_spaces_shared);
        if (!mStatus.optBoolean("available", true)) return mContext.getString(R.string.blanc_shared_spaces_unavailable_state);
        if (!status.isNull("reason")) return mContext.getString(R.string.blanc_shared_spaces_full_state);
        if (status.optBoolean("failed")) {
            return mContext.getString(R.string.blanc_shared_spaces_not_synced,
                    DateUtils.getRelativeTimeSpanString(status.optLong("lastSyncedAt")));
        }
        if (status.optBoolean("pending")) return mContext.getString(R.string.blanc_shared_spaces_waiting);
        return mContext.getString(R.string.blanc_shared_spaces_shared);
    }

    @Override
    public void addRemote(Activity activity, LinearLayout list, Runnable close) {
        if (!SyncBridge.on()) return;
        SyncedSpaces.ask("spaces.status", "[]", status -> {
            if (status != null) mStatus = status;
        });
        SyncedSpaces.remote(rows -> {
            String device = null;
            for (int i = 0; rows != null && i < rows.length(); i++) {
                JSONObject row = rows.optJSONObject(i);
                if (row == null) continue;
                if (!row.optString("device").equals(device)) {
                    device = row.optString("device");
                    TextView heading = new TextView(activity);
                    heading.setText(activity.getString(R.string.blanc_spaces_on_device, device));
                    heading.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
                    list.addView(heading);
                }
                TextView name = new TextView(activity);
                name.setText(row.optString("name"));
                name.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
                name.setMinHeight(Math.round(48 * activity.getResources().getDisplayMetrics().density));
                name.setGravity(android.view.Gravity.CENTER_VERTICAL);
                name.setOnClickListener(v -> {
                    close.run();
                    new BringSpaceSheet(activity, row).show();
                });
                list.addView(name);
            }
        });
    }
}
