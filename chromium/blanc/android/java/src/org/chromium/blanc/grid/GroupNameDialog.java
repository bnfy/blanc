// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.grid;

import android.app.Activity;
import android.app.AlertDialog;
import android.text.Editable;
import android.text.TextWatcher;
import android.widget.Button;
import android.widget.EditText;

import org.chromium.blanc.address.AddressInput;
import org.chromium.blanc.island.R;
import org.chromium.build.annotations.NullMarked;

/**
 * Naming a group, as the iPhone's GroupNameSheet: a field labeled "Group name", Done disabled while
 * it's blank, and a refusal shown under it (a name another group already has).
 */
@NullMarked
final class GroupNameDialog {
    /** Applies a name; returns the refusal to show, or "" when it was applied. */
    interface Apply {
        String apply(String name);
    }

    private GroupNameDialog() {}

    static AlertDialog show(Activity activity, String initial, Apply apply) {
        EditText field = new EditText(activity);
        field.setSingleLine(true);
        field.setHint(R.string.blanc_group_menu_name_label);
        field.setText(initial);
        field.setSelectAllOnFocus(true);
        AlertDialog dialog = new AlertDialog.Builder(activity)
                .setTitle(R.string.blanc_group_menu_name_label)
                .setView(field)
                .setPositiveButton(R.string.blanc_ws_editor_done, null)
                .setNegativeButton(R.string.blanc_shared_spaces_cancel, null)
                .create();
        dialog.setOnShowListener(d -> {
            Button done = dialog.getButton(AlertDialog.BUTTON_POSITIVE);
            done.setEnabled(!AddressInput.trim(initial).isEmpty());
            field.addTextChangedListener(new TextWatcher() {
                @Override
                public void beforeTextChanged(CharSequence s, int start, int count, int after) {}

                @Override
                public void onTextChanged(CharSequence s, int start, int before, int count) {
                    field.setError(null);
                }

                @Override
                public void afterTextChanged(Editable s) {
                    done.setEnabled(!AddressInput.trim(s.toString()).isEmpty());
                }
            });
            done.setOnClickListener(v -> {
                String refusal = apply.apply(field.getText().toString());
                if (refusal.isEmpty()) {
                    dialog.dismiss();
                } else {
                    field.setError(refusal);
                }
            });
        });
        dialog.show();
        field.requestFocus();
        return dialog;
    }
}
