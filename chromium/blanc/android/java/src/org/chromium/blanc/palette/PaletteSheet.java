// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.palette;

import android.app.Activity;
import android.app.Dialog;
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

import org.chromium.blanc.address.AddressInput;
import org.chromium.blanc.island.IslandStyle;
import org.chromium.blanc.island.R;
import org.chromium.blanc.tabs.BlancTabs;
import org.chromium.blanc.tabs.QuickSwitcher;
import org.chromium.blanc.tabs.SlashCommands;
import org.chromium.blanc.tabs.TabSections;
import org.chromium.blanc.tabs.TabStore;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Blanc for iPhone's palette (PaletteSheet.swift) as a bottom sheet: the address row, then the
 * open tabs at rest, the slash commands after "/", or the Quick Switcher's results while typing,
 * and a footer with New Tab, Favorites and History. It replaces A1's address sheet.
 */
@NullMarked
public final class PaletteSheet extends Dialog {
    /** What the palette asks of the browser. */
    public interface Callbacks {
        /** Opens an address or search in the current tab. */
        void load(String url);

        /** Opens an address in a new tab. */
        void openTab(String url);

        /** /theme with its argument. */
        void setTheme(String argument);

        List<QuickSwitcher.Page> favorites();
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
        COMMAND,
        RESULT,
        EMPTY
    }

    /** One drawn row, for tests and TalkBack. */
    public static final class Row {
        public final RowKind kind;
        public final String title;
        public final String subtitle;
        public final boolean selected;
        public final View view;
        public final @Nullable View close;

        Row(RowKind kind, String title, String subtitle, boolean selected, View view, @Nullable View close) {
            this.kind = kind;
            this.title = title;
            this.subtitle = subtitle;
            this.selected = selected;
            this.view = view;
            this.close = close;
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
    private final List<Row> mRows = new ArrayList<>();

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
        addressRow.setPadding(dp(16), dp(8), dp(4), dp(8));
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
        mFavorites = button(R.drawable.blanc_palette_bookmark, R.string.blanc_pages_nav_bookmarks,
                v -> openTab(PAGES + "bookmarks.html"));
        footer.addView(mFavorites, new LinearLayout.LayoutParams(dp(44), dp(44)));
        mHistory = button(R.drawable.blanc_palette_history, R.string.blanc_pages_nav_history,
                v -> openTab(PAGES + "history.html"));
        footer.addView(mHistory, new LinearLayout.LayoutParams(dp(44), dp(44)));
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
        heading(mActivity.getString(R.string.blanc_ios_tabs_open_tabs), normal.size());
        for (TabSections.Section section : mTabs.sections()) {
            TabStore.Group group = section.groupId == null ? null : groups.get(section.groupId);
            if (group != null) {
                groupRow(group, section.tabIds.size());
                if (group.collapsed) continue;
            }
            for (String id : section.tabIds) {
                TabStore.Entry tab = byId.get(id);
                if (tab != null) tabRow(tab);
            }
        }
        // Chromium keeps private tabs apart, so they're their own section (A2 spike, decision 4).
        List<TabStore.Entry> privateTabs = mTabs.entries(true);
        if (privateTabs.isEmpty()) return;
        heading(mActivity.getString(R.string.blanc_pill_private_chip), privateTabs.size());
        for (TabStore.Entry tab : privateTabs) tabRow(tab);
    }

