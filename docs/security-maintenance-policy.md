# Security maintenance policy

Last reviewed: September 13, 2026

This policy covers the Blanc desktop application, website, Workers, companion
extension sources, build tooling, and release pipeline in `bnfy/blanc`.

## Secrets and credentials

Project secrets belong in the service that consumes them or in the maintainer's
1Password vault. They must never be committed to the repository, copied into
issues or logs, placed in ordinary email, or exposed to a workflow that does
not need them. GitHub Actions secrets are granted only to the job that performs
the corresponding signing, deployment, or publication action. Workflows use
the smallest available `permissions` scopes and untrusted pull requests do not
receive release or deployment credentials.

Access is limited to the maintainer or narrowly scoped service principal named
in [governance](governance.md). Rotate a credential when its owner or scope
changes, when compromise is suspected, when a provider requires it, and before
its expiry. Revoke the old credential after the replacement is verified. An
incident involving a credential triggers immediate revocation, impact review,
replacement, and review of logs and dependent releases or deployments.

## Dependency and license analysis

Every pull request and push to `main` runs `npm run security:dependencies` over
all four committed npm lockfiles. A known high or critical dependency
vulnerability is a blocking violation. A package identified as malicious is a
blocking violation at any reported severity. `npm run compliance:check` is a
separate blocking check for missing, stale, or disallowed dependency-license
evidence in the shipped desktop and website inventories.

Fix a violation by updating, replacing, or removing the component. A finding
may be suppressed only after a maintainer documents why Blanc is not affected
in [the OpenVEX document](../security/openvex.json). The audit gate reads that
document directly, so an undocumented exception cannot pass. Low and moderate
findings are reviewed before release; a non-affecting finding is added to the
same VEX document. No release proceeds with an unresolved policy violation or
stale compliance artifacts.

## Static analysis

CodeQL with the `security-extended` query suite runs on every pull request,
every push to `main`, and weekly. Critical or high security findings are
violations unless a maintainer fixes them or records a GitHub dismissal with a
specific false-positive, test-only, or non-exploitable rationale. A completed
analysis is not evidence that the alert list is empty.

The CodeQL workflow is required by branch protection. Level 3 additionally
requires code-scanning merge protection to enforce the severity threshold;
until that rule is active and the existing alert inventory is triaged, Blanc
does not claim that every SAST violation blocks a merge.

## Review and release enforcement

Security findings are reviewed when detected and again before a release. The
maintainer records fixes or accepted non-exploitability evidence in the pull
request, VEX document, GitHub security alert, advisory, or release report as
appropriate. Exceptions must identify the finding, affected component or code,
reason, reviewer, and review date. Release verification remains governed by
[the release procedure](release-verification.md); supported-version and
security-update timelines are in [SECURITY.md](../SECURITY.md).
