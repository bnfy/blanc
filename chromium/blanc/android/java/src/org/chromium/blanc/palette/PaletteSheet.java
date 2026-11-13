// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.palette;

import android.app.Activity;
import android.app.Dialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.content.res.Resources;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.text.Editable;
import android.text.InputType;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.text.format.DateUtils;
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
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONObject;

import org.chromium.base.ContextUtils;
import org.chromium.blanc.address.AddressInput;
import org.chromium.blanc.island.IslandStyle;
import org.chromium.blanc.island.R;
import org.chromium.blanc.settings.SearchEngines;
import org.chromium.blanc.settings.SettingsDestination;
import org.chromium.blanc.settings.SettingsStore;
import org.chromium.blanc.spaces.BlancSpaces;
import org.chromium.blanc.spaces.SpacesCard;
import org.chromium.blanc.spaces.SpacesController;
import org.chromium.blanc.sync.BringSpaceSheet;
import org.chromium.blanc.sync.OtherDevices;
import org.chromium.blanc.sync.SyncedClosed;
import org.chromium.blanc.sync.SyncedSpaces;
import org.chromium.blanc.tabs.BlancTabs;
import org.chromium.blanc.tabs.QuickSwitcher;
import org.chromium.blanc.tabs.SlashCommands;
import org.chromium.blanc.tabs.RecentlyClosed;
import org.chromium.blanc.tabs.TabSections;
import org.chromium.blanc.tabs.TabStore;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Blanc for iPhone's palette (PaletteSheet.swift) as a bottom sheet: the address row, then the
 * open tabs at rest, the slash commands after "/", or the Quick Switcher's results while typing,
 * and a footer with New Tab, Favorites and History. It replaces A1's address sheet.
 */
@NullMarked
public final class PaletteSheet extends Dialog {
    /** What the palette asks of the browser. */
    private final Set<String> mOpenDevices = new HashSet<>();
    private boolean mClosedOpen;

    public interface Callbacks {
        /** Opens an address or search in the current tab. */
        void load(String url);

        /** Opens an address in a new tab. */
        void openTab(String url);

        /** /theme with its argument. */
        void setTheme(String argument);

        List<QuickSwitcher.Page> favorites();

        /** /find: the find bar. */
        void find();

        /** /sync: the Sync sheet. */
        void sync();

        /** /settings, the footer's Settings button and blanc://settings: Settings, at `destination`. */
        void settings(SettingsDestination destination);

        /** What a send said, shown briefly. */
        void notice(String text);

        void blockAds();

        void allowAds();
    }

    public enum Mode {
        TABS,
        SLASH,
        SWITCHER
    }

    public enum RowKind {
        HEADING,
        GROUP,
        TAB,
        TUCKED,
        COMMAND,
        RESULT,
        EMPTY,
        /** The current page's whole address, first at rest (#1445). */
        ADDRESS,
        /** Search for "…" with the chosen engine (#1445). */
        SEARCH
    }

    /** One drawn row, for tests and TalkBack. */
    public static final class Row {
        public final RowKind kind;
        public final String title;
        public final String subtitle;
        public final boolean selected;
        public final View view;

        /** The row's trailing button: a tab's trash, or the address's Copy Link. */
        public final @Nullable View button;

        Row(RowKind kind, String title, String subtitle, boolean selected, View view, @Nullable View button) {
            this.kind = kind;
            this.title = title;
            this.subtitle = subtitle;
            this.selected = selected;
            this.view = view;
            this.button = button;
        }
    }

    private static final String PAGES = "chrome://blanc/";
    private static final int RESTING_HEIGHT_DP = 420;

    private final Activity mActivity;
    private final BlancTabs mTabs;
    private final Callbacks mCallbacks;
    private final IslandStyle mStyle;
    private final float mDensity;
    private final EditText mField;
    private final ImageButton mClear;
    private final ImageButton mCollapse;
    private final LinearLayout mList;
    private final View mNewTab;
    private final ImageButton mFavorites;
    private final ImageButton mHistory;
    private final ImageButton mSettings;
    private final ImageButton mSpace;
    private final List<Row> mRows = new ArrayList<>();
    private final SwipeToCloseRow.Group mSwipes = new SwipeToCloseRow.Group();

