// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.grid;

import android.app.Activity;
import android.app.Dialog;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.content.res.Resources;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.Menu;
import android.view.MotionEvent;
import android.view.VelocityTracker;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.ScrollView;
import android.widget.TextView;

import org.chromium.blanc.island.IslandStyle;
import org.chromium.blanc.island.IslandSwipe;
import org.chromium.blanc.island.R;
import org.chromium.blanc.tabs.BlancTabs;
import org.chromium.blanc.tabs.CardSwipe;
import org.chromium.blanc.tabs.GroupColors;
import org.chromium.blanc.tabs.TabSections;
import org.chromium.blanc.tabs.TabStore;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Blanc for iPhone's tab grid (TabGridView.swift): "Open tabs" and the count with Done; the tabs as
 * cards in two columns (three from 600dp), groups under their headers (a folded group is one
 * "tucked away" row), private tabs as their own section; a card's tap switches to it, its × or a
 * swipe left closes it with Undo for five seconds, and New Tab at the bottom.
 */
@NullMarked
public final class TabGrid extends Dialog {
    /** Page images for the cards (Chromium's TabContentManager on the phone). */
    public interface Thumbnails {
        interface Done {
            void onResult(@Nullable Bitmap image);
        }

        void get(String tabId, int widthPx, Done done);
    }

    /** One drawn card, for tests and TalkBack. */
    public static final class Card {
        public final String id;
        public final String title;
        public final boolean active;
        public final View view;
        public final View close;

        Card(String id, String title, boolean active, View view, View close) {
            this.id = id;
            this.title = title;
            this.active = active;
            this.view = view;
            this.close = close;
        }
    }

    private static final String PAGES = "chrome://blanc/";
    private static final int CLOSE_ACTION = R.id.blanc_grid_close_action;

    private final Activity mActivity;
    private final BlancTabs mTabs;
    private final Thumbnails mThumbnails;
    private final IslandStyle mStyle;
    private final float mDensity;
    private final int mSurface;
    private final TextView mTitle;
    private final TextView mCount;
    private final TextView mDone;
    private final LinearLayout mContent;
    private final TextView mNewTab;
    private final LinearLayout mBanner;
    private final TextView mBannerText;
    private final TextView mUndo;
    private final Handler mHandler = new Handler(Looper.getMainLooper());
    private final Runnable mExpire = this::expireUndo;
    private final List<Card> mCards = new ArrayList<>();
    private final Map<String, View> mGroupHeaders = new HashMap<>();
    private final List<String> mGroupNames = new ArrayList<>();
    private final List<String> mTucked = new ArrayList<>();
    private final List<String> mHeadings = new ArrayList<>();

