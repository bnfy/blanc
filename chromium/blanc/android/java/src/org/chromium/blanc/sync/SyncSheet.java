// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.text.InputType;
import android.text.format.DateUtils;
import android.util.TypedValue;
import android.view.LayoutInflater;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Switch;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import org.chromium.base.Callback;
import org.chromium.blanc.island.R;
import org.chromium.blanc.sync.SyncSheetModel.Row;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Sync, as Blanc for iPhone's SyncSettingsView shows it: pairing while off, the device and account
 * while on. A5's Settings will open this; until then the Sunrise menu and /sync do.
 */
@NullMarked
public final class SyncSheet {
    /** The runner: SyncBridge in the app, a fake in tests. */
    public interface Runner {
        void call(String method, String argsJson, Callback<String> done);

        /** Whether Keystore really has no key, rather than failing for a moment. */
        boolean keyLost();
    }

    /** Asks for a code from the camera; null means the person didn't scan one. */
    public interface Scanner {
        void scan(Callback<@Nullable String> done);
    }

    private static final Map<String, Integer> ERRORS = new HashMap<>();

    static {
        ERRORS.put("bad-passphrase", R.string.blanc_sync_error_bad_passphrase);
        ERRORS.put("pair-not-found", R.string.blanc_sync_error_pair_not_found);
        ERRORS.put("pair-unavailable", R.string.blanc_sync_error_pair_unavailable);
        ERRORS.put("pair-invalid", R.string.blanc_sync_error_pair_invalid);
        ERRORS.put("rate-limited", R.string.blanc_sync_error_rate_limited);
        ERRORS.put("offline", R.string.blanc_sync_error_offline);
        ERRORS.put("server-error", R.string.blanc_sync_error_server_error);
        ERRORS.put("sync-on", R.string.blanc_sync_error_sync_on);
        ERRORS.put("sync-off", R.string.blanc_sync_error_off);
        ERRORS.put("credentials-save-failed", R.string.blanc_sync_error_credentials_save);
        ERRORS.put("create-on-computer", R.string.blanc_settings_sync_create_on_computer);
        ERRORS.put("wipe-unsupported", R.string.blanc_settings_sync_create_on_computer);
        ERRORS.put("account-gone", R.string.blanc_sync_error_account_gone);
    }

    private static final Map<String, Integer> SPACES_STATUS = new HashMap<>();

    static {
        SPACES_STATUS.put("capacity", R.string.blanc_shared_spaces_capacity);
        SPACES_STATUS.put("tombstones", R.string.blanc_shared_spaces_tombstones);
        SPACES_STATUS.put("busy", R.string.blanc_shared_spaces_busy);
    }

    private final Activity mActivity;
    private final Runner mRunner;
    private final Scanner mScanner;
    private final Dialog mDialog;
    private final LinearLayout mList;
    private final SyncSheetModel.State mState = new SyncSheetModel.State();
    private JSONObject mStatus = new JSONObject();
    private JSONObject mSpaces = new JSONObject();
    private String mCode = "";
    private String mHandle = "";
    private String mPassphrase = "";
    private String mDeviceName = "";
    private @Nullable String mError;
    private @Nullable String mNotice;
    private boolean mBusy;
    private @Nullable String mPairingCode;
    private @Nullable Runnable mOnClosed;
    private @Nullable LinearLayout mCard;
    private final List<View> mNotes = new ArrayList<>();

    public SyncSheet(Activity activity, Runner runner, Scanner scanner) {
        mActivity = activity;
        mRunner = runner;
        mScanner = scanner;
        mDialog = new Dialog(activity, android.R.style.Theme_DeviceDefault_DayNight);
        // The screen draws its own bar with Back; the theme's empty action bar would sit above it.
        mDialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        View screen = LayoutInflater.from(activity).inflate(R.layout.blanc_sync_screen, null);
        mList = screen.findViewById(R.id.blanc_sync_list);
        screen.findViewById(R.id.blanc_sync_back).setOnClickListener(v -> mDialog.dismiss());
        mDialog.setContentView(screen);
        // The code and the passphrase aren't for screenshots or the app switcher.
        if (mDialog.getWindow() != null) {
            mDialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        }
        mDialog.setOnDismissListener(d -> {
            if (mPairingCode != null) mRunner.call("sync.cancelPairing", "[]", r -> {});
            mCode = "";
            mPassphrase = "";
            if (mOnClosed != null) mOnClosed.run();
        });
    }

