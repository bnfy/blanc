// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.address;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.shadows.ShadowLooper;

import org.chromium.base.test.BaseRobolectricTestRunner;

/** The address sheet: the iPhone palette's field, above the keyboard, with the address selected. */
@RunWith(BaseRobolectricTestRunner.class)
public class AddressSheetTest {
    private Activity mActivity;
    private String mOpened;

    @Before
    public void setUp() {
        mActivity = Robolectric.buildActivity(Activity.class).setup().get();
    }

    private AddressSheet show(String current) {
        AddressSheet sheet = AddressSheet.show(mActivity, current, url -> mOpened = url);
        ShadowLooper.idleMainLooper();
        return sheet;
    }

    @Test
    public void opensWithTheCurrentAddressSelected() {
        AddressSheet sheet = show("https://example.com/a");
        EditText field = sheet.field();
        assertEquals("https://example.com/a", field.getText().toString());
        assertEquals(0, field.getSelectionStart());
        assertEquals(field.length(), field.getSelectionEnd());
        assertEquals("Search, enter address, or / command", field.getHint().toString());
    }

    @Test
    public void goOpensAnAddressOrASearch() {
        AddressSheet sheet = show("");
        sheet.field().setText("example.com");
        sheet.field().onEditorAction(EditorInfo.IME_ACTION_GO);
        assertEquals("https://example.com", mOpened);
        assertFalse(sheet.isShowing());
        AddressSheet again = show("");
        again.field().setText("how tall is everest");
        again.field().onEditorAction(EditorInfo.IME_ACTION_GO);
        assertEquals("https://duckduckgo.com/?q=how%20tall%20is%20everest", mOpened);
    }

    @Test
    public void emptyTextOpensNothing() {
        AddressSheet sheet = show("");
        sheet.field().setText("   ");
        sheet.field().onEditorAction(EditorInfo.IME_ACTION_GO);
        assertNull(mOpened);
        assertTrue(sheet.isShowing());
    }

    @Test
    public void backDismissesWithoutOpening() {
        AddressSheet sheet = show("https://example.com/");
        sheet.cancel();
        assertFalse(sheet.isShowing());
        assertNull(mOpened);
    }

    @Test
    public void theFieldStaysAboveTheKeyboard() {
        AddressSheet sheet = show("");
        int mode = sheet.getWindow().getAttributes().softInputMode;
        assertEquals(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE,
                mode & WindowManager.LayoutParams.SOFT_INPUT_MASK_ADJUST);
        assertEquals(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE,
                mode & WindowManager.LayoutParams.SOFT_INPUT_MASK_STATE);
    }
}
