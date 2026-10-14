# Kagi and custom search engines

October 14, 2026. **Status: design, awaiting owner review.** Nothing here is
built yet.

## Why

A Reddit commenter liked Blanc's look and simplicity but couldn't stay
with it: Blanc offers only DuckDuckGo, Google, Bing and Brave Search, and
they use Kagi and SearXNG. Today there is no way to add another engine, so
anyone who has paid for Kagi or runs their own SearXNG server has to give
up their search engine to use Blanc. Chrome, Firefox and Vivaldi all let
you add one; Kagi's own setup guides cover each of them.

## Decisions (owner, October 14, 2026)

1. **Kagi plus a Custom option.** Kagi becomes a built-in choice. A new
   **Custom…** choice takes any search address with `%s` where the words
   go, which covers SearXNG, Startpage, Ecosia, Mojeek and the rest.
2. **The custom address syncs.** It travels with the engine choice through
   Profile Sync, like every other synced setting.
3. **Plain `http://` only for local addresses.** `https://` is accepted
   for any server. `http://` is accepted only for this computer or the home
   network, so searches never cross the internet unencrypted.

## What the user sees

**Settings → General → Search engine** lists DuckDuckGo, Google, Bing,
Brave Search, **Kagi**, **Custom…**, in that order.

Choosing **Custom…** shows one extra row underneath, built the same way as
the custom provider row under Encrypted DNS (`secureDnsCustomRow`):

- **Custom search address**, with the hint *"Paste the search address with
  %s where your search words go, for example
  https://searx.example.org/search?q=%s. It syncs with your other
  settings."*
- A text field with the placeholder `https://search.example.com/search?q=%s`.
- If the address is refused, the error *"That address isn't valid — your
  previous search engine is still in use."* The field keeps the rejected
  text so it can be corrected, just as Encrypted DNS does.

Until a valid address is saved, the previous engine stays in use. Switching
from Custom to another engine keeps the saved address, so switching back
restores it.

Every place that searches uses the chosen engine, Kagi or custom alike:
text typed in the address bar that isn't an address, Enter on the ⌘L search
row, and the page menu's **Search for "…"**.

The ⌘L search row's tag names the engine: "Kagi", or for a custom engine
the server's name taken from the address (`searx.example.org`,
`localhost:8888`). That name is data, not interface text, so it is never
translated.

**Live suggestions while typing:**

- **Kagi** gets them, from `https://kagi.com/api/autosuggest?q=…`. Checked
  on October 14, 2026: it answers without signing in and returns the same
  `[query, [suggestions]]` shape the other engines use. Kagi's own browser
  setup guides list this address as its suggestion service.
- **Custom** gets none in this version. Open tabs, Favorites and history
  still match as you type, and Enter searches the exact text. Nothing typed
  is sent anywhere before Enter.

## Kagi specifics

- Search address: `https://kagi.com/search?q=…`.
- Kagi needs an account. The first search in a fresh profile lands on
  Kagi's sign-in page; once the user signs in in a normal tab, Blanc keeps
  that sign-in like any other website.
- **Private tabs don't share that sign-in**, by design. A Kagi search
  from a private tab shows Kagi's sign-in page. The same is true of each
  local profile until the user signs in there. Kagi's documented
  workaround, its private session link
  (`https://kagi.com/search?token=…&q=%s`), works as a Custom address. That
  link contains a login token, and under decision 2 it syncs to the user's
  other devices inside the end-to-end encrypted settings.
- Suggestion requests to Kagi carry no cookies, as for every engine today,
  so Kagi can't tie what you type to your account before you press Enter.

## Rules for a custom address

A new pure module, `src/main/search-engine-template.js` (no
`require('electron')`, unit-tested like `tab-sleep.js`), owns these rules.
The main process and the Settings page's read-back both depend on it.

An address is accepted only if all of these hold:

