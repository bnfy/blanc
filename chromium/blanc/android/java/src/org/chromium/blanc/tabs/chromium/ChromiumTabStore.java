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
import org.chromium.chrome.browser.crypto.CipherFactory;
import org.chromium.chrome.browser.tab.TabState;
import org.chromium.chrome.browser.tab.WebContentsState;
import org.chromium.chrome.browser.tab.TabStateAttributes;
import org.chromium.chrome.browser.tab.TabStateExtractor;
import org.chromium.chrome.browser.tabpersistence.TabStateFileManager;
import org.chromium.components.tab_groups.TabGroupColorId;
import org.chromium.content_public.browser.LoadUrlParams;
import org.chromium.network.mojom.ReferrerPolicy;
import org.chromium.content_public.browser.WebContents;

import java.io.File;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Blanc's {@link TabStore} over Chromium's tab model (A2 spike, docs/android/a2-tabs-spike.md).
 * Chromium keeps and restores tabs, groups (name, color, folded) and pins; Blanc's eight preset
 * colors are kept beside a group in Blanc's preferences, with the nearest Chromium color set too.
 * Ids are Chromium's tab ids and group tokens, as strings. Chromium keeps pinned tabs apart from
 * groups, so a grouped tab's pin is Blanc's own (in Blanc's preferences): the tab stays in its group
 * and leads it, as on desktop and the iPhone.
 */
@NullMarked
public final class ChromiumTabStore implements TabStore {
    private static final String COLOR_PREFIX = "blanc.group_color.";
    private static final String GROUP_PINS = "blanc.group_pins";

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
    private final CipherFactory mCipher = new CipherFactory();

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

    private static Set<String> groupPins() {
        return new HashSet<>(prefs().getStringSet(GROUP_PINS, Set.of()));
    }

    private static void setGroupPin(Tab tab, boolean pinned) {
        Set<String> pins = groupPins();
        String id = String.valueOf(tab.getId());
        if (pinned ? !pins.add(id) : !pins.remove(id)) return;
        prefs().edit().putStringSet(GROUP_PINS, pins).apply();
    }

    /** Chromium's pin, or Blanc's for a tab in a group. */
    public static boolean isPinned(Tab tab) {
        return tab.getIsPinned()
                || (tab.getTabGroupId() != null && groupPins().contains(String.valueOf(tab.getId())));
    }

    /** Before a pinned tab joins a group: Chromium's pin can't, so it becomes Blanc's. */
    private void carryPinIntoGroup(Tab tab) {
        if (!tab.getIsPinned()) return;
        mSelector.getModel(false).unpinTab(tab.getId());
        setGroupPin(tab, true);
    }

    /** Before a grouped tab joins another group: merging a grouped tab would bring its whole group. */
    private void leaveGroup(Tab tab) {
        if (tab.getTabGroupId() == null) return;
        mSelector.getModel(false).getTabUngrouper().ungroupTabs(
                List.of(tab), /* trailing= */ true, /* allowDialog= */ false);
    }

    private static Entry entry(Tab tab) {
        WebContents contents = tab.getWebContents();
        Token group = tab.getTabGroupId();
        return new Entry(String.valueOf(tab.getId()), tab.getUrl().getSpec(), tab.getTitle(),
                group == null ? null : group.toString(), isPinned(tab),
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
    public String createQuiet(String url, String title) {
        return frozen(url, title, -1);
    }

    private String frozen(String url, String title, int index) {
        WebContentsState contents = WebContentsState.createSingleNavigationWebContentsState(
                mSelector.getModel(false).getProfile(), title, url, null, ReferrerPolicy.DEFAULT, null);
        if (contents == null) return "";
        TabState state = new TabState();
        state.contentsState = contents;
        state.tabLaunchTypeAtCreation = TabLaunchType.FROM_RESTORE;
        state.timestampMillis = System.currentTimeMillis();
        Tab tab = mCreators.getTabCreator(false).createFrozenTab(state, Tab.INVALID_TAB_ID, index);
        if (tab == null) return "";
        TabStateAttributes.setDirty(tab);
        return String.valueOf(tab.getId());
    }

    @Override
    public String navigate(String id, String url, String title) {
        Tab tab = tab(id);
        if (tab == null) return "";
        if (!tab.isFrozen()) {
            tab.loadUrl(new LoadUrlParams(url));
            return id;
        }
        TabModel model = mSelector.getModel(false);
        String next = frozen(url, title, model.indexOf(tab));
        if (!next.isEmpty()) close(id, false);
        return next;
    }

    /** Saves a tab's whole state, Back and Forward included, under its id. */
    public boolean freeze(String id, File directory, boolean keepGroup) {
        Tab tab = tab(id);
        if (tab == null) return false;
        TabState state = TabStateExtractor.from(tab);
        if (state == null || state.contentsState == null) return false;
        if (!keepGroup) state.tabGroupId = null;
        directory.mkdirs();
        TabStateFileManager.saveState(directory, state, tab.getId(), false, mCipher);
        return true;
    }

    /** Brings a frozen tab back without loading it. Its id, group and pin come with it. */
    public String thaw(int id, File directory, int index) {
        TabState state = TabStateFileManager.restoreTabState(directory, id, mCipher);
        if (state == null) return "";
        Tab tab = mCreators.getTabCreator(false).createFrozenTab(state, id, index);
        if (tab == null) return "";
        // Its own state file went when it closed, so it's queued for the next save.
        TabStateAttributes.setDirty(tab);
        return String.valueOf(tab.getId());
    }

    /** Removes a frozen tab's file for good. */
    public void forgetFrozen(int id, File directory) {
        TabStateFileManager.deleteTabState(directory, id, false);
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
        if (tab.getTabGroupId() != null) {
            setGroupPin(tab, pinned);
            return;
        }
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
        if (tab == null || tab.isIncognito()) return "";
        TabModel model = mSelector.getModel(false);
        leaveGroup(tab);
        carryPinIntoGroup(tab);
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
        if (members.isEmpty() || token.equals(tab.getTabGroupId())) return;
        leaveGroup(tab);
        carryPinIntoGroup(tab);
        model.mergeTabsToGroup(tab.getId(), members.get(0).getId());
    }

    @Override
    public void removeFromGroup(String tabId) {
        Tab tab = tab(tabId);
        if (tab == null || tab.getTabGroupId() == null) return;
        boolean pinned = isPinned(tab);
        setGroupPin(tab, false);
        TabModel model = mSelector.getModel(false);
        model.getTabUngrouper().ungroupTabs(List.of(tab), /* trailing= */ true, /* allowDialog= */ false);
        // Out of its group, its pin is Chromium's again: an ungrouped pin.
        if (pinned) model.pinTab(tab.getId(), /* showUngroupDialog= */ false);
    }
}
