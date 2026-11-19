# Windows fork W3: a public Windows beta that updates itself

> **For agentic workers:** execute inline (superpowers:executing-plans). Steps use checkbox syntax.

**Goal:** Blanc Beta for Windows x64: a signed installer anyone can download from a GitHub
pre-release, without test hooks, under its own Windows identity, that keeps itself current through
Chromium's own updater talking to Blanc's update server.

**Spec:** [`docs/superpowers/specs/2026-11-17-windows-fork-design.md`](../specs/2026-11-17-windows-fork-design.md)
(the W3 rung and the owner decisions of 2026-11-18). **Before it:** [W2](2026-11-18-windows-fork-w2.md).

**Owner decisions, 2026-11-18:**
1. Updates come through Chromium's own updater (`//chrome/updater`).
2. Update-server answers are signed (CUP) with Blanc's own ML-DSA-44 key built into the app; the
   private half is a server secret. CUP is not turned off.
3. The update server is a Cloudflare Worker on blanc.day.
4. Update packages are CRX3 signed with Blanc's own publisher key (a new key the owner holds, kept
   like the Sparkle key: 1Password Dev, never on the build server or in GitHub).

## Facts this plan rests on (read 2026-11-18 at the 158.0.8127.2 pin)

- `chrome/updater/branding.gni` falls back to Chromium's names when `!is_chrome_branded`: updater
  "ChromiumUpdater", company "Chromium", `updater_appid {6e8ffa8f-…}`, `browser_appid {5d8d08af-…}`,
  about 50 fixed COM class and interface GUIDs, mutex ids, and `update_check_url` pointing at a Google
  sandbox. Google's builds import `chrome/updater/internal/branding_google.gni` instead.
- `chrome/install_static/BUILD.gn` sets `USE_GOOGLE_UPDATE_INTEGRATION` only for
  `is_chrome_branded && is_win`. It gates 46 places: the installer's `Clients`/`ClientState`
  registration (`install_util.cc` `GetClientsKeyPath`, `install_worker.cc`), the channel strategy
  (`install_constants.h`), and browser-side update code (`chrome_browser_main_win.cc`,
  `google_update_metrics_provider_win.cc`, `active_use_util.h`).
- `components/update_client/request_sender.cc` hard-codes `kCupKeyVersion = 16` and
  `kCupPublicKey`, an ML-DSA-44 SubjectPublicKeyInfo (Google's). The updater's `UseCUP()` is `true`
  (`external_constants_default.cc`).
- The updater accepts `crx_file::VerifierFormat::CRX3_WITH_PUBLISHER_PROOF` only, i.e. packages
  signed by Google's production publisher key, plus an optional `CrxPublicKeyHash()` from
  `crx_pkhash` (empty for Chromium).
- `blanc/config.gni` asserts `is_mac` for `blanc_channel == "beta"`; test hooks are already off
  outside the preview channel (`blanc_enable_test_hooks`). Patch 0098's Windows names assert
  `blanc_channel == "preview"`.
- The Mac beta's release tooling is `chromium/release/` (`release.mjs`, `policy.mjs`, `ledger.json`,
  `gate-evidence.mjs`, `appcast.mjs`, `local-update-proof.mjs`); Windows signing runs in
  `chromium-windows-candidate.yml`'s `sign` job (W1 Part C).

## Global constraints

- Fork rules from W2 hold: `chromium/next`, the guard, both lanes' patch checks, the fork unit suite,
  Mac Studio GN regeneration for shared build files, no `ninja -t` on the Studio.
- No key is generated, stored or used on the build server or in a GitHub artifact. The CUP private
  key lives only in the Worker's secrets; the CRX publisher private key only in 1Password and the
  owner's signing step. Every signing run needs the owner's approval.
- Nothing public before Part E's gate: no download link, website copy or claim about a Windows build.
  Website claims follow `docs/marketing-claims.md` and get their own claims ledger.
- The Mac beta's identity, Sparkle and release flow do not change.
- Windows' Electron Blanc stays untouched by every install, update and uninstall (W1's checks).

## Review focus

1. **An update that fails halfway** (download cut, bad signature, server error) leaves the installed
   beta working and on its old version. Task D2 covers a corrupted package and a wrong key.
2. **A downgrade or replayed answer** from the server is refused: CUP with our key, and the updater
   never installs a lower version. Task C1's tests.
3. **The updater beside other Chromium-based apps** on the same machine: no shared names, COM ids or
   mutexes. Task B1's collision test.
4. **The browser running during an update**: the new version waits for a restart (Chromium's
   rename-on-exit), and the About page says so. Task D2's proof.
5. **Uninstall** removes the browser and, when nothing else uses it, the updater and its scheduled
   task; Electron Blanc and its updater are untouched. Task D2.

---

## Part A: the Windows beta channel

### Task A1: Blanc Beta's Windows identity

**Files:** patch 0098 (relax the preview-only assert to preview and beta, with per-channel
`BLANC_WIN_*` values), `chromium/blanc/config.gni` (allow `beta` on Windows),
`chromium/blanc/branding/win-beta/BRANDING`, `chromium/windows/args/beta-x64.gn`,
`chromium/windows/identity.md`, `chromium/tools/windows-identity.test.mjs`.

- [x] **Failing test:** the beta channel's names: app name `Blanc Beta`, app id `BlancBeta`, ProgIDs of
      at most 11 characters (`BlancBetHTM`, `BlancBetPDF`), URL scheme `blanc-beta`, data folder
      `%LOCALAPPDATA%\Blanc Beta`, publisher `Bananify Creative`, and none equal to the preview's,
      Electron Blanc's or Chromium's; the beta args set `blanc_channel = "beta"`, the Windows beta
      BRANDING file, and no test hooks.
