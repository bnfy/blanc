# Using Blanc

This guide describes public **v1.15.0**. `Cmd/Ctrl` means Command on macOS and
Control on Windows or Linux.

## Install and get started

Download the artifact for your operating system and processor from the
[official release](https://github.com/bnfy/blanc/releases/tag/v1.15.0).
On macOS, open the DMG and copy Blanc to Applications. On Windows, run the
installer. On Linux, make the AppImage executable and launch it.

Review the first-run choices before continuing, including search suggestions
and usage measurement. Open `/settings` later to change preferences. General
settings also offer **Make default…** and **Show welcome tour**.

## Browse and switch tabs

Press `Cmd/Ctrl+L`, enter an address or search, and press Enter. The Island
panel also finds open tabs, favorites, history, and named groups. Use the
arrow keys to choose a result. Escape closes the panel.

Click a tab dot to switch tabs, or open the panel for the complete list.
`Cmd/Ctrl+T` opens a regular tab; `Cmd/Ctrl+W` closes the current tab.
`Cmd/Ctrl+Shift+T` reopens an eligible recently closed tab. Reopening may
reload the page; private tabs are excluded from this history.

Type `/` in the address field to discover commands. Useful starting points
are `/find`, `/favorites`, `/history`, `/downloads`, and `/settings`.
Open **Help → Keyboard Shortcuts → Show All Shortcuts…** for the shortcut list.
General settings let you choose Island or Vertical tabs.

## Keep tabs organized

Use `/group <name>` or a tab row's group picker to explicitly organize tabs
into named groups. `/ungroup` removes the current tab from its group;
`/close-group` closes its group. `/pin` changes the current tab's pinned state.

Under General, **Quiet inactive tabs** controls when eligible background tabs
can free renderer memory. Choose Off, 30 minutes, 1 hour, or 6 hours. A quiet
tab reloads when revisited; exact live page state is not guaranteed. Tabs with
protected activity or uncertain eligibility remain awake.

Named Workspaces are an optional Patron feature, available through
`/workspace`. Creating one requires an active subscription. Existing
workspaces can still be renamed or removed after a subscription lapses.

## Favorites, imports, history, and downloads

Use the heart control or `/save` to save the current page. In `/favorites`,
choose **Look for other browsers**, select a detected profile, and use
**Import from browser**, or choose **Import HTML…** for a bookmarks file.

Open `/history` to find previously visited pages, and `/downloads` to see
download records. `/clear` clears browsing history. To remove cookies and
cached site data, use **Clear cookies, cache & site data** in Settings;
clearing this data signs you out of sites.

## Private browsing, blocking, and permissions

Use `/private` or `Cmd/Ctrl+Shift+N` to open a private tab. Private tabs use
temporary browsing storage and are excluded from history, saved sessions,
sync, and Recently Closed. Files you download remain on disk. Private browsing
does not hide your network activity from sites or your network provider.

The Island's blocker count reports blocked requests. `/allow-ads` creates
an exception for the current site; manage exceptions in Settings. Blocking
uses the reviewed lists bundled with the installed release. If blocking
cannot start, the start page offers Retry or an explicit choice to continue
without it.

Respond to site permission prompts according to what you want that site to
access. Review remembered decisions under **Site permissions** in Settings.
Do not assume granting a permission once grants every site access.

## Profiles and sync

In Settings, name a profile and choose **Create profile window**. Named
profiles separate cookies, site data, favorites, history, download metadata,
and remembered permissions. Device preferences and Patron remain shared.
Profile Sync is limited to Personal.

To enable sync for Personal, enter a sync name and passphrase in Settings
and choose **Turn on sync**. Use the same credentials on your other device.
Keep the passphrase safe: it cannot be recovered. **Sync now** requests a
sync; sharing open tabs has its own checkbox. **Turn off sync** also offers
an option to delete synced data. Sync does not include private tabs or every
device preference.

## Customize the start page

General settings offer Ledger, Billboard, Shelf, Tally, and Mahjong layouts.
Mahjong includes eight layouts, a Daily board, device-local records and
streaks, unfinished-game resumption across tabs, and undoable Shuffle.

## Updates and help

Installed builds check for updates. Use **Check for Updates…** in the app
menu to check manually, and follow the offered restart action when an update
is ready. Development runs do not auto-update.

For help, contact support@blancbrowser.com with your version, operating
system, and reproduction steps. Settings offers **Export diagnostics…**;
review a diagnostic file before sharing it. Report suspected vulnerabilities
through [SECURITY.md](../SECURITY.md), rather than a public bug report.

The [source evidence record](user-guide-evidence.md) identifies the release
files behind this guide.
