# First-day retention signals — design

Date: 2026-10-09
Status: approved in conversation, awaiting written-spec review

## Why

Retention is the current product focus. The collector already reports
next-day return per install day (`/stats` → `nextDayReturn`, live since
2026-10-03): of the people first seen on day D, how many launched again on
D+1 (UTC). The first five complete days ranged 11–18% (average 14%), so
about six in seven new installs never open Blanc a second day.

Today nothing says *why*. The app reports only launches, the first Mahjong
move and start-page layouts. It does not report whether someone made Blanc
their default browser, or whether they actually browsed with it. Those are
the two behaviours most likely to separate people who stay from people who
leave, and they decide which retention work is worth doing next.

This project adds exactly two install-day yes/no signals and joins them to
the existing next-day return figure on the server, so `/stats` can answer:
"of new installs that made Blanc the default on day one, what share came
back the next day — versus those that didn't?"

## Non-goals

- No product change to onboarding, default-browser prompting or the first
  new tab. This project only measures. Changes come after the split is
  readable.
- No other signals. The welcome-exit step and data-import signals were
  considered and deliberately left out (owner choice, 2026-10-09).
- No per-install record retained beyond two days, no addresses, no page
  counts, no new identifiers.
- No client-side "day one summary" sent on a later launch. That design only
  ever reports for people who returned, which biases exactly the comparison
  this project exists to make.
- No retroactive join over existing 90-day seen-markers (slow, expensive
  KV listing on every `/stats` read).

## Definitions

- **Install day:** the UTC day the collector first saw the install's hashed
  ID (`first:<hash>`), i.e. the same boundary `nextDayReturn` already uses
  (8 p.m.–8 p.m. US Eastern during daylight time). A signal counts only if
  it arrives on that day.
- **Signals:**
  - `day1_default` — Blanc is the system default browser.
  - `day1_browsed` — at least three completed top-level web page loads in
    regular (non-private) tabs.

## Part 1 — App (`src/main/`)

### Install time

`install.json` (the `JsonStore('install', …)` in `src/main/telemetry.js`)
gains `createdAt` (epoch ms) and two send flags, `day1Default` and
`day1Browsed` (both false). The fields are flat because `JsonStore` merges
its defaults shallowly.

- When `installId()` mints a new ID it also sets `createdAt = Date.now()` and
  clears both flags.
- An existing file that has an `id` but no `createdAt` gets
  `createdAt: 'legacy'` on first read and flushes it. Legacy installs never
  send either signal. This keeps every auto-updated install out of the data;
  only installs created on the shipping version contribute.
- `resetInstallId()` sets a fresh `createdAt` and clears both flags, matching
  how the collector already treats a reset as a brand-new install.

`createdAt` never leaves the device.

### Gate (shared by both signals)

A signal may be sent only when all hold:

1. Packaged build and `serviceAllowed` (same as existing events).
2. `settings.isFirstRunComplete()` and `usagePing` is on.
3. The launch report has been sent in this process (`launchPingSent`), so
   the collector has already recorded `first:<hash>` before the signal
   arrives.
4. `createdAt` is a number and `Date.now() - createdAt < 24 h`.
5. The matching send flag is still false.

The first check runs 2 minutes after the launch report, so the collector has
recorded the install before any signal arrives.

On send, set the flag and flush `install.json` before posting, so a crash or
restart can never resend. Fire-and-forget, no retry (same as every other
event).

The pure gate lives in `telemetry.js` (no `require('electron')` at module
load) so it is unit-testable like `productUsageAllowed`.

### Signal 1 — default browser

Reuse the existing status logic from `pages.js` (`defaultBrowserStatus()`:
`app.isDefaultProtocolClient('http')` on macOS/Linux; the real HTTP/HTTPS
`UserChoice` via `windows-default-browser.js` on Windows). Factor that
function out to a small module both `pages.js` and `main.js` import, rather
than duplicating it.

