# Project safeguards — September 4, 2026

## Live repository settings

Main-branch protection was enabled and read back from the GitHub API on
September 4. It requires pull requests, resolution of conversations, and an
up-to-date branch with successful GitHub Actions checks:

- `substrate` (includes unit and compliance checks)
- `acceptance-wiring`
- `oauth-compatibility`
- `javascript` (CodeQL)

Each check is bound to the GitHub Actions app (ID 15368). Administrators are
subject to the rule. Force pushes and deletion are disabled. Tag creation is
outside this branch rule. There were no pre-existing branch protections or
rulesets to replace.

The repository currently has one human collaborator, owner `bnfy`. The PR
approval count is therefore zero; this requires a PR and CI without making
merges impossible for the sole maintainer. This is **not independent review**.
Add a qualified collaborator before requiring an independent approval. Never
claim that AI review or these branch settings provide human review.

GitHub's account-security UI showed that MFA is enabled and required for
`bnfy`. The REST API's account field returned null, which was not treated as
proof either way. The UI verification did not expose recovery codes or change
authentication settings. Recheck access and MFA requirements before adding a
collaborator; grant only the repository role necessary for their work.

## Release compatibility

`scripts/release.sh` checks that the source equals `origin/main`, then pushes
the new release tag. It does not push commits to main. Prepare the release
commit in a PR, satisfy CI, merge it, and run the existing release protocol
from that exact main commit. Post-release evidence/changelog commits must
also go through PRs before updating the clean deployment checkout. A direct
push to main is no longer an available shortcut, including for administrators.

The protection does not authorize a merge during the launch freeze, release
publication, or an exception to platform/signing/updater gates. The existing
release-operator instructions and immutable-release rules continue to apply.

## Candidate repository changes

`CONTRIBUTING.md` now describes public contributions, private security reports,
setup, relevant checks, review expectations, release boundaries, and licensing.
The README links to it and a new release-backed `docs/user-guide.md`.
`docs/user-guide-evidence.md` records the release sources and qualifications.
`docs/repository-inventory.md` maps the codebases in this repository and explains
the checked-in binary assets. The inventory does not assert ownership of every
external codebase or settle the blocker seed's generated-executable classification.

CodeQL and native release workflows now default to `contents: read`. CodeQL
grants `security-events: write` only to its analysis job. The two native jobs
explicitly retain `contents: write`, `id-token: write`, and `attestations: write`
for release uploads and provenance. Existing jobs retain exactly the same
effective permissions; future jobs no longer inherit write access by default.

This is limited permission scoping, not a separation of build and publishing
trust. The native jobs still combine build/sign/upload steps, including in
validation mode. Splitting privileged publication into separate jobs is
follow-up work requiring native validation; no stronger isolation claim is made.

## Validation and evidence

- Parsed both modified workflows and compared their complete structures to
  the baseline: only permission placement changed; existing job grants,
  steps, inputs, conditions, and pinned actions remained identical.
- Targeted release-manifest, Windows updater packaging, native-media packaging,
  and public-claim regression tests passed (see PR checks for hosted results).
- `git diff --check` passed.
- Branch settings were independently read back after the update; an actual
  destructive push/delete probe was not attempted.

Settings reference: [main protection](https://api.github.com/repos/bnfy/blanc/branches/main/protection).
GitHub documentation: [workflow permission scope](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions)
and [protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

The contribution and workflow changes remain a draft candidate until merged.
Live branch protection and verified account MFA may be recorded in the OpenSSF
assessment now; contribution documentation should not be marked satisfied on
the public main branch before the candidate lands.
