# Link routing: open links from other apps where they belong

**Date:** 2026-10-26
**Status:** decided (§11, owner, 2026-10-26). PRs 1 and 2 implemented (§10).
**Builds on:** the OS link handoff (`src/main/external-url-handoff.js`, `startup-urls.js`, the `open-url` and `second-instance` handlers in `main.js`), local profiles (`local-profile-model.js`, `local-profiles.js`, one profile per window), Blanc Spaces (`workspaces-model.js`, `workspace-controller.js`, each Space belongs to one profile) and Settings → Profiles.
**Reference:** Arc's *Air Traffic Control*. Arc's release notes introduce it on May 3, 2023 as a way to send links to the right Space by domain, set up under *Arc → Settings → Links → Air Traffic Control* ([Arc for macOS 2023 release notes](https://resources.arc.net/hc/en-us/articles/20498377604887-Arc-for-macOS-2023-Release-Notes)). Arc's sunset FAQ says its successor, Dia, has no equivalent and can't open sites in a chosen profile automatically ([Arc Sunset FAQ](https://resources.arc.net/hc/en-us/articles/44413577819159-Arc-Sunset-Frequently-Asked-Questions)). The finer details below, such as *contains* versus *is equal to* matching and the last-used Space as a destination, come from a third-party guide ([allthings.how](https://allthings.how/how-to-route-links-to-specific-arc-spaces-using-air-traffic-control-in-the-arc-browser/)), not from Arc. The request came from r/ArcBrowser on 2026-10-24, in the same post as Ctrl-Tab and Copy Link.

## 1. Problem

A link clicked in Slack, Mail or a terminal opens in whichever Blanc window was used last (`resolveExternalRuntime()`: the focused window, else the last focused, else any). Someone who keeps work and personal browsing in separate profiles, or separate Spaces, gets a work Jira link in their personal profile, where they aren't signed in. They then have to copy the address, find the right window and paste it. Arc users relied on Air Traffic Control for exactly this and lose it when they move on, because Dia doesn't have it.

## 2. The model in one paragraph

A short, ordered list of rules in Settings → Profiles: **"Links to *jira.example.com* open in *Work*"**. When another app hands Blanc a link, the first rule that matches decides the profile, and optionally the Space, that it opens in. A link no rule matches opens exactly as it does today. Rules apply only to links from outside Blanc. They are device-local, never synced, and never visible to websites.

## 3. Behavior contract

### 3.1 What is routed

- **Routed:** every web URL the OS hands Blanc. That covers macOS `open-url`, Windows and Linux command-line URLs at startup, and `second-instance` URLs. These are the URLs `webUrlsFromArgv` accepts (http and https only).
- **Not routed:**
  - local HTML files (`open-file`), which keep their own trust boundary;
  - tab handoff URLs (`queueTabHandoff`), which name their own destination;
  - links clicked inside Blanc (D3), unless the person turns on §3.7;
  - URLs typed into the Island.
- A multi-URL handoff (several URLs on one command line) routes each URL on its own. URLs going to the same window keep their order, and only the last URL of the whole handoff is selected and brought to the front, as `externalUrlActivationPlan` does today.

### 3.2 Rules

A rule is `{ id, match: { kind, value }, destination: { profileId, spaceId?, private? } }`.

| `kind` | Matches when | Example `value` |
|---|---|---|
| `domain` | the URL's host is `value` or ends in `.value` | `example.com` matches `example.com` and `jira.example.com`, not `notexample.com` |
| `contains` | the whole URL, lowercased, contains `value` lowercased | `/teams/design` |

- Hosts are compared in their ASCII (punycode) form and in lowercase. A leading `www.` in the rule is dropped (`www.example.com` → `example.com`), so typing what's in the address bar works.
- A `domain` value must parse as a host: no scheme, path, port or wildcards. Pasting a whole URL into the field keeps just its host, and the field says so.
- Rules are checked in order and the first match wins. The list can be reordered, holds at most 50 rules, and gives each value at most 200 characters.
- No regular expressions (§9).

### 3.3 Destinations

| Destination | Where the link opens |
|---|---|
| Profile *P* | a new tab in the most recently focused window of *P*. If *P* has no window open, a new window of *P*. |
| Profile *P*, Space *S* | a new tab in the window showing *S*. If *S* isn't showing in any window, *S* opens in a new window of *P* (D2) and the tab is added there. |
| …as a private tab (D5) | the same window, as a new private tab. |

- The window that receives the link comes to the front, as it does today (`bringExternalWindowToFront`, with the same reveal-intent cancellation if the user switches away while the window loads).
- A rule whose profile or Space has been deleted is kept, marked "Profile deleted" or "Space deleted" in Settings, and skipped, so the link falls through to the next rule. Deleting a profile removes the rules that point at it; deleting a Space only marks them, because Spaces have Undo (`undoRemoveNamedWorkspace`).
- A profile being deleted (`profile-deletions.json` marker) counts as deleted.
- If opening a Space is refused (the controller's guard, a failed restore), the link opens in a new window of the Space's profile instead. It is never dropped, and never opens in the wrong profile.

### 3.4 Unmatched links

They follow today's rule unchanged (D6): the window used last, in whatever profile it belongs to.

### 3.5 Settings

Settings → Profiles gets an **Open links from other apps** group, shown only when there are at least two profiles or at least one Space; with one profile and no Spaces there is nowhere to route to.

- Each row reads *Links to* [domain field] *open in* [profile ▾] [Space ▾, "Any window" first] [private ☐], plus a ⋮ menu with Move up, Move down and Delete.
- A **Add rule** button appends a row with its domain field focused.
- The `contains` kind sits behind the row's ⋮ (*Match addresses containing…*), because nearly every rule is a domain.
- A final, fixed row reads **Everything else: the window you used last**.
- Settings stores the list as `linkRoutes` in `settings.json`. It is device-local, like every profile and Space id it points at, and never in `SYNCED_KEYS`. It is written only by `settings.setLinkRoutes()`, which validates the whole list (§3.2), never through the generic `pages:settings:set`.

### 3.6 Making a rule from where you are

- The shield popover (the site's protection popover, which already holds site-scoped choices) gets **Open links to this site in this profile** when there are two or more profiles. It writes or replaces the `domain` rule for the current host, pointing at the current window's profile and Space. A second click removes it.
- `/route` in the Island does the same for the active tab. `/route off` removes the rule for its host.

These are conveniences; Settings stays the full editor.

### 3.7 Links opened in a new tab from a page (#1199, opt-in)

Settings → Profiles → Open links from other apps has a switch, **Also for links I open in a new tab** (`linkRoutesInApp`, off by default, device-local, never synced). With it on, a link opened in a new tab from a page follows the same rules, but only when all of these hold:

- **It is a new tab the person opened:** a `target=_blank` or modified click, a middle-click, or the page context menu's Open Link in New Tab (foreground or background). Electron reports no user-gesture bit, so Blanc stamps each WebContents with its last native mouse press or Enter/Space key press (input a page cannot synthesize; the same signal the OS-handoff prompt uses) and requires one within the last second. A page calling `window.open` on its own, a redirect, a subframe navigation or a same-tab click never routes.
- **It is not a popup:** a featureful `window.open` (disposition `new-window`) keeps its real window and its `window.opener`, which OAuth and payment flows need.
- **It is not from a private tab.**
- **The rule points somewhere else:** another profile, a Space this window isn't showing, or a private tab. A rule that points where the link already is changes nothing, so a tab a rule opened never routes its own links again (no loops).

The link then opens exactly like a link from another app (§3.3), through the same handoff (`openRouted`): a foreground open selects the tab and brings its window to the front; a background open adds the tab without raising anything. The window the link left reads out *Link rule: opened in {profile or Space}* for screen readers.

### 3.8 Matching by the app that sent a link (#1199, not feasible)

Rules can't name the sending app ("links from WhatsApp"). Electron's `open-url` and `second-instance` pass only the URL. On macOS the sender is in the Apple event (`keySenderPIDAttr`), which Electron doesn't expose, so it would need a native addon reading the current Apple event during `open-url`; Windows and Linux start Blanc through the default-browser registration or `xdg-open` and don't report the caller at all. It stays excluded (§9) until there's a cross-platform signal.

## 4. Interactions with existing features

- **Cold start.** A routed link that launches Blanc waits, as today, until session restore has chosen the startup windows (`externalUrlsFlushable`). It then routes, which may open a second window if the rule points at a profile the restore didn't open.
- **Tab handoff** (`queueTabHandoff`) goes first and is unchanged.
- **Default browser.** Nothing changes in registration; routing only acts on what arrives.
- **Private tabs.** A rule can open its link as a private tab (D5). An unmatched link never opens privately.
- **Profiles window menu, Spaces menu.** These are unchanged. A Space opened by a rule is an ordinary Space window afterwards.
- **Shared Spaces (F57).** A shared Space is a Space like any other here: a rule can point at it.
- **macOS quit-visibility gate, Quiet Tabs, Reopen Closed Tab.** These are unaffected: the routed tab is an ordinary new tab.

## 5. Data and code shape

- `src/main/link-routes.js` (pure, no Electron):
  - `normalizeLinkRoutes(raw)`, which validates and repairs the list (caps, drops malformed entries, keeps ids);
  - `normalizeDomain(input)` for the field;
  - `matchLinkRoute(routes, url, { isLiveProfile, isLiveSpace })`, which returns the first live match or null.
  Unit-tested against host edge cases: IDN, trailing dots, ports, userinfo, IP addresses (matched only exactly), `www.`.
- `src/main/main.js`:
  - `resolveExternalRuntime` gains an optional URL. With a match, it resolves to the destination's window, or opens one (profile window via `openNewWindow({ profileId })`; Space via the workspace controller's `open(..., { newWindow: true })`).
  - `createExternalUrlHandoff` passes each entry's URL to `getRuntime` and keeps the reveal intent per destination window.
  - Startup and `second-instance` handling share that path.
- `src/main/settings.js`: `linkRoutes` (default `[]`) and `setLinkRoutes()`. `settings-schema/schema.json` adds it to `internalDefaults`.
- Settings page:
  - the group in `settings.html` and `settings.js`;
  - its profile and Space options come from a new `pages:settings:link-targets` read, which returns `{ profiles: [{id, name}], spaces: [{id, name, profileId}] }`, names only;
  - writes go through `pages:settings:link-routes:set`.
  `browser-api/bridges.json` and `pages.js` host lists change together.
- Shield popover: one more row in `shieldPopover`, from `siteState()`. `/route` goes in `copy/slash-commands.json`.
- Copy: the group, its labels, the deleted-target notes, the popover row and the `/route` hints, in all six languages in the same PR.

## 6. Accessibility

- Each rule row is a `group` labelled by its own summary ("Links to jira.example.com open in Work").
- The ⋮ menu items have keyboard equivalents, and Move up/down announce the new position.
- The domain field reports invalid input with `aria-invalid` and a description, not colour alone.

## 7. Security and privacy

- **Only the user writes rules.** Rules come from Settings, the popover or `/route`, never from a page. `setLinkRoutes()` validates everything it stores, and the `pages:*` handlers re-verify the sender as usual.
- **Routing reads only the URL Blanc was already given.** It makes no request: no redirects are followed and nothing is resolved.
- **Private tabs stay private.** A link routed into a private tab is that profile's ordinary private tab, with no history and no session.
- **Nothing leaves the device.** Rules aren't synced. No telemetry records routing or the rules, beyond (optionally, later) a count of rules in the existing bounded settings ping, which would need its own review.
- **A crafted URL can't fool the domain match.** A `domain` rule compares the parsed host, so `https://work.example.com@evil.test/` matches `evil.test`, not `work.example.com`. Unit tests pin this.

## 8. Testing

- **Unit:** `link-routes.js`:
  - normalization, caps and ordering;
  - domain and contains matching, including userinfo, IDN, ports and trailing dots;
  - deleted targets falling through.
- **Unit:** the handoff, with a fake runtime registry:
  - a matched link goes to its profile's window;
  - a Space that's open is focused, and one that isn't opens in a new window;
  - a refused Space falls back to its profile;
  - an unmatched link is unchanged;
  - multi-URL ordering and the single reveal.
- **Desktop:** `test/desktop/external-links-smoke.mjs` already delivers links the way the OS does (`app.emit('open-url', …)` and `app.emit('second-instance', …)`). New cases there, plus F60 acceptance scenarios in `spec/acceptance`:
  - two profiles, a rule, a link from "another app" opening in the right profile;
  - the same with a Space that isn't open;
  - a deleted profile's rule falling through.
- **Manual, per platform:** links from a real app (Slack or Mail on macOS, the Windows default-browser handoff, `xdg-open` on Linux), cold and warm.

## 9. Deliberately excluded

- **Routing by source app** ("links from Slack"). Electron doesn't say which app sent an `open-url` or started a second instance, and the platforms disagree on whether it can be known at all.
- **Regular expressions and wildcards.** Domain and contains cover the cases people describe, and a regex field is easy to get subtly wrong for little gain.
- **Following redirects before matching** (a `t.co` or tracker link). That would make a network request before the user sees anything. Rules match the link as handed over.
- **Routing links clicked inside Blanc** (D3). The first version routed only links from outside; §3.7 (#1199) adds new-tab links, opt-in. Same-tab clicks still never route.
- **A Little Arc–style mini window** for unmatched links. That's a separate feature.
- **Mobile.** iOS hands links to the default browser with no profiles to route between yet. This is N/A until it has them (D-register entry).

## 10. Delivery

1. **PR 1:** `link-routes.js` and its tests, the setting, the handoff integration, the Settings group, copy in six languages, and the acceptance scenarios.
2. **PR 2:** the shield popover row and `/route`.

   **PR 1 is implemented** (2026-10-26). `src/main/link-routes.js` holds the rules (`normalizeLinkRoutes`, `validateLinkRoutes`, `normalizeDomain`, `matchLinkRoute`) and the window choice (`resolveRoutedRuntime`), all pure and unit-tested; `createExternalUrlHandoff` asks `routeFor(url)` once per URL when it first flushes, so a cold link sees the restored windows. `linkRoutes` is in `settings.js` (written only by `setLinkRoutes()`) and `internalDefaults`; Settings reads `pages:settings:link-targets` and writes `pages:settings:link-routes:set`. Covered by unit tests, `test/desktop/external-links-smoke.mjs` (profile, deleted profile, a Space that isn't open, a profile with no window) and `spec/acceptance/link-routing.feature` (F60-1–3). Where it differs from the text above:
   - A new window opened for a routed link holds just the link, not a Start Page tab beside it (§12's proposal), so it doesn't go through `openNewWindow({ profileId })`, which adds one; it creates the profile's window directly.
   - A Space that isn't showing opens through `workspaceController.open(..., { newWindow: true })` with a caller that carries only the profile and a lock id, because the profile may have no window open.
   - In a multi-URL handoff, a window that receives an earlier URL and takes focus by itself no longer cancels the final URL's reveal; only the user moving elsewhere does.
   - Settings saves only rows whose value is valid; a row still being typed stays on the page until it is. Because deleting a profile removes its rules, "Profile deleted" shows only while a deletion is still finishing.
   - `contains` compares against the URL exactly as it was handed over, lowercased.
   - The mobile D-register entry is D32 (`spec/divergence-register.md`).

   **PR 2 is implemented** (2026-10-26). The shield popover row and `/route [off]` share one main path, `chrome:route-active` (`toggle`, `on`, `off`), over the pure `siteRouteSwitchModel`, `setSiteLinkRoute` and `removeSiteLinkRoute` in `link-routes.js`; main confirms in the pill (`route-on`, `route-off`, `route-limit`, `route-unavailable`). Covered by unit tests and F60-4/F60-5. Choices the text above left open:
   - Neither is offered in a private tab: the rule would write that tab's host to `settings.json`, which private tabs never touch. `/route` there shows "Can't route this page".
   - A new rule goes first in the list, so a broader rule further down can't shadow it; replacing a rule keeps its place and id and clears its private flag. At 50 rules a new one is refused ("Rule limit reached").
   - The switch reads *…in this Space* when the window shows one, and its note names where a rule sends the site instead.
   - `/route` works with a single profile too (it can still point at a Space); only the popover row waits for two profiles, as §3.6 says.
3. Website and What's New only after the release that carries PR 1 (`docs/marketing-claims.md`). The claim is "routes links from other apps by domain to a profile or Space", not anything about understanding what the link is.

## 11. Decisions (owner, 2026-10-26)

The owner took the recommendation on all seven.

- **D1 — Destination.** A profile with an optional Space (§3.3), not profiles only. Spaces are what Arc users mean, and profiles are what keeps sign-ins apart.
- **D2 — A Space that isn't open.** It opens in a new window. The user's current window is never switched to it: that would rearrange a window they may be looking at, and the Space switch guard can refuse it for a busy page.
- **D3 — Links clicked inside Blanc.** These are left alone; only links from other apps are routed. Routing them would move a page between profiles mid-browse, along with the cookies it was opened with.
  *Revised 2026-10-28 (#1199, owner request):* an opt-in switch also routes links the person opens in a **new tab** from a page (§3.7). Same-tab navigation still never moves, so a page is never moved mid-browse; only a fresh tab opens elsewhere, with the destination profile's own cookies.
- **D4 — Matching.** Domain plus contains (§3.2). Contains covers "this one Notion workspace" or "this GitHub org".
- **D5 — Private destination.** "As a private tab" is offered in the first version.
- **D6 — Unmatched links.** These keep today's behavior, the window used last. A fixed-profile choice can come later.
- **D7 — Where it lives.** Settings → Profiles (§3.5).

## 12. Open questions

- Should a rule's Space dropdown offer "the Space you used last in that profile", as the third-party guide says Arc did? It's cheap if Spaces record last use; they currently record `updatedAt`, which is close but not the same.
- When a routed link opens a new window for a profile, should that window restore the profile's last session, or start with just the link? The proposal is just the link, as `openNewWindow` does now.

## 13. Obligations elsewhere

- `spec/features.md`: a new feature (F60, "Open links from other apps where they belong"), the parity matrix row, and a D-register entry for mobile.
- `CLAUDE.md`: a paragraph on `linkRoutes`, the handoff resolution and the device-local rule.
- `docs/press/release-notes/vX.Y.0.md` and the What's New page for the release that ships it.