    /** Runs once the sheet closes, so whoever opened it can show Sync's new status. */
    public void setOnClosed(Runnable onClosed) {
        mOnClosed = onClosed;
    }

    /** Opens the sheet on the real runner. */
    public static void open(Activity activity, PairScanner.Permissions permissions) {
        open(activity, permissions, null);
    }

    /** Opens the sheet on the real runner; {@code onClosed} runs when it closes. */
    public static void open(
            Activity activity, PairScanner.Permissions permissions, @Nullable Runnable onClosed) {
        Runner runner = new Runner() {
            @Override
            public void call(String method, String argsJson, Callback<String> done) {
                SyncBridge.call(method, argsJson, done);
            }

            @Override
            public boolean keyLost() {
                return SyncBridge.keyLost();
            }
        };
        SyncSheet sheet = new SyncSheet(activity, runner, new PairScanner(activity, permissions));
        if (onClosed != null) sheet.setOnClosed(onClosed);
        sheet.show();
    }

    public void show() {
        mDialog.show();
        refresh();
    }

    public boolean isShowing() {
        return mDialog.isShowing();
    }

    private void refresh() {
        mRunner.call("sync.status", "[]", reply -> {
            JSONObject value = value(reply);
            if (value != null) {
                mStatus = value;
                mDeviceName = value.optString("deviceName", "");
                if (mDeviceName.isEmpty()) mDeviceName = value.optString("deviceNamePublished", "");
                if (value.optBoolean("enabled") && keyError(value.optString("lastError")) && mRunner.keyLost()) {
                    forgetLostKey();
                    return;
                }
            }
            mRunner.call("spaces.status", "[]", spaces -> {
                JSONObject shared = value(spaces);
                if (shared != null) mSpaces = shared;
                render();
            });
        });
    }

    // A phone restored from a backup, or a key Android dropped: this phone's sync can't be opened.
    private static boolean keyError(String error) {
        return error.equals("local-key-unlock") || error.startsWith("key:");
    }

    /** Local only: the account and every other device stay as they are. */
    private void forgetLostKey() {
        mRunner.call("sync.disable", "[{\"wipeRemote\":false}]", reply -> {
            mState.otherWays = true;
            mState.typeCodeHint = true;
            refreshThen(text(R.string.blanc_sync_error_local_key_unlock));
        });
    }

    private void refreshThen(String error) {
        refresh();
        mError = error;
        render();
    }

    /** The reply's value, or null with the error kept for the sheet. */
    private @Nullable JSONObject value(String reply) {
        try {
            JSONObject outer = new JSONObject(reply);
            if (!outer.optBoolean("ok")) {
                mError = text(R.string.blanc_sync_error_server);
                return null;
            }
            return outer.optJSONObject("value");
        } catch (JSONException e) {
            mError = text(R.string.blanc_sync_error_server);
            return null;
        }
    }

    private String text(int id) {
        return mActivity.getString(id);
    }

    private String errorText(String code) {
        Integer id = ERRORS.get(code);
        return text(id != null ? id : R.string.blanc_sync_error_server);
    }

    /** Runs a call that answers {ok, error}, shows what happened, and reads the status again. */
    private void run(String method, Object[] args, @Nullable String success) {
        mBusy = true;
        mError = null;
        mNotice = null;
        render();
        mRunner.call(method, new JSONArray(java.util.Arrays.asList(args)).toString(), reply -> {
            mBusy = false;
            JSONObject value = value(reply);
            if (value != null && value.has("ok") && !value.optBoolean("ok")) {
                mError = errorText(value.optString("error"));
            } else if (value != null) {
                mNotice = success;
                mCode = "";
                mPassphrase = "";
                mState.otherWays = false;
                mState.switching = false;
            }
            refresh();
        });
    }

    private void join(String raw) {
        String code = raw.trim();
        boolean on = mStatus.optBoolean("enabled");
        run(on ? "sync.switchWithCode" : "sync.joinWithCode", new Object[] {code}, null);
    }

