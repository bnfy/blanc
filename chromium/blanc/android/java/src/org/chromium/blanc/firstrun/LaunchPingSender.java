// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.firstrun;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.io.File;
import java.util.Random;

/**
 * Sends the launch ping at most once per process (LaunchPing.swift's LaunchPingSender): when a launch
 * the person opened starts with Measure usage saved on, or when they save it on during the launch.
 * Nothing leaves before that; the install id is made on the first send.
 */
@NullMarked
public final class LaunchPingSender {
    /** The request: LaunchPingBridge in the app, a fake in tests. */
    public interface Poster {
        void post(String url, String json);
    }

    /** What this build and phone report, read once. */
    public static final class Device {
        final boolean testLaunch;
        final @Nullable String testHost;
        final @Nullable String testVersion;
        final String abi;
        final String osRelease;
        final int smallestWidthDp;

        public Device(boolean testLaunch, @Nullable String testHost, @Nullable String testVersion, String abi,
                String osRelease, int smallestWidthDp) {
            this.testLaunch = testLaunch;
            this.testHost = testHost;
            this.testVersion = testVersion;
            this.abi = abi;
            this.osRelease = osRelease;
            this.smallestWidthDp = smallestWidthDp;
        }
    }

    private final Poster mPoster;
    private final File mDirectory;
    private final Device mDevice;
    private final int mSessionId;
    private boolean mSent;

    public LaunchPingSender(Poster poster, File directory, Device device, Random random) {
        mPoster = poster;
        mDirectory = directory;
        mDevice = device;
        mSessionId = LaunchPing.sessionId(random);
    }

    /** Sends if the saved choice allows it and nothing was sent yet; true when it sent. */
    public boolean sendIfAllowed(@Nullable Boolean saved) {
        if (!LaunchPing.shouldSend(saved, mSent)) return false;
        String url = LaunchPing.endpoint(mDevice.testLaunch, mDevice.testHost);
        String version = LaunchPing.version(mDevice.testLaunch, mDevice.testVersion);
        String arch = LaunchPing.arch(mDevice.abi);
        if (url == null || version == null || arch == null) return false;
        mSent = true;
        mPoster.post(url, LaunchPing.body(LaunchPing.installId(mDirectory), mSessionId, version, arch,
                LaunchPing.osMajor(mDevice.osRelease), LaunchPing.device(mDevice.smallestWidthDp)).toString());
        return true;
    }
}
