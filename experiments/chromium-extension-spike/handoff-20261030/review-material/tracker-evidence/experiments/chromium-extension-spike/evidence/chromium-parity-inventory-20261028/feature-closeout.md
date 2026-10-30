# User-facing parity closeout

Reference: shipping v1.44.1, source3b0c000b569ee33a1548dd1b9a60817fae9288a6. Preview gate acceptance is not feature parity. No feature below is complete solely because its bridge fixture passes.

| Feature | Current evidence | Missing before parity acceptance |
| --- | --- | --- |
| Shield | Native health, attributed counts and shared shipping count model have affected regular/private evidence; site switch, live filtering transitions, persistence and compact anchored card verified in development | Complete count lifecycle scope, broader site/global lifecycle coverage, provider settings, and full keyboard/focus/visual acceptance |
| Blanc Blocker | Native network/cosmetic/scriptlet/procedural implementation; production assets restored to dev launcher | Complete shipping control surface and settings persistence |
| uBO | Offline research admission, readiness and delivery mechanisms retained | Reviewed production lifecycle, bundled provider configuration, settings and popup integration; do not simply enable research flags |
| Split View | Existing native input/card layout; selection, reset, resize coordinates and geometry event tests | Shipping renderer activation, multi-pane/layout behavior, complete visual/input verification |
| Glance | Temporary pair and validated keep-as-split conversion | Shipping floating-card geometry, resize/move/reset and visible controls |
| Remote tabs / send | Host returns empty remote list; new renderer APIs inventoried | Actual native data/actions and full signed-in/out behavior |
| Workspaces | Host list is placeholder | Actual data, selection and persistence |
| Search suggestions | Host returns empty list | Shipping provider behavior and privacy settings |
| Island / Settings | Old1.38 renderer active;1.44.1 assets staged | Audit every suppressed control and placeholder; activate complete compatible assets and verify actual dev UI |

For each feature: compare exact shipping contract; trace backend, snapshot, API, DOM/CSS and input; implement all required paths; verify real content and visible controls with production configuration; inspect current development build; record remaining differences explicitly. A hidden attribute alone is not visibility proof. Zero synthetic counts, inert switches or success stubs may be accepted as full parity. Tests without production assets do not establish production page behavior.

## Start Page pins — incremental progress

Chromium 158 now has an isolated-tested regular Island pin menu, including refusal while a main-frame navigation is pending, and local favicon lookup with primary-incognito isolation. Evidence: `../tab-start-pin-20261028/` and `../pin-favicon-20261028/`. The overlapping lookup test is not deterministic callback-order proof. The running development app is an older generation; this code is not yet activated. Shipping hostname fallback, Favorite priority/order and entry point, Sync, localization, full renderer/onboarding integration, keyboard/VoiceOver, visual acceptance and other desktop platforms remain open. Settings alone may visually follow Chrome/Brave conventions, while retaining shipping functionality, privacy and accessibility.

## Native adaptation decisions in progress

Owner requires considering Chromium-native components before choosing custom reimplementation. `../../favorites/README.md` compares native bookmark manager capabilities and shipping Favorites sheet: native import/edit/undo are useful, but folder deletion differs from Blanc's non-destructive Remove folder and Start Page pin controls are absent. The draft native Favorites bridge and shipping assets remain unregistered and incomplete. `../native-autocomplete-classifier-20261028/README.md` records a native classifier passing 4,500 shipping-derived vectors and invalid UTF-8; stock Chromium omnibox transport has privacy differences, so the classifier and transport remain unwired. Search suggestions are not implemented.

Start Page favicon host fallback passed targeted regular/private and history-clear checks, with bounded-history differences documented in `../pin-favicon-20261028/`. Private tab pin menu and injected translation checks passed in `../tab-start-pin-20261028/`. Full visual, accessibility, language, Sync and multi-platform acceptance remain open.
