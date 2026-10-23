# Blanc Chromium Preview: tester guide

Prepared October 23, 2026 for the L12 readiness review. **Not a public release announcement or a download authorization.** Use these instructions only with an artifact explicitly approved in the [release decision](preview-release-decision-20261023.md). No artifact is approved there yet.

## What this preview covers

The approved scope is an opt-in preview for Apple Silicon Macs running macOS 27; acceptance was performed on macOS 27.2. The binary's older deployment minimum is not a promise of support for older macOS versions. Intel Macs, Windows and Linux are outside this preview.

Blanc Chromium Preview is separate from shipping Blanc. It uses a separate app, helper identities, profile and keychain namespace. It does not automatically migrate your existing browser data or update shipping Blanc. Keep shipping Blanc installed for regular use and recovery.

The tested feature set includes browsing, Island/rail controls, regular and private windows, Find, downloads, basic media playback, favorites/history, start-page layouts, Web Store themes with readability overlays, Spaces, two-pane Split View, Recently Closed, and the native extension manager. Bitwarden installation, permission Cancel/retry, persistence and popup focus have bounded acceptance evidence. That is not a compatibility guarantee for every extension or vendor account. Native bookmark-file import and local password storage were tested with synthetic data; production browser-profile and account migration were not.

The preview does not promise full Electron parity, account/cloud sync, vendor native-messaging integrations, full floating Glance parity, whole-split dragging between windows, three/four-pane splits, DRM compatibility, arbitrary power-loss durability or a performance advantage. Latency testing remains deferred. A real Google-served extension version upgrade remains a launch requirement; fresh installation does not satisfy it.

## Install and first launch

1. Read the [current status and withdrawal notice](https://github.com/bnfy/blanc/pull/1028). Download only an exact version that the owner has approved for distribution. Draft validation artifacts are not public releases.
2. Check the download's SHA-256 against the authenticated checksum manifest supplied with that release. The operator also verifies the manifest, inventory and provenance using the repository's pinned signing identity. Do not rely on a filename alone.
3. Extract the ZIP and place **Blanc Chromium Preview.app** in Applications without replacing **Blanc Browser.app**. Do not rename it to the shipping app's name or launch its internal executable directly.
4. Open the preview normally in Finder. A normal macOS Open confirmation is expected for a downloaded app. If macOS rejects its signature or cannot verify it, stop and report the message. Do not disable Gatekeeper, remove quarantine or use a security override.
5. Leave the fresh preview profile separate. Do not copy shipping Blanc, Chrome or the isolated Google-upgrade fixture into it. Do not supply a custom profile path for ordinary use.
6. Confirm **Version & security** on the Start Page identifies the approved Chromium version and source revision. Check two ordinary tabs, change a non-sensitive start-page preference, quit with Cmd+Q and reopen. If tabs fail to restore, stop using the candidate and report it before adding important data.

To exercise extension permissions, read the actual requested permissions. Cancel must leave the extension uninstalled; an approved retry should install it. Opening an extension popup should move keyboard focus into it. No vault sign-in is required merely to check installation and focus.

## Updates and rollback

Updates are manual; shipping Blanc's updater does not update this preview. Check the status notice before updating because the packaged notice is an offline snapshot, not a continuing security guarantee.

Quit the preview before backing up its own profile at `~/Library/Application Support/Blanc Chromium Preview`. Keep that closed backup together with its exact signed archive. Then verify the approved replacement and replace only the preview app. Reopen and check tabs, selection, settings and installed extensions.

For rollback, retain the newer profile separately. Use the older signed app with its matching closed pre-update profile backup, or start with a fresh preview profile. Do not open an upgraded profile with an older binary. See the [tested maintenance and rollback procedure](preview-manual-maintenance-policy.md).

## Remove or retreat

Quit **Blanc Chromium Preview**, remove only its app, and continue using shipping Blanc. Removing the app preserves the preview profile and its preview-specific keychain entry. It must not remove shipping Blanc, its profile, its updater or its keychain material.

Preview data deletion is a separate deliberate action, not part of an app update or routine uninstall. Keep a closed backup before deleting preview data. The preview keychain service is **Blanc Chromium Preview Safe Storage**, account **Blanc Chromium Preview**; removing it can make existing encrypted preview data unreadable. Do not delete generic Chromium or shipping Blanc keychain entries. There is no claim that removing the app securely erases OS caches, backups or diagnostic records.

If a version is marked withdrawn, quit it and use shipping Blanc. Preserve the preview data for recovery. Manual-only previews cannot be remotely disabled.

## Feedback and privacy

For a non-sensitive reproducible bug, use the [Blanc issue tracker](https://github.com/bnfy/blanc/issues/new). For a security concern or a report containing private information, use [support@blanc.day](mailto:support@blanc.day?subject=Blanc%20Chromium%20Preview). Email delivery and response time have not been tested by this readiness check.

Include the version/source shown in **Version & security**, macOS version, Apple Silicon model, the action you took, expected/actual behavior, and whether a restart was involved. Prefer synthetic pages and test data. Describe an extension by name/version only when relevant.

Inspect and redact anything you attach. Screenshots, URLs, crash reports and console logs can expose page titles, browsing activity, account names, paths, tokens or private-window content. Never send passwords, vault contents, session cookies, signing keys, a complete browser profile or an unreviewed diagnostic archive. Reporting is voluntary and user-initiated; this guide adds no background upload. It does not claim that websites, extensions or macOS send no network traffic or diagnostics.

Anthony Loria is the sole maintenance and withdrawal owner. Distribution must be suspended when he is unavailable to review security updates. No backup maintainer or guaranteed repair deadline is implied.
