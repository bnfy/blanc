// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.spaces;

import android.app.Activity;
import android.app.Dialog;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.InsetDrawable;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
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
 * The Spaces menu, as Blanc for iPhone's SpacesCard: a card rising from the Island, which stays
 * visible below it. This Phone, then the phone's Spaces, then New Space and Edit, with moving,
 * renaming and Recently deleted in Edit. The same card holds the editor. A tap outside closes it.
 */
@NullMarked
public final class SpacesCard {
    private static final long UNDO_MILLIS = 5000;
    private static final String UNDO_TAG = "blanc_spaces_undo";
    /** Above the Island at the bottom of the screen. */
    private static final int ABOVE_ISLAND_DP = 84;
    private static final int LIST_HEIGHT_DP = 420;
    private static final int EDITOR_HEIGHT_DP = 560;
    private static final int FOOTER_HEIGHT_DP = 60;

    /** In {@link BlancSpaces#COLORS} order. */
    private static final int[] COLOR_NAMES = {
        R.string.blanc_spaces_color_sage, R.string.blanc_spaces_color_sky, R.string.blanc_spaces_color_iris,
        R.string.blanc_spaces_color_rose, R.string.blanc_spaces_color_clay, R.string.blanc_spaces_color_sand,
        R.string.blanc_spaces_color_slate, R.string.blanc_spaces_color_graphite
    };

    /** In {@link BlancSpaces#SYMBOLS} order. */
    private static final int[] SYMBOL_NAMES = {
        R.string.blanc_spaces_symbol_briefcase, R.string.blanc_spaces_symbol_house, R.string.blanc_spaces_symbol_code,
        R.string.blanc_spaces_symbol_flask, R.string.blanc_spaces_symbol_book, R.string.blanc_spaces_symbol_music,
        R.string.blanc_spaces_symbol_camera, R.string.blanc_spaces_symbol_plane, R.string.blanc_spaces_symbol_heart,
        R.string.blanc_spaces_symbol_star, R.string.blanc_spaces_symbol_leaf, R.string.blanc_spaces_symbol_coffee,
        R.string.blanc_spaces_symbol_cap, R.string.blanc_spaces_symbol_gamepad, R.string.blanc_spaces_symbol_wallet,
        R.string.blanc_spaces_symbol_sun
    };

    private final Activity mActivity;
    private final SpacesController mSpaces;
    private final IslandStyle mStyle;
    private final Dialog mDialog;
    private final LinearLayout mList;
    private final LinearLayout mFooter;
    private int mHeightDp = LIST_HEIGHT_DP;
    private boolean mEditing;

    private SpacesCard(Activity activity, SpacesController spaces) {
        mActivity = activity;
        mSpaces = spaces;
        mStyle = IslandStyle.forTab(false, dark(activity));
        mDialog = new Dialog(activity);
        mDialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        mDialog.setCanceledOnTouchOutside(true);
        mList = new LinearLayout(activity);
        mList.setOrientation(LinearLayout.VERTICAL);
        mList.setPadding(dp(16), dp(6), dp(16), dp(6));
        ScrollView scroll = new ScrollView(activity) {
            @Override
            protected void onMeasure(int width, int height) {
                int room = MeasureSpec.getSize(height) - dp(FOOTER_HEIGHT_DP);
                super.onMeasure(width, MeasureSpec.makeMeasureSpec(Math.min(room, dp(mHeightDp)), MeasureSpec.AT_MOST));
            }
        };
        scroll.addView(mList);
        mFooter = new LinearLayout(activity);
        mFooter.setGravity(Gravity.CENTER_VERTICAL);
        mFooter.setPadding(dp(16), 0, dp(16), dp(4));
        LinearLayout card = new LinearLayout(activity);
        card.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable fill = new GradientDrawable();
        fill.setColor(mStyle.raised);
        fill.setCornerRadius(dp(22));
        fill.setStroke(Math.max(1, dp(1) / 2), mStyle.border);
        card.setBackground(fill);
        card.addView(scroll);
        card.addView(mFooter);
        FrameLayout frame = new FrameLayout(activity);
        frame.setPadding(dp(12), 0, dp(12), 0);
        frame.addView(card);
        mDialog.setContentView(frame);
        Window window = mDialog.getWindow();
        if (window != null) {
            window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            window.setGravity(Gravity.BOTTOM);
            WindowManager.LayoutParams place = window.getAttributes();
            place.y = dp(ABOVE_ISLAND_DP);
            window.setAttributes(place);
            window.setDimAmount(0.25f);
            window.setWindowAnimations(android.R.style.Animation_InputMethod);
            window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        }
    }

