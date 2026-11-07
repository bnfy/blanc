# Default page zoom (F62)

Status: approved by the owner on November 6, 2026, with the saved-sites list in, ⌘0 back to the default, and no percent readout in this work. Issue: bnfy/blanc#1392 (replaces #1390).

## Why

A person who reads most sites at 75% has to press ⌘− on every site. Chrome has a Default page zoom setting; Blanc doesn't, and #1392 names it as the item that matters most.

## What the person gets

- **Settings → General → Appearance → Default page zoom**: 50, 67, 75, 80, 90, 100, 110, 125, 150, 175 or 200%. The default is 100%, so nothing changes for anyone who doesn't touch it.
- Changing it applies at once to every open tab showing a web page with no saved zoom of its own, in every window. No reload, no relaunch.
- ⌘+ and ⌘− on a site save that site's zoom. Other tabs on the site follow at once, and the zoom survives a relaunch, as it does today.
- ⌘0 forgets the site's saved zoom and returns it to Default page zoom, as Chrome does. The menu item keeps its name, Actual Size, which is also Chrome's name for it.
- A site can stay at 100% under a 75% default: from 75%, ⌘+ three times is 100% (80, 90, 100). That is saved like any other zoom. Nothing on screen shows the percent as you press; the saved-sites list shows it afterward.
- ⌘+ and ⌘− move through Chrome's steps: 25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500%. This is a visible change. Today's steps (100, 110, 120, 131…) can't land on 100% from 75%, so they have to go. A saved level between steps moves to the next step in the pressed direction.

## What was measured

On Electron 44.9.3, in throwaway scripts and in a dev Blanc on a scratch profile (November 6, 2026).

| Finding | Consequence |
|---|---|
| Zoom is already per host, not per tab as #1392 says: a new tab on the host follows, other hosts don't. True in Personal and named profiles, which are separate from each other. Private tabs start at 100%. | Keep that behavior. |
| Personal and named profiles persist zoom in Chromium's `Preferences` file. Personal's copy was written only at quit, and one run that had a second profile window open lost it. | A Blanc store is also more reliable. |
| `webPreferences.zoomFactor` writes **every visited host** into `Preferences`, and clearing history doesn't remove it. | Rejected: a new on-disk list of visited sites. |
| That preference can't be changed on a live view, and `window.open` children don't get it. | Rejected: the setting couldn't reach open tabs. |
| `setZoomLevel(0)` deletes the host's entry, so 100% can't be saved under a non-100% default. | Chromium's map can't hold this feature's data. |
| `setZoomMode('isolated')` keeps zoom on the one `WebContents`, holds across navigation and hosts, writes nothing to `Preferences`, and ignores existing host entries. | This is the mechanism. |
| Setting the level before a view's first navigation does nothing. Setting it in `did-navigate` reached the first script of a 200 KB page; on a tiny page it landed just after load. | Apply at commit. A rare brief flash at the wrong size is accepted; Electron's own `zoomFactor` applies at the same moment. |
| Chromium's PDF viewer switches the tab to `manual` mode. From `default` Electron switches back on the next navigation; from `isolated` the tab **stays** `manual`, and zoom stops working. | Restore `isolated` at every commit. |

## Design

**One new pure module, `src/main/page-zoom.js`** (no `require('electron')`): the step ladder, percent and level conversion, which URLs have a site key, and the decision of what level a URL should have.

**Site store.** `site-zoom.json`, a `JsonStore` with `scope: 'profile'`, holding `{ version, sites: { host: percent }, migrated }`. It is local: never synced, never in telemetry or diagnostics. It stays when history is cleared, as remembered permissions do, because a person chose it; the saved-sites list is how to remove it.

**Default.** `pageZoom` in `settings.json`, device-level like the other presentation settings, never in `SYNCED_KEYS`. Saved as a percent; anything off the list reads as 100.

**Tabs.** `wireTabView` sets `isolated` on every tab view, so new tabs, Quiet Tabs rebuilds, reopened tabs and adopted `window.open` children all take the same path. On main-frame `did-navigate` the tab restores `isolated` if needed and applies the level from: private memory, then the site store, then the default. `did-navigate-in-page` does nothing, because the host can't change.

**Commands.** `zoomActiveTab` and `resetZoomForActiveTab` write the store and apply the level to every live tab on that host in the same profile and privacy. A zoom equal to the default removes the entry, so that site follows later changes to the default.

**What the default doesn't touch.**
- `blanc://` pages stay at 100% unless the person zoomed them. Their zoom is saved by host, as today.
- The utility sheet and Reader keep today's direct zoom and write nothing to the store.
- PDFs keep the viewer's own zoom. ⌘+ and ⌘− still drive it, and nothing is saved while the tab is in `manual` mode.
- Real popup windows (the sign-in popups that keep `window.opener`, opened as a `BrowserWindow` and never wired as a tab) stay as they are: they don't take the default or saved zooms, and they keep reading Chromium's map, so a host's old level can still show there. Covering them needs a second path with no tab record, and they are short-lived. This is the builder's call and can follow later.
- `file:` pages take the default. ⌘+ and ⌘− there last until the tab navigates, because a host-less page has no site key.

**Private tabs.** They use the default and read the profile's saved sites. Their own ⌘+, ⌘− and ⌘0 go into a memory-only map that is gone at quit. Nothing from a private tab reaches the disk.

**Moving existing zoom across.** Isolated tabs ignore Chromium's map, so without this people lose their saved sites. Once per profile, Blanc reads `partition.per_host_zoom_levels` from that session's `Preferences` (`session.getStoragePath()`), converts levels to percents, rounds to whole percents and writes the store. A level that isn't on a step stays as it is. A missing or unreadable file means nothing to move, and it never blocks startup. Blanc never writes to that file, so the old entries stay there, unused, and removing a site in Settings doesn't touch them. They hold only sites the person zoomed before this release, which is what that file holds today. Settings copy says Blanc forgets the zoom, and makes no promise about the disk.

**Saved sites in Settings.** A row below Default page zoom opens a list of hosts with their percent, a remove button each, and Clear all. It covers the current profile only, and Private tabs aren't listed. Needs `pages:zoom:list`, `pages:zoom:remove` and `pages:zoom:clear`, guarded to the settings page and added to `browser-api/bridges.json`.

## Repository rules this touches

`settings-schema/schema.json`, `settings.js` and `settings-schema/generated`; every string in `copy/messages/` for all languages, with `copy:ack`; `spec/features.md` (new F62), `parity-matrix.md` and an acceptance feature; the audit inventory if a boundary file changes. CLAUDE.md gets a short section.

## Testing

- Unit: the ladder (including every default reaching 100%), key rules, the level decision, migration parsing (bad JSON, missing keys, both value shapes), settings validation.
- Acceptance, on a local fixture with two hosts: default applies to new tabs and `window.open` children; a change reaches open tabs; a site saved at 100% under 75% survives navigation and relaunch; ⌘0 returns to the default; tabs on a host follow each other; profiles stay separate; private zoom leaves no file behind; zoom works after visiting a PDF; a Quiet Tab wakes at the right zoom; `blanc://` pages stay at 100%; no host reaches `Preferences`.

## Not in this work

- Default and minimum font size, focus highlight, caret browsing and Live Caption from #1392, unless the owner adds them.
- A percent readout while zooming (the owner chose a later follow-up), and Ctrl+wheel or pinch zoom.
- iPhone and Android: F23 stays native pinch there (D10).
- No website or marketing claim until a release ships it (`docs/marketing-claims.md`). No comment on the issue without the owner's approval.
