// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.tabs;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;
import org.junit.runner.RunWith;

import org.chromium.base.test.BaseRobolectricTestRunner;

import java.util.List;

/** The iPhone's slash commands (SlashCommand.swift), with A2's built set. */
@RunWith(BaseRobolectricTestRunner.class)
public class SlashCommandsTest {
    @Test
    public void offersSeventeenInTheIphonesOrder() {
        assertEquals(List.of(SlashCommands.Kind.FAVORITES, SlashCommands.Kind.HISTORY, SlashCommands.Kind.SETTINGS, SlashCommands.Kind.SYNC, SlashCommands.Kind.NEW,
                SlashCommands.Kind.PRIVATE, SlashCommands.Kind.CLOSE, SlashCommands.Kind.REOPEN, SlashCommands.Kind.GROUP,
                SlashCommands.Kind.UNGROUP, SlashCommands.Kind.CLOSE_GROUP, SlashCommands.Kind.SEND, SlashCommands.Kind.FIND,
                SlashCommands.Kind.BLOCK_ADS, SlashCommands.Kind.ALLOW_ADS, SlashCommands.Kind.THEME, SlashCommands.Kind.SPACE),
                SlashCommands.available());
    }

    @Test
    public void typingNarrowsByPrefix() {
        assertEquals(List.of(SlashCommands.Kind.CLOSE, SlashCommands.Kind.CLOSE_GROUP), SlashCommands.matching("/cl"));
        assertEquals(SlashCommands.available(), SlashCommands.matching("/"));
        assertEquals(List.of(SlashCommands.Kind.SETTINGS), SlashCommands.matching("/settings"));
        assertEquals(List.of(SlashCommands.Kind.SETTINGS, SlashCommands.Kind.SEND), SlashCommands.matching("/se"));
    }

    @Test
    public void theFirstMatchRunsWithTheRestAsItsArgument() {
        SlashCommands.Parsed parsed = SlashCommands.parse("  /group   Research Notes ");
        assertEquals(SlashCommands.Kind.GROUP, parsed.kind);
        assertEquals("Research Notes", parsed.argument);
        assertEquals(SlashCommands.Kind.CLOSE, SlashCommands.parse("/cl").kind);
        assertEquals("", SlashCommands.parse("/new").argument);
        assertEquals(SlashCommands.Kind.SETTINGS, SlashCommands.parse("/settings").kind);
        assertNull(SlashCommands.parse("/reader"));
        assertNull(SlashCommands.parse("/nothing here"));
    }

    @Test
    public void commandsAndHintsUseDesktopsNames() {
        assertEquals("/close-group", SlashCommands.command(SlashCommands.Kind.CLOSE_GROUP));
        assertEquals("slash.closeGroup.hint", SlashCommands.hintKey(SlashCommands.Kind.CLOSE_GROUP));
        assertEquals("slash.favorites.hint", SlashCommands.hintKey(SlashCommands.Kind.FAVORITES));
    }

    @Test
    public void themeCyclesOrPicksAndIgnoresUnknownWords() {
        assertEquals("light", SlashCommands.nextTheme("system", ""));
        assertEquals("dark", SlashCommands.nextTheme("light", ""));
        assertEquals("system", SlashCommands.nextTheme("dark", ""));
        assertEquals("dark", SlashCommands.nextTheme("system", "DARK"));
        assertEquals("light", SlashCommands.nextTheme("light", "purple"));
    }
}