    private void renderCommands() {
        List<SlashCommands.Kind> kinds = new ArrayList<>(SlashCommands.matching(mField.getText().toString()));
        // Find in page joins with its bar (A2 Task 6).
        kinds.remove(SlashCommands.Kind.FIND);
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

    private void renderResults() {
        List<QuickSwitcher.Result> results = search(AddressInput.trim(mField.getText().toString()));
        if (results.isEmpty()) {
            empty(R.string.blanc_ios_palette_no_matches);
            return;
        }
        for (QuickSwitcher.Result result : results) {
            boolean group = result.id.startsWith("group:");
            String subtitle = group
                    ? mActivity.getResources().getQuantityString(R.plurals.blanc_newtab_groups_count, result.count, result.count)
                    : result.subtitle;
            View view = row(group ? R.drawable.blanc_palette_chevron_right : R.drawable.blanc_palette_globe,
                    result.title, subtitle, false, v -> {
                        open(result);
                        dismiss();
                    });
            mRows.add(new Row(RowKind.RESULT, result.title, subtitle, false, view, null));
        }
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
        return QuickSwitcher.search(query, candidates, mCallbacks.favorites(), List.of(), groups);
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

    private void groupRow(TabStore.Group group, int count) {
        LinearLayout view = new LinearLayout(mActivity);
        view.setGravity(Gravity.CENTER_VERTICAL);
        view.setMinimumHeight(dp(36));
        view.setPadding(dp(26), 0, dp(4), 0);
        view.setBackground(wash(group));
        TextView name = text(group.name, 13, mStyle.text);
        name.setTypeface(Typeface.DEFAULT_BOLD);
        view.addView(name);
        TextView tally = text("  " + count, 12, secondary());
        view.addView(tally, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        view.addView(icon(group.collapsed ? R.drawable.blanc_palette_chevron_right : R.drawable.blanc_palette_chevron_down,
                secondary()), new LinearLayout.LayoutParams(dp(44), dp(20)));
        String action = mActivity.getString(group.collapsed ? R.string.blanc_group_unfold : R.string.blanc_group_fold);
        // TalkBack hears the name and what a tap does, as the iPhone's label and hint.
        view.setContentDescription(group.name + ", " + action);
        view.setOnClickListener(v -> {
            mTabs.setGroupCollapsed(group.id, !group.collapsed);
            render();
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(dp(12), dp(4), dp(12), 0);
        mList.addView(view, lp);
        mRows.add(new Row(RowKind.GROUP, group.name, String.valueOf(count), false, view, null));
    }

    private void tabRow(TabStore.Entry tab) {
        boolean blanc = tab.url.startsWith(PAGES);
        String title = tab.title.isEmpty() ? mActivity.getString(R.string.blanc_tab_untitled) : tab.title;
        String subtitle = blanc ? "Blanc" : host(tab.url);
        boolean selected = tab.id.equals(mTabs.activeId()) && tab.privateTab == mTabs.privateSelected();
        LinearLayout line = new LinearLayout(mActivity);
        line.setGravity(Gravity.CENTER_VERTICAL);
        View main = row(blanc ? R.drawable.blanc_island_mark : R.drawable.blanc_palette_globe, title, subtitle, selected, v -> {
            mTabs.select(tab.id);
            dismiss();
        });
        mList.removeView(main);
        line.addView(main, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        ImageButton close = button(R.drawable.blanc_palette_close, 0, v -> {
            mTabs.close(tab.id);
            render();
        });
        close.setContentDescription(mActivity.getString(R.string.blanc_ios_tabs_close, title));
        line.addView(close, new LinearLayout.LayoutParams(dp(44), dp(48)));
        if (selected) {
            GradientDrawable selection = new GradientDrawable();
            selection.setColor((mStyle.text & 0x00FFFFFF) | 0x14000000);
            selection.setCornerRadius(dp(10));
            line.setBackground(selection);
        }
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(dp(12), dp(2), dp(12), dp(2));
        mList.addView(line, lp);
        mRows.add(new Row(RowKind.TAB, title, subtitle, selected, main, close));
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
        mList.addView(view);
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
    private GradientDrawable wash(TabStore.Group group) {
        GradientDrawable wash = new GradientDrawable();
        int alpha = mStyle.dark ? 0x29 : 0x1A;
        int base = group.color == null ? mStyle.text : Color.parseColor(group.color);
        if (group.color == null) alpha = mStyle.dark ? 0x12 : 0x09;
        wash.setColor((base & 0x00FFFFFF) | (alpha << 24));
        wash.setCornerRadius(dp(10));
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
            if (parsed != null && parsed.kind != SlashCommands.Kind.FIND) run(parsed.kind, parsed.argument);
            return;
        }
        QuickSwitcher.Result target = QuickSwitcher.goTarget(input, search(input));
        if (target != null) {
            open(target);
        } else {
            AddressInput.Result r = AddressInput.interpret(input);
            if (r.kind == AddressInput.Kind.SEARCH) {
                mCallbacks.load(AddressInput.searchUrl(r.value));
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
            case HISTORY -> R.string.blanc_slash_history_hint;
            case NEW -> R.string.blanc_slash_new_hint;
            case PRIVATE -> R.string.blanc_slash_private_hint;
            case CLOSE -> R.string.blanc_slash_close_hint;
            case REOPEN -> R.string.blanc_slash_reopen_hint;
            case GROUP -> R.string.blanc_slash_group_hint;
            case UNGROUP -> R.string.blanc_slash_ungroup_hint;
            case CLOSE_GROUP -> R.string.blanc_slash_close_group_hint;
            case FIND -> R.string.blanc_slash_find_hint;
            case THEME -> R.string.blanc_slash_theme_hint;
            default -> R.string.blanc_ios_palette_no_command;
        };
    }
}
