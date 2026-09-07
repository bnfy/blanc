# User guide evidence

Reviewed September 4, 2026 against public v1.15.0, commit
`d0c2304c7cef12a6fa0d66c559aebb1198a86434`. The paths below refer to that tag,
not an unreleased feature branch. This is documentation verification, not a
fresh desktop acceptance run or third-party certification.

| Guide section / claims | Release evidence | Qualification |
| --- | --- | --- |
| Installation artifacts, signed native releases, updates | `package.json`, `scripts/release.sh`, `src/main/updater.js`; dated `docs/release-incidents/2026-09-02-v1.15.0.md` | Choose the actual published OS/architecture artifact; development does not auto-update. |
| First-run preferences, default browser, welcome tour | `src/renderer/pages/onboarding.js`, `src/renderer/pages/settings.html`, `src/renderer/pages/settings.js` | User choices, not a claim of anonymous networking. |
| Navigation, tab switching, shortcuts and commands | `src/main/main.js`, `src/renderer/overlay.js`, `copy/slash-commands.json` | Cmd on macOS, Ctrl on Windows/Linux; reopening can reload. |
| Groups, pins, quiet tabs, workspaces | `src/main/main.js`, `src/main/tab-sleep.js`, `src/main/workspaces.js`, `src/renderer/pages/settings.html` | User-directed groups; only eligible tabs quiet; creating workspaces requires active Patron. |
| Favorites/import, history and downloads | `src/renderer/pages/`, `src/main/history.js`, `src/main/downloads.js` | Saved download files survive private browsing. |
| Private tabs, blocking and permissions | `src/main/tab-view.js`, `src/main/permissions.js`, `src/main/main.js`, `adblock/` | Private browsing is not network anonymity; bundled lists; explicit fallback when blocking fails. |
| Profiles and sync controls | `src/main/local-profiles.js`, `src/main/sync.js`, `src/main/sync-crypto.js`, `src/renderer/pages/settings.html` | Personal-only sync, device preferences excluded, passphrase cannot be recovered. |
| Start page and Mahjong | `src/renderer/pages/settings.html`, `src/renderer/pages/mahjong.js`, `src/renderer/pages/mahjong-state.js`; v1.15.0 release incident | Records are device-local. |
| Update menu, diagnostics, support | `src/main/main.js`, `src/renderer/pages/settings.html`, `SECURITY.md` | Review diagnostic files before sharing; private vulnerability reporting. |

All rows are verified with the qualifications shown. The guide covers common
use; it does not claim exhaustive documentation of every platform integration.
OpenSSF documentation criteria remain pending until this candidate is merged
and its coverage is assessed against the complete criterion.
