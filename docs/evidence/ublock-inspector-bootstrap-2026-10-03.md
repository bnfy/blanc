# uBO DOM inspector reconnect: cosmetic bootstrap readiness

Status: reproduced before the fix and passed afterward locally; final native
platform, installed-candidate and Linux stress runs are pending at runtime
`95fbdfbee94505224c455c40c73509f572616374`.

## Failure and deterministic reproduction

The Mac arm64 job in [run 37167813080](https://github.com/bnfy/blanc/actions/runs/37167813080)
(source `1fc4167ce2383873c8638961a40a353a07052378`) passed the initial original
DOM inspector, then timed out waiting for it to reconnect after navigating.
uBO remained ready and the browser did not crash.

The original Logger reinjects its inspector shortly after DOMContentLoaded.
The original content-script bootstrap awaits `retrieveContentScriptParameters`,
which can await procedural-helper injection before initializing `domFilterer`.
The inspector silently returns if that filterer is not yet present. These two
asynchronous paths can race.

The fresh-profile test delays only the return of the original
`/js/contentscript-extra.js` injection for the fixture's current tab by one
second, after calling the original implementation. This exercises a real slow
bootstrap response; it does not replace the filtering engine, spoof an
inspector, grant permissions or change the blocking deadline.

With the pre-fix production adaptation, the test reproduced:

```text
Error: timed out waiting for DOM inspector after navigation; last: undefined
```

## Targeted fix and verification

Commit `95fbdfbee94505224c455c40c73509f572616374` makes the existing
`vAPI.bootstrap()` return and retain its original initialization promise as
`vAPI.blancBootstrapReady`. The inspector awaits that promise before applying
its existing filterer guard. No extra background operation, polling transport
or permission was added. The original guard still refuses inspection when
cosmetic filtering is disabled. Sender, profile, document and single-use
capability validation are unchanged.

With the same forced delay, the inspector reconnected and populated its
original tree. The complete real-blocking suite then passed, including original
picker/zapper, logger, backup/restore, CSP, scriptlets, dynamic rules, nested
frames, POST protection, quiet/held tabs, private isolation, named-profile
storage deletion, deadline/crash recovery, offline persistence and sandboxed
views. Its sanitized console output included:

```text
DOM inspector reconnected after delayed native cosmetic bootstrap: 2
uBO desktop passed: original tools and backup/restore, blocking/redirects/CSP/scriptlets/dynamic rules, nested frames, POST protection, quiet/held tabs, private isolation, deadlines/crash recovery, sandboxed views.
```

Two original helper injections occurred in that run; the test requires at least
one rather than assuming exactly one. It restores the original injection method
after this check.

All 21 focused package/security unit tests passed. The actual adapted-code unit
checks prove that inspection waits while initialization is pending, resumes
only after the original response handler, still refuses absent/disabled
cosmetics, and uses exactly one original bootstrap message. Lint and
`ublock:check` passed: 658 pinned files/source records and 77 reproducible
adaptation files. Upstream originals remain byte-exact. Official Electron
44.5.1, uBO 1.75.0 and renderer sandboxing are retained.

Native verification runs for this runtime are
[all four desktop platforms](https://github.com/bnfy/blanc/actions/runs/37168547420),
[signed Windows/Linux installed candidates and Ubuntu sandbox checks](https://github.com/bnfy/blanc/actions/runs/37168565413),
and [three fresh native Linux 30-restore stress suites](https://github.com/bnfy/blanc/actions/runs/37168566895).
Their pending status here is not a passing claim; completed results belong in
the release incident before publication.

[Sanitized machine-readable record](ublock-inspector-bootstrap-2026-10-03.json).
No personal data, browser URLs, headers, filter contents or secrets are included.
