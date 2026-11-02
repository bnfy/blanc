# Review follow-up: shared drag geometry and upgrade wait

October 17, 2026. Installed Electron Blanc reports **1.36.0** in Info.plist. It was launched with a newly created disposable `--user-data-dir=/private/tmp/blanc-task0/electron-check` and CDP 9226; no normal Electron or Chromium profile was copied or controlled.

## The drag bug is shared with Electron

After creating two fixture tabs and opening the real Island with native Cmd-L, the installed overlay reported the empty pinned section at `top=bottom=65` and first loose row at `top=65`. Its actual shipping resolver returned `null` for the last loose tab at `y=69`. The shipping resolver's function source exactly matches this branch's original `src/renderer/tab-drag.js`. This is not geometry introduced by prototype CSS. [Measured model](electron-drag-geometry.json).

The coincident-slot correction now lives in `src/renderer/tab-drag.js`; the prototype transform/import and its private test file are removed. Three shared regression cases cover the empty pinned gap, coincident bucket boundaries and continued cross-boundary refusal, and the empty loose edge. Before the fix two new assertions failed (39/41); afterward the entire drag suite plus build-guard suite passed **51/51**. The obsolete transform-anchor test is no longer needed.

The corrected resolver was evaluated in the isolated installed Electron renderer against the measured model and returns the first loose tab as `beforeId`. This checks real Electron geometry with the corrected function; it is not a packaged release or a fresh native Electron drag test. [Result and original resolver](electron-drag-fix.json). The shared source is byte-identical to the already natively tested prototype asset ([hash](asset-equivalence.json)), so the 157 native drag/group results remain applicable. Assets-only preparation succeeded; no native rebuild. The installed app was not modified. The isolated Electron process was quit and its disposable profile deleted.

## Google-endpoint upgrade remains open

The saved October 16 profile `/private/tmp/blanc-chromium-profile-update-20261016` no longer exists. Scoped checks of temporary profiles found the retained Task 0 profile, not an older six-extension test profile. No permanent profile was copied. Consequently, **156→157 profile-forward migration is not tested** by this follow-up.

The six recorded October 16 versions were queried against Google's update service for Chromium 157.0.8103.6. All requests returned **HTTP 200, `status=noupdate`**: 1Password 8.12.41.1, Tampermonkey 5.5.1, React Developer Tools 8.0.0, Grammarly 14.1338.0, MetaMask 13.52.0, Bitwarden 2026.10.0. [Responses](google-six-versions.json), raw XML and the probe script are saved here. This proves successful service requests and no eligible upgrade offered to those requests at that time; it does not establish a completed upgrade, universal Store rollout state, or the contents of a missing profile. The previous native updater callback alone was not network evidence.

Following the owner's bounded-wait direction, the existing monitor now checks daily at noon local time **through November 3, 2026 inclusive**. It stays quiet without a meaningful change. Only a real upgrade, enabled state, restart and popup verification can close the remaining gate; a required unlock or missing profile pauses for owner action. At the bound it reports the still-open gate and pauses. Self-hosted mechanism-only evidence cannot silently replace the Google-endpoint requirement and requires a separate owner decision. Third-party CRX mirrors are excluded.

The retained 157 profile contains normally installed Bitwarden 2026.10.0. Other version advances are fixture opportunities, not automatically upgrade passes. The 156 build/profile remain untouched, Task 0 remains in progress, and baseline promotion remains conditional on acceptance.
