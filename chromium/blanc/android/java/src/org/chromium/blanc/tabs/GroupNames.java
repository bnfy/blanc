// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.tabs;

import android.icu.lang.UCharacter;
import android.icu.lang.UProperty;

import org.chromium.blanc.address.AddressInput;
import org.chromium.build.annotations.NullMarked;

import java.util.Locale;

/**
 * Group names keep the case typed and compare without regard to it, as desktop's
 * src/main/group-name-case.js and the iPhone's GroupNames (TabGroups.swift).
 */
@NullMarked
public final class GroupNames {
    public static final int MAX_LENGTH = 40;

    private GroupNames() {}

    /** A storable name: JavaScript-trimmed and capped at 40 UTF-16 units, case kept. */
    public static String normalize(String raw) {
        String trimmed = AddressInput.trim(raw);
        return trimmed.length() > MAX_LENGTH ? trimmed.substring(0, MAX_LENGTH) : trimmed;
    }

    /** Two names with the same key name the same group (JavaScript's toLowerCase). */
    public static String key(String name) {
        return lowercaseLikeJavaScript(normalize(name));
    }

    /**
     * JavaScript's String.prototype.toLowerCase: each code point's default lowercase, plus its one
     * context rule, Final_Sigma (Σ becomes ς at the end of a word), which Java applies differently.
     * A port of the iPhone's SyncCrypto.lowercaseLikeJavaScript.
     */
    static String lowercaseLikeJavaScript(String text) {
        StringBuilder out = new StringBuilder(text.length());
        for (int i = 0; i < text.length(); ) {
            int cp = text.codePointAt(i);
            if (cp == 0x03A3) {
                out.append(isFinalSigma(text, i) ? '\u03C2' : '\u03C3');
            } else {
                out.append(new String(Character.toChars(cp)).toLowerCase(Locale.ROOT));
            }
            i += Character.charCount(cp);
        }
        return out.toString();
    }

    /** A cased code point before (skipping case-ignorables) and none after. */
    private static boolean isFinalSigma(String text, int index) {
        boolean casedBefore = false;
        for (int j = index; j > 0; ) {
            int cp = text.codePointBefore(j);
            j -= Character.charCount(cp);
            if (UCharacter.hasBinaryProperty(cp, UProperty.CASE_IGNORABLE)) continue;
            casedBefore = UCharacter.hasBinaryProperty(cp, UProperty.CASED);
            break;
        }
        if (!casedBefore) return false;
        for (int j = index + 1; j < text.length(); ) {
            int cp = text.codePointAt(j);
            j += Character.charCount(cp);
            if (UCharacter.hasBinaryProperty(cp, UProperty.CASE_IGNORABLE)) continue;
            return !UCharacter.hasBinaryProperty(cp, UProperty.CASED);
        }
        return true;
    }

    public static boolean same(String a, String b) {
        return key(a).equals(key(b));
    }
}
