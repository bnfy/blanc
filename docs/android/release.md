# Android release: fetch to internal track

This is the owner-side Task 9 runbook. The tooling has fixture coverage only.
No real handoff download, AAB validation, size measurement, signing, Sigstore
sign-in, Play upload or device installation was performed to implement it.
The release ledger remains empty. Actual server, key, Play and device evidence
remains pending for A7 Step 12; these instructions do not establish a release.

Run one stage at a time from the owner's Mac in a foreground Terminal. The
owner approves **each upload** by typing the exact version-specific phrase.
Run signing and attestation there too, so 1Password and Sigstore can complete
their interactive sign-ins. Do not run the secret worker directly; its marker
prevents mistakes and is not authentication or an approval substitute.

## Prepare a workspace

Use a private, durable directory outside the Chromium source/output trees, with
enough space for the handoff, signed AAB and a device-specific APK set. Preserve
the folder through completion. For real releases keep WORK and a private `TMPDIR`
outside every Git checkout; temporary signing keys must never be written into
the repository. Only dummy fixture workspaces use the repository's `.a7-tmp/`.
The local Blanc repository must already contain
the build record's exact source commit object. The script never creates/fetches
a tag, builds Chromium, changes toolchains, or changes server files.

Create `WORK/config.json` (schema 1):

```json
{
  "schema": 1,
  "source": "/absolute/path/to/prepared-server-handoff",
  "secrets": {
    "keystoreRef": "op://Dev/Blanc Android upload key/upload.p12",
    "aliasRef": "op://Dev/Blanc Android upload key/alias",
    "passwordRef": "op://Dev/Blanc Android upload key password/password",
    "credentialRef": "op://Dev/Blanc Play API/blanc-play-upload.json"
  }
}
```

These are the real items, created on November 15, 2026 (`docs/android/play-console.md`). The
keystore and the Play credential are 1Password Documents, read by their file names; the alias
(`blanc-upload`) is a text field on the keystore's item; the store and key share one password, kept
in its own item. `upload-cert.json` pins the upload certificate's SHA-256. No credential or private key
belongs in this file, `state.json`, shell arguments, logs, or a committed file.
Keep these references in the configuration file, not environment variables:
`op run` resolves references found in its environment before starting a worker.

For a direct download, replace `source` with:

```json
{"host": "android-release", "path": "/home/blanc/blanc-evidence/android/release/android-v1.0.0-beta.1-1"}
```

`host` is an already-configured SSH host alias (letters, digits, `.`, `_`, `-`,
starting with a letter/digit). The absolute server path allows only those
characters and `/`, without `..` segments. Configure authentication and host-key
verification independently; the script adds no SSH options or credentials.
It writes a local whitelist containing the six named handoff files below and
`license-inputs`, then invokes one
`rsync --recursive --links --files-from=WHITELIST -- host:path/ STAGING` command.
The private staging folder and whitelist live inside WORK and are removed after
the attempt. `--links` copies link text without reading the target; the local
inventory then rejects every symlink before import or ledger reservation. There
is no `--copy-links`, `--copy-dirlinks`, or `--copy-unsafe-links` option, and no
fallback to `scp -r`, which follows remote links before the Mac could reject them.
The whitelist keeps raw captures, source attempts, backups and unrelated logs
on the server. Fetch performs the same import checks as local mode and never
downloads through Node HTTP. A failed transfer publishes no finished stage or
ledger reservation. Link/whitelist semantics were checked against the local
macOS `rsync(1)` manual; tests use a faithful transfer stub only. Actual installed
rsync compatibility on both Mac and server still needs an owner run. If either
endpoint lacks a compatible rsync, fetch fails closed; use a separately prepared
local handoff rather than substituting a link-following transport.

Relative local source paths resolve from WORK. The ledger defaults to this
repository's `chromium/android/release/ledger.json`. An optional `ledger` path
(also relative to WORK when not absolute) supports isolated fixtures; real
releases use the repository ledger. Version, tag and commit come from the
handoff's validated `build.json`, not editable command-line version options.

The handoff contains exactly these imported inputs:

