// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.tabs;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.view.inputmethod.EditorInfo;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.shadows.ShadowLooper;

import org.chromium.base.test.BaseRobolectricTestRunner;
import org.chromium.blanc.palette.PaletteSheet;

import java.util.ArrayList;
import java.util.List;

/** The palette as Blanc for iPhone draws it (PaletteSheet.swift), over a plain tab store. */
@RunWith(BaseRobolectricTestRunner.class)
public class PaletteSheetTest {
    private Activity mActivity;
    private FakeTabStore mStore;
    private BlancTabs mTabs;
    private final List<String> mLoaded = new ArrayList<>();
    private final List<String> mOpened = new ArrayList<>();
    private final List<String> mThemes = new ArrayList<>();
    private List<QuickSwitcher.Page> mFavorites = new ArrayList<>();
    private String mA;
    private String mB;
    private String mC;

    private final PaletteSheet.Callbacks mCallbacks =
            new PaletteSheet.Callbacks() {
                @Override
                public void load(String url) {
                    mLoaded.add(url);
                }

                @Override
                public void openTab(String url) {
                    mOpened.add(url);
                }

                @Override
                public void setTheme(String argument) {
                    mThemes.add(argument);
                }

                @Override
                public List<QuickSwitcher.Page> favorites() {
                    return mFavorites;
                }

                @Override
                public void find() {
                    mThemes.add("find");
                }
            };

    @Before
    public void setUp() {
        mActivity = Robolectric.buildActivity(Activity.class).setup().get();
        mStore = new FakeTabStore();
        mTabs = new BlancTabs(mStore, () -> 0);
        mA = mStore.create("https://a.example/", false, null, -1);
        mB = mStore.create("https://b.example/", false, null, -1);
        mC = mStore.create("https://example.com/", false, null, -1);
        String g = mTabs.createGroup("Research", mA);
        mTabs.moveToGroup(mB, g);
        mStore.select(mC);
    }

    private PaletteSheet show() {
        PaletteSheet sheet = PaletteSheet.show(mActivity, mTabs, mCallbacks);
        ShadowLooper.idleMainLooper();
        return sheet;
    }

    private static List<String> titles(PaletteSheet sheet, PaletteSheet.RowKind kind) {
        List<String> out = new ArrayList<>();
        for (PaletteSheet.Row row : sheet.rows()) if (row.kind == kind) out.add(row.title);
        return out;
    }

    private static PaletteSheet.Row row(PaletteSheet sheet, String title) {
        for (PaletteSheet.Row row : sheet.rows()) if (row.title.equals(title)) return row;
        throw new AssertionError("no row " + title);
    }

    private static void type(PaletteSheet sheet, String text) {
        sheet.field().setText(text);
        ShadowLooper.idleMainLooper();
    }

    private static void go(PaletteSheet sheet) {
        sheet.field().onEditorAction(EditorInfo.IME_ACTION_GO);
        ShadowLooper.idleMainLooper();
    }

    @Test
    public void atRestItListsTheTabsByGroupWithTheActiveTabSelected() {
        PaletteSheet sheet = show();
        assertEquals(PaletteSheet.Mode.TABS, sheet.mode());
        assertEquals(List.of("Open tabs"), titles(sheet, PaletteSheet.RowKind.HEADING));
        assertEquals(List.of("Research"), titles(sheet, PaletteSheet.RowKind.GROUP));
        assertEquals("2", row(sheet, "Research").subtitle);
        assertEquals(List.of("https://a.example/", "https://b.example/", "https://example.com/"),
                titles(sheet, PaletteSheet.RowKind.TAB));
        assertTrue(row(sheet, "https://example.com/").selected);
        assertFalse(row(sheet, "https://a.example/").selected);
    }

    @Test
    public void aGroupsHeaderFoldsIt() {
        PaletteSheet sheet = show();
        row(sheet, "Research").view.performClick();
        ShadowLooper.idleMainLooper();
        assertEquals(List.of("https://example.com/"), titles(sheet, PaletteSheet.RowKind.TAB));
        assertTrue(mStore.groups().get(0).collapsed);
        // As desktop's panel and the shared scenario (F3-3) show it.
        assertEquals(List.of("2 tabs tucked away"), titles(sheet, PaletteSheet.RowKind.TUCKED));
    }

    @Test
    public void privateTabsAreTheirOwnSectionAfterTheNormalTabs() {
        mStore.create("https://p.example/", true, null, -1);
        mStore.select(mC);
        PaletteSheet sheet = show();
        assertEquals(List.of("Open tabs", "Private"), titles(sheet, PaletteSheet.RowKind.HEADING));
        List<String> tabs = titles(sheet, PaletteSheet.RowKind.TAB);
        assertEquals("https://p.example/", tabs.get(tabs.size() - 1));
    }

    @Test
    public void tappingATabSwitchesToItAndItsCloseButtonClosesIt() {
        PaletteSheet sheet = show();
        row(sheet, "https://a.example/").view.performClick();
        assertEquals(mA, mStore.activeId(false));
        assertFalse(sheet.isShowing());
        PaletteSheet again = show();
        PaletteSheet.Row b = row(again, "https://b.example/");
        assertEquals("Close https://b.example/", b.close.getContentDescription().toString());
        b.close.performClick();
        ShadowLooper.idleMainLooper();
        assertFalse(titles(again, PaletteSheet.RowKind.TAB).contains("https://b.example/"));
    }

