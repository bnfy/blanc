# sprintf-js build-tooling reachability review

Reviewer: Claude (Claude Code), with the owner's approval to record this
exception on October 6, 2026. Reviewed source: `main` at
`6974fbc0` (after #603 patched the same day's sharp and shell-quote
advisories, leaving this one open).

[GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)
affects sprintf-js through 1.1.3. A format string whose precision specifier
exceeds ECMAScript's limits makes `toFixed`/`toExponential`/`toPrecision`
throw, aborting the calling operation. Exploitation requires an attacker to
control the format string. The advisory lists no patched version as of this
review. npm audit reports it under the desktop electron-builder chain, whose
packages it rates high only because the reviewed GHSA-ch52-4w7c-c8xp
(`2026-10-03-http-cache-semantics.md`) sits on the same chain; the audit gate
rejects a package unless every advisory under it is accounted for.

The finding is non-affecting for Blanc's reviewed commands and payloads. This
is recorded in `security/openvex.json`. The dependency audit, severity
threshold, and required GitHub check remain in force.

## Dependency evidence

Desktop (`package-lock.json`), every entry `dev: true`, sprintf-js `optional`:

```
electron-builder 26.15.3 -> app-builder-lib 26.15.3
  -> @electron/get 3.1.0 -> global-agent 3.0.0 (optional)
  -> roarr 2.15.4 -> sprintf-js 1.1.3
```

`npm ls sprintf-js --omit=dev` is empty, and the desktop `build.files`
allowlist ships no build tooling in `app.asar`. The website, tab-import Worker
and companion lockfiles contain no sprintf-js.

## Execution evidence

- @electron/get 3.1.0 `dist/index.js` calls `initializeProxy()`, the only path
  that loads global-agent, solely when `process.env.ELECTRON_GET_USE_PROXY` is
  set. No script, workflow, `package.json` field or build file in the
  repository sets it or `GLOBAL_AGENT_*`; app-builder-lib 26.15.3 never loads
  global-agent itself.
- roarr 2.15.4 `dist/factories/createLogger.js` passes a log call's message
  argument to `sprintf`. Every global-agent 3.0.0 log call uses a constant
  literal message (for example `'connecting'`, `'request error'`); request
  URLs, headers and errors travel only in the structured context object,
  which roarr serializes without formatting.

So even with a proxy enabled, no input reaches the precision specifier.

## Re-review conditions

`test/unit/dependency-vex.test.js` fails and requires re-review if:

- the desktop chain changes version, gains another consumer, or stops being
  development-only;
- sprintf-js appears in the website, Worker or companion lockfiles;
- any repository script, workflow or `package.json` sets
  `ELECTRON_GET_USE_PROXY` or `GLOBAL_AGENT_*`.
