// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.tabs.chromium;

import android.content.SharedPreferences;

import org.chromium.base.ContextUtils;
import org.chromium.base.Token;
import org.chromium.blanc.tabs.TabStore;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;
import org.chromium.chrome.browser.tab.Tab;
import org.chromium.chrome.browser.tab.TabLaunchType;
import org.chromium.chrome.browser.tab.TabSelectionType;
import org.chromium.chrome.browser.tabmodel.TabClosureParams;
import org.chromium.chrome.browser.tabmodel.TabCreatorManager;
import org.chromium.chrome.browser.tabmodel.TabModel;
import org.chromium.chrome.browser.tabmodel.TabModelSelector;
import org.chromium.chrome.browser.tabmodel.TabModelUtils;
import org.chromium.components.tab_groups.TabGroupColorId;
import org.chromium.content_public.browser.LoadUrlParams;
import org.chromium.content_public.browser.WebContents;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Blanc's {@link TabStore} over Chromium's tab model (A2 spike, docs/android/a2-tabs-spike.md).
 * Chromium keeps and restores tabs, groups (name, color, folded) and pins; Blanc's eight preset
 * colors are kept beside a group in Blanc's preferences, with the nearest Chromium color set too.
 * Ids are Chromium's tab ids and group tokens, as strings.
 */
@NullMarked
public final class ChromiumTabStore implements TabStore {
    private static final String COLOR_PREFIX = "blanc.group_color.";

    /** Blanc's presets as Chromium's nearest group colors. */
    private static final Map<String, Integer> NEAREST =
            Map.of(
                    "#426c4c", TabGroupColorId.GREEN,
                    "#376694", TabGroupColorId.BLUE,
                    "#6757a3", TabGroupColorId.PURPLE,
                    "#9b4761", TabGroupColorId.PINK,
                    "#974f2a", TabGroupColorId.ORANGE,
                    "#815c02", TabGroupColorId.YELLOW,
                    "#576471", TabGroupColorId.CYAN,
                    "#3a3a3a", TabGroupColorId.GREY);

    private final TabModelSelector mSelector;
    private final TabCreatorManager mCreators;

    public ChromiumTabStore(TabModelSelector selector, TabCreatorManager creators) {
        mSelector = selector;
        mCreators = creators;
    }

    private static SharedPreferences prefs() {
        return ContextUtils.getAppSharedPreferences();
    }

