# Local HTML files on Windows — design

Date: November 19, 2026. Issue: bnfy/blanc#1630 ("Open local html-files in blanc").

## Intent

A Windows user opened an `.html` file from their disk with Blanc. Blanc came to
the front and showed nothing. Windows passes the file to an app as a path on the
command line, and Blanc keeps only `http(s)://` arguments
(`src/main/startup-urls.js`), so the path is dropped without a word. macOS has
handled the same request since July 2026 through Finder's `open-file` event.
This change gives Windows what macOS has.

## Goals

- A local HTML file handed to Blanc by Windows opens, at a cold start and
  while Blanc is already running.
- It opens exactly as it does on macOS in the shipping build: the isolated,
  static preview window of `src/main/local-html-preview.js` (no scripts, no
  network, no other files, `data:` images only, at most 8 MiB, its own
  throwaway session).
- Blanc appears in Explorer's **Open with** list for HTML files, as it
  appears in Finder's on macOS, without becoming the default.

## Non-goals

- Loading local files as ordinary tabs, scripts, or neighboring CSS and
  images. That reverses the October 2026 decision that ECS builds never load
  `file:` (Electron gives `file:` pages wide filesystem access) and needs its
  own design and security review. The reporter compared Blanc with Firefox;
  this change won't match Firefox for pages that rely on those.
- Linux. Its "Open with" also passes a path, but its desktop entry claims no
  HTML type and no production smoke covers it. A follow-up can do Linux with
  its MIME claim and its own check.
- macOS changes. It keeps the LaunchServices `open-file` path only.
- Typed `file:` addresses, page-initiated file links, or other file types.

## Anti-goals

- Any way for a web page, a URL handler or a link to make Blanc read a file.
  Only an argument that is an absolute path to an existing regular HTML file
  qualifies, and the preview's own checks run again on top.
- Changing what the user's default HTML app is. Windows never lets an app take
  that silently; Blanc must not try.

## Approaches

1. **Accept HTML paths from the Windows command line and register an "Open
   with" entry (chosen).** Reuses `openLocalHtmlFiles` and the existing
   preview; the installer adds a `BlancHTML` ProgId, `OpenWithProgids`
   entries and `Capabilities\FileAssociations`. Small, matches macOS.
2. **Command line only, no installer change.** Works only when someone
   browses to `Blanc.exe` under "Choose another app", which is how the
   reporter found it. Cheaper, but Blanc stays undiscoverable for the thing
   it now supports, and the installer comment's reason for not claiming HTML
   ("argv handling accepts only http(s)") would be false.
3. **Real `file:` tabs.** Out of scope (see Non-goals).

The owner chose to plan Windows support and asked to dive in; approach 1 is my
call, because it is the macOS behavior and the installer's stated reason for
the omission goes away.

## Design

- **Parsing.** New `localHtmlPathsFromArgv(argv, { platform })` in
  `src/main/startup-urls.js`. On `win32` it returns every argument that is a
  string, does not start with `-`, contains no NUL, is absolute by
  `path.win32.isAbsolute` (drive or UNC), and ends in one of
  `HTML_EXTENSIONS` from `local-html-files.js`, case-insensitive. Arguments
  after a `--` separator count the same. Every other platform returns `[]`.
  Existence, regular-file and size checks stay where they are: in
  `localHtmlUrlFromPath` (dev builds) and `snapshotLocalHtml` (ECS builds).
- **Wiring in `main.js`.** The cold-start handoff (after session restore) and
  `second-instance` each pass the command line's HTML paths to the existing
  `openLocalHtmlFiles`. `second-instance` brings the main window to the front
  only when the command line carried neither a URL nor a file, so the preview
  window isn't buried.
- **Installer (`build/installer.nsh`).** `customInstall` writes
  `Software\Classes\BlancHTML` (name "Blanc HTML Document", the app icon,
  `shell\open\command` = `"<exe>" "%1"`), a value `BlancHTML` under
  `Software\Classes\<ext>\OpenWithProgids` for each of `.htm`, `.html`,
  `.xht`, `.xhtm`, `.xhtml`, and the same five under
  `${BLANC_CLIENT_KEY}\Capabilities\FileAssociations`. All in
  `SHELL_CONTEXT`, before the existing `SHChangeNotify`. `customUnInstall`
  deletes the ProgId key and each `OpenWithProgids` value (the
  `FileAssociations` go with the client key it already deletes). The
  default-browser status code reads only the http/https `UserChoice` and is
  unaffected.
- **Electron's argument guard.** Electron refuses to start when anything
  follows a URL-like argument without `--`. Its check skips a drive letter
  (`C:`) and a UNC path starts with `\\`, so `"<exe>" "C:\…\a.html"` passes;
  the Windows smoke proves it on a real launch.

## Evidence required before merge

- Unit tests for the parser and the installer keys.
- `test/desktop/ecs-local-html-smoke.cjs` in production mode on Windows: a
  cold launch with the path and a second launch into a running Blanc each
  open the preview with the existing isolation assertions. It runs in the
  Windows release job after `ecs-production-smoke.mjs`.
- A signed validation installer (`release-windows-linux.yml`,
  `mode=validation`) in the Windows 11 VM: Explorer's Open with lists Blanc
  for a `.html` file and opens it; uninstall removes the entry.

## Left to the builder

- Smoke mechanics (ports, waits, how the second process is launched) inside
  the existing smoke's structure.
- Release-note wording in `docs/press/release-notes/unreleased.md`, which must
  say it's a static preview with scripts and other files blocked.
