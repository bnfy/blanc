// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.tabs;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import org.chromium.base.test.BaseRobolectricTestRunner;

import java.util.ArrayList;
import java.util.List;

/** Blanc's tab operations, as Blanc for iPhone's TabsManager does them, over a plain store. */
@RunWith(BaseRobolectricTestRunner.class)
public class BlancTabsTest {
    private FakeTabStore mStore;
    private long mNow;
    private BlancTabs mTabs;

    @Before
    public void setUp() {
        mStore = new FakeTabStore();
        mTabs = new BlancTabs(mStore, () -> mNow);
    }

    private String open(String url) {
        return mStore.create(url, false, null, -1);
    }

    private List<String> urls() {
        List<String> out = new ArrayList<>();
        for (TabStore.Entry e : mStore.tabs(false)) out.add(e.url);
        return out;
    }

    @Test
    public void undoWithinFiveSecondsPutsATabBackInItsPlaceAndGroup() {
        String a = open("https://a.example/");
        String b = open("https://b.example/");
        open("https://c.example/");
        String g = mTabs.createGroup("Reading", a);
        mTabs.moveToGroup(b, g);
        mTabs.close(b);
        assertEquals("https://b.example/", mTabs.undoTitle());
        mNow += BlancTabs.UNDO_MILLIS;
        assertTrue(mTabs.undoClose());
        assertEquals(List.of("https://a.example/", "https://b.example/", "https://c.example/"), urls());
        assertEquals(g, mStore.tabs(false).get(1).groupId);
        assertEquals(b, mStore.activeId(false));
    }

    @Test
    public void afterFiveSecondsUndoIsGoneButReopenStillWorks() {
        open("https://a.example/");
        String b = open("https://b.example/");
        mTabs.close(b);
        mNow += BlancTabs.UNDO_MILLIS + 1;
        assertFalse(mTabs.undoClose());
        assertNull(mTabs.undoTitle());
        assertTrue(mTabs.reopenLast());
        assertEquals(List.of("https://a.example/", "https://b.example/"), urls());
        assertFalse(mTabs.reopenLast());
    }

    @Test
    public void onlyTheNewestCloseIsUndoable() {
        String a = open("https://a.example/");
        String b = open("https://b.example/");
        open("https://c.example/");
        mTabs.close(a);
        mTabs.close(b);
        assertTrue(mTabs.undoClose());
        assertFalse(mTabs.undoClose());
        assertEquals(List.of("https://b.example/", "https://c.example/"), urls());
        assertTrue(mTabs.reopenLast());
        assertTrue(urls().contains("https://a.example/"));
    }

    @Test
    public void closingTheLastTabLeavesAStartPageThatUndoTakesAway() {
        String a = open("https://a.example/");
        mTabs.close(a);
        assertEquals(List.of(TabStore.START_PAGE), urls());
        assertTrue(mTabs.undoClose());
        assertEquals(List.of("https://a.example/"), urls());
    }

    @Test
    public void closingTheLastPrivateTabReturnsToTheNormalTabsWithNoUndo() {
        String a = open("https://a.example/");
        mTabs.newPrivateTab();
        String p = mStore.activeId(true);
        mTabs.close(p);
        assertFalse(mStore.privateSelected());
        assertEquals(a, mStore.activeId(false));
        assertFalse(mTabs.undoClose());
        assertFalse(mTabs.reopenLast());
    }

    @Test
    public void groupNamesFindOrCreateWithoutRegardToCase() throws Exception {
        String a = open("https://a.example/");
        String b = open("https://b.example/");
        String g = mTabs.createGroup("Research", a);
        assertEquals(g, mTabs.createGroup("  research ", b));
        assertEquals(1, mStore.groups().size());
        assertThrows(BlancTabs.GroupNameException.class, () -> mTabs.createGroup("   ", b));
        String c = open("https://c.example/");
        String other = mTabs.createGroup("Reading", c);
        BlancTabs.GroupNameException e =
                assertThrows(BlancTabs.GroupNameException.class, () -> mTabs.renameGroup(other, "RESEARCH"));
        assertEquals(BlancTabs.GroupNameException.Reason.DUPLICATE, e.reason);
        mTabs.renameGroup(other, "Reading list");
        assertEquals("Reading list", mStore.groups().get(1).name);
    }

    @Test
    public void groupColorsArePresetsOrNone() {
        String g = mTabs.createGroup("Research", open("https://a.example/"));
        mTabs.setGroupColor(g, "#376694");
        assertEquals("#376694", mStore.groups().get(0).color);
        mTabs.setGroupColor(g, "#123456");
        assertNull(mStore.groups().get(0).color);
    }

    @Test
    public void closingAGroupIsOneUndo() {
        String a = open("https://a.example/");
        String b = open("https://b.example/");
        open("https://c.example/");
        String g = mTabs.createGroup("Research", a);
        mTabs.moveToGroup(b, g);
        mTabs.closeGroup(g);
        assertEquals(List.of("https://c.example/"), urls());
        assertTrue(mTabs.undoClose());
        assertEquals(List.of("https://a.example/", "https://b.example/", "https://c.example/"), urls());
        assertEquals("Research", mStore.groups().get(0).name);
    }

