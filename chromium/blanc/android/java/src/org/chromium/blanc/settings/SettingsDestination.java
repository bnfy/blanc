// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.settings;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/**
 * Where a blanc://settings address leads, as SettingsDestination.resolve does in the iPhone's
 * SettingsSheet.swift: only the scheme and host decide that it is Settings, and the fragment picks
 * the part.
 */
@NullMarked
public enum SettingsDestination {
    ROOT,
    PRIVACY,
    SYNC,
    START_PAGE;

    /** The destination for `url`, or null if it isn't a blanc://settings address. */
    public static @Nullable SettingsDestination resolve(String url) {
        URI uri;
        try {
            uri = new URI(url);
        } catch (URISyntaxException e) {
            return null;
        }
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (scheme == null || host == null) return null;
        if (!scheme.toLowerCase(Locale.ROOT).equals("blanc") || !host.toLowerCase(Locale.ROOT).equals("settings")) {
            return null;
        }
        String fragment = uri.getFragment();
        if (fragment == null) return ROOT;
        switch (fragment.toLowerCase(Locale.ROOT)) {
            case "group-sync":
            case "sync":
                return SYNC;
            case "group-privacy":
            case "privacy":
                return PRIVACY;
            case "start-page":
            case "startpage":
            case "group-startpage":
                return START_PAGE;
            default:
                return ROOT;
        }
    }
}
