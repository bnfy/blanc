// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.address;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * What typed address text means, a Java port of blanc/island/address-input.js (itself ported
 * from shipping v1.45.1's classifyExternalNavigation and normalizeAddressInput, and checked
 * against them). AddressInputTest checks this port against that file over the shared corpus.
 * JavaScript semantics are kept where Java differs: trim() and \s include Unicode spaces, $ is
 * the end of the text, and URL parsing rejects a special scheme's missing or bad host.
 */
@NullMarked
public final class AddressInput {
    public enum Kind {
        ADDRESS,
        SEARCH,
        HANDOFF
    }

    /** An address to load, a query to search, or a link for another app (confirm: ask first). */
    public static final class Result {
        public final Kind kind;
        public final String value;
        public final boolean confirm;

        Result(Kind kind, String value, boolean confirm) {
            this.kind = kind;
            this.value = value;
            this.confirm = confirm;
        }
    }

    /** Desktop's default engine, until Settings (A5) offers the rest. */
    public static final String SEARCH_PREFIX = "https://duckduckgo.com/?q=";

    private static final Set<String> DIRECT_HANDOFF =
            Set.of("mailto:", "tel:", "facetime:", "sms:");
    private static final Set<String> BROWSER =
            Set.of(
                    "http:", "https:", "about:", "blob:", "filesystem:", "blanc:", "data:",
                    "javascript:", "vbscript:");
    private static final Set<String> BLOCKED_OS =
            Set.of(
                    "chrome:", "chrome-extension:", "devtools:", "blanc-chrome:", "blanc-import:",
                    "file:", "view-source:", "afp:", "applescript:", "disk:", "disks:", "hcp:",
                    "ie.http:", "mk:", "ms-help:", "nntp:", "res:", "shell:", "vnd.ms.radio:",
                    "cmd:", "powershell:", "terminal:", "osascript:", "ms-msdt:",
                    "ms-appinstaller:", "ms-settings:", "search-ms:", "search:", "smb:", "ssh:",
                    "x-apple.systempreferences:");
    /** WHATWG special schemes whose URLs fail to parse without a valid host. */
    private static final Set<String> SPECIAL = Set.of("ftp:", "ws:", "wss:", "http:", "https:");

    /** JavaScript's whitespace (\s, trim()). */
    private static final String JS_SPACE =
            "\\t\\n\\u000B\\f\\r \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF";

    private static final Pattern STARTS_WITH_SCHEME =
            Pattern.compile("^([a-zA-Z][a-zA-Z0-9+.-]*):");
    private static final Pattern UNSAFE = Pattern.compile("[\\u0000-\\u0020\\u007f\\\\\"`]");
    private static final Pattern TYPED_APP_LINK = Pattern.compile("^[a-zA-Z][a-zA-Z0-9+.-]*:/");
    private static final Pattern SCHEME_SLASHES =
            Pattern.compile("^([a-zA-Z][a-zA-Z0-9+.-]*)://");
    private static final Pattern LOCALHOST = Pattern.compile("^localhost(:\\d+)?(/|\\z)");
    private static final Pattern IPV4 = Pattern.compile("^(\\d{1,3}\\.){3}\\d{1,3}(:\\d+)?(/|\\z)");
    private static final Pattern NON_PORT_COLON = Pattern.compile(":(?!\\d+\\z)");
    private static final Pattern DOMAIN =
            Pattern.compile("^[^" + JS_SPACE + "]+\\.[a-zA-Z]{2,}(/[^" + JS_SPACE + "]*)?\\z");
    private static final Pattern FORBIDDEN_HOST =
            Pattern.compile("[\\u0000\\t\\n\\r #/:<>?@\\[\\\\\\]^|%]");

    private AddressInput() {}

    public static Result interpret(String raw) {
        String action = classify(raw);
        if (action.equals("open") || action.equals("confirm")) {
            return new Result(Kind.HANDOFF, raw, action.equals("confirm"));
        }
        String trimmed = trim(raw);
        Matcher scheme = SCHEME_SLASHES.matcher(trimmed);
        if (scheme.find()) {
            String s = scheme.group(1).toLowerCase(Locale.ROOT);
            // Script-executing schemes must never be navigable from the address bar.
            if (s.equals("http") || s.equals("https") || s.equals("blanc")) {
                return new Result(Kind.ADDRESS, trimmed, false);
            }
            return search(trimmed);
        }
        if (LOCALHOST.matcher(trimmed).find() || IPV4.matcher(trimmed).find()) {
            return new Result(Kind.ADDRESS, "http://" + trimmed, false);
        }
        // A search operator such as site:example.com puts a colon where the host would be.
        String host = trimmed.split("[/?#]", 2)[0];
        if (!host.contains("@") && NON_PORT_COLON.matcher(host).find()) return search(trimmed);
        if (DOMAIN.matcher(trimmed).find()) return new Result(Kind.ADDRESS, "https://" + trimmed, false);
        return search(trimmed);
    }

