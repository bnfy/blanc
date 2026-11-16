// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.tabs.chromium;

import org.chromium.blanc.blocking.BlancBlocking;
import org.chromium.blanc.blocking.BlockerBridge;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;
import org.chromium.chrome.browser.tab.Tab;
import org.chromium.content_public.browser.WebContents;

import java.util.function.Supplier;

/** The blocker for the tab in front. */
@NullMarked
public final class ChromiumBlocking implements BlancBlocking.Engine {
    private final Supplier<@Nullable Tab> mTab;

    public ChromiumBlocking(Supplier<@Nullable Tab> tab) {
        mTab = tab;
    }

    private @Nullable WebContents contents() {
        Tab tab = mTab.get();
        return tab == null ? null : tab.getWebContents();
    }

    @Override
    public boolean enabled() {
        WebContents contents = contents();
        return contents == null || BlockerBridge.enabled(contents);
    }

    @Override
    public void setEnabled(boolean on) {
        WebContents contents = contents();
        if (contents != null) BlockerBridge.setEnabled(contents, on);
    }

    @Override
    public boolean blockable() {
        Tab tab = mTab.get();
        return tab != null && tab.getUrl().getScheme().startsWith("http");
    }

    @Override
    public boolean excepted() {
        WebContents contents = contents();
        return contents != null && BlockerBridge.excepted(contents);
    }

    @Override
    public void setExcepted(boolean allow) {
        WebContents contents = contents();
        if (contents != null) BlockerBridge.setExcepted(contents, allow);
    }

    public int blockedCount() {
        WebContents contents = contents();
        return contents == null ? 0 : BlockerBridge.blockedCount(contents);
    }

    public boolean unavailable() {
        return BlockerBridge.UNAVAILABLE.equals(BlockerBridge.health());
    }

    @Override
    public void restart() {
        BlockerBridge.restart();
    }

    @Override
    public void reload() {
        Tab tab = mTab.get();
        if (tab != null) tab.reload();
    }
}
