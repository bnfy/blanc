# First-Day Retention Signals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure whether new installs that make Blanc their default browser, or that actually browse on day one, come back the next day, by adding two install-day yes/no signals and joining them to the collector's existing next-day return figure.

**Architecture:** The collector (Cloudflare Worker) gains a second, isolated intake path for `day1_default` / `day1_browsed`. It stores a 2-day marker only when the install was first seen that same UTC day, joins those markers at the moment it already counts a next-day return, and reports per-cohort `signals` in `/stats`. The desktop app gains a pure `day-one-signals.js` state machine, fed by the main process (default-browser checks, top-level web page commits), that sends each signal at most once per install within 24 hours of the install time now recorded in `install.json`.

**Tech Stack:** Electron main process (CommonJS, `node --test`), Cloudflare Workers (ES modules, KV), Astro site copy.

**Spec:** `docs/superpowers/specs/2026-10-09-first-day-retention-signals-design.md`

## Global Constraints

- Exactly two signals, wire names `day1_default` and `day1_browsed`. Payload = the existing six launch fields (`installId, sessionId, version, platform, arch, osVersion`) plus `event`. Nothing else.
- Sent only when: packaged build, first-run privacy choices saved, `usagePing` on, the launch report already sent this process, the install's `createdAt` is a number less than 24 hours old, and that signal's sent flag is false.
- Never from private tabs, `blanc://` pages, subframes, failed (≥ 400) or quiet-tab wake loads. No URL, page count or install time ever leaves the device.
- Each signal at most once per install. The sent flag is flushed to `install.json` **before** the request is made. Fire-and-forget, no retry.
- Installs whose `install.json` already has an `id` but no `createdAt` are `'legacy'` and never send.
- Collector: count a signal only if `first:<hash>` equals today's UTC day; otherwise 204 with no writes. Markers live 2 days; counters never expire. Never forwarded to GA; never added to `productUsage`.
- KV key names (deliberately **not** under `return:d1:`, because `/stats` reads that whole prefix as day→count): marker `d1sig:<signal>:<day>:<hash>`, had-counter `d1had:<signal>:<day>`, returned-counter `d1ret:<signal>:<day>`. `<signal>` ∈ {`default`, `browsed`}.
- Keep the historic `'mahjong'` new-tab layout in the collector (pre-1.20 builds still send it; changed in review, see the PR 1 note).
- Privacy copy names the version: **Blanc 1.31.0 and later**. If release prep picks a different version number, release prep updates every occurrence (listed in Task 8).
- Repo rules that apply to every task: run `npm run audit-inventory:write` after editing `src/main/main.js`, `src/main/pages.js` or `src/main/tab-view.js` and commit the inventory with the change; run the `/verify` and `/simplify` skills right before each commit that changes code (not docs- or test-only commits); end every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Delivery: **PR 1** = spec + plan + collector (Tasks 1–3), deployed before **PR 2** = app + copy (Tasks 4–8). PR 2 ships in the next normal release. Task 9 runs after that release is public.

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `cloudflare/ping-worker/src/first-seen.js` | modify | `DAY_ONE_SIGNALS`, `markDayOneSignal`, join inside `markNextDayReturn` |
| `cloudflare/ping-worker/src/index.js` | modify | route day-one events, `/stats` `signals`, `DAY_ONE_SIGNALS_FIRST_COHORT`, eligible group, bounded day-one reads |
| `cloudflare/ping-worker/README.md` | modify | document the two events and the new `/stats` fields |
| `test/unit/ping-worker.test.js` | modify | collector tests |
| `src/main/telemetry.js` | modify | `install.json` fields, `installMeta`, `markDayOneSent`, reset, `sendDayOneSignal` |
| `src/main/day-one-signals.js` | create | pure first-day state machine (window, flags, page counter, default timer) |
| `src/main/default-browser-status.js` | create | the one default-browser status function, shared by `pages.js` and `main.js` |
| `src/main/pages.js` | modify | use the shared status; call `hooks.defaultBrowserChanged` after **Make default** |
| `src/main/tab-view.js` | modify | report a counted top-level web commit via `deps.noteWebPageLoaded` |
| `src/main/main.js` | modify | build `dayOneSignals`, start it after the launch report, wire both hooks |
| `test/unit/install-id-reset.test.js` | modify | install metadata and reset |
| `test/unit/telemetry-events.test.js` | modify | `sendDayOneSignal` payloads |
| `test/unit/day-one-signals.test.js` | create | state-machine tests |
| `test/unit/default-browser-status.test.js` | create | shared status tests |
| `test/unit/product-usage-wiring.test.js` | modify | exact wiring, no renderer path |
| `site/src/pages/privacy.astro`, `site/src/data/support-questions.json`, `spec/features.md`, `spec/parity-matrix.md`, `CLAUDE.md`, `AGENTS.md` | modify | public and internal copy |
| `test/unit/security-controls.test.js` | modify | privacy page names both events |

---

## PR 1 — Collector

