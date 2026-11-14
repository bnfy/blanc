// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.settings.chromium;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.LocaleManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.res.Resources;
import android.net.Uri;
import android.os.Build;
import android.os.LocaleList;
import android.widget.Toast;

import org.chromium.base.ContextUtils;
import org.chromium.base.Log;
import org.chromium.blanc.blocking.BlockerBridge;
import org.chromium.blanc.firstrun.AppLanguages;
import org.chromium.blanc.firstrun.DefaultBrowser;
import org.chromium.blanc.firstrun.FirstMinute;
import org.chromium.blanc.island.R;
import org.chromium.blanc.settings.AllowedSites;
import org.chromium.blanc.settings.AllowedSitesDialog;
import org.chromium.blanc.settings.BlancSettingsScreen;
import org.chromium.blanc.settings.SettingsStore;
import org.chromium.blanc.settings.SiteDataClearer;
import org.chromium.blanc.settings.StartPageCustomize;
import org.chromium.blanc.sync.PairScanner;
import org.chromium.blanc.sync.SyncSheet;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;
import org.chromium.chrome.browser.browsing_data.BrowsingDataBridge;
import org.chromium.chrome.browser.browsing_data.BrowsingDataType;
import org.chromium.chrome.browser.browsing_data.TimePeriod;
import org.chromium.chrome.browser.lifetime.ApplicationLifetime;
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
    private static final String TAG = "BlancSettings";

    private final Activity mActivity;
    private final Supplier<@Nullable WindowAndroid> mWindow;
    private final Runnable mLicenses;
    private final boolean mSyncConnected;
    private final Runnable mOnSyncClosed;
    private final SettingsStore mStore = new SettingsStore(ContextUtils.getAppSharedPreferences());

    ChromiumSettingsHost(Activity activity, Supplier<@Nullable WindowAndroid> window, Runnable licenses,
            boolean syncConnected, Runnable onSyncClosed) {
        mActivity = activity;
        mWindow = window;
        mLicenses = licenses;
        mSyncConnected = syncConnected;
        mOnSyncClosed = onSyncClosed;
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

    @Override
    public void setSearchEngine(String id) {
        mStore.setSearchEngine(id);
        syncChromiumEngine();
    }

    /**
     * Chromium's default engine, which its own search surfaces use (the page menu's Search for), follows
     * Blanc's choice where Chromium has a matching engine. Kept in step at every Settings update, so a
     * fresh install doesn't keep sending those searches to Google.
     */
    void syncChromiumEngine() {
        TemplateUrlService service = TemplateUrlServiceFactory.getForProfile(ProfileManager.getLastUsedRegularProfile());
        if (!service.isLoaded()) return;
        String host = Uri.parse(mStore.searchTemplate().replace("%s", "x")).getHost();
        if (host == null) return;
        String bare = host.startsWith("www.") ? host.substring(4) : host;
        TemplateUrl current = service.getDefaultSearchEngineTemplateUrl();
        for (TemplateUrl url : service.getTemplateUrls()) {
            if (!(url.getKeyword().equals(bare) || url.getKeyword().endsWith("." + bare))) continue;
            if (current == null || !current.getKeyword().equals(url.getKeyword())) service.setSearchEngine(url.getKeyword());
            return;
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
        }, mOnSyncClosed);
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
        try {
            mActivity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (ActivityNotFoundException e) {
            // No browser or mail app to hand it to (a phone with no mail client): nothing to open.
            Log.w(TAG, "Nothing opens %s", url);
        }
    }

    @Override
    public void openLicenses() {
        mLicenses.run();
    }

    @Override
    public @Nullable Boolean defaultBrowser() {
        return DefaultBrowser.roles(mActivity).held();
    }

    // Android answers in its own dialog or screen; Settings reads the role again when it's back.
    @Override
    public void openDefaultBrowser() {
        DefaultBrowser.request(mActivity, DefaultBrowser.roles(mActivity), ContextUtils.getAppSharedPreferences());
    }

    @Override
    public boolean usagePing() {
        return Boolean.TRUE.equals(mStore.usagePing());
    }

    @Override
    public void setUsagePing(boolean on) {
        mStore.setUsagePing(on);
    }

    /** Chromium's own override, read at startup before Android 13 (ChromePreferenceKeys). */
    private static final String OVERRIDE_LANGUAGE = "Chrome.Language.ApplicationOverrideLanguage";

    /** The language Blanc was asked for, or null when it follows the phone's. */
    private @Nullable String chosenLanguage() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            LocaleManager manager = mActivity.getSystemService(LocaleManager.class);
            LocaleList locales = manager == null ? LocaleList.getEmptyLocaleList() : manager.getApplicationLocales();
            return locales.isEmpty() ? null : locales.get(0).toLanguageTag();
        }
        return ContextUtils.getAppSharedPreferences().getString(OVERRIDE_LANGUAGE, null);
    }

    /** "System (Deutsch)": the language Blanc shows when it follows the phone's. */
    private String systemLabel() {
        // Android 13's per-app language reaches Resources.getSystem() in Blanc's own process, so there
        // the phone's language comes from LocaleManager.
        LocaleList phoneLocales = Resources.getSystem().getConfiguration().getLocales();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            LocaleManager manager = mActivity.getSystemService(LocaleManager.class);
            if (manager != null) phoneLocales = manager.getSystemLocales();
        }
        String phone = phoneLocales.isEmpty() ? null : phoneLocales.get(0).toLanguageTag();
        return mActivity.getString(R.string.blanc_settings_language_system, AppLanguages.resolve(phone).endonym);
    }

    @Override
    public String languageSummary() {
        AppLanguages.Language chosen = AppLanguages.chosen(chosenLanguage());
        return chosen == null ? systemLabel() : chosen.endonym;
    }

    /**
     * System and the six languages. A choice is Android's per-app language (LocaleManager, the same
     * one Android's App languages screen sets) and Blanc restarts into it at once, since Chromium
     * loads its own pages' language when it starts.
     */
    @Override
    public void openLanguage() {
        AppLanguages.Language chosen = AppLanguages.chosen(chosenLanguage());
        CharSequence[] labels = new CharSequence[AppLanguages.ALL.size() + 1];
        labels[0] = systemLabel();
        int checked = 0;
        for (int i = 0; i < AppLanguages.ALL.size(); i++) {
            AppLanguages.Language language = AppLanguages.ALL.get(i);
            labels[i + 1] = language.endonym;
            if (chosen != null && chosen.tag.equals(language.tag)) checked = i + 1;
        }
        int current = checked;
        new AlertDialog.Builder(mActivity)
                .setTitle(R.string.blanc_settings_language_label)
                .setSingleChoiceItems(labels, checked, (dialog, which) -> {
                    dialog.dismiss();
                    if (which == current) return;
                    setLanguage(which == 0 ? null : AppLanguages.ALL.get(which - 1).tag);
                })
                .setNegativeButton(android.R.string.cancel, null)
                .show();
    }

    private void setLanguage(@Nullable String tag) {
        @Nullable LocaleManager manager = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            manager = mActivity.getSystemService(LocaleManager.class);
            if (manager == null) return;
        }
        // Before the switch: Android may recreate Settings for it, which restarts Blanc with this set.
        ApplicationLifetime.setRestartForLocaleSwitch(true);
        if (manager != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            manager.setApplicationLocales(tag == null ? LocaleList.getEmptyLocaleList() : LocaleList.forLanguageTags(tag));
        } else {
            ContextUtils.getAppSharedPreferences().edit().putString(OVERRIDE_LANGUAGE, tag).commit();
        }
        ApplicationLifetime.terminate(true);
    }

    // The card rises over the browser once Settings has closed.
    @Override
    public void showWelcome() {
        FirstMinute.requestReplay();
        mActivity.finish();
    }

    // The Island opens Customize on the Start Page (StartPageCustomize) as Settings closes over it.
    @Override
    public void openStartPage() {
        StartPageCustomize.request(ContextUtils.getAppSharedPreferences());
        mActivity.finish();
    }
}
