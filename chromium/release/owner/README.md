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
| `sparkle-key-make.command` | the update key into the Keychain (`BACKUP-PENDING` until backed up) |
| `sparkle-key-backup.command` | the 1Password backup on a Mac where 1Password works |
| `sparkle-key-airdrop.command` | the backup through another Mac: export, prove against the public key, AirDrop, save, delete |
| `sparkle-key-ceremony.command` | both halves at once |
| `signed-evidence.mjs` | the native-signature and Gatekeeper gate evidence from the notarized DMG |

For beta.3: copy the `beta2-*` scripts, change the version, the work folder
and the DMG name, and keep everything else.
