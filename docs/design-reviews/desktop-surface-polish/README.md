# Desktop surface polish: visual review

These captures compare the clean `origin/main` baseline at `0f8abb9b` with the polish branch. Both runs used the same isolated macOS test profile and viewport: a 640 × 480 browser window for the small captures (640 × 412 page content), and the normal desktop window for Favorites and Downloads. The screenshots use the light appearance and contain only app-owned UI.

| Surface | Before | After | Review point |
| --- | --- | --- | --- |
| Settings, small window | [Before](before/settings-small.png) | [After](after/settings-small.png) | Navigation remains one row; close and first controls stay visible. |
| Ledger, small window | [Before](before/start-ledger-small.png) | [After](after/start-ledger-small.png) | Moving-in checklist has a readable label. |
| Billboard, small window | [Before](before/start-billboard-small.png) | [After](after/start-billboard-small.png) | Compact checklist sits above the footer. |
| Shelf, small window | [Before](before/start-shelf-small.png) | [After](after/start-shelf-small.png) | Compact checklist stays visible without changing the layout. |
| Tally, small window | [Before](before/start-tally-small.png) | [After](after/start-tally-small.png) | Compact checklist uses the same control treatment. |
| Onboarding import step | [Before](before/onboarding-2-small.png) | [After](after/onboarding-2-small.png) | Back and Continue are reachable at minimum size. |
| Onboarding privacy step | [Before](before/onboarding-5-small.png) | [After](after/onboarding-5-small.png) | Choices and actions remain visible at minimum size. |
| Error page | [Before](before/error-small.png) | [After](after/error-small.png) | Long URL wraps; retry and safety actions have clear priority. |
| Empty Favorites | [Before](before/favorites.png) | [After](after/favorites.png) | Empty message uses the shared utility card treatment. |
| Empty Downloads | [Before](before/downloads.png) | [After](after/downloads.png) | Empty message and action hierarchy match Favorites. |
| Vertical tabs, small window | [Before](before/vertical-tabs-small.png) | [After](after/vertical-tabs-small.png) | Focus and new-tab label use the shared control language. |

The local audit also checked the four Start Page layouts and Settings in dark appearance at 640 × 480 and 150% Electron zoom, a private Start Page, and keyboard focus/selected state through onboarding. The full desktop acceptance suite exercises Glance, vertical tabs, capture, import, startup, and 1Password UI. Native menus and OS-owned dialogs keep platform styling.
