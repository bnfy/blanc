# Island extension removal — October 20, 2026

Installed Island rows now open Chromium's native extension context menu on right-click or keyboard ContextMenu/Shift+F10. The menu says **Remove from Blanc**, including its native accessibility name. Chromium retains ownership of uninstall confirmation and policy. Current active tab and transient user activation are validated before opening the menu; Store results do not receive this command. Unavailable popup actions remain selectable for management, while their ordinary activation is refused.

Native verification used a disposable profile and an APFS-cloned app with a distinct bundle identifier solely to disambiguate UI automation from the retained preview. The executable/framework are the normal incremental build; only the clone's Info.plist bundle ID differs. No user extension or retained preview was changed.

- Right-click authored unpacked fixture opens native menu and removal succeeds.
- Official Store Extensity 1.14.0 installation shows management permission and disabled-then-enabled Add extension safety delay; installation succeeds.
- Final branded build: right-click Extensity shows Remove from Blanc; native confirmation names Extensity and exposes Cancel, Remove, and unchecked Report abuse.
- Explicit Cancel preserves Extensity in Island; reopening and explicitly confirming Remove removes it, leaving the unrelated authored fixture intact.
- Eight focused tests pass, including unavailable-action management and installed-only keyboard context routing; scoped lint passes.
- Incremental builds: 38.02 seconds initial integration; branding attempt fails on incorrect generated header include (retained log); corrected branded_strings.h repair succeeds in 45.91 seconds. Final guard schedules zero actions. No upstream hooks changed; prior measured footprint remains 50 files/118 hunks within 50/120.

Initial automation clicked the section heading, producing the page menu; corrected row coordinates exercised the real handler. Early Return presses advanced through asynchronous confirmation without capturing its intermediate state; final explicit Cancel/Remove observations above supersede those incomplete attempts. An intermediate AX capture raised the underlying page and dismissed the transient dialog; no explicit cancellation claim is based on that attempt. An initial restart query preceded CDP availability and was retried after startup.

Not claimed: managed-policy fixture enforcement, private-profile removal, disabled-extension listing (as distinct from unavailable action), other locales, Windows/Linux native interaction or broad keyboard acceptance. Native policy is delegated, not independently reimplemented. The branding override is scoped to the exact uninstall string in the prototype process. No install/restart/upgrade gate is newly closed. Latency remains deferred; Electron diagnostic build remains unapproved.
