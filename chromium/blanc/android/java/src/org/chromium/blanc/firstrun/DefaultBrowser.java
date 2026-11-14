// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.firstrun;

import android.app.Activity;
import android.app.role.RoleManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.provider.Settings;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

/**
 * The default-browser offer (M18 §5): the walkthrough's step and the Settings row. Android asks
 * through its browser role: a system dialog, which Android stops showing once someone has turned it
 * down twice. So Blanc asks with the role at most twice, and after that, or when Blanc already is the
 * default (to change it back), opens Android's Default apps screen, where the person picks.
 */
@NullMarked
public final class DefaultBrowser {
    /** What Android says about the browser role; tests supply a fake. */
    public interface Roles {
        /** Whether Blanc holds the role, or null if this Android has no browser role. */
        @Nullable
        Boolean held();

        /** The role's request, or null if it can't be asked for. */
        @Nullable
        Intent request();
    }

    public static final String REQUESTS_KEY = "blanc.default_browser_requests";
    public static final int ROLE_REQUESTS = 2;
    public static final int REQUEST_CODE = 0x8b1a;

    private DefaultBrowser() {}

    public static Roles roles(Context context) {
        RoleManager manager = context.getSystemService(RoleManager.class);
        return new Roles() {
            @Override
            public @Nullable Boolean held() {
                if (manager == null || !manager.isRoleAvailable(RoleManager.ROLE_BROWSER)) return null;
                return manager.isRoleHeld(RoleManager.ROLE_BROWSER);
            }

            @Override
            public @Nullable Intent request() {
                if (manager == null || !manager.isRoleAvailable(RoleManager.ROLE_BROWSER)) return null;
                return manager.createRequestRoleIntent(RoleManager.ROLE_BROWSER);
            }
        };
    }

    /** Whether the next press asks with the role dialog rather than opening Default apps. */
    public static boolean asksWithRole(@Nullable Boolean held, int requestsSoFar) {
        return Boolean.FALSE.equals(held) && requestsSoFar < ROLE_REQUESTS;
    }

    /** One press of Set as default or of the Settings row. */
    public static void request(Activity activity, Roles roles, SharedPreferences prefs) {
        int asked = prefs.getInt(REQUESTS_KEY, 0);
        Intent role = roles.request();
        if (role != null && asksWithRole(roles.held(), asked)) {
            prefs.edit().putInt(REQUESTS_KEY, asked + 1).apply();
            try {
                activity.startActivityForResult(role, REQUEST_CODE);
                return;
            } catch (ActivityNotFoundException e) {
                // Fall through to Default apps.
            }
        }
        try {
            activity.startActivity(new Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS));
        } catch (ActivityNotFoundException e) {
            activity.startActivity(new Intent(Settings.ACTION_SETTINGS));
        }
    }
}
