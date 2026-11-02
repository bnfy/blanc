# Disable Chromium OS-wide search launcher

Owner screenshot identifies `IDS_LOOMNIBOX_FRE_TITLE`: “Search with Chromium from anywhere.” Fork preparation now makes `IsOmniboxEverywhereEligible` and controller `IsEnabled` return false. The first suppresses profile eligibility/onboarding/settings entry points; the second prevents invocation, hotkey registration and persisted target loading even with saved opt-in or feature experiments. Ordinary Island search and website search are not edited.

Source inspection confirms `OnInvoke` exits when disabled and `UpdateHotkeyRegistration` unregisters accelerators and registers only when enabled. Preparation remains anchor-checked and idempotent. Syntax and scoped ESLint pass. Initial unreachable-code compile failure retained; corrected incremental build succeeds in 33.91 seconds, seven steps. No cache clean, GN/toolchain change, latency measurement or Electron build.

No running instance was restarted; no profile preferences were changed. Runtime absence of the launcher on the next launch and physical shortcut behavior are not yet verified. Existing running apps retain their loaded code until restart. Permanent tabs and the independent Google baseline were untouched.