Checked:

- once after the launch report is sent;
- every 15 minutes while the gate's 24-hour window is open (one
  `setInterval`, cleared when the signal is sent or the window closes);
- immediately after `pages:default-browser:set` returns (the welcome's and
  Settings' **Make default** button).

The first `isDefault === true` sends `day1_default`.

### Signal 2 — real browsing

In `tab-view.js`, at the top-level `did-navigate` commit that already records
history (`historyEligible` and not wake-suppressed), for `http:`/`https:`
URLs only, increment a process-memory counter. That excludes private tabs,
responses of 400 or above, and quiet-tab wake reloads, and in-page
navigations never reach it. On reaching 3 (three web pages open), send
`day1_browsed` and stop counting.

- Subframes, `blanc://` pages, `blanc-chrome://` documents, private tabs,
  quiet-tab wake reloads (the existing `wakeGeneration` suppression) and
  failed loads do not count.
- The counter holds no URL and is never written to disk; a restart resets
  it. That under-counts someone who loads two pages, quits and loads two
  more. This is accepted to keep browsing facts off disk.

### Payload

`POST /event` with `commonPayload()` plus `event: 'day1_default'` or
`event: 'day1_browsed'`. Nothing else.

### Wiring

- `src/main/telemetry.js`: `sendDayOneSignal(name)`, the gate, install-store
  fields, reset behaviour.
- `src/main/main.js`: page-load counter, default-browser timer, calls into
  telemetry after the launch report.
- `src/main/tab-view.js`: main-frame load hook (reports into `main.js`; does
  not import telemetry).
- `src/main/pages.js`: use the extracted default-browser status; notify
  main after **Make default**.
- No renderer bridge, preload or `browser-api/bridges.json` change: both
  signals originate in the main process.

## Part 2 — Collector (`cloudflare/ping-worker/`)

### Eligible installs (the comparison group)

Not every new install can send the signals: older desktop builds,
community packages that lag behind, and cached installers cannot. Deriving
"didn't have the signal" from all new installs would therefore count them
as "didn't", and before the sending release ships every day would read as
"nobody set Blanc as default". So the collector keeps its own group:

- `DAY_ONE_SIGNALS_MIN_VERSION` (`1.31.0`) is the first sending version.
  Release prep updates it if that release ships under another number.
- When `handlePing`'s `markFirstSeen` counts a **new** install and the
  launch's `version` is at or above the minimum (a pre-release of the
  minimum counts), `markDayOneEligible` writes marker
  `d1sig:eligible:<day>:<hash>` (TTL 2 days) and bumps
  `d1had:eligible:<day>` (never expires).

### Intake

`handleUsageEvent` routes `event` ∈ {`day1_default`, `day1_browsed`} to a
new `handleDayOneSignal`, after the existing `validatedClientFields` check
and install-ID hashing. The event-name table is derived from
`DAY_ONE_SIGNALS`, and the lookup uses `Object.hasOwn` so names such as
`constructor` fall through to the normal rejection.

1. If there is no hashed ID (secret unset), return 204 and store nothing.
2. If there is no `d1sig:eligible:<today>:<hash>` marker, return 204 and
   store nothing. That single check means "first seen today, on a sending
   version", so a late, replayed or out-of-group signal is ignored, and the
   "had" count can never exceed the eligible count.
