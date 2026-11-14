// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.firstrun;

import org.json.JSONException;
import org.json.JSONObject;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Locale;
import java.util.Random;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Blanc for Android's launch ping (F21), the rules of Blanc for iPhone's LaunchPing.swift and the
 * desktop fork's telemetry.inc: one anonymous count per app session in desktop's shape, to the same
 * Worker, which keeps the phone's counts apart from desktop's ({@code platform: "android"}). It is
 * sent only when the person saved yes to Measure usage, never twice in one process, never for a
 * launch Android made only for background sync, and never from a build without a Blanc release
 * version: today every Android build is a preview with none (A7 gives releases one), so production
 * gets nothing until then. A test launch (a debuggable build with --blanc-test-ping-host) sends only
 * to the loopback collector it names. It carries
 * no browsing data; failures are silent and never retried.
 */
@NullMarked
public final class LaunchPing {
    public static final String ENDPOINT = "https://blanc-ping.bnfy-441.workers.dev/ping";

    /** The Blanc release version a release build reports (A7); a preview has none. */
    static final @Nullable String RELEASE_VERSION = null;

    /** The random id for this install: in no-backup storage, so a reinstall or restore is new. */
    public static final String INSTALL_FILE = "blanc-install-id";

    // The Worker's own checks (cloudflare/ping-worker/src/index.js).
    private static final Pattern VERSION = Pattern.compile("^\\d+\\.\\d+\\.\\d+(?:-[a-zA-Z0-9.]+)?$");
    private static final Pattern LOOPBACK =
            Pattern.compile("^http://(127\\.0\\.0\\.1|\\[::1\\]):([1-9][0-9]{0,4})/$");

    private LaunchPing() {}

    public static boolean shouldSend(@Nullable Boolean saved, boolean alreadySent) {
        return Boolean.TRUE.equals(saved) && !alreadySent;
    }

    /**
     * Where this launch's ping goes, or null for nowhere. A test launch never falls back to
     * production: without a valid loopback collector it sends nothing.
     */
    public static @Nullable String endpoint(boolean testLaunch, @Nullable String testHost) {
        if (testLaunch) return testHost != null && validTestHost(testHost) ? testHost + "ping" : null;
        return RELEASE_VERSION != null ? ENDPOINT : null;
    }

    /** The version the ping reports: the release's, or a test launch's own, if the Worker takes it. */
    public static @Nullable String version(boolean testLaunch, @Nullable String testVersion) {
        String version = testLaunch ? testVersion : RELEASE_VERSION;
        return version != null && version.length() <= 32 && VERSION.matcher(version).matches() ? version : null;
    }

    /** Exactly http://127.0.0.1:port/ or http://[::1]:port/, as desktop's test host. */
    public static boolean validTestHost(String host) {
        java.util.regex.Matcher match = LOOPBACK.matcher(host);
        return match.matches() && Integer.parseInt(match.group(2)) <= 65535;
    }

    /** The Worker's architectures; a 32-bit ARM phone sends nothing rather than a wrong one. */
    public static @Nullable String arch(String abi) {
        switch (abi) {
            case "arm64-v8a":
                return "arm64";
            case "x86_64":
                return "x64";
            case "x86":
                return "ia32";
            default:
                return null;
        }
    }

    /** Only the major leaves the phone: "16" for Android 16, 16.1 or 16 QPR2. */
    public static String osMajor(String release) {
        int end = 0;
        while (end < release.length() && end < 4 && Character.isDigit(release.charAt(end))) end++;
        return end == 0 ? "unknown" : release.substring(0, end);
    }

    public static String device(int smallestWidthDp) {
        return smallestWidthDp >= 600 ? "tablet" : "phone";
    }

    public static JSONObject body(String installId, int sessionId, String version, String arch, String osMajor,
            String device) {
        try {
            return new JSONObject()
                    .put("installId", installId)
                    .put("sessionId", sessionId)
                    .put("version", version)
                    .put("platform", "android")
                    .put("arch", arch)
                    .put("osVersion", osMajor)
                    .put("device", device);
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    /** A random positive 31-bit number per launch, as desktop's. */
    public static int sessionId(Random random) {
        return 1 + random.nextInt(Integer.MAX_VALUE - 1);
    }

    /**
     * This install's id, made on the first send: a declined or unsaved choice leaves none. A file
     * that can't be read or written gives a fresh id that isn't kept, so the count still arrives.
     */
    public static String installId(File directory) {
        File file = new File(directory, INSTALL_FILE);
        try {
            if (file.isFile()) {
                String text = new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8).trim();
                UUID.fromString(text);
                if (text.length() == 36) return text.toLowerCase(Locale.ROOT);
            }
        } catch (IOException | IllegalArgumentException e) {
            // A damaged file is replaced below.
        }
        String id = UUID.randomUUID().toString();
        try {
            File temp = new File(directory, INSTALL_FILE + ".tmp");
            Files.write(temp.toPath(), id.getBytes(StandardCharsets.UTF_8));
            if (!temp.renameTo(file)) temp.delete();
        } catch (IOException e) {
            // Not kept; this launch still counts.
        }
        return id;
    }
}
