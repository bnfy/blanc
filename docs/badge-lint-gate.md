# JavaScript warning gate

Run `npm ci` followed by `npm run lint` on Node.js 22.13 or later in the Node 22 line. The `substrate` job in the parity workflow runs the same command before unit tests. ESLint and its rule/global packages are exact-pinned development dependencies; the runtime dependency tree and runtime SBOM are unchanged.

The gate uses ESLint recommended correctness rules on first-party `src/**/*.js` and `cloudflare/**/src/**/*.js`. Warnings fail the command. It checks issues such as undefined identifiers, reassignment of constants, duplicate conditions/keys, invalid regular expressions and unsafe control flow. It does not cover Astro templates, native code, third-party dependencies or test fixtures, and does not replace CodeQL or platform tests.

## Reviewed configuration choices

Unused variables and useless assignments are excluded from this first correctness gate. Existing callback signatures, browser entrypoints, defensive initialization and explicit credential-reference clearing need separate dead-code analysis; they are not silently auto-fixed. Empty catch bodies are allowed because optional APIs and destroyed WebContents require best-effort fallback; empty non-catch blocks remain errors.

`preserve-caught-error` is off. Trust-boundary code (tab handoff, sync, the credential broker) deliberately rethrows a fixed, opaque error code and drops the original error. Attaching it as `cause` would carry network, decryption or payload detail across that boundary.

Browser globals are declared for renderers/preloads and the two modules that serialize browser functions for isolated execution. `overlay.js` also reads `WorkspaceUI`, which `workspace-ui.js` publishes on `window` and `overlay.html` loads first. The control-character-regex rule is disabled only for modules that handle untrusted input on purpose: the credential picker and newsletter Worker remove control characters from display text, the tab-import organizer strips them from imported titles, and the external-protocol classifier rejects any URL containing them before it can reach the OS.

## Review record

The first run (September 4, ESLint 10.10.0) produced 44 findings: 20 empty catches, 14 unused assignments, eight browser-global references and two control-removal regexes. None was a behavior defect, and no runtime code was changed.

The gate landed on September 19 with ESLint 10.11.0 against 168 later commits, which added six findings: three `preserve-caught-error` at the tab-handoff error boundaries (`src/main/main.js`, `src/main/tab-import-handoff.js`), two control-character regexes (`src/main/external-protocols.js`, `src/main/tab-import-organizer.js`) and one cross-script global (`WorkspaceUI` in `src/renderer/overlay.js`). Each was confirmed intentional and handled in configuration; again no runtime code changed.

Deliberate constant-reassignment, duplicate-else-if, undefined-name and duplicate-key probes, plus an undefined global in renderer code, are all rejected by the final configuration.

This does not claim maximally strict linting, complete code coverage or an earned badge. OpenSSF warnings criteria can cite this gate now that it is enforced on `main`.
