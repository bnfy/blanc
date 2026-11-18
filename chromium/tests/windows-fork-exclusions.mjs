// Explicit platform/construction exclusions for the Windows build, each
// approved like the Mac's (macos-fork-exclusions.mjs). Never use this for
// missing features: a case Windows can't pass yet stays a recorded failure.
// W2 Task B1 (owner-approved plan, 2026-11-18): the owner's product
// decisions, which hold on every platform, with the Mac's reasons, and the
// one Linux-only case.
export const windowsForkExclusions = Object.freeze({
  "spec/acceptance/glance.feature:187:plain": "Owner decision 2026-11-02: no 1Password SDK/fill capsule; use the Web Store extension.",
  "spec/acceptance/glance.feature:197:plain": "Owner decision 2026-11-02: no 1Password SDK/fill capsule; use the Web Store extension.",
  "spec/acceptance/platform-services.feature:50:plain": "Owner decision 2026-11-02: no 1Password SDK/fill capsule; use the Web Store extension.",
  "spec/acceptance/platform-services.feature:64:plain": "Owner decision 2026-11-02: no 1Password SDK/fill capsule; use the Web Store extension.",
  "spec/acceptance/platform-services.feature:76:plain": "Owner decision 2026-11-02: no 1Password SDK/fill capsule; use the Web Store extension.",
  "spec/acceptance/platform-services.feature:88:plain": "Owner decision 2026-11-02: no 1Password SDK/fill capsule; use the Web Store extension.",
  "spec/acceptance/platform-services.feature:98:plain": "Owner decision 2026-11-02: no 1Password SDK/fill capsule; use the Web Store extension.",
  "spec/acceptance/platform-services.feature:105:plain": "Owner decision 2026-11-02: no 1Password SDK/fill capsule; use the Web Store extension.",
  "spec/acceptance/platform-services.feature:112:plain": "Owner decision 2026-11-02: no 1Password SDK/fill capsule; use the Web Store extension.",
  "spec/acceptance/reader-mode.feature:7:plain": "Owner decision 2026-11-02: native Chromium Reading Mode replaces the shipping reader sandbox and appearance.",
  "spec/acceptance/reader-mode.feature:13:plain": "Owner decision 2026-11-02: native Chromium Reading Mode replaces the shipping reader sandbox and appearance.",
  "spec/acceptance/reader-mode.feature:20:plain": "Owner decision 2026-11-02: native Chromium Reading Mode replaces the shipping reader sandbox and appearance.",
  "spec/acceptance/settings-and-theming.feature:49:plain": "Owner decision 2026-11-02: no built-in Dark Reader; use the Web Store extension.",
  "spec/acceptance/settings-and-theming.feature:57:plain": "Owner decision 2026-11-02: no built-in Dark Reader; use the Web Store extension.",
  "spec/acceptance/settings-and-theming.feature:65:plain": "Owner decision 2026-11-02: no built-in Dark Reader; use the Web Store extension.",
  "spec/acceptance/settings-and-theming.feature:74:plain": "Owner decision 2026-11-02: no built-in Dark Reader; use the Web Store extension.",
  "spec/acceptance/platform-services.feature:25:plain": "Owner decision 2026-11-17: the test build has no updater; the sparkle-N-to-N+1 release gate proves on every beta that Sparkle installs the next beta and refuses a wrong key or a tampered file.",
  "spec/acceptance/navigation-and-context-menu.feature:83:plain": "V12 explicitly uses Chromium validation; it accepts HTTP custom engine URLs, unlike this shipping-only HTTPS policy.",
  "spec/acceptance/local-profiles.feature:17:plain": "V18 approves Chromium profile management: its native deletion dialog has Cancel/Remove, not shipping typed-name confirmation or profile-name window titles.",
  "spec/acceptance/quiet-tabs.feature:28:example-45": "This outline row asserts Electron WebContents listener counts, which do not exist in Chromium; native protection rows remain applicable.",
  "spec/acceptance/private-tabs.feature:40:plain": "Owner decision 2026-11-18 (W2 plan, decision 2): passkeys on Windows are Chromium's own Windows Hello path; a private-window passkey is a question in the Windows hand check, not a simulated authenticator.",
  "spec/acceptance/arc-spaces-import.feature:53:plain": "Linux-only import (a chosen Arc file); not applicable on Windows, which reads Arc's own folder.",
  "spec/acceptance/island-and-commands.feature:320:plain": "Owner decision 2026-11-17 (W1): Windows' own caption buttons sit over the strip and the Island draws no window buttons on Windows, so there are no floating window controls to come and go with the pill (W2 C2).",
  "spec/acceptance/settings-and-theming.feature:12:plain": "Owner decision 2026-10-19: Windows has no app icon catalog (the taskbar icon changes only by rewriting the installer's shortcuts), so Settings shows no icon picker on Windows; excluded with the owner's approval, 2026-11-18 (W2 B4).",
  "spec/acceptance/supporter-and-session.feature:7:plain": "Owner decision 2026-10-19: Windows has no app icon catalog (the taskbar icon changes only by rewriting the installer's shortcuts), so Settings shows no icon picker on Windows; excluded with the owner's approval, 2026-11-18 (W2 B4).",
  "spec/acceptance/supporter-and-session.feature:12:plain": "Owner decision 2026-10-19: Windows has no app icon catalog (the taskbar icon changes only by rewriting the installer's shortcuts), so Settings shows no icon picker on Windows; excluded with the owner's approval, 2026-11-18 (W2 B4)."
});
