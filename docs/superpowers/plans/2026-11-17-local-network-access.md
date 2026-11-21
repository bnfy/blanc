# Local Network Access gate: implementation plan

Spec: `docs/superpowers/specs/2026-11-17-local-network-access-design.md` (approved by the owner on November 17, 2026, with the proposed answers to Q1 and Q2: main-frame navigations are not gated, and cross-origin iframes are refused without a prompt).

Executed inline, test-first, on branch `claude/okta-fastpass-local-network-5f4b22`.

## Deviation from the spec, decided while planning

The spec put the `permissions.query` shim in `capture-preload.js`. That file and its Linux and macOS variants are hash-pinned per platform in `src/main/capture-runtime-lock.json`, and changing a pin needs fresh capture evidence for every platform. The shim therefore goes in its own session preload, `src/main/local-network-preload.js`. It wraps whatever `navigator.permissions.query` exists (the capture shim's patch included) and handles only the three Local Network Access names. Main answers it over `local-network:permission-query`, a new channel, from the sender's main frame only. The spec is amended to match.

## Tasks

1. **Classification** (`src/main/local-network-access.js`, pure): `addressSpaceOfHost(host)` returns `loopback` | `local` | `public`; `gatedScope(initiatorSpace, targetSpace)` returns `loopback-network` | `local-network` | `null`; `classifyRequest(details, frameInfo)` returns `{ scope, origin, mode }` or `null`, where `mode` is `prompt`, `stored-only` or `deny`. Tests: `test/unit/local-network-access.test.js`.
2. **Policy** (`src/main/permissions.js`): add the two scopes and the legacy name to the check and request handlers; add `localNetworkQueryState(session, url, name)` and `localNetworkPolicyFor(session)`. The policy keeps one pending prompt per (webContents, origin, scope) and saves decisions through the session's own store, so private sessions stay in memory. Tests: `test/unit/local-network-permissions.test.js`, including the private-session canary.
3. **Coordinator** (`src/main/blocking-coordinator.js`): `setLocalNetworkPolicy(session, fn)` runs after the veto and the startup gate and before the provider; a rejection cancels. Tests are added to `test/unit/blocking-coordinator.test.js`.
4. **Wiring** (`src/main/main.js`): install the policy next to every `setupPermissionPolicy` call (the default sessions and named profiles); register the preload; add the IPC handler; push live `change` events when a decision changes, including removal in Settings.
5. **Shim** (`src/main/local-network-preload.js`): main frame only, with a bounded `CustomEvent` bridge like the capture shim's; falls back to the original query if the bridge doesn't answer. Tests run it in `vm`.
6. **Copy**: two prompt strings and two Settings labels in `en` plus `de`, `es`, `fr`, `pt-BR` and `it`, then `copy:ack`, `copy:build`; `permission.js` and `settings.js` use them. `spec/features.md` F13 gets the bullet and acceptance line.
7. **Acceptance**: `spec/acceptance/permissions-and-auth.feature` scenarios with desktop steps, using `--host-resolver-rules` to give a local page a public name.
8. **Checks**: `npm run test:unit`, `npm run lint`, `npm run substrate:check`, `npm run browser-api:check`, and the new acceptance scenarios.
