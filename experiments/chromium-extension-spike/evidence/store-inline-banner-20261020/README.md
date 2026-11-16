# Inline Store promotion — October 20, 2026

The top-level exact Chrome Web Store origin now suppresses the English inline Chrome-install promotion. It matches the exact accessible button label and entire banner text, and hides the smallest ancestor only if that button is its sole interactive descendant. Containers with additional installation, search, sign-in, iframe or dialog controls are refused. The existing separately validated popover rule remains unchanged. Other languages and future markup variants are not covered; this is intentionally fail-visible.

Seven focused tests and scoped ESLint pass. One guarded incremental build succeeds: Siso 35.55 seconds, six steps. The final guard schedules zero actions. Only the Blanc-owned promotion script/generated header change; prior upstream footprint49/117 remains unchanged, not re-enumerated. No GN/toolchain/cache changes.

Native computer-use acceptance on the rebuilt app, fresh disposable profile:
- Extensions picker: type Extensity, Return opens actual Store search results.
- Official Extensity listing opens with banner absent, search/Sign in/Add to Chrome present. Screenshot records the cleaned listing after successful installation.
- Add to Chrome opens Add "Extensity"? with Manage your apps, extensions, and themes. Cancel leaves Add to Chrome available.
- Reopen shows Add extension disabled initially; becomes enabled after safety delay. Accept yields Extensity has been added to Chromium and Remove from Chrome.
- Native removal confirmation and Remove succeed; listing returns to Add to Chrome and states Extensity has been removed from Chrome. Banner remains absent.

Raw AX observations (some diffs), before markup, screenshot, focused-test and build logs retained with hashes. One stale accessibility index after saving a full tree opened File menu; dismissed without action and reselected correct result. Not a product failure, not omitted. Search used actual UI, not injected clicks. No authentication, restart persistence, upgrades, other locales, or broad native-input qualification claimed. Test extension removed and disposable browser quit; test profile deleted. Existing user tabs and 156 untouched. Latency deferred; Electron diagnostic build unapproved/unstarted.