1. After trimming, it is 1 to 2,048 characters.
2. It contains `%s` exactly once. This is the convention Chrome, Firefox,
   Vivaldi and Kagi's and SearXNG's own setup guides use, so users can paste
   what those guides give them. Only lowercase `%s` counts. Any other `%`
   sequences, such as `%20`, are left alone.
3. `%s` comes after the server name and port, in the path, query or fragment, so
   typed words can never become part of a server name and leak through a
   DNS lookup.
4. With `%s` replaced by a test word, it parses as a URL whose scheme is
   `https:`, or `http:` when the host is a local-network host.
5. It has no `user:password@` part.

"Local-network host" reuses `isLocalNetworkHost()` from
`src/main/site-security.js`, the same test certificate exceptions already
use: `localhost`, `*.localhost`, `127.0.0.0/8`, `::1`, `10/8`,
`172.16/12`, `192.168/16`, `169.254/16`, `100.64/10` (which includes
Tailscale), IPv6 unique-local and link-local addresses, single-label names
such as `searx`, and names ending in `.local`, `.lan`, `.internal` or
`.home.arpa`.

Searching replaces `%s` with `encodeURIComponent(query)`. The engine's
display name is the URL's host, plus its port when that isn't the scheme's
default, lowercased and without a leading `www.`.

## Settings model

- The `searchEngine` choices gain `kagi` and `custom`.
- A new key, `searchEngineTemplate` (string, default `""`), holds the
  custom address. It is stored raw, not URL-normalized, like
  `secureDnsTemplate`.
- **Write rule** (mirrors `reconcileSecureDnsWrite`): any write that would
  leave `custom` selected without a valid address has its engine and
  address part refused; the previous engine and address stay, and any
  other keys in the same write still apply. Editing the address while Custom is
  selected follows the same rule. Clearing the address while another
  engine is selected is allowed.
- **Read rule** (mirrors `coerceSecureDnsRead`): `custom` with a missing or
  invalid address reads back as `duckduckgo`. This covers a hand-edited
  `settings.json` and the sync race below, so a search never goes to a
  broken address.
- **One resolver.** `settings.currentSearchEngine()` returns
  `{ id, label, url(query) }` after the read rule; `searchUrlFor()` uses
  it. Today `main.js` works out the current engine separately for
  `tabs:search`, for `chrome:search-suggestions`, and again when a
  suggestion request finishes. All three use the resolver instead, so a
  new engine type can't be missed in one of them.

## Profile Sync

- `searchEngineTemplate` joins `SYNCED_KEYS`. When the user saves Custom
  with an address, both keys are written in one patch and carry the same
  clock, so other devices receive them together.
- If a device ever holds `custom` without an address it accepts (for
  example, received from a device whose address it rejects), the read rule
  shows DuckDuckGo there. It never searches against a broken address.
- **Older Blanc versions in the same sync set.** Blanc 1.33.1 and earlier
  don't know `kagi` or `custom`. They ignore the value, keep their own
  engine and move their sync clock forward, as the sync merge already does
  for any unknown value. **What the user will see:** with one device on an
  older Blanc that syncs before it updates, a newer device can switch back
  from Kagi or Custom to the older device's engine. The user picks Kagi
  again once both devices are updated, and after that it holds. Every new
  setting value already behaves this way; the cause is the shared
  equal-clock tie-break in `mergeFromSync`. Changing that rule affects
  every synced setting, so it belongs in its own reviewed change, not this
  one.
- Older versions also leave `searchEngineTemplate` out of what they
  upload. The next sync from a newer device puts it back. Nothing visible
  results except a short delay.
- The address can hold a Kagi token. It travels only inside the
  end-to-end encrypted settings, and is never included in telemetry, crash
  reports or logs.

## Privacy and security

- A custom engine is only ever a top-level `http(s)` navigation to an
  address the user typed, checked by the rules above. `javascript:`,
  `data:`, `file:` and `blanc:` addresses can't get in.
- No suggestion requests go to custom engines, so the Search suggestions
  hint ("Send eligible typed prefixes to your selected search provider…")
  stays true: for Custom it simply sends nothing.
