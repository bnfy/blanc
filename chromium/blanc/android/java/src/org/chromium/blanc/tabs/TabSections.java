// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.tabs;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The tab order as groups and runs of ungrouped tabs, ported from desktop's
 * src/renderer/tab-sections.js (and the iPhone's TabSections.swift). A group sits where its first
 * member is and holds all its members, pins first; ungrouped pins belong to no section and lead the
 * order.
 */
@NullMarked
public final class TabSections {
    public static final class Item {
        public final String id;
        public final @Nullable String groupId;
        public final boolean pinned;

        public Item(String id, @Nullable String groupId, boolean pinned) {
            this.id = id;
            this.groupId = groupId;
            this.pinned = pinned;
        }
    }

    /** A group (groupId set) or a run of ungrouped tabs (groupId null). */
    public static final class Section {
        public final @Nullable String groupId;
        public final List<String> tabIds = new ArrayList<>();

        Section(@Nullable String groupId) {
            this.groupId = groupId;
        }
    }

    private TabSections() {}

    private static boolean isShelfPin(Item item) {
        return item.groupId == null && item.pinned;
    }

    public static List<Section> sections(List<Item> items) {
        List<Section> sections = new ArrayList<>();
        Map<String, Section> groups = new HashMap<>();
        // Each group's pins, in order, joined to the front of the group at the end.
        Map<Section, List<String>> pins = new HashMap<>();
        @Nullable Section run = null;
        for (Item item : items) {
            if (isShelfPin(item)) continue;
            String groupId = item.groupId;
            if (groupId == null) {
                if (run == null) {
                    run = new Section(null);
                    sections.add(run);
                }
                run.tabIds.add(item.id);
                continue;
            }
            Section group = groups.get(groupId);
            if (group == null) {
                group = new Section(groupId);
                groups.put(groupId, group);
                sections.add(group);
                run = null;
            }
            if (item.pinned) {
                pins.computeIfAbsent(group, unused -> new ArrayList<>()).add(item.id);
            } else {
                group.tabIds.add(item.id);
            }
        }
        for (Map.Entry<Section, List<String>> entry : pins.entrySet()) {
            entry.getKey().tabIds.addAll(0, entry.getValue());
        }
        return sections;
    }

    /** The order sections draw: ungrouped pins first, then every section. */
    public static List<String> normalizedOrder(List<Item> items) {
        List<String> order = new ArrayList<>();
        for (Item item : items) if (isShelfPin(item)) order.add(item.id);
        for (Section section : sections(items)) order.addAll(section.tabIds);
        return order;
    }
}
