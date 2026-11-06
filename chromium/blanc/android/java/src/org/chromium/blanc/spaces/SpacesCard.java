// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.spaces;

import android.app.Activity;
import android.app.Dialog;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.GridLayout;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.chromium.blanc.island.IslandStyle;
import org.chromium.blanc.island.R;
import org.chromium.blanc.spaces.BlancSpaces.Deleted;
import org.chromium.blanc.spaces.BlancSpaces.Result;
import org.chromium.blanc.spaces.BlancSpaces.Space;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;

/**
 * The Spaces menu, Blanc for iPhone's SpacesCard: This Phone, then the Spaces, New Space, and Edit
 * with moving, renaming and Recently deleted. The same sheet holds the editor.
 */
@NullMarked
public final class SpacesCard {
    private final Activity mActivity;
    private static final long UNDO_MILLIS = 5000;

    private final SpacesController mSpaces;
    private final Dialog mDialog;
    private final LinearLayout mList;
    private boolean mEditing;

    private SpacesCard(Activity activity, SpacesController spaces) {
        mActivity = activity;
        mSpaces = spaces;
        mDialog = new Dialog(activity, android.R.style.Theme_DeviceDefault_DayNight);
        mList = new LinearLayout(activity);
        mList.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(20);
        mList.setPadding(pad, pad, pad, pad);
        ScrollView scroll = new ScrollView(activity);
        scroll.setFitsSystemWindows(true);
        scroll.addView(mList);
        mDialog.setContentView(scroll);
    }

    /** Opens the menu. */
    public static void open(Activity activity) {
        SpacesController spaces = SpacesController.current();
        if (spaces == null) return;
        SpacesCard card = new SpacesCard(activity, spaces);
        card.render();
        card.mDialog.show();
    }

