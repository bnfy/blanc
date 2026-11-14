# Owner wrappers for a Blanc Beta release

These are the one-command scripts the owner ran from Terminal for Blanc Beta
2.0.0-beta.2 on November 14, 2026, kept as the record of how the release ran
and as templates for the next beta. They lived in `~/Projects/Blanc/scripts/`
on the Mac Studio, where the Chromium build, the release work folder
(`~/Projects/Blanc/records/beta2-work`) and the evidence
(`~/Projects/Blanc/evidence/foundation/beta2-signed`) also are.

Each one runs `chromium/release/release.mjs` stages (or a key or evidence step)
from the owner's foreground Terminal and writes a status file of step names
only, which Claude watches. None prints, logs or keeps a secret.
`docs/chromium-beta-release.md`, "Runbook for the next beta: lessons from
beta.2", says when to use each one and what went wrong the first time.

| Script | What it does |
| --- | --- |
| `beta2-sign.command` | `preflight`, `sign` |
| `beta2-notarize.command` | `notarize-app`, `dmg`, `notarize-dmg`, taking the Apple ID and app-specific password by hidden input (1Password won't stay unlocked on the Mac Studio) |
| `beta2-sparkle.command` | `sparkle` (answer the Keychain prompt with Allow) |
| `beta2-draft.command` | `manifest`, `draft` (typed confirmation; pushes the tag, private draft) |
| `beta2-publish.command` | `sigstore`, `publish`, `verify-public`, with the checksum-verified cosign copy |
| `beta2-owner-checks.command` | installs the notarized app, then the Touch ID passkey and production Sync checks, recording yes/no answers as evidence |
| `beta2-sync-check.command` | the Sync part alone |
| `beta3-*.command` | the same stages for beta.3, run over SSH from the MacBook Pro (below) |
| `sparkle-key-make.command` | the update key into the Keychain (`BACKUP-PENDING` until backed up) |
| `sparkle-key-backup.command` | the 1Password backup on a Mac where 1Password works |
| `sparkle-key-airdrop.command` | the backup through another Mac: export, prove against the public key, AirDrop, save, delete |
| `sparkle-key-ceremony.command` | both halves at once |
| `signed-evidence.mjs` | the native-signature and Gatekeeper gate evidence from the notarized DMG |

## Beta.3: run from the MacBook Pro (2026-11-14)

For 2.0.0-beta.3 the owner never touched the Mac Studio. The `beta3-*` scripts
here are the Mac Studio half, copied from `beta2-*` with the version, work
folder (`beta3-work`) and DMG name changed, plus three additions:
`beta3-notarize` and `beta3-sparkle` take their secrets from the SSH
environment (`LC_BLANC_APPLE_ID`/`LC_BLANC_APPLE_PW`, `LC_BLANC_SPARKLE_KEY`)
when the MacBook Pro sends them, and skip a stage already done; `beta3-draft`
and `beta3-publish` put Homebrew on the search path, because SSH has only the
system folders and `gh` lives there. The MacBook Pro half is
`remote/beta3-*.command`: each signs in to 1Password there, reads what its
stage needs, and runs the matching script here over `ssh -t`, unlocking the
Mac Studio's login keychain first where signing or `gh` needs it. The
owner's hands-on checks (`remote/beta3-5-owner-checks.command`) run on the
MacBook Pro against a hash-checked copy of the DMG. `docs/chromium-beta-release.md`
records how beta.3 ran.

For beta.4: copy both halves, change the version, the work folder and the
DMG name, and keep everything else.

## Beta.4 (2026-11-14)

`beta4-*` and `remote/beta4-*` are beta.3's with the version, build, work
folder and DMG name changed. `remote/beta4-5-owner-checks.command` also asks
about what beta.4 fixes: 1Password's in-page Unlock button (patch 0081,
recorded as `extension-popup.json`, not a release gate), the iPhone listing
the Mac's open tabs, and Sync after every window has closed. Its EXIT trap
now keeps the window open too (beta.3's second trap replaced the first).
