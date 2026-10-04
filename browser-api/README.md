# browserAPI contract (Phase 0 bridge contract)

One source of truth for `window.browserAPI`, the bridge that Blanc's trusted
chrome documents (the strip, the overlay and the permission prompt) use to talk
to the main process. It is Phase 0 of the platform evaluation in
[`docs/platform-migration-electron-to-chromium-2026-10-04.md`](../docs/platform-migration-electron-to-chromium-2026-10-04.md):
the Island should depend on a Blanc-owned contract, not on Electron IPC details.
It is useful on Electron today, whatever is decided about the migration, and it
involves no fork work.

## Files

```
browser-api/
  contract.json      the source of truth — edit HERE
  build.mjs          generator + drift checker
  generated/
    browser-api.d.ts   TypeScript declarations for window.browserAPI
    browser-api.md     a reference table of every member
```

## Commands

```bash
npm run browser-api:build   # regenerate browser-api/generated/* from contract.json
npm run browser-api:check   # verify the desktop matches the contract. Exit 1 on drift.
```

`browser-api:check` runs in `substrate:check` and in the Parity guards workflow.

## What the check verifies

Unlike the regex-based checkers in `tokens/`, `settings-schema/` and `copy/`,
the preload is **executed** in a `vm` sandbox against a recording
`ipcRenderer`, once per platform (`darwin`, `win32`, `linux`). For every member
it confirms:

- **Exposure:** the preload exposes exactly the contract's members, no more and
  no fewer, and platform-limited members (`fillLoginFromOnePassword`) appear only
  on their platforms.
- **Trusted documents:** `browserAPI` is exposed to each listed surface and
  withheld from other documents (`blanc-chrome://fill-status/`, `blanc://` pages,
  web pages, a trusted URL with a query string).
- **IPC shape:** each call uses the contract's kind (`invoke` or `send`) and
  channel, and sends the contract's arguments, including object payloads such as
  `{ id, allow }`, boolean coercion, and parameter defaults. `invoke` members
  return the `ipcRenderer.invoke` promise.
- **Events:** each subscription listens on its channel, forwards exactly the
  payload (or nothing), and returns an unsubscribe that removes the same
  listener.
- **Main:** every channel still appears in `src/main` outside the preload. This
  is a presence check, so it catches a deleted handler or sender, not a changed
  signature.
- **Renderers:** every `browserAPI.<name>` reference in `src/renderer/*.js` is a
  contract member.
- **Generated files** are current.

`test/unit/browser-api-contract.test.js` changes the preload and the contract in
nine deliberate ways (renamed channel, reshaped payload, dropped coercion,
changed default, extra trusted document, leaked platform gate, leaked listener,
missing member, unknown type) and requires each to be reported.

## Changing the bridge

Change `src/main/preload.js` and `contract.json` together, then run
`npm run browser-api:build` and commit the regenerated files. Argument shaping
is described by `ipcArgs` when it differs from passing the parameters in order:
`"$0"` is the first parameter, `"bool($0)"` coerces it, and an object maps
fields to parameters.

## Coverage today

This is a first draft. The surface is complete (100 members: 1 value, 59
`invoke`, 22 `send`, 18 events), and every member's IPC behaviour is checked.
Payload shapes are only partly pinned:

| Area | Typed | Still `unknown` |
| --- | --- | --- |
| Parameters | 63 of 73 | 10, mostly opaque ids and option bags |
| `invoke` results | 3 of 59 | 56 |
| Event payloads | 1 of 16 (`tabs:updated`, top level only) | 15 |

Types say `unknown` rather than guess. Pinning them, starting with the
`tabs:updated` tab entries, is the next Phase 0 step. A runtime payload check
would need main-process fixtures and is not part of this draft.

## Not in scope

No Mojo interface or Chromium code is generated. That would only follow the
owner's Decision 1 in the platform evaluation.
