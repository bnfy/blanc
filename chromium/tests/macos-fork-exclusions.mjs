// Explicit platform/construction exclusions, approved in the replacement spec
// and STATUS.md Native-versus-port decisions. Never use this for missing features.
export const macosForkExclusions = Object.freeze({
  "spec/acceptance/local-profiles.feature:17:plain": "V18 approves Chromium profile management: its native deletion dialog has Cancel/Remove, not shipping typed-name confirmation or profile-name window titles.",
  "spec/acceptance/arc-spaces-import.feature:53:plain": "Windows/Linux-only UI or Linux import; not applicable on macOS.",
  "spec/acceptance/glance.feature:187:plain": "Owner decision 2026-11-02: no 1Password SDK/fill capsule; use the Web Store extension.",
  "spec/acceptance/glance.feature:197:plain": "Owner decision 2026-11-02: no 1Password SDK/fill capsule; use the Web Store extension.",
  "spec/acceptance/island-and-commands.feature:320:plain": "Windows/Linux-only UI or Linux import; not applicable on macOS.",
  "spec/acceptance/navigation-and-context-menu.feature:83:plain": "V12 explicitly uses Chromium validation; it accepts HTTP custom engine URLs, unlike this shipping-only HTTPS policy.",
  "spec/acceptance/platform-services.feature:50:plain": "Owner decision 2026-11-02: no 1Password SDK/fill capsule; use the Web Store extension.",
  "spec/acceptance/platform-services.feature:64:plain": "Owner decision 2026-11-02: no 1Password SDK/fill capsule; use the Web Store extension.",
  "spec/acceptance/platform-services.feature:76:plain": "Owner decision 2026-11-02: no 1Password SDK/fill capsule; use the Web Store extension.",
  "spec/acceptance/platform-services.feature:88:plain": "Owner decision 2026-11-02: no 1Password SDK/fill capsule; use the Web Store extension.",
  "spec/acceptance/platform-services.feature:98:plain": "Owner decision 2026-11-02: no 1Password SDK/fill capsule; use the Web Store extension.",
  "spec/acceptance/platform-services.feature:105:plain": "Owner decision 2026-11-02: no 1Password SDK/fill capsule; use the Web Store extension.",
  "spec/acceptance/platform-services.feature:112:plain": "Owner decision 2026-11-02: no 1Password SDK/fill capsule; use the Web Store extension.",
  "spec/acceptance/quiet-tabs.feature:28:example-45": "This outline row asserts Electron WebContents listener counts, which do not exist in Chromium; native protection rows remain applicable.",
  "spec/acceptance/reader-mode.feature:7:plain": "Owner decision 2026-11-02: native Chromium Reading Mode replaces the shipping reader sandbox and appearance.",
  "spec/acceptance/reader-mode.feature:13:plain": "Owner decision 2026-11-02: native Chromium Reading Mode replaces the shipping reader sandbox and appearance.",
  "spec/acceptance/reader-mode.feature:20:plain": "Owner decision 2026-11-02: native Chromium Reading Mode replaces the shipping reader sandbox and appearance.",
  "spec/acceptance/settings-and-theming.feature:49:plain": "Owner decision 2026-11-02: no built-in Dark Reader; use the Web Store extension.",
  "spec/acceptance/settings-and-theming.feature:57:plain": "Owner decision 2026-11-02: no built-in Dark Reader; use the Web Store extension.",
  "spec/acceptance/settings-and-theming.feature:65:plain": "Owner decision 2026-11-02: no built-in Dark Reader; use the Web Store extension.",
  "spec/acceptance/settings-and-theming.feature:74:plain": "Owner decision 2026-11-02: no built-in Dark Reader; use the Web Store extension.",
  "spec/acceptance/vertical-tabs.feature:239:plain": "Windows/Linux-only UI or Linux import; not applicable on macOS."
});
