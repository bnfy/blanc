// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The desktop pairing sheet's QR link, https://blanc.day/pair#CODE. The code rides in the fragment,
 * which no server sees; Blanc reads it here and never loads the link. Only this exact shape counts,
 * so a near miss is never mistaken for a code.
 */
@NullMarked
public final class PairLink {
    private static final Pattern LINK =
            Pattern.compile("^(?i:https)://(?i:blanc\\.day)/pair#(.+)$", Pattern.DOTALL);

    private PairLink() {}

    public static @Nullable String code(String link) {
        for (int i = 0; i < link.length(); i++) {
            char c = link.charAt(i);
            if (c <= 0x20 || c == 0x7f || Character.isWhitespace(c)) return null;
        }
        Matcher match = LINK.matcher(link);
        return match.matches() ? SyncCode.normalize(match.group(1)) : null;
    }
}
