# Blanc governance and sensitive access

Last verified: September 13, 2026

Blanc is maintained by Bananify Creative. Anthony J. Loria
([`@bnfy`](https://github.com/bnfy)) is the sole human maintainer and the only
direct collaborator on `bnfy/blanc`.

## Roles and responsibilities

| Member | Role | Responsibilities |
| --- | --- | --- |
| Anthony J. Loria (`@bnfy`) | Project, release, and security maintainer | Product and architecture decisions; issue and pull-request review; repository administration; security-report triage and coordinated disclosure; dependency and Chromium updates; release approval, signing, publication, and verification; Blanc website and Worker operations; support contact. |

The maintainer has access to the sensitive project resources needed for those
responsibilities: GitHub repository administration, Actions secrets and
security advisories; Apple signing and notarization; Windows signing; Sigstore
release identity; Cloudflare DNS, Pages, Workers, and storage; release and
service credentials held in 1Password; the support mailbox; and the newsletter
delivery account. This lists access domains without publishing credential
values, tenant identifiers, recovery material, or infrastructure secrets.

GitHub Actions, Dependabot, Apple notarization, Azure Trusted Signing,
Cloudflare, Resend, and Sigstore act as non-human service principals with only
the permissions needed for their documented jobs. They are not project
members. Their credentials and workflow permissions are governed by the
release and deployment procedures in this repository.

## Decision and review model

The maintainer accepts changes through pull requests. Protected `main` requires
the configured tests, CodeQL analysis, an up-to-date branch, and resolved review
conversations; administrators are included. With one human maintainer, Blanc
does not claim independent human review. Automated or agent review may inform
the maintainer but does not replace owner responsibility.

Security-sensitive and platform-specific changes must include the evidence
required by [the release verification procedure](release-verification.md).
Public releases are immutable and require signed and notarized macOS artifacts,
timestamp-signed Windows artifacts, an authenticated checksum manifest, an
SBOM, provenance, and the documented platform checks.

Changes to membership or privileged access must update this file. Access is
also reviewed when a service credential rotates, a maintainer is added or
removed, or a security incident indicates that access may no longer be
appropriate.

Before granting a person merge access, repository administration, security
advisory access, signing authority, deployment authority, or access to project
secrets, the maintainer must verify the person's identity and sustained project
contributions, review their security conduct and need for the requested role,
and record the decision in a pull request that updates this file. Access starts
with the least privilege and shortest practical scope. Anonymous or newly
created identities do not receive sensitive access without independently
verified identity and contribution history. Service principals require the
same documented purpose, owner, minimum scopes, and revocation path.

Contributor requirements are in [CONTRIBUTING.md](../CONTRIBUTING.md), private
security reporting and disclosure responsibilities are in
[SECURITY.md](../SECURITY.md), and the live branch-control evidence is recorded
in [the project safeguards report](security-project-safeguards-2026-09-04.md).
