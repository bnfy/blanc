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
- **Payloads:** `tabs:updated` and `getAllTabs` are pinned field by field (see
  below).
- **Generated files** are current.

`test/unit/browser-api-contract.test.js` changes the preload and the contract in
nine deliberate ways (renamed channel, reshaped payload, dropped coercion,
changed default, extra trusted document, leaked platform gate, leaked listener,
missing member, unknown type) and requires each to be reported. It also edits
`main.js` payload literals (a new tab field, a dropped payload field, a changed
capture row, an unknown spread, extra or missing event fields, an unreadable
send argument, a void handler returning a value, a boolean handler that can
fall through, a drifting returned object, a new workspace error code or
protection reason, a drifting handler-table result) and narrows contract
enums, and requires those to be reported too.

## Pinned payloads

Structured types use `fields` instead of a `ts` string; the generator turns them
into interfaces. `TabsUpdatedPayload` and `TabsSnapshot` are fully pinned, down
to the tab entry (`TabEntry`) and everything nested in it. The check proves
these shapes two ways, because the payload is assembled from two kinds of code:

- **Pure helper modules** (`shield-model.js`, `site-security.js`,
  `closed-tabs.js`, `display-capture-indicator.js`, `capture-state.js`) are
  executed on about 700 fixtures covering every branch: all chip modes, popover
  variants, provider labels and site-info states. Each result is validated
  strictly against the contract: required fields present, no extra fields, and
  literal values within their unions.
- **Inline literals in `main.js`** (`serializeTabs`, `currentTabsPayload`, the
  `tabs:get-all` handler and `captureBroadcastState`) are read from source and
  their keys compared with the contract's fields, including known spreads. An
  unrecognized spread fails the check, so a new one has to be taught to
  `build.mjs` before it can pass.

Field *values* produced inside `main.js` itself (titles, URLs, flags) are typed
from the tab record's JSDoc and initial values; they are not executed.

### Event send sites

Every other event with a structured payload is checked where it is sent. For
each `send('<channel>', …)` in `src/main` (outside the preload and the test
hook), the payload's keys must be fields of the contract type, and every
required field must be present. The payload may be an object literal, a local
variable bound to one, or a call to a function that returns one. A replay of a
stored `….payload` is accepted only when another send site for the channel was
checked. Anything else fails, so a new send site has to be readable or the
member marked:

- `"payloadCheck": "fixtures"`: proven by executing a pure helper on fixtures
  instead (`onGlanceLayout`, via `calculateGlanceLayout()`).
- `"payloadCheck": "custom"`: proven by a dedicated check (`onTabsUpdated`).

Events whose payload is a plain string, number or string union
(`onGlanceStatus`, `onIslandProximity`, `onThemeAppearance`) are typed from the
code but their values are not checked at the send site.

### Invoke results

Typed `invoke` results are checked against what their handler can return. The
check reads the `chromeHandle('<channel>', …)` handler in `main.js`, follows a
direct call to a local helper one level deep, and classifies each top-level
`return` (nested functions are ignored): nothing (a bare `return` or falling off
the end), a boolean, `null`, number or string literal, an object literal, or an
opaque expression. Then:

- a `void` result must never return a value;
- a result whose type excludes `undefined` must not be able to fall through;
- an object literal must match a structured type in the result, key for key;
- an opaque expression (an identifier or call) is accepted unless the type is
  `void`, because its value can't be read statically.

Handlers registered through a table (`['<channel>', (…) => op(…)]` consumed by
a loop that calls `chromeHandle(channel, …)`) are resolved to the loop's shared
body. In a returned object, `...helper()` contributes the keys that helper
returns; spreading an opaque value (`...result`) can't be read, so it only
waives the required-field check.

`"resultCheck": "none"` skips the check for a member whose handler forwards an
Electron method's result (`stop`, `stopFindInPage`); the reason is in its doc.

### Workspace action results

All eight Named Workspace actions resolve to `WorkspaceActionResult`. Three more
checks prove it:

- **Controller fixtures:** `workspace-controller.js` is Electron-free, so its
  `open` and `create` run against a stub adapter on 54 fixtures covering every
  branch (swap, noop, focus elsewhere, not found, read errors, protected pages,
  unsaved scratch and its confirmed decision, checkpoint and commit failures,
  a thrown stage, not patron, invalid names, create failures and reentrant
  `busy`). Each result is validated strictly.
- **Code literals:** every `error:`, `action:` and protection `reason:` literal
  in the workspace modules, the workspace functions in `main.js` and the
  controller adapter must be in `WorkspaceErrorCode`, `WorkspaceAction` or
  `WorkspaceProtectionReason`.
- **Handler results:** the success objects the handlers build
  (`{ ok: true, ...workspacesProjection() }`) are checked key by key.

## Changing the bridge

Change `src/main/preload.js` and `contract.json` together, then run
`npm run browser-api:build` and commit the regenerated files. Argument shaping
is described by `ipcArgs` when it differs from passing the parameters in order:
`"$0"` is the first parameter, `"bool($0)"` coerces it, and an object maps
fields to parameters.

Adding, removing or renaming a field in `serializeTabs`, `currentTabsPayload`,
the `tabs:get-all` handler or the capture rows needs the matching `fields` edit
in `contract.json`. So does a new return value from one of the helper modules.

## Coverage today

The surface is complete (100 members: 1 value, 59 `invoke`, 22 `send`, 18
events), and every member's IPC behaviour is checked. Payload shapes are mostly
pinned:

| Area | Typed | Still `unknown` |
| --- | --- | --- |
| Parameters | 67 of 73 | 6: anchors, the find options, history options, the Favorites folder and the screen-share picker choice |
| `invoke` results | 46 of 59 | 13: navigation and find (forwarded wake and Electron results), history, Favorites and remote tabs lists, search suggestions, the two ad-blocking commands, 1Password fill |
| Event payloads | 15 of 16 | `onRemoteTabsUpdated` (sync device shapes not yet traced) |

Types say `unknown` rather than guess. Overlay `purpose` stays `unknown` inside
`OverlayShowPayload` because it is deliberately mode-specific.

## Not in scope

No Mojo interface or Chromium code is generated. That would only follow the
owner's Decision 1 in the platform evaluation.
