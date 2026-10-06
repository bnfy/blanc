# Blanc compatibility evidence

This matrix records what was actually checked for public Blanc 1.21.0 (v1.21.0, `159f274de47ffb32412420ae241d6337a416d0da`). It is evidence, not a blanket compatibility promise. `partial` and `not-run` rows identify work still needed; `unsupported` is published plainly.

Generated from [manifest.json](manifest.json) on 2026-09-22. Run `npm run compatibility:check` to validate the schema and detect generated-file drift.

| Scenario | Category | Platform | Expected behavior | Result | Classification | Evidence note |
| --- | --- | --- | --- | --- | --- | --- |
| oauth-desktop-callback-macos | oauth-return | macOS/arm64 | A consented OAuth callback returns to the initiating tab without exposing the callback to another profile. | pass | supported | The exact release press gate includes the desktop OAuth suite; this row does not generalize to every identity provider. |
| external-app-return-macos | external-app-return | macOS/arm64 | After consent, an installed external application may receive its registered login callback. | pass | supported | The press gate exercised the external-link callback flow on macOS. |
| focused-auth-popup-cross-platform | focused-popup | macOS, Windows, Linux/arm64, x64 | A site-opened authentication popup remains focused and tied to its opener family. | not-run | supported | No release-tagged cross-platform focused-popup result has been recorded yet. |
| camera-permission-packaged | camera | macOS, Windows, Linux/arm64, x64 | A site can use a camera only after Blanc's explicit permission flow and applicable OS consent. | partial | supported | Packaged media-permission gates passed; hardware-specific end-to-end camera capture was not recorded on every platform. |
| microphone-permission-packaged | microphone | macOS, Windows, Linux/arm64, x64 | A site can use a microphone only after Blanc's explicit permission flow and applicable OS consent. | partial | supported | Packaged media-permission gates passed; hardware-specific audio capture was not recorded on every platform. |
| screen-share-picker-packaged | screen-sharing | macOS, Windows, Linux/arm64, x64 | A site receives only the screen or window the user chooses in Blanc's picker. | partial | supported | Release media gates cover picker wiring; a full hardware/display matrix remains to be run. |
| system-audio-share-packaged | system-audio-sharing | macOS, Windows, Linux/arm64, x64 | System audio is shared only when the selected source and operating system support it and the user requests it. | partial | supported | The packaged permission path is covered; device- and OS-specific audio output was not recorded for all platforms. |
| passkeys-packaging-macos | passkeys | macOS/arm64 | The signed app carries the profile and entitlement required for platform passkeys. | partial | supported | Packaging and signature evidence passed; this row does not claim a fresh live passkey ceremony on every relying party. |
| onepassword-fill-macos | onepassword | macOS/arm64 | A user-invoked fill can request a matching Login item from the installed 1Password app. | not-run | supported | No exact-v1.21 live installed-app result is recorded in the release incident. |
| widevine-protected-media | protected-media | macOS, Windows, Linux/arm64, x64 | Commercial DRM playback that requires a separately provisioned content-decryption module is not promised. | unsupported | unsupported-capability | Blanc does not publish Widevine support; this is not authorization to add DRM. |
| ordinary-html5-media | ordinary-media | macOS, Windows, Linux/arm64, x64 | Ordinary formats supported by the bundled Electron runtime play through Chromium media elements. | partial | supported | Native media smoke passed; representative public media sites still need release-tagged manual results. |
| pwa-installation | pwa | macOS, Windows, Linux/arm64, x64 | Installing a website as a standalone operating-system application is not provided. | unsupported | product-decision | Blanc is a browser shell without a PWA installation surface. |
| ordinary-download | downloads | macOS, Windows, Linux/arm64, x64 | A user-initiated download appears in Blanc Downloads and the selected file remains on disk. | not-run | supported | Implementation exists, but the v1.21 release record does not contain a dedicated cross-platform download result. |
| ordinary-file-upload | uploads | macOS, Windows, Linux/arm64, x64 | A file input opens the native picker and supplies only files chosen by the user. | not-run | supported | No exact-v1.21 cross-platform upload evidence has been recorded. |
| local-html-open | local-html | macOS, Windows, Linux/arm64, x64 | A user-selected local HTML document opens without granting arbitrary local-file access to websites. | partial | supported | Desktop and unit coverage passed in the press gate; packaged per-platform manual coverage remains incomplete. |
| default-browser-registration | default-browser | Windows, Linux/x64 | The packaged app can participate in the operating system's default-browser registration flow. | pass | supported | The exact release native jobs passed their browser-registration gates; user selection remains controlled by the operating system. |
| operating-system-web-links | os-links | macOS/arm64 | An operating-system web link handed to Blanc opens in a managed tab. | pass | supported | The press gate exercised external-link activation on macOS. |
| representative-productivity-sites | productivity-site | macOS, Windows, Linux/arm64, x64 | Representative productivity sites complete their core signed-in workflows. | not-run | supported | Sites and accounts must be named in private test operations; public results will remain aggregate and browsing-content free. |
| representative-banking-sites | banking-site | macOS, Windows/arm64, x64 | Representative banking sign-in and account-navigation flows work without recording credentials or account content. | not-run | supported | No public aggregate result exists yet. |
| representative-commerce-sites | commerce-site | macOS, Windows, Linux/arm64, x64 | Representative storefront, cart, and checkout-entry flows work without publishing purchase details. | not-run | supported | No public aggregate result exists yet. |
| representative-developer-sites | developer-site | macOS, Windows, Linux/arm64, x64 | Representative developer documentation and authenticated tool workflows work. | not-run | supported | No public aggregate result exists yet. |
| representative-media-sites | media-site | macOS, Windows, Linux/arm64, x64 | Representative non-DRM media sites play ordinary audio and video. | not-run | supported | No public aggregate result exists yet; protected-media expectations are recorded separately. |

## Result meanings

- **pass:** the expected behavior has direct release-tagged evidence on the named platform.
- **partial:** some relevant behavior is evidenced, but the full scenario was not exercised.
- **unsupported:** Blanc does not provide the capability.
- **blocked:** the check could not complete for a recorded external or environmental reason.
- **not-run:** no current release-tagged result exists.

See [method.md](method.md) for the collection and publication rules.
