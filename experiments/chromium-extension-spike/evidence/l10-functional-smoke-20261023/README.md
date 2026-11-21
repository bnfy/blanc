# L10 signed-candidate functional smoke — October 23, 2026

**L10 is accepted for the bounded preview scope on this exact signed candidate.** The core suite passes 17 checkpoints, the six theme phases pass, and native extension, HTML-import and local password-save/persistence checks pass. A separate accessibility defect discovered in the theme manager is recorded below; **L5 stays open and public release is not approved**.

Candidate source `09985c160803f3432f0d2b40a21caa13e249e53c`, Chromium `157.0.8103.15`, signed archive SHA-256 `4c86c89e7ec81791ef8bedf525187b302c313f913a5e5b07a26d4d2a45b9ef00`, Apple accepted `1818186c-4b95-4571-b822-397bf8705161`. Tests ran on Apple Silicon/macOS27.2. All 17 executable hashes and three selected asset hashes match before/after, the archive digest is unchanged and strict deep codesign passes. No build, signing or app modification was needed.

## Finite scope and results

| L10 surface | Current-candidate evidence |
| --- | --- |
| Navigation, Back/Forward, reload, tab identity | `core/report.json`: real loopback HTTP pages and native navigation controls preserve the target tab; rendered title verified. |
| Find and zoom | Native Find reports two real text matches; zoom changes devicePixelRatio and resets exactly. |
| Downloads and basic media | Native download writes the exact fixture bytes; real WAV decode/playback advances currentTime without media error. No DRM/video/platform breadth claim. |
| Favorites/history and Start Page settings | Native bookmark/history lists contain visits; Shelf/color/dark preferences, selected tab and records survive clean restart. |
| Island/rail | Rail mode persists native setting and full-height presentation; returns to Island. Initial wrong-URL assertion is retained separately. |
| Windows, private, Spaces, Split, Recently Closed | The same unchanged candidate's [accepted L6 suite](../l6-signed-acceptance-20261023/README.md) supplies current 49-check coverage; not rerun as a second stress matrix. |
| Official Store theme | Cherry Blossom Tree HD Wallpapers Theme, `lelfanicbadaahlibeimcpfpedfjccnk`, installed from the live official Store with native Add to Blanc. Its 1920×1080 wallpaper decodes, installed-theme row appears, Theme choice is exposed, and gradient readability layers remain. Native Undo resets the theme. Reinstall plus Spotlight/wash55 persist after restart. Native removal Cancel preserves it; confirmed Remove resets it and stays removed after another restart. Six phase JSON records assert these states. |
| Store extension/permissions/popup | Bitwarden `nngceckbapebfimnlniiiahkandclblb` installed in a separate disposable L10 profile, never the Google-upgrade baseline. Native permission dialog initially disables Add, Cancel leaves it absent, and a later accepted installation succeeds. Native developerPrivate reports `2026.10.0 / ENABLED / FROM_STORE`. Island activation opens its focused native popup before/after restart. Optional default-password-manager prompt was skipped; no account signed in. Native confirmed removal and final restart leave it absent. |
| Native import explicitly exposed by Settings | Imported only the generated `bookmarks.html` through **Bookmarks HTML File**. Did not use the initially offered Safari importer or any existing browser profile. Native bookmark list and final restart retain the synthetic record. Full profile/account migration remains excluded. |
| Native password manager | Loopback-only generated form, synthetic username and nonfunctional test password. Native Save password prompt was accepted; fields autofill on revisit and after clean restart. No real credential/account, vendor vault login, cloud sync or external host is tested. Profile removed afterward. |
| Sync and custom integrations | Native Settings reports `signinAllowed=false` and `signinAvailable=false`. Blanc's unsupported settings/import commands reject, settings footer is hidden and remote tabs are empty; packaged slash commands are filtered. The tested Bitwarden install has no optional nativeMessaging grant and exposes no connectNative API. Vendor-native integration and account/profile migration remain excluded—not advertised as generally working or globally policy-blocked for arbitrary future extensions. |

## Separate L5 finding

The installed-theme manager nests Apply/Remove buttons inside a list-box option. Both are present in the DOM and removal functions, but macOS AX exposes only the option's text, not the buttons. `native-observations.md` records the actual tree and native dialog actions. This needs an accessible grouping/focus repair and signed requalification before L5 can close. Functional L10 acceptance does not waive accessibility or claim a new VoiceOver pass.

## Evidence quality and limitations

The initial core fixture assumed rail mode loads a URL containing “vertical”; the product actually changes the shared document layout. That assertion failed after 12 earlier checks and is retained as `core/first-*`. The corrected fresh-profile run verifies the native mode, CSS height and persisted setting; all 17 pass. No production repair or build was made. Native UI observations are transcribed from this run's CUA accessibility results; JSON assertions record browser state. There is no full extension-catalog, login/fill-provider, native-host, DRM or arbitrary-platform compatibility claim.

The product excludes unsupported custom import/sync/native-app workflows, while this smoke additionally qualifies the native HTML bookmark importer and local password store exposed by Chromium. The separate real Google-served extension-upgrade gate stays open; a fresh install and unchanged-version restart do not pass L4. Exact-head CI, clean-machine distribution/provenance, physical input/accessibility and final release approval stay separate.

Four owned profile/download directories were removed after clean browser exit; the owned loopback server was stopped. No permanent profile, shipping app or Google baseline was copied, restarted or changed. Raw logs are retained as byte-preserving gzip. No profile database or credential store is published. Latency and the Electron diagnostic build remain pending.

**Readiness: 7/12 gates (58.3%), delta +1 L10.** Next actionable work is the known L5 theme-action accessibility defect, followed by the bounded owner input session. L4/L8/L11/L12 remain open.
