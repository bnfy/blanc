# Local Network Access: a gate and a prompt (desktop, Electron)

Status: approved by the owner on November 17, 2026, with the proposed answers to Q1 (main-frame navigations are not gated) and Q2 (cross-origin iframes are refused without a prompt).
Issue: [bnfy/blanc#1585](https://github.com/bnfy/blanc/issues/1585) (Okta Verify FastPass can't sign in).
Owner decision (November 17, 2026): Blanc blocks these connections itself and asks per site. A query-only fix and an allowlist were both declined.

## 1. What is wrong today

Okta FastPass works by having the Okta sign-in page talk to Okta Verify's service on `localhost`. Before it connects, the page asks `navigator.permissions.query()` for the Local Network Access permissions. Blanc's check handler (`src/main/permissions.js`) answers `false` for every permission that isn't in `AUTO_ALLOWED` or `PROMPTED`, so the page reads `denied`, shows "The browser is blocking communication with Okta Verify" and stops.

A probe on November 17, 2026 measured what Electron 45.2.1 (this repository's `node_modules`) actually does. The probe was a standalone Electron script with Blanc-shaped handlers, a page served from the Mac's LAN address, and a CORS-open server on `127.0.0.1`:

| Observation | Result |
| --- | --- |
| Permission names Chromium checks | `local-network-access`, `local-network`, `loopback-network`, through the check handler only |
| Does a LAN-address page's `fetch('http://127.0.0.1:…')` go through while the check handler answers `false`? | Yes, every time |
| Does the request handler ever run for these permissions? | No, not even with `--enable-features=LocalNetworkAccessChecks:LocalNetworkAccessChecksWarn/false` |
| Cross-origin iframe without `allow=` | Chromium never calls Blanc's check handler for it (Permissions Policy is applied first) |
| Permissions Policy names accepted in `allow=` | `local-network` and `loopback-network`; `local-network-access` logs "Unrecognized feature" |

So in shipping Blanc, **nothing guards a website's connections to this device or the local network**. Any page can probe `localhost` ports (the fingerprinting and tracking technique Chrome's Local Network Access was built to stop). Only pages polite enough to check the permission first are turned away, and FastPass is one of them. A prompt alone would change nothing, because no request ever reaches the request handler.

Caveat: the probe's page was served over plain `http://` from a private address, not over `https://` from a public one. The reporter's report and launch-flag test agree with the measurement: `--disable-features=LocalNetworkAccessChecks` changed nothing, and their build, which grants the check handler, signs in. The gate below makes the outcome independent of what Chromium enforces in any case.

## 2. What Blanc will do

1. **Gate.** Blanc decides every request from a public website to this device or the local network in its own request pipeline, before the request leaves the browser.
2. **Prompt.** The first time a site does this, Blanc shows its ordinary permission prompt. The answer is remembered for that site.
3. **Revocable.** Each decision appears in Settings → Privacy → Site permissions and can be removed there. Private tabs keep decisions in memory only, like every other permission.
4. **Truthful query.** `permissions.query()` for these names answers from the same decisions: `prompt` while undecided, `granted` or `denied` afterwards. Okta then connects, Blanc prompts, and FastPass signs in after **Allow**.

## 3. Which requests are gated

The pure module `src/main/local-network-access.js` (no `require('electron')`) owns the classification.

**Target address space**, read from the request URL's host. Name resolution isn't available before a request is sent, so the gate classifies by name:

- **Loopback** ("apps on this device"): `localhost`, any `*.localhost`, `127.0.0.0/8`, `[::1]`, `0.0.0.0`, and IPv4-mapped forms of those (`[::ffff:127.0.0.1]`).
- **Local** ("devices on your network"): `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `100.64.0.0/10`, `fc00::/7`, `fe80::/10`, IPv4-mapped forms of those, and names reserved for private networks: `*.local` (mDNS), `*.home.arpa` and `*.internal`.
- **Public**: everything else.

**Initiator address space**, read from the requesting frame's origin, the same way. A request is gated only when it moves inward: public → local, public → loopback, or local → loopback (Chrome's rule). Loopback → anything and local → local are never gated, so local development (`localhost:3000` calling `localhost:8080`) and router pages are unaffected.

**Request types**: every subresource (`xhr`, `fetch`, `script`, `image`, `media`, `webSocket`, `ping`, `other`, …) and `subFrame`. **Main-frame navigations are not gated**: a person following a link to their router, or typing `localhost:3000`, is choosing to go there. Requests with no initiator (started by Blanc itself), and initiators that aren't `http:`/`https:` (`blanc:`, `blanc-chrome:`, extensions such as uBO), are never gated.

**Known gap (accepted, documented):** a public *name* that resolves to a private address (an intranet name such as `printer.corp`, or a DNS-rebinding attack) is classified public and isn't gated. Chromium's own check uses the resolved address, which Blanc can't see before the request. Named intranet sites calling literal private addresses will prompt, which is safe.

## 4. Who is asked, and for what

**The decision belongs to the top-level site.** That's Chrome's model, and it's the site the person can see. The prompt names the tab's top-level origin.

- **Main frame** (initiator origin = top-level origin): prompt, keyed on the top-level origin.
- **Same-origin subframe**: treated as the main frame.
- **Cross-origin subframe**: denied without a prompt. Electron's request details don't expose the frame's Permissions Policy, so Blanc can't tell whether the embedder delegated `loopback-network`/`local-network`. Prompting would ask the person about a site they can't see. Revisit if a real sign-in flow needs it (open question Q2).
- **Opaque origin** (a sandboxed frame, a `data:` document): never prompted, since there is no origin to key a decision on. It takes its top-level page's address space, so a sandboxed preview on a `localhost` page still reaches that page's own services; a request that is still inward is refused.
- **Redirects**: Electron runs `onBeforeRequest` again for each redirect hop with the original initiator, so a public URL that redirects to `127.0.0.1` is gated at the hop. A probe on November 17, 2026 confirmed this: the cancelled hop never reached its target.
- **No frame** (a service worker, or a frame that has already navigated): no prompt is possible. An existing `allow` decision for the initiator's origin is honored; anything else is cancelled.

**Two scopes**, matching Chromium's split and the Okta error text ("Local network access" or "Apps on device"):

| Stored permission | Target space | Prompt (English) | Settings label |
| --- | --- | --- | --- |
| `loopback-network` | loopback | "{host} wants to connect to apps on this device" | Apps on this device |
| `local-network` | local | "{host} wants to connect to devices on your local network" | Devices on your local network |

Decisions use the existing `site-permissions.json` keys (`origin|loopback-network`, `origin|local-network`) through `permission-decisions.js`, so Settings' listing and **Remove** work unchanged once the two labels are added.

**One prompt per burst.** FastPass probes several `localhost` ports at once. Concurrent gated requests for the same (session, tab, origin, scope) wait on one pending prompt. While it's open, the requests are held (the coordinator's callback isn't answered). **Allow** releases them all; **Block**, a dismissed prompt, a closed tab or a parked (held) tab cancels them. Only a real Allow or Block is saved, as today (`prompter` resolving `null` saves nothing). A person who takes longer than the page's own timeout may need to retry after allowing. Chrome has the same behavior.

**Held tabs** (closed tabs parked for Reopen) are denied everything, as for other permissions (`heldRequester`).

## 5. Where the gate runs

`src/main/blocking-coordinator.js` owns the session's only `onBeforeRequest` listener. Its order becomes:

1. browser-wide veto (inert tabs), unchanged;
2. startup gate, unchanged;
3. **new: local-network policy** (`setLocalNetworkPolicy(session, fn)`), where `fn(details)` returns `null` (not gated) or a promise of `true`/`false`; `false` cancels;
4. the blocking provider (Blanc Blocker or uBO), unchanged.

The policy rejecting or throwing cancels the request (fail closed, like a provider exception). Running before the provider means a blocked tracker probing `localhost` is still refused by the gate even with ad blocking off.

`permissions.js` gains the session-bound pieces the gate needs (the same reader private sessions already get): `localNetworkDecision(session, origin, scope)` and `requestLocalNetwork({ session, webContents, origin, scope })`, which save decisions through the session's own store, so private tabs stay in memory.

## 6. Chromium's own permission calls

- **Check handler**: `loopback-network` and `local-network` answer `true` only for a stored `allow`; `local-network-access` answers `true` only when both are allowed. Any later Chromium enforcement then agrees with the gate.
- **Request handler**: if a future Electron sends these, a frame from another site is refused as in the gate; otherwise they go through the same prompt and store (`local-network-access` prompts with the broader local-network copy and saves both scopes). Today it never fires.
- **`permissions.query` shim** (its own session preload, `local-network-preload.js`, main frame only; the capture preloads are hash-pinned per platform in `capture-runtime-lock.json`, so the shim does not go there): extended to `loopback-network`, `local-network` and `local-network-access`, answering `granted`/`denied`/`prompt` from stored decisions. The legacy combined name reads `granted` only if both are granted, `denied` only if both are denied, and otherwise `prompt`. `prompt` never lets a request through on its own; the gate still decides. Live `change` events fire when a decision changes, as for camera and microphone.
- **Subframe queries** don't reach the shim and keep Chromium's answer from the check handler (undecided reads `denied`). This is the same limitation the camera shim documents.

## 7. Out of scope

- WebRTC to local addresses (the WebRTC IP-handling setting governs that).
- The Chromium fork (Blanc Beta): Chromium's own Local Network Access applies there, unchanged by this work.
- An enterprise-style allowlist (the reporter's commit `itsfrank/blanc@f0b55f3`). It can come later as a Settings option if people ask.

## 8. Risks

- **New prompts on sites that call local apps today**: Figma's font helper, Discord's desktop handoff, game launchers, printer and NAS pages, and fingerprinting scripts that scan `localhost` ports. Each prompts once per site, which matches Chrome 142 and later. Fingerprinting scans now get blocked if the person declines, and that is the point.
- **Held requests**: a prompt left unanswered holds those requests until it's answered or the tab closes. Bounded by the prompt's lifetime, and only gated requests are held.
- **Performance**: the classification is string and IP-literal parsing on every request, with no I/O. An ungated request takes the existing path with one function call added.

## 9. Tests

Unit (`node --test`):

- classification: every range above, IPv6 brackets, IPv4-mapped forms, trailing dots, `*.localhost`, `*.local`, ports, and invalid hosts (public);
- gating: inward-only rule, main frame not gated, non-http initiators, no initiator, cross-origin subframe denied without a prompt, frame-less request honoring only a stored allow;
- prompt dedupe: N concurrent requests produce one prompt; Allow releases all; Block cancels all and saves `deny`; `null` cancels and saves nothing; a tab closed or parked mid-prompt cancels and saves nothing;
- **private session**: decisions stay in the in-memory map and never touch `site-permissions.json` (extends `private-permissions.test.js`'s canary);
- check handler and query states for all three names, including the legacy combination;
- coordinator ordering: veto, then startup gate, then local-network policy, then provider; a rejecting policy cancels.

Desktop acceptance (Cucumber + Playwright, in `spec/acceptance/permissions-and-auth.feature`), with no test-only shortcut in shipping code: Chromium's `--host-resolver-rules="MAP lna-public.test 127.0.0.1"` gives the test page a public name while it's served locally, and a second local server stands in for "an app on this device":

1. a public page's `fetch` to `127.0.0.1` raises the prompt; Allow lets it through and `permissions.query({name:'loopback-network'})` reads `granted`;
2. Block cancels it and persists; removing the row in Settings brings the prompt back;
3. the same flow in a **private tab** leaves `site-permissions.json` untouched;
4. a **cross-origin iframe** (with and without `allow="loopback-network"`) is refused without a prompt; a same-origin iframe prompts for the top-level site;
5. a `localhost` page calling `localhost` is never prompted.

## 10. Copy and parity

- New English strings with every translation in the same PR (`de`, `es`, `fr`, `pt-BR`, `it`), acknowledged with `copy:ack`: two prompt strings and two Settings labels.
- `spec/features.md` F13 gains a Local Network Access bullet and acceptance line. No divergence entry yet: iOS and Android aren't affected until their engines expose the same capability.
- `CLAUDE.md`/`AGENTS.md` get one paragraph under the security posture once it merges.

## 11. Open questions for the owner

- **Q1. Main-frame navigations.** Not gated, as proposed (Chrome initially exempted them too). Should a *page-initiated* navigation (`location = 'http://192.168.1.1/…'`, as opposed to a person's click or typed address) be gated?
- **Q2. Cross-origin iframes.** Denied without a prompt, as proposed. Acceptable for now?
- **Q3. Reply to the reporter.** After this merges, credit their diagnosis and explain why Blanc chose the gate and a prompt over the allowlist.
