// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.res.Resources;
import android.text.InputType;
import android.text.format.DateUtils;
import android.util.TypedValue;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import org.chromium.base.Callback;
import org.chromium.blanc.island.R;
import org.chromium.blanc.sync.SyncSheetModel.Row;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.HashMap;
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

    private final Activity mActivity;
    private final Runner mRunner;
    private final Scanner mScanner;
    private final Dialog mDialog;
    private final LinearLayout mList;
    private final SyncSheetModel.State mState = new SyncSheetModel.State();
    private JSONObject mStatus = new JSONObject();
    private String mCode = "";
    private String mHandle = "";
    private String mPassphrase = "";
    private String mDeviceName = "";
    private @Nullable String mError;
    private @Nullable String mNotice;
    private boolean mBusy;
    private @Nullable String mPairingCode;

    public SyncSheet(Activity activity, Runner runner, Scanner scanner) {
        mActivity = activity;
        mRunner = runner;
        mScanner = scanner;
        mDialog = new Dialog(activity, android.R.style.Theme_DeviceDefault_DayNight);
        mList = new LinearLayout(activity);
        mList.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(20);
        mList.setPadding(pad, pad, pad, pad);
        ScrollView scroll = new ScrollView(activity);
        scroll.setFitsSystemWindows(true);
        scroll.addView(mList);
        mDialog.setContentView(scroll);
        // The code and the passphrase aren't for screenshots or the app switcher.
        if (mDialog.getWindow() != null) {
            mDialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        }
        mDialog.setOnDismissListener(d -> {
            if (mPairingCode != null) mRunner.call("sync.cancelPairing", "[]", r -> {});
            mCode = "";
            mPassphrase = "";
        });
    }

    /** Opens the sheet on the real runner. */
    public static void open(Activity activity, PairScanner.Permissions permissions) {
        new SyncSheet(activity, SyncBridge::call, new PairScanner(activity, permissions)).show();
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
                if (value.optBoolean("enabled") && keyLost(value.optString("lastError"))) {
                    forgetLostKey();
                    return;
                }
            }
            render();
        });
    }

    // A phone restored from a backup, or a key Android dropped: this phone's sync can't be opened.
    private static boolean keyLost(String error) {
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
        title(text(R.string.blanc_settings_nav_sync));
        for (Row row : SyncSheetModel.rows(mState)) add(row);
        if (mPairingCode != null) pairing();
        if (mBusy) line(text(R.string.blanc_ios_settings_working));
        if (mError != null) tagged(line(mError), "sync.error");
        if (mNotice != null) tagged(line(mNotice), "sync.notice");
        Button done = button(text(R.string.blanc_shield_done), v -> mDialog.dismiss());
        done.setEnabled(true);
    }

    private void add(Row row) {
        switch (row) {
            case STATUS -> pair(text(R.string.blanc_ios_settings_status),
                    text(mState.enabled ? R.string.blanc_ios_settings_connected : R.string.blanc_ios_settings_not_connected));
            case ACCOUNT -> pair(text(R.string.blanc_ios_settings_account), mStatus.optString("handle"));
            case LAST_SYNCED -> pair(text(R.string.blanc_ios_settings_last_synced),
                    DateUtils.formatDateTime(mActivity, mStatus.optLong("lastSyncedAt"),
                            DateUtils.FORMAT_SHOW_DATE | DateUtils.FORMAT_SHOW_TIME));
            case ERROR -> line(errorText(mStatus.optString("lastError")));
            case HELP -> line(text(R.string.blanc_ios_settings_sync_help));
            case OFF_INTRO -> {
                header(text(R.string.blanc_ios_settings_sync_off_title));
                line(text(R.string.blanc_ios_settings_sync_off_body));
            }
            case PAIR_WITH_BLANC -> button(text(R.string.blanc_ios_settings_pair_with_blanc), v -> scan());
            case OTHER_WAYS -> button(text(R.string.blanc_ios_settings_other_ways), v -> {
                mState.otherWays = !mState.otherWays;
                render();
            });
            case CODE_HEADER -> header(text(mState.switching ? R.string.blanc_ios_settings_switch_account : R.string.blanc_ios_settings_enter_code));
            case CODE_FIELD -> field(text(R.string.blanc_ios_settings_pairing_code), mCode, false, value -> mCode = value);
            case CONNECT -> button(text(mState.switching ? R.string.blanc_ios_settings_switch_account : R.string.blanc_settings_sync_switch_connect), v -> join(mCode));
            case TYPE_CODE_HINT -> line(text(R.string.blanc_ios_settings_type_code_shown));
            case PAIRING_HELP -> line(text(R.string.blanc_ios_settings_pairing_help));
            case PASSPHRASE_HEADER -> header(text(R.string.blanc_ios_settings_use_passphrase));
            case HANDLE_FIELD -> field(text(R.string.blanc_settings_sync_sync_name), mHandle, false, value -> mHandle = value);
            case PASSPHRASE_FIELD -> field(text(R.string.blanc_ios_settings_passphrase), mPassphrase, true, value -> mPassphrase = value);
            case SIGN_IN -> button(text(R.string.blanc_ios_settings_sign_in), v -> signIn());
            case DESKTOP_ACCOUNT -> line(text(R.string.blanc_settings_sync_create_on_computer));
            case CANCEL_SWITCH -> button(text(R.string.blanc_fill_setup_enable_cancel_label), v -> {
                mState.switching = false;
                mCode = "";
                render();
            });
            case DEVICE_NAME -> field(text(R.string.blanc_ios_settings_device_name), mDeviceName, false, value -> mDeviceName = value);
            case SAVE_NAME -> button(text(R.string.blanc_ios_settings_save_name),
                    v -> run("sync.setThisDeviceName", new Object[] {mDeviceName}, text(R.string.blanc_ios_settings_saved)));
            case SYNC_NOW -> button(text(R.string.blanc_settings_sync_sync_now), v -> run("sync.syncNow", new Object[] {}, null));
            case PAIR_DEVICE -> button(text(R.string.blanc_settings_sync_add_another_device), v -> beginPairing());
            case COPY_RECOVERY -> button(text(R.string.blanc_settings_sync_recovery_copy), v -> confirmRecovery());
            case SWITCH_ACCOUNT -> button(text(R.string.blanc_ios_settings_switch_account), v -> {
                mState.switching = true;
                render();
            });
            case DISCONNECT -> button(text(R.string.blanc_ios_settings_disconnect), v -> confirmDisconnect());
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
        header(text(R.string.blanc_settings_sync_add_another_device));
        TextView shown = line(SyncCode.format(code));
        shown.setTextSize(TypedValue.COMPLEX_UNIT_SP, 32);
        tagged(shown, "sync.pairingCode");
        line(text(R.string.blanc_settings_sync_pairing_instruction));
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

    private int dp(int value) {
        return Math.round(value * mActivity.getResources().getDisplayMetrics().density);
    }

    private void title(String value) {
        TextView view = line(value);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, 24);
    }

    private void header(String value) {
        TextView view = line(value);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        view.setPadding(0, dp(16), 0, dp(4));
    }

    private TextView line(String value) {
        TextView view = new TextView(mActivity);
        view.setText(value);
        view.setPadding(0, dp(4), 0, dp(4));
        mList.addView(view);
        return view;
    }

    private void pair(String label, String value) {
        line(label + ": " + value);
    }

    private Button button(String label, View.OnClickListener click) {
        Button view = new Button(mActivity);
        view.setText(label);
        view.setAllCaps(false);
        view.setEnabled(!mBusy);
        view.setOnClickListener(click);
        mList.addView(view);
        return view;
    }

    private void field(String hint, String value, boolean secret, Callback<String> changed) {
        EditText view = new EditText(mActivity);
        view.setHint(hint);
        view.setText(value);
        view.setSingleLine(true);
        view.setInputType(InputType.TYPE_CLASS_TEXT
                | (secret ? InputType.TYPE_TEXT_VARIATION_PASSWORD : InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS));
        view.addTextChangedListener(new android.text.TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void afterTextChanged(android.text.Editable s) {
                changed.onResult(s.toString());
            }
        });
        mList.addView(view);
    }

    private static void tagged(View view, String tag) {
        view.setContentDescription(null);
        view.setTag(tag);
    }
}