    @Test
    public void ungroupingAndEmptyGroupsLeaveNoGroup() {
        String a = open("https://a.example/");
        String g = mTabs.createGroup("Research", a);
        mTabs.ungroup(g);
        assertTrue(mStore.groups().isEmpty());
        assertEquals(1, mTabs.sections().size());
        assertNull(mTabs.sections().get(0).groupId);
    }

    @Test
    public void aPlainNewTabIsUngroupedAndNewTabInGroupJoinsIt() {
        String a = open("https://a.example/");
        String g = mTabs.createGroup("Research", a);
        mStore.select(a);
        mTabs.newTab();
        assertNull(mStore.tabs(false).get(1).groupId);
        String inGroup = mTabs.newTabInGroup(g);
        for (TabStore.Entry e : mStore.tabs(false)) if (e.id.equals(inGroup)) assertEquals(g, e.groupId);
    }

    @Test
    public void duplicateOpensTheSameAddressNextToIt() {
        String a = open("https://a.example/");
        open("https://b.example/");
        mTabs.duplicate(a);
        assertEquals(List.of("https://a.example/", "https://a.example/", "https://b.example/"), urls());
    }

    @Test
    public void pinsAndMuteGoToTheStore() {
        String a = open("https://a.example/");
        mTabs.setPinned(a, true);
        mTabs.setMuted(a, true);
        assertTrue(mStore.tabs(false).get(0).pinned);
        assertTrue(mStore.tabs(false).get(0).muted);
    }

    @Test
    public void theReopenListKeepsTenAndPrivateTabsNeverJoinIt() {
        for (int i = 0; i < 12; i++) mTabs.close(open("https://" + i + ".example/"));
        mNow += BlancTabs.UNDO_MILLIS + 1;
        int reopened = 0;
        while (mTabs.reopenLast()) reopened++;
        assertEquals(10, reopened);
    }

    @Test
    public void openPutsAnAddressInANewTabOfTheShownList() {
        open("https://a.example/");
        mTabs.open("https://b.example/");
        assertEquals(List.of("https://a.example/", "https://b.example/"), urls());
        mTabs.newPrivateTab();
        mTabs.open("https://p.example/");
        assertEquals(2, mStore.tabs(true).size());
    }

    @Test
    public void undoEndsByItselfAfterFiveSeconds() {
        List<Runnable> later = new ArrayList<>();
        List<Long> delays = new ArrayList<>();
        BlancTabs tabs = new BlancTabs(mStore, () -> mNow, (run, delay) -> {
            later.add(run);
            delays.add(delay);
        });
        open("https://a.example/");
        String b = open("https://b.example/");
        tabs.close(b);
        assertEquals(List.of(BlancTabs.UNDO_MILLIS), delays);
        mNow += BlancTabs.UNDO_MILLIS + 1;
        later.get(0).run();
        assertNull(tabs.undoTitle());
        assertTrue(tabs.reopenLast());
    }

    @Test
    public void ungroupedPinsComeFirstAsTheirOwnSection() {
        String a = open("https://a.example/");
        String b = open("https://b.example/");
        mTabs.setPinned(b, true);
        List<TabSections.Section> sections = mTabs.displaySections();
        assertEquals(List.of(b), sections.get(0).tabIds);
        assertNull(sections.get(0).groupId);
        assertEquals(List.of(a), sections.get(1).tabIds);
    }

    @Test
    public void ungroupKeepsTheGroupsOrder() {
        String a = open("https://a.example/");
        String b = open("https://b.example/");
        String c = open("https://c.example/");
        String g = mTabs.createGroup("Reading", a);
        mTabs.moveToGroup(b, g);
        mTabs.moveToGroup(c, g);
        mTabs.ungroup(g);
        assertEquals(List.of("https://a.example/", "https://b.example/", "https://c.example/"), urls());
    }

    @Test
    public void aPrivateTabIsNeverGrouped() {
        open("https://a.example/");
        String secret = mStore.create("https://secret.example/", true, null, -1);
        assertEquals("", mTabs.createGroup("Secret", secret));
        assertTrue(mTabs.groups().isEmpty());
    }

    @Test
    public void undoAfterChromiumCommittedTheCloseOpensTheAddressAgain() {
        open("https://a.example/");
        String b = open("https://b.example/");
        mTabs.close(b);
        // Chromium commits pending closes when the app pauses, without telling Blanc.
        mStore.commitClose(b);
        assertTrue(mTabs.undoClose());
        assertEquals(List.of("https://a.example/", "https://b.example/"), urls());
    }

    @Test
    public void undoAfterChromiumCommittedTheLastTabNeverLeavesNoTabs() {
        String a = open("https://a.example/");
        mTabs.close(a);
        mStore.commitClose(a);
        assertTrue(mTabs.undoClose());
        assertEquals(List.of("https://a.example/"), urls());
    }
}
