// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import org.chromium.build.annotations.NullMarked;

import java.util.ArrayList;
import java.util.List;

/** The Sync sheet's rows in order, Blanc for iPhone's SyncSettingsView. */
@NullMarked
public final class SyncSheetModel {
    public enum Row {
        STATUS, ACCOUNT, LAST_SYNCED, ERROR, HELP,
        OFF_INTRO, PAIR_WITH_BLANC, OTHER_WAYS,
        CODE_HEADER, CODE_FIELD, CONNECT, TYPE_CODE_HINT, PAIRING_HELP,
        PASSPHRASE_HEADER, HANDLE_FIELD, PASSPHRASE_FIELD, SIGN_IN, DESKTOP_ACCOUNT, CANCEL_SWITCH,
        DEVICE_NAME, SAVE_NAME, SHARE_TABS, SYNC_NOW, SHARE_HELP,
        PAIR_DEVICE, COPY_RECOVERY, SWITCH_ACCOUNT, DISCONNECT
    }

    /** What the sheet is showing. */
    public static final class State {
        public boolean enabled;
        public boolean hasLastSynced;
        public boolean hasError;
        public boolean otherWays;
        public boolean typeCodeHint;
        public boolean switching;
    }

    private SyncSheetModel() {}

    public static List<Row> rows(State s) {
        List<Row> rows = new ArrayList<>();
        rows.add(Row.STATUS);
        if (s.enabled) {
            rows.add(Row.ACCOUNT);
            if (s.hasLastSynced) rows.add(Row.LAST_SYNCED);
            if (s.hasError) rows.add(Row.ERROR);
        }
        rows.add(Row.HELP);
        if (!s.enabled && !s.switching) {
            rows.add(Row.OFF_INTRO);
            rows.add(Row.PAIR_WITH_BLANC);
            rows.add(Row.OTHER_WAYS);
        }
        if ((!s.enabled && s.otherWays) || s.switching) {
            rows.add(Row.CODE_HEADER);
            rows.add(Row.CODE_FIELD);
            rows.add(Row.CONNECT);
            if (s.typeCodeHint && !s.switching) rows.add(Row.TYPE_CODE_HINT);
            rows.add(Row.PAIRING_HELP);
            if (s.switching) {
                rows.add(Row.CANCEL_SWITCH);
            } else {
                rows.add(Row.PASSPHRASE_HEADER);
                rows.add(Row.HANDLE_FIELD);
                rows.add(Row.PASSPHRASE_FIELD);
                rows.add(Row.SIGN_IN);
                rows.add(Row.DESKTOP_ACCOUNT);
            }
        }
        if (s.enabled && !s.switching) {
            rows.add(Row.DEVICE_NAME);
            rows.add(Row.SAVE_NAME);
            rows.add(Row.SHARE_TABS);
            rows.add(Row.SYNC_NOW);
            rows.add(Row.SHARE_HELP);
            rows.add(Row.PAIR_DEVICE);
            rows.add(Row.COPY_RECOVERY);
            rows.add(Row.SWITCH_ACCOUNT);
            rows.add(Row.DISCONNECT);
        }
        return rows;
    }
}
