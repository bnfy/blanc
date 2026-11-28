// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.address;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

/**
 * What text shared into Blanc opens when it holds no http(s) address (A6 ruling SH1, patch 0129):
 * the same thing the Island opens for that text typed into it. An address loads; anything else
 * searches with the engine in Blanc's Settings, never Chromium's default engine. Blanc's own pages
 * open the page Android serves, or nothing; a link for another app (mailto:, tel:…) opens nothing,
 * since sharing text is not asking to leave Blanc. Settings and Downloads aren't served pages, so a
 * shared blanc://settings opens nothing, as a link to it from a page does.
 */
@NullMarked
public final class SharedText {
    /** Shared text past this many characters is cut before it becomes a search. */
    static final int MAX_LENGTH = 2048;

    private SharedText() {}

    /** The address to open for shared text, or null to open nothing. */
    public static @Nullable String url(String text, String searchTemplate) {
        String trimmed = AddressInput.trim(text);
        if (trimmed.isEmpty()) return null;
        if (trimmed.length() > MAX_LENGTH) trimmed = trimmed.substring(0, MAX_LENGTH);
        AddressInput.Result r = AddressInput.interpret(trimmed);
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