- [x] Implement the names, the args file (`target_os="win"`, `is_official_build` as the Mac beta's
      args, `blanc_beta_version`, `blanc_beta_build`, the blocker bundle) and new toast and Active
      Setup GUIDs for the beta.
- [x] Bootstrap and the guard learn a second Windows output, `BlancWinBeta`; review the cold-build
      plan before `--allow-large-build`.
- [x] Build; the install check passes on the beta installer (names from the beta row), and
      `hooks-evidence.mjs`'s check finds no test hook in the beta's binaries.

## Part B: Chromium's updater, branded and wired

### Task B1: the updater's Blanc branding

**Files:** a patch to `chrome/updater/branding.gni` importing `//blanc/branding/win-beta/updater.gni`
for the beta channel; that file; `chromium/tools/windows-updater-branding.test.mjs`.

- [x] **Failing test:** every value `branding_google.gni` sets has a Blanc value: updater name
      `Blanc Updater`, company `Bananify Creative`, short names, fresh random `updater_appid`,
      `browser_appid`, `qualification_appid`, every COM class and interface GUID, mutex and service
      prefixes, `update_check_url = "https://blanc.day/update/win/v4"`, and `crx_pkhash` = the
      publisher key's hash (Task B3). None equals Chromium's or Google's values (read from the pin).
- [x] Write the file and the patch; GUIDs generated once and committed.

### Task B2: updater integration in a Blanc build

**Files:** a patch to `chrome/install_static/BUILD.gn` (`USE_GOOGLE_UPDATE_INTEGRATION` also for
`blanc_channel == "beta" && is_win`); fixes for whatever Google-only code that turns on; install
modes' channel strategy `FIXED` to `beta`.

- [x] Turn it on for the beta and build; fix each compile or link failure at its cause, keeping
      Google-specific services (metrics upload, Google Update policy) off.
- [x] Build `//chrome/updater:updater` and its setup program for the beta output.
- [x] **Check:** the beta installer writes the app's `Clients\{browser_appid}` version under the
      updater's company key, and `updater.exe --install` then `--wake` finds the app registered.

### Task B3: Blanc's keys in the app

**Files:** a patch to `components/update_client/request_sender.cc` (Blanc's `kCupKeyVersion` and
ML-DSA-44 public key, beta channel only) and to the updater's verifier format (CRX3 with Blanc's
publisher key hash instead of Google's proof); `chromium/windows/update-keys.md`.

- [x] The owner generates both key pairs on the MacBook Pro (commands given; private halves into
      1Password and the Worker's secret); only the public halves are committed.
- [x] **Failing test then pass:** the committed public keys match the hashes recorded in
      `update-keys.md`, and no private key material is anywhere in the repo.

## Part C: the update server

### Task C1: the Worker

**Files:** `cloudflare/update-worker/` (Worker, `wrangler.toml`, tests).

- [ ] **Failing tests** with recorded requests from the updater (captured in Task D1's first run):
      an update check for an older version answers with the current beta's package URL, size and
      SHA-256; the current version answers `noupdate`; an unknown app id, a malformed body and a
      lower requested version are refused; every answer carries a valid CUP signature over the
      request and response, checked with the public key.
- [ ] Implement the protocol (JSON, version 4, as `update_client`'s parser at the pin expects) and
      ML-DSA-44 signing (a vetted library, pinned by hash); the current beta comes from one data file
      the release tooling writes, like `site/public/updates/chromium-beta/arm64.xml` for the Mac.
- [ ] Deploy to a staging route first; production after Part D's proof.

## Part D: releasing and proving an update

### Task D1: package and publish

**Files:** `chromium/release/` (Windows stages beside the Mac's: CRX3 packaging of the signed
installer with the publisher key, the update data file, checksums, Sigstore), the candidate
workflow's sign job (signs the updater and its setup program too).

- [ ] **Failing tests** for the packaging: a CRX3 the updater's verifier accepts with Blanc's key
      hash and refuses with any other; the data file names the exact package digest.

### Task D2: the N-to-N+1 proof

- [ ] On a runner: install beta N with the updater, point it at the staging Worker serving N+1,
      `--wake`, and check the installed version becomes N+1 after a restart; Electron Blanc
      untouched. Also: a package with the wrong key and a tampered package are refused and N keeps
      running. This becomes a release gate, like the Mac's `sparkle-N-to-N+1`.

## Part E: going public

### Task E1: the first Windows beta

- [ ] Owner hand checks on a real Windows desktop (W2's D1 plus: install from the download, an
      update arriving, About showing it).
- [ ] Release through `release.mjs`'s Windows stages, owner-run; a hosted smoke of the published
      installer; the claims ledger and the download tile in a website PR, with the owner's approval
      of the copy.

## W3 gate

1. The beta installer installs, launches and uninstalls beside Electron Blanc, with no test hooks.
2. The updater is Blanc-branded and shares no name, id or COM GUID with Chromium or Google.
3. The Worker's tests pass, including CUP signatures and refusals.
4. The N-to-N+1 proof passes, and tampered or wrongly signed packages are refused.
5. The owner's hand checks pass and the owner approves the release and the website copy.

## Not in W3

Windows on Arm; delta updates; enterprise policies for the updater; crash upload; moving the Mac
beta to Chromium's updater.