    /** DuckDuckGo's address for a query, encoded as JavaScript's encodeURIComponent does. */
    // The pages chrome://blanc/ serves (tools/android-pages.mjs PAGES), as the pages' adapter maps them.
    private static final List<String> SERVED_PAGES =
            List.of("newtab", "bookmarks", "history", "shortcuts", "error", "mahjong");
    private static final Pattern BLANC_PAGE =
            Pattern.compile("^blanc://([a-z-]+)/?([?#].*)?$", Pattern.CASE_INSENSITIVE);

    /** Whether an address is one of Blanc's own (blanc://<page>/). */
    public static boolean isBlancPage(String address) {
        return BLANC_PAGE.matcher(address).matches();
    }

    /**
     * Where a Blanc address opens on Android (D34): chrome://blanc/<page>.html for a page Android
     * serves, or null for one it doesn't (Settings, Downloads, tab import), which opens nothing.
     */
    public static @Nullable String servedPage(String address) {
        Matcher page = BLANC_PAGE.matcher(address);
        if (!page.matches()) return null;
        String name = page.group(1).toLowerCase(Locale.ROOT);
        if (!SERVED_PAGES.contains(name)) return null;
        return "chrome://blanc/" + name + ".html" + (page.group(2) == null ? "" : page.group(2));
    }

    public static String searchUrl(String query) {
        StringBuilder out = new StringBuilder(SEARCH_PREFIX);
        for (byte b : query.getBytes(StandardCharsets.UTF_8)) {
            char c = (char) (b & 0xFF);
            if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
                    || "-_.!~*'()".indexOf(c) >= 0) {
                out.append(c);
            } else {
                out.append('%').append(String.format(Locale.ROOT, "%02X", b & 0xFF));
            }
        }
        return out.toString();
    }

    private static Result search(String query) {
        return new Result(Kind.SEARCH, query, false);
    }

    /** classifyExternalNavigation(url, {trusted: true}): none, deny, open or confirm. */
    private static String classify(String url) {
        Matcher m = STARTS_WITH_SCHEME.matcher(url);
        if (!m.find() || UNSAFE.matcher(url).find()) return "none";
        String protocol = m.group(1).toLowerCase(Locale.ROOT) + ":";
        String rest = url.substring(m.end());
        boolean special = SPECIAL.contains(protocol);
        if ((special || rest.startsWith("//")) && !validAuthority(rest, special)) return "none";
        if (protocol.length() == 2) return "none";
        if (BLOCKED_OS.contains(protocol)) return "deny";
        if (BROWSER.contains(protocol)) return "none";
        // A typed custom app URL needs a slash.
        if (!DIRECT_HANDOFF.contains(protocol) && !TYPED_APP_LINK.matcher(url).find()) return "none";
        return DIRECT_HANDOFF.contains(protocol) ? "open" : "confirm";
    }

    /**
     * Whether the authority after "scheme:" parses as WHATWG URL does: a port of digits up to
     * 65535, no host characters it forbids, and a host after any "@"; a special scheme needs a
     * host at all.
     */
    private static boolean validAuthority(String rest, boolean special) {
        int i = 0;
        while (i < rest.length() && rest.charAt(i) == '/') i++;
        String authority = rest.substring(i).split("[/?#]", 2)[0];
        int at = authority.lastIndexOf('@');
        String hostPort = at >= 0 ? authority.substring(at + 1) : authority;
        String host = hostPort;
        int colon = hostPort.lastIndexOf(':');
        if (colon >= 0) {
            String port = hostPort.substring(colon + 1);
            // WHATWG URL drops leading zeros, so only the value counts; it never overflows here.
            String digits = port.replaceFirst("^0+(?=\\d)", "");
            if (!port.matches("\\d*") || digits.length() > 5
                    || (!port.isEmpty() && Integer.parseInt(digits) > 65535)) {
                return false;
            }
            host = hostPort.substring(0, colon);
        }
        if (host.isEmpty()) return !special && at < 0;
        return !FORBIDDEN_HOST.matcher(host).find();
    }

    /** JavaScript's String.prototype.trim(). */
    public static String trim(String s) {
        int start = 0;
        int end = s.length();
        while (start < end && isJsSpace(s.charAt(start))) start++;
        while (end > start && isJsSpace(s.charAt(end - 1))) end--;
        return s.substring(start, end);
    }

    private static boolean isJsSpace(char c) {
        return c == '\t' || c == '\n' || c == 0x0B || c == '\f' || c == '\r' || c == ' '
                || c == 0x00A0 || c == 0x1680 || (c >= 0x2000 && c <= 0x200A) || c == 0x2028
                || c == 0x2029 || c == 0x202F || c == 0x205F || c == 0x3000 || c == 0xFEFF;
    }
}