3. Marker key `d1sig:<signal>:<day>:<hash>`, TTL 2 days. If absent: bump
   `d1had:<signal>:<day>` (never expires), then put the marker
   (counter-before-marker, matching `markFirstSeen`'s documented ordering).
   If present, do nothing.
4. Return 204.

These events are **not** forwarded to Google Analytics and **not** recorded
in `productUsage` active-user metrics. They have their own handler, so
neither code path is reachable from it.

**Timing dependency.** KV can serve a cached "not found" for about 60
seconds at the edge location that read a key. The launch ping reads the
install's keys before writing the eligible marker, so a signal arriving at
that location within the minute could miss it and be dropped. The desktop
client therefore waits 2 minutes after its launch report (Part 1, Gate).
This is documented beside `markDayOneSignal` and in the README.

### Join

In `markNextDayReturn` (`src/first-seen.js`), after a return is counted for
`prevDay`, read `d1sig:<group>:<prevDay>:<hash>` for each of `eligible`,
`default` and `browsed`. For each present marker, bump
`d1ret:<group>:<prevDay>`. This costs three KV reads, and only for people
who return. `d1ret:*` counters never expire, like `return:d1:*`. These keys
avoid the `return:d1:` prefix because `/stats` reads that whole prefix as
day → count.

### `/stats`

`DAY_ONE_SIGNALS_FIRST_COHORT` is the UTC day after the collector deploy.
For each shown `nextDayReturn.byDay[D]` with
`D >= DAY_ONE_SIGNALS_FIRST_COHORT`, add:

```json
"signals": {
  "eligible": {"installs": 90, "returnedNextDay": 14},
  "default": {"had": 22, "returnedNextDay": 9},
  "browsed": {"had": 70, "returnedNextDay": 13}
}
```

- The counters are read with direct `get`s for exactly the shown cohort days
  (3 groups × 2 counters × at most 30 days), never by listing the
  never-expiring `d1had:`/`d1ret:` families, so the cost of `/stats` stays
  bounded however long the history grows.
- Missing counters read as 0 from the first cohort onward. Days before it
  carry no `signals` key (absent, not zero), the same rule `nextDayReturn`
  already applies.
- Until the sending release ships, `eligible.installs` is 0, which makes the
  empty split self-explanatory.
- The "didn't have the signal" figures are derived from the eligible group,
  never from `newInstalls`: `eligible.installs - had` and
  `eligible.returnedNextDay - signals.x.returnedNextDay`.

### The historic `mahjong` layout stays

The collector keeps accepting and reporting the `mahjong` start-page layout.
Current builds never send it, but versions before 1.20.0 offered Mahjong as a
layout and are still in use, and `/stats` holds its 61-event history. A code
comment and the README say why it is there.

### README and agent docs

`cloudflare/ping-worker/README.md` documents the two events, the eligible
group, the first-seen-today rule, the 2-day markers, the join, the timing
dependency and the new `/stats` fields. The telemetry paragraph in
`CLAUDE.md` and `AGENTS.md` is updated in the collector change too, so it
is true from the moment the collector deploys; it says no released build
sends the signals yet, and the app change updates that clause.

## Part 3 — Public copy

The privacy page must be accurate the moment the shipping release is
public. Only installs created on that version send these events, so the
exposure starts at publication. The copy merges in the app PR and goes live
in that release's normal post-publication site deploy, worded "Blanc X.Y and
later" so it is never wrong about older versions.

### `site/src/pages/privacy.astro` (Usage measurement)

Add after the feature-use paragraph:

> In Blanc X.Y and later, on the day Blanc is installed it may also send
> each of two first-day events once per installation: `day1_default` if
> Blanc is your default browser, and `day1_browsed` after three web pages
> open in regular tabs. They carry the same launch fields and
> nothing else. No address, page, or count is sent, and private tabs and
> Blanc's own pages are never counted. Blanc keeps the installation time in
> `install.json` on your device so it knows when the first day ends; that
> time is never sent. The collector keeps a per-installation record of these
> events for about two days, only to count how many new installations return
> the next day, then keeps only daily totals. These events are not sent to
> the Google Analytics mirror.

Edits to existing sentences:

- "No usage event contains …" adds "browsing count".
- The Google Analytics sentence becomes scoped to "the launch and
  feature-use events".
- The install-ID sentence adds that resetting the ID also restarts the
  first-day window.

### Elsewhere

- `site/src/data/support-questions.json` — both telemetry answers gain one
  plain clause naming the two first-day events and that they carry no
  browsing data.
- `spec/features.md` (F21) and `spec/parity-matrix.md` (F21 row).
- `CLAUDE.md` and `AGENTS.md` Telemetry paragraph (the `/event` allowlist
  sentence), kept identical.
- A claims ledger for the release, following the existing
  `docs/website-*-claims-*.json` pattern.
- `docs/marketing-claims.md` is checked; no marketing copy may describe
  these signals as anything beyond counting.

## Part 4 — Testing

### App (`test/unit/telemetry-events.test.js` and new cases)

- Exact payload for each signal: `commonPayload` + `event` only.
- Not sent: before the launch report; without consent; with `usagePing`
  off; on unpackaged builds; after 24 h; for `createdAt: 'legacy'`.
- Sent once per install: the flag persists across a simulated restart and
  blocks a resend.
- `resetInstallId()` sets a new `createdAt` and clears both flags.
- Legacy migration: a file with `id` and no `createdAt` becomes `'legacy'`.
- Browsing counter: fires on the third qualifying main-frame load, not the
  second; ignores subframes, `blanc://`, private tabs, failed loads and
  wake reloads.
- Default check: sends on first `true`; the timer stops after sending and
  after the window closes; **Make default** triggers an immediate check.
- `test/unit/product-usage-wiring.test.js`: the exact allowed event list
  becomes the four names, and asserts no renderer path can send the two new
  events.

### Collector (`test/unit/ping-worker.test.js`)

- An install is eligible only when first seen on 1.31.0 or later
  (pre-releases included); a second launch adds nothing.
- Signal stored only for an eligible install on its install day; otherwise
  204 with no KV writes (unknown install, older version, next day).
- A duplicate signal is a no-op.
- Return join: a returner with a marker bumps `d1ret:<group>:D`; a
  returner without it does not; a non-returner never does.
- `/stats`: `signals` (with `eligible`) present from the first cohort with
  correct counts; absent before it; day-one counters read only for the 30
  shown days.
- No GA forward for either signal (outbound fetch mock not called).
- Event names that exist on `Object.prototype` return 400 and write
  nothing; the historic `mahjong` layout is still accepted and reported.

### Public copy

- `test/unit/security-controls.test.js`: the privacy page names both new
  events.
- `test/unit/public-truth.test.js`: FAQ and parity-matrix patterns updated
  to the new wording.

### Live proof (after release)

- The day after the release: `/stats` shows non-zero `signals.*.had` for
  that install day.
- Two days after: the first `complete: true` row carrying `signals`.

## Rollout

1. **Collector PR**, merged and deployed first (needs the owner's explicit
   "deploy"). Safe alone: no client sends the events yet; `/stats` gains
   `signals` from the day after the deploy, with `eligible.installs` 0 until
   the sending release ships.
2. **App PR**: code, tests and every copy change in Part 3. Ships in the
   next normal release; the site copy deploys in that release's
   post-publication site deploy.
3. **Digest**: after the release, update the scheduled
   `blanc-daily-analytics` instructions (outside the repo) to report the
   split in plain language, e.g. "Of Tuesday's new people, those who made
   Blanc their default came back 41% of the time; those who didn't, 7%",
   with the small-sample warning until each group has about 30 installs.
   "Didn't" always comes from the eligible group, never from all new
   installs.

## Reading the result

At about 100 new installs a day the split becomes readable after one to two
weeks. Expected uses:

- A large gap for `day1_default` argues for default-browser work first
  (when and how Blanc asks).
- A large gap for `day1_browsed` with a low `had` rate argues for
  first-session work (people install and never get as far as browsing).
- Small gaps for both mean neither behaviour explains the drop, and the next
  step is asking people directly.

These are correlations, not causes. People who were already going to stay
are more likely to set a default, so the split prioritises the next
experiment; it does not prove an effect.
