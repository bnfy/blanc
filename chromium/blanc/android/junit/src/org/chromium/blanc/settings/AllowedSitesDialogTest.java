// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.settings;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.TextView;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowLooper;

import org.chromium.base.test.BaseRobolectricTestRunner;

import java.util.ArrayList;
import java.util.List;

/** The allowed-sites editor (Settings → Privacy), the iPhone's page as a dialog. */
@RunWith(BaseRobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class AllowedSitesDialogTest implements AllowedSitesDialog.Backend {
    private final List<String> mSites = new ArrayList<>(List.of("a.com", "b.com"));
    private final List<String> mCalls = new ArrayList<>();
    private Activity mActivity;
    private AllowedSitesDialog mDialog;

    @Override
    public List<String> sites() {
        return new ArrayList<>(mSites);
    }

    @Override
    public void setAllowed(String host, boolean allow) {
        mCalls.add((allow ? "allow " : "block ") + host);
        if (allow) mSites.add(host);
        else mSites.remove(host);
    }

    @Before
    public void setUp() {
        mActivity = Robolectric.buildActivity(Activity.class).setup().get();
        mDialog = new AllowedSitesDialog(mActivity, this);
        mDialog.show();
    }

    private static void collect(View view, String tag, List<View> out) {
        if (tag.equals(view.getTag())) out.add(view);
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) collect(group.getChildAt(i), tag, out);
        }
    }

    private List<View> tagged(String tag) {
        List<View> out = new ArrayList<>();
        collect(mDialog.root(), tag, out);
        return out;
    }

    private void add(String text) {
        EditText field = (EditText) tagged("allowed.field").get(0);
        field.setText(text);
        field.onEditorAction(EditorInfo.IME_ACTION_DONE);
        ShadowLooper.idleMainLooper();
    }

    private String error() {
        List<View> errors = tagged("allowed.error");
        return errors.isEmpty() ? "" : ((TextView) errors.get(0)).getText().toString();
    }

    @Test
    public void listsEachSiteWithARemoveButtonNamingIt() {
        assertEquals(2, tagged("allowed.site").size());
        List<View> removes = tagged("allowed.remove");
        assertEquals(2, removes.size());
        assertEquals("Remove site: a.com", removes.get(0).getContentDescription().toString());
    }

    @Test
    public void addingAValidSiteAddsItsNormalizedHostAndClearsTheField() {
        add("https://www.C.com/x");
        assertEquals(List.of("allow c.com"), mCalls);
        assertEquals(3, tagged("allowed.site").size());
        assertEquals("", ((EditText) tagged("allowed.field").get(0)).getText().toString());
        assertEquals("", error());
    }

    @Test
    public void anInvalidOrDuplicateSiteShowsTheIphonesMessageAndWritesNothing() {
        add("nope nope");
        assertEquals("Enter a valid website address.", error());
        add("www.a.com");
        assertEquals("This site is already allowed.", error());
        assertTrue(mCalls.isEmpty());
    }

    @Test
    public void removingASiteBlocksItAgainAndDropsItsRow() {
        tagged("allowed.remove").get(0).performClick();
        assertEquals(List.of("block a.com"), mCalls);
        assertEquals(1, tagged("allowed.site").size());
        assertNotNull(tagged("allowed.field").get(0));
    }
}