    @Test
    public void slashListsA2sCommandsWithTheirHints() {
        PaletteSheet sheet = show();
        type(sheet, "/");
        assertEquals(PaletteSheet.Mode.SLASH, sheet.mode());
        assertEquals(List.of("/favorites", "/history", "/new", "/private", "/close", "/reopen", "/group",
                "/ungroup", "/close-group", "/find", "/theme"), titles(sheet, PaletteSheet.RowKind.COMMAND));
        assertEquals("Close this tab", row(sheet, "/close").subtitle);
        type(sheet, "/cl");
        assertEquals(List.of("/close", "/close-group"), titles(sheet, PaletteSheet.RowKind.COMMAND));
        type(sheet, "/zz");
        assertEquals(List.of("No matching command"), titles(sheet, PaletteSheet.RowKind.EMPTY));
    }

    @Test
    public void aBareGroupCommandAsksForANameAndANamedOneGroupsTheTab() {
        PaletteSheet sheet = show();
        type(sheet, "/group");
        go(sheet);
        assertTrue(sheet.isShowing());
        assertEquals("/group ", sheet.field().getText().toString());
        type(sheet, "/group research");
        go(sheet);
        assertFalse(sheet.isShowing());
        assertEquals(1, mStore.groups().size());
        assertEquals(mStore.groups().get(0).id, mStore.tabs(false).get(2).groupId);
    }

    @Test
    public void commandsRunThroughTheTabsAndCallbacks() {
        go(withText("/new"));
        assertEquals(4, mStore.tabs(false).size());
        go(withText("/close"));
        assertEquals(3, mStore.tabs(false).size());
        go(withText("/reopen"));
        assertEquals(4, mStore.tabs(false).size());
        go(withText("/favorites"));
        go(withText("/theme dark"));
        assertEquals(List.of("chrome://blanc/bookmarks.html"), mOpened);
        assertEquals(List.of("dark"), mThemes);
        go(withText("/find"));
        assertEquals(List.of("dark", "find"), mThemes);
        go(withText("/private"));
        assertEquals(1, mStore.tabs(true).size());
    }

    private PaletteSheet withText(String text) {
        PaletteSheet sheet = show();
        type(sheet, text);
        return sheet;
    }

    @Test
    public void typingSearchesTabsAndFavorites() {
        mFavorites = List.of(new QuickSwitcher.Page("f", "Example docs", "https://docs.example/"));
        PaletteSheet sheet = show();
        type(sheet, "exa");
        assertEquals(PaletteSheet.Mode.SWITCHER, sheet.mode());
        List<String> results = titles(sheet, PaletteSheet.RowKind.RESULT);
        assertTrue(results.size() <= 12);
        assertEquals("Example docs", results.get(results.size() - 1));
        type(sheet, "zzzz");
        assertEquals(List.of("No matches. Press Return to open it as an address or search."),
                titles(sheet, PaletteSheet.RowKind.EMPTY));
    }

    @Test
    public void goOpensAStrongMatchOrLoadsTheTypedAddressOrSearch() {
        mStore.select(mA);
        go(withText("example.com"));
        assertEquals(List.of("https://example.com"), mLoaded);
        go(withText("how tall is everest"));
        assertEquals("https://duckduckgo.com/?q=how%20tall%20is%20everest", mLoaded.get(1));
        PaletteSheet sheet = withText("b.example/");
        go(sheet);
        assertEquals(3, mLoaded.size());
        PaletteSheet strong = withText("research");
        go(strong);
        assertEquals(3, mLoaded.size());
        assertEquals(mA, mStore.activeId(false));
    }

    @Test
    public void theFooterOpensANewTabAndThePages() {
        PaletteSheet sheet = show();
        sheet.newTabButton().performClick();
        assertEquals(4, mStore.tabs(false).size());
        assertFalse(sheet.isShowing());
        PaletteSheet again = show();
        again.historyButton().performClick();
        assertEquals(List.of("chrome://blanc/history.html"), mOpened);
    }

    @Test
    public void controlsHaveTheIphonesLabels() {
        PaletteSheet sheet = show();
        assertEquals("Search, enter address, or / command", sheet.field().getHint().toString());
        assertEquals("Clear search", sheet.clearButton().getContentDescription().toString());
        assertEquals("Collapse Island", sheet.collapseButton().getContentDescription().toString());
        assertEquals("Favorites", sheet.favoritesButton().getContentDescription().toString());
        sheet.collapseButton().performClick();
        assertFalse(sheet.isShowing());
    }

    @Test
    public void blancAddressesOpenTheServedPagesAndUnservedOnesNothing() {
        go(withText("blanc://history"));
        assertEquals(List.of("chrome://blanc/history.html"), mLoaded);
        go(withText("blanc://newtab/?private=1"));
        assertEquals("chrome://blanc/newtab.html?private=1", mLoaded.get(1));
        PaletteSheet settings = withText("blanc://settings");
        go(settings);
        assertEquals(2, mLoaded.size());
        assertFalse(settings.isShowing());
    }

    @Test
    public void aGroupsHeaderSaysItsCountAndWhetherItIsFolded() {
        PaletteSheet sheet = show();
        assertEquals("Research, 2 tabs, Fold group", row(sheet, "Research").view.getContentDescription().toString());
    }
}
