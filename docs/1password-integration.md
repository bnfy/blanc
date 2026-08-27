# 1Password login fill

Status: macOS-only production candidate for the build after v1.8.2. The
product-owner risk decision is recorded in
[`1password-legal-inquiry.md`](1password-legal-inquiry.md). This integration is
independent, is not affiliated with or endorsed by 1Password, and remains
subject to 1Password's SDK terms. Windows and Linux do not expose its setting,
menu item, keyboard shortcut, slash command, preload method, or IPC handler,
and cannot create the credential broker.

## User setup

1. On macOS, install the current 1Password desktop app and sign into the account
   to use.
2. In 1Password, open **Settings → Developer** and turn on **Integrate with
   1Password SDKs**.
3. In Blanc, open **Settings → Privacy & Security → 1Password**, turn on
   **Fill logins from 1Password**, and enter the account name shown at the top
   of the 1Password sidebar or the account ID.
4. On a website login form, choose **View → Fill Login from 1Password**, press
   **⌥⌘P** on macOS, or run **/1password** from the Island.
5. Approve Blanc Browser in the 1Password desktop prompt. If several Login
   items match, choose one from the native menu.

Blanc never fills automatically. The setting and account identifier stay on
this device and are excluded from Profile Sync.

## Security boundary

- The page is inspected without credentials before the SDK is contacted.
- The platform capability gate runs before any client or UI construction.
  Windows and Linux fail closed without creating a 1Password client or utility
  process.
- `@1password/sdk` is pinned exactly and loads only on macOS in
  `src/main/onepassword-broker.js`, an Electron utility process named **Blanc
  Credential Broker**.
- On macOS that process alone uses `Blanc Helper (Plugin).app`. It retains
  Electron's required `allow-jit` and `allow-unsigned-executable-memory`, and
  only that helper adds `disable-library-validation` so it can load 1Password's
  separately signed native bridge. Signed-build verification fails if any
  required Plugin entitlement is missing or if the library-validation exception
  appears on Blanc or an ordinary helper.
- The SDK authorization may cover the approved account. Blanc calls only
  vault/item list and item read operations. Overview metadata is matched in the
  broker and the native picker is bounded to ten candidates. Because SDK 0.5.0
  exposes no field-projection read, a multiple-match flow opens only that bounded
  candidate set inside the broker, projects each built-in username for the native
  picker, and immediately drops the full items. Passwords, notes, and custom
  fields never leave the helper during selection. The chosen item is read again,
  and only its built-in username and/or password required by the page leaves the
  broker for filling. The broker binds the picker snapshot to the item's SDK
  version and aborts without credentials if the item changes before selection.
- Projected candidate usernames and the selected credential cross only the
  broker→main utility-process channel, are never sent through renderer IPC, and
  are never written to disk, Profile Sync, logs, telemetry, or crash reporting.
  Only the selected credential is injected into the dedicated isolated world.
- The exact runtime, tab, navigation epoch, URL, document time origin, and DOM
  element identities are revalidated after every prompt and before injection.
  Signup/new-password, ambiguous, hidden, search, and newsletter fields fail
  closed. A heuristic current-password target requires an extra native prompt
  before SDK authorization.
- Disabling the feature or changing the account stops the broker immediately.
  Otherwise its credential-free SDK client is discarded after ten minutes of
  inactivity, matching 1Password's documented authorization window.

## Release gates

- `npm run substrate:check`, `npm run test:unit`,
  `npm run test:acceptance:dry`, `npm run test:acceptance:desktop`, and
  `npm run test:onepassword:utility` pass.
- Production dependency audit is clean at high severity.
- A signed unpacked macOS build proves the Plugin helper is the sole
  library-validation exception, retains all three required Plugin runtime
  entitlements, and the package contains SDK 0.5.0 plus its bundled MIT notice.
- On a real installed 1Password account on macOS, verify one exact-domain login, one
  AnywhereOnWebsite subdomain login, multiple matching Login items, cancellation,
  `Never`, signup refusal, navigation/tab-switch cancellation, and private-tab
  behavior. The multiple-match gate must confirm that distinct built-in usernames
  appear as the primary picker labels with the item title and vault beneath them,
  and that entries without a username retain the title/vault fallback. With the
  picker open on disposable items, change the selected item in 1Password before
  choosing it; Blanc must report that the Login item changed and fill nothing.
