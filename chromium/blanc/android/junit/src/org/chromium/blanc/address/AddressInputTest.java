// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.address;

import static org.junit.Assert.assertEquals;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.annotation.Config;

import org.chromium.base.test.BaseRobolectricTestRunner;

/**
 * Typed text means what it means in shipping Blanc: a differential test against the Island's
 * verified JavaScript port over the shared corpus (AddressFixtures), plus DuckDuckGo search URLs
 * encoded as shipping's encodeURIComponent does.
 */
@RunWith(BaseRobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class AddressInputTest {
    @Test
    public void matchesShippingOnEveryFixture() {
        assertEquals("the corpus is all there", 1749, AddressFixtures.ROWS.length);
        for (String[] row : AddressFixtures.ROWS) {
            AddressInput.Result r = AddressInput.interpret(row[0]);
            String got = r.kind.name().toLowerCase(java.util.Locale.ROOT) + " " + r.value + " " + r.confirm;
            assertEquals("input " + row[0], row[1] + " " + row[2] + " " + row[3], got);
        }
    }

    @Test
    public void aTemplateChoosesTheEngineAndTheEncodingStaysTheSame() {
        assertEquals("https://kagi.com/search?q=caf%C3%A9%20x", AddressInput.searchUrl("café x", "https://kagi.com/search?q=%s"));
        assertEquals(AddressInput.searchUrl("a b"), AddressInput.searchUrl("a b", "https://duckduckgo.com/?q=%s"));
    }

    @Test
    public void searchesGoToDuckDuckGoEncodedAsShippingDoes() {
        assertEquals("https://duckduckgo.com/?q=how%20tall%20is%20everest", AddressInput.searchUrl("how tall is everest"));
        assertEquals("https://duckduckgo.com/?q=site%3Aexample.com", AddressInput.searchUrl("site:example.com"));
        assertEquals("unreserved stay", "https://duckduckgo.com/?q=a-_.!~*'()z", AddressInput.searchUrl("a-_.!~*'()z"));
        assertEquals("https://duckduckgo.com/?q=caf%C3%A9%20%26%20%2B%2F%3F%23", AddressInput.searchUrl("café & +/?#"));
        assertEquals("https://duckduckgo.com/?q=%F0%9F%98%80", AddressInput.searchUrl("😀"));
    }

    @Test
    public void aPortTooLongForANumberIsNotAnAddress() {
        AddressInput.interpret("https://example.com:99999999999999999999");
        AddressInput.interpret("a.b:65536");
    }
}