    private void render() {
        mState.enabled = mStatus.optBoolean("enabled");
        mState.hasLastSynced = mStatus.optLong("lastSyncedAt") > 0;
        mState.hasError = !mStatus.isNull("lastError") && !mStatus.optString("lastError").isEmpty();
        mList.removeAllViews();
        for (List<Row> group : SyncSheetModel.groups(mState)) {
            mCard = null;
            for (Row row : group) add(row);
            flushNotes();
        }
        mCard = null;
        if (mPairingCode != null) pairing();
        if (mBusy) note(text(R.string.blanc_ios_settings_working));
        if (mError != null) tagged(danger(note(mError)), "sync.error");
        if (mNotice != null) tagged(note(mNotice), "sync.notice");
        flushNotes();
    }

    /** Puts the help gathered for the current card under it. */
    private void flushNotes() {
        for (View note : mNotes) mList.addView(note);
        mNotes.clear();
    }

    private void add(Row row) {
        switch (row) {
            case STATUS -> value(text(R.string.blanc_ios_settings_status),
                    text(mState.enabled ? R.string.blanc_ios_settings_connected : R.string.blanc_ios_settings_not_connected));
            case ACCOUNT -> value(text(R.string.blanc_ios_settings_account), mStatus.optString("handle"));
            case LAST_SYNCED -> value(text(R.string.blanc_ios_settings_last_synced),
                    DateUtils.formatDateTime(mActivity, mStatus.optLong("lastSyncedAt"),
                            DateUtils.FORMAT_SHOW_DATE | DateUtils.FORMAT_SHOW_TIME));
            case ERROR -> danger(row(errorText(mStatus.optString("lastError")), null, null));
            case HELP -> note(text(R.string.blanc_ios_settings_sync_help));
            case OFF_INTRO -> {
                heading(text(R.string.blanc_ios_settings_sync_off_title));
                note(text(R.string.blanc_ios_settings_sync_off_body));
            }
            case PAIR_WITH_BLANC -> accent(action(text(R.string.blanc_ios_settings_pair_with_blanc), v -> scan()));
            case OTHER_WAYS -> action(text(R.string.blanc_ios_settings_other_ways), v -> {
                mState.otherWays = !mState.otherWays;
                render();
            });
            case CODE_HEADER -> heading(text(mState.switching ? R.string.blanc_ios_settings_switch_account : R.string.blanc_ios_settings_enter_code));
            case CODE_FIELD -> field(text(R.string.blanc_ios_settings_pairing_code), mCode, false, value -> mCode = value);
            case CONNECT -> accent(action(text(mState.switching ? R.string.blanc_ios_settings_switch_account : R.string.blanc_settings_sync_switch_connect), v -> join(mCode)));
            case TYPE_CODE_HINT -> note(text(R.string.blanc_ios_settings_type_code_shown));
            case PAIRING_HELP -> note(text(R.string.blanc_ios_settings_pairing_help));
            case PASSPHRASE_HEADER -> heading(text(R.string.blanc_ios_settings_use_passphrase));
            case HANDLE_FIELD -> field(text(R.string.blanc_settings_sync_sync_name), mHandle, false, value -> mHandle = value);
            case PASSPHRASE_FIELD -> field(text(R.string.blanc_ios_settings_passphrase), mPassphrase, true, value -> mPassphrase = value);
            case SIGN_IN -> accent(action(text(R.string.blanc_ios_settings_sign_in), v -> signIn()));
            case DESKTOP_ACCOUNT -> note(text(R.string.blanc_settings_sync_create_on_computer));
            case CANCEL_SWITCH -> action(text(R.string.blanc_fill_setup_enable_cancel_label), v -> {
                mState.switching = false;
                mCode = "";
                render();
            });
            case DEVICE_NAME -> {
                View name = row(text(R.string.blanc_ios_settings_device_name), mDeviceName, v -> rename());
                name.findViewById(R.id.blanc_sync_row_chevron).setVisibility(View.VISIBLE);
            }
            case SHARE_TABS -> toggle(text(R.string.blanc_ios_settings_share_tabs), mStatus.optBoolean("syncTabs"),
                    on -> run("sync.setSyncTabs", new Object[] {on}, null));
            case SHARE_HELP -> note(text(R.string.blanc_ios_settings_share_tabs_help));
            case SPACES -> spaces();
            case SYNC_NOW -> action(text(R.string.blanc_settings_sync_sync_now), v -> run("sync.syncNow", new Object[] {}, null));
            case PAIR_DEVICE -> action(text(R.string.blanc_settings_sync_add_another_device), v -> beginPairing());
            case COPY_RECOVERY -> action(text(R.string.blanc_settings_sync_recovery_copy), v -> confirmRecovery());
            case SWITCH_ACCOUNT -> action(text(R.string.blanc_ios_settings_switch_account), v -> {
                mState.switching = true;
                render();
            });
            case DISCONNECT -> danger(action(text(R.string.blanc_ios_settings_disconnect), v -> confirmDisconnect()));
        }
    }

