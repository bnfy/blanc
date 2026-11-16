// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#ifndef BLANC_BROWSER_UI_BROWSER_API_SEARCH_DEFAULT_H_
#define BLANC_BROWSER_UI_BROWSER_API_SEARCH_DEFAULT_H_

class Profile;

namespace blanc::browser_api {

// DuckDuckGo is Blanc's default engine (S1.1). Applies only while the profile
// is still on Chromium's fallback engine, so any choice the user, a policy or
// an extension made is kept.
void EnsureBlancDefaultSearch(Profile* profile);

}  // namespace blanc::browser_api

#endif  // BLANC_BROWSER_UI_BROWSER_API_SEARCH_DEFAULT_H_