- The redacted field-contract fixture follows [1Password's documented Login IDs](https://www.1password.dev/sdks/manage-items)
  (`username` and `password`); confirm those exact fields in a live DesktopAuth
  response during the real-account macOS gate before calling the contract proven.
- Windows and Linux artifacts must still pass their existing fuse/signature/
  packaged-payload gates, and their native smoke test must prove the 1Password
  broker is unavailable. A release requires the ordinary explicit owner
  go-ahead; preparing this feature does not itself authorize tagging/publishing.

### macOS signed-candidate evidence — 2026-08-23

The fresh signed and notarized unpacked `dist/mac-arm64/Blanc.app` passed strict
nested-signature verification and the repository's DER entitlement verifier.
Its packaged controller and Settings surfaces contain the current **Integrate
with 1Password SDKs** copy. The live Plugin helper remained running after
repeated DesktopAuth reads. Disabling the Blanc setting stopped that helper;
enabling it again created a fresh helper process.

Using three disposable Login items in the real account's Dev vault and a
loopback-only form that never submitted data:

- **PASS:** Exact Host filled the Login built-ins `username` and `password`.
- **PASS:** Fill Anywhere on This Website matched a parent-domain item on a
  subdomain, including the effective port.
- **PASS:** two matching items produced the bounded native metadata picker;
  only the selected item was then revealed and filled.
- **PASS:** picker cancellation left both fields empty.
- **PASS:** an isolated Never item produced **No matching login** and left both
  fields empty. A broad Anywhere item was temporarily narrowed during this
  case so it could not independently match the Never host, then restored.
- **PASS:** switching tabs and navigating while the picker was pending canceled
  the flow; the original and replacement documents remained empty.
- **PASS:** explicit fill worked in a private tab, and signup/new-password fields
  were refused before any item selection.
- **PASS:** locking 1Password revoked the cached SDK grant and produced a fresh
  **1Password Access Requested** DesktopAuth dialog. Canceling it produced a
  clean Blanc authorization error, left both fields empty, and an immediate
  retry produced a new authorization dialog rather than a stuck broker.

The supported reset is to lock the account: 1Password's
[SDK integration security model](https://www.1password.dev/sdks/desktop-app-integrations)
states that locking the desktop app immediately revokes every existing SDK
authorization. The signed macOS functional gate is closed.

### macOS-only release decision — 2026-08-24

The product owner selected a macOS-only first release after Parallels repeatedly
hung during attempted Windows validation. This is a platform boundary, not a
waiver: Windows and Linux expose no 1Password surface and cannot start the
broker. Their ordinary artifact checks remain required, with an automated native
assertion that this feature is unavailable. Expanding support later requires an
explicit code, test, security, documentation, and live-account review.

### Future Windows/Linux enablement harness

If cross-platform support is reconsidered, run the candidate and this
loopback-only fixture server on the same test machine:

```sh
npm run test:onepassword:live-server
```

The server binds only `127.0.0.1`, accepts GET/HEAD only, never submits forms,
and never logs requests or field values. Chromium resolves the `.localhost`
test names to loopback. Keep the terminal open and create disposable Dev-vault
Login items for these URLs, using the server's printed port (default `48765`):

| Item | Stored website | Autofill behavior |
| --- | --- | --- |
| Exact | `http://exact.localhost:48765/login` | ExactDomain |
| Anywhere | `http://parent.localhost:48765/login` | AnywhereOnWebsite |
| Never | `http://never.localhost:48765/login` | Never |
| Second match | `http://exact.localhost:48765/login` | ExactDomain |

Use `http://child.parent.localhost:48765/login` for the one-way subdomain case
and `http://exact.localhost:48765/signup` for signup refusal. The login page has
a **Navigate during Fill** link and a local field-state indicator; its Sign in
button is inert. For the fresh-authorization case, lock 1Password immediately
before invoking Fill, cancel the prompt, confirm both fields remain empty, then
retry and confirm the prompt returns and the broker is usable.

## Frozen names for the first release

The user-facing feature name is **1Password login fill**. The device-local keys
remain `onePasswordEnabled` and `onePasswordAccount`; broker methods remain
`find-logins`, `reveal-credential`, and `probe-package`; `vaultId` and `itemId`
remain opaque SDK identifiers. Renaming any of these after release requires an
explicit settings/protocol migration rather than an incidental cleanup.
