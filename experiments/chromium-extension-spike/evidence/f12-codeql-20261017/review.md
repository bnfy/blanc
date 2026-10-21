# PR #920 CodeQL remediation — October 17, 2026

Original check: 117492078731 at aa26d71a, seven alerts (two high/five medium).
No alerts dismissed, query exclusions added, or suppression directives used.

- `scrub.cjs`: split prefix-only query checks and anywhere-in-name sensitive
  substring checks into distinct regexes. Preserve the intentionally stricter
  substring refusals; tests distinguish them from prefix matching.
- `prepare.mjs`: remove exists-then-read/write. The new helper reads through
  one descriptor with O_NOFOLLOW, rejects non-regular files, preserves unchanged
  inode/mtime, and publishes changed bytes through a same-directory private
  staging file and atomic rename. Tests cover unchanged files, creation/change,
  target symlinks and directories. Preparation remains single-writer work.
- `generate.mjs`, both alerts in `paths-fixtures.mjs`, and `bundle.mjs`:
  shared `scriptLiteral` JSON-encodes data then escapes HTML syntax and Unicode
  line separators. Quotes/backslashes stay JSON-escaped; decoded values are
  unchanged. Hostile script terminators cannot break out into HTML or execute.
  Raw engine modules remain byte-authenticated against the pinned ASAR; these
  are deliberately executable source, not purportedly sanitized data.
- `recorder.mjs`: isolate the controlled-origin fixture CA in a TLS secure
  context on the HTTPS agent, rather than including file bytes in the request
  options. The CA is trust configuration, never an outbound header/body. System
  trust remains the production default, hostname/certificate verification stays
  enabled, and public DNS pinning/private-address refusal are unchanged. Local
  network tests reject an unrelated CA, strip auth/cookies, and assert that
  upstream headers do not contain certificate PEM text. No live acquisition.

References used to assess the alerts:
- https://codeql.github.com/codeql-query-help/javascript/js-bad-code-sanitization/
- https://codeql.github.com/codeql-query-help/javascript/js-file-access-to-http/

GitHub's new-head CodeQL run, rather than local syntax/tests, determines whether
these findings are cleared. Until that result arrives, record CI as pending.