    private @Nullable Tab tab(String id) {
        try {
            return mSelector.getTabById(Integer.parseInt(id));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private @Nullable Token token(String groupId) {
        for (Token token : mSelector.getModel(false).getAllTabGroupIds()) {
            if (token.toString().equals(groupId)) return token;
        }
        return null;
    }

    private static Entry entry(Tab tab) {
        WebContents contents = tab.getWebContents();
        Token group = tab.getTabGroupId();
        return new Entry(String.valueOf(tab.getId()), tab.getUrl().getSpec(), tab.getTitle(),
                group == null ? null : group.toString(), tab.getIsPinned(),
                contents != null && contents.isAudioMuted(), tab.isIncognito());
    }

    @Override
    public List<Entry> tabs(boolean privateTabs) {
        TabModel model = mSelector.getModel(privateTabs);
        List<Entry> out = new ArrayList<>();
        for (int i = 0; i < model.getCount(); i++) {
            Tab tab = model.getTabAt(i);
            if (tab != null) out.add(entry(tab));
        }
        return out;
    }

    @Override
    public @Nullable String activeId(boolean privateTabs) {
        TabModel model = mSelector.getModel(privateTabs);
        Tab tab = model.index() < 0 ? null : model.getTabAt(model.index());
        return tab == null ? null : String.valueOf(tab.getId());
    }

    @Override
    public boolean privateSelected() {
        return mSelector.isIncognitoSelected();
    }

    @Override
    public String create(@Nullable String url, boolean privateTab, @Nullable String groupId, int index) {
        Tab tab = mCreators.getTabCreator(privateTab)
                .createNewTab(new LoadUrlParams(url == null ? START_PAGE : url), TabLaunchType.FROM_CHROME_UI,
                        null, index < 0 ? TabModel.INVALID_TAB_INDEX : index);
        if (tab == null) return "";
        String id = String.valueOf(tab.getId());
        if (groupId != null) addToGroup(id, groupId);
        return id;
    }

    @Override
    public void close(String id, boolean undoable) {
        Tab tab = tab(id);
        if (tab == null) return;
        mSelector.getModel(tab.isIncognito()).getTabRemover().closeTabs(
                TabClosureParams.closeTab(tab).allowUndo(undoable).build(), /* allowDialog= */ false);
    }

    @Override
    public boolean cancelClose(String id) {
        try {
            mSelector.getModel(false).cancelTabClosure(Integer.parseInt(id));
            return tab(id) != null;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    @Override
    public void commitClose(String id) {
        try {
            mSelector.getModel(false).commitTabClosure(Integer.parseInt(id));
        } catch (NumberFormatException e) {
            // Not a tab id: nothing is pending under it.
        }
    }

    @Override
    public void select(String id) {
        try {
            TabModelUtils.selectTabById(mSelector, Integer.parseInt(id), TabSelectionType.FROM_USER);
        } catch (NumberFormatException e) {
            // Not a tab id.
        }
    }

    @Override
    public void selectModel(boolean privateTabs) {
        mSelector.selectModel(privateTabs);
    }

    @Override
    public void move(String id, int index) {
        Tab tab = tab(id);
        if (tab != null) mSelector.getModel(tab.isIncognito()).moveTab(tab.getId(), index);
    }

    @Override
    public void setPinned(String id, boolean pinned) {
        Tab tab = tab(id);
        if (tab == null) return;
        TabModel model = mSelector.getModel(tab.isIncognito());
        if (pinned) {
            model.pinTab(tab.getId(), /* showUngroupDialog= */ false);
        } else {
            model.unpinTab(tab.getId());
        }
    }

    @Override
    public void setMuted(String id, boolean muted) {
        Tab tab = tab(id);
        WebContents contents = tab == null ? null : tab.getWebContents();
        if (contents != null) contents.setAudioMuted(muted);
    }

    @Override
    public List<Group> groups() {
        TabModel model = mSelector.getModel(false);
        List<Group> out = new ArrayList<>();
        for (Token token : model.getAllTabGroupIds()) {
            if (model.getTabsInGroup(token).isEmpty()) continue;
            String id = token.toString();
            String name = model.getTabGroupTitle(token);
            out.add(new Group(id, name == null ? "" : name, prefs().getString(COLOR_PREFIX + id, null),
                    model.getTabGroupCollapsed(token)));
        }
        return out;
    }

    @Override
    public String createGroup(String tabId, String name) {
        Tab tab = tab(tabId);
        if (tab == null) return "";
        TabModel model = mSelector.getModel(false);
        model.createSingleTabGroup(tab);
        Token token = tab.getTabGroupId();
        if (token == null) return "";
        model.setTabGroupTitle(token, name);
        model.setTabGroupColor(token, TabGroupColorId.GREY);
        return token.toString();
    }

    @Override
    public void setGroupName(String groupId, String name) {
        Token token = token(groupId);
        if (token != null) mSelector.getModel(false).setTabGroupTitle(token, name);
    }

    @Override
    public void setGroupColor(String groupId, @Nullable String hex) {
        Token token = token(groupId);
        if (token == null) return;
        if (hex == null) {
            prefs().edit().remove(COLOR_PREFIX + groupId).apply();
        } else {
            prefs().edit().putString(COLOR_PREFIX + groupId, hex).apply();
        }
        Integer nearest = hex == null ? null : NEAREST.get(hex);
        mSelector.getModel(false).setTabGroupColor(token, nearest == null ? TabGroupColorId.GREY : nearest);
    }

    @Override
    public void setGroupCollapsed(String groupId, boolean collapsed) {
        Token token = token(groupId);
        if (token != null) mSelector.getModel(false).setTabGroupCollapsed(token, collapsed);
    }

    @Override
    public void addToGroup(String tabId, String groupId) {
        Tab tab = tab(tabId);
        Token token = token(groupId);
        if (tab == null || token == null || tab.isIncognito()) return;
        TabModel model = mSelector.getModel(false);
        List<Tab> members = model.getTabsInGroup(token);
        if (!members.isEmpty()) model.mergeTabsToGroup(tab.getId(), members.get(0).getId());
    }

    @Override
    public void removeFromGroup(String tabId) {
        Tab tab = tab(tabId);
        if (tab == null || tab.getTabGroupId() == null) return;
        mSelector.getModel(false).getTabUngrouper().ungroupTabs(
                List.of(tab), /* trailing= */ true, /* allowDialog= */ false);
    }
}