    private PaletteSheet(Activity activity, BlancTabs tabs, Callbacks callbacks) {
        super(activity);
        mActivity = activity;
        mTabs = tabs;
        mCallbacks = callbacks;
        Resources res = activity.getResources();
        mDensity = res.getDisplayMetrics().density;
        boolean dark = (res.getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
        mStyle = IslandStyle.forTab(tabs.privateSelected(), dark);

        LinearLayout root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable background = new GradientDrawable();
        background.setColor(mStyle.raised);
        float r = 22 * mDensity;
        background.setCornerRadii(new float[] {r, r, r, r, 0, 0, 0, 0});
        root.setBackground(background);

        LinearLayout addressRow = new LinearLayout(activity);
        addressRow.setGravity(Gravity.CENTER_VERTICAL);
        // Its icons line up with the list's (#1472): the glass over the rows' icons, the caret over
        // Copy Link and Settings.
        addressRow.setPadding(dp(22), dp(8), dp(12), dp(8));
        ImageView search = icon(R.drawable.blanc_palette_search, secondary());
        addressRow.addView(search, new LinearLayout.LayoutParams(dp(24), dp(24)));
        mField = new EditText(activity);
        mField.setSingleLine(true);
        mField.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        // Never the keyboard's full-screen editor, which would hide the list in landscape.
        mField.setImeOptions(EditorInfo.IME_ACTION_GO | EditorInfo.IME_FLAG_NO_EXTRACT_UI
                | EditorInfo.IME_FLAG_NO_FULLSCREEN);
        mField.setHint(R.string.blanc_ios_palette_placeholder);
        mField.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        mField.setTextColor(mStyle.text);
        mField.setHintTextColor(secondary());
        mField.setBackground(null);
        mField.setPadding(dp(8), 0, dp(8), 0);
        mField.setOnEditorActionListener((v, action, event) -> {
            if ((action & EditorInfo.IME_MASK_ACTION) != EditorInfo.IME_ACTION_GO) return false;
            go();
            return true;
        });
        addressRow.addView(mField, new LinearLayout.LayoutParams(0, dp(44), 1));
        mClear = button(R.drawable.blanc_palette_close, R.string.blanc_ios_palette_clear, v -> mField.setText(""));
        addressRow.addView(mClear, new LinearLayout.LayoutParams(dp(44), dp(44)));
        mCollapse = button(R.drawable.blanc_palette_chevron_down, R.string.blanc_ios_island_collapse, v -> dismiss());
        addressRow.addView(mCollapse, new LinearLayout.LayoutParams(dp(44), dp(44)));
        root.addView(addressRow);
        root.addView(hairline(dp(12)));

        ScrollView scroll = new ScrollView(activity);
        mList = new LinearLayout(activity);
        mList.setOrientation(LinearLayout.VERTICAL);
        mList.setPadding(0, dp(4), 0, dp(4));
        scroll.addView(mList);
        root.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));

