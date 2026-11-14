// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.firstrun;

import android.app.Activity;
import android.app.Dialog;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import org.chromium.base.Callback;
import org.chromium.blanc.firstrun.WalkthroughFlow.Step;
import org.chromium.blanc.island.R;
import org.chromium.blanc.settings.SettingsStore;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;

/**
 * The first-minute walkthrough, Blanc for iPhone's WalkthroughSheet.swift: a card over the bottom of
 * the Start Page, each step swapping its content. Pairing leads; it happens on the Sync screen (the
 * same one /sync opens), and a join moves the card to What arrived. Closing the card by any path
 * keeps every choice already made, and the privacy choice on screen ({@link WalkthroughFlow#close}).
 */
@NullMarked
public final class WalkthroughSheet {
    /** What the card needs from the app; tests supply a fake. */
    public interface Host {
        /** The sync runner: SyncBridge in the app. */
        void call(String method, String argsJson, Callback<String> done);

        @Nullable
        Boolean isDefaultBrowser();

        void requestDefaultBrowser();

        /** Opens the Sync screen to pair; {@code onClosed} runs when it closes. */
        void openPairing(Runnable onClosed);

        /** Opens the Shared Spaces chooser; {@code onDone} runs when it closes. */
        void openSharedSpaces(Runnable onDone);

        /** The card closed by any path; this version counts as seen. */
        void finished();
    }

    /** How often What arrived asks whether the first sync pass is done; Continue never waits. */
    private static final long ARRIVING_POLL_MS = 1500;
    private static final int ARRIVING_POLLS = 20;
    /** The card never covers more of the screen than this, so the Start Page shows above it. */
    private static final float MAX_HEIGHT = 0.85f;

    private final Activity mActivity;
    private final Host mHost;
    private final SettingsStore mStore;
    private final WalkthroughFlow mFlow;
    private final Dialog mDialog;
    private final View mRoot;
    private final ScrollView mScroll;
    private final LinearLayout mContent;
    private final LinearLayout mActions;
    private final ImageButton mClose;
    private final Handler mHandler = new Handler(Looper.getMainLooper());
    private @Nullable LinearLayout mCard;
    private final List<View> mNotes = new ArrayList<>();
    private boolean mMeasureUsage;
    private boolean mClosed;
    private int mPolls;

    // What arrived and Share back read these from the runner.
    private JSONObject mStatus = new JSONObject();
    private JSONObject mSpaces = new JSONObject();
    private final List<String[]> mDeviceTabs = new ArrayList<>();
    private int mFavorites = -1;
    private boolean mArrivedLoading;