- `ChromePublic.aab`: unsigned upload bundle, matching `build.json` hash/size.
- `build.json`: the full server build record, including the gates APK digest.
- `scan.json`, `sbom-inputs.json`, `license-inputs/`: the complete prepared
  offline licence handoff in [a7-attestation.md](a7-attestation.md).
- `release-gate.json`: the release-package emulator gate report.
- `privacy-capture.json`: the packet-capture review summary described below.

Symlinks and nonregular handoff files are refused. The raw capture and large
server logs stay on the server; retain them under the server evidence record.

### Track, rollout and notes

`config.json` also says where `upload` sends the build ([channels.md](channels.md)). Set these
before `fetch`: the stages bind the configuration's digest from then on, so changing them later
means a new `WORK`.

- `track`: `internal` (the default), `alpha`, `beta` or `production`. A beta name (`X.Y.Z-beta.K`)
  goes only to `internal`, `alpha` or `beta`; a stable name (`X.Y.Z`) only to `internal` or
  `production`.
- `rollout`: production only. A whole number from 1 to 99 (a staged rollout at that percentage), or
  `"complete"`.
- `notes`: a file inside `WORK` holding the owner-approved release notes, en-US, 1–500 characters.
  Required on every track but `internal`. Its digest is recorded with the upload.

## The six stages

Set `WORK` to that directory, then invoke each command separately:

```sh
node chromium/android/release/release.mjs status "$WORK"
node chromium/android/release/release.mjs fetch "$WORK"
node chromium/android/release/release.mjs verify "$WORK"
node chromium/android/release/release.mjs sign "$WORK"
node chromium/android/release/release.mjs attest "$WORK"
node chromium/android/release/release.mjs upload "$WORK"
```

1. **status** reads and validates recorded configuration/output digests and
   prints `state.json`'s public contents. It runs no external command. An unused
   workspace reports empty stages. Missing or changed recorded files fail.
2. **fetch** imports the prepared handoff locally or downloads it with `rsync`.
   It validates the full build record, AAB bytes/hash, next ledger code and
   locally available source commit before reserving a `built` ledger row.
   An existing matching `built` row can resume; `uploaded` and `abandoned` codes
   cannot be reused. An unfinished code below the highest uploaded code is also
   refused, even if its older row still says `built`. It preserves the offline
   SBOM filenames and bytes.
3. **verify** calls the shared AAB helper: `bundletool validate`, manifest
   checks for `me.bnfy.blanc`, version/code, nondebuggable release, arm64-only
   libraries and all required notices. It runs `bundletool build-apks` with
   `pixel-10-pro.json`, then `bundletool get-size total --apks=… --device-spec=…`.
   It records `pixel.apks`, the raw `MIN,MAX` CSV, positive integer byte range,
   and device-spec SHA-256 under `state.stages.verify.downloadSize`. The device
   pin is arm64-v8a, en/de/es/fr/it/pt-BR, density 480, SDK 36. Missing, ambiguous,
   human-readable or unsafe numeric size output fails closed.
4. **sign** launches `op run -- node … --worker sign WORK`. Only that child
   gets `BLANC_ANDROID_OP_RUN=1`. The shared signing helper reads the raw PKCS#12
   Document and alias/password fields inside the worker, signs to
   `Blanc-Android.aab`, verifies it strictly, checks the pinned upload certificate
   and removes temporary private-key files. The worker returns only the public
   certificate fingerprint. The current blank `upload-cert.json` intentionally
   blocks real signing until the owner supplies the independently checked pin.
5. **attest** invokes the existing Android attestation helper with the immutable
   source commit and copied licence inputs. Set the exact nonsecret signer pins
   `BLANC_COSIGN_IDENTITY` and `BLANC_COSIGN_OIDC_ISSUER` in this Terminal first.
   It writes `Blanc-Android.cdx.json`, `SHA256SUMS` (signed AAB, SBOM, build record)
   and `SHA256SUMS.sigstore.json`, verifying the signature against both pins.
   Identical completed public files can be reused; an invalid/partial signature
   is preserved and requires explicit reconciliation, as documented by Task 7.