    private static boolean dark(Activity activity) {
        return (activity.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
    }

    /** Opens the menu. */
    public static void open(Activity activity) {
        SpacesController spaces = SpacesController.current();
        if (spaces == null) return;
        SpacesCard card = new SpacesCard(activity, spaces);
        card.render();
        card.mDialog.show();
    }

    /** "Work deleted · Undo" over the page for Undo's five seconds. A new one replaces the last. */
    private static void undoBanner(Activity activity, SpacesController spaces, String name) {
        FrameLayout content = activity.findViewById(android.R.id.content);
        View last = content.findViewWithTag(UNDO_TAG);
        if (last != null) content.removeView(last);
        IslandStyle style = IslandStyle.forTab(false, dark(activity));
        float density = activity.getResources().getDisplayMetrics().density;
        LinearLayout banner = new LinearLayout(activity);
        banner.setTag(UNDO_TAG);
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

    private int secondary() {
        return (mStyle.text & 0x00FFFFFF) | 0x99000000;
    }

    private TextView text(String value, int sp) {
        TextView view = new TextView(mActivity);
        view.setText(value);
        view.setTextColor(mStyle.text);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        view.setPadding(0, dp(6), 0, dp(6));
        return view;
    }

    private TextView action(String label, View.OnClickListener click) {
        TextView view = text(label, 15);
        view.setTypeface(Typeface.DEFAULT_BOLD);
        view.setGravity(Gravity.CENTER_VERTICAL);
        view.setMinHeight(dp(44));
        view.setMinWidth(dp(44));
        view.setOnClickListener(click);
        return view;
    }

    /** Fills the footer: `start` at the left, `end` at the right, either left out when null. */
    private void footer(@Nullable View start, @Nullable View end) {
        mFooter.removeAllViews();
        if (start != null) mFooter.addView(start);
        mFooter.addView(new View(mActivity), new LinearLayout.LayoutParams(0, 1, 1));
        if (end != null) mFooter.addView(end);
    }

    /** The colored square with the symbol on it. */
    public static ImageView tile(Activity activity, String color, String symbol, int size) {
        ImageView view = new ImageView(activity);
        paintTile(activity, view, color, symbol, size, 0);
        view.setLayoutParams(new FrameLayout.LayoutParams(size, size));
        return view;
    }

    /** `view` as a tile of `size`, `inset` inside its own bounds. */
    private static void paintTile(Activity activity, ImageView view, String color, String symbol, int size, int inset) {
        BlancSpaces.Paint paint = BlancSpaces.paint(color, dark(activity));
        GradientDrawable fill = new GradientDrawable();
        fill.setColor(paint.fill);
        fill.setCornerRadius(size * 0.3f);
        if (paint.edge) fill.setStroke(1, dark(activity) ? 0x33FFFFFF : 0x33000000);
        view.setBackground(new InsetDrawable(fill, inset));
        view.setImageResource(symbolDrawable(symbol));
        view.setImageTintList(ColorStateList.valueOf(paint.on));
        view.setScaleType(ImageView.ScaleType.FIT_CENTER);
        int padding = inset + Math.round(size * 0.22f);
        view.setPadding(padding, padding, padding, padding);
    }

    /** The Island's mark: the shown Space's tile, or the plain Spaces glyph on This Phone. */
    public static void bindMark(Activity activity, ImageButton mark, @Nullable Space space, int plainColor) {
        if (space == null) {
            mark.setBackground(null);
            mark.setPadding(0, 0, 0, 0);
            mark.setScaleType(ImageView.ScaleType.CENTER);
            mark.setImageResource(R.drawable.blanc_spaces_glyph);
            mark.setImageTintList(ColorStateList.valueOf(plainColor));
            mark.setContentDescription(activity.getString(R.string.blanc_spaces_menu_label));
        } else {
            float density = activity.getResources().getDisplayMetrics().density;
            paintTile(activity, mark, space.color, space.symbol, Math.round(28 * density), Math.round(4 * density));
            mark.setContentDescription(activity.getString(R.string.blanc_spaces_mark_current, space.name));
        }
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

    private View phoneTile() {
        ImageView view = new ImageView(mActivity);
        GradientDrawable fill = new GradientDrawable();
        fill.setColor(mStyle.dark ? 0xFF161616 : 0xFFF4F4F2);
        fill.setCornerRadius(dp(9));
        view.setBackground(fill);
        view.setImageResource(R.drawable.blanc_spaces_phone);
        view.setImageTintList(ColorStateList.valueOf(mStyle.text));
        view.setPadding(dp(6), dp(6), dp(6), dp(6));
        return view;
    }

    private void row(@Nullable Space space, String name) {
        LinearLayout row = rowLayout();
        View icon = space == null ? phoneTile() : tile(mActivity, space.color, space.symbol, dp(30));
        row.addView(icon, new LinearLayout.LayoutParams(dp(30), dp(30)));
        String id = space == null ? null : space.id;
        int count = mSpaces.tabCount(id);
        String tabs = mActivity.getResources().getQuantityString(R.plurals.blanc_newtab_groups_count, count, count);
        LinearLayout labels = new LinearLayout(mActivity);
        labels.setOrientation(LinearLayout.VERTICAL);
        labels.setPadding(dp(12), 0, dp(12), 0);
        TextView label = text(name, 16);
        label.setTypeface(Typeface.DEFAULT_BOLD);
        label.setMaxLines(1);
        label.setPadding(0, 0, 0, 0);
        labels.addView(label);
        TextView detail = text(tabs, 13);
        detail.setTextColor(secondary());
        detail.setPadding(0, 0, 0, 0);
        labels.addView(detail);
        row.addView(labels, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        String shown = mSpaces.library().shownId;
        if (!mEditing && (id == null ? shown == null : id.equals(shown))) {
            ImageView check = new ImageView(mActivity);
            check.setImageResource(R.drawable.blanc_spaces_check);
            check.setImageTintList(ColorStateList.valueOf(mStyle.text));
            check.setContentDescription(mActivity.getString(R.string.blanc_ws_row_current));
            row.addView(check, new LinearLayout.LayoutParams(dp(20), dp(20)));
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
        row.setContentDescription(name + ", " + tabs);
        mList.addView(row);
    }

    private ImageButton icon(int drawable, String description, View.OnClickListener click) {
        ImageButton view = new ImageButton(mActivity);
        view.setImageResource(drawable);
        view.setImageTintList(ColorStateList.valueOf(mStyle.text));
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
        row.addView(tile, new LinearLayout.LayoutParams(dp(30), dp(30)));
        TextView label = text(entry.space.name, 16);
        label.setPadding(dp(12), 0, dp(12), 0);
        label.setMaxLines(1);
        row.addView(label, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        TextView restore = action(mActivity.getString(R.string.blanc_ws_recovery_restore), v -> {
            Result result = mSpaces.restore(entry.space.id);
            if (result != Result.OK) Toast.makeText(mActivity, errorText(result), Toast.LENGTH_LONG).show();
            render();
        });
        restore.setContentDescription(mActivity.getString(R.string.blanc_ws_recovery_restore_named, entry.space.name));
        boolean room = mSpaces.library().spaces.size() < BlancSpaces.LIMIT;
        restore.setEnabled(room);
        restore.setAlpha(room ? 1f : 0.4f);
        row.addView(restore);
        mList.addView(row);
    }

    private void render() {
        mHeightDp = LIST_HEIGHT_DP;
        mList.removeAllViews();
        row(null, mActivity.getString(R.string.blanc_spaces_this_phone));
        List<Space> spaces = new ArrayList<>(mSpaces.library().spaces);
        if (spaces.isEmpty()) mEditing = false;
        for (Space space : spaces) row(space, space.name);
        List<Deleted> deleted = new ArrayList<>(mSpaces.library().deleted);
        if (mEditing && !deleted.isEmpty()) {
            TextView heading = text(mActivity.getResources().getQuantityString(R.plurals.blanc_ws_list_recently_deleted,
                    deleted.size(), deleted.size()), 13);
            heading.setTypeface(Typeface.DEFAULT_BOLD);
            heading.setTextColor(secondary());
            mList.addView(heading);
            for (Deleted entry : deleted) deletedRow(entry);
        }
        footer(action(mActivity.getString(R.string.blanc_ws_new), v -> editor(null, "", null)),
                spaces.isEmpty() ? null
                        : action(mActivity.getString(mEditing ? R.string.blanc_ws_editor_done : R.string.blanc_spaces_menu_edit), v -> {
                            mEditing = !mEditing;
                            render();
                        }));
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
        mHeightDp = EDITOR_HEIGHT_DP;
        mList.removeAllViews();
        TextView title = text(mActivity.getString(space == null ? R.string.blanc_ws_editor_new_title : R.string.blanc_ws_editor_edit_title), 20);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        mList.addView(title);
        EditText name = new EditText(mActivity);
        name.setHint(R.string.blanc_ws_editor_name);
        name.setText(startName);
        name.setTextColor(mStyle.text);
        name.setHintTextColor(secondary());
        name.setSingleLine(true);
        mList.addView(name);
        TextView error = text("", 14);
        mList.addView(text(mActivity.getString(R.string.blanc_ws_editor_color), 14));
        GridLayout colors = new GridLayout(mActivity);
        colors.setColumnCount(8);
        for (int i = 0; i < BlancSpaces.COLORS.length; i++) {
            String hex = BlancSpaces.COLORS[i];
            View swatch = new View(mActivity);
            GradientDrawable fill = new GradientDrawable();
            fill.setColor(BlancSpaces.paint(hex, mStyle.dark).fill);
            fill.setShape(GradientDrawable.OVAL);
            swatch.setBackground(fill);
            swatch.setOnClickListener(v -> {
                color[0] = hex;
                for (int c = 0; c < colors.getChildCount(); c++) colors.getChildAt(c).setAlpha(0.4f);
                v.setAlpha(1f);
            });
            swatch.setAlpha(hex.equalsIgnoreCase(color[0]) ? 1f : 0.4f);
            swatch.setContentDescription(mActivity.getString(COLOR_NAMES[i]));
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
        for (int i = 0; i < BlancSpaces.SYMBOLS.length; i++) {
            String id = BlancSpaces.SYMBOLS[i];
            ImageButton choice = new ImageButton(mActivity);
            choice.setImageResource(symbolDrawable(id));
            choice.setBackground(null);
            choice.setImageTintList(ColorStateList.valueOf(mStyle.text));
            choice.setAlpha(id.equals(symbol[0]) ? 1f : 0.4f);
            choice.setContentDescription(mActivity.getString(SYMBOL_NAMES[i]));
            choice.setOnClickListener(v -> {
                symbol[0] = id;
                for (int c = 0; c < symbols.getChildCount(); c++) symbols.getChildAt(c).setAlpha(0.4f);
                v.setAlpha(1f);
            });
            GridLayout.LayoutParams params = new GridLayout.LayoutParams();
            params.width = dp(38);
            params.height = dp(38);
            symbols.addView(choice, params);
        }
        mList.addView(symbols);
        mList.addView(error);
        if (space != null) {
            mList.addView(action(mActivity.getString(R.string.blanc_ws_delete_button), v -> {
                mDialog.dismiss();
                mSpaces.delete(space.id, System.currentTimeMillis());
                undoBanner(mActivity, mSpaces, space.name);
            }));
        }
        footer(action(mActivity.getString(R.string.blanc_fill_setup_enable_cancel_label), v -> {
            if (space != null) render();
            else mDialog.dismiss();
        }), action(mActivity.getString(space == null ? R.string.blanc_ws_editor_create_button : R.string.blanc_ws_editor_done), v -> {
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
        }));
    }
}
