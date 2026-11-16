# Inline Chrome Web Store results — October 20, 2026

The Island picker now retrieves up to six public Store results alongside installed extensions. A 350 ms debounce and generation checks prevent old replies or closed-panel replies from replacing current results. Installed IDs are deduplicated from discovery results. Enter on a Store item opens its official listing; Enter on an installed item still invokes the native action popup.

## Native acceptance

- Searching Extensity in the Island returned four actual public results, with names and descriptions. `results.png` / `results.ax.txt` show them before installation.
- Enter opened the official Extensity listing (ID jjmflmamggggndanpgfnpelongoepncg).
- Native permission text requested management of apps, extensions and themes. The Add extension safety delay was observed; Cancel left Add to Chrome available. The second confirmation installed Extensity 1.14.0 successfully.
- Searching again showed Installed Extensity above three other Store results, without duplicating Extensity. `combined.png` / `combined.ax.txt` show the combined list.
- Enter on installed Extensity opened its real chrome-extension popup (`popup.ax.txt`).

Tests used a disposable profile and a copy of the freshly built app with a unique bundle ID, executable name and ad-hoc signature to disambiguate native UI automation from the retained preview. Production code and framework were unchanged in that copy. Initial automation bound to the retained preview despite a separate profile; only the Island command field was touched, with no navigation or installation there. Renaming the test executable resolved the binding. The test copy and disposable profiles were removed after testing. Retained preview process was not restarted; its existing native handler remains old until restart.

## Safety and scope

The native request uses a fixed HTTPS Store origin, encoded query, omitted credentials, rejected redirects, a six-second timeout and 2 MiB response cap. A conservative parser returns only text fields and validated 32-character extension IDs. No remote HTML, script or image is inserted into the privileged host. The renderer uses textContent and reconstructs listing URLs from validated IDs. No private Store RPC or account cookies are used.

The current public English server-rendered markup is a compatibility dependency. Missing/unrecognized results and request errors retain an explicit full-Store-search fallback, not a claim that the Store has no matches. Results are capped and may differ from signed-in/personalized results. Other locales, accessibility beyond the observed native keyboard path, service throttling, authenticated sign-in, update/restart persistence and broad responsive coverage were not qualified here.

Five focused tests pass (stale replies, close invalidation, invalid IDs, request failure, short queries), plus scoped lint. One guarded incremental build succeeded in 37.04s / six steps; final guard reports zero actions. Changes are in Blanc-owned files only: prior measured upstream footprint remains 49 files / 117 hunks within 49 / 120. No latency testing or Electron diagnostic build. Existing Task 0/F12 gates remain open.
