// Copyright 2026 Bananify Creative. MIT; see LICENSE.
#ifndef BLANC_PRIVATE_PRIVATE_TABS_H_
#define BLANC_PRIVATE_PRIVATE_TABS_H_

#include "blanc/common/island_mode.h"
#include "chrome/browser/profiles/profile.h"
#include "content/public/browser/browser_context.h"
#include "content/public/browser/web_contents.h"

namespace blanc::private_tabs {

// Shipping Blanc's in-window private tabs (owner decision D1, 2026-10-31): a
// private tab is web contents in its window profile's primary off-the-record
// profile, Chromium's incognito profile (owner, 2026-11-02), living in an
// ordinary window beside regular tabs. All private tabs share that one
// in-memory session until Blanc quits, as shipping's private-browsing session
// does. Chromium's navigation and recording code asks the window's profile;
// these answer for the tab instead. Header-only, so upstream patches can ask.

// Whether |profile| is |window_profile|'s private-tab profile.
inline bool IsPrivateProfileOf(Profile* profile, Profile* window_profile) {
  return IslandMode() && profile && window_profile && !window_profile->IsOffTheRecord() &&
      profile->IsOffTheRecord() && profile->IsPrimaryOTRProfile() &&
      profile->GetOriginalProfile() == window_profile;
}

// Whether |contents| is a private tab: off the record, whatever its window.
// Such a tab is never recorded (history, session restore, Recently closed,
// sync), as shipping's private tabs are not.
inline bool IsPrivateTab(content::WebContents* contents) {
  return IslandMode() && contents && contents->GetBrowserContext() &&
      contents->GetBrowserContext()->IsOffTheRecord();
}

// The profile a navigation in a window of |window_profile| belongs to:
// |window_profile|, unless it was asked for privately (a private tab's own
// profile requested, or an off-the-record disposition) or comes from a
// private tab, whose links and children stay private.
inline Profile* NavigationProfile(Profile* window_profile, Profile* requested,
                                  Profile* source, bool off_the_record) {
  if (!IslandMode() || !window_profile || window_profile->IsOffTheRecord()) return window_profile;
  if (IsPrivateProfileOf(requested, window_profile) || IsPrivateProfileOf(source, window_profile))
    return window_profile->GetPrimaryOTRProfile(/*create_if_needed=*/true);
  if (off_the_record) return window_profile->GetPrimaryOTRProfile(/*create_if_needed=*/true);
  return window_profile;
}

// The profile new tab contents are created in for a navigation in a window
// of |window_profile| that belongs to |navigation_profile|.
inline Profile* ContentsProfile(Profile* window_profile, Profile* navigation_profile) {
  return IsPrivateProfileOf(navigation_profile, window_profile) ? navigation_profile : window_profile;
}

}  // namespace blanc::private_tabs

#endif  // BLANC_PRIVATE_PRIVATE_TABS_H_
