# Bitwarden in Blanc: feasibility

Researched October 5, 2026 at the owner's request. **Status: research only.
No code. The realistic routes need Bitwarden's cooperation.**

The model is Blanc's 1Password fill (`docs/1password-integration.md`):
- explicit invoke only;
- the user approves Blanc in the password manager's own app;
- Blanc never holds the master password or the vault;
- only the chosen login reaches the page.

## Access note

The container's network policy blocks bitwarden.com, so Bitwarden source was
read through raw.githubusercontent.com. Claims based only on search-result
summaries are marked **unverified**.

## Routes

### 1. A public SDK like 1Password's: not available

- **`bitwarden/sdk-internal`** is the Password Manager SDK. Its README says it
  "is not intended for public use and is not supported by Bitwarden… interface
  is unstable and will change without warning". GPL, plus commercially licensed
  packages.
- **`bitwarden/sdk-sm`** covers Secrets Manager only, not Password Manager
  logins. Its licence (Bitwarden SDK License Agreement v1) restricts use to
  "Compatible Applications", bars offering them to third parties, and bars
  derivative works.

**Verdict:** there is no supported equivalent of `@1password/sdk`.

### 2. The DuckDuckGo integration: the right model, but partner-only

Bitwarden's desktop app has an encrypted local channel that DuckDuckGo's macOS
browser uses (`duckduckgo-message-handler.service.ts`,
`encrypted-message-handler.service.ts` in `bitwarden/clients`).

**How it works:**
- **Handshake (`bw-handshake`):** the browser sends its public key and
  application name.
- **Approval:** Bitwarden shows a verification dialog. On approval it stores
  one shared key.
- **Commands:** `bw-status`, `bw-credential-retrieval` (returns username and
  password for a URI), `bw-credential-create`, `bw-credential-update` and
  `bw-generate-password`.
- **Conditions:** the vault must be unlocked, and the user must have turned on
  **Allow DuckDuckGo browser integration**.

**Why Blanc can't use it as is:**
- The setting and the stored key are labelled for DuckDuckGo.
- The native-messaging manifest is written only into DuckDuckGo's macOS
  sandbox container (`native-messaging.main.ts`).
- Using that channel from Blanc would mean posing as DuckDuckGo. Not viable.
- A Kagi Orion community request for the same feature was told it needs its
  own partnership (unverified).

**Why it's still the best target:** it already matches Blanc's 1Password model:
- approval inside Bitwarden;
- credentials for one URI at a time;
- Blanc never holds the vault.

If Bitwarden added Blanc as a second partner, Blanc's existing credential
broker, native picker and fill path would carry over almost unchanged, macOS
first.

### 3. The ordinary browser-extension channel: unlock only

The channel the Bitwarden extension uses with the desktop app only unlocks the
extension: it returns the user key for biometric unlock, and the extension
decrypts the vault itself (`biometric-message-handler.service.ts`). The
browsers it serves are a hardcoded list per OS:
- **Windows:** Firefox, Chrome, Chromium, Edge, Vivaldi, Brave.
- **macOS:** adds Zen and Helium.
- **Linux:** adds Helium and Flatpak builds.

There is no setting for a custom browser.

### 4. Shipping the Bitwarden extension: no

**What the extension needs:**
- **Manifest V3:** a service worker, `offscreen`, `sidePanel`, Chrome 134 or
  later.
- **Permissions:** alarms, contextMenus, idle, notifications, webNavigation and
  more. Native messaging is optional.

**Licence:** GPL-3.0, with a Bitwarden-licensed folder and no trademark grant.

**What Electron supports:**
- **Full:** `devtools`, `scripting` and `webRequest`.
- **Partial:** `runtime`, without `connectNative`; `storage`, local only;
  `tabs`; `extension`; `management`.
- **Missing:** most of what Bitwarden needs.

**Verdict:**
- It would need an adapter close to the general extension runtime the owner
  declined on October 5.
- Electron can't load extensions in private tabs.
- Biometric unlock would be lost.

### 5. The command-line tool (`bw serve`): no

`bw serve` exposes the whole unlocked vault over a local HTTP API. Blanc would
have to handle the master password to unlock it, and any local process could
then read the vault. Community threads call it insecure by default
(unverified). This is the same problem as Dashlane's CLI.

### 6. Operating-system routes: passkeys only, maybe

- **macOS passwords:** Bitwarden's desktop app was not a macOS AutoFill
  provider as of 2026.1 (unverified). No Apple API was found that lets a
  browser request passwords for websites from a third-party manager.
- **macOS passkeys:** a restricted browser entitlement exists for passkeys
  (unverified detail). Whether it covers third-party providers is unknown.
- **Windows 11:** third-party passkey providers exist, and Bitwarden's is in
  beta (news sources). Electron's WebAuthn uses the Windows WebAuthn API, so
  Bitwarden passkeys **might** already work in Blanc on Windows with no code.
  Untested.
- **Linux:** no equivalent found.

## Recommendation

1. **Ask Bitwarden for a DuckDuckGo-style integration for Blanc**, through its
   Technology Partner program (bitwarden.com/partners, unverified page). It is
   the only route that matches Blanc's security model. Blanc's side is mostly
   built already: the broker, native picker, fill capsule and page
   revalidation. Bitwarden's side is a manifest path, a setting and an approval
   label for Blanc.
2. **Test Bitwarden passkeys on Windows 11 in Blanc as it is.** It's a cheap
   check, and if it works it is a claim worth recording, after
   release-backed verification per `docs/marketing-claims.md`.
3. **Do not pursue:** reusing DuckDuckGo's channel, `bw serve`, either SDK, or
   embedding the extension.

## Sources

**Bitwarden source:**
- https://raw.githubusercontent.com/bitwarden/sdk-internal/main/README.md
- https://raw.githubusercontent.com/bitwarden/sdk-sm/main/README.md
- https://raw.githubusercontent.com/bitwarden/sdk-sm/main/LICENSE
- https://raw.githubusercontent.com/bitwarden/clients/main/apps/desktop/src/main/native-messaging.main.ts
- https://raw.githubusercontent.com/bitwarden/clients/main/apps/desktop/src/services/duckduckgo-message-handler.service.ts
- https://raw.githubusercontent.com/bitwarden/clients/main/apps/desktop/src/services/encrypted-message-handler.service.ts
- https://raw.githubusercontent.com/bitwarden/clients/main/apps/desktop/src/services/biometric-message-handler.service.ts
- https://raw.githubusercontent.com/bitwarden/clients/main/apps/browser/src/manifest.v3.json
- https://raw.githubusercontent.com/bitwarden/clients/main/LICENSE.txt

**Electron:**
- https://raw.githubusercontent.com/electron/electron/main/docs/api/extensions.md

**Search summaries only (unverified):**
- https://bitwarden.com/help/duckduckgo-macos-browser-integration/
- https://bitwarden.com/partners/
- https://community.bitwarden.com/t/feature-please-build-a-native-integration-with-the-kagi-orion-browser-similar-to-the-ddg-browser-integration/79039
- https://community.bitwarden.com/t/add-security-hostname-option-to-bw-serve/39840
- https://community.bitwarden.com/t/register-as-macos-password-and-passkey-provider/93723
- https://www.bleepingcomputer.com/news/security/bitwarden-adds-support-for-passkey-login-on-windows-11