    private TabGrid(Activity activity, BlancTabs tabs, Thumbnails thumbnails) {
        super(activity, android.R.style.Theme_DeviceDefault_NoActionBar);
        mActivity = activity;
        mTabs = tabs;
        mThumbnails = thumbnails;
        Resources res = activity.getResources();
        mDensity = res.getDisplayMetrics().density;
        boolean dark = (res.getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
        mStyle = IslandStyle.forTab(tabs.privateSelected(), dark);
        mSurface = mStyle.dark ? 0xFF161616 : 0xFFF4F4F2;

        FrameLayout frame = new FrameLayout(activity);
        frame.setBackgroundColor(mSurface);
        LinearLayout root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        frame.addView(root, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        frame.setFitsSystemWindows(true);

        LinearLayout header = new LinearLayout(activity);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(20), dp(12), dp(20), dp(12));
        mTitle = text(activity.getString(R.string.blanc_ios_tabs_open_tabs), 24, mStyle.text);
        mTitle.setTypeface(Typeface.DEFAULT_BOLD);
        header.addView(mTitle);
        mCount = text("", 14, secondary());
        mCount.setPadding(dp(8), 0, 0, 0);
        header.addView(mCount, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        mDone = text(activity.getString(R.string.blanc_ws_editor_done), 16, mStyle.text);
        mDone.setTypeface(Typeface.DEFAULT_BOLD);
        mDone.setGravity(Gravity.CENTER);
        mDone.setMinWidth(dp(44));
        mDone.setMinHeight(dp(44));
        mDone.setOnClickListener(v -> dismiss());
        header.addView(mDone);
        root.addView(header);

        ScrollView scroll = new ScrollView(activity);
        mContent = new LinearLayout(activity);
        mContent.setOrientation(LinearLayout.VERTICAL);
        mContent.setPadding(dp(20), dp(8), dp(20), dp(20));
        scroll.addView(mContent);
        root.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));

        mNewTab = text(activity.getString(R.string.blanc_tab_new), 16, mStyle.text);
        mNewTab.setTypeface(Typeface.DEFAULT_BOLD);
        mNewTab.setGravity(Gravity.CENTER);
        mNewTab.setBackground(rounded(mStyle.raised, 16, mStyle.border, 1));
        mNewTab.setOnClickListener(v -> {
            mTabs.newTab();
            dismiss();
        });
        LinearLayout.LayoutParams newTabLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48));
        newTabLp.setMargins(dp(20), dp(12), dp(20), dp(12));
        root.addView(mNewTab, newTabLp);

        mBanner = new LinearLayout(activity);
        mBanner.setGravity(Gravity.CENTER_VERTICAL);
        mBanner.setPadding(dp(16), dp(6), dp(6), dp(6));
        mBanner.setBackground(rounded(mStyle.text, 22, 0, 0));
        mBannerText = text("", 13, mStyle.raised);
        mBanner.addView(mBannerText);
        mUndo = text(activity.getString(R.string.blanc_menu_undo), 13, mStyle.raised);
        mUndo.setTypeface(Typeface.DEFAULT_BOLD);
        mUndo.setGravity(Gravity.CENTER);
        mUndo.setPadding(dp(14), 0, dp(14), 0);
        mUndo.setMinHeight(dp(44));
        mUndo.setOnClickListener(v -> {
            mHandler.removeCallbacks(mExpire);
            mTabs.undoClose();
            render();
        });
        mBanner.addView(mUndo);
        FrameLayout.LayoutParams bannerLp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        bannerLp.bottomMargin = dp(76);
        mBanner.setVisibility(View.GONE);
        frame.addView(mBanner, bannerLp);

        requestWindowFeature(Window.FEATURE_NO_TITLE);
        setContentView(frame);
        Window window = getWindow();
        if (window != null) {
            window.setBackgroundDrawable(new ColorDrawable(mSurface));
            window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        }
        setOnDismissListener(d -> mHandler.removeCallbacks(mExpire));
        render();
    }

    public static TabGrid show(Activity activity, BlancTabs tabs, Thumbnails thumbnails) {
        TabGrid grid = new TabGrid(activity, tabs, thumbnails);
        grid.show();
        return grid;
    }

    // For tests and the browser.

    public TextView title() {
        return mTitle;
    }

    public TextView count() {
        return mCount;
    }

    public View doneButton() {
        return mDone;
    }

    public View newTabButton() {
        return mNewTab;
    }

    public View undoButton() {
        return mUndo;
    }

    public List<Card> cards() {
        return new ArrayList<>(mCards);
    }

    public List<String> groupNames() {
        return new ArrayList<>(mGroupNames);
    }

    public List<String> tuckedRows() {
        return new ArrayList<>(mTucked);
    }

    public List<String> sectionHeadings() {
        return new ArrayList<>(mHeadings);
    }

    public View groupHeader(String name) {
        View view = mGroupHeaders.get(name);
        if (view == null) throw new IllegalArgumentException(name);
        return view;
    }

    /** The banner's text while Undo lasts; null when it's hidden. */
    public @Nullable String bannerText() {
        return mBanner.getVisibility() == View.VISIBLE ? mBannerText.getText().toString() : null;
    }

    /** Renames a group; returns the refusal to show, or "" when the name was applied. */
    public String renameGroup(String groupId, String name) {
        try {
            mTabs.renameGroup(groupId, name);
        } catch (BlancTabs.GroupNameException e) {
            if (e.reason == BlancTabs.GroupNameException.Reason.BLANK) return mActivity.getString(R.string.blanc_group_menu_name_label);
            return mActivity.getString(R.string.blanc_group_menu_duplicate,
                    org.chromium.blanc.tabs.GroupNames.normalize(name));
        }
        render();
        return "";
    }

    /** A preset by id ("sky"), or no color. */
    public void setGroupColor(String groupId, @Nullable String preset) {
        mTabs.setGroupColor(groupId, preset == null ? null : GroupColors.PRESETS.get(preset));
        render();
    }

    public void ungroup(String groupId) {
        mTabs.ungroup(groupId);
        render();
    }

    public void closeGroup(String groupId) {
        mTabs.closeGroup(groupId);
        render();
        showBanner();
    }

    // Drawing.

    private void render() {
        mContent.removeAllViews();
        mCards.clear();
        mGroupHeaders.clear();
        mGroupNames.clear();
        mTucked.clear();
        mHeadings.clear();
        List<TabStore.Entry> normal = mTabs.entries(false);
        List<TabStore.Entry> privateTabs = mTabs.entries(true);
        mCount.setText(String.valueOf(normal.size() + privateTabs.size()));
        Map<String, TabStore.Entry> byId = new HashMap<>();
        for (TabStore.Entry tab : normal) byId.put(tab.id, tab);
        Map<String, TabStore.Group> groups = new HashMap<>();
        for (TabStore.Group group : mTabs.groups()) groups.put(group.id, group);
        for (TabSections.Section section : mTabs.sections()) {
            List<TabStore.Entry> tabs = new ArrayList<>();
            for (String id : section.tabIds) {
                TabStore.Entry tab = byId.get(id);
                if (tab != null) tabs.add(tab);
            }
            TabStore.Group group = section.groupId == null ? null : groups.get(section.groupId);
            if (group != null) {
                groupHeader(group, tabs.size());
                if (group.collapsed) {
                    tucked(group, tabs.size());
                    continue;
                }
            }
            cards(tabs);
        }
        // Chromium keeps private tabs apart, so they're their own section (A2 spike, decision 4).
        if (!privateTabs.isEmpty()) {
            String heading = mActivity.getString(R.string.blanc_pill_private_chip);
            mHeadings.add(heading);
            TextView view = text(heading, 15, mStyle.text);
            view.setTypeface(Typeface.DEFAULT_BOLD);
            view.setPadding(0, dp(12), 0, dp(12));
            mContent.addView(view);
            cards(privateTabs);
        }
        if (mTabs.undoTitle() == null) mBanner.setVisibility(View.GONE);
    }

    private void groupHeader(TabStore.Group group, int count) {
        mGroupNames.add(group.name);
        LinearLayout header = new LinearLayout(mActivity);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setMinimumHeight(dp(44));
        View dot = new View(mActivity);
        dot.setBackground(rounded(group.color == null ? secondary() : Color.parseColor(group.color), 5, 0, 0));
        LinearLayout.LayoutParams dotLp = new LinearLayout.LayoutParams(dp(10), dp(10));
        dotLp.setMargins(0, 0, dp(10), 0);
        header.addView(dot, dotLp);
        TextView name = text(group.name, 15, mStyle.text);
        name.setTypeface(Typeface.DEFAULT_BOLD);
        header.addView(name);
        TextView tally = text("  " + count, 13, secondary());
        header.addView(tally, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        ImageView fold = icon(group.collapsed ? R.drawable.blanc_palette_chevron_right : R.drawable.blanc_palette_chevron_down);
        header.addView(fold, new LinearLayout.LayoutParams(dp(32), dp(44)));
        ImageButton more = new ImageButton(mActivity);
        more.setImageResource(R.drawable.blanc_grid_more);
        more.setImageTintList(ColorStateList.valueOf(mStyle.text));
        more.setBackground(null);
        more.setContentDescription(mActivity.getString(R.string.blanc_group_menu_options));
        more.setOnClickListener(v -> groupMenu(more, group));
        header.addView(more, new LinearLayout.LayoutParams(dp(44), dp(44)));
        header.setContentDescription(group.name + ", "
                + mActivity.getResources().getQuantityString(R.plurals.blanc_newtab_groups_count, count, count));
        header.setOnClickListener(v -> {
            mTabs.setGroupCollapsed(group.id, !group.collapsed);
            render();
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(12);
        mContent.addView(header, lp);
        mGroupHeaders.put(group.name, header);
    }

    private void tucked(TabStore.Group group, int count) {
        String label = mActivity.getResources().getQuantityString(R.plurals.blanc_tab_groups_tucked, count, count);
        mTucked.add(label);
        TextView row = text(label, 14, secondary());
        row.setMinHeight(dp(44));
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(14), 0, dp(14), 0);
        row.setBackground(rounded(mStyle.raised, 12, mStyle.border, 1));
        row.setOnClickListener(v -> {
            mTabs.setGroupCollapsed(group.id, false);
            render();
        });
        mContent.addView(row);
    }

    private void groupMenu(View anchor, TabStore.Group group) {
        PopupMenu popup = new PopupMenu(mActivity, anchor);
        Menu menu = popup.getMenu();
        menu.add(R.string.blanc_group_menu_rename).setOnMenuItemClickListener(item -> {
            GroupNameDialog.show(mActivity, group.name, name -> renameGroup(group.id, name));
            return true;
        });
        Menu colors = menu.addSubMenu(R.string.blanc_group_menu_color_label);
        colors.add(R.string.blanc_group_menu_color_none).setOnMenuItemClickListener(item -> {
            setGroupColor(group.id, null);
            return true;
        });
        for (String preset : GroupColors.PRESETS.keySet()) {
            colors.add(presetName(preset)).setOnMenuItemClickListener(item -> {
                setGroupColor(group.id, preset);
                return true;
            });
        }
        menu.add(R.string.blanc_group_menu_new_tab).setOnMenuItemClickListener(item -> {
            mTabs.newTabInGroup(group.id);
            dismiss();
            return true;
        });
        menu.add(R.string.blanc_group_menu_ungroup).setOnMenuItemClickListener(item -> {
            ungroup(group.id);
            return true;
        });
        menu.add(R.string.blanc_group_menu_close).setOnMenuItemClickListener(item -> {
            closeGroup(group.id);
            return true;
        });
        popup.show();
    }

    private int presetName(String preset) {
        return switch (preset) {
            case "sage" -> R.string.blanc_spaces_color_sage;
            case "sky" -> R.string.blanc_spaces_color_sky;
            case "iris" -> R.string.blanc_spaces_color_iris;
            case "rose" -> R.string.blanc_spaces_color_rose;
            case "clay" -> R.string.blanc_spaces_color_clay;
            case "sand" -> R.string.blanc_spaces_color_sand;
            case "slate" -> R.string.blanc_spaces_color_slate;
            default -> R.string.blanc_spaces_color_graphite;
        };
    }

    private void cards(List<TabStore.Entry> tabs) {
        int columns = CardSwipe.columns(Math.round(mActivity.getResources().getDisplayMetrics().widthPixels / mDensity));
        for (int start = 0; start < tabs.size(); start += columns) {
            LinearLayout row = new LinearLayout(mActivity);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.topMargin = dp(start == 0 ? 12 : 24);
            mContent.addView(row, lp);
            for (int i = start; i < start + columns; i++) {
                LinearLayout.LayoutParams cell = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
                if (i > start) cell.leftMargin = dp(16);
                // An empty cell keeps the last row's cards their width.
                row.addView(i < tabs.size() ? card(tabs.get(i)) : new View(mActivity), cell);
            }
        }
    }

    private View card(TabStore.Entry tab) {
        boolean blanc = tab.url.startsWith(PAGES);
        String title = tab.title.isEmpty() ? mActivity.getString(R.string.blanc_tab_untitled) : tab.title;
        boolean active = tab.id.equals(mTabs.activeId()) && tab.privateTab == mTabs.privateSelected();
        LinearLayout column = new LinearLayout(mActivity);
        column.setOrientation(LinearLayout.VERTICAL);

        FrameLayout picture = new SquareFrame(mActivity);
        picture.setBackground(rounded(mStyle.raised, 18, active ? mStyle.text : mStyle.border, active ? 2 : 1));
        picture.setClipToOutline(true);
        LinearLayout placeholder = new LinearLayout(mActivity);
        placeholder.setOrientation(LinearLayout.VERTICAL);
        placeholder.setGravity(Gravity.CENTER);
        placeholder.setPadding(dp(20), dp(20), dp(20), dp(20));
        placeholder.addView(icon(blanc ? R.drawable.blanc_island_mark : R.drawable.blanc_palette_globe),
                new LinearLayout.LayoutParams(dp(30), dp(30)));
        TextView words = text(title, 14, secondary());
        words.setMaxLines(2);
        words.setSingleLine(false);
        words.setGravity(Gravity.CENTER);
        words.setPadding(0, dp(12), 0, 0);
        placeholder.addView(words);
        picture.addView(placeholder, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        ImageView image = new ImageView(mActivity);
        image.setScaleType(ImageView.ScaleType.CENTER_CROP);
        picture.addView(image, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        mThumbnails.get(tab.id, mActivity.getResources().getDisplayMetrics().widthPixels / 2, bitmap -> {
            if (bitmap != null) image.setImageBitmap(bitmap);
        });

        ImageButton close = new ImageButton(mActivity);
        close.setImageResource(R.drawable.blanc_palette_close);
        close.setImageTintList(ColorStateList.valueOf(mStyle.text));
        close.setBackground(rounded(mStyle.raised, 14, mStyle.border, 1));
        close.setContentDescription(mActivity.getString(R.string.blanc_ios_tabs_close, title));
        close.setOnClickListener(v -> closeCard(tab.id));
        FrameLayout.LayoutParams closeLp = new FrameLayout.LayoutParams(dp(28), dp(28), Gravity.TOP | Gravity.END);
        closeLp.setMargins(0, dp(8), dp(8), 0);
        picture.addView(close, closeLp);
        column.addView(picture, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView name = text(title, 14, mStyle.text);
        name.setTypeface(Typeface.DEFAULT_BOLD);
        name.setPadding(0, dp(8), 0, 0);
        column.addView(name);
        if (!blanc) column.addView(text(host(tab.url), 12, secondary()));

        picture.setContentDescription(mActivity.getString(R.string.blanc_ios_tabs_switch_to, title));
        picture.setSelected(active);
        picture.setOnClickListener(v -> {
            mTabs.select(tab.id);
            dismiss();
        });
        picture.setOnLongClickListener(v -> {
            cardMenu(picture, tab);
            return true;
        });
        String closeLabel = mActivity.getString(R.string.blanc_settings_gesture_action_close_tab);
        picture.setAccessibilityDelegate(new View.AccessibilityDelegate() {
            @Override
            public void onInitializeAccessibilityNodeInfo(View host, AccessibilityNodeInfo info) {
                super.onInitializeAccessibilityNodeInfo(host, info);
                info.addAction(new AccessibilityNodeInfo.AccessibilityAction(CLOSE_ACTION, closeLabel));
            }

            @Override
            public boolean performAccessibilityAction(View host, int action, @Nullable Bundle args) {
                if (action != CLOSE_ACTION) return super.performAccessibilityAction(host, action, args);
                closeCard(tab.id);
                return true;
            }
        });
        swipeToClose(picture, column, tab.id);
        mCards.add(new Card(tab.id, title, active, picture, close));
        return column;
    }

    private void cardMenu(View anchor, TabStore.Entry tab) {
        PopupMenu popup = new PopupMenu(mActivity, anchor);
        Menu menu = popup.getMenu();
        menu.add(tab.pinned ? R.string.blanc_tab_menu_unpin : R.string.blanc_tab_menu_pin).setOnMenuItemClickListener(item -> {
            mTabs.setPinned(tab.id, !tab.pinned);
            render();
            return true;
        });
        menu.add(tab.muted ? R.string.blanc_tab_menu_unmute : R.string.blanc_tab_menu_mute).setOnMenuItemClickListener(item -> {
            mTabs.setMuted(tab.id, !tab.muted);
            render();
            return true;
        });
        menu.add(R.string.blanc_tab_menu_duplicate).setOnMenuItemClickListener(item -> {
            mTabs.duplicate(tab.id);
            render();
            return true;
        });
        if (!tab.privateTab) {
            Menu groups = menu.addSubMenu(R.string.blanc_tab_menu_move_to_group);
            groups.add(R.string.blanc_tab_menu_new_group).setOnMenuItemClickListener(item -> {
                GroupNameDialog.show(mActivity, "", name -> {
                    try {
                        mTabs.createGroup(name, tab.id);
                    } catch (BlancTabs.GroupNameException e) {
                        return mActivity.getString(R.string.blanc_group_menu_name_label);
                    }
                    render();
                    return "";
                });
                return true;
            });
            for (TabStore.Group group : mTabs.groups()) {
                if (group.id.equals(tab.groupId)) continue;
                groups.add(group.name).setOnMenuItemClickListener(item -> {
                    mTabs.moveToGroup(tab.id, group.id);
                    render();
                    return true;
                });
            }
            if (tab.groupId != null) {
                groups.add(R.string.blanc_tab_menu_remove_from_group).setOnMenuItemClickListener(item -> {
                    mTabs.moveToGroup(tab.id, null);
                    render();
                    return true;
                });
            }
        }
        popup.show();
    }

    /** A card swiped left closes, as the iPhone's SwipeToClose; a drag right springs back. */
    private void swipeToClose(View picture, View column, String tabId) {
        picture.setOnTouchListener(new CardSwipeListener(column, tabId));
    }

    private final class CardSwipeListener implements View.OnTouchListener {
        private final View mColumn;
        private final String mTabId;
        private final boolean mReduceMotion = Settings.Global.getFloat(mActivity.getContentResolver(),
                Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f;
        private float mDownX;
        private float mDownY;
        private boolean mSwiping;
        private @Nullable VelocityTracker mVelocity;

        CardSwipeListener(View column, String tabId) {
            mColumn = column;
            mTabId = tabId;
        }

        @Override
        public boolean onTouch(View v, MotionEvent event) {
            VelocityTracker velocity = mVelocity == null ? VelocityTracker.obtain() : mVelocity;
            mVelocity = velocity;
            velocity.addMovement(event);
            float dx = (event.getRawX() - mDownX) / mDensity;
            float dy = (event.getRawY() - mDownY) / mDensity;
            int action = event.getActionMasked();
            if (action == MotionEvent.ACTION_DOWN) {
                mDownX = event.getRawX();
                mDownY = event.getRawY();
                mSwiping = false;
                return false;
            }
            if (action == MotionEvent.ACTION_MOVE) {
                if (!mSwiping) {
                    if (Math.abs(dx) < 20 || !IslandSwipe.isSideways(dx, dy)) return false;
                    mSwiping = true;
                    v.setPressed(false);
                    if (v.getParent() != null) v.getParent().requestDisallowInterceptTouchEvent(true);
                }
                if (!mReduceMotion) mColumn.setTranslationX(CardSwipe.displayed(dx) * mDensity);
                mColumn.setAlpha((float) CardSwipe.alpha(dx));
                return true;
            }
            if (action != MotionEvent.ACTION_UP && action != MotionEvent.ACTION_CANCEL) return mSwiping;
            mVelocity = null;
            velocity.computeCurrentVelocity(1000);
            float predicted = dx + velocity.getXVelocity() / mDensity * 0.5f;
            velocity.recycle();
            if (!mSwiping) return false;
            mSwiping = false;
            if (action == MotionEvent.ACTION_UP && CardSwipe.closes(dx, predicted)) {
                mColumn.animate().translationX(mReduceMotion ? 0 : -400 * mDensity).alpha(0)
                        .setDuration(200).withEndAction(() -> closeCard(mTabId)).start();
            } else {
                mColumn.animate().translationX(0).alpha(1).setDuration(250).start();
            }
            return true;
        }
    }

    private void closeCard(String tabId) {
        mTabs.close(tabId);
        render();
        showBanner();
    }

    private void showBanner() {
        if (mTabs.undoTitle() == null) {
            mBanner.setVisibility(View.GONE);
            return;
        }
        mBannerText.setText(mTabs.undoIsGroup() ? R.string.blanc_tab_groups_closed_toast : R.string.blanc_tabs_closed_toast);
        mBanner.setVisibility(View.VISIBLE);
        mHandler.removeCallbacks(mExpire);
        mHandler.postDelayed(mExpire, BlancTabs.UNDO_MILLIS);
    }

    private void expireUndo() {
        mTabs.expireUndo();
        mBanner.setVisibility(View.GONE);
    }

    // Helpers.

    /** A frame as tall as it is wide: the card's picture. */
    private static final class SquareFrame extends FrameLayout {
        SquareFrame(Activity activity) {
            super(activity);
        }

        @Override
        protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
            super.onMeasure(widthMeasureSpec, widthMeasureSpec);
        }
    }

    private TextView text(String value, int sp, int color) {
        TextView view = new TextView(mActivity);
        view.setText(value);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        view.setTextColor(color);
        view.setSingleLine(true);
        view.setEllipsize(TextUtils.TruncateAt.END);
        return view;
    }

    private ImageView icon(int drawable) {
        ImageView view = new ImageView(mActivity);
        view.setImageResource(drawable);
        if (drawable != R.drawable.blanc_island_mark) view.setImageTintList(ColorStateList.valueOf(secondary()));
        view.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        return view;
    }

    private GradientDrawable rounded(int fill, float radiusDp, int stroke, float strokeDp) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(fill);
        shape.setCornerRadius(radiusDp * mDensity);
        if (strokeDp > 0) shape.setStroke(Math.max(1, Math.round(strokeDp * mDensity)), stroke);
        return shape;
    }

    private int secondary() {
        return (mStyle.text & 0x00FFFFFF) | 0x99000000;
    }

    private int dp(float value) {
        return Math.round(value * mDensity);
    }

    private static String host(String url) {
        int start = url.indexOf("://");
        if (start < 0) return url;
        int end = url.indexOf('/', start + 3);
        return end < 0 ? url.substring(start + 3) : url.substring(start + 3, end);
    }
}
