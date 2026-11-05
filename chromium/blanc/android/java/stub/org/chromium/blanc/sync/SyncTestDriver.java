// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import org.chromium.build.annotations.NullMarked;

/** A build without test hooks has no test driver at all. */
@NullMarked
public final class SyncTestDriver {
    private SyncTestDriver() {}

    public static void maybeStart() {}
}