    /** This phone's name, in a dialog with Save name, as the iPhone's field and button. */
    private void rename() {
        EditText name = (EditText) LayoutInflater.from(mActivity).inflate(R.layout.blanc_sync_field, null);
        name.setText(mDeviceName);
        name.setSelection(mDeviceName.length());
        name.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        new AlertDialog.Builder(mActivity)
                .setTitle(R.string.blanc_ios_settings_device_name)
                .setView(name)
                .setPositiveButton(R.string.blanc_ios_settings_save_name, (d, w) -> {
                    mDeviceName = name.getText().toString();
                    run("sync.setThisDeviceName", new Object[] {mDeviceName}, text(R.string.blanc_ios_settings_saved));
                })
                .setNegativeButton(R.string.blanc_fill_setup_enable_cancel_label, null)
                .show();
    }

    /** The Spaces switch: on asks which Spaces to share; off keeps dormant copies. */
    private void spaces() {
        boolean on = mSpaces.optBoolean("enabled");
        View keepRow = toggle(text(R.string.blanc_shared_spaces_switch_android), on, wanted -> {
            if (wanted) {
                new SharedSpacesSheet(mActivity, this::refresh).show();
                render();
            } else if (on) {
                run("spaces.apply", new Object[] {offArgument()}, null);
            }
        });
        tagged(keepRow.findViewById(R.id.blanc_sync_row_switch), "sync.spaces");
        note(text(R.string.blanc_shared_spaces_switch_line_android));
        if (on) {
            View choose = action(text(R.string.blanc_shared_spaces_title),
                    v -> new SharedSpacesSheet(mActivity, this::refresh).show());
            choose.findViewById(R.id.blanc_sync_row_chevron).setVisibility(View.VISIBLE);
        }
        if (!mSpaces.optBoolean("available", true)) {
            tagged(note(text(R.string.blanc_shared_spaces_unavailable)), "sync.spaces.unavailable");
        } else if (on) {
            JSONArray keys = mSpaces.optJSONArray("keys");
            for (int i = 0; keys != null && i < keys.length(); i++) {
                Integer status = SPACES_STATUS.get(keys.optString(i));
                if (status != null) note(text(status));
            }
            if (mSpaces.optBoolean("accountFull")) note(text(R.string.blanc_shared_spaces_account_full));
        } else if (mSpaces.optInt("spaces") > 0) {
            int count = mSpaces.optInt("spaces");
            note(mActivity.getResources().getQuantityString(R.plurals.blanc_shared_spaces_waiting_count, count, count));
        }
        note(text(on ? R.string.blanc_shared_spaces_account_line : R.string.blanc_shared_spaces_off_line));
    }

