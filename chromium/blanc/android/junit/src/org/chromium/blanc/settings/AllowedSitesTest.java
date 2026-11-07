// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.settings;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;
import org.junit.runner.RunWith;

import org.chromium.base.test.BaseRobolectricTestRunner;

import java.util.List;

/** The allowed-sites rules, as the iPhone's SettingsSiteInput and AdblockExceptions apply them. */
@RunWith(BaseRobolectricTestRunner.class)
public class AllowedSitesTest {
    @Test
    public void normalizesAnAddressToItsLowercaseHostWithoutWww() {
        assertEquals("example.com", AllowedSites.normalize("https://www.Example.com/path?q=1"));
        assertEquals("example.com", AllowedSites.normalize("example.com"));
        assertEquals("news.example.co.uk", AllowedSites.normalize("  http://news.example.co.uk:8080/x "));
    }

    @Test
    public void refusesWhatIsNotAWebSite() {
        for (String input : new String[] {"", "   ", "ftp://example.com", "not a site", "http://", "https://exa mple.com",
                "javascript:alert(1)", "https://www."}) {
            assertNull(input, AllowedSites.normalize(input));
        }
    }

    @Test
    public void addingAppendsTheNormalizedHost() {
        AllowedSites.Result result = AllowedSites.add(List.of("a.com"), "https://www.B.com/");
        assertNull(result.error);
        assertEquals(List.of("a.com", "b.com"), result.sites);
    }

    @Test
    public void addingAnInvalidOrDuplicateSiteSaysWhyAndChangesNothing() {
        AllowedSites.Result invalid = AllowedSites.add(List.of("a.com"), "nope nope");
        assertEquals(AllowedSites.Problem.INVALID, invalid.error);
        assertEquals(List.of("a.com"), invalid.sites);
        AllowedSites.Result duplicate = AllowedSites.add(List.of("a.com"), "www.a.com");
        assertEquals(AllowedSites.Problem.DUPLICATE, duplicate.error);
        assertEquals(List.of("a.com"), duplicate.sites);
    }

    @Test
    public void removingDropsOnlyThatSite() {
        assertEquals(List.of("a.com", "c.com"), AllowedSites.remove(List.of("a.com", "b.com", "c.com"), "b.com"));
    }

    @Test
    public void siteDataClearingNeverTouchesHistoryPasswordsOrFavorites() {
        assertEquals(List.of("site_data", "cache"), SiteDataClearer.KINDS);
    }
}