    /** "Work deleted · Undo" over the page for Undo's five seconds. */
    private static void undoBanner(Activity activity, SpacesController spaces, String name) {
        FrameLayout content = activity.findViewById(android.R.id.content);
        boolean dark = (activity.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
        IslandStyle style = IslandStyle.forTab(false, dark);
        float density = activity.getResources().getDisplayMetrics().density;
        LinearLayout banner = new LinearLayout(activity);
        banner.setGravity(Gravity.CENTER_VERTICAL);
        banner.setPadding(Math.round(16 * density), Math.round(6 * density), Math.round(6 * density), Math.round(6 * density));
        GradientDrawable fill = new GradientDrawable();
        fill.setColor(style.text);
        fill.setCornerRadius(22 * density);
        banner.setBackground(fill);
        TextView label = new TextView(activity);
        label.setText(activity.getString(R.string.blanc_ws_undo_deleted, name));
        label.setTextColor(style.raised);
        label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        label.setMaxLines(1);
        banner.addView(label);
        TextView undo = new TextView(activity);
        undo.setText(R.string.blanc_menu_undo);
        undo.setTextColor(style.raised);
        undo.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        undo.setTypeface(Typeface.DEFAULT_BOLD);
        undo.setGravity(Gravity.CENTER);
        undo.setPadding(Math.round(14 * density), 0, Math.round(14 * density), 0);
        undo.setMinHeight(Math.round(44 * density));
        undo.setOnClickListener(v -> {
            content.removeView(banner);
            spaces.undoDelete();
        });
        banner.addView(undo);
        FrameLayout.LayoutParams place = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        place.bottomMargin = Math.round(96 * density);
        content.addView(banner, place);
        banner.postDelayed(() -> {
            if (banner.getParent() == null) return;
            content.removeView(banner);
            spaces.forgetUndo();
        }, UNDO_MILLIS);
    }

    /** Opens the editor for a new Space with `name` filled in, holding `tabId` if there is one. */
    public static void create(Activity activity, String name, @Nullable String tabId) {
        SpacesController spaces = SpacesController.current();
        if (spaces == null) return;
        SpacesCard card = new SpacesCard(activity, spaces);
        card.editor(null, name, tabId);
        card.mDialog.show();
    }

    private int dp(int value) {
        return Math.round(value * mActivity.getResources().getDisplayMetrics().density);
    }

    private TextView text(String value, int sp) {
        TextView view = new TextView(mActivity);
        view.setText(value);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        view.setPadding(0, dp(6), 0, dp(6));
        return view;
    }

    private Button button(String label, View.OnClickListener click) {
        Button view = new Button(mActivity);
        view.setText(label);
        view.setAllCaps(false);
        view.setOnClickListener(click);
        mList.addView(view);
        return view;
    }

    /** The colored square with the symbol on it. */
    private static ImageView tile(Activity activity, String color, String symbol, int size) {
        ImageView view = new ImageView(activity);
        GradientDrawable fill = new GradientDrawable();
        fill.setColor(Color.parseColor(color));
        fill.setCornerRadius(size * 0.3f);
        view.setBackground(fill);
        view.setImageResource(symbolDrawable(symbol));
        view.setImageTintList(ColorStateList.valueOf(Color.WHITE));
        view.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        int inset = size / 5;
        view.setPadding(inset, inset, inset, inset);
        view.setLayoutParams(new LinearLayout.LayoutParams(size, size));
        return view;
    }

    /** The Island's mark: the shown Space's symbol in its color, or the Spaces glyph on This Phone. */
    public static void bindMark(Activity activity, ImageButton mark, @Nullable Space space, int plainColor) {
        mark.setImageResource(space == null ? R.drawable.blanc_spaces_glyph : symbolDrawable(space.symbol));
        mark.setImageTintList(ColorStateList.valueOf(space == null ? plainColor : Color.parseColor(space.color)));
        mark.setContentDescription(space == null
                ? activity.getString(R.string.blanc_spaces_menu_label)
                : activity.getString(R.string.blanc_spaces_mark_current, space.name));
        mark.setOnClickListener(v -> open(activity));
    }

    /** A symbol's drawable; an unknown one draws as the Spaces glyph. */
    public static int symbolDrawable(String symbol) {
        switch (symbol) {
            case "briefcase": return R.drawable.blanc_space_briefcase;
            case "house": return R.drawable.blanc_space_house;
            case "code": return R.drawable.blanc_space_code;
            case "flask": return R.drawable.blanc_space_flask;
            case "book": return R.drawable.blanc_space_book;
            case "music": return R.drawable.blanc_space_music;
            case "camera": return R.drawable.blanc_space_camera;
            case "plane": return R.drawable.blanc_space_plane;
            case "heart": return R.drawable.blanc_space_heart;
            case "star": return R.drawable.blanc_space_star;
            case "leaf": return R.drawable.blanc_space_leaf;
            case "coffee": return R.drawable.blanc_space_coffee;
            case "cap": return R.drawable.blanc_space_cap;
            case "gamepad": return R.drawable.blanc_space_gamepad;
            case "wallet": return R.drawable.blanc_space_wallet;
            case "sun": return R.drawable.blanc_space_sun;
            default: return R.drawable.blanc_spaces_glyph;
        }
    }

    private LinearLayout rowLayout() {
        LinearLayout row = new LinearLayout(mActivity);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setMinimumHeight(dp(52));
        return row;
    }

    private void row(@Nullable Space space, String name) {
        LinearLayout row = rowLayout();
        if (space != null) row.addView(tile(mActivity, space.color, space.symbol, dp(30)));
        TextView label = text(name, 16);
        label.setPadding(dp(12), 0, dp(12), 0);
        row.addView(label, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        String id = space == null ? null : space.id;
        String shown = mSpaces.library().shownId;
        if (id == null ? shown == null : id.equals(shown)) {
            ImageView check = new ImageView(mActivity);
            check.setImageResource(R.drawable.blanc_spaces_check);
            check.setImageTintList(ink());
            check.setContentDescription(mActivity.getString(R.string.blanc_ws_row_current));
            row.addView(check);
        }
        if (mEditing && space != null) {
            List<Space> spaces = mSpaces.library().spaces;
            row.addView(moveButton(space, -1, R.drawable.blanc_spaces_arrow_up, R.string.blanc_settings_link_routes_move_up,
                    spaces.get(0) != space));
            row.addView(moveButton(space, 1, R.drawable.blanc_spaces_arrow_down, R.string.blanc_settings_link_routes_move_down,
                    spaces.get(spaces.size() - 1) != space));
            row.addView(icon(R.drawable.blanc_spaces_pencil, mActivity.getString(R.string.blanc_ws_row_edit, space.name),
                    v -> editor(space, space.name, null)));
        }
        if (!mEditing) {
            row.setOnClickListener(v -> {
                mDialog.dismiss();
                mSpaces.show(id);
            });
        }
        row.setContentDescription(name);
        mList.addView(row);
    }

    private ColorStateList ink() {
        return new TextView(mActivity).getTextColors();
    }

    private ImageButton icon(int drawable, String description, View.OnClickListener click) {
        ImageButton view = new ImageButton(mActivity);
        view.setImageResource(drawable);
        view.setImageTintList(ink());
        view.setBackground(null);
        view.setContentDescription(description);
        view.setOnClickListener(click);
        view.setLayoutParams(new LinearLayout.LayoutParams(dp(40), dp(44)));
        return view;
    }

    private ImageButton moveButton(Space space, int by, int drawable, int description, boolean enabled) {
        ImageButton view = icon(drawable, mActivity.getString(description), v -> {
            mSpaces.reorder(space.id, by);
            render();
        });
        view.setEnabled(enabled);
        view.setAlpha(enabled ? 1f : 0.3f);
        return view;
    }

    private void deletedRow(Deleted entry) {
        LinearLayout row = rowLayout();
        View tile = tile(mActivity, entry.space.color, entry.space.symbol, dp(30));
        tile.setAlpha(0.6f);
        row.addView(tile);
        TextView label = text(entry.space.name, 16);
        label.setPadding(dp(12), 0, dp(12), 0);
        row.addView(label, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        TextView restore = text(mActivity.getString(R.string.blanc_ws_recovery_restore), 15);
        restore.setTypeface(Typeface.DEFAULT_BOLD);
        restore.setGravity(Gravity.CENTER);
        restore.setMinHeight(dp(44));
        restore.setMinWidth(dp(44));
        restore.setContentDescription(mActivity.getString(R.string.blanc_ws_recovery_restore_named, entry.space.name));
        boolean room = mSpaces.library().spaces.size() < BlancSpaces.LIMIT;
        restore.setEnabled(room);
        restore.setAlpha(room ? 1f : 0.4f);
        restore.setOnClickListener(v -> {
            Result result = mSpaces.restore(entry.space.id);
            if (result != Result.OK) Toast.makeText(mActivity, errorText(result), Toast.LENGTH_LONG).show();
            render();
        });
        row.addView(restore);
        mList.addView(row);
    }

    private void render() {
        mList.removeAllViews();
        mList.addView(text(mActivity.getString(R.string.blanc_spaces_menu_label), 24));
        row(null, mActivity.getString(R.string.blanc_spaces_this_phone));
        for (Space space : new ArrayList<>(mSpaces.library().spaces)) row(space, space.name);
        button(mActivity.getString(R.string.blanc_ws_new), v -> editor(null, "", null));
        button(mActivity.getString(mEditing ? R.string.blanc_ws_editor_done : R.string.blanc_spaces_menu_edit), v -> {
            mEditing = !mEditing;
            render();
        });
        List<Deleted> deleted = new ArrayList<>(mSpaces.library().deleted);
        if (mEditing && !deleted.isEmpty()) {
            mList.addView(text(mActivity.getResources().getQuantityString(R.plurals.blanc_ws_list_recently_deleted,
                    deleted.size(), deleted.size()), 13));
            for (Deleted entry : deleted) deletedRow(entry);
        }
    }

    private String errorText(Result result) {
        switch (result) {
            case LIMIT:
                return mActivity.getString(R.string.blanc_ws_error_limit, String.valueOf(BlancSpaces.LIMIT));
            case DUPLICATE_NAME:
                return mActivity.getString(R.string.blanc_ws_error_duplicate_name);
            default:
                return mActivity.getString(R.string.blanc_ws_error_invalid_name);
        }
    }

    private void editor(@Nullable Space space, String startName, @Nullable String tabId) {
        BlancSpaces library = mSpaces.library();
        String[] color = {space != null ? space.color : library.nextColor()};
        String[] symbol = {space != null ? space.symbol : library.nextSymbol()};
        mList.removeAllViews();
        mList.addView(text(mActivity.getString(space == null ? R.string.blanc_ws_editor_new_title : R.string.blanc_ws_editor_edit_title), 24));
        EditText name = new EditText(mActivity);
        name.setHint(R.string.blanc_ws_editor_name);
        name.setText(startName);
        name.setSingleLine(true);
        mList.addView(name);
        TextView error = text("", 14);
        mList.addView(text(mActivity.getString(R.string.blanc_ws_editor_color), 14));
        GridLayout colors = new GridLayout(mActivity);
        colors.setColumnCount(8);
        for (String hex : BlancSpaces.COLORS) {
            View swatch = new View(mActivity);
            GradientDrawable fill = new GradientDrawable();
            fill.setColor(Color.parseColor(hex));
            fill.setShape(GradientDrawable.OVAL);
            swatch.setBackground(fill);
            swatch.setOnClickListener(v -> {
                color[0] = hex;
                for (int i = 0; i < colors.getChildCount(); i++) colors.getChildAt(i).setAlpha(0.4f);
                v.setAlpha(1f);
            });
            swatch.setAlpha(hex.equals(color[0]) ? 1f : 0.4f);
            swatch.setContentDescription(hex);
            GridLayout.LayoutParams params = new GridLayout.LayoutParams();
            params.width = dp(32);
            params.height = dp(32);
            params.setMargins(dp(3), dp(3), dp(3), dp(3));
            colors.addView(swatch, params);
        }
        mList.addView(colors);
        mList.addView(text(mActivity.getString(R.string.blanc_ws_editor_symbol), 14));
        GridLayout symbols = new GridLayout(mActivity);
        symbols.setColumnCount(8);
        for (String id : BlancSpaces.SYMBOLS) {
            ImageButton choice = new ImageButton(mActivity);
            choice.setImageResource(symbolDrawable(id));
            choice.setBackground(null);
            choice.setImageTintList(ColorStateList.valueOf(Color.GRAY));
            choice.setAlpha(id.equals(symbol[0]) ? 1f : 0.4f);
            choice.setContentDescription(id);
            choice.setOnClickListener(v -> {
                symbol[0] = id;
                for (int i = 0; i < symbols.getChildCount(); i++) symbols.getChildAt(i).setAlpha(0.4f);
                v.setAlpha(1f);
            });
            GridLayout.LayoutParams params = new GridLayout.LayoutParams();
            params.width = dp(38);
            params.height = dp(38);
            symbols.addView(choice, params);
        }
        mList.addView(symbols);
        mList.addView(error);
        button(mActivity.getString(space == null ? R.string.blanc_ws_editor_create_button : R.string.blanc_ws_editor_done), v -> {
            String typed = name.getText().toString();
            Result result = space != null ? mSpaces.update(space.id, typed, color[0], symbol[0])
                    : tabId != null ? mSpaces.createWithTab(tabId, typed, color[0], symbol[0])
                    : mSpaces.createAndShow(typed, color[0], symbol[0]);
            if (result != Result.OK) {
                error.setText(errorText(result));
            } else if (space != null) {
                render();
            } else {
                mDialog.dismiss();
            }
        });
        if (space != null) {
            button(mActivity.getString(R.string.blanc_ws_delete_button), v -> {
                mDialog.dismiss();
                mSpaces.delete(space.id, System.currentTimeMillis());
                undoBanner(mActivity, mSpaces, space.name);
            });
        }
        button(mActivity.getString(R.string.blanc_fill_setup_enable_cancel_label), v -> {
            if (space != null) render();
            else mDialog.dismiss();
        });
    }
}