6. **upload** revalidates the release/privacy evidence, ledger and all recorded
   inputs, then asks for `upload 1.0.0-beta.1 (1) to internal` for that example
   version. Other tracks ask for `upload 1.1.0-beta.1 (7) to beta`,
   `upload 1.1.0 (9) to production at 10%` or `upload 1.1.0 (9) to production, complete`. Any other response, including added spaces, stops without a Play
   request. After approval it rechecks inputs and runs an `op run` worker.
   The parent rejects an unfinished code below the highest uploaded code before
   asking for approval; the worker independently rechecks that condition before
   credential reads or Play requests.
   The worker reads the Play credential, exchanges the in-memory JWT for a
   token, and calls the Play adapter (`uploadToTrack`). No credential or token
   crosses the worker's stdout or a file. The adapter creates a fresh edit,
   uploads the signed AAB, updates only the planned track, and commits. On
   `internal` that is a **draft** release, as Play required until the app was
   first published, so the owner rolls it out to testers in Play Console. On
   `alpha` and `beta` it is a completed release with the notes, and on
   `production` it is a staged rollout or a completed release. Only after the
   commit resolves does the worker persist a public `upload-receipt.json`
   containing edit ID, version code, track and signed-AAB digest. The parent then
   marks the ledger `uploaded` and records the finished stage. Production needs
   the owner's Release to production right on the service account
   ([play-console.md](play-console.md)).
7. **Commit the ledger row.** The row is `uploaded` and its `published` list holds the upload
   (`{track, status, fraction?, date, editId}`). Commit `chromium/android/release/ledger.json` with the
   new `uploaded` row and merge it before tagging the next release: the server reads
   the ledger from the tag, so a tag without the row would be given the same version
   code again, and the Mac would refuse it only after the build.

The size command intentionally supplies no upload keystore and no unsupported
`--skip-apk-signing` flag. Bundletool uses an existing debug key if available,
otherwise an unsigned APK set. That APK set is size evidence only. The measured
range is a bundletool estimate for the pinned device, not an observed Play
download. Primary-source review established the command/CSV shape; compatibility
with the installed bundletool version and a real AAB still needs the owner run.

## Promotion and rollout

After `upload`, the same `WORK` moves the build on Play without uploading it again:

```sh
node chromium/android/release/release.mjs promote "$WORK" TRACK [PERCENT|complete] [--notes FILE]
node chromium/android/release/release.mjs rollout "$WORK" PERCENT|complete|halt [--notes FILE]
```

- `promote` puts the uploaded build on another track. For example, a beta that went to `internal`
  moves to `alpha`, or a stable build moves to `production` with a percentage or `complete`. It
  refuses a build below the one production users get, for every track but production.
- `rollout` changes a production rollout. A percentage must be above the current one (or equal, to
  resume a halt). `complete` finishes it, and `halt` stops it.
- Notes default to `config.json`'s `notes`. Play replaces a track's release whole, so a rollout
  change sends them again.
- Each asks for its exact phrase (`promote 1.1.0-beta.2 (9) to beta`, `roll out 1.1.0 (10) to 50%`,
  `complete rollout of 1.1.0 (10)`, `halt rollout of 1.1.0 (10)`), then runs an `op run` worker that
  reads the Play credential and commits one edit.
- It writes a public receipt (`promote-beta-1.json`, `rollout-production-2.json`, …) and appends to
  the ledger row's `published` list. Commit the ledger afterwards.

## Privacy evidence binding

Upload requires `release-gate.json` schema 1, `verdict: "pass"`, package
`me.bnfy.blanc`, `sourceCommit` equal to `build.json.commit`, and `apkSHA256`
equal to `build.json.gatesApk.sha256`. Exactly one result each for `outbound`
and `acceptance` must pass. Its `exclusions` must equal the approved exclusions
file read from that immutable source commit. `exclusionDiscovery: "pending"`
is informational; it neither creates approved exclusions nor waives evidence.

The Chromium NetLog gate does not observe Android OS or Play-services traffic.
The full privacy gate therefore also requires a reviewed packet capture, bound
to the same release gates APK/source. On the server, retain the raw capture and
write `privacy-capture.json` only after the actual OS/Play-services review:

```json
{
  "schema": 1,
  "verdict": "pass",
  "sourceCommit": "<build.json.commit: 40 lowercase hex>",
  "apkSHA256": "<build.json.gatesApk.sha256: 64 lowercase hex>",
  "captureSHA256": "<SHA-256 of retained raw packet-capture bytes>",
  "reason": "<nonempty account of the actual OS and Play-services review>"
}
```

This is the summary contract for the existing global privacy gate, not a new
permission flow. It attests to a human review; the Mac cannot independently
reanalyze a raw capture that remains on the server. Missing, failed or mismatched
summaries block upload. No actual capture result is supplied by this change.

## Resume and reconcile

Each completed stage records output hashes and the digest of its configuration
and preceding stage outputs. Repeating a finished stage validates those bytes
and returns status without rerunning signing, attestation or Play. Changed
configuration, device spec or recorded bytes refuse continuation. Preserve the
old folder and reconcile the difference instead of editing `state.json` to skip
a gate. Never run competing invocations against the same workspace or ledger.
The sign stage also binds the upload-certificate pin file's bytes, so a pin
rotation stops reuse. If a signed AAB exists without a recorded sign stage
(for example, the parent stopped after signing), another sign attempt refuses
and asks for reconciliation. Preserve and independently verify that artifact
against its unsigned input and certificate before deciding how to recover;
the script never silently overwrites or re-signs it.

A failed API attempt leaves the ledger `built`; the API helper deletes its known
edit where possible and a retry starts a fresh edit and asks for approval again.
If `upload-receipt.json` exists without a finished upload stage, the worker may
have committed before the parent could save the ledger/state. The script blocks
another request: check that public edit/code/digest against Play and reconcile
the ledger/state explicitly. Likewise, after termination or an uncertain commit
response, check Play before retrying; a local receipt cannot cover a process or
disk failure between Google's acknowledgement and writing the receipt.

## Task 9 rulings and remaining checks

- **Configuration is file-based, with an offline handoff or one CLI transport.**
  This gives `fetch` a concrete download/import path while preserving server
  isolation and keeping 1Password references out of the environment. If a host
  needs other transfer semantics, prepare the local handoff first; no generalized
  remote execution or tag-fetch framework is included.
- **Preserve remote symlinks with rsync's `--links`, then reject them.** A
  link-following transfer can copy a private capture before local validation
  ever sees the original link. The whitelist limits the transfer to handoff
  paths; preserving links lets validation stop before importing files or
  reserving a code. Cost: both endpoints need a compatible rsync, still
  unverified on a real handoff; missing/incompatible tools stop fetch rather
  than permitting a fallback that follows links.
- **Reserve a code only after verified artifact import.** This prevents an
  incomplete or mismatched handoff from consuming the next code. If a verified
  built attempt is later discarded, explicitly record it as abandoned; code
  numbers remain consumed, using the existing ledger rules.
- **Refuse unfinished codes below the highest uploaded code in both processes.**
  An older `built` row does not make its version code eligible after a newer
  upload. Cost: that unfinished workspace cannot continue; retain/reconcile it
  and create a new attempt under the normal ledger rules. Completed stages
  remain idempotent status and do not rerun Play.
- **Use the strict bundletool CSV range with a pinned device.** This preserves
  machine-readable evidence without pretending an unmeasured Play size is known.
  If the installed version emits a different format, verification stops until
  that version and its output are reviewed; the parser is not silently widened.
- **Bind the broader privacy review with a digest summary.** NetLog alone cannot
  establish the full privacy result. If the summary is incomplete or wrong, the
  release remains blocked or its evidence is invalid; retain/review the raw
  capture and correct the evidence before release.
- **A durable public upload receipt precedes the ledger transition.** This gives
  an owner a reconciliation anchor when a committed upload outlives its parent.
  It cannot make Google and local filesystem writes atomic; uncertain outcomes
  require inspection rather than another automatic upload.

Runtime assumptions still needing real evidence: owner Mac/foreground Terminal,
installed `op`, JDK signing tools, `unzip`/`zip`, rsync on both endpoints,
bundletool and Cosign versions;
raw 1Password Document/field setup; upload-certificate pin; complete immutable
source and offline licence inputs; server privacy/acceptance results; real size
output; signed AAB/Sigstore verification; Play permissions/commit and Pixel
installation. Fixture tests do not satisfy these acceptance gates.
