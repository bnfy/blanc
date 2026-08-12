# Security Policy

## Supported versions

Security fixes are shipped through the newest published Blanc release. Older
releases are not maintained as separate support branches. Because Blanc embeds
Chromium, staying on the current Blanc release is part of its security model.

## Report a vulnerability

Email `support@blancbrowser.com` with **Security** in the subject. Please
include the affected Blanc version and platform, reproduction steps, impact,
and any proof-of-concept material that can be shared safely. If an attachment
contains sensitive material, describe it first and wait for a protected
transfer method instead of sending credentials, tokens, or private browsing
data in ordinary email.

Please do not open a public issue for an unpatched vulnerability or include
real credentials, private browsing data, or third-party personal data in a
report.

Our response targets are:

- acknowledgement within two business days;
- an initial severity and next-step assessment within five business days;
- for a confirmed, actively exploited critical issue, a mitigation target of
  24 hours and a safe-update target of 48 hours when technically feasible;
- for other confirmed high-severity issues, a safe-update target of seven days.

These are targets rather than guarantees: Chromium or platform dependencies,
coordinated disclosure, and safe update validation can change the timeline. We
will keep the reporter informed, coordinate disclosure, and credit them if
requested after affected users have a safe update.

## Scope and safe harbor

Good-faith research against Blanc itself, Blanc-owned workers, and
blancbrowser.com is welcome when it avoids privacy violations, service
disruption, persistence, social engineering, and access to data that is not
your own. Use test accounts and the minimum proof needed. Stop and report if
you encounter third-party data.

We will not pursue legal action or request law-enforcement investigation for
research that follows this policy, and we consider accidental, good-faith
violations promptly reported to us under this policy authorized for purposes
of applicable anti-circumvention and computer-access laws. This safe harbor
does not authorize testing third-party sites, services, accounts, or people.

## Release integrity

Official artifacts are published only through the
[Blanc GitHub releases](https://github.com/bnfy/blanc/releases). Each new
release is expected to include `SHA256SUMS`, a Sigstore bundle for that
manifest, a CycloneDX SBOM, and platform signature evidence. See
[docs/release-verification.md](docs/release-verification.md) for the exact
verification steps and the limits of each check.
