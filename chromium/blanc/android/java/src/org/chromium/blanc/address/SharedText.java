// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.address;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

/**
 * What text shared into Blanc opens when it holds no http(s) address (A6 ruling SH1, patch 0129):
 * the same thing the Island opens for that text typed into it. An address loads; anything else
 * searches with the engine in Blanc's Settings, never Chromium's default engine. Blanc's own pages
 * open the page Android serves, or nothing; a link for another app (mailto:, tel:…) opens nothing,
 * since sharing text is not asking to leave Blanc.
 */
@NullMarked
public final class SharedText {
    private SharedText() {}

    /** The address to open for shared text, or null to open nothing. */
    public static @Nullable String url(String text, String searchTemplate) {
        if (AddressInput.trim(text).isEmpty()) return null;
        AddressInput.Result r = AddressInput.interpret(text);
        switch (r.kind) {
            case SEARCH:
                return AddressInput.searchUrl(r.value, searchTemplate);
            case ADDRESS:
                return AddressInput.isBlancPage(r.value) ? AddressInput.servedPage(r.value) : r.value;
            default:
                return null;
        }
    }
}
