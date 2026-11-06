// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.spaces;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONException;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.annotation.Config;

import org.chromium.base.test.BaseRobolectricTestRunner;
import org.chromium.blanc.spaces.BlancSpaces.Result;
import org.chromium.blanc.spaces.BlancSpaces.SavedGroup;
import org.chromium.blanc.spaces.BlancSpaces.SavedTab;
import org.chromium.blanc.tabs.TabStore;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RunWith(BaseRobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class BlancSpacesTest {
    private static final String RED = BlancSpaces.COLORS[3];
    private static final String STAR = "star";

    /** Stops the switch at a named step, as Android ending the app would. */
    private static final class Killed extends RuntimeException {}

    private static final class FakeTabs implements SpaceSwitcher.Tabs {
        final Map<String, TabStore.Entry> mOpen = new LinkedHashMap<>();
        final Set<String> mFrozen = new HashSet<>();
        final Map<String, TabStore.Entry> mDisk = new LinkedHashMap<>();
        final List<String> mRestored = new ArrayList<>();
        @org.chromium.build.annotations.Nullable String mActive;
        String mSaved;
        String mDieAt = "";
        int mNext = 100;

        void add(String id, String url) {
            mOpen.put(id, new TabStore.Entry(id, url, url, null, false, false, false));
            mActive = id;
        }

        private void step(String name) {
            if (name.equals(mDieAt)) {
                mDieAt = "";
                throw new Killed();
            }
        }

        @Override public List<TabStore.Entry> tabs() { return new ArrayList<>(mOpen.values()); }
        @Override public List<TabStore.Group> groups() { return List.of(); }
        @Override public String activeId() { return mActive; }

        @Override
        public boolean freeze(String id) {
            mFrozen.add(id);
            mDisk.put(id, mOpen.get(id));
            return true;
        }

        @Override
        public String thaw(String id) {
            step("thaw");
            TabStore.Entry saved = mDisk.get(id);
            if (saved == null) return "";
            mOpen.put(id, saved);
            return id;
        }

        @Override
        public String open(String url) {
            String id = String.valueOf(mNext++);
            add(id, url);
            return id;
        }

        @Override
        public String startPage() {
            return open("start");
        }

        @Override
        public void close(String id) {
            step("close");
            mOpen.remove(id);
        }

        @Override public void select(String id) { mActive = id; }
        @Override public void restoreGroup(SavedGroup group) { mRestored.add(group.name); }
        @Override public void setPinned(String id, boolean pinned) {}
        @Override public void forget(String id) { mDisk.remove(id); }

        @Override
        public void save(BlancSpaces library) {
            try {
                mSaved = library.toJson();
            } catch (JSONException e) {
                throw new AssertionError(e);
            }
            step("save");
        }
    }

    private final BlancSpaces mLibrary = new BlancSpaces();
    private final FakeTabs mTabs = new FakeTabs();

    private String create(String name) {
        assertEquals(Result.OK, mLibrary.create(name, RED, STAR));
        return mLibrary.lastCreated.id;
    }

    private SpaceSwitcher switcher() {
        return new SpaceSwitcher(mLibrary, mTabs);
    }

    @Test
    public void namesAreTrimmedCappedAndUniqueInAnyCase() {
        assertEquals(Result.EMPTY_NAME, mLibrary.create("   ", RED, STAR));
        create(" Work ");
        assertEquals("Work", mLibrary.spaces.get(0).name);
        assertEquals(Result.DUPLICATE_NAME, mLibrary.create("work", RED, STAR));
        assertEquals(BlancSpaces.NAME_LIMIT, BlancSpaces.cleanName("x".repeat(80)).length());
    }

    @Test
    public void theLimitIsTwentyFive() {
        for (int i = 0; i < BlancSpaces.LIMIT; i++) create("Space " + i);
        assertEquals(Result.LIMIT, mLibrary.create("One more", RED, STAR));
    }

    @Test
    public void onlyTheEightColorsAndSixteenSymbolsCount() {
        assertEquals(Result.BAD_IDENTITY, mLibrary.create("A", "#123456", STAR));
        assertEquals(Result.BAD_IDENTITY, mLibrary.create("A", RED, "rocket"));
    }

    @Test
    public void aDeletedSpaceComesBackAndExpiresAfterSevenDays() {
        String id = create("Work");
        mLibrary.delete(id, 1000);
        assertTrue(mLibrary.spaces.isEmpty());
        assertEquals(Result.OK, mLibrary.restore(id));
        assertEquals(1, mLibrary.spaces.size());
        mLibrary.delete(id, 1000);
        create("Work");
        assertEquals("the name is taken now", Result.DUPLICATE_NAME, mLibrary.restore(id));
        assertTrue(mLibrary.expire(1000 + BlancSpaces.DELETED_MILLIS - 1).isEmpty());
        assertEquals(1, mLibrary.expire(1000 + BlancSpaces.DELETED_MILLIS).size());
    }

    @Test
    public void theLibrarySurvivesAFile() throws JSONException {
        String id = create("Work");
        mLibrary.space(id).set.tabs.add(new SavedTab("7", "https://a.example/", "A", true, "g"));
        mLibrary.space(id).set.groups.add(new SavedGroup("g", "Group", RED, true));
        mLibrary.space(id).set.activeId = "7";
        mLibrary.shownId = id;
        BlancSpaces again = BlancSpaces.fromJson(mLibrary.toJson());
        assertEquals("Work", again.shown().name);
        SavedTab tab = again.shown().set.tabs.get(0);
        assertEquals("g", tab.groupId);
        assertTrue(tab.pinned);
        assertEquals("Group", again.shown().set.groups.get(0).name);
        assertEquals("7", again.shown().set.activeId);
    }

    @Test
    public void aFileThatCantBeReadGivesAnEmptyLibrary() {
        assertTrue(BlancSpaces.fromJson("not json").spaces.isEmpty());
        assertTrue(BlancSpaces.fromJson(null).spaces.isEmpty());
    }

    @Test
    public void aNewSpaceOpensOnAStartPageAndComingBackRestoresThePhone() {
        mTabs.add("1", "https://a.example/");
        mTabs.add("2", "https://b.example/");
        String id = create("Work");
        switcher().show(id);
        assertEquals(id, mLibrary.shownId);
        assertEquals(1, mTabs.mOpen.size());
        assertEquals("start", mTabs.mOpen.values().iterator().next().url);
        switcher().show(null);
        assertNull(mLibrary.shownId);
        assertEquals(Set.of("1", "2"), mTabs.mOpen.keySet());
        assertEquals("the tab that was showing", "2", mTabs.mActive);
    }

    @Test
    public void showingWhatsShownChangesNothing() {
        mTabs.add("1", "https://a.example/");
        switcher().show(null);
        assertFalse(mTabs.mFrozen.contains("1"));
    }

    @Test
    public void everyTabIsOnDiskBeforeAnyCloses() {
        mTabs.add("1", "https://a.example/");
        String id = create("Work");
        mTabs.mDieAt = "close";
        try {
            switcher().show(id);
        } catch (Killed e) {
            assertTrue(mTabs.mFrozen.contains("1"));
            assertTrue("the switch is written down", mTabs.mSaved.contains("pending"));
            return;
        }
        throw new AssertionError("never closed");
    }

    private void killedAt(String step) {
        mTabs.add("1", "https://a.example/");
        mTabs.add("2", "https://b.example/");
        String id = create("Work");
        switcher().show(id);
        mTabs.add("3", "https://c.example/");
        mTabs.mDieAt = step;
        try {
            switcher().show(null);
            throw new AssertionError("never got there");
        } catch (Killed e) {
            // Android ended the app here.
        }
        BlancSpaces reopened = BlancSpaces.fromJson(mTabs.mSaved);
        new SpaceSwitcher(reopened, mTabs).recover();
        assertNull(reopened.pending);
        assertNull(reopened.shownId);
        assertEquals(step, Set.of("1", "2"), mTabs.mOpen.keySet());
        assertTrue("the left Space keeps its tab: " + step,
                reopened.space(id).set.tabs.stream().anyMatch(tab -> tab.id.equals("3")));
    }

    @Test
    public void killedWhileBringingTabsBackItFinishes() {
        killedAt("thaw");
    }

    @Test
    public void killedWhileClosingItFinishes() {
        killedAt("close");
    }

    @Test
    public void aSwitchToADeletedSpaceStaysPut() throws JSONException {
        mTabs.add("1", "https://a.example/");
        String id = create("Work");
        mTabs.mDieAt = "thaw";
        mTabs.mDisk.put("9", mTabs.mOpen.get("1"));
        mLibrary.space(id).set.tabs.add(new SavedTab("9", "u", "t", false, null));
        try {
            switcher().show(id);
        } catch (Killed e) {
            // Ended here.
        }
        BlancSpaces reopened = BlancSpaces.fromJson(mTabs.mSaved);
        reopened.spaces.clear();
        new SpaceSwitcher(reopened, mTabs).recover();
        assertNull(reopened.pending);
        assertEquals(Set.of("1"), mTabs.mOpen.keySet());
    }

    @Test
    public void aTabWithNoStateOpensByAddress() {
        mTabs.add("1", "https://a.example/");
        String id = create("Work");
        mLibrary.space(id).set.tabs.add(new SavedTab("9", "https://kept.example/", "K", false, null));
        switcher().show(id);
        assertEquals(1, mTabs.mOpen.size());
        assertEquals("https://kept.example/", mTabs.mOpen.values().iterator().next().url);
    }

    @Test
    public void movingATabSavesItInTheSpaceAndClosesItHere() {
        mTabs.add("1", "https://a.example/");
        mTabs.add("2", "https://b.example/");
        String id = create("Work");
        switcher().moveTab("2", id);
        assertEquals("2", mLibrary.space(id).set.tabs.get(0).id);
        assertEquals(Set.of("1"), mTabs.mOpen.keySet());
    }

    @Test
    public void theOnlyTabHereStays() {
        mTabs.add("1", "https://a.example/");
        String id = create("Work");
        switcher().moveTab("1", id);
        assertTrue(mLibrary.space(id).set.tabs.isEmpty());
        assertEquals(Set.of("1"), mTabs.mOpen.keySet());
    }

    @Test
    public void aTabInASpaceMovesToThisPhone() {
        mTabs.add("1", "https://a.example/");
        String id = create("Work");
        switcher().show(id);
        mTabs.add("7", "https://b.example/");
        switcher().moveTab("7", null);
        assertTrue(mLibrary.phone.tabs.stream().anyMatch(tab -> tab.id.equals("7")));
        assertFalse(mTabs.mOpen.containsKey("7"));
    }

    @Test
    public void undoBringsBackADeletedSpaceAndShowsItIfItWasOnShow() {
        mTabs.add("1", "https://a.example/");
        String id = create("Work");
        SpacesController spaces = new SpacesController(mLibrary, mTabs);
        spaces.show(id);
        spaces.delete(id, 5);
        assertNull(mLibrary.shownId);
        spaces.undoDelete();
        assertEquals(id, mLibrary.shownId);
        assertNotNull(mLibrary.space(id));
        assertTrue(mLibrary.deleted.isEmpty());
    }

    @Test
    public void undoLeavesThisPhoneOnShowWhenTheSpaceWasNot() {
        mTabs.add("1", "https://a.example/");
        String id = create("Work");
        SpacesController spaces = new SpacesController(mLibrary, mTabs);
        spaces.delete(id, 5);
        spaces.undoDelete();
        assertNull(mLibrary.shownId);
        assertNotNull(mLibrary.space(id));
    }

    @Test
    public void undoOnlyEverAppliesOnce() {
        String one = create("One");
        SpacesController spaces = new SpacesController(mLibrary, mTabs);
        spaces.delete(one, 5);
        spaces.undoDelete();
        spaces.delete(one, 6);
        spaces.forgetUndo();
        spaces.undoDelete();
        assertNull(mLibrary.space(one));
    }

    @Test
    public void deletingTheShownSpaceGoesBackToThePhoneFirst() {
        mTabs.add("1", "https://a.example/");
        String id = create("Work");
        switcher().show(id);
        switcher().delete(id, 5);
        assertNull(mLibrary.shownId);
        assertTrue(mLibrary.spaces.isEmpty());
        assertEquals(1, mLibrary.deleted.size());
        assertTrue(mTabs.mOpen.containsKey("1"));
    }

    @Test
    public void expiringForgetsTheTabFiles() {
        mTabs.add("1", "https://a.example/");
        String id = create("Work");
        switcher().moveTab("1", id);
        switcher().delete(id, 5);
        switcher().expire(5 + BlancSpaces.DELETED_MILLIS);
        assertNull(mTabs.mDisk.get("1"));
    }
}
