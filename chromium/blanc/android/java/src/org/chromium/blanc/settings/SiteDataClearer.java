// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.settings;

import org.chromium.build.annotations.NullMarked;

import java.util.List;

/**
 * What Settings → Privacy → Clear site data removes, as the iPhone's does: cookies, storage and the
 * cache for every site, for all time. History, passwords, form data, Favorites and tabs are never
 * touched. The Chromium side maps each name to its BrowsingDataType.
 */
@NullMarked
public final class SiteDataClearer {
    public static final List<String> KINDS = List.of("site_data", "cache");

    private SiteDataClearer() {}
}
