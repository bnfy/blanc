// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.firstrun;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.Activity;
import android.content.SharedPreferences;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.widget.CompoundButton;
import android.widget.TextView;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

import org.chromium.base.Callback;
import org.chromium.base.test.BaseRobolectricTestRunner;
import org.chromium.blanc.firstrun.WalkthroughFlow.Step;
import org.chromium.blanc.island.R;
import org.chromium.blanc.settings.SettingsStore;
import org.chromium.build.annotations.Nullable;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** The walkthrough card: each step's content, pairing on the Sync screen, and closing by any path. */
@RunWith(BaseRobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class WalkthroughSheetTest {
    private final Map<String, String> mReplies = new HashMap<>();
    private final List<String> mCalls = new ArrayList<>();
    private Activity mActivity;
    private SharedPreferences mPrefs;
    private SettingsStore mStore;
    private @Nullable Boolean mDefault = false;
    private @Nullable Runnable mPairingClosed;
    private boolean mFinished;

    private final WalkthroughSheet.Host mHost = new WalkthroughSheet.Host() {
        @Override
        public void call(String method, String argsJson, Callback<String> done) {
            mCalls.add(method + " " + argsJson);
            done.onResult(mReplies.getOrDefault(method, "{\"ok\":true,\"value\":{\"ok\":true}}"));
        }

        @Override public @Nullable Boolean isDefaultBrowser() { return mDefault; }
        @Override public void requestDefaultBrowser() { mCalls.add("default browser"); }
        @Override public void openPairing(Runnable onClosed) { mCalls.add("pairing"); mPairingClosed = onClosed; }
        @Override public void openSharedSpaces(Runnable onDone) { mCalls.add("shared spaces"); }
        @Override public void finished() { mFinished = true; }
    };

    private void reply(String method, String value) {
        mReplies.put(method, "{\"ok\":true,\"value\":" + value + "}");
    }

    @Before
    public void setUp() {
        mActivity = Robolectric.buildActivity(Activity.class).setup().get();
        mPrefs = RuntimeEnvironment.getApplication().getSharedPreferences("walkthrough", 0);
        mPrefs.edit().clear().commit();
        mStore = new SettingsStore(mPrefs);
        reply("sync.status", "{\"enabled\":false}");
        reply("spaces.status", "{\"enabled\":false}");
    }

    private WalkthroughSheet show(WalkthroughFlow flow) {
        WalkthroughSheet sheet = new WalkthroughSheet(mActivity, mHost, mStore, flow);
        sheet.show();
        idle();
        return sheet;
    }

    private static void idle() {
        shadowOf(Looper.getMainLooper()).idle();
    }

    private View root() {
        // The dialog's own window holds the card.
        View card = org.robolectric.shadows.ShadowDialog.getLatestDialog().findViewById(R.id.blanc_walkthrough_content);
        assertNotNull(card);
        return card.getRootView();
    }

    private @Nullable View tagged(String tag) {
        return root().findViewWithTag(tag);
    }

    private void press(String tag) {
        View view = tagged(tag);
        assertNotNull(tag, view);
        view.performClick();
        idle();
    }

    private List<String> texts() {
        List<String> out = new ArrayList<>();
        collect(root().findViewById(R.id.blanc_walkthrough_content), out);
        collect(root().findViewById(R.id.blanc_walkthrough_actions), out);
        return out;
    }

    private static void collect(View view, List<String> out) {
        if (view instanceof TextView text && view.getVisibility() == View.VISIBLE) out.add(text.getText().toString());
        if (view instanceof ViewGroup group) {
            for (int i = 0; i < group.getChildCount(); i++) collect(group.getChildAt(i), out);
        }
    }

    @Test
    public void welcomeLeadsWithPairingAndHasNoCloseButton() {
        show(new WalkthroughFlow(false, 0, null));
        List<String> texts = texts();
        assertTrue(texts.contains("Your Blanc, in your pocket."));
        assertTrue(texts.contains("Pair with your Blanc"));
        assertTrue(texts.contains("Browse without pairing"));
        assertEquals(View.GONE, root().findViewById(R.id.blanc_walkthrough_close).getVisibility());
    }

    @Test
    public void pairingOpensTheSyncScreenAndAJoinShowsWhatArrived() {
        WalkthroughSheet sheet = show(new WalkthroughFlow(false, 0, null));
        press("welcome.pair");
        assertTrue(mCalls.contains("pairing"));
        assertFalse(sheet.isShowing());
        reply("sync.status", "{\"enabled\":true,\"handle\":\"anthony\",\"lastSyncedAt\":0}");
        mPairingClosed.run();
        idle();
        assertTrue(sheet.isShowing());
        assertEquals(Step.ARRIVED, sheet.step());
        assertTrue(texts().contains("Connected to “anthony”"));
        assertTrue(texts().contains("Bringing them over…"));
    }

    @Test
    public void whatArrivedCountsTabsFavoritesAndSpacesOnceTheFirstPassIsIn() {
        WalkthroughSheet sheet = show(new WalkthroughFlow(false, 0, null));
        press("welcome.pair");
        reply("sync.status", "{\"enabled\":true,\"handle\":\"anthony\",\"lastSyncedAt\":5}");
        reply("sync.listRemoteDevices", "[{\"name\":\"Studio\",\"tabs\":[{\"url\":\"https://a.example\"},"
                + "{\"url\":\"https://b.example\"}]},{\"name\":\"Laptop\",\"tabs\":[]}]");
        reply("bookmarks.listBookmarks", "[{\"url\":\"https://a.example\"},{\"url\":\"https://b.example\"},"
                + "{\"url\":\"https://c.example\",\"deleted\":true}]");
        reply("spaces.status", "{\"enabled\":false,\"spaces\":3}");
        mPairingClosed.run();
        idle();
        assertEquals(Step.ARRIVED, sheet.step());
        List<String> texts = texts();
        int tabs = texts.indexOf("Open tabs on Studio");
        assertTrue(texts.toString(), tabs >= 0);
        assertEquals("2", texts.get(tabs + 1));
        assertFalse(texts.contains("Open tabs on Laptop"));
        assertEquals("2", texts.get(texts.indexOf("Favorites") + 1));
        assertEquals("3", texts.get(texts.indexOf("Spaces") + 1));
    }

    @Test
    public void leavingTheSyncScreenWithoutJoiningComesBackToWelcome() {
        WalkthroughSheet sheet = show(new WalkthroughFlow(false, 0, null));
        press("welcome.pair");
        mPairingClosed.run();
        idle();
        assertTrue(sheet.isShowing());
        assertEquals(Step.WELCOME, sheet.step());
    }

    @Test
    public void shareBackTurnsOnSharingOpenTabsThroughTheRunner() {
        WalkthroughSheet sheet = show(new WalkthroughFlow(true, 0, null));
        assertEquals(Step.SHARE_BACK, sheet.step());
        assertTrue(texts().contains("Share from this phone"));
        ((CompoundButton) tagged("welcome.shareTabs")).setChecked(true);
        assertTrue(mCalls.contains("sync.setSyncTabs [true]"));
        ((CompoundButton) tagged("welcome.spaces")).setChecked(true);
        assertTrue(mCalls.contains("shared spaces"));
    }

    @Test
    public void continueOnPrivacySavesTheChoiceAndOffersTheDefaultBrowser() {
        WalkthroughSheet sheet = show(new WalkthroughFlow(false, 0, null));
        press("welcome.browse");
        assertEquals(Step.PRIVACY, sheet.step());
        CompoundButton usage = (CompoundButton) tagged("welcome.measureUsage");
        assertTrue("the switch shows the default", usage.isChecked());
        assertNull("nothing is saved before Continue", mStore.usagePing());
        usage.setChecked(false);
        press("welcome.continue");
        assertEquals(false, mStore.usagePing());
        assertEquals(Step.DEFAULT_BROWSER, sheet.step());
        assertTrue(texts().contains("Open links in Blanc"));
        press("welcome.setDefault");
        assertTrue(mCalls.contains("default browser"));
    }

    @Test
    public void androidMakingBlancTheDefaultShowsDoneWhenBlancIsBack() {
        WalkthroughSheet sheet = show(new WalkthroughFlow(false, 0, null));
        press("welcome.browse");
        press("welcome.continue");
        mDefault = true;
        sheet.onResumed();
        idle();
        assertTrue(texts().contains("Blanc is your default browser"));
        press("welcome.done");
        assertFalse(sheet.isShowing());
        assertTrue(mFinished);
        assertEquals(WalkthroughFlow.VERSION, mStore.walkthroughCompletedVersion());
    }

    @Test
    public void notNowFinishesTheCard() {
        WalkthroughSheet sheet = show(new WalkthroughFlow(false, 0, null));
        press("welcome.browse");
        press("welcome.continue");
        press("welcome.notNow");
        assertFalse(sheet.isShowing());
        assertEquals(WalkthroughFlow.VERSION, mStore.walkthroughCompletedVersion());
    }

    @Test
    public void closingOnPrivacySavesWhatTheSwitchShows() {
        WalkthroughSheet sheet = show(new WalkthroughFlow(false, 0, null));
        press("welcome.browse");
        press("welcome.close");
        assertFalse(sheet.isShowing());
        assertEquals(true, mStore.usagePing());
        assertEquals(WalkthroughFlow.VERSION, mStore.walkthroughCompletedVersion());
    }

    @Test
    public void closingBeforePrivacySavesNoChoiceSoNothingIsSent() {
        WalkthroughSheet sheet = show(new WalkthroughFlow(true, 0, null));
        press("welcome.close");
        assertFalse(sheet.isShowing());
        assertNull(mStore.usagePing());
        assertEquals(WalkthroughFlow.VERSION, mStore.walkthroughCompletedVersion());
    }

    @Test
    public void blancAlreadyTheDefaultSkipsTheOffer() {
        mDefault = true;
        WalkthroughSheet sheet = show(new WalkthroughFlow(false, 0, null));
        press("welcome.browse");
        press("welcome.continue");
        assertFalse(sheet.isShowing());
        assertTrue(mFinished);
    }
}
