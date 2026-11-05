// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.Locale;

/** Pairing codes, as sync-pairing.js normalizes them; the runner checks them again. */
@NullMarked
public final class SyncCode {
    // No 0/O, 1/I/L: a code is read aloud or typed from another room.
    private static final String ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
    private static final int LENGTH = 8;

    private SyncCode() {}

    /** The eight symbols, or null: trims, uppercases, drops hyphens and spaces. */
    public static @Nullable String normalize(String input) {
        String code = input.trim().toUpperCase(Locale.ROOT).replaceAll("[-\\s]", "");
        if (code.length() != LENGTH) return null;
        for (int i = 0; i < LENGTH; i++) {
            if (ALPHABET.indexOf(code.charAt(i)) < 0) return null;
        }
        return code;
    }

    /** ABCD-EFGH. */
    public static String format(String code) {
        return code.substring(0, LENGTH / 2) + "-" + code.substring(LENGTH / 2);
    }
}
