// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.settings.chromium;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.widget.Toast;

import org.chromium.base.ContextUtils;
import org.chromium.base.Callback;
import org.chromium.blanc.blocking.BlockerBridge;
import org.chromium.blanc.island.R;
import org.chromium.blanc.settings.AllowedSites;
import org.chromium.blanc.settings.AllowedSitesDialog;
import org.chromium.blanc.settings.BlancSettingsScreen;
import org.chromium.blanc.settings.SettingsStore;
import org.chromium.blanc.settings.SiteDataClearer;
import org.chromium.blanc.sync.PairScanner;
import org.chromium.blanc.sync.SyncSheet;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;
import org.chromium.chrome.browser.browsing_data.BrowsingDataBridge;
import org.chromium.chrome.browser.browsing_data.BrowsingDataType;
import org.chromium.chrome.browser.browsing_data.TimePeriod;
import org.chromium.chrome.browser.profiles.Profile;
import org.chromium.chrome.browser.profiles.ProfileManager;
import org.chromium.chrome.browser.search_engines.TemplateUrlServiceFactory;
import org.chromium.components.search_engines.TemplateUrl;
import org.chromium.components.search_engines.TemplateUrlService;
import org.chromium.ui.base.WindowAndroid;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;

/** Blanc's Settings rows wired to the app: the stores, the blocker, Sync, Chromium's data clearing. */
@NullMarked
final class ChromiumSettingsHost implements BlancSettingsScreen.Host {
    private final Activity mActivity;
    private final Supplier<@Nullable WindowAndroid> mWindow;
    private final Runnable mLicenses;
    private final boolean mSyncConnected;
    private final SettingsStore mStore = new SettingsStore(ContextUtils.getAppSharedPreferences());

    ChromiumSettingsHost(Activity activity, Supplier<@Nullable WindowAndroid> window, Runnable licenses, boolean syncConnected) {
        mActivity = activity;
        mWindow = window;
        mLicenses = licenses;
        mSyncConnected = syncConnected;
    }

    @Override
    public Context context() {
        return mActivity;
    }

    @Override
    public boolean debugBuild() {
        return (mActivity.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    @Override
    public boolean syncConnected() {
        return mSyncConnected;
    }

    @Override
    public String appName() {
        return mActivity.getApplicationInfo().loadLabel(mActivity.getPackageManager()).toString();
    }

    @Override
    public String version() {
        try {
            return mActivity.getPackageManager().getPackageInfo(mActivity.getPackageName(), 0).versionName;
        } catch (PackageManager.NameNotFoundException e) {
            return "";
        }
    }

    @Override
    public String theme() {
        return mStore.theme();
    }

    @Override
    public void setTheme(String value) {
        mStore.setTheme(value);
    }

    @Override
    public String searchEngine() {
        return mStore.searchEngine();
    }

    /** Blanc's own choice, and Chromium's default engine where it has a match, so no stray surface searches Google. */
    @Override
    public void setSearchEngine(String id) {
        mStore.setSearchEngine(id);
        Profile profile = ProfileManager.getLastUsedRegularProfile();
        TemplateUrlService service = TemplateUrlServiceFactory.getForProfile(profile);
        String host = Uri.parse(mStore.searchTemplate().replace("%s", "x")).getHost();
        if (host == null) return;
        String bare = host.startsWith("www.") ? host.substring(4) : host;
        for (TemplateUrl url : service.getTemplateUrls()) {
            if (url.getKeyword().equals(bare) || url.getKeyword().endsWith("." + bare)) {
                service.setSearchEngine(url.getKeyword());
                return;
            }
        }
    }

    @Override
    public String islandPosition() {
        return mStore.islandPosition();
    }

    @Override
    public void setIslandPosition(String value) {
        mStore.setIslandPosition(value);
    }

    @Override
    public boolean blockerEnabled() {
        return BlockerBridge.profileEnabled();
    }

    @Override
    public void setBlockerEnabled(boolean on) {
        BlockerBridge.setProfileEnabled(on);
    }

    @Override
    public void openSync() {
        SyncSheet.open(mActivity, (permission, done) -> {
            WindowAndroid window = mWindow.get();
            if (window == null) {
                done.onResult(false);
                return;
            }
            window.requestPermissions(new String[] {permission},
                    (permissions, results) -> done.onResult(results.length > 0
                            && results[0] == PackageManager.PERMISSION_GRANTED));
        });
    }

    @Override
    public void openAllowedSites() {
        new AllowedSitesDialog(mActivity, new AllowedSitesDialog.Backend() {
            @Override
            public List<String> sites() {
                return new ArrayList<>(List.of(BlockerBridge.allowedSites()));
            }

            @Override
            public void setAllowed(String host, boolean allow) {
                BlockerBridge.allowSite(host, allow);
            }
        }).show();
    }

    @Override
    public void clearSiteData() {
        new AlertDialog.Builder(mActivity)
                .setMessage(R.string.blanc_settings_privacy_clear_browsing_data_confirm)
                .setNegativeButton(android.R.string.cancel, null)
                .setPositiveButton(R.string.blanc_settings_privacy_clear_browsing_data, (d, w) -> clear())
                .show();
    }

    private void clear() {
        int[] types = new int[SiteDataClearer.KINDS.size()];
        for (int i = 0; i < types.length; i++) {
            types[i] = SiteDataClearer.KINDS.get(i).equals("cache") ? BrowsingDataType.CACHE : BrowsingDataType.SITE_DATA;
        }
        BrowsingDataBridge.getForProfile(ProfileManager.getLastUsedRegularProfile())
                .clearBrowsingData(() -> Toast.makeText(mActivity,
                        R.string.blanc_settings_privacy_clear_browsing_data_done, Toast.LENGTH_SHORT).show(),
                        types, TimePeriod.ALL_TIME);
    }

    @Override
    public void openUrl(String url) {
        mActivity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
    }

    @Override
    public void openLicenses() {
        mLicenses.run();
    }
}
