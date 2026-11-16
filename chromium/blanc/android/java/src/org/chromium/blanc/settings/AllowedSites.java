// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.settings;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * The sites where Blanc Blocker is off, with the iPhone's input rules (SettingsSiteInput and
 * AdblockExceptions in SettingsSheet.swift / AdblockExceptions.swift): a web address or a bare host
 * becomes a lowercase host with `www.` dropped, and anything else is refused.
 */
@NullMarked
public final class AllowedSites {
    public enum Problem {
        INVALID,
        DUPLICATE
    }

    public static final class Result {
        /** Why the input was refused, or null. */
        public final @Nullable Problem error;

        /** The list after the attempt: unchanged when refused. */
        public final List<String> sites;

        Result(@Nullable Problem error, List<String> sites) {
            this.error = error;
            this.sites = sites;
        }
    }

    private AllowedSites() {}

    public static @Nullable String normalize(String input) {
        String trimmed = input.trim();
        if (trimmed.isEmpty()) return null;
        for (int i = 0; i < trimmed.length(); i++) {
            if (Character.isWhitespace(trimmed.charAt(i))) return null;
        }
        URI uri;
        try {
            uri = new URI(trimmed.contains("://") ? trimmed : "https://" + trimmed);
        } catch (URISyntaxException e) {
            return null;
        }
        String scheme = uri.getScheme();
        if (scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) return null;
        String host = uri.getHost();
        if (host == null) return null;
        host = host.toLowerCase(Locale.ROOT);
        if (host.startsWith("www.")) host = host.substring(4);
        return host.isEmpty() ? null : host;
    }

    public static Result add(List<String> current, String input) {
        String host = normalize(input);
        if (host == null) return new Result(Problem.INVALID, current);
        if (current.contains(host)) return new Result(Problem.DUPLICATE, current);
        List<String> next = new ArrayList<>(current);
        next.add(host);
        return new Result(null, next);
    }

    public static List<String> remove(List<String> current, String host) {
        List<String> next = new ArrayList<>(current);
        next.remove(host);
        return next;
    }
}
