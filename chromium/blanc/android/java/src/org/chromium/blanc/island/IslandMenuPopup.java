// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

import android.content.res.Resources;
import android.view.Menu;
import android.view.View;
import android.widget.PopupMenu;

import org.chromium.build.annotations.NullMarked;

import java.util.EnumSet;
import java.util.Set;

/**
 * The Sunrise mark's menu, anchored to the mark, in {@link IslandMenu}'s order with the iPhone's
 * labels (ContentView.islandMenuElements). Entries whose feature Android doesn't have yet are left
 * out, as the iPhone leaves out entries that don't apply: Customize Start Page waits for Settings
 * (A5), blocking for A3 and Send to Device for A4.
 */
@NullMarked
public final class IslandMenuPopup {
    /** What the entries do; the browser supplies them. */
    public interface Actions {
        void setSiteProtected(boolean on);

        void turnBlockingOn();

        void retryBlocking();

        void toggleFavorite();

        void share();

        void find();

        void newPrivateTab();
    }

    static final Set<IslandMenu.Kind> BUILT =
            EnumSet.of(IslandMenu.Kind.BLOCKING, IslandMenu.Kind.BLOCKING_SETTINGS, IslandMenu.Kind.BLOCKING_UNAVAILABLE,
                    IslandMenu.Kind.FAVORITE, IslandMenu.Kind.SHARE, IslandMenu.Kind.FIND,
                    IslandMenu.Kind.NEW_PRIVATE_TAB);

    private IslandMenuPopup() {}

    /** Shows the menu for `context` under `anchor` and returns it. */
    public static PopupMenu show(View anchor, IslandMenu.Context context, Actions actions) {
        PopupMenu popup = new PopupMenu(anchor.getContext(), anchor);
        Menu menu = popup.getMenu();
        int order = 0;
        for (IslandMenu.Item item : IslandMenu.items(context)) {
            if (!BUILT.contains(item.kind)) continue;
            if (item.kind == IslandMenu.Kind.BLOCKING || item.kind == IslandMenu.Kind.BLOCKING_SETTINGS
                    || item.kind == IslandMenu.Kind.BLOCKING_UNAVAILABLE) {
                order = addBlocking(menu, order, item, context, actions, anchor);
                continue;
            }
            final Runnable run;
            final int title;
            switch (item.kind) {
                case FAVORITE:
                    title = item.on ? R.string.blanc_tab_menu_remove_favorite : R.string.blanc_tab_menu_save_favorite;
                    run = actions::toggleFavorite;
                    break;
                case SHARE:
                    title = R.string.blanc_share_picker_share;
                    run = actions::share;
                    break;
                case FIND:
                    title = R.string.blanc_menu_find_in_page;
                    run = actions::find;
                    break;
                default:
                    title = R.string.blanc_menu_new_private_tab;
                    run = actions::newPrivateTab;
                    break;
            }
            menu.add(Menu.NONE, order + 1, order, title)
                    .setOnMenuItemClickListener(
                            menuItem -> {
                                run.run();
                                return true;
                            });
            order++;
        }
        popup.show();
        return popup;
    }

    /** The iPhone's switch, then what the page's blocker is doing, as desktop's shield says it. */
    private static int addBlocking(Menu menu, int order, IslandMenu.Item item, IslandMenu.Context context,
            Actions actions, View anchor) {
        Resources res = anchor.getResources();
        if (item.kind == IslandMenu.Kind.BLOCKING_UNAVAILABLE) {
            menu.add(Menu.NONE, order + 1, order, R.string.blanc_newtab_startup_failed).setEnabled(false);
            order++;
            menu.add(Menu.NONE, order + 1, order, R.string.blanc_newtab_startup_retry).setOnMenuItemClickListener(m -> {
                actions.retryBlocking();
                return true;
            });
            return order + 1;
        }
        boolean on = item.kind == IslandMenu.Kind.BLOCKING && item.on;
        menu.add(Menu.NONE, order + 1, order, R.string.blanc_shield_ad_blocking).setCheckable(true).setChecked(on)
                .setOnMenuItemClickListener(m -> {
                    if (item.kind == IslandMenu.Kind.BLOCKING) {
                        actions.setSiteProtected(!on);
                    } else {
                        actions.turnBlockingOn();
                    }
                    return true;
                });
        order++;
        String status;
        if (item.kind == IslandMenu.Kind.BLOCKING_SETTINGS) {
            status = res.getString(R.string.blanc_shield_count_global_off);
        } else if (!on) {
            status = res.getString(R.string.blanc_shield_count_site_off);
        } else if (context.blockedCount > 0) {
            status = res.getQuantityString(R.plurals.blanc_shield_count_blocked, context.blockedCount, context.blockedCount);
        } else {
            status = res.getString(R.string.blanc_shield_count_none);
        }
        menu.add(Menu.NONE, order + 1, order, status).setEnabled(false);
        return order + 1;
    }
}