> **Review changes (2026-10-09, bnfy/blanc#668).** Tasks 1–3 below are the
> original steps. Code review then changed PR 1 as follows; the spec's Part 2
> is the source of truth for the result:
> 1. An **eligible** group (installs first seen on `DAY_ONE_SIGNALS_MIN_VERSION`
>    1.31.0 or later) is written by the launch handler and is the comparison
>    group; a signal counts only for an eligible install on its install day,
>    and `/stats` reports `signals.eligible.{installs,returnedNextDay}`.
> 2. The historic `mahjong` layout is **kept** (pre-1.20 builds still send it);
>    Task 3's removal was reverted.
> 3. `/stats` reads day-one counters with direct gets for the ≤30 shown days
>    instead of listing the `d1had:`/`d1ret:` families.
> 4. The KV negative-cache timing dependency (why the client waits 2 minutes)
>    is documented beside `markDayOneSignal` and in the README.
> 5. `DAY_ONE_EVENTS` is derived from `DAY_ONE_SIGNALS`.
> 6. `CLAUDE.md`/`AGENTS.md` describe the collector's new events now, ending
>    "No released desktop build sends them yet." (Task 8 updates that clause.)
> 7. A test covers event names that exist on `Object.prototype`.

Work on a branch cut from the spec branch so the spec and plan travel with the collector change:

```bash
cd "/Users/anthonyjloria/Projects/Blanc Browser"
git switch docs/first-day-retention-signals-spec
git switch -c first-day-signals-collector
```

### Task 1: Collector accepts the two day-one signals

**Files:**
- Modify: `cloudflare/ping-worker/src/first-seen.js`
- Modify: `cloudflare/ping-worker/src/index.js:33` (import), `:329-336` (`handleUsageEvent` head)
- Modify: `docs/superpowers/specs/2026-10-09-first-day-retention-signals-design.md` (record the decisions this plan settled)
- Test: `test/unit/ping-worker.test.js`

**Interfaces:**
- Produces: `DAY_ONE_SIGNALS` (`['default','browsed']`), `DAY_ONE_MARKER_TTL` (seconds), `markDayOneSignal(kv, hashedId, signal, day, bumpFn) → Promise<boolean>` exported from `first-seen.js`.

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/ping-worker.test.js`:

```js
test('a day-one signal counts once, only on the install day, and never reaches GA', async (t) => {
  const env = { PINGS: fakeKV(), INSTALL_HASH_SECRET: 'test-secret', GA_API_SECRET: 'ga' };
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2027-01-10T15:00:00Z') });
  await ping(env, PING_BODY); // first seen 2027-01-10

  const first = await usageEvent(env, { ...PING_BODY, event: 'day1_default' });
  const repeat = await usageEvent(env, { ...PING_BODY, sessionId: 43, event: 'day1_default' });
  const browsed = await usageEvent(env, { ...PING_BODY, event: 'day1_browsed' });
  assert.equal(first.res.status, 204);
  assert.equal(repeat.res.status, 204);
  assert.equal(browsed.res.status, 204);
  assert.equal(env.PINGS.map.get('d1had:default:2027-01-10'), '1');
  assert.equal(env.PINGS.map.get('d1had:browsed:2027-01-10'), '1');
  assert.equal(first.gaCalls.length + repeat.gaCalls.length + browsed.gaCalls.length, 0);
  assert.equal([...env.PINGS.map.keys()].filter((k) => k.startsWith('usage:')).length, 0,
    'day-one signals never enter productUsage metrics');
  assert.equal([...env.PINGS.map.keys()].filter((k) => k.startsWith('d1sig:default:2027-01-10:')).length, 1);
  for (const key of env.PINGS.map.keys()) {
    assert.ok(!key.includes(RAW_ID), `raw id must not appear in any key: ${key}`);
  }
});

test('a day-one signal after the install day, or for an unknown install, stores nothing', async (t) => {
  const env = { PINGS: fakeKV(), INSTALL_HASH_SECRET: 'test-secret' };
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2027-01-10T15:00:00Z') });
  const unknown = await usageEvent(env, { ...PING_BODY, event: 'day1_browsed' });
  assert.equal(unknown.res.status, 204);
  await ping(env, PING_BODY);
  t.mock.timers.setTime(Date.parse('2027-01-11T01:00:00Z'));
  const late = await usageEvent(env, { ...PING_BODY, sessionId: 43, event: 'day1_browsed' });
  assert.equal(late.res.status, 204);
  assert.equal([...env.PINGS.map.keys()].filter((k) => k.startsWith('d1')).length, 0);
});

test('a day-one signal without a hashing secret stores nothing', async () => {
  const env = { PINGS: fakeKV() };
  const { res } = await usageEvent(env, { ...PING_BODY, event: 'day1_default' });
  assert.equal(res.status, 204);
  assert.equal([...env.PINGS.map.keys()].filter((k) => k.startsWith('d1')).length, 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test --test-name-pattern="day-one signal" test/unit/ping-worker.test.js`
Expected: FAIL — the first two return 400 (`usage-rejected`), because `usageEventFrom` does not know the events.

- [ ] **Step 3: Add the marker function to `first-seen.js`**

Append to `cloudflare/ping-worker/src/first-seen.js`:

```js
// First-day signals (docs/superpowers/specs/2026-10-09-first-day-retention-
// signals-design.md): an install may report, on the UTC day it was first
// seen, that Blanc is its default browser or that it browsed. Only that day
// counts, so a late or replayed event stores nothing. The per-install marker
// only has to outlive D+1 for the next-day join below, so it expires after two
// days; the d1had:<signal>:<D> counter never expires (growth history). Key
// families deliberately avoid the return:d1: prefix, which /stats reads whole
// as day -> count.
export const DAY_ONE_SIGNALS = Object.freeze(['default', 'browsed']);
export const DAY_ONE_MARKER_TTL = 2 * 24 * 3600;

export async function markDayOneSignal(kv, hashedId, signal, day, bumpFn) {
  if (!DAY_ONE_SIGNALS.includes(signal)) return false;
  if ((await kv.get(`first:${hashedId}`)) !== day) return false;
  const markerKey = `d1sig:${signal}:${day}:${hashedId}`;
  if ((await kv.get(markerKey)) !== null) return false;
  await bumpFn(kv, `d1had:${signal}:${day}`);
  await kv.put(markerKey, '1', { expirationTtl: DAY_ONE_MARKER_TTL });
  return true;
}
```

- [ ] **Step 4: Route the events in `index.js`**

Change the import on line 33:

```js
import { markFirstSeen, markNextDayReturn, markDayOneSignal } from './first-seen.js';
```

Add above `async function handleUsageEvent`:

```js
// The two first-day signals have their own path: no GA forward, no
// productUsage metric, no per-session replay key (the install-day marker is
// the dedup). See markDayOneSignal in first-seen.js.
const DAY_ONE_EVENTS = Object.freeze({ day1_default: 'default', day1_browsed: 'browsed' });

async function handleDayOneSignal(env, fields, signal, now) {
  const hashedId = await hashInstallId(env, fields.installId);
  if (hashedId) {
    await markDayOneSignal(env.PINGS, hashedId, signal, dayBucket(now), bump)
      .catch((err) => console.error('KV write failed:', err.message));
  }
  return new Response(null, { status: 204 });
}
```

Replace the first three lines of `handleUsageEvent`'s body:

```js
async function handleUsageEvent(request, env, ctx, now) {
  const client = await readClientRequest(request);
  // hasOwn: an event named '__proto__' or 'constructor' must not match.
  const signal = client && Object.hasOwn(DAY_ONE_EVENTS, client.body.event)
    ? DAY_ONE_EVENTS[client.body.event]
    : undefined;
  if (signal) return handleDayOneSignal(env, client.fields, signal, now);
  const usage = client ? usageEventFrom(client.body) : null;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/unit/ping-worker.test.js`
Expected: PASS, all tests including the existing ones.

- [ ] **Step 6: Record the settled decisions in the spec**

In `docs/superpowers/specs/2026-10-09-first-day-retention-signals-design.md`:
- Part 2 → Join: replace `return:d1:<signal>:<prevDay>` and `return:d1:<signal>:*` with `d1ret:<signal>:<prevDay>` / `d1ret:<signal>:*`, and add one sentence: "These keys avoid the `return:d1:` prefix because `/stats` reads that whole prefix as day → count."
- Part 2 → Intake step 3: counter key becomes `d1had:<signal>:<day>`.
- Part 1 → Install time: the fields are flat — `createdAt`, `day1Default`, `day1Browsed` — because `JsonStore` merges defaults shallowly.
- Part 1 → Signal 2: the hook is the top-level commit that already records history (`did-navigate` with `historyEligible` and not wake-suppressed), not `did-finish-load`; wording "three web pages open".
- Part 1 → Gate: add "The first check runs 2 minutes after the launch report, so the collector has recorded the install before any signal arrives."

- [ ] **Step 7: Commit**

```bash
git add cloudflare/ping-worker/src/first-seen.js cloudflare/ping-worker/src/index.js test/unit/ping-worker.test.js docs/superpowers/specs/2026-10-09-first-day-retention-signals-design.md
git commit -m "Accept install-day default-browser and browsing signals in the collector

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Join the signals to next-day return and report them in /stats

**Files:**
- Modify: `cloudflare/ping-worker/src/first-seen.js` (`markNextDayReturn`)
- Modify: `cloudflare/ping-worker/src/index.js:76` (constant), `nextDayReturnByCohort`, `handleStats`
- Test: `test/unit/ping-worker.test.js`

**Interfaces:**
- Consumes: `DAY_ONE_SIGNALS` from Task 1.
- Produces: `/stats` → `nextDayReturn.byDay[D].signals = { default: {had, returnedNextDay}, browsed: {had, returnedNextDay} }` for `D >= DAY_ONE_SIGNALS_FIRST_COHORT`.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/ping-worker.test.js`:

```js
test('/stats splits next-day return by day-one signal from the first signal cohort', async (t) => {
  const env = { PINGS: fakeKV(), INSTALL_HASH_SECRET: 'test-secret', STATS_TOKEN: 't' };
  const B = '11111111-2222-4333-8444-555555555555';
  const C = '22222222-3333-4444-8555-666666666666';
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2027-01-10T15:00:00Z') });
  for (const installId of [RAW_ID, B, C]) await ping(env, { ...PING_BODY, installId });
  await usageEvent(env, { ...PING_BODY, event: 'day1_default' });             // A: default
  await usageEvent(env, { ...PING_BODY, event: 'day1_browsed' });             // A: browsed
  await usageEvent(env, { ...PING_BODY, installId: B, event: 'day1_browsed' }); // B: browsed
  // An older cohort must carry no signals section at all.
  await env.PINGS.put('new:day:2026-10-04', '3');

  t.mock.timers.setTime(Date.parse('2027-01-11T09:00:00Z'));
  await ping(env, { ...PING_BODY, sessionId: 50 });                 // A returns
  await ping(env, { ...PING_BODY, installId: C, sessionId: 51 });   // C returns, no signals

  t.mock.timers.setTime(Date.parse('2027-01-12T09:00:00Z'));
  const stats = await (await worker.fetch(
    new Request('https://ping.test/stats', { headers: { Authorization: 'Bearer t' } }),
    env, { waitUntil() {} },
  )).json();
  assert.deepEqual(stats.nextDayReturn.byDay['2027-01-10'], {
    newInstalls: 3, returnedNextDay: 2, rate: 0.6667, complete: true,
    signals: {
      default: { had: 1, returnedNextDay: 1 },
      browsed: { had: 2, returnedNextDay: 1 },
    },
  });
  assert.equal('signals' in stats.nextDayReturn.byDay['2026-10-04'], false);
  assert.equal(env.PINGS.map.get('return:d1:2027-01-10'), '2', 'the overall counter is untouched');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test --test-name-pattern="splits next-day return" test/unit/ping-worker.test.js`
Expected: FAIL — `signals` missing from the 2027-01-10 row.

- [ ] **Step 3: Add the join to `markNextDayReturn`**

In `cloudflare/ping-worker/src/first-seen.js`, replace the end of `markNextDayReturn`:

```js
  await bumpFn(kv, `return:d1:${prevDay}`);
  await kv.put(markerKey, '1', { expirationTtl: NEXT_DAY_RETURN_MARKER_TTL });
  // Split the return by install-day signal: two reads, paid only by returners.
  await Promise.all(DAY_ONE_SIGNALS.map(async (signal) => {
    if ((await kv.get(`d1sig:${signal}:${prevDay}:${hashedId}`)) !== null) {
      await bumpFn(kv, `d1ret:${signal}:${prevDay}`);
    }
  }));
  return true;
}
```

`DAY_ONE_SIGNALS` is declared later in the same module; move the `DAY_ONE_SIGNALS` / `DAY_ONE_MARKER_TTL` block from Task 1 above `markNextDayReturn` so the file reads top to bottom.

- [ ] **Step 4: Report it in `/stats`**

In `cloudflare/ping-worker/src/index.js`:

Import `DAY_ONE_SIGNALS` too:

```js
import { markFirstSeen, markNextDayReturn, markDayOneSignal, DAY_ONE_SIGNALS } from './first-seen.js';
```

Below `NEXT_DAY_RETURN_FIRST_COHORT` (line 76) add:

```js
// First cohort whose day-one signal split is fully counted: the d1had/d1ret
// write paths must be live for all of day D and D+1. Earlier cohorts carry no
// `signals` section rather than zeros. Set to the UTC day AFTER the collector
// deploy (Task 3 updates it if the deploy date moves).
const DAY_ONE_SIGNALS_FIRST_COHORT = '2026-10-12';
```

Add above `nextDayReturnByCohort`:

```js
// 'default:2027-01-10' -> { '2027-01-10': { default: n } }
function signalCountsByDay(flat) {
  const byDay = {};
  for (const [key, value] of Object.entries(flat)) {
    const sep = key.indexOf(':');
    const signal = key.slice(0, sep);
    if (sep < 0 || !DAY_ONE_SIGNALS.includes(signal)) continue;
    const day = key.slice(sep + 1);
    byDay[day] = { ...byDay[day], [signal]: value };
  }
  return byDay;
}
```

Change `nextDayReturnByCohort` to take the two maps and attach `signals`:

```js
function nextDayReturnByCohort(newByDay, returnD1ByDay, today, hadByDay = {}, returnedByDay = {}) {
  const byDay = {};
  for (const day of Object.keys(newByDay).sort().slice(-30)) {
    if (day < NEXT_DAY_RETURN_FIRST_COHORT) continue;
    const newInstalls = newByDay[day];
    const returnedNextDay = returnD1ByDay[day] ?? 0;
    const nextDay = dayBucket(new Date(Date.parse(`${day}T00:00:00Z`) + 86400000));
    byDay[day] = {
      newInstalls,
      returnedNextDay,
      rate: newInstalls ? Number((returnedNextDay / newInstalls).toFixed(4)) : 0,
      complete: nextDay < today,
    };
    if (day >= DAY_ONE_SIGNALS_FIRST_COHORT) {
      byDay[day].signals = Object.fromEntries(DAY_ONE_SIGNALS.map((signal) => [signal, {
        had: hadByDay[day]?.[signal] ?? 0,
        returnedNextDay: returnedByDay[day]?.[signal] ?? 0,
      }]));
    }
  }
  return { firstCohort: NEXT_DAY_RETURN_FIRST_COHORT, byDay };
}
```

In `handleStats`, extend the `Promise.all` destructuring and list (after `returnD1ByDay`):

```js
    daily, weekly, monthly, dlFlat, newByDay, returnD1ByDay, dayOneHad, dayOneReturned, productUsage,
```

```js
    readMap(env.PINGS, 'return:d1:'),
    // No other key family starts 'd1had:' or 'd1ret:'.
    readMap(env.PINGS, 'd1had:'),
    readMap(env.PINGS, 'd1ret:'),
    readProductUsage(env.PINGS),
```

and the report line:

```js
    nextDayReturn: nextDayReturnByCohort(
      newByDay, returnD1ByDay, dayBucket(now),
      signalCountsByDay(dayOneHad), signalCountsByDay(dayOneReturned),
    ),
```

- [ ] **Step 5: Run the collector tests**

Run: `node --test test/unit/ping-worker.test.js`
Expected: PASS, including the existing `/stats reports next-day return per new-install cohort` test (its 2026-10-03 row is before the first signal cohort, so its exact `deepEqual` still holds).

- [ ] **Step 6: Commit**

```bash
git add cloudflare/ping-worker/src/first-seen.js cloudflare/ping-worker/src/index.js test/unit/ping-worker.test.js
git commit -m "Split next-day return by install-day signal in the collector's stats

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Drop the stray layout, document, open PR 1, deploy

**Files:**
- Modify: `cloudflare/ping-worker/src/index.js:44-54`
- Modify: `cloudflare/ping-worker/README.md`
- Test: `test/unit/ping-worker.test.js`

- [ ] **Step 1: Write the failing test**

In the existing test `unknown usage events and layout values are rejected without usage writes`, add before the final assertion:

```js
  assert.equal((await usageEvent(env, {
    ...PING_BODY, sessionId: 45, event: 'newtab_layout', layout: 'mahjong',
  })).res.status, 400);
```

and in `new-tab layouts use separate allowlisted counters and appear in stats` add at the end:

```js
  assert.deepEqual(Object.keys(stats.productUsage.newtabLayouts), ['ledger', 'billboard', 'shelf', 'tally']);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test --test-name-pattern="layout" test/unit/ping-worker.test.js`
Expected: FAIL — `mahjong` returns 204 and appears in `newtabLayouts`.

- [ ] **Step 3: Remove it**

```js
const NEWTAB_LAYOUTS = new Set(['ledger', 'billboard', 'shelf', 'tally']);
const USAGE_METRICS = Object.freeze({
  mahjong: 'mahjong-play',
  newtabLayouts: Object.freeze({
    ledger: 'newtab-layout-ledger',
    billboard: 'newtab-layout-billboard',
    shelf: 'newtab-layout-shelf',
    tally: 'newtab-layout-tally',
  }),
});
```

(Stored `usage:newtab-layout-mahjong:*` keys stay in KV untouched; they are simply no longer read.)

- [ ] **Step 4: Run the collector tests and lint**

Run: `node --test test/unit/ping-worker.test.js && npx eslint "cloudflare/**/src/**/*.js" --max-warnings 0`
Expected: PASS, no lint output.

- [ ] **Step 5: Update the README**

In `cloudflare/ping-worker/README.md`:
- In the paragraph starting "A rendered start-page layout", change the allowlist to "`ledger`, `billboard`, `shelf`, or `tally`".
- Add after the "Next-day return" paragraph:

```markdown
First-day signals: `{event:'day1_default'}` (Blanc is the default browser) and
`{event:'day1_browsed'}` (three web pages opened in regular tabs) carry only the
common launch fields. Desktop builds 1.31.0 and later send each at most once per
installation, during its first 24 hours. The Worker counts one only when the
installation's `first:<hash>` equals today's UTC day; otherwise it replies 204
and stores nothing. It writes a keyed-hash marker `d1sig:<signal>:<D>:<hash>`
that expires after two days and bumps `d1had:<signal>:<D>`. When that
installation's next-day return is counted, each present marker also bumps
`d1ret:<signal>:<D>`. These keys deliberately avoid the `return:d1:` prefix.
`/stats` adds `nextDayReturn.byDay[D].signals.{default,browsed}.{had,returnedNextDay}`
from `DAY_ONE_SIGNALS_FIRST_COHORT` in `src/index.js` (the UTC day after the
deploy); earlier cohorts carry no `signals` key. First-day signals are never
forwarded to GA4 and are not part of `productUsage`.
```

- In the `GET /stats` paragraph, change "the same narrow event fields to GA4" to "the same narrow launch and product-event fields to GA4 (never the first-day signals)".

- [ ] **Step 6: Commit and open PR 1**

```bash
git add cloudflare/ping-worker/src/index.js cloudflare/ping-worker/README.md test/unit/ping-worker.test.js
git commit -m "Drop the unused mahjong layout from the collector and document first-day signals

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin first-day-signals-collector
gh pr create --title "Collector: first-day retention signals" --body "$(cat <<'EOF'
Adds the collector half of docs/superpowers/specs/2026-10-09-first-day-retention-signals-design.md (spec and plan included).

- Accepts `day1_default` / `day1_browsed` only on the install's first-seen UTC day; 2-day markers, permanent daily counters; never forwarded to GA or productUsage.
- Joins them to next-day return and reports `nextDayReturn.byDay[D].signals` from `DAY_ONE_SIGNALS_FIRST_COHORT`.
- Drops the `mahjong` start-page layout the app never sends.

No app sends these events yet; the app change ships separately in the next release.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 7: Merge when every check passes, then deploy — only after the owner says "deploy"**

Follow the merge rule (all check runs on the exact head SHA). Then ask the owner for an explicit "deploy". Before deploying, set `DAY_ONE_SIGNALS_FIRST_COHORT` to the UTC day after the actual deploy date if it differs from `2026-10-12` (a one-line follow-up PR). Deploy from a clean, up-to-date `main`:

```bash
cd "/Users/anthonyjloria/Projects/Blanc Browser/cloudflare/ping-worker"
op run --env-file=../.env.1password -- npx wrangler deploy
```

If `op` is unavailable, wrangler's cached OAuth session works: `npx wrangler deploy`.

- [ ] **Step 8: Verify the deploy**

Fetch `/stats` with the digest's stats token, as the daily digest does, and confirm the newest `nextDayReturn.byDay` rows on or after the first signal cohort carry `signals` with zeros, and that `productUsage.newtabLayouts` has exactly four keys. Do not send synthetic events to the production collector; they would count as a real new install.

---

## PR 2 — App and copy

Start only after PR 1 is merged. Use a fresh worktree from `origin/main` and run a real `npm ci` there (a symlinked `node_modules` ships a broken `app.asar`):

```bash
cd "/Users/anthonyjloria/Projects/Blanc Browser"
git fetch origin
git worktree add ../blanc-first-day-signals -b first-day-signals-app origin/main
cd ../blanc-first-day-signals && npm ci
```

### Task 4: Install time and the first-day sender in telemetry.js

**Files:**
- Modify: `src/main/telemetry.js:20-46` (store, `installId`, `resetInstallId`), sender, exports
- Test: `test/unit/install-id-reset.test.js`, `test/unit/telemetry-events.test.js`

**Interfaces:**
- Produces (exported from `src/main/telemetry.js`):
  - `DAY_ONE_SIGNALS` — `['default', 'browsed']`
  - `installMeta(store?, now?) → { createdAt: number|'legacy', sent: { default: boolean, browsed: boolean } }`
  - `markDayOneSent(signal, store?) → boolean` (true iff the flag reached disk)
  - `sendDayOneSignal(signal) → boolean`
  - `resetInstallId(store?, now?) → boolean` (now also resets `createdAt` and both flags)
  - `createTelemetrySender(...)` gains `sendDayOneSignal(signal)`

- [ ] **Step 1: Write the failing tests**

In `test/unit/install-id-reset.test.js`, change the import and `fakeStore`, then add tests:

```js
const { resetInstallId, installMeta, markDayOneSent } = require('../../src/main/telemetry');

function fakeStore(id, { writable = true, createdAt = null, day1Default = false, day1Browsed = false } = {}) {
  return {
    data: { id, createdAt, day1Default, day1Browsed },
    flushes: 0,
    update(fn) { fn(this.data); },
    // Mirrors JsonStore.flush's contract: true iff the write reached disk.
    flush() { this.flushes += 1; return writable; },
  };
}

test('a brand-new install records its creation time with both first-day flags clear', () => {
  const store = fakeStore(null);
  assert.deepEqual(installMeta(store, 1_000), { createdAt: 1_000, sent: { default: false, browsed: false } });
  assert.match(store.data.id, UUID_RE);
  assert.equal(store.flushes, 1);
});

test('an install that predates the first-day signals is marked legacy, once', () => {
  const store = fakeStore('11111111-2222-4333-8444-555555555555');
  assert.equal(installMeta(store, 5_000).createdAt, 'legacy');
  assert.equal(installMeta(store, 6_000).createdAt, 'legacy');
  assert.equal(store.flushes, 1, 'legacy is written once, then read back');
});

test('a sent flag is persisted, and a failed write is reported', () => {
  const store = fakeStore('11111111-2222-4333-8444-555555555555', { createdAt: 1_000 });
  assert.equal(markDayOneSent('browsed', store), true);
  assert.deepEqual(installMeta(store, 2_000).sent, { default: false, browsed: true });
  assert.equal(markDayOneSent('nonsense', store), false);
  const readOnly = fakeStore('11111111-2222-4333-8444-555555555555', { createdAt: 1_000, writable: false });
  assert.equal(markDayOneSent('default', readOnly), false);
});

test('reset restarts the first-day window and clears both flags', () => {
  const store = fakeStore('11111111-2222-4333-8444-555555555555', {
    createdAt: 'legacy', day1Default: true, day1Browsed: true,
  });
  assert.equal(resetInstallId(store, 9_000), true);
  assert.deepEqual(installMeta(store, 9_500), { createdAt: 9_000, sent: { default: false, browsed: false } });
});
```

In `test/unit/telemetry-events.test.js` add:

```js
test('first-day signals carry only the launch fields plus a fixed event name', () => {
  const { sender, calls } = senderHarness();
  assert.equal(sender.sendDayOneSignal('default'), true);
  assert.equal(sender.sendDayOneSignal('browsed'), true);
  assert.equal(sender.sendDayOneSignal('default'), false, 'once per session at this layer too');
  for (const value of ['', 'mahjong', 'day1_default', null]) {
    assert.equal(sender.sendDayOneSignal(value), false);
  }
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, EVENT_ENDPOINT);
  const base = {
    installId: '01234567-89ab-4cde-8f01-23456789abcd', sessionId: 0x3fffffff,
    version: '1.10.0', platform: 'darwin', arch: 'arm64', osVersion: '26',
  };
  assert.deepEqual(JSON.parse(calls[0].body), { ...base, event: 'day1_default' });
  assert.deepEqual(JSON.parse(calls[1].body), { ...base, event: 'day1_browsed' });
});

test('development builds send no first-day signal', () => {
  const dev = senderHarness({ packaged: false });
  assert.equal(dev.sender.sendDayOneSignal('default'), false);
  assert.equal(dev.calls.length, 0);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/unit/install-id-reset.test.js test/unit/telemetry-events.test.js`
Expected: FAIL — `installMeta is not a function`, `sender.sendDayOneSignal is not a function`.

- [ ] **Step 3: Implement**

In `src/main/telemetry.js`, replace the store/`installId`/`resetInstallId` block (lines 20–46):

```js
// install.json also records when this install's id was minted, for the
// first-day signals (docs/superpowers/specs/2026-10-09-first-day-retention-
// signals-design.md). createdAt never leaves the device. Flat fields because
// JsonStore merges defaults shallowly; an install that already had an id
// before this field existed reads createdAt as null and is marked 'legacy',
// which never sends a first-day signal.
const DAY_ONE_SIGNALS = Object.freeze(['default', 'browsed']);
const DAY_ONE_FIELDS = Object.freeze({ default: 'day1Default', browsed: 'day1Browsed' });

let installStore = null;
function ensureInstallStore() {
  if (!installStore) {
    const { JsonStore } = require('./store');
    installStore = new JsonStore('install', {
      id: null, createdAt: null, day1Default: false, day1Browsed: false,
    });
  }
  return installStore;
}

function installMeta(store = ensureInstallStore(), now = Date.now()) {
  if (!store.data.id) {
    store.update((d) => {
      d.id = randomUUID();
      d.createdAt = now;
      d.day1Default = false;
      d.day1Browsed = false;
    });
    store.flush(); // persist now so a crash before the debounce can't lose (and thus re-mint) the id
  } else if (store.data.createdAt === null || store.data.createdAt === undefined) {
    store.update((d) => { d.createdAt = 'legacy'; });
    store.flush();
  }
  return {
    createdAt: store.data.createdAt,
    sent: { default: store.data.day1Default === true, browsed: store.data.day1Browsed === true },
  };
}

function installId() {
  const store = ensureInstallStore();
  installMeta(store);
  return store.data.id;
}

// Success is the WRITE succeeding: the flag must be on disk before the event
// leaves, so a crash or restart can never send it twice.
function markDayOneSent(signal, store = ensureInstallStore()) {
  if (!Object.hasOwn(DAY_ONE_FIELDS, signal)) return false;
  const field = DAY_ONE_FIELDS[signal];
  store.update((d) => { d[field] = true; });
  return store.flush() === true;
}

// Settings → "Reset install ID": mint a fresh id immediately (rather than
// nulling and lazily re-minting) so the store never holds a "no id" state a
// crash could resurrect. Success is the WRITE succeeding, not the attempt —
// the settings page tells the user the reset stuck, so a swallowed disk
// error must not read as done (the old id would come back next launch).
// From the collector's perspective the install simply counts as brand new,
// so the first-day window restarts with it.
function resetInstallId(store = ensureInstallStore(), now = Date.now()) {
  store.update((d) => {
    d.id = randomUUID();
    d.createdAt = now;
    d.day1Default = false;
    d.day1Browsed = false;
  });
  return store.flush() === true;
}
```

In `createTelemetrySender`, add before `return { … }`:

```js
  function sendDayOneSignal(signal) {
    if (!DAY_ONE_SIGNALS.includes(signal)) return false;
    return postOnce(
      `day1:${signal}`,
      EVENT_ENDPOINT,
      () => ({ ...commonPayload(), event: `day1_${signal}` }),
      'first-day event',
    );
  }

  return { sendLaunchPing, sendMahjongPlay, sendNewtabLayoutUsed, sendDayOneSignal };
```

Add the module-level wrapper and exports:

```js
function sendDayOneSignal(signal) { return ensureDefaultSender().sendDayOneSignal(signal); }
```

```js
module.exports = {
  PING_ENDPOINT,
  EVENT_ENDPOINT,
  DAY_ONE_SIGNALS,
  createTelemetrySender,
  productUsageAllowed,
  sendLaunchPing,
  sendMahjongPlay,
  sendNewtabLayoutUsed,
  sendDayOneSignal,
  installMeta,
  markDayOneSent,
  resetInstallId,
  coarseOsVersion,
};
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/unit/install-id-reset.test.js test/unit/telemetry-events.test.js test/unit/telemetry-os-version.test.js`
Expected: PASS.

- [ ] **Step 5: Commit** (after `/verify` and `/simplify`)

```bash
git add src/main/telemetry.js test/unit/install-id-reset.test.js test/unit/telemetry-events.test.js
git commit -m "Record install time and add the first-day event sender

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: The first-day state machine

**Files:**
- Create: `src/main/day-one-signals.js`
- Test: `test/unit/day-one-signals.test.js`

**Interfaces:**
- Consumes (injected): `readMeta()` → `installMeta()` shape; `markSent(signal) → boolean`; `send(signal)`; `canSend() → boolean`; `isDefaultBrowser() → boolean`.
- Produces: `createDayOneSignals(deps) → { start(), stop(), checkDefault(), notePageLoaded(url) }`, plus constants `DAY_ONE_WINDOW_MS`, `DEFAULT_CHECK_INTERVAL_MS`, `START_DELAY_MS`, `BROWSED_PAGE_THRESHOLD`.

- [ ] **Step 1: Write the failing tests**

Create `test/unit/day-one-signals.test.js`:

```js
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createDayOneSignals,
  DAY_ONE_WINDOW_MS,
  DEFAULT_CHECK_INTERVAL_MS,
  START_DELAY_MS,
} = require('../../src/main/day-one-signals');

function harness({
  createdAt = 0, now = 1_000, isDefault = false, canSend = true, writable = true, sent = {},
} = {}) {
  const state = {
    now, isDefault, canSend, createdAt,
    sent: { default: false, browsed: false, ...sent },
    sentEvents: [], timeouts: [], intervals: [], cleared: [],
  };
  const signals = createDayOneSignals({
    readMeta: () => ({ createdAt: state.createdAt, sent: { ...state.sent } }),
    markSent: (signal) => { if (!writable) return false; state.sent[signal] = true; return true; },
    send: (signal) => state.sentEvents.push(signal),
    canSend: () => state.canSend,
    isDefaultBrowser: () => {
      if (state.isDefault === 'throw') throw new Error('reg.exe failed');
      return state.isDefault;
    },
    now: () => state.now,
    setTimeoutFn: (fn, ms) => { state.timeouts.push({ fn, ms }); return state.timeouts.length; },
    setIntervalFn: (fn, ms) => { state.intervals.push({ fn, ms }); return { id: state.intervals.length, unref() {} }; },
    clearIntervalFn: (handle) => state.cleared.push(handle),
  });
  const activate = () => { signals.start(); state.timeouts.at(-1).fn(); };
  return { signals, state, activate };
}

test('nothing is checked until the start delay has passed', () => {
  const { signals, state } = harness({ isDefault: true });
  signals.start();
  assert.equal(state.timeouts[0].ms, START_DELAY_MS);
  assert.deepEqual(state.sentEvents, []);
  assert.equal(signals.checkDefault(), false, 'Make default before activation does nothing');
});

test('the third counted web page sends day1_browsed once', () => {
  const { signals, state, activate } = harness();
  activate();
  signals.notePageLoaded('https://a.example/');
  signals.notePageLoaded('http://b.example/');
  assert.deepEqual(state.sentEvents, []);
  signals.notePageLoaded('https://c.example/');
  signals.notePageLoaded('https://d.example/');
  assert.deepEqual(state.sentEvents, ['browsed']);
});

test('only http and https pages count', () => {
  const { signals, state, activate } = harness();
  activate();
  for (const url of ['blanc://newtab/', 'about:blank', 'file:///etc/hosts', 'not a url', '', undefined]) {
    signals.notePageLoaded(url);
  }
  signals.notePageLoaded('https://a.example/');
  signals.notePageLoaded('https://b.example/');
  assert.deepEqual(state.sentEvents, []);
});

test('pages counted before activation send on activation', () => {
  const { signals, state, activate } = harness();
  for (const u of ['https://a.example/', 'https://b.example/', 'https://c.example/']) signals.notePageLoaded(u);
  assert.deepEqual(state.sentEvents, []);
  activate();
  assert.deepEqual(state.sentEvents, ['browsed']);
});

test('the default browser is checked on activation, then every 15 minutes until true', () => {
  const { signals, state, activate } = harness();
  activate();
  assert.equal(state.intervals.length, 1);
  assert.equal(state.intervals[0].ms, DEFAULT_CHECK_INTERVAL_MS);
  state.intervals[0].fn();
  assert.deepEqual(state.sentEvents, []);
  state.isDefault = true;
  state.intervals[0].fn();
  assert.deepEqual(state.sentEvents, ['default']);
  assert.equal(state.cleared.length, 1, 'the timer stops once the signal is sent');
  state.intervals[0].fn();
  assert.deepEqual(state.sentEvents, ['default']);
});

test('Make default triggers an immediate check after activation', () => {
  const { signals, state, activate } = harness();
  activate();
  state.isDefault = true;
  assert.equal(signals.checkDefault(), true);
  assert.deepEqual(state.sentEvents, ['default']);
});

test('nothing is sent after the first 24 hours, and the timer stops', () => {
  const { signals, state, activate } = harness();
  activate();
  state.now = DAY_ONE_WINDOW_MS + 1;
  state.isDefault = true;
  state.intervals[0].fn();
  for (const u of ['https://a.example/', 'https://b.example/', 'https://c.example/']) signals.notePageLoaded(u);
  assert.deepEqual(state.sentEvents, []);
  assert.equal(state.cleared.length, 1);
});

test('legacy installs never send and never start a timer', () => {
  const { signals, state, activate } = harness({ createdAt: 'legacy', isDefault: true });
  activate();
  for (const u of ['https://a.example/', 'https://b.example/', 'https://c.example/']) signals.notePageLoaded(u);
  assert.deepEqual(state.sentEvents, []);
  assert.equal(state.intervals.length, 0);
});

test('already-sent signals are not sent again after a restart', () => {
  const { signals, state, activate } = harness({ isDefault: true, sent: { default: true, browsed: true } });
  activate();
  for (const u of ['https://a.example/', 'https://b.example/', 'https://c.example/']) signals.notePageLoaded(u);
  assert.deepEqual(state.sentEvents, []);
  assert.equal(state.intervals.length, 0);
});

test('without consent nothing is sent; a failed flag write blocks the send', () => {
  const noConsent = harness({ canSend: false, isDefault: true });
  noConsent.activate();
  assert.deepEqual(noConsent.state.sentEvents, []);
  const readOnly = harness({ writable: false, isDefault: true });
  readOnly.activate();
  assert.deepEqual(readOnly.state.sentEvents, [], 'the flag must reach disk before the event leaves');
});

test('a throwing default-browser check is treated as not default', () => {
  const { state, activate } = harness({ isDefault: 'throw' });
  activate();
  assert.deepEqual(state.sentEvents, []);
  assert.equal(state.intervals.length, 1, 'the check keeps running after a failed read');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/unit/day-one-signals.test.js`
Expected: FAIL — `Cannot find module '../../src/main/day-one-signals'`.

- [ ] **Step 3: Implement**

Create `src/main/day-one-signals.js`:

```js
'use strict';

// First-day retention signals (docs/superpowers/specs/2026-10-09-first-day-
// retention-signals-design.md). Pure: main.js injects install metadata, the
// consent gate, the sender and the default-browser check, so the whole policy
// runs under plain node --test.
//
// Each signal is sent at most once per install and only within 24 hours of
// the install time in install.json. The sent flag must reach disk before the
// event leaves. Nothing starts until START_DELAY_MS after the launch report,
// so the collector has already recorded the install's first-seen day.
// notePageLoaded receives a URL only to check its scheme; the count lives in
// memory, holds no addresses, and resets with the process.

const DAY_ONE_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const START_DELAY_MS = 2 * 60 * 1000;
const BROWSED_PAGE_THRESHOLD = 3;

function withinDayOne(createdAt, now) {
  return typeof createdAt === 'number' && Number.isFinite(createdAt)
    && now >= createdAt && now - createdAt < DAY_ONE_WINDOW_MS;
}

function isCountableWebPage(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function createDayOneSignals({
  readMeta,
  markSent,
  send,
  canSend,
  isDefaultBrowser,
  now = () => Date.now(),
  setTimeoutFn = setTimeout,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
}) {
  let pageLoads = 0;
  let starting = false;
  let active = false;
  let timer = null;

  function stopTimer() {
    if (timer === null) return;
    clearIntervalFn(timer);
    timer = null;
  }

  function emit(signal) {
    const meta = readMeta();
    if (meta.sent[signal] || !withinDayOne(meta.createdAt, now()) || !canSend()) return false;
    if (!markSent(signal)) return false;
    send(signal);
    return true;
  }

  function checkDefault() {
    if (!active) return false;
    const meta = readMeta();
    if (meta.sent.default || !withinDayOne(meta.createdAt, now())) {
      stopTimer();
      return false;
    }
    let isDefault = false;
    try {
      isDefault = isDefaultBrowser() === true;
    } catch {
      isDefault = false;
    }
    if (!isDefault || !emit('default')) return false;
    stopTimer();
    return true;
  }

  function notePageLoaded(url) {
    if (pageLoads >= BROWSED_PAGE_THRESHOLD || !isCountableWebPage(url)) return false;
    pageLoads += 1;
    return active && pageLoads === BROWSED_PAGE_THRESHOLD && emit('browsed');
  }

  function activate() {
    active = true;
    const meta = readMeta();
    if (!withinDayOne(meta.createdAt, now())) return;
    if (pageLoads >= BROWSED_PAGE_THRESHOLD) emit('browsed');
    if (meta.sent.default || checkDefault()) return;
    timer = setIntervalFn(checkDefault, DEFAULT_CHECK_INTERVAL_MS);
    timer?.unref?.();
  }

  function start() {
    if (starting) return;
    starting = true;
    setTimeoutFn(activate, START_DELAY_MS);
  }

  return { start, stop: stopTimer, checkDefault, notePageLoaded };
}

module.exports = {
  createDayOneSignals,
  DAY_ONE_WINDOW_MS,
  DEFAULT_CHECK_INTERVAL_MS,
  START_DELAY_MS,
  BROWSED_PAGE_THRESHOLD,
};
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/unit/day-one-signals.test.js && npx eslint src/main/day-one-signals.js --max-warnings 0`
Expected: PASS, no lint output.

- [ ] **Step 5: Commit** (after `/verify` and `/simplify`)

```bash
git add src/main/day-one-signals.js test/unit/day-one-signals.test.js
git commit -m "Add the first-day signal policy as a pure module

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: One shared default-browser status

**Files:**
- Create: `src/main/default-browser-status.js`
- Modify: `src/main/pages.js:2` (remove `execFileSync` import), `:15` (remove `isWindowsDefaultBrowser` import), `:565-590`
- Test: `test/unit/default-browser-status.test.js`

**Interfaces:**
- Produces: `createDefaultBrowserStatus({ app, platform, execFileSync, isWindowsDefaultBrowser? }) → () => { isDefault: boolean, canSet: boolean }`.
- Produces (pages hook): `hooks.defaultBrowserChanged?.()` called after every `pages:default-browser:set`.

- [ ] **Step 1: Write the failing test**

Create `test/unit/default-browser-status.test.js`:

```js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { createDefaultBrowserStatus } = require('../../src/main/default-browser-status');

const fakeApp = ({ packaged = true, http = false } = {}) => ({
  isPackaged: packaged,
  isDefaultProtocolClient: (scheme) => scheme === 'http' && http,
});

test('macOS and Linux read the http protocol client; Windows reads UserChoice', () => {
  assert.deepEqual(
    createDefaultBrowserStatus({ app: fakeApp({ http: true }), platform: 'darwin' })(),
    { isDefault: true, canSet: true },
  );
  assert.deepEqual(
    createDefaultBrowserStatus({ app: fakeApp({ http: true }), platform: 'linux' })(),
    { isDefault: true, canSet: false },
  );
  let asked = null;
  const win = createDefaultBrowserStatus({
    app: fakeApp({ http: true }),
    platform: 'win32',
    execFileSync: 'exec',
    isWindowsDefaultBrowser: (opts) => { asked = opts; return false; },
  });
  assert.deepEqual(win(), { isDefault: false, canSet: true });
  assert.deepEqual(asked, { execFileSync: 'exec' });
});

test('a development run can never set itself as the default', () => {
  assert.equal(createDefaultBrowserStatus({ app: fakeApp({ packaged: false }), platform: 'darwin' })().canSet, false);
});

test('pages.js uses the shared status and reports Make default to main', () => {
  const pages = fs.readFileSync(path.join(__dirname, '../../src/main/pages.js'), 'utf8');
  assert.match(pages, /createDefaultBrowserStatus\(\{ app, platform: process\.platform, execFileSync \}\)/);
  assert.doesNotMatch(pages, /isDefaultProtocolClient\('http'\)/);
  assert.match(pages, /hooks\.defaultBrowserChanged\?\.\(\);\s*return defaultBrowserStatus\(\);/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/unit/default-browser-status.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/main/default-browser-status.js`:

```js
'use strict';

const { isWindowsDefaultBrowser: readWindowsUserChoice } = require('./windows-default-browser');

// Default-browser state lives in LaunchServices/the OS, not settings.json.
// canSet: a dev run must never register the bare Electron binary as a
// browser, and Linux has no default-protocol-client API in Electron.
// On Windows, isDefaultProtocolClient only echoes our own protocol write,
// so the answer comes from the real UserChoice key instead. Shared by the
// pages:default-browser:* handlers and the first-day default signal so both
// always agree.
function createDefaultBrowserStatus({
  app,
  platform,
  execFileSync,
  isWindowsDefaultBrowser = readWindowsUserChoice,
}) {
  return () => ({
    isDefault: platform === 'win32'
      ? isWindowsDefaultBrowser({ execFileSync })
      : app.isDefaultProtocolClient('http'),
    canSet: app.isPackaged && platform !== 'linux',
  });
}

module.exports = { createDefaultBrowserStatus };
```

In `src/main/pages.js`: keep `const { execFileSync } = require('node:child_process');` (now passed to the factory), replace line 15's `isWindowsDefaultBrowser` import with:

```js
const { createDefaultBrowserStatus } = require('./default-browser-status');
```

Replace the comment block and `const defaultBrowserStatus = () => ({ … });` (lines 560–570) with:

```js
  const defaultBrowserStatus = createDefaultBrowserStatus({ app, platform: process.platform, execFileSync });
```

and the end of the `pages:default-browser:set` handler:

```js
        app.setAsDefaultProtocolClient('http');
      }
    }
    hooks.defaultBrowserChanged?.();
    return defaultBrowserStatus();
  });
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/unit/default-browser-status.test.js test/unit/default-browser-packaging.test.js && npx eslint src/main/pages.js src/main/default-browser-status.js --max-warnings 0`
Expected: PASS, no lint output. (No existing test pins the old in-`pages.js` source; verified 2026-10-09.)

- [ ] **Step 5: Refresh the audit inventory and commit** (after `/verify` and `/simplify`)

```bash
npm run audit-inventory:write
git add src/main/default-browser-status.js src/main/pages.js test/unit/default-browser-status.test.js security/audit-surface-inventory.json
git commit -m "Share one default-browser status between pages and main

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Wire the signals into the main process

**Files:**
- Modify: `src/main/tab-view.js:366` (the `did-navigate` history line)
- Modify: `src/main/main.js:126-131` (imports), `:1508-1517` (`maybeSendLaunchPing`), `:5510` (`initTabView` deps), `setupPages({ … })` (around `:9562`)
- Test: `test/unit/product-usage-wiring.test.js`

**Interfaces:**
- Consumes: `createDayOneSignals` (Task 5), `installMeta` / `markDayOneSent` / `sendDayOneSignal` (Task 4), `createDefaultBrowserStatus` (Task 6), `hooks.defaultBrowserChanged` (Task 6).
- Produces: `deps.noteWebPageLoaded(url)` in tab-view.

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/product-usage-wiring.test.js`:

```js
const tabView = source('src/main/tab-view.js');

test('first-day signals start only after the launch report and require saved consent', () => {
  assert.match(main, /launchPingSent = true;\s*sendLaunchPing\(\);\s*dayOneSignals\.start\(\);/);
  assert.match(
    main,
    /canSend: \(\) => app\.isPackaged\s*&& settings\.isFirstRunComplete\(\)\s*&& settings\.getSettings\(\)\.usagePing === true\s*&& launchPingSent/,
  );
  assert.match(main, /defaultBrowserChanged: \(\) => dayOneSignals\.checkDefault\(\)/);
  assert.match(main, /noteWebPageLoaded: \(url\) => dayOneSignals\.notePageLoaded\(url\)/);
});

test('only history-eligible, non-wake top-level commits count as browsing', () => {
  assert.match(
    tabView,
    /if \(tab\.historyEligible && !noteWakeSuppressed\(tab\)\) \{\s*history\.addVisit\(url, wc\.getTitle\(\)\);\s*deps\.noteWebPageLoaded\?\.\(url\);\s*\}/,
  );
  assert.equal(tabView.match(/noteWebPageLoaded/g).length, 1, 'never from in-page or subframe navigation');
});

test('no renderer or internal-page path can send a first-day signal', () => {
  for (const [label, text] of [['tab-preload', preload], ['pages', pages], ['newtab', newtab], ['onboarding', onboarding]]) {
    assert.doesNotMatch(text, /day1_|sendDayOneSignal|markDayOneSent/, label);
  }
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/unit/product-usage-wiring.test.js`
Expected: FAIL on the first two new tests.

- [ ] **Step 3: Hook the browsing count in `tab-view.js`**

Replace line 366:

```js
    if (tab.historyEligible && !noteWakeSuppressed(tab)) history.addVisit(url, wc.getTitle());
```

with:

```js
    if (tab.historyEligible && !noteWakeSuppressed(tab)) {
      history.addVisit(url, wc.getTitle());
      // First-day browsing signal: same eligibility as history (no private
      // tabs, no >= 400, no quiet-tab wake reloads); the scheme check is in
      // day-one-signals.js. Optional so tests can wire tabs without it.
      deps.noteWebPageLoaded?.(url);
    }
```

- [ ] **Step 4: Wire `main.js`**

Extend the telemetry import (lines 126–131):

```js
const {
  sendLaunchPing,
  sendMahjongPlay,
  sendNewtabLayoutUsed,
  sendDayOneSignal,
  installMeta,
  markDayOneSent,
  productUsageAllowed,
} = require('./telemetry');
const { createDayOneSignals } = require('./day-one-signals');
const { createDefaultBrowserStatus } = require('./default-browser-status');
const { execFileSync } = require('node:child_process');
```

(`main.js` does not import `execFileSync` today; verified 2026-10-09.)

Replace `maybeSendLaunchPing` (lines 1508–1517) with:

```js
let launchPingSent = false;
const defaultBrowserStatus = createDefaultBrowserStatus({ app, platform: process.platform, execFileSync });
// First-day retention signals (spec 2026-10-09). Same consent rule as every
// other event, plus: only after this process sent its launch report.
const dayOneSignals = createDayOneSignals({
  readMeta: () => installMeta(),
  markSent: (signal) => markDayOneSent(signal),
  send: (signal) => sendDayOneSignal(signal),
  canSend: () => app.isPackaged
    && settings.isFirstRunComplete()
    && settings.getSettings().usagePing === true
    && launchPingSent,
  isDefaultBrowser: () => defaultBrowserStatus().isDefault,
});
function maybeSendLaunchPing() {
  if (
    launchPingSent ||
    !settings.isFirstRunComplete() ||
    !settings.getSettings().usagePing
  ) return;
  launchPingSent = true;
  sendLaunchPing();
  dayOneSignals.start();
}
```

In the `initTabView({ … })` call (line 5510), add next to `noteMainFrameCommitted`:

```js
  noteWebPageLoaded: (url) => dayOneSignals.notePageLoaded(url),
```

In the `setupPages({ … })` call (around line 9562), add a top-level hook:

```js
    defaultBrowserChanged: () => dayOneSignals.checkDefault(),
```

- [ ] **Step 5: Run the tests and checks**

Run:

```bash
node --test test/unit/product-usage-wiring.test.js test/unit/tab-view.test.js test/unit/day-one-signals.test.js
npm run lint
npm run browser-api:check
```

Expected: PASS, no lint warnings, contract check clean.

- [ ] **Step 6: Launch the dev app once**

Run `npm start`, open a few web pages and Settings → Default browser, and confirm no errors in the terminal. (Dev builds never send; this only proves the wiring loads.) Quit, then relaunch `npm start` and leave it open.

- [ ] **Step 7: Refresh the audit inventory and commit** (after `/verify` and `/simplify`)

```bash
npm run audit-inventory:write
git add src/main/main.js src/main/tab-view.js test/unit/product-usage-wiring.test.js security/audit-surface-inventory.json
git commit -m "Send the first-day default-browser and browsing signals

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Public and internal copy, full checks, PR 2

**Files:**
- Modify: `site/src/pages/privacy.astro:49-53`
- Modify: `site/src/data/support-questions.json:23`, `:111`
- Modify: `spec/features.md` (F21 telemetry paragraph near line 405 and the bullet near line 792), `spec/parity-matrix.md:37`
- Modify: `CLAUDE.md:137`, `AGENTS.md:145` (identical text)
- Test: `test/unit/security-controls.test.js:143-145`

- [ ] **Step 1: Write the failing test**

In `test/unit/security-controls.test.js`, after the `newtab_layout` assertion add:

```js
  assert.match(privacy, /<code>day1_default<\/code>/);
  assert.match(privacy, /<code>day1_browsed<\/code>/);
  assert.match(privacy, /not sent to the Google Analytics mirror/);
```

Run: `node --test test/unit/security-controls.test.js`
Expected: FAIL.

- [ ] **Step 2: Update the privacy page**

In `site/src/pages/privacy.astro`, insert after the feature-use paragraph (the one ending "never sent from private tabs.</p>"):

```html
  <p>In Blanc 1.31.0 and later, on the day Blanc is installed it may also send each of two first-day events once per installation: <code>day1_default</code> if Blanc is your default browser, and <code>day1_browsed</code> after three web pages open in regular tabs. They carry the same launch fields and nothing else; no address, page, or count is sent, and private tabs and Blanc's own pages are never counted. Blanc keeps the installation time in <code>install.json</code> on your device so it knows when the first day ends; that time is never sent. The collector keeps a per-installation record of these events for about two days, only to count how many new installations return the next day, then keeps only daily totals. These events are not sent to the Google Analytics mirror.</p>
```

In the next paragraph, change "No usage event contains a URL, history, search, page content," to "No usage event contains a URL, history, browsing count, search, page content,".

In the GA sentence, change "Google receives the keyed hash as a client ID plus the same version" to "Google receives, for the launch and feature-use events only, the keyed hash as a client ID plus the same version".

Change the last paragraph's final sentence to: "Turning the ping off stops future events; resetting the ID makes any future enabled event appear as a new installation and restarts the first-day window."

- [ ] **Step 3: Update the FAQ**

In `site/src/data/support-questions.json` line 23, replace the last sentence "If its optional Google Analytics mirror is configured, Google receives that hash and the same limited event fields." with:

```
Blanc 1.31.0 and later can also send two first-day events once per installation, on the day it is installed: one if Blanc is your default browser and one after three web pages open in regular tabs. They carry no addresses or page counts. If the collector's optional Google Analytics mirror is configured, Google receives that hash and the same limited fields for launch and feature-use events only.
```

On line 111, append to the answer: ` Blanc 1.31.0 and later also notes, once, on its first day, whether it is your default browser and whether three web pages were opened, without any addresses.`

- [ ] **Step 4: Update the spec docs and agent files**

- `spec/parity-matrix.md` F21 row: after "each rendered start-page layout." insert " Desktop 1.31.0+ also sends two once-per-install first-day signals (default browser; three web pages opened) used only for next-day return."
- `spec/features.md` F21 telemetry paragraph (near line 405): append "Desktop 1.31.0 and later may also send `{event:'day1_default'}` and `{event:'day1_browsed'}` once per installation within 24 hours of the install time recorded in `install.json`; see `docs/superpowers/specs/2026-10-09-first-day-retention-signals-design.md`."
- `CLAUDE.md` and `AGENTS.md` telemetry paragraph (PR 1 already describes the collector side): replace "No released desktop build sends them yet." with "Desktop 1.31.0+ sends each at most once per installation within 24 hours of the `install.json` `createdAt`, two minutes after the launch report (`src/main/day-one-signals.js`)." Then run `diff <(grep day1_default CLAUDE.md) <(grep day1_default AGENTS.md)` and confirm no output.
- `docs/marketing-claims.md`: read it and confirm nothing needs to change; these signals are a privacy disclosure, not a marketing claim, and no marketing copy may present them as more than counting.

- [ ] **Step 5: Run every gate**

```bash
npm run test:unit
npm run lint
npm run substrate:check
npm run test:acceptance:dry
cd site && npm run build && cd ..
```

Expected: all PASS. If a public-copy guard (`public-truth`, claims ledgers, prose guard) fails because of the new sentences, update that guard's expected text in this same commit; never loosen a test to pass.

- [ ] **Step 6: Commit and open PR 2**

```bash
git add site/src/pages/privacy.astro site/src/data/support-questions.json spec/features.md spec/parity-matrix.md CLAUDE.md AGENTS.md test/unit/security-controls.test.js
git commit -m "Disclose the first-day signals on the privacy page and FAQ

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin first-day-signals-app
gh pr create --title "Send first-day retention signals" --body "$(cat <<'EOF'
App half of docs/superpowers/specs/2026-10-09-first-day-retention-signals-design.md. The collector half is already deployed.

- `install.json` records install time; installs that predate this are marked legacy and never send.
- `day1_default` / `day1_browsed`, each once per install within 24 hours, after the launch report, with saved consent, never from private tabs.
- Privacy page, FAQ, F21 spec and agent docs disclose both events ("Blanc 1.31.0 and later"; release prep updates the number if the version differs).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Merge when every check passes. Release prep: if the release is not 1.31.0, update "1.31.0" in `privacy.astro`, `support-questions.json` (two places), `spec/parity-matrix.md`, `spec/features.md`, `CLAUDE.md`/`AGENTS.md`, `cloudflare/ping-worker/README.md` and **`DAY_ONE_SIGNALS_MIN_VERSION` in `cloudflare/ping-worker/src/index.js`** (a collector redeploy, which needs the owner's "deploy"), and include the new privacy paragraph in that release's website claims ledger.

### Task 9: After the release is public

- [ ] **Step 1: Live proof, release day + 1** — `/stats` shows `nextDayReturn.byDay[<release day>].signals.default.had` or `.browsed.had` greater than 0.
- [ ] **Step 2: Live proof, release day + 2** — the release-day row is `complete: true` and carries `signals`.
- [ ] **Step 3: Update the daily digest** — in `/Users/anthonyjloria/.claude/scheduled-tasks/blanc-daily-analytics/SKILL.md` section 1b, add: read `signals` from the newest complete row; derive "without" figures from the eligible group, never from all new installs (`signals.eligible.installs - had`, `signals.eligible.returnedNextDay - signals.x.returnedNextDay`); report in plain language, e.g. "Of Tuesday's new people, those who made Blanc their default came back 41% of the time; those who didn't, 7%"; flag any group under about 30 people as too small to read; add `signals` to the `next-day-return-history.jsonl` row and the state.json `nextDayReturn` block. Show the owner the edited section before saving it.
