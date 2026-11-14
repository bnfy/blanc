// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import org.chromium.build.annotations.NullMarked;

import java.util.ArrayList;
import java.util.List;

/** The Sync screen's rows in order and in groups, Blanc for iPhone's SyncSettingsView. */
@NullMarked
public final class SyncSheetModel {
    public enum Row {
        STATUS, ACCOUNT, LAST_SYNCED, ERROR, HELP,
        OFF_INTRO, PAIR_WITH_BLANC, OTHER_WAYS,
        CODE_HEADER, CODE_FIELD, CONNECT, TYPE_CODE_HINT, PAIRING_HELP,
        PASSPHRASE_HEADER, HANDLE_FIELD, PASSPHRASE_FIELD, SIGN_IN, DESKTOP_ACCOUNT, CANCEL_SWITCH,
        DEVICE_NAME, SHARE_TABS, SYNC_NOW, SHARE_HELP, SPACES,
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

    /** Every row, top to bottom. */
    public static List<Row> rows(State s) {
        List<Row> rows = new ArrayList<>();
        for (List<Row> group : groups(s)) rows.addAll(group);
        return rows;
    }

    /**
     * The rows in groups, as the iPhone's Form sections: each group is one card, with any heading
     * row above it and any help row below it.
     */
    public static List<List<Row>> groups(State s) {
        List<List<Row>> groups = new ArrayList<>();
        List<Row> status = new ArrayList<>(List.of(Row.STATUS));
        if (s.enabled) {
            status.add(Row.ACCOUNT);
            if (s.hasLastSynced) status.add(Row.LAST_SYNCED);
            if (s.hasError) status.add(Row.ERROR);
        }
        status.add(Row.HELP);
        groups.add(status);
        if (!s.enabled && !s.switching) {
            groups.add(List.of(Row.OFF_INTRO, Row.PAIR_WITH_BLANC, Row.OTHER_WAYS));
        }
        if ((!s.enabled && s.otherWays) || s.switching) {
            List<Row> code = new ArrayList<>(List.of(Row.CODE_HEADER, Row.CODE_FIELD, Row.CONNECT));
            if (s.typeCodeHint && !s.switching) code.add(Row.TYPE_CODE_HINT);
            code.add(Row.PAIRING_HELP);
            groups.add(code);
            groups.add(s.switching
                    ? List.of(Row.CANCEL_SWITCH)
                    : List.of(Row.PASSPHRASE_HEADER, Row.HANDLE_FIELD, Row.PASSPHRASE_FIELD, Row.SIGN_IN,
                            Row.DESKTOP_ACCOUNT));
        }
        if (s.enabled && !s.switching) {
            groups.add(List.of(Row.DEVICE_NAME, Row.SHARE_TABS, Row.SYNC_NOW, Row.SHARE_HELP));
            groups.add(List.of(Row.SPACES));
            groups.add(List.of(Row.PAIR_DEVICE, Row.COPY_RECOVERY, Row.SWITCH_ACCOUNT, Row.DISCONNECT));
        }
        return groups;
    }
}