- Kagi suggestions go through the existing guarded path in
  `search-suggestions.js`: no cookies, no redirects, size and time limits,
  private tabs excluded, and addresses, paths and secret-looking text never
  sent.
- Plain `http://` to a home server is readable by others on that local
  network. That is the user's own network and their choice; servers on the
  internet must use `https://`.

## What changes, and what must change together

| Area | Change |
|------|--------|
| `src/main/search-engine-template.js` (new) | Validation, URL building, display name |
| `src/main/settings.js` | `kagi` engine; `custom` handled through the template; `searchEngineTemplate` default, sanitize, write and read rules, `SYNCED_KEYS`; `currentSearchEngine()` |
| `src/main/search-suggestions.js` | `kagi` provider; `custom` has none |
| `src/main/main.js` | `tabs:search` and `chrome:search-suggestions` use the resolver |
| `src/main/pages.js` | Settings receives the engine list including `kagi` and `custom` |
| `src/main/test-hook.js` | `setSearchEngineTemplate()` beside `setSearchEngine()` |
| `src/renderer/pages/settings.html`, `settings.js` | Custom option and row, with the Encrypted DNS read-back and error pattern |
| `copy/messages/*.json` | New strings in English and in German, Spanish, French, Brazilian Portuguese and Italian in the same PR (F44 rule); `copy:ack`, `copy:build` |
| `settings-schema/schema.json` | `kagi` and `custom` choices, `searchEngineTemplate` setting; `settings:build` regenerates the mobile code |
| `browser-api/contract.json` | `SearchEngineId` gains `'kagi' \| 'custom'`; `browser-api:build` |
| `spec/features.md`, `spec/parity-matrix.md` | F5 engine list and settings table; mobile marked planned for both |
| `spec/acceptance/navigation-and-context-menu.feature` | Kagi in the engine table, plus the custom scenarios below |

## Tests

**Unit**

- The address rules: one table of accepted and refused examples covering
  every rule, including `%s` in the host, two `%s`, `http://` to a public
  host versus `localhost`, `192.168.1.5`, `100.101.102.103` and `searx`,
  `user:pass@`, `javascript:`, a 2,049-character address, and a `%20`
  elsewhere in the address.
- Settings write and read rules: refusing `custom` without an address,
  keeping the address after switching away, reading a bad `custom` back
  as DuckDuckGo.
- Sync: both keys arrive together; `custom` arriving without an address
  reads as DuckDuckGo; an older device's ignored value doesn't break the
  newer one.
- Suggestions: the Kagi request address; no request for Custom.

**Acceptance (desktop)**

- Searching with Kagi goes to `kagi.com/search?q=…`.
- A custom SearXNG address is used for the address bar and for **Search
  for "…"**.
- A public `http://` address is refused and the previous engine is kept.
- A `http://localhost:8888/search?q=%s` address is accepted.
- With Custom selected, typing makes no suggestion request.

**Manual, before release**

- In a packaged build, sign in to Kagi in a normal tab and check that
  searches show results, and that a private tab shows Kagi's sign-in page.
  This needs a Kagi account. If the owner doesn't have one, the check stops
  at "Kagi's sign-in page loads and accepts input", and the release notes
  say only what was verified.
- Point Custom at a real SearXNG server and search.

## Website and marketing

Not part of this change. Under `docs/marketing-claims.md`, the website,
claims ledgers and any reply on the Reddit thread may mention Kagi or
custom engines only after a public release includes them, in a separate
website-only PR.

## Out of scope

- Suggestions for custom engines. That would need a second "suggestions
  address" field, and a SearXNG server only answers if its operator has
  turned autocomplete on. Revisit if users ask.
- Several saved custom engines, or keyword shortcuts like Chrome's site
  search. Kagi's own `!bang` shortcuts already work inside Kagi.
- Importing search engines from Chrome or Arc, and OpenSearch
  auto-discovery.
- Changing the sync tie-break rule.
- The iOS and Android apps.
