// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.tabs;

import org.chromium.blanc.address.AddressInput;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * The palette's slash commands, in Blanc for iPhone's order (SlashCommand.swift). Commands whose
 * feature Android doesn't have yet are left out of {@link #available()} until their milestone:
 * /settings (A5), /sync and /send (A4), /reader (after A2), /block-ads and /allow-ads (A3), /space
 * (A4).
 */
@NullMarked
public final class SlashCommands {
    public enum Kind {
        FAVORITES, HISTORY, SETTINGS, SYNC, NEW, PRIVATE, CLOSE, REOPEN, GROUP, UNGROUP, CLOSE_GROUP,
        SEND, READER, FIND, BLOCK_ADS, ALLOW_ADS, THEME, SPACE
    }

    /** A typed command and the text after its word. */
    public static final class Parsed {
        public final Kind kind;
        public final String argument;

        Parsed(Kind kind, String argument) {
            this.kind = kind;
            this.argument = argument;
        }
    }

    private static final Set<Kind> BUILT =
            EnumSet.of(Kind.FAVORITES, Kind.HISTORY, Kind.NEW, Kind.PRIVATE, Kind.CLOSE, Kind.REOPEN,
                    Kind.GROUP, Kind.UNGROUP, Kind.CLOSE_GROUP, Kind.FIND, Kind.THEME);

    private SlashCommands() {}

    /** "/close-group" for CLOSE_GROUP. */
    public static String command(Kind kind) {
        return "/" + kind.name().toLowerCase(Locale.ROOT).replace('_', '-');
    }

    /** The catalog key of a command's hint, as copy/build.mjs names it: slash.closeGroup.hint. */
    public static String hintKey(Kind kind) {
        String[] parts = kind.name().toLowerCase(Locale.ROOT).split("_");
        StringBuilder camel = new StringBuilder(parts[0]);
        for (int i = 1; i < parts.length; i++) {
            camel.append(Character.toUpperCase(parts[i].charAt(0))).append(parts[i].substring(1));
        }
        return "slash." + camel + ".hint";
    }

    public static List<Kind> available() {
        List<Kind> kinds = new ArrayList<>();
        for (Kind kind : Kind.values()) if (BUILT.contains(kind)) kinds.add(kind);
        return kinds;
    }

    /** The available commands starting with the typed word (all of them for a bare "/"). */
    public static List<Kind> matching(String input) {
        String word = word(input);
        List<Kind> kinds = new ArrayList<>();
        for (Kind kind : available()) if (command(kind).startsWith(word)) kinds.add(kind);
        return kinds;
    }

    /** The first command matching the typed word, with the rest as its argument; null if none. */
    public static @Nullable Parsed parse(String input) {
        List<Kind> kinds = matching(input);
        if (kinds.isEmpty()) return null;
        String trimmed = AddressInput.trim(input);
        int space = trimmed.indexOf(' ');
        return new Parsed(kinds.get(0), space < 0 ? "" : AddressInput.trim(trimmed.substring(space)));
    }

    private static String word(String input) {
        String trimmed = AddressInput.trim(input);
        int space = trimmed.indexOf(' ');
        return space < 0 ? trimmed : trimmed.substring(0, space);
    }
}