        root.addView(hairline(0));
        LinearLayout footer = new LinearLayout(activity);
        footer.setGravity(Gravity.CENTER_VERTICAL);
        footer.setPadding(dp(12), dp(6), dp(12), dp(6));
        TextView newTab = new TextView(activity);
        newTab.setText(R.string.blanc_tab_new);
        newTab.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        newTab.setTypeface(Typeface.DEFAULT_BOLD);
        newTab.setTextColor(mStyle.raised);
        newTab.setGravity(Gravity.CENTER);
        newTab.setPadding(dp(14), 0, dp(14), 0);
        GradientDrawable capsule = new GradientDrawable();
        capsule.setColor(mStyle.text);
        capsule.setCornerRadius(dp(18));
        newTab.setBackground(capsule);
        newTab.setOnClickListener(v -> {
            mTabs.newTab();
            dismiss();
        });
        mNewTab = newTab;
        footer.addView(newTab, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(36)));
        footer.addView(new View(activity), new LinearLayout.LayoutParams(0, 1, 1));
        // The current Space's mark. The closed Island has no room for it, so it lives here.
        mSpace = button(R.drawable.blanc_spaces_glyph, R.string.blanc_spaces_menu_label, v -> {});
        footer.addView(mSpace, new LinearLayout.LayoutParams(dp(44), dp(44)));
        mFavorites = button(R.drawable.blanc_palette_bookmark, R.string.blanc_pages_nav_bookmarks,
                v -> openTab(PAGES + "bookmarks.html"));
        footer.addView(mFavorites, new LinearLayout.LayoutParams(dp(44), dp(44)));
        mHistory = button(R.drawable.blanc_palette_history, R.string.blanc_pages_nav_history,
                v -> openTab(PAGES + "history.html"));
        footer.addView(mHistory, new LinearLayout.LayoutParams(dp(44), dp(44)));
        mSettings = button(R.drawable.blanc_palette_settings, R.string.blanc_pages_nav_settings, v -> {
            dismiss();
            mCallbacks.settings(SettingsDestination.ROOT);
        });
        footer.addView(mSettings, new LinearLayout.LayoutParams(dp(44), dp(44)));
        root.addView(footer);

        mField.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {}

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {}

            @Override
            public void afterTextChanged(Editable s) {
                render();
            }
        });

        // The window fills the space above the keyboard; the sheet sits at its bottom, at most
        // RESTING_HEIGHT_DP tall, and its list gives up height first, so the field and the footer
        // stay above the keyboard on any screen. A tap above the sheet closes it.
        int resting = dp(RESTING_HEIGHT_DP);
        FrameLayout frame = new FrameLayout(activity) {
            @Override
            protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
                int height = Math.min(resting, MeasureSpec.getSize(heightMeasureSpec) - getPaddingBottom());
                ViewGroup.LayoutParams lp = root.getLayoutParams();
                if (lp.height != height) lp.height = height;
                super.onMeasure(widthMeasureSpec, heightMeasureSpec);
            }
        };
        frame.addView(root, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, resting, Gravity.BOTTOM));
        frame.setOnClickListener(v -> dismiss());
        // Edge to edge (Android 15 and later), the window isn't resized for the keyboard, so the
        // sheet keeps clear of it, and of the navigation bar, itself.
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
        root.setClickable(true);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        setContentView(frame);
        Window window = getWindow();
        if (window != null) {
            window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            window.setGravity(Gravity.BOTTOM);
            window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
            window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
                    | WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
        }
        render();
        bindSpaceMark();
    }

    public static PaletteSheet show(Activity activity, BlancTabs tabs, Callbacks callbacks) {
        PaletteSheet sheet = new PaletteSheet(activity, tabs, callbacks);
        sheet.show();
        sheet.mField.requestFocus();
        return sheet;
    }

    public EditText field() {
        return mField;
    }

    public View clearButton() {
        return mClear;
    }

    public View collapseButton() {
        return mCollapse;
    }

    public View newTabButton() {
        return mNewTab;
    }

    public View favoritesButton() {
        return mFavorites;
    }

    public View historyButton() {
        return mHistory;
    }

    public View settingsButton() {
        return mSettings;
    }

    public View spaceButton() {
        return mSpace;
    }

    /** Once a Space exists and never on a private tab, as the iPhone's mark. Tapping it opens the Spaces menu. */
    private void bindSpaceMark() {
        SpacesController spaces = SpacesController.current();
        if (spaces == null || spaces.library().spaces.isEmpty() || mTabs.privateSelected()) {
            mSpace.setVisibility(View.GONE);
            return;
        }
        mSpace.setVisibility(View.VISIBLE);
        SpacesCard.bindMark(mActivity, mSpace, spaces.mark(), mStyle.text);
        mSpace.setOnClickListener(v -> {
            dismiss();
            SpacesCard.open(mActivity);
        });
    }

    public List<Row> rows() {
        return new ArrayList<>(mRows);
    }

    public Mode mode() {
        String input = mField.getText().toString();
        if (input.isEmpty()) return Mode.TABS;
        if (input.startsWith("/")) return Mode.SLASH;
        return Mode.SWITCHER;
    }

    // Drawing.

    private void render() {
        mList.removeAllViews();
        mRows.clear();
        mClear.setVisibility(mField.getText().length() == 0 ? View.GONE : View.VISIBLE);
        switch (mode()) {
            case TABS -> renderTabs();
            case SLASH -> renderCommands();
            case SWITCHER -> renderResults();
        }
    }

    private void renderTabs() {
        List<TabStore.Entry> normal = mTabs.entries(false);
        Map<String, TabStore.Entry> byId = new HashMap<>();
        for (TabStore.Entry tab : normal) byId.put(tab.id, tab);
        Map<String, TabStore.Group> groups = new HashMap<>();
        for (TabStore.Group group : mTabs.groups()) groups.put(group.id, group);
        currentAddress();
        heading(mActivity.getString(R.string.blanc_ios_tabs_open_tabs), normal.size());
        for (TabSections.Section section : mTabs.displaySections()) {
            TabStore.Group group = section.groupId == null ? null : groups.get(section.groupId);
            List<TabStore.Entry> tabs = new ArrayList<>();
            for (String id : section.tabIds) {
                TabStore.Entry tab = byId.get(id);
                if (tab != null) tabs.add(tab);
            }
            if (group != null) {
                groupRow(group, section.tabIds.size(), !group.collapsed && tabs.isEmpty());
                if (group.collapsed) {
                    tuckedRow(group, section.tabIds.size());
                    continue;
                }
            }
            for (int i = 0; i < tabs.size(); i++) tabRow(tabs.get(i), group, i == tabs.size() - 1);
        }
        // Chromium keeps private tabs apart, so they're their own section (A2 spike, decision 4).
        List<TabStore.Entry> privateTabs = mTabs.entries(true);
        if (!privateTabs.isEmpty()) {
            heading(mActivity.getString(R.string.blanc_pill_private_chip), privateTabs.size());
            for (TabStore.Entry tab : privateTabs) tabRow(tab, null, false);
        }
        renderClosed();
        renderSent();
        renderDevices();
    }

    /** Folded each time the palette opens, as the iPhone's and desktop's bands are. */
    private void renderClosed() {
        List<RecentlyClosed.Row> rows = SyncedClosed.band();
        if (rows.isEmpty()) return;
        LinearLayout head = new LinearLayout(mActivity);
        head.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = text(mActivity.getString(R.string.blanc_closed_header) + "  " + rows.size(), 11, secondary());
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setPadding(dp(22), dp(8), dp(22), dp(8));
        title.setMinHeight(dp(32));
        title.setContentDescription(mActivity.getString(R.string.blanc_closed_header) + ", " + rows.size() + ", "
                + mActivity.getString(mClosedOpen ? R.string.blanc_closed_fold : R.string.blanc_closed_unfold));
        title.setOnClickListener(v -> {
            mClosedOpen = !mClosedOpen;
            render();
        });
        head.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        if (mClosedOpen) {
            TextView clear = text(mActivity.getString(R.string.blanc_closed_clear), 11, secondary());
            clear.setTypeface(Typeface.DEFAULT_BOLD);
            clear.setPadding(dp(12), dp(8), dp(22), dp(8));
            clear.setContentDescription(mActivity.getString(R.string.blanc_closed_clear_all));
            clear.setOnClickListener(v -> {
                SyncedClosed.clear();
                render();
            });
            head.addView(clear);
        }
        mList.addView(head);
        if (!mClosedOpen) return;
        for (RecentlyClosed.Row item : rows) {
            String label = item.title.isEmpty() ? item.url : item.title;
            String subtitle = item.fromId != null
                    ? mActivity.getString(R.string.blanc_shared_spaces_closed_on,
                            item.fromName == null ? item.fromId : item.fromName)
                    : host(item.url);
            LinearLayout line = new LinearLayout(mActivity);
            line.setGravity(Gravity.CENTER_VERTICAL);
            View main = row(R.drawable.blanc_palette_history, label, subtitle, false, v -> {
                SyncedClosed.forget(item);
                mTabs.reopen(item.url);
                dismiss();
            });
            mList.removeView(main);
            line.addView(main, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
            ImageButton forget = button(R.drawable.blanc_palette_close, R.string.blanc_closed_forget, v -> {
                SyncedClosed.forget(item);
                render();
            });
            line.addView(forget, new LinearLayout.LayoutParams(dp(44), dp(48)));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.setMargins(dp(12), 0, dp(12), 0);
            mList.addView(line, lp);
        }
    }

    private void renderSent() {
        List<OtherDevices.Sent> sent = OtherDevices.sent();
        if (sent.isEmpty()) return;
        heading(mActivity.getString(R.string.blanc_sends_section), sent.size());
        for (OtherDevices.Sent item : sent) {
            CharSequence ago = DateUtils.getRelativeTimeSpanString(item.sentAt);
            String subtitle = mActivity.getString(R.string.blanc_sends_from, item.from, ago);
            String title = item.title.isEmpty() ? item.url : item.title;
            View main = row(R.drawable.blanc_palette_sent, title, subtitle, false, v -> {
                mCallbacks.openTab(item.url);
                OtherDevices.hide(item.id);
                dismiss();
            });
            swipeable(main, mActivity.getString(R.string.blanc_sends_dismiss), null, false, () -> {
                OtherDevices.hide(item.id);
                render();
            });
        }
    }

    private void renderDevices() {
        List<OtherDevices.Device> devices = OtherDevices.devices();
        if (devices.isEmpty()) return;
        TextView heading = new TextView(mActivity);
        heading.setText(R.string.blanc_footer_devices);
        heading.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        heading.setTypeface(Typeface.DEFAULT_BOLD);
        heading.setTextColor(secondary());
        heading.setPadding(dp(22), dp(8), dp(22), dp(4));
        mList.addView(heading);
        for (OtherDevices.Device device : devices) {
            boolean open = mOpenDevices.contains(device.name);
            // A cloud marks a device's tabs as synced, not open here (#1470); the arrow sits under
            // the caret and Copy Link.
            View head = row(R.drawable.blanc_palette_cloud, device.name + " (" + device.tabs.size() + ")", "", false, v -> {
                if (!mOpenDevices.remove(device.name)) mOpenDevices.add(device.name);
                render();
            });
            ((LinearLayout) head).addView(icon(open ? R.drawable.blanc_palette_chevron_down : R.drawable.blanc_palette_chevron_right,
                    secondary()), new LinearLayout.LayoutParams(dp(24), dp(24)));
            inset(head, 12, 0);
            if (!open) continue;
            // As tight as the open tabs above (#1467), one step in under the device.
            for (OtherDevices.Page tab : device.tabs) {
                View page = row(R.drawable.blanc_palette_globe, tab.title.isEmpty() ? tab.url : tab.title, tab.url, false, v -> {
                    mCallbacks.openTab(tab.url);
                    dismiss();
                });
                inset(page, 12 + 24, 2);
            }
        }
    }

    private void renderCommands() {
        List<SlashCommands.Kind> kinds = SlashCommands.matching(mField.getText().toString());
        if (kinds.isEmpty()) {
            empty(R.string.blanc_ios_palette_no_command);
            return;
        }
        for (SlashCommands.Kind kind : kinds) {
            String command = SlashCommands.command(kind);
            String hint = mActivity.getString(hint(kind));
            View view = row(R.drawable.blanc_palette_command, command, hint, false,
                    v -> run(kind, argumentOf(mField.getText().toString())));
            mRows.add(new Row(RowKind.COMMAND, command, hint, false, view, null));
        }
    }

    /**
     * The typed-text list. Its first row is always what Go does (#1445): a strong match, or
     * Search for "…" with the chosen engine, then the rest of the matches.
     */
    private void renderResults() {
        String query = AddressInput.trim(mField.getText().toString());
        List<QuickSwitcher.Result> results = search(query);
        boolean goesToMatch = QuickSwitcher.goTarget(query, results) != null;
        boolean isSearch = !query.isEmpty() && AddressInput.interpret(query).kind == AddressInput.Kind.SEARCH;
        if (goesToMatch) resultRows(results);
        if (isSearch) searchRow(query);
        if (!goesToMatch) resultRows(results);
        if (mRows.isEmpty()) empty(R.string.blanc_ios_palette_no_matches);
    }

    private void resultRows(List<QuickSwitcher.Result> results) {
        for (QuickSwitcher.Result result : results) {
            boolean remote = result.id.startsWith("remoteSpace:");
            boolean group = remote || result.id.startsWith("group:") || result.id.startsWith("set:");
            String subtitle = remote
                    ? mActivity.getString(R.string.blanc_spaces_on_device, result.subtitle)
                    : group ? mActivity.getResources().getQuantityString(R.plurals.blanc_newtab_groups_count, result.count, result.count)
                    : result.subtitle;
            View view = row(group ? R.drawable.blanc_palette_chevron_right : R.drawable.blanc_palette_globe,
                    result.title, subtitle, false, v -> {
                        open(result);
                        dismiss();
                    });
            mRows.add(new Row(RowKind.RESULT, result.title, subtitle, false, view, null));
        }
    }

    private void searchRow(String query) {
        SettingsStore settings = new SettingsStore(ContextUtils.getAppSharedPreferences());
        String title = mActivity.getString(R.string.blanc_context_menu_search_for, query);
        String engine = SearchEngines.label(settings.searchEngine());
        View view = row(R.drawable.blanc_palette_search, title, engine, false, v -> {
            mCallbacks.load(AddressInput.searchUrl(query, settings.searchTemplate()));
            dismiss();
        });
        mRows.add(new Row(RowKind.SEARCH, title, engine, false, view, null));
    }

    /** /space: bare, the menu; a name, that set, This Phone too; a new name, the editor. */
    private void space(String name) {
        SpacesController spaces = SpacesController.current();
        if (spaces == null) return;
        if (name.isEmpty()) {
            SpacesCard.open(mActivity);
        } else if (name.equalsIgnoreCase(mActivity.getString(R.string.blanc_spaces_this_phone))) {
            spaces.show(null);
        } else {
            BlancSpaces.Space space = spaces.library().named(name);
            if (space != null) spaces.show(space.id);
            else SpacesCard.create(mActivity, name, null);
        }
    }

    /** /send: the current page to the device with that name, in any case. */
    private void sendActive(String name) {
        OtherDevices.Target target = OtherDevices.target(name);
        String active = mTabs.activeId();
        TabStore.Entry current = null;
        for (TabStore.Entry tab : mTabs.entries(false)) if (tab.id.equals(active)) current = tab;
        if (OtherDevices.targets().isEmpty()) {
            mCallbacks.notice(mActivity.getString(R.string.blanc_sends_none));
            return;
        }
        if (target == null) {
            mCallbacks.notice(mActivity.getString(R.string.blanc_sends_no_match, name));
            return;
        }
        if (current == null || mTabs.privateSelected()) return;
        OtherDevices.send(current.url, current.title, target,
                status -> mCallbacks.notice(sendResult(mActivity, status, target.name)));
    }

    /** "Sent", never "delivered". */
    public static String sendResult(Activity activity, String status, String device) {
        if ("sent".equals(status)) return activity.getString(R.string.blanc_sends_sent, device);
        return activity.getString("unavailable".equals(status) ? R.string.blanc_sends_unavailable : R.string.blanc_sends_failed);
    }

    private List<QuickSwitcher.Result> search(String query) {
        List<QuickSwitcher.Tab> candidates = new ArrayList<>();
        for (boolean privateTabs : new boolean[] {false, true}) {
            for (TabStore.Entry tab : mTabs.entries(privateTabs)) {
                candidates.add(new QuickSwitcher.Tab(tab.id, tab.title, tab.url, tab.groupId));
            }
        }
        List<QuickSwitcher.Group> groups = new ArrayList<>();
        for (TabStore.Group group : mTabs.groups()) groups.add(new QuickSwitcher.Group(group.id, group.name));
        // History joins the switcher with Android's history search (after A2).
        List<QuickSwitcher.Page> pages = new ArrayList<>(mCallbacks.favorites());
        for (OtherDevices.Device device : OtherDevices.devices()) {
            for (OtherDevices.Page tab : device.tabs) pages.add(new QuickSwitcher.Page(tab.url, tab.title, tab.url));
        }
        List<QuickSwitcher.RemoteSpace> remote = new ArrayList<>();
        for (JSONObject row : SyncedSpaces.remoteSpaces()) {
            remote.add(new QuickSwitcher.RemoteSpace(row.optString("id"), row.optString("name"), row.optString("device")));
        }
        return QuickSwitcher.search(query, candidates, pages, List.of(), groups, switcherSets(), remote);
    }

    /** Every Space but the shown one, and This Phone while a Space is shown. */
    private List<QuickSwitcher.TabSet> switcherSets() {
        List<QuickSwitcher.TabSet> sets = new ArrayList<>();
        SpacesController spaces = SpacesController.current();
        if (spaces == null) return sets;
        String shown = spaces.library().shownId;
        if (shown != null) {
            sets.add(new QuickSwitcher.TabSet(
                    "", mActivity.getString(R.string.blanc_spaces_this_phone), spaces.tabCount(null)));
        }
        for (BlancSpaces.Space space : spaces.library().spaces) {
            if (!space.id.equals(shown)) sets.add(new QuickSwitcher.TabSet(space.id, space.name, spaces.tabCount(space.id)));
        }
        return sets;
    }

    private void heading(String title, int count) {
        TextView view = new TextView(mActivity);
        view.setText(title + "  " + count);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        view.setTypeface(Typeface.DEFAULT_BOLD);
        view.setTextColor(secondary());
        view.setPadding(dp(22), dp(8), dp(22), dp(4));
        mList.addView(view);
        mRows.add(new Row(RowKind.HEADING, title, String.valueOf(count), false, view, null));
    }

    /**
     * A group's header opens its block: the header and its tabs share one tint, as desktop's ⌘L
     * panel draws a group, so loose tabs after it never read as its members. The dot sits in the
     * tabs' icon column and the chevron in their trash's.
     */
    private void groupRow(TabStore.Group group, int count, boolean closesBlock) {
        LinearLayout view = new LinearLayout(mActivity);
        view.setGravity(Gravity.CENTER_VERTICAL);
        view.setMinimumHeight(dp(36));
        view.setPadding(dp(10), dp(2), dp(0), closesBlock ? dp(2) : 0);
        view.setBackground(wash(group, true, closesBlock));
        View dot = new View(mActivity);
        GradientDrawable disc = new GradientDrawable();
        disc.setShape(GradientDrawable.OVAL);
        disc.setColor(group.color == null ? secondary() : Color.parseColor(group.color));
        dot.setBackground(disc);
        LinearLayout.LayoutParams dotLp = new LinearLayout.LayoutParams(dp(8), dp(8));
        dotLp.setMargins(dp(12), 0, dp(18), 0);
        view.addView(dot, dotLp);
        TextView name = text(group.name, 13, mStyle.text);
        name.setTypeface(Typeface.DEFAULT_BOLD);
        view.addView(name);
        TextView tally = text("  " + count, 12, secondary());
        view.addView(tally, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        view.addView(icon(group.collapsed ? R.drawable.blanc_palette_chevron_right : R.drawable.blanc_palette_chevron_down,
                secondary()), new LinearLayout.LayoutParams(dp(44), dp(20)));
        String action = mActivity.getString(group.collapsed ? R.string.blanc_group_unfold : R.string.blanc_group_fold);
        // TalkBack hears the name, the count and what a tap does, as the iPhone's label and hint.
        view.setContentDescription(group.name + ", "
                + mActivity.getResources().getQuantityString(R.plurals.blanc_newtab_groups_count, count, count) + ", " + action);
        // Instant, as the iPhone's (#1469): the header and its rows change in one frame.
        view.setOnClickListener(v -> {
            mTabs.setGroupCollapsed(group.id, !group.collapsed);
            render();
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(dp(12), dp(4), dp(12), closesBlock ? dp(2) : 0);
        mList.addView(view, lp);
        mRows.add(new Row(RowKind.GROUP, group.name, String.valueOf(count), false, view, null));
    }

    /** A folded group's one row, as desktop's panel: "N tabs tucked away"; a tap unfolds it. */
    private void tuckedRow(TabStore.Group group, int count) {
        String label = mActivity.getResources().getQuantityString(R.plurals.blanc_tab_groups_tucked, count, count);
        TextView view = text(label, 13, secondary());
        view.setPadding(dp(26), dp(8), dp(10), dp(10));
        view.setOnClickListener(v -> {
            mTabs.setGroupCollapsed(group.id, false);
            render();
        });
        // Inside the group's block, closing it: it stands for the group's tabs.
        view.setBackground(wash(group, false, true));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(dp(12), 0, dp(12), dp(4));
        mList.addView(view, lp);
        mRows.add(new Row(RowKind.TUCKED, label, "", false, view, null));
    }

    /**
     * A tab's row; in a group, `last` closes the group's block under it. A swipe to the left shows
     * a trash button and a full swipe closes the tab (#1463, #1466): no × to miss and open it
     * instead. The current tab is its row's highlight, without a dot (#1466).
     */
    private void tabRow(TabStore.Entry tab, TabStore.@Nullable Group group, boolean last) {
        boolean blanc = tab.url.startsWith(PAGES);
        String title = tab.title.isEmpty() ? mActivity.getString(R.string.blanc_tab_untitled) : tab.title;
        String subtitle = blanc ? "Blanc" : host(tab.url);
        boolean selected = tab.id.equals(mTabs.activeId()) && tab.privateTab == mTabs.privateSelected();
        View main = row(blanc ? R.drawable.blanc_island_mark : R.drawable.blanc_palette_globe, title, subtitle, selected, v -> {
            mTabs.select(tab.id);
            dismiss();
        });
        if (selected) {
            GradientDrawable selection = new GradientDrawable();
            selection.setColor((mStyle.text & 0x00FFFFFF) | 0x14000000);
            selection.setCornerRadius(dp(10));
            main.setBackground(selection);
        }
        SwipeToCloseRow swipe = swipeable(main, mActivity.getString(R.string.blanc_ios_tabs_close, title), group, last, () -> {
            mTabs.close(tab.id);
            render();
        });
        mRows.add(new Row(RowKind.TAB, title, subtitle, selected, main, swipe.trash()));
    }

    /**
     * Moves a drawn row into a {@link SwipeToCloseRow} that closes it with `onClose`. In a group,
     * the group's tint stays under the sliding row, and `last` rounds the block's bottom.
     */
    private SwipeToCloseRow swipeable(View main, String label, TabStore.@Nullable Group group, boolean last,
            Runnable onClose) {
        int index = mList.indexOfChild(main);
        mList.removeView(main);
        SwipeToCloseRow swipe = new SwipeToCloseRow(mActivity, main, label, onClose, mSwipes);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        if (group == null) {
            lp.setMargins(dp(12), dp(2), dp(12), dp(2));
        } else {
            // Inside a block, 4 on every side: rows inset 16 against the block's 12.
            lp.setMargins(dp(12), 0, dp(12), last ? dp(4) : 0);
            swipe.setPadding(dp(4), dp(2), dp(4), last ? dp(4) : dp(2));
            swipe.setBackground(wash(group, false, last));
        }
        mList.addView(swipe, index, lp);
        return swipe;
    }

    /** A row drawn straight into the list, `start` dp from the sheet's edges and `vertical` dp apart. */
    private void inset(View view, int start, int vertical) {
        LinearLayout.LayoutParams lp = (LinearLayout.LayoutParams) view.getLayoutParams();
        lp.setMargins(dp(start), dp(vertical), dp(12), dp(vertical));
        view.setLayoutParams(lp);
    }

    /**
     * The current page's whole address, which the Island shows only the site of (#1445): a tap
     * puts it in the field to edit, and the button copies it. Only for web pages.
     */
    private void currentAddress() {
        String active = mTabs.activeId();
        TabStore.Entry current = null;
        for (TabStore.Entry tab : mTabs.entries(mTabs.privateSelected())) if (tab.id.equals(active)) current = tab;
        if (current == null || !(current.url.startsWith("https://") || current.url.startsWith("http://"))) return;
        String address = current.url;
        LinearLayout line = new LinearLayout(mActivity);
        line.setGravity(Gravity.CENTER_VERTICAL);
        line.setMinimumHeight(dp(44));
        line.setPadding(dp(10), 0, 0, 0);
        line.addView(icon(R.drawable.blanc_palette_link, secondary()), new LinearLayout.LayoutParams(dp(24), dp(24)));
        TextView text = text(address, 13, secondary());
        text.setEllipsize(TextUtils.TruncateAt.MIDDLE);
        text.setPadding(dp(10), 0, dp(4), 0);
        line.addView(text, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        line.setContentDescription(mActivity.getString(R.string.blanc_ios_palette_edit_address) + ", " + address);
        line.setOnClickListener(v -> {
            mField.setText(address);
            mField.setSelection(address.length());
            mField.requestFocus();
        });
        ImageButton copy = button(R.drawable.blanc_palette_copy, R.string.blanc_tab_menu_copy_link, v -> {
            ClipboardManager clipboard = mActivity.getSystemService(ClipboardManager.class);
            if (clipboard != null) clipboard.setPrimaryClip(ClipData.newPlainText(address, address));
            mCallbacks.notice(mActivity.getString(R.string.blanc_pill_notice_link_copied));
            dismiss();
        });
        copy.setImageTintList(ColorStateList.valueOf(secondary()));
        line.addView(copy, new LinearLayout.LayoutParams(dp(44), dp(44)));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(dp(12), 0, dp(12), 0);
        mList.addView(line, lp);
        mRows.add(new Row(RowKind.ADDRESS, address, "", false, line, copy));
    }

    private void empty(int message) {
        TextView view = text(mActivity.getString(message), 15, secondary());
        view.setPadding(dp(22), dp(14), dp(22), dp(14));
        mList.addView(view);
        mRows.add(new Row(RowKind.EMPTY, view.getText().toString(), "", false, view, null));
    }

    /** An icon, a title and a subtitle, at least 48 tall; added to the list. */
    private View row(int icon, String title, String subtitle, boolean selected, View.OnClickListener click) {
        LinearLayout view = new LinearLayout(mActivity);
        view.setGravity(Gravity.CENTER_VERTICAL);
        view.setMinimumHeight(dp(48));
        view.setPadding(dp(10), 0, dp(10), 0);
        view.addView(icon(icon, secondary()), new LinearLayout.LayoutParams(dp(24), dp(24)));
        LinearLayout words = new LinearLayout(mActivity);
        words.setOrientation(LinearLayout.VERTICAL);
        words.setPadding(dp(10), 0, 0, 0);
        words.addView(text(title, 15, mStyle.text));
        if (!subtitle.isEmpty()) words.addView(text(subtitle, 11, secondary()));
        view.addView(words, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        view.setSelected(selected);
        view.setOnClickListener(click);
        view.setContentDescription(subtitle.isEmpty() ? title : title + ", " + subtitle);
        // 12 from the sheet's edges, so every row's icon sits in one column (#1472).
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(dp(12), 0, dp(12), 0);
        mList.addView(view, lp);
        return view;
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

    private ImageView icon(int drawable, int tint) {
        ImageView view = new ImageView(mActivity);
        view.setImageResource(drawable);
        if (drawable != R.drawable.blanc_island_mark) view.setImageTintList(ColorStateList.valueOf(tint));
        view.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        return view;
    }

    private ImageButton button(int drawable, int label, View.OnClickListener click) {
        ImageButton view = new ImageButton(mActivity);
        view.setImageResource(drawable);
        view.setImageTintList(ColorStateList.valueOf(mStyle.text));
        view.setBackground(null);
        if (label != 0) view.setContentDescription(mActivity.getString(label));
        view.setOnClickListener(click);
        return view;
    }

    private View hairline(int inset) {
        View view = new View(mActivity);
        view.setBackgroundColor(mStyle.border);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                Math.max(1, Math.round(0.5f * mDensity)));
        lp.setMargins(inset, 0, inset, 0);
        view.setLayoutParams(lp);
        return view;
    }

    /** A group's block: its color's wash, or the ink's, as the iPhone tints it. */
    private GradientDrawable wash(TabStore.Group group, boolean top, boolean bottom) {
        GradientDrawable wash = new GradientDrawable();
        int alpha = mStyle.dark ? 0x29 : 0x1A;
        int base = group.color == null ? mStyle.text : Color.parseColor(group.color);
        if (group.color == null) alpha = mStyle.dark ? 0x12 : 0x09;
        wash.setColor((base & 0x00FFFFFF) | (alpha << 24));
        // One block: rounded where it begins and ends, square where its rows meet.
        float t = top ? dp(10) : 0;
        float b = bottom ? dp(10) : 0;
        wash.setCornerRadii(new float[] {t, t, t, t, b, b, b, b});
        return wash;
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

    // Acting.

    private void go() {
        String input = AddressInput.trim(mField.getText().toString());
        if (input.isEmpty()) return;
        if (input.startsWith("/")) {
            SlashCommands.Parsed parsed = SlashCommands.parse(input);
            if (parsed != null) run(parsed.kind, parsed.argument);
            return;
        }
        QuickSwitcher.Result target = QuickSwitcher.goTarget(input, search(input));
        if (target != null) {
            open(target);
        } else {
            AddressInput.Result r = AddressInput.interpret(input);
            SettingsDestination settings = SettingsDestination.resolve(r.value);
            if (r.kind == AddressInput.Kind.SEARCH) {
                mCallbacks.load(AddressInput.searchUrl(
                        r.value, new SettingsStore(ContextUtils.getAppSharedPreferences()).searchTemplate()));
            } else if (settings != null) {
                // blanc://settings is Settings itself, native as on the iPhone, not a served page.
                mCallbacks.settings(settings);
            } else if (!AddressInput.isBlancPage(r.value)) {
                mCallbacks.load(r.value);
            } else {
                // Blanc's own addresses open the pages Android serves (D34); the rest open nothing.
                String page = AddressInput.servedPage(r.value);
                if (page != null) mCallbacks.load(page);
            }
        }
        dismiss();
    }

    private void open(QuickSwitcher.Result result) {
        if (result.id.startsWith("group:")) {
            String groupId = result.id.substring("group:".length());
            mTabs.setGroupCollapsed(groupId, false);
            for (TabSections.Section section : mTabs.sections()) {
                if (groupId.equals(section.groupId) && !section.tabIds.isEmpty()) mTabs.select(section.tabIds.get(0));
            }
        } else if (result.id.startsWith("local:")) {
            mTabs.select(result.id.substring("local:".length()));
        } else if (result.id.startsWith("remoteSpace:")) {
            String id = result.id.substring("remoteSpace:".length());
            for (JSONObject row : SyncedSpaces.remoteSpaces()) {
                if (id.equals(row.optString("id"))) new BringSpaceSheet(mActivity, row).show();
            }
        } else if (result.id.startsWith("set:")) {
            SpacesController spaces = SpacesController.current();
            String id = result.id.substring("set:".length());
            if (spaces != null) spaces.show(id.isEmpty() ? null : id);
        } else if (result.url != null) {
            mCallbacks.openTab(result.url);
        }
    }

    private void openTab(String url) {
        mCallbacks.openTab(url);
        dismiss();
    }

    private static String argumentOf(String input) {
        String trimmed = AddressInput.trim(input);
        int space = trimmed.indexOf(' ');
        return space < 0 ? "" : AddressInput.trim(trimmed.substring(space));
    }

    /** Runs a command; a bare /group waits for a name, as on the iPhone. */
    private void run(SlashCommands.Kind kind, String argument) {
        String active = mTabs.activeId();
        switch (kind) {
            case SYNC -> mCallbacks.sync();
            case SETTINGS -> {
                dismiss();
                mCallbacks.settings(SettingsDestination.ROOT);
            }
            case SPACE -> {
                space(argument);
                dismiss();
                return;
            }
            case SEND -> {
                if (argument.isEmpty()) {
                    mField.setText("/send ");
                    mField.setSelection(mField.length());
                    return;
                }
                sendActive(argument);
            }
            case FAVORITES -> mCallbacks.openTab(PAGES + "bookmarks.html");
            case HISTORY -> mCallbacks.openTab(PAGES + "history.html");
            case NEW -> mTabs.newTab();
            case PRIVATE -> mTabs.newPrivateTab();
            case CLOSE -> {
                if (active != null) mTabs.close(active);
            }
            case REOPEN -> mTabs.reopenLast();
            case GROUP -> {
                if (argument.isEmpty() || active == null) {
                    mField.setText("/group ");
                    mField.setSelection(mField.length());
                    return;
                }
                try {
                    mTabs.createGroup(argument, active);
                } catch (BlancTabs.GroupNameException e) {
                    return;
                }
            }
            case UNGROUP -> {
                if (active != null) mTabs.moveToGroup(active, null);
            }
            case CLOSE_GROUP -> {
                String group = groupOf(active);
                if (group != null) mTabs.closeGroup(group);
            }
            case THEME -> mCallbacks.setTheme(argument.toLowerCase(Locale.ROOT));
            case FIND -> mCallbacks.find();
            case BLOCK_ADS -> mCallbacks.blockAds();
            case ALLOW_ADS -> mCallbacks.allowAds();
            default -> {
                return;
            }
        }
        dismiss();
    }

    private @Nullable String groupOf(@Nullable String tabId) {
        if (tabId == null) return null;
        for (TabStore.Entry tab : mTabs.entries(false)) if (tab.id.equals(tabId)) return tab.groupId;
        return null;
    }

    private static int hint(SlashCommands.Kind kind) {
        return switch (kind) {
            case FAVORITES -> R.string.blanc_slash_favorites_hint;
            case SYNC -> R.string.blanc_slash_sync_hint;
            case SETTINGS -> R.string.blanc_slash_settings_hint;
            case SEND -> R.string.blanc_slash_send_hint;
            case SPACE -> R.string.blanc_slash_space_hint;
            case HISTORY -> R.string.blanc_slash_history_hint;
            case NEW -> R.string.blanc_slash_new_hint;
            case PRIVATE -> R.string.blanc_slash_private_hint;
            case CLOSE -> R.string.blanc_slash_close_hint;
            case REOPEN -> R.string.blanc_slash_reopen_hint;
            case GROUP -> R.string.blanc_slash_group_hint;
            case UNGROUP -> R.string.blanc_slash_ungroup_hint;
            case CLOSE_GROUP -> R.string.blanc_slash_close_group_hint;
            case FIND -> R.string.blanc_slash_find_hint;
            case BLOCK_ADS -> R.string.blanc_slash_block_ads_hint;
            case ALLOW_ADS -> R.string.blanc_slash_allow_ads_hint;
            case THEME -> R.string.blanc_slash_theme_hint;
            default -> R.string.blanc_ios_palette_no_command;
        };
    }
}