    public WalkthroughSheet(Activity activity, Host host, SettingsStore store, WalkthroughFlow flow) {
        mActivity = activity;
        mHost = host;
        mStore = store;
        mFlow = flow;
        mMeasureUsage = store.usagePingShown();
        mFlow.defaultBrowserChanged(host.isDefaultBrowser());
        mDialog = new Dialog(activity);
        mDialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        mRoot = LayoutInflater.from(activity).inflate(R.layout.blanc_walkthrough, null);
        mScroll = mRoot.findViewById(R.id.blanc_walkthrough_scroll);
        mContent = mRoot.findViewById(R.id.blanc_walkthrough_content);
        mActions = mRoot.findViewById(R.id.blanc_walkthrough_actions);
        mClose = mRoot.findViewById(R.id.blanc_walkthrough_close);
        mClose.setTag("welcome.close");
        mClose.setOnClickListener(v -> close());
        mDialog.setContentView(mRoot);
        Window window = mDialog.getWindow();
        if (window != null) {
            window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            window.setGravity(Gravity.BOTTOM);
            window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        }
        // Back closes the card as its × does: what was chosen stays chosen.
        mDialog.setOnCancelListener(d -> close());
        mContent.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> fitHeight());
    }

    public void show() {
        mDialog.show();
        render();
    }

    public boolean isShowing() {
        return mDialog.isShowing();
    }

    public @Nullable Step step() {
        return mFlow.current();
    }

    /** Blanc came back to the front: Android may have answered the default-browser request. */
    public void onResumed() {
        if (mClosed || mFlow.current() != Step.DEFAULT_BROWSER) return;
        mFlow.defaultBrowserChanged(mHost.isDefaultBrowser());
        render();
    }

    /** Closes the card by any path (§3.2): the privacy choice on screen is saved if it wasn't. */
    public void close() {
        if (mClosed) return;
        mClosed = true;
        if (mFlow.close()) mStore.setUsagePing(mMeasureUsage);
        mStore.setWalkthroughCompletedVersion(WalkthroughFlow.VERSION);
        mHandler.removeCallbacksAndMessages(null);
        if (mDialog.isShowing()) mDialog.dismiss();
        mHost.finished();
    }

    private void render() {
        Step step = mFlow.current();
        if (step == null) {
            close();
            return;
        }
        mContent.removeAllViews();
        mActions.removeAllViews();
        mNotes.clear();
        mCard = null;
        mClose.setVisibility(step == Step.WELCOME ? View.GONE : View.VISIBLE);
        // Past Welcome a stray tap above the card never closes it.
        mDialog.setCanceledOnTouchOutside(step == Step.WELCOME);
        switch (step) {
            case WELCOME -> welcome();
            case PAIR -> pair();
            case ARRIVED -> arrived();
            case SHARE_BACK -> shareBack();
            case PRIVACY -> privacy();
            case DEFAULT_BROWSER -> defaultBrowser();
        }
        flushNotes();
        mScroll.scrollTo(0, 0);
    }

    // Steps

    private void welcome() {
        mark();
        title(R.string.blanc_ios_welcome_title, true);
        body(text(R.string.blanc_ios_welcome_body), true);
        primary(R.string.blanc_ios_settings_pair_with_blanc, "welcome.pair", () -> {
            mFlow.pairWithBlanc();
            render();
        });
        quiet(R.string.blanc_ios_welcome_browse, "welcome.browse", () -> {
            mFlow.browseWithoutPairing();
            render();
        });
    }

    /** The Sync screen pairs; the card steps aside until it closes, then reads whether it joined. */
    private void pair() {
        mDialog.hide();
        mHost.openPairing(() -> mHost.call("sync.status", "[]", reply -> {
            JSONObject status = value(reply);
            if (status != null && status.optBoolean("enabled")) {
                mStatus = status;
                mFlow.joined();
            } else {
                mFlow.pairingClosed();
            }
            if (mClosed) return;
            mDialog.show();
            render();
        }));
    }

    private void arrived() {
        String handle = mStatus.optString("handle");
        TextView connected = body(mActivity.getString(R.string.blanc_ios_welcome_connected, handle), false);
        connected.setAllCaps(true);
        title(R.string.blanc_ios_welcome_arrived, false);
        if (mStatus.optLong("lastSyncedAt") <= 0) {
            row(text(R.string.blanc_ios_welcome_arriving), null).setTag("welcome.arriving");
            pollArrived();
        } else {
            // A first pass already done when pairing closed: its counts are read once.
            if (!mArrivedLoading) {
                mArrivedLoading = true;
                mHandler.post(this::loadArrived);
            }
            for (String[] device : mDeviceTabs) {
                row(mActivity.getString(R.string.blanc_ios_welcome_tabs_on, device[0]), device[1]);
            }
            if (mFavorites >= 0) row(text(R.string.blanc_pages_nav_bookmarks), String.valueOf(mFavorites));
            row(text(R.string.blanc_ios_welcome_settings), "✓");
            int spaces = mSpaces.optInt("spaces");
            if (spaces > 0) {
                row(text(R.string.blanc_ios_welcome_spaces), String.valueOf(spaces));
            } else {
                note(text(R.string.blanc_ios_welcome_spaces_later));
            }
        }
        primary(R.string.blanc_ios_welcome_continue, "welcome.continue", () -> {
            mFlow.next();
            render();
        });
    }

    /** Asks for the first sync pass's results until they're in; the card shows them as they come. */
    private void pollArrived() {
        if (mPolls++ >= ARRIVING_POLLS) return;
        mHandler.postDelayed(() -> mHost.call("sync.status", "[]", reply -> {
            JSONObject status = value(reply);
            if (status == null || mFlow.current() != Step.ARRIVED) return;
            mStatus = status;
            if (status.optLong("lastSyncedAt") <= 0) {
                pollArrived();
                return;
            }
            loadArrived();
        }), mPolls == 1 ? 0 : ARRIVING_POLL_MS);
    }

    private void loadArrived() {
        mArrivedLoading = true;
        mHost.call("sync.listRemoteDevices", "[]", devices -> mHost.call("bookmarks.listBookmarks", "[]",
                favorites -> mHost.call("spaces.status", "[]", spaces -> {
                    mDeviceTabs.clear();
                    JSONArray list = array(devices);
                    for (int i = 0; list != null && i < list.length(); i++) {
                        JSONObject device = list.optJSONObject(i);
                        JSONArray tabs = device == null ? null : device.optJSONArray("tabs");
                        if (tabs != null && tabs.length() > 0) {
                            mDeviceTabs.add(new String[] {device.optString("name"), String.valueOf(tabs.length())});
                        }
                    }
                    JSONArray saved = array(favorites);
                    mFavorites = saved == null ? -1 : countPages(saved);
                    JSONObject shared = value(spaces);
                    if (shared != null) mSpaces = shared;
                    if (!mClosed && mFlow.current() == Step.ARRIVED) render();
                })));
    }

    private static int countPages(JSONArray favorites) {
        int count = 0;
        for (int i = 0; i < favorites.length(); i++) {
            JSONObject item = favorites.optJSONObject(i);
            if (item != null && !item.optString("url").isEmpty() && !item.optBoolean("deleted")) count++;
        }
        return count;
    }

    private void shareBack() {
        title(R.string.blanc_android_welcome_share_title, false);
        body(text(R.string.blanc_ios_welcome_share_body), false);
        toggle(text(R.string.blanc_ios_settings_share_tabs), mStatus.optBoolean("syncTabs"), "welcome.shareTabs",
                on -> mHost.call("sync.setSyncTabs", "[" + on + "]", reply -> refreshSync()));
        note(text(R.string.blanc_ios_settings_share_tabs_help));
        toggle(text(R.string.blanc_shared_spaces_switch_android), mSpaces.optBoolean("enabled"), "welcome.spaces",
                on -> {
                    if (on) {
                        mHost.openSharedSpaces(this::refreshSync);
                    } else {
                        mHost.call("spaces.apply", "[{\"enabled\":false}]", reply -> refreshSync());
                    }
                });
        note(text(R.string.blanc_shared_spaces_switch_line_android));
        primary(R.string.blanc_ios_welcome_continue, "welcome.continue", () -> {
            mFlow.next();
            render();
        });
        if (mSpaces.length() == 0) refreshSync();
    }

    /** Reads Sync's switches again, so Share back shows what the runner holds. */
    private void refreshSync() {
        mHost.call("sync.status", "[]", status -> mHost.call("spaces.status", "[]", spaces -> {
            JSONObject s = value(status);
            JSONObject shared = value(spaces);
            boolean changed = false;
            if (s != null && s.optBoolean("syncTabs") != mStatus.optBoolean("syncTabs")) changed = true;
            if (s != null) mStatus = s;
            if (shared != null) {
                if (shared.optBoolean("enabled") != mSpaces.optBoolean("enabled") || mSpaces.length() == 0) changed = true;
                mSpaces = shared;
            }
            if (changed && !mClosed && mFlow.current() == Step.SHARE_BACK) render();
        }));
    }

    private void privacy() {
        title(R.string.blanc_ios_welcome_privacy_title, false);
        toggle(text(R.string.blanc_ios_welcome_measure_usage), mMeasureUsage, "welcome.measureUsage",
                on -> mMeasureUsage = on);
        note(text(R.string.blanc_android_welcome_measure_usage_help));
        primary(R.string.blanc_ios_welcome_continue, "welcome.continue", () -> {
            mStore.setUsagePing(mMeasureUsage);
            mFlow.next();
            render();
        });
    }

    private void defaultBrowser() {
        mark();
        boolean isDefault = Boolean.TRUE.equals(mHost.isDefaultBrowser());
        if (isDefault) {
            title(R.string.blanc_ios_default_browser_done, true);
            primary(R.string.blanc_shield_done, "welcome.done", this::finish);
        } else {
            title(R.string.blanc_ios_default_browser_title, true);
            body(text(R.string.blanc_android_default_browser_body), true);
            primary(R.string.blanc_android_default_browser_open, "welcome.setDefault", mHost::requestDefaultBrowser);
            quiet(R.string.blanc_ios_default_browser_not_now, "welcome.notNow", this::finish);
        }
    }

    private void finish() {
        mFlow.next();
        close();
    }

    // Pieces

    private String text(int id) {
        return mActivity.getString(id);
    }

    private void mark() {
        mContent.addView(LayoutInflater.from(mActivity).inflate(R.layout.blanc_walkthrough_mark, mContent, false));
    }

    private void title(int id, boolean centered) {
        TextView view = (TextView) LayoutInflater.from(mActivity).inflate(R.layout.blanc_walkthrough_title, mContent, false);
        view.setText(id);
        view.setGravity(centered ? Gravity.CENTER_HORIZONTAL : Gravity.START);
        view.setAccessibilityHeading(true);
        mContent.addView(view);
    }

    private TextView body(String value, boolean centered) {
        TextView view = (TextView) LayoutInflater.from(mActivity).inflate(R.layout.blanc_walkthrough_body, mContent, false);
        view.setText(value);
        view.setGravity(centered ? Gravity.CENTER_HORIZONTAL : Gravity.START);
        mContent.addView(view);
        return view;
    }

    private LinearLayout card() {
        LinearLayout card = mCard;
        if (card == null) {
            flushNotes();
            card = (LinearLayout) LayoutInflater.from(mActivity).inflate(R.layout.blanc_sync_card, mContent, false);
            mContent.addView(card);
            mCard = card;
        }
        return card;
    }

    private View row(String title, @Nullable String value) {
        View row = LayoutInflater.from(mActivity).inflate(R.layout.blanc_sync_row, card(), false);
        ((TextView) row.findViewById(R.id.blanc_sync_row_title)).setText(title);
        if (value != null) {
            TextView shown = row.findViewById(R.id.blanc_sync_row_value);
            shown.setText(value);
            shown.setVisibility(View.VISIBLE);
        }
        row.setBackground(null);
        card().addView(row);
        return row;
    }

    /** A row with a switch; tapping the row flips it. */
    private void toggle(String label, boolean on, String tag, Callback<Boolean> changed) {
        View row = row(label, null);
        row.setBackgroundResource(android.R.drawable.list_selector_background);
        Switch control = row.findViewById(R.id.blanc_sync_row_switch);
        control.setVisibility(View.VISIBLE);
        control.setContentDescription(label);
        control.setChecked(on);
        control.setTag(tag);
        control.setOnCheckedChangeListener((v, wanted) -> changed.onResult(wanted));
        row.setOnClickListener(v -> control.toggle());
    }

    /** Help under the current card; added once the card is. */
    private void note(String value) {
        TextView view = (TextView) LayoutInflater.from(mActivity).inflate(R.layout.blanc_sync_note, mContent, false);
        view.setText(value);
        mNotes.add(view);
    }

    private void flushNotes() {
        for (View note : mNotes) mContent.addView(note);
        mNotes.clear();
        mCard = null;
    }

    private void primary(int label, String tag, Runnable action) {
        TextView view = (TextView) LayoutInflater.from(mActivity).inflate(R.layout.blanc_walkthrough_primary, mActions, false);
        view.setText(label);
        view.setTag(tag);
        view.setOnClickListener(v -> action.run());
        mActions.addView(view);
    }

    private void quiet(int label, String tag, Runnable action) {
        TextView view = (TextView) LayoutInflater.from(mActivity).inflate(R.layout.blanc_walkthrough_quiet, mActions, false);
        view.setText(label);
        view.setTag(tag);
        view.setOnClickListener(v -> action.run());
        mActions.addView(view);
    }

    /** A scroll only when it has to, so the actions always stay on screen (the iPhone's ViewThatFits). */
    private void fitHeight() {
        int screen = mActivity.getResources().getDisplayMetrics().heightPixels;
        int chrome = mRoot.getPaddingTop() + mRoot.getPaddingBottom() + mActions.getHeight()
                + ((View) mScroll.getParent()).getPaddingTop() + ((View) mScroll.getParent()).getPaddingBottom();
        int max = Math.max(0, (int) (screen * MAX_HEIGHT) - chrome);
        int wanted = mContent.getHeight() > max ? max : ViewGroup.LayoutParams.WRAP_CONTENT;
        ViewGroup.LayoutParams params = mScroll.getLayoutParams();
        if (params.height != wanted) {
            params.height = wanted;
            mScroll.post(() -> mScroll.setLayoutParams(params));
        }
    }

    private static @Nullable JSONObject value(String reply) {
        try {
            JSONObject outer = new JSONObject(reply);
            return outer.optBoolean("ok") ? outer.optJSONObject("value") : null;
        } catch (JSONException e) {
            return null;
        }
    }

    private static @Nullable JSONArray array(String reply) {
        try {
            JSONObject outer = new JSONObject(reply);
            return outer.optBoolean("ok") ? outer.optJSONArray("value") : null;
        } catch (JSONException e) {
            return null;
        }
    }
}