    private static JSONObject offArgument() {
        try {
            return new JSONObject().put("enabled", false);
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    private void scan() {
        mScanner.scan(code -> {
            if (code == null) {
                mState.otherWays = true;
                mState.typeCodeHint = true;
                render();
            } else {
                join(code);
            }
        });
    }

    private void signIn() {
        try {
            JSONObject account = new JSONObject().put("handle", mHandle).put("passphrase", mPassphrase);
            run("sync.enable", new Object[] {account}, null);
        } catch (JSONException e) {
            mError = text(R.string.blanc_sync_error_server);
            render();
        }
    }

    private void beginPairing() {
        mRunner.call("sync.beginPairing", "[]", reply -> {
            JSONObject value = value(reply);
            if (value != null && value.optBoolean("ok")) {
                mPairingCode = value.optString("code");
            } else if (value != null) {
                mError = errorText(value.optString("error"));
            }
            render();
        });
    }

    private void pairing() {
        String code = mPairingCode;
        if (code == null) return;
        heading(text(R.string.blanc_settings_sync_add_another_device));
        View shown = row(SyncCode.format(code), null, null);
        TextView digits = shown.findViewById(R.id.blanc_sync_row_title);
        digits.setTextSize(TypedValue.COMPLEX_UNIT_PX,
                mActivity.getResources().getDimension(R.dimen.blanc_sync_code_size));
        tagged(digits, "sync.pairingCode");
        note(text(R.string.blanc_settings_sync_pairing_instruction));
    }

    private void confirmRecovery() {
        new AlertDialog.Builder(mActivity)
                .setMessage(R.string.blanc_settings_sync_recovery_dialog_message)
                .setPositiveButton(R.string.blanc_settings_sync_recovery_copy,
                        (d, w) -> run("sync.copyRecoveryCode", new Object[] {}, null))
                .setNegativeButton(R.string.blanc_fill_setup_enable_cancel_label, null)
                .show();
    }

    private void confirmDisconnect() {
        new AlertDialog.Builder(mActivity)
                .setMessage(R.string.blanc_ios_settings_disconnect_help)
                .setPositiveButton(R.string.blanc_ios_settings_disconnect,
                        (d, w) -> run("sync.disable", new Object[] {}, null))
                .setNegativeButton(R.string.blanc_fill_setup_enable_cancel_label, null)
                .show();
    }

    /** Help under the current card; added once the card is. */
    private TextView note(String value) {
        TextView view = (TextView) LayoutInflater.from(mActivity).inflate(R.layout.blanc_sync_note, mList, false);
        view.setText(value);
        mNotes.add(view);
        return view;
    }

    /** A heading above the next card. */
    private void heading(String value) {
        TextView view = (TextView) LayoutInflater.from(mActivity).inflate(R.layout.blanc_sync_heading, mList, false);
        view.setText(value);
        mList.addView(view);
    }

    private LinearLayout card() {
        LinearLayout card = mCard;
        if (card == null) {
            card = (LinearLayout) LayoutInflater.from(mActivity).inflate(R.layout.blanc_sync_card, mList, false);
            mList.addView(card);
            mCard = card;
        }
        return card;
    }

    /** A row in the current card: a title, an optional value under it, and an optional tap. */
    private View row(String title, @Nullable String value, View.@Nullable OnClickListener click) {
        View row = LayoutInflater.from(mActivity).inflate(R.layout.blanc_sync_row, card(), false);
        ((TextView) row.findViewById(R.id.blanc_sync_row_title)).setText(title);
        if (value != null && !value.isEmpty()) {
            TextView shown = row.findViewById(R.id.blanc_sync_row_value);
            shown.setText(value);
            shown.setVisibility(View.VISIBLE);
        }
        if (click != null) {
            row.setOnClickListener(click);
            row.setEnabled(!mBusy);
        } else {
            row.setBackground(null);
        }
        card().addView(row);
        return row;
    }

    private void value(String label, String value) {
        row(label, value, null);
    }

    private View action(String label, View.OnClickListener click) {
        return row(label, null, click);
    }

    /** A row with a switch; tapping the row flips it. */
    private View toggle(String label, boolean on, Callback<Boolean> changed) {
        View row = row(label, null, null);
        Switch control = row.findViewById(R.id.blanc_sync_row_switch);
        control.setVisibility(View.VISIBLE);
        control.setChecked(on);
        control.setEnabled(!mBusy);
        control.setOnCheckedChangeListener((v, wanted) -> changed.onResult(wanted));
        row.setOnClickListener(v -> control.toggle());
        return row;
    }

    private View accent(View row) {
        ((TextView) row.findViewById(R.id.blanc_sync_row_title))
                .setTextColor(mActivity.getColor(R.color.blanc_sunrise_accent));
        return row;
    }

    private <T extends View> T danger(T view) {
        TextView label = view instanceof TextView t ? t : view.findViewById(R.id.blanc_sync_row_title);
        label.setTextColor(mActivity.getColor(R.color.blanc_settings_error));
        return view;
    }

    private void field(String hint, String value, boolean secret, Callback<String> changed) {
        EditText view = (EditText) LayoutInflater.from(mActivity).inflate(R.layout.blanc_sync_field, card(), false);
        view.setHint(hint);
        view.setText(value);
        view.setInputType(InputType.TYPE_CLASS_TEXT
                | (secret ? InputType.TYPE_TEXT_VARIATION_PASSWORD : InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS));
        view.addTextChangedListener(new android.text.TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void afterTextChanged(android.text.Editable s) {
                changed.onResult(s.toString());
            }
        });
        card().addView(view);
    }

    private static void tagged(View view, String tag) {
        view.setContentDescription(null);
        view.setTag(tag);
    }
}
