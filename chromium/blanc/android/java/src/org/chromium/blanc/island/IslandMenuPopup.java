// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.island;

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
        void toggleFavorite();

        void share();

        void find();

        void newPrivateTab();
    }

    static final Set<IslandMenu.Kind> BUILT =
            EnumSet.of(IslandMenu.Kind.FAVORITE, IslandMenu.Kind.SHARE, IslandMenu.Kind.FIND,
                    IslandMenu.Kind.NEW_PRIVATE_TAB);

    private IslandMenuPopup() {}

    /** Shows the menu for `context` under `anchor` and returns it. */
    public static PopupMenu show(View anchor, IslandMenu.Context context, Actions actions) {
        PopupMenu popup = new PopupMenu(anchor.getContext(), anchor);
        Menu menu = popup.getMenu();
        int order = 0;
        for (IslandMenu.Item item : IslandMenu.items(context)) {
            if (!BUILT.contains(item.kind)) continue;
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
}
