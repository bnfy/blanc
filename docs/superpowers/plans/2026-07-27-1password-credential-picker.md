# 1Password Credential Picker — Ranking + Island UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unusable native multi-match chooser (a horizontal row of ~20 identically-labelled `google.com` buttons) with host-tier ranking that usually removes the picker entirely, plus an Island overlay list labelled by username for when it can't.

**Architecture:** Three separable pieces. (1) Pure ranking in `onepassword.js` — `tierOf`/`rankMatches` keep only the best host tier, deterministically sorted and capped, so `www.google.com` collapses 20 candidates to 1 and no picker appears. (2) `revealUsernames`, a sequential, capped, injectable-client enumeration that reads *only* usernames and releases each decrypted item before the next. (3) A `'credential-picker'` overlay mode with a single exactly-once `settleCredentialPick` owner in main, a two-stage-validated reply channel, and `textContent`-only rendering of untrusted vault strings.

**Tech Stack:** Electron main + the existing overlay `WebContentsView`, `@1password/sdk@0.4.0`, Node's `node --test`, and the existing Cucumber + Playwright-Electron acceptance harness for the real-DOM assertion.

**Spec:** [`docs/superpowers/specs/2026-07-27-1password-credential-picker-design.md`](../specs/2026-07-27-1password-credential-picker-design.md) (rev. 4)

## Global Constraints

*Every task's requirements implicitly include this section. Values copied verbatim from the spec.*

- **Scope: personal dev build.** Distribution stays shelved pending §4.1(e) ([`1password-legal-inquiry.md`](../../1password-legal-inquiry.md)). The code keeps its `SPIKE` framing and dev env-gating.
- **`PICKER_MAX = 10`.** Applied after ranking and sorting, before any decryption.
- **Orchestration order is load-bearing** — `findLogins` → `rankMatches` → **inspect** → reject unsafe → **consent** → *(only if `kept.length > 1`)* `revealUsernames` → picker → re-validate → `revealCredential` → fill. Dropping the picker in at the old chooser's position would decrypt up to ten items on search and signup pages.
- **The binding-less logging boundary moves to the first `items.get()`.** Steps before it may log `setup-error` with a message; everything from `revealUsernames` onward logs a fixed `fill-error` and never an SDK string.
- **`kept.length === 1` → no picker, no enumeration.** `kept.length === 0` → log `no-match` and stop; never fall back to the unranked list.
- **Sequential enumeration.** `for … await`, each `Item` reference released before the next call. Never `Promise.all` — that would hold ten decrypted items live at once.
- **Only the selected password is deliberately retained or referenced** at fill time. This is a statement about what the code holds, not a guarantee that released strings are collected or zeroed.
- **Rows carry `{ username, title, host, vaultName }` and nothing else** — not `vaultId`, not `itemId`, never a password.
- **Vault strings are untrusted.** `createElement` + `textContent` only; never `innerHTML`/`insertAdjacentHTML`/`outerHTML` in the picker render path.
- **Reply validation is two-stage.** Stage 1 (sender is the overlay `webContents` exactly, pending, mode, `requestId`) failing ⇒ **zero state change**. Only a stage-1-clean reply may be cancelled by a stage-2 (malformed `index`) failure.
- **`reason` enum is closed and total:** `selected`, `dismissed`, `escape`, `invalid-reply`, `mode-replaced`, `hidden`, `blur`, `tab-changed`, `window-closed`, `timeout`. Focus restored only for `selected` (**gated**), `dismissed` and `escape` (best-effort).
- **Workspace.** Execute in the worktree `.claude/worktrees/1password-matching` on `feature/1password-fill`. Baseline before this plan: **375 passing, 0 failures**; every "full suite" step means `npm run test:unit` staying green and growing.

---

## File Structure

- **Modify `src/main/onepassword.js`** (589 lines) — ranking + enumeration:
  - `tierOf`, `rankMatches`, `PICKER_MAX` (Task 1)
  - `findLogins` returns richer metadata (Task 2)
  - `revealUsernames` (Task 3)
- **Modify `src/main/main.js`** — picker lifecycle + orchestration:
  - `settleCredentialPick`, pending state, the `chrome:credential-pick` handler, `isValidPickReply` (Task 4)
  - the reordered `fillActiveTabFrom1Password` (Task 5)
  - `restoreTabFocus`'s `win.focus()` becomes conditional (Task 4)
- **Modify `src/main/preload.js`** — the picker's send/receive bridge (Task 4)
- **Modify `src/renderer/overlay.js`** (1237 lines) — the `'credential-picker'` mode and its `textContent`-only rows (Task 6)
- **Modify `src/renderer/styles.css`** — picker row styling (Task 6)
- **Modify `test/unit/onepassword-match.test.js`** — ranking, enumeration, reply-validation and source-guard tests (Tasks 1–5)
- **Add a scenario under `test/desktop/`** — the adversarial real-DOM fixture (Task 7)

---

### Task 1: `tierOf` + `rankMatches` (pure, deterministic)

The ranking that removes the picker in the common case. Entirely pure, so it is fully unit-testable before anything else exists.

**Files:**
- Modify: `src/main/onepassword.js`
- Test: `test/unit/onepassword-match.test.js`

**Interfaces:**
- Consumes: the existing `normalizeHost(value) → string|null` and `registrableKey(host) → string`.
- Produces:
  - `PICKER_MAX = 10` (exported constant)
  - `tierOf(itemHost, pageHost) → 1 | 2 | 3 | null`
  - `rankMatches(candidates, pageHost) → { tier: number|null, kept: Array, truncated: number }` where each `kept[i]` is the input candidate plus a resolved `host` string. Input candidates are `{ vaultId, vaultName, itemId, title, hosts: string[], updatedAt: Date }`.

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/onepassword-match.test.js`:

```js
// ===========================================================================
// Credential picker — ranking
// ===========================================================================
const { tierOf, rankMatches, PICKER_MAX } = require('../../src/main/onepassword');

/** Candidate factory. `hosts` are already normalized, as findLogins emits them. */
function cnd(over = {}) {
  return {
    vaultId: 'v1', vaultName: 'Personal', itemId: 'i' + Math.random().toString(36).slice(2),
    title: 'google.com', hosts: ['google.com'], updatedAt: new Date('2026-07-12T19:01:42Z'),
    ...over,
  };
}

test('tierOf: exact host is tier 1', () => {
  assert.equal(tierOf('accounts.google.com', 'accounts.google.com'), 1);
});

test('tierOf: page is a subdomain of the item host -> tier 2', () => {
  assert.equal(tierOf('google.com', 'accounts.google.com'), 2);
});

test('tierOf: sibling subdomain -> tier 3', () => {
  assert.equal(tierOf('mail.google.com', 'accounts.google.com'), 3);
});

test('tierOf: different registrable domain -> null', () => {
  assert.equal(tierOf('example.com', 'google.com'), null);
});

test('tierOf: a partial label is not a subdomain match', () => {
  // "notgoogle.com" must not read as a subdomain of "google.com".
  assert.equal(tierOf('google.com', 'notgoogle.com'), null);
});

test('rankMatches: keeps ONLY the best tier', () => {
  const r = rankMatches([
    cnd({ itemId: 'a', hosts: ['mail.google.com'] }),        // tier 3
    cnd({ itemId: 'b', hosts: ['google.com'] }),             // tier 2
    cnd({ itemId: 'c', hosts: ['accounts.google.com'] }),    // tier 1
  ], 'accounts.google.com');
  assert.equal(r.tier, 1);
  assert.deepEqual(r.kept.map((k) => k.itemId), ['c']);
  assert.equal(r.truncated, 0);
});

test('rankMatches: resolves the host that earned the tier', () => {
  const r = rankMatches([cnd({ hosts: ['zz.google.com', 'accounts.google.com'] })], 'accounts.google.com');
  assert.equal(r.kept[0].host, 'accounts.google.com');
});

test('rankMatches: equal-tier hosts resolve to the lexicographically smallest', () => {
  // Both are tier 3; the displayed host must not depend on array order.
  const a = rankMatches([cnd({ hosts: ['zz.google.com', 'aa.google.com'] })], 'accounts.google.com');
  const b = rankMatches([cnd({ hosts: ['aa.google.com', 'zz.google.com'] })], 'accounts.google.com');
  assert.equal(a.kept[0].host, 'aa.google.com');
  assert.equal(b.kept[0].host, 'aa.google.com');
});

test('rankMatches: sorts by updatedAt descending', () => {
  const r = rankMatches([
    cnd({ itemId: 'old', updatedAt: new Date('2020-01-01') }),
    cnd({ itemId: 'new', updatedAt: new Date('2026-01-01') }),
  ], 'google.com');
  assert.deepEqual(r.kept.map((k) => k.itemId), ['new', 'old']);
});

test('rankMatches: identical updatedAt is broken deterministically', () => {
  // This vault's items were bulk-imported and share a timestamp to the second,
  // so the comparator must fall through to title -> host -> itemId.
  const same = new Date('2026-07-12T19:01:42Z');
  const input = [
    cnd({ itemId: 'i3', title: 'b', hosts: ['google.com'], updatedAt: same }),
    cnd({ itemId: 'i1', title: 'a', hosts: ['google.com'], updatedAt: same }),
    cnd({ itemId: 'i2', title: 'a', hosts: ['google.com'], updatedAt: same }),
  ];
  const forward = rankMatches(input, 'google.com').kept.map((k) => k.itemId);
  const reversed = rankMatches([...input].reverse(), 'google.com').kept.map((k) => k.itemId);
  assert.deepEqual(forward, ['i1', 'i2', 'i3']);
  assert.deepEqual(reversed, forward, 'input order must not affect the result');
});

test('rankMatches: caps at PICKER_MAX and reports the remainder', () => {
  const input = Array.from({ length: 17 }, (_, n) =>
    cnd({ itemId: 'i' + String(n).padStart(2, '0'), hosts: ['google.com'] }));
  const r = rankMatches(input, 'google.com');
  assert.equal(PICKER_MAX, 10);
  assert.equal(r.kept.length, 10);
  assert.equal(r.truncated, input.length - 10);
});

test('rankMatches: no candidate reaches a tier -> empty, defensive', () => {
  const r = rankMatches([cnd({ hosts: ['example.com'] })], 'google.com');
  assert.deepEqual(r.kept, []);
  assert.equal(r.tier, null);
  assert.equal(r.truncated, 0);
});

test('rankMatches: empty input is safe', () => {
  assert.deepEqual(rankMatches([], 'google.com'), { tier: null, kept: [], truncated: 0 });
});

test('rankMatches: real-vault shape — www.google.com collapses to one', () => {
  // Derived from the 2026-07-27 vault probe: one item saved for google.com,
  // the rest for accounts.google.com / mail.google.com.
  const input = [
    cnd({ itemId: 'bare', hosts: ['google.com'] }),
    ...Array.from({ length: 17 }, (_, n) => cnd({ itemId: 'acc' + n, hosts: ['accounts.google.com'] })),
    cnd({ itemId: 'mail', hosts: ['mail.google.com'] }),
  ];
  // Pass the RAW page host so normalization is exercised end-to-end rather than
  // pre-applied by the test. normalizeHost strips a leading `www.`, so this
  // reduces to `google.com` and the bare item is tier 1.
  const r = rankMatches(input, 'www.google.com');
  assert.equal(r.tier, 1);
  assert.deepEqual(r.kept.map((k) => k.itemId), ['bare'], 'ranking must remove the picker here');
});

test('rankMatches: real-vault shape — accounts.google.com keeps only tier 1, capped', () => {
  const tier1 = Array.from({ length: 17 }, (_, n) =>
    cnd({ itemId: 'acc' + String(n).padStart(2, '0'), hosts: ['accounts.google.com'] }));
  const input = [cnd({ itemId: 'bare', hosts: ['google.com'] }), ...tier1,
    cnd({ itemId: 'mail', hosts: ['mail.google.com'] })];
  const r = rankMatches(input, 'accounts.google.com');
  assert.equal(r.tier, 1);
  assert.equal(r.kept.length, PICKER_MAX);
  assert.equal(r.truncated, tier1.length - PICKER_MAX);
  assert.ok(r.kept.every((k) => k.itemId.startsWith('acc')), 'no tier-2 or tier-3 item may survive');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/unit/onepassword-match.test.js`
Expected: FAIL — `tierOf is not a function`.

- [ ] **Step 3: Implement**

In `src/main/onepassword.js`, insert immediately **after** the `matchesHost` function (it ends with the closing `}` of the `itemUrls.some(...)` return, around line 45) and before the `/* ----- Field selection` banner:

```js
/** How many candidates the picker may show — and therefore the maximum number
 * of items whose usernames are decrypted. */
const PICKER_MAX = 10;

/** How well an item's website host fits the page. Lower is better.
 *   1 — the same host
 *   2 — the item covers the page's parent domain (item google.com, page accounts.google.com)
 *   3 — same registrable domain, unrelated subdomain (item mail.google.com)
 *   null — unrelated (matchesHost should already have excluded these)
 * Both arguments are expected to be normalizeHost output. */
function tierOf(itemHost, pageHost) {
  if (!itemHost || !pageHost) return null;
  if (itemHost === pageHost) return 1;
  // The leading dot matters: "notgoogle.com" must not read as a subdomain of
  // "google.com".
  if (pageHost.endsWith('.' + itemHost)) return 2;
  if (registrableKey(itemHost) === registrableKey(pageHost)) return 3;
  return null;
}

/** Keep only the best-fitting tier of candidates, deterministically ordered and
 * capped. One survivor means no picker is needed at all — which is the point:
 * a registrable-domain match otherwise drags in a site's whole item family. */
function rankMatches(candidates, pageHost) {
  const page = normalizeHost(pageHost);
  const scored = [];
  for (const c of Array.isArray(candidates) ? candidates : []) {
    let best = null;
    let bestHost = null;
    for (const h of Array.isArray(c.hosts) ? c.hosts : []) {
      const t = tierOf(h, page);
      if (t === null) continue;
      // Equal tiers resolve to the lexicographically smaller host so the
      // displayed value doesn't depend on array order.
      if (best === null || t < best || (t === best && h < bestHost)) {
        best = t;
        bestHost = h;
      }
    }
    if (best !== null) scored.push({ ...c, tier: best, host: bestHost });
  }
  if (!scored.length) return { tier: null, kept: [], truncated: 0 };

  const tier = Math.min(...scored.map((s) => s.tier));
  const inTier = scored.filter((s) => s.tier === tier);

  // Deterministic total order. updatedAt alone is not enough: bulk-imported
  // items share a timestamp to the second, which would leave the surviving
  // PICKER_MAX at the mercy of SDK listing order.
  inTier.sort((a, b) => {
    const at = a.updatedAt instanceof Date ? a.updatedAt.getTime() : 0;
    const bt = b.updatedAt instanceof Date ? b.updatedAt.getTime() : 0;
    if (at !== bt) return bt - at;                                  // newest first
    if (a.title !== b.title) return String(a.title) < String(b.title) ? -1 : 1;
    if (a.host !== b.host) return a.host < b.host ? -1 : 1;
    return String(a.itemId) < String(b.itemId) ? -1 : 1;
  });

  return { tier, kept: inTier.slice(0, PICKER_MAX), truncated: Math.max(0, inTier.length - PICKER_MAX) };
}
```

Then extend the exports line at the bottom of the file to include `PICKER_MAX`, `tierOf`, `rankMatches`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/unit/onepassword-match.test.js`
Expected: PASS — all ranking cases green.

- [ ] **Step 5: Full suite + syntax**

Run: `node --check src/main/onepassword.js && npm run test:unit`
Expected: `node --check` silent; suite PASS, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/main/onepassword.js test/unit/onepassword-match.test.js
git commit -m "feat(1password): host-tier ranking so the picker is rare"
```

---

### Task 2: `findLogins` returns the metadata ranking needs

`rankMatches` needs `hosts`, `updatedAt` and `vaultName`; `findLogins` currently returns only `{ vaultId, itemId, title }`. Small change, but it is the seam between the SDK and the pure ranking, so it gets its own gate.

**Files:**
- Modify: `src/main/onepassword.js` (the `findLogins` function)

**Interfaces:**
- Consumes: `matchesHost`, `normalizeHost`, the SDK's `vaults.list()` / `items.list(vaultId)`.
- Produces: `findLogins(expectedHost) → Promise<Array<{ vaultId, vaultName, itemId, title, hosts: string[], updatedAt: Date }>>` — the exact input shape `rankMatches` consumes.

- [ ] **Step 1: Replace the function body**

In `src/main/onepassword.js`, replace the whole `findLogins` function with:

```js
/** Match Login items against `expectedHost` on OVERVIEWS only — no secret is
 * decrypted here. Returns the metadata rankMatches needs: normalized hosts, the
 * vault's display name, and updatedAt for ordering. Skips a vault that can't be
 * listed rather than aborting the whole search. */
async function findLogins(expectedHost) {
  const client = await getClient();
  const matches = [];
  const vaults = await client.vaults.list();
  for (const vault of vaults) {
    let overviews;
    try {
      overviews = await client.items.list(vault.id);
    } catch {
      continue; // inaccessible vault — skip, don't abort the whole search
    }
    for (const ov of overviews) {
      if (ov.category !== 'Login') continue;
      const urls = Array.isArray(ov.websites) ? ov.websites.map((w) => w.url) : [];
      if (!matchesHost(urls, expectedHost)) continue;
      // Normalize once here so ranking never re-parses; drop unparseable ones.
      const hosts = [...new Set(urls.map(normalizeHost).filter(Boolean))];
      matches.push({
        vaultId: vault.id,
        vaultName: vault.title || '',
        itemId: ov.id,
        title: ov.title || '',
        hosts,
        updatedAt: ov.updatedAt instanceof Date ? ov.updatedAt : new Date(0),
      });
    }
  }
  return matches;
}
```

- [ ] **Step 2: Verify the shape against the real vault**

This function needs the SDK, so it is checked against the live vault rather than a unit test:

```bash
BLANC_1P_ACCOUNT="<your-account>" node -e "
require('./src/main/onepassword').findLogins('google.com').then((m) => {
  console.log('matches:', m.length);
  const k = Object.keys(m[0] || {}).sort();
  console.log('keys:', k.join(','));
  console.log('sample:', JSON.stringify({ ...m[0], updatedAt: String(m[0].updatedAt) }));
}).catch((e) => console.error('FAILED:', e.message));
"
```
Expected: `keys: hosts,itemId,title,updatedAt,vaultId,vaultName` and a sample whose `hosts` are bare hostnames (e.g. `["accounts.google.com"]`), **not** full URLs.

- [ ] **Step 3: Full suite + syntax**

Run: `node --check src/main/onepassword.js && npm run test:unit`
Expected: `node --check` silent; suite PASS (no unit test asserts `findLogins` directly — it requires the SDK — but nothing may regress).

- [ ] **Step 4: Commit**

```bash
git add src/main/onepassword.js
git commit -m "feat(1password): findLogins returns hosts, vaultName and updatedAt for ranking"
```

---

### Task 3: `revealUsernames` — sequential, capped, injectable

The first decryption in the flow. Its concurrency and failure behavior are security properties, so the signature carries a client seam that makes them testable without the SDK.

**Files:**
- Modify: `src/main/onepassword.js`
- Test: `test/unit/onepassword-match.test.js`

**Interfaces:**
- Consumes: `getClient()` when no client is injected.
- Produces: `revealUsernames(candidates, { client } = {}) → Promise<Array<{ vaultId, vaultName, itemId, title, host, updatedAt, username: string|null }>>`. Never returns a password. Rejects if any `items.get()` rejects.

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/onepassword-match.test.js`:

```js
// ===========================================================================
// Credential picker — username enumeration
// ===========================================================================
const { revealUsernames } = require('../../src/main/onepassword');

/** A fake SDK client that records peak concurrency and can fail on demand. */
function fakeClient({ failAt = null } = {}) {
  const state = { inFlight: 0, peak: 0, calls: 0 };
  return {
    state,
    items: {
      async get(vaultId, itemId) {
        state.calls += 1;
        state.inFlight += 1;
        state.peak = Math.max(state.peak, state.inFlight);
        await new Promise((r) => setImmediate(r)); // force a real await point
        try {
          if (failAt !== null && state.calls === failAt) throw new Error('SDK-SECRET-DETAIL');
          return {
            fields: [
              { id: 'username', value: 'user-' + itemId },
              { id: 'password', value: 'PASSWORD-' + itemId },
            ],
          };
        } finally {
          state.inFlight -= 1;
        }
      },
    },
  };
}

function pcnd(n) {
  return {
    vaultId: 'v1', vaultName: 'Personal', itemId: 'i' + n, title: 'google.com',
    host: 'accounts.google.com', updatedAt: new Date('2026-07-12T19:01:42Z'),
  };
}

test('revealUsernames: returns usernames and NEVER a password', async () => {
  const client = fakeClient();
  const rows = await revealUsernames([pcnd(1), pcnd(2)], { client });
  assert.deepEqual(rows.map((r) => r.username), ['user-i1', 'user-i2']);
  for (const r of rows) {
    assert.ok(!('password' in r), 'no password key may exist on a row');
    assert.ok(!JSON.stringify(r).includes('PASSWORD-'), 'no password value may survive');
  }
});

test('revealUsernames: holds at most ONE decrypted item at a time', async () => {
  const client = fakeClient();
  await revealUsernames(Array.from({ length: 10 }, (_, n) => pcnd(n)), { client });
  assert.equal(client.state.peak, 1,
    'Promise.all would hold ten decrypted items live — enumeration must be sequential');
  assert.equal(client.state.calls, 10);
});

test('revealUsernames: a mid-list failure rejects and yields no partial list', async () => {
  const client = fakeClient({ failAt: 3 });
  await assert.rejects(
    () => revealUsernames(Array.from({ length: 10 }, (_, n) => pcnd(n)), { client }),
    /SDK-SECRET-DETAIL/,
    'it must reject so the caller can abort the whole picker'
  );
  assert.equal(client.state.calls, 3, 'it must stop at the failure, not continue the list');
});

test('revealUsernames: a missing username field yields null, not a throw', async () => {
  const client = {
    items: { async get() { return { fields: [{ id: 'password', value: 'x' }] }; } },
  };
  const rows = await revealUsernames([pcnd(1)], { client });
  assert.equal(rows[0].username, null);
});

test('revealUsernames: carries the ranking metadata through unchanged', async () => {
  const rows = await revealUsernames([pcnd(1)], { client: fakeClient() });
  assert.equal(rows[0].host, 'accounts.google.com');
  assert.equal(rows[0].vaultName, 'Personal');
  assert.equal(rows[0].itemId, 'i1');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/unit/onepassword-match.test.js`
Expected: FAIL — `revealUsernames is not a function`.

- [ ] **Step 3: Implement**

In `src/main/onepassword.js`, add immediately after `revealCredential`:

```js
/** Read the usernames of the ranked candidates so the picker can label its rows.
 *
 * This is the one place that decrypts more than a single item, and it is
 * deliberately bounded: the caller has already capped the list at PICKER_MAX and
 * only reaches here when a picker is genuinely needed. Two properties matter:
 *
 *  - SEQUENTIAL. `Promise.all` would hold every decrypted Item — passwords
 *    included — live at once. The loop releases each before the next call.
 *  - NO PASSWORD ESCAPES. Rows are built fresh; the Item is never attached.
 *
 * `client` is injectable so the concurrency and failure contracts can be tested
 * without the SDK. A rejection here must abort the whole picker (fixed
 * `fill-error`), never show a partial list. */
async function revealUsernames(candidates, { client } = {}) {
  const sdk = client || (await getClient());
  const rows = [];
  for (const c of candidates) {
    let item = await sdk.items.get(c.vaultId, c.itemId);
    const fields = Array.isArray(item.fields) ? item.fields : [];
    const found = fields.find((f) => f.id === 'username');
    const username = found && typeof found.value === 'string' ? found.value : null;
    item = null; // release before the next decrypt
    rows.push({
      vaultId: c.vaultId,
      vaultName: c.vaultName,
      itemId: c.itemId,
      title: c.title,
      host: c.host,
      updatedAt: c.updatedAt,
      username,
    });
  }
  return rows;
}
```

Then add `revealUsernames` to the exports line.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/unit/onepassword-match.test.js`
Expected: PASS — including `peak === 1`.

- [ ] **Step 5: Full suite + syntax**

Run: `node --check src/main/onepassword.js && npm run test:unit`
Expected: `node --check` silent; suite PASS, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/main/onepassword.js test/unit/onepassword-match.test.js
git commit -m "feat(1password): sequential capped username enumeration for the picker"
```

---

### Task 4: `credential-picker.js` — the lifecycle controller

The spec requires **behavioral** proof that a stale reply leaves the live request
pending, that settlement is idempotent, and that the reason enum drives focus
policy. Source-presence assertions cannot prove any of that, so the lifecycle
moves into its own module whose Electron collaborators are injected. `main.js`
wires the real ones; the tests wire fakes.

**Files:**
- Create: `src/main/credential-picker.js`
- Test: `test/unit/credential-picker.test.js`

**Interfaces:**
- Consumes: `isValidPickIndex` (Task 4 Step 3 adds it to `onepassword.js`).
- Produces: `createPickerController(deps) → { requestPick, settle, handleReply, isPending }` where
  `deps = { showOverlay, hideOverlay, getOverlayMode, isOverlaySender, randomUUID, setTimer, clearTimer, timeoutMs }`.
  `requestPick(rows, truncated, host) → Promise<{ index: number|null, reason: string }>`.

- [ ] **Step 1: Add the pure index validator**

In `src/main/onepassword.js`, add after `rankMatches`, and add `isValidPickIndex` to the exports:

```js
/** Stage-2 reply validation: `null` cancels, otherwise it must be an integer
 * index into the candidate list. Fractional, negative, out-of-range, NaN,
 * string, and MISSING values all fail closed — a payload with no `index` is
 * malformed, not a dismissal. Pure so the rejection cases are testable. */
function isValidPickIndex(index, len) {
  if (index === null) return true;
  return Number.isInteger(index) && index >= 0 && index < len;
}
```

- [ ] **Step 2: Write the failing behavioral tests**

Create `test/unit/credential-picker.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPickerController } = require('../../src/main/credential-picker');

/** A controller wired to fakes, with handles to inspect what it did. */
function harness({ overlayAvailable = true, overlayThrows = false } = {}) {
  const calls = { shown: [], hidden: 0, timers: 0, cleared: 0 };
  let mode = null;
  let timerFn = null;
  const ctl = createPickerController({
    showOverlay: (m, opts) => {
      // Mirror the REAL failure shape: the live showOverlay sets overlayMode and
      // overlayPrefill before addChildView/send/focus, so a throw can leave that
      // state behind. Setting mode first is what lets the test catch a partial
      // failure rather than a tidy no-op.
      if (overlayThrows) { mode = m; throw new Error('overlay is gone'); }
      if (!overlayAvailable) return false;   // mirrors main's live-window guard
      mode = m; calls.shown.push(opts); return true;
    },
    hideOverlay: () => { mode = null; calls.hidden += 1; },
    getOverlayMode: () => mode,
    isOverlaySender: (event) => event && event.fromOverlay === true,
    randomUUID: () => 'req-1',
    setTimer: (fn) => { timerFn = fn; calls.timers += 1; return 'T'; },
    clearTimer: () => { calls.cleared += 1; },
    timeoutMs: 60000,
  });
  return { ctl, calls, fireTimeout: () => timerFn && timerFn(), getMode: () => mode };
}

const ROWS = [{ username: 'a@x', title: 't', host: 'h', vaultName: 'Personal' }, { username: 'b@x', title: 't', host: 'h', vaultName: 'Personal' }];

test('picker: a valid reply resolves with the chosen index', async () => {
  const h = harness();
  const p = h.ctl.requestPick(ROWS, 0, 'x.test');
  h.ctl.handleReply({ fromOverlay: true }, { requestId: 'req-1', index: 1 });
  assert.deepEqual(await p, { index: 1, reason: 'selected' });
});

test('picker: an explicit null index is a dismissal', async () => {
  const h = harness();
  const p = h.ctl.requestPick(ROWS, 0, 'x.test');
  h.ctl.handleReply({ fromOverlay: true }, { requestId: 'req-1', index: null });
  assert.deepEqual(await p, { index: null, reason: 'dismissed' });
});

test('picker: a MISSING index is malformed, not a dismissal', async () => {
  const h = harness();
  const p = h.ctl.requestPick(ROWS, 0, 'x.test');
  h.ctl.handleReply({ fromOverlay: true }, { requestId: 'req-1' });
  assert.deepEqual(await p, { index: null, reason: 'invalid-reply' });
});

test('picker: a WRONG-SENDER reply leaves the request pending', async () => {
  const h = harness();
  const p = h.ctl.requestPick(ROWS, 0, 'x.test');
  h.ctl.handleReply({ fromOverlay: false }, { requestId: 'req-1', index: 0 });
  assert.equal(h.ctl.isPending(), true, 'stage-1 failure must change NO state');
  // ...and a later valid reply still works.
  h.ctl.handleReply({ fromOverlay: true }, { requestId: 'req-1', index: 0 });
  assert.deepEqual(await p, { index: 0, reason: 'selected' });
});

test('picker: a STALE requestId leaves the request pending', async () => {
  const h = harness();
  const p = h.ctl.requestPick(ROWS, 0, 'x.test');
  h.ctl.handleReply({ fromOverlay: true }, { requestId: 'OLD', index: 0 });
  assert.equal(h.ctl.isPending(), true, 'a late reply from a closed picker must not cancel a live one');
  h.ctl.handleReply({ fromOverlay: true }, { requestId: 'req-1', index: 1 });
  assert.deepEqual(await p, { index: 1, reason: 'selected' });
});

test('picker: an out-of-range index cancels THIS request as invalid-reply', async () => {
  for (const bad of [-1, 2, 1.5, '0', NaN]) {
    const h = harness();
    const p = h.ctl.requestPick(ROWS, 0, 'x.test');
    h.ctl.handleReply({ fromOverlay: true }, { requestId: 'req-1', index: bad });
    assert.deepEqual(await p, { index: null, reason: 'invalid-reply' }, `${String(bad)}`);
  }
});

test('picker: settlement is exactly-once', async () => {
  const h = harness();
  const p = h.ctl.requestPick(ROWS, 0, 'x.test');
  h.ctl.settle(0, 'selected');
  h.ctl.settle(null, 'timeout');          // must be inert
  h.ctl.settle(null, 'blur');             // must be inert
  assert.deepEqual(await p, { index: 0, reason: 'selected' });
  assert.equal(h.ctl.isPending(), false);
  assert.equal(h.calls.cleared, 1, 'the timer is cleared exactly once');
});

test('picker: the timeout settles the request', async () => {
  const h = harness();
  const p = h.ctl.requestPick(ROWS, 0, 'x.test');
  h.fireTimeout();
  assert.deepEqual(await p, { index: null, reason: 'timeout' });
});

test('picker: every cancellation reason resolves the promise', async () => {
  for (const reason of ['escape', 'blur', 'mode-replaced', 'hidden', 'tab-changed', 'window-closed']) {
    const h = harness();
    const p = h.ctl.requestPick(ROWS, 0, 'x.test');
    h.ctl.settle(null, reason);
    assert.deepEqual(await p, { index: null, reason }, reason);
  }
});

test('picker: an unavailable overlay settles immediately instead of hanging', async () => {
  const h = harness({ overlayAvailable: false });
  const p = h.ctl.requestPick(ROWS, 0, 'x.test');
  assert.deepEqual(await p, { index: null, reason: 'window-closed' },
    'a failed show must not leave the fill awaiting a 60s timeout');
  assert.equal(h.ctl.isPending(), false, 'no stale pending state may survive a failed show');
});

test('picker: a PARTIAL (thrown) show settles and tears the overlay back down', async () => {
  // The real showOverlay assigns overlayMode/overlayPrefill before it can throw,
  // so a throw may leave vault rows resident. Clearing only our own pending
  // state would strand them.
  const h = harness({ overlayThrows: true });
  const p = h.ctl.requestPick(ROWS, 0, 'x.test');
  assert.deepEqual(await p, { index: null, reason: 'window-closed' });
  assert.equal(h.ctl.isPending(), false, 'a thrown show must leave no stale pending state');
  assert.equal(h.calls.hidden, 1, 'the partially-shown overlay must be torn down');
  assert.equal(h.getMode(), null, 'no vault rows may remain resident after a failed show');
});

test('picker: rows reach the overlay with exactly four keys', async () => {
  const h = harness();
  const p = h.ctl.requestPick(ROWS, 3, 'x.test');
  const sent = h.calls.shown[0].prefill;
  assert.equal(sent.truncated, 3);
  for (const row of sent.rows) {
    assert.deepEqual(Object.keys(row).sort(), ['host', 'title', 'username', 'vaultName']);
  }
  h.ctl.settle(null, 'escape');
  await p;
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test test/unit/credential-picker.test.js`
Expected: FAIL — `Cannot find module '../../src/main/credential-picker'`.

- [ ] **Step 4: Implement the controller**

Create `src/main/credential-picker.js`:

```js
'use strict';
// SPIKE (1Password fill feasibility) — remove before release.
//
// The exactly-once owner of credential-picker resolution. Every route that can
// end a picker goes through `settle`, or the fill would await a promise that
// never resolves and wedge the single-flight flag. Electron collaborators are
// injected so the lifecycle contracts are testable without a window.
const { isValidPickIndex } = require('./onepassword');

/** Closed reason enum. Focus policy is derived from it, so there is no default. */
const PICK_REASONS = Object.freeze([
  'selected', 'dismissed', 'escape', 'invalid-reply',
  'mode-replaced', 'hidden', 'blur', 'tab-changed', 'window-closed', 'timeout',
]);

function createPickerController({
  showOverlay, hideOverlay, getOverlayMode, isOverlaySender,
  randomUUID, setTimer, clearTimer, timeoutMs,
}) {
  let pending = null; // { requestId, rowCount, resolve, timer }

  /** Resolve exactly once. State is cleared BEFORE resolving so anything running
   * synchronously off the resolution cannot observe a half-torn-down request. */
  function settle(index, reason) {
    const p = pending;
    if (!p) return;                       // already settled, or none open
    pending = null;
    clearTimer(p.timer);
    if (getOverlayMode() === 'credential-picker') hideOverlay();
    p.resolve({ index, reason });
  }

  function requestPick(rows, truncated, host) {
    return new Promise((resolve) => {
      const requestId = randomUUID();
      pending = { requestId, rowCount: rows.length, resolve, timer: null };
      // Show FIRST, and treat a failed show as window-closed. Installing the
      // pending state and then discovering the overlay is gone would leave the
      // fill waiting out the full timeout.
      // showOverlay can also THROW — and it can throw PARTWAY THROUGH. The real
      // one assigns overlayMode and overlayPrefill before addChildView/send/
      // focus, any of which can fail on a dying window. So a throw does not
      // mean "nothing happened": vault rows may already be sitting in
      // overlayPrefill. Clear the request AND best-effort tear the overlay back
      // down, rather than only dropping our own state.
      let shown = false;
      try {
        shown = showOverlay('credential-picker', { prefill: { requestId, host, rows, truncated } });
      } catch {
        shown = false;
      }
      if (shown !== true) {
        pending = null;
        if (getOverlayMode() === 'credential-picker') {
          try { hideOverlay(); } catch { /* already gone — nothing more to undo */ }
        }
        resolve({ index: null, reason: 'window-closed' });
        return;
      }
      pending.timer = setTimer(() => settle(null, 'timeout'), timeoutMs);
    });
  }

  /** Two stages. Stage 1 proves the reply belongs to THIS request and failing it
   * changes NO state — otherwise a late reply from a closed picker could cancel
   * a different, live one. Only a stage-1-clean reply may be cancelled by a
   * malformed index. */
  function handleReply(event, payload) {
    if (!isOverlaySender(event)) return;                       // overlay only
    if (!pending) return;
    if (getOverlayMode() !== 'credential-picker') return;
    if (!payload || payload.requestId !== pending.requestId) return;
    const index = Object.prototype.hasOwnProperty.call(payload, 'index') ? payload.index : undefined;
    if (!isValidPickIndex(index, pending.rowCount)) return settle(null, 'invalid-reply');
    settle(index, index === null ? 'dismissed' : 'selected');
  }

  return { requestPick, settle, handleReply, isPending: () => pending !== null };
}

module.exports = { createPickerController, PICK_REASONS };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/unit/credential-picker.test.js`
Expected: PASS — all twelve cases.

- [ ] **Step 6: Full suite + syntax**

Run: `node --check src/main/credential-picker.js && npm run test:unit`
Expected: `node --check` silent; suite PASS, 0 failures.

- [ ] **Step 7: Commit**

```bash
git add src/main/credential-picker.js src/main/onepassword.js test/unit/credential-picker.test.js
git commit -m "feat(1password): injectable picker lifecycle controller with behavioral tests"
```

---

### Task 5: `credential-fill-flow.js` — the choose-and-reveal sequence

The other half the spec demands behavioral proof of: a single survivor bypassing
enumeration and the picker, a failed focus restoration never reaching
`revealCredential`, and an enumeration failure never opening a picker or leaking
the SDK message. Extracting this sequence from `main.js` is what makes those
assertable — and it isolates the decision logic from Electron plumbing, which is
worth doing regardless.

**Files:**
- Create: `src/main/credential-fill-flow.js`
- Test: `test/unit/credential-fill-flow.test.js`

**Interfaces:**
- Consumes: nothing from other tasks directly — all collaborators are injected.
- Produces: `chooseAndReveal({ kept, truncated, host, deps }) → Promise<{ outcome, detail?, chosen?, credential? }>` where
  `deps = { revealUsernames, requestPick, restoreTabFocus, revalidate, revealCredential }`.
  `outcome` is one of `'ok'`, `'chooser-cancel'`, `'abort-wc-changed'`, `'fill-error'`, or whatever string `revalidate` returns.

- [ ] **Step 1: Write the failing behavioral tests**

Create `test/unit/credential-fill-flow.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { chooseAndReveal } = require('../../src/main/credential-fill-flow');

function cand(n) {
  return { vaultId: 'v', vaultName: 'Personal', itemId: 'i' + n, title: 't', host: 'h', updatedAt: new Date(0) };
}

/** Collaborators that record what was called, so contracts are asserted on
 * CALLS — not on log text, which would pass even if a decrypt had happened. */
function deps(over = {}) {
  const seen = { revealUsernames: 0, requestPick: 0, restoreTabFocus: 0, revealCredential: 0 };
  return {
    seen,
    async revealUsernames(list) {
      seen.revealUsernames += 1;
      return list.map((c) => ({ ...c, username: 'u-' + c.itemId }));
    },
    async requestPick() { seen.requestPick += 1; return { index: 0, reason: 'selected' }; },
    async restoreTabFocus() { seen.restoreTabFocus += 1; return true; },
    revalidate() { return null; },                 // null = still valid
    async revealCredential() { seen.revealCredential += 1; return { username: 'u', password: 'p' }; },
    ...over,
  };
}

test('flow: ONE survivor bypasses enumeration and the picker entirely', async () => {
  const d = deps();
  const r = await chooseAndReveal({ kept: [cand(1)], truncated: 0, host: 'x.test', deps: d });
  assert.equal(r.outcome, 'ok');
  assert.equal(d.seen.revealUsernames, 0, 'nothing may be decrypted for a single survivor');
  assert.equal(d.seen.requestPick, 0, 'no picker may open for a single survivor');
  assert.equal(d.seen.revealCredential, 1);
});

test('flow: several survivors enumerate then pick', async () => {
  const d = deps();
  const r = await chooseAndReveal({ kept: [cand(1), cand(2)], truncated: 0, host: 'x.test', deps: d });
  assert.equal(r.outcome, 'ok');
  assert.equal(d.seen.revealUsernames, 1);
  assert.equal(d.seen.requestPick, 1);
  assert.equal(r.chosen.itemId, 'i1');
});

test('flow: enumeration failure never opens a picker and never leaks the SDK message', async () => {
  const d = deps({ async revealUsernames() { throw new Error('SDK-SECRET-DETAIL'); } });
  const r = await chooseAndReveal({ kept: [cand(1), cand(2)], truncated: 0, host: 'x.test', deps: d });
  assert.equal(r.outcome, 'fill-error');
  assert.equal(d.seen.requestPick, 0, 'no partial picker may be shown');
  assert.equal(d.seen.revealCredential, 0);
  assert.ok(!JSON.stringify(r).includes('SDK-SECRET-DETAIL'), 'the SDK message must not escape');
});

test('flow: FAILED focus restoration never calls revealCredential', async () => {
  const d = deps({ async restoreTabFocus() { return false; } });
  const r = await chooseAndReveal({ kept: [cand(1), cand(2)], truncated: 0, host: 'x.test', deps: d });
  assert.equal(r.outcome, 'abort-wc-changed');
  assert.equal(d.seen.revealCredential, 0,
    'asserted on the CALL — a log assertion would pass even if the decrypt had happened');
});

test('flow: cancellation restores focus only for dismissed and escape', async () => {
  for (const [reason, expected] of [['dismissed', 1], ['escape', 1], ['blur', 0],
    ['tab-changed', 0], ['window-closed', 0], ['timeout', 0], ['mode-replaced', 0],
    ['hidden', 0], ['invalid-reply', 0]]) {
    const d = deps({ async requestPick() { return { index: null, reason }; } });
    const r = await chooseAndReveal({ kept: [cand(1), cand(2)], truncated: 0, host: 'x.test', deps: d });
    assert.equal(r.outcome, 'chooser-cancel');
    assert.equal(r.detail, reason);
    assert.equal(d.seen.restoreTabFocus, expected, `focus policy for ${reason}`);
    assert.equal(d.seen.revealCredential, 0);
  }
});

test('flow: a failed re-validation after selection aborts before decrypting', async () => {
  const d = deps({ revalidate: () => 'abort-navigated' });
  const r = await chooseAndReveal({ kept: [cand(1), cand(2)], truncated: 0, host: 'x.test', deps: d });
  assert.equal(r.outcome, 'abort-navigated');
  assert.equal(d.seen.revealCredential, 0);
});

test('flow: rows handed to the picker carry exactly four keys', async () => {
  let captured = null;
  const d = deps({ async requestPick(rows) { captured = rows; return { index: 0, reason: 'selected' }; } });
  await chooseAndReveal({ kept: [cand(1), cand(2)], truncated: 0, host: 'x.test', deps: d });
  for (const row of captured) {
    assert.deepEqual(Object.keys(row).sort(), ['host', 'title', 'username', 'vaultName'],
      'no vaultId, no itemId, never a password');
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/unit/credential-fill-flow.test.js`
Expected: FAIL — `Cannot find module '../../src/main/credential-fill-flow'`.

- [ ] **Step 3: Implement**

Create `src/main/credential-fill-flow.js`:

```js
'use strict';
// SPIKE (1Password fill feasibility) — remove before release.
//
// The post-consent decision sequence: choose a credential (picker if needed) and
// read it. Collaborators are injected so the security contracts — one survivor
// never decrypts, a failed focus restoration never reaches revealCredential, an
// enumeration failure never opens a picker — are asserted on CALLS rather than
// on log text.

/** Reasons where the user is demonstrably still in Blanc acting on the picker,
 * so returning focus to the page is right. Everything else may fire while Blanc
 * is in the background, where pulling it forward would be user-hostile. */
const RESTORE_ON_CANCEL = new Set(['dismissed', 'escape']);

async function chooseAndReveal({ kept, truncated, host, deps }) {
  let chosen = kept[0];

  if (kept.length > 1) {
    let rows;
    try {
      // FIRST DECRYPTION. Only reached on a page already judged fillable and
      // already consented to. A failure aborts the whole picker with a fixed
      // outcome — never a partial list, never the SDK's message.
      const revealed = await deps.revealUsernames(kept);
      rows = revealed.map((r) => ({
        username: r.username, title: r.title, host: r.host, vaultName: r.vaultName,
      }));
    } catch {
      return { outcome: 'fill-error' };
    }

    const { index, reason } = await deps.requestPick(rows, truncated, host);
    if (index === null) {
      if (RESTORE_ON_CANCEL.has(reason)) await deps.restoreTabFocus(); // best-effort, ungated
      return { outcome: 'chooser-cancel', detail: reason };
    }
    chosen = kept[index];

    // The overlay took focus. GATE on its return before any further decrypt.
    if (!(await deps.restoreTabFocus())) return { outcome: 'abort-wc-changed' };
    const aborted = deps.revalidate();
    if (aborted) return { outcome: aborted };
  }

  try {
    const credential = await deps.revealCredential(chosen);
    return { outcome: 'ok', chosen, credential };
  } catch {
    return { outcome: 'fill-error' };
  }
}

module.exports = { chooseAndReveal, RESTORE_ON_CANCEL };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/unit/credential-fill-flow.test.js`
Expected: PASS — all seven cases, including the nine-reason focus-policy table.

- [ ] **Step 5: Full suite + syntax**

Run: `node --check src/main/credential-fill-flow.js && npm run test:unit`
Expected: `node --check` silent; suite PASS, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/main/credential-fill-flow.js test/unit/credential-fill-flow.test.js
git commit -m "feat(1password): extract choose-and-reveal flow with behavioral contract tests"
```

---

### Task 6: Wire both modules into `main.js`

The behavior is proven in Tasks 4–5; this task is the Electron wiring, so source
assertions are the right tool here.

**Files:**
- Modify: `src/main/main.js`
- Modify: `src/main/preload.js`
- Test: `test/unit/onepassword-match.test.js`

**Interfaces:**
- Consumes: `createPickerController` (Task 4), `chooseAndReveal` (Task 5), `rankMatches` (Task 1).
- Produces: the reordered `fillActiveTabFrom1Password`; `pickerController` module state.

- [ ] **Step 1: Write the failing wiring tests**

Append to `test/unit/onepassword-match.test.js`:

```js
test('T6-wiring: every settlement route is wired in main', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../../src/main/main.js'), 'utf8');
  for (const reason of ['escape', 'mode-replaced', 'hidden', 'blur', 'tab-changed', 'window-closed']) {
    assert.ok(src.includes(`'${reason}'`), `settlement route '${reason}' must be wired`);
  }
  assert.ok(/isTrustedSender\(event,\s*\[overlayView\]\)/.test(src),
    'the reply channel must accept the overlay alone, never the chrome window');
});

test('T6-wiring: ranking precedes inspection, enumeration follows consent', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../../src/main/main.js'), 'utf8');
  // Slice to the orchestrator: indexOf on a bare name would find the function
  // DEFINITION, which sits above it.
  const start = src.indexOf('async function fillActiveTabFrom1Password');
  const end = src.indexOf('\nasync function ', start + 1);
  const fn = src.slice(start, end === -1 ? undefined : end);
  const rank = fn.indexOf('rankMatches(');
  const inspect = fn.indexOf('buildInspectScript(');
  const consent = fn.indexOf("passwordBasis !== 'authoritative'");
  const flow = fn.indexOf('chooseAndReveal(');
  assert.ok(rank > -1 && inspect > -1 && consent > -1 && flow > -1, 'all four must appear in the orchestrator');
  assert.ok(rank < inspect, 'ranking is metadata-only and must precede inspection');
  assert.ok(inspect < consent, 'consent needs the inspect result');
  assert.ok(consent < flow, 'nothing may be decrypted before the page is judged fillable and consented to');
  assert.ok(/kept\.length === 0/.test(fn) || /!kept\.length/.test(fn), 'the defensive empty-tier case must be handled');
});

test('T6-wiring: consent copy is candidate-neutral when a picker will follow', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../../src/main/main.js'), 'utf8');
  const start = src.indexOf('async function fillActiveTabFrom1Password');
  const end = src.indexOf('\nasync function ', start + 1);
  const fn = src.slice(start, end === -1 ? undefined : end);
  // The ternary spans lines, so the pattern must CROSS newlines — a [^\n]
  // class would stay red against the correct implementation.
  assert.ok(/kept\.length === 1[\s\S]{0,160}kept\[0\]\.title/.test(fn),
    'only a single survivor may be named in the consent prompt');
  assert.ok(/Fill a saved password into this form/.test(fn),
    'the multi-survivor branch must be candidate-neutral');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/unit/onepassword-match.test.js`
Expected: FAIL — `rankMatches(` not found in the orchestrator slice.

- [ ] **Step 3: Make `restoreTabFocus`'s window focus conditional**

In `src/main/main.js`, in `restoreTabFocus`, replace `if (hasLiveWindow()) win.focus();` with:

```js
  // Only re-assert the WINDOW when Blanc is already frontmost. A picker
  // dismissed by ⌘-Tab must not drag the window back over whatever the user
  // switched to. (Same instinct as the overlay blur guard further up.)
  if (hasLiveWindow() && win.isFocused()) win.focus();
```

- [ ] **Step 4: Make `showOverlay` report success**

`requestPick` treats a falsy return as `window-closed`, so `showOverlay` must
say whether it showed. In `src/main/main.js`, change its guard and add a return:

```js
function showOverlay(mode, { prefill } = {}) {
  if (!hasLiveWindow() || !overlayView) return false;
```

and add `return true;` as the last line of the function. Existing callers ignore
the value, so this is additive.

- [ ] **Step 5: Instantiate the controller**

In `src/main/main.js`, below the `FILL_WORLD_ID` constant:

```js
const { createPickerController } = require('./credential-picker');
const { chooseAndReveal } = require('./credential-fill-flow');

const pickerController = createPickerController({
  showOverlay,
  hideOverlay: () => hideOverlay({ refocusContent: false }),
  getOverlayMode: () => overlayMode,
  isOverlaySender: (event) => isTrustedSender(event, [overlayView]),
  randomUUID: () => crypto.randomUUID(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (t) => clearTimeout(t),
  timeoutMs: 60_000,
});
```

- [ ] **Step 6: Wire the settlement routes**

**(a)** Top of `hideOverlay`, after `if (!overlayMode) return;`:

```js
  // 'hidden' is deliberately no-restore: hideOverlay has six callers and the
  // cause can't be attributed, so it fails safe.
  //
  // RETURN after delegating. settle() clears its pending state BEFORE calling
  // its injected hide collaborator, which re-enters this function and performs
  // the teardown. Falling through would then run the removal/send/focus body a
  // second time.
  if (pickerController.isPending()) {
    pickerController.settle(null, 'hidden');
    return;
  }
```

**(a2)** Still in `hideOverlay`, clear the prefill. Today it sets
`overlayMode = null` but leaves `overlayPrefill` holding the last payload — for
a picker that is the username/title/vault rows, referenced in main indefinitely
after the picker closes. Put it immediately beside the mode reset, **before** any
call that touches the possibly-dying view, so a throw from `removeChildView` or
`send` cannot strand the rows:

```js
  overlayMode = null;
  overlayPrefill = null;   // vault rows must not outlive the picker
```

This matters for the partial-show recovery too: the controller's
`hideOverlay()` call is what clears main's copy of those rows.

**(b)** Top of `showOverlay`, after the live-window guard:

```js
  if (overlayMode === 'credential-picker' && mode !== 'credential-picker') {
    pickerController.settle(null, 'mode-replaced');
  }
```

**(c)** In the overlay Escape handler, replace `hideOverlay();` with:

```js
      if (overlayMode === 'credential-picker') pickerController.settle(null, 'escape');
      else hideOverlay();
```

**(d)** In the overlay `blur` handler, before its `hideOverlay(...)`:

```js
    if (overlayMode === 'credential-picker') return pickerController.settle(null, 'blur');
```

**(e)** Scope both call sites — an unrelated background tab closing must not
cancel a live picker. In `setActiveTab`, place it **after** the same-tab early
return so only a genuine switch settles:

```js
  // (after the `if (id === activeTabId) return;`-style no-op guard)
  pickerController.settle(null, 'tab-changed');
```

In `closeTab`, settle only when the tab being closed is the one the picker
belongs to:

```js
  if (id === activeTabId) pickerController.settle(null, 'tab-changed');
```

**(f)** In `createOverlay()`, after the other overlay listeners, and in the window `closed` handler:

```js
  overlayView.webContents.on('destroyed', () => pickerController.settle(null, 'window-closed'));
  overlayView.webContents.on('render-process-gone', () => pickerController.settle(null, 'window-closed'));
```

**(g)** In `registerIpcHandlers()`:

```js
  ipcMain.on('chrome:credential-pick', (event, payload) => pickerController.handleReply(event, payload));
```

- [ ] **Step 7: Add the preload bridge**

In `src/main/preload.js`, inside `browserAPI`:

```js
  sendCredentialPick: (requestId, index) =>
    ipcRenderer.send('chrome:credential-pick', { requestId, index }),
```

- [ ] **Step 8: Replace the phase-1 chooser with ranking**

In `fillActiveTabFrom1Password`, replace the whole `if (matches.length > 1) { … }` block (its `dialog.showMessageBox` and the `restoreTabFocus` call that followed) with:

```js
    // Rank on METADATA only — no decryption here. One survivor is the common
    // case and needs no picker at all.
    const ranked = onepassword.rankMatches(matches, expectedHost);
    if (ranked.kept.length === 0) return log('no-match', expectedHost); // never fall back to the unranked list
    kept = ranked.kept;
    truncated = ranked.truncated;
```

and declare `let kept = []; let truncated = 0;` with the other phase-1 bindings.

- [ ] **Step 9: Make the consent copy candidate-neutral**

The consent gate now runs *before* selection, so it may only name an item when
there is exactly one survivor. In the consent `dialog.showMessageBox` call,
replace the `message:` line with:

```js
        message: kept.length === 1
          ? `Fill your ${kept[0].title || 'saved'} password into this form?`
          : 'Fill a saved password into this form?',
```

- [ ] **Step 10: Call the flow**

In phase 2, replace the line
`const { username, password } = await onepassword.revealCredential(chosen.vaultId, chosen.itemId);`
with:

```js
    const picked = await chooseAndReveal({
      kept,
      truncated,
      host: expectedHost,
      deps: {
        revealUsernames: (list) => onepassword.revealUsernames(list),
        requestPick: (rows, trunc, host) => pickerController.requestPick(rows, trunc, host),
        restoreTabFocus: () => restoreTabFocus(wc),
        revalidate: () => {
          if (!hasLiveWindow() || !win.isFocused()) return 'abort-window-changed';
          if (activeTabId !== capturedTabId || !tabs.has(capturedTabId)) return 'abort-tab-changed';
          if (wc.isDestroyed()) return 'abort-wc-changed';
          if (tab.navEpoch !== capturedEpoch) return 'abort-navigated';
          if (wc.getURL() !== expectedURL) return 'abort-url-changed';
          return null;
        },
        revealCredential: (c) => onepassword.revealCredential(c.vaultId, c.itemId),
      },
    });
    if (picked.outcome === 'chooser-cancel') return log('chooser-cancel', picked.detail);
    if (picked.outcome !== 'ok') return log(picked.outcome);
    const { username, password } = picked.credential;
```

- [ ] **Step 11: Confirm no stale chooser remains**

Do **not** count `showMessageBox` call sites: `main.js` legitimately has four —
the external-protocol prompt, the old chooser, the consent dialog, and a
`showMessageBoxSync` for `will-prevent-unload` — so a bare count proves nothing
and "only two remain" would be false. Check for the chooser's own markers:

```bash
grep -n "Choose a login for\|matches\.map(\|matches\.length > 1" src/main/main.js
```
Expected: **no output**. Those three are the chooser's message string, its button
construction, and its guard; the unrelated dialogs contain none of them.

- [ ] **Step 12: Tests + syntax**

Run: `node --check src/main/main.js && node --check src/main/preload.js && npm run test:unit`
Expected: all pass, 0 failures.

- [ ] **Step 13: Commit**

```bash
git add src/main/main.js src/main/preload.js test/unit/onepassword-match.test.js
git commit -m "feat(1password): wire ranking, picker controller and fill flow into main"
```

---

### Task 7: The overlay picker UI

**Files:**
- Modify: `src/renderer/overlay.js`
- Modify: `src/renderer/styles.css`
- Test: `test/unit/onepassword-match.test.js` (source guard)

**Interfaces:**
- Consumes: `window.browserAPI.onOverlayShow`, `window.browserAPI.sendCredentialPick(requestId, index)`.
- Produces: the `credential-picker` mode.

- [ ] **Step 1: Write the failing source guard**

Append to `test/unit/onepassword-match.test.js`:

```js
test('T7: the picker render path never uses innerHTML', () => {
  // Vault strings are untrusted text entering a PRIVILEGED renderer holding the
  // browserAPI bridge. overlay.js uses innerHTML ~10 lines away for static
  // scaffolding, so the local convention is the dangerous one — scope the guard
  // to the picker function only.
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../../src/renderer/overlay.js'), 'utf8');
  const start = src.indexOf('function renderCredentialPicker');
  assert.ok(start > -1, 'renderCredentialPicker must exist');
  const end = src.indexOf('\n  function ', start + 1);
  const body = src.slice(start, end === -1 ? undefined : end);
  for (const sink of ['innerHTML', 'insertAdjacentHTML', 'outerHTML']) {
    assert.ok(!body.includes(sink), `${sink} must never appear in the picker render path`);
  }
  assert.ok(body.includes('textContent'), 'vault values must be set via textContent');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/unit/onepassword-match.test.js`
Expected: FAIL — `renderCredentialPicker must exist`.

- [ ] **Step 3: Add the renderer**

In `src/renderer/overlay.js`, before `applyMode`:

```js
  let pickerRequestId = null;
  let pickerIndex = 0;

  /** Render the credential picker.
   *
   * EVERY value here (`username`, `title`, `host`, `vaultName`) is untrusted
   * text from the user's vault, arriving in a privileged renderer. Build nodes
   * with createElement and set text with textContent — never innerHTML, not even
   * for the truncation line. A vault item titled `<img src=x onerror=…>` must
   * render as those literal characters.
   */
  function renderCredentialPicker(prefill) {
    pickerRequestId = prefill?.requestId ?? null;
    pickerIndex = 0;
    const rows = Array.isArray(prefill?.rows) ? prefill.rows : [];
    const multiVault = new Set(rows.map((r) => r.vaultName)).size > 1;
    const list = document.createElement('div');
    list.className = 'cred-list';

    rows.forEach((r, i) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'cred-row';
      row.dataset.index = String(i);

      const primary = document.createElement('span');
      primary.className = 'cred-user';
      primary.textContent = r.username || '(no username)';

      const secondary = document.createElement('span');
      secondary.className = 'cred-meta';
      secondary.textContent = [r.title, r.host].filter(Boolean).join(' · ');

      row.append(primary, secondary);

      if (multiVault && r.vaultName) {
        const vault = document.createElement('span');
        vault.className = 'cred-vault';
        vault.textContent = r.vaultName;
        row.append(vault);
      }

      row.addEventListener('click', () => choosePicker(i));
      list.append(row);
    });

    if (prefill?.truncated > 0) {
      const more = document.createElement('div');
      more.className = 'cred-more';
      more.textContent = `${prefill.truncated} more not shown — narrow it in 1Password`;
      list.append(more);
    }

    // Picker mode is MODAL: styles.css hides the panel's own controls (address
    // bar, nav, favorite, footer, Settings) so the user can't navigate or open
    // a tab mid-selection. That hides the panel's dismiss button too, so the
    // picker renders its OWN cancel affordance.
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'cred-cancel';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => choosePicker(null));
    list.append(cancel);

    islandList.replaceChildren(list);
    highlightPicker();
  }

  function highlightPicker() {
    const rows = [...islandList.querySelectorAll('.cred-row')];
    rows.forEach((el, i) => el.classList.toggle('sel', i === pickerIndex));
    rows[pickerIndex]?.focus();
  }

  /** One reply per request. `index` null is an explicit dismissal, which main
   * settles as `dismissed` (best-effort focus return) rather than `hidden`. */
  function choosePicker(index) {
    if (pickerRequestId === null) return;
    const id = pickerRequestId;
    pickerRequestId = null;
    window.browserAPI.sendCredentialPick(id, index);
  }
```

- [ ] **Step 4: Wire the mode, the scrim, and teardown**

In `applyMode`, extend the two visibility lines and add a branch:

```js
    backdrop.hidden = next !== 'panel' && next !== 'palette' && next !== 'credential-picker';
    panelAnchor.hidden = next !== 'panel' && next !== 'palette' && next !== 'credential-picker';
```

```js
    } else if (next === 'credential-picker') {
      renderCredentialPicker(prefill);
```

The picker's cancel affordances are the **scrim** and the in-list **Cancel**
button (added in Step 3); both call `choosePicker(null)`, which settles as
`dismissed` (best-effort focus return). The panel's own `dismissBtn` is hidden
by the modal isolation in Step 5, so it is no longer a picker affordance. In the
backdrop/scrim click handler, before whatever it calls today:

```js
    if (mode === 'credential-picker') return choosePicker(null);
```

Defense-in-depth: the panel's controls have **individual** click listeners (there
is no shared handler to guard), so add **one** capture-phase listener on
`document` — it runs before those bubble-phase listeners and swallows any click
that isn't a picker control while a picker is up, in case the isolation CSS ever
regresses. Add it once, next to the other overlay listeners:

```js
  document.addEventListener('click', (e) => {
    if (mode !== 'credential-picker') return;
    // Picker controls stay live; everything else in the panel is inert.
    if (e.target.closest('.cred-row, .cred-cancel, #backdrop')) return;
    e.stopPropagation();
    e.preventDefault();
  }, true);   // capture — beats the per-control listeners
```

In the overlay's `keydown` listener:

```js
    if (mode === 'credential-picker') {
      const rows = islandList.querySelectorAll('.cred-row');
      // Enter while Cancel holds focus must DISMISS, not select the still-
      // highlighted row. This handler intercepts Enter (preventDefault), so the
      // button's own activation never fires — the choice has to be routed here.
      const onCancel = document.activeElement?.classList.contains('cred-cancel');
      if (e.key === 'ArrowDown') { e.preventDefault(); pickerIndex = Math.min(pickerIndex + 1, rows.length - 1); highlightPicker(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); pickerIndex = Math.max(pickerIndex - 1, 0); highlightPicker(); }
      else if (e.key === 'Enter') { e.preventDefault(); choosePicker(onCancel ? null : pickerIndex); }
      return;   // Escape is handled in main via before-input-event
    }
```

In `onOverlayHide`, clear **both** the request and the rendered rows — leaving
them would keep vault-derived strings resident in the privileged renderer.
Capture whether this was a picker **at the top of the handler**, before `mode`
and `document.body.dataset.mode` are reset; testing the flag afterwards would
always read false and the rows would never be cleared:

```js
  window.browserAPI.onOverlayHide(() => {
    const wasPicker = mode === 'credential-picker';   // BEFORE the resets below
    // ... existing teardown (mode = null, dataset.mode = '', hidden flags) ...
    pickerRequestId = null;
    pickerIndex = 0;
    if (wasPicker) islandList.replaceChildren();
  });
```

- [ ] **Step 5: Add styles**

In `src/renderer/styles.css`, near the other island row rules:

Use the repository's ACTUAL tokens. `--radius-sm`, `--fg`, `--fg-dim` and
`--hover` do not exist in `styles.css`; the real ones are `--radius`, `--text`,
`--text-dim` and `--surface`, and `.island-row:hover` uses `var(--surface)` —
match that rather than inventing a hover token.

```css
/* Modal isolation: in picker mode the panel shows ONLY the rows + Cancel, so a
   user can't type an address, hit a nav/favorite button, open a tab, or reach
   Settings while a credential decrypt is pending. display:none also removes
   these from the tab order and makes them unfocusable, which the Task 8
   assertion checks. Scoped to the picker mode only — panel/palette are
   unaffected. */
body[data-mode="credential-picker"] .panel-row,
body[data-mode="credential-picker"] #islandFooter,
body[data-mode="credential-picker"] #islandHint { display: none; }

.cred-list { display: flex; flex-direction: column; gap: 2px; }
.cred-row {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas: "user vault" "meta vault";
  gap: 0 10px;
  width: 100%;
  padding: 7px 10px;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.cred-row:hover, .cred-row.sel { background: var(--surface); }
.cred-user { grid-area: user; font-weight: 500; }
.cred-meta { grid-area: meta; color: var(--text-dim); font-size: 11px; }
.cred-vault { grid-area: vault; align-self: center; color: var(--text-dim); font-size: 11px; }
.cred-more { padding: 6px 10px; color: var(--text-dim); font-size: 11px; }
.cred-cancel {
  margin-top: 4px;
  padding: 7px 10px;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-dim);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.cred-cancel:hover { background: var(--surface); color: var(--text); }
```

Verify before committing — no invented tokens may survive, and the isolation
selectors must reference elements that exist:

```bash
grep -oE 'var\(--[a-z-]+\)' src/renderer/styles.css | sort -u | head -20
grep -c 'id="islandFooter"\|id="islandHint"\|class="panel-row"' src/renderer/overlay.html
```
Every token used above must appear in the first list; the second must print `3`
(the three isolation targets all exist).

- [ ] **Step 6: Tests**

Run: `npm run test:unit`
Expected: PASS, 0 failures.

- [ ] **Step 7: Manual smoke**

Chrome documents load once at window creation — **relaunch**, don't ⌘R:

```bash
BLANC_1P_ACCOUNT="<your-account>" npm start
```

On `https://accounts.google.com/` press ⌥⌘P. Verify: an Island list of usernames
(not a native button row); ↑/↓ move the highlight; Enter fills; Escape logs
`chooser-cancel escape`; clicking the scrim logs `chooser-cancel dismissed`; the
truncation line appears when more than ten matched. **Modal isolation:** confirm
the address bar, footer buttons, Settings, and hint are all gone while the picker
is up — only the rows and the Cancel button show — and that clicking the in-list
Cancel logs `chooser-cancel dismissed`. On `https://www.google.com/` verify **no
picker** — one candidate fills directly.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/overlay.js src/renderer/styles.css test/unit/onepassword-match.test.js
git commit -m "feat(1password): Island credential picker with textContent-only rows"
```

---

### Task 8: Acceptance scenarios — reply path, isolation, XSS, overflow

The picker's most important contract is the one a source guard can't see: a real
click on a real row, sent over the real IPC, must be **accepted by the real
`pickerController.handleReply`** and settle the request. So every scenario here
**routes through `pickerController.requestPick()`** — the same call the fill flow
makes — and observes the promise it returns. A scenario that only watched raw IPC
with its own listener would pass even if `handleReply` rejected the sender (this
is exactly how the `isOverlaySender` shape bug survived every earlier test).

Six scenarios, all real-DOM: a row click resolves as a selection; hostile vault
strings (title AND vaultName) render as literal text; picker mode isolates the
panel's own controls; Enter on Cancel dismisses; the capture guard swallows a
click on a hidden control; and a full 10-row picker stays reachable in a 640×480
window.

The harness config loads features from **`spec/acceptance/**/*.feature`** and
steps from **`test/desktop/steps/**/*.js`** (CommonJS), running only scenarios
whose tag is in `RUNNABLE`. A feature placed anywhere else, or an `.mjs` step
file, is silently skipped — so the feature goes under a path the config is taught
explicitly, with a unique tag.

**Files:**
- Create: `test/desktop/features/credential-picker.feature`
- Create: `test/desktop/steps/credential-picker.steps.js`
- Modify: `test/desktop/cucumber.mjs` (add the desktop feature path **and** the tag)
- Modify: `src/main/test-hook.js`
- Modify: `src/main/main.js` (pass `pickerController` into the test-hook refs)

**Why not `spec/acceptance/` and `@F24-1`:** `spec/acceptance/` holds the
**platform-neutral** contract shared with the future mobile ports, and `@F24-1`
is already taken — `spec/acceptance/platform-services.feature:41` uses it for a
`@mobile @D12` scenario. Adding that tag to `RUNNABLE` would select a mobile
scenario on desktop and misrepresent this dev-only spike as part of the F24
contract. So it lives under `test/desktop/features/` with tag `@spike-1p-picker`.

**Interfaces:**
- Consumes: `pickerController` (passed into the test-hook refs from `main.js`),
  the hook's existing `getOverlayWebContents` / `getOverlayMode` /
  `setWindowContentSize` collaborators, and the World's `this.call(method, ...)`.
- Produces: hook methods `startCredentialPick(rows, truncated)`,
  `awaitCredentialPick()`, `clickPickerRow(index)`, `pressEnterOnPickerCancel()`,
  `readPickerDom()`, `readPickerIsolation()`, `clickHiddenControlInPicker(sel)`,
  and `readPickerReachability()`.

- [ ] **Step 1: Pass `pickerController` into the test-hook**

In `src/main/main.js`, find the `installTestHook`/`test-hook` install call (the
one guarded by `!app.isPackaged && process.env.BLANC_TEST === '1'`) and add
`pickerController` to the refs object it passes. In `src/main/test-hook.js`, add
`pickerController` to the destructured `refs` at the top of `install(refs)`.

- [ ] **Step 2: Add the test-hook methods**

In `src/main/test-hook.js`, alongside `openPanel()` / `openPalette()`. A module-
scoped `pendingPick` holds the promise `requestPick` returns, so the click and
the assertion can be separate steps:

```js
    // --- credential picker (1Password fill SPIKE) ---
    // Route through the REAL controller, so a row click exercises the real
    // handleReply -> isOverlaySender -> settle path. A side-channel IPC listener
    // would pass even if handleReply rejected the sender.
    startCredentialPick(rows, truncated = 0) {
      pendingPick = pickerController.requestPick(rows, truncated, 'example.test');
      return true;
    },
    awaitCredentialPick() {
      return pendingPick; // resolves { index, reason } once a reply/settle lands
    },
    clickPickerRow(index) {
      const wc = getOverlayWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`(() => {
        const rows = document.querySelectorAll('.cred-row');
        if (!rows[${JSON.stringify(index)}]) throw new Error('no picker row at index ' + ${JSON.stringify(index)});
        rows[${JSON.stringify(index)}].click(); // real click -> choosePicker -> real IPC
        return true;
      })()`);
    },
    pressEnterOnPickerCancel() {
      const wc = getOverlayWebContents();
      if (!wc) return null;
      // Just press Enter on the focused Cancel — the reply is observed via
      // awaitCredentialPick (the real promise), not a side channel.
      return wc.executeJavaScript(`(() => {
        const cancel = document.querySelector('.cred-cancel');
        if (!cancel) throw new Error('picker Cancel button is not rendered');
        cancel.focus();
        cancel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        return true;
      })()`);
    },
    readPickerDom() {
      const wc = getOverlayWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`(() => {
        const list = document.querySelector('.cred-list');
        if (!list) return null;
        return {
          text: list.textContent,
          vaults: [...list.querySelectorAll('.cred-vault')].length,
          injected: list.querySelectorAll('img, script, b, iframe').length,
          pwned: typeof window.__pwned,
          pwnedVault: typeof window.__pwnedVault,
        };
      })()`);
    },
    readPickerIsolation() {
      const wc = getOverlayWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`(() => {
        const probe = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return { present: false };
          const shown = el.getClientRects().length > 0;
          try { el.focus(); } catch (_) {}
          return { present: true, shown, focusable: document.activeElement === el };
        };
        return {
          address: probe('#addressInput'),
          footer: probe('#islandFooter'),
          settings: probe('#footerSettings'),
          cancel: probe('.cred-cancel'),
        };
      })()`);
    },
    clickHiddenControlInPicker(selector) {
      const wc = getOverlayWebContents();
      if (!wc) return null;
      // Fully synchronous: a temporary observer records whether the click
      // reached the control. The capture-phase guard calls stopPropagation, so
      // with the guard the target is never reached; without it, it fires.
      return wc.executeJavaScript(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error('control not found: ' + ${JSON.stringify(selector)});
        let reached = false;
        const obs = () => { reached = true; };
        el.addEventListener('click', obs);
        try { el.click(); } finally { el.removeEventListener('click', obs); }
        return { reached };
      })()`);
    },
    readPickerReachability() {
      const wc = getOverlayWebContents();
      if (!wc) return null;
      // Scroll the list to the bottom, then report whether the card fits the
      // viewport and the last row + Cancel are within the scrolled list box.
      return wc.executeJavaScript(`(() => {
        const list = document.querySelector('.cred-list');
        const rows = document.querySelectorAll('.cred-row');
        const cancel = document.querySelector('.cred-cancel');
        const panel = document.getElementById('islandPanel');
        if (!list || !rows.length || !cancel || !panel) return null;
        list.scrollTop = list.scrollHeight;
        const lr = list.getBoundingClientRect();
        const within = (el) => { const r = el.getBoundingClientRect(); return r.top >= lr.top - 0.5 && r.bottom <= lr.bottom + 0.5; };
        return {
          rows: rows.length,
          cardFitsViewport: panel.getBoundingClientRect().bottom <= window.innerHeight + 0.5,
          listScrolls: list.scrollHeight > list.clientHeight + 1,
          lastRowReachable: within(rows[rows.length - 1]),
          cancelReachable: within(cancel),
        };
      })()`);
    },
```

Declare `let pendingPick = null;` in the `install` scope (next to the other
module-scoped test state such as `focusObservation`).

The existing `reset()` already calls `hideOverlay(...)`, which settles a pending
picker as `'hidden'` (Task 6 wiring) and restores the 1280×800 window — so a
scenario that starts a pick but never clicks/cancels is cleaned up between
scenarios without extra teardown.

- [ ] **Step 3: Write the feature**

Create `test/desktop/features/credential-picker.feature`:

```gherkin
Feature: 1Password credential picker (dev spike)
  The picker's replies must be accepted by the real controller, its rows must
  render vault strings inertly, its mode must be modal, and a full list must stay
  reachable in a short window.

  @spike-1p-picker
  Scenario: a row click resolves as a selection
    When the credential picker is requested with two rows
    And the second row is clicked
    Then the pick resolves as selected index 1

  @spike-1p-picker
  Scenario: vault strings render as literal text
    When the credential picker is requested with hostile vault strings
    Then the picker row shows them as literal text
    And the hostile vault name renders as literal text
    And the picker row contains no injected elements

  @spike-1p-picker
  Scenario: picker mode isolates the panel's own controls
    When the credential picker is requested with hostile vault strings
    Then the address bar, footer, and Settings are hidden and unfocusable
    And the Cancel button is available

  @spike-1p-picker
  Scenario: Enter on the Cancel button dismisses rather than selecting
    When the credential picker is requested with two rows
    And Enter is pressed while the Cancel button has focus
    Then the pick resolves as dismissed

  @spike-1p-picker
  Scenario: the modal guard swallows clicks on hidden panel controls
    When the credential picker is requested with hostile vault strings
    And a hidden panel control is clicked while the picker is up
    Then the click never reaches the control

  @spike-1p-picker
  Scenario: a full picker stays reachable in a short window
    Given the window is 640 by 480
    When the credential picker is requested with ten rows
    Then the last row and Cancel are reachable
```

- [ ] **Step 4: Teach the config the path and the tag**

In `test/desktop/cucumber.mjs`, add the desktop feature path and the tag:

```js
const common = {
  paths: ['spec/acceptance/**/*.feature', 'test/desktop/features/**/*.feature'],
  require: ['test/desktop/support/**/*.js', 'test/desktop/steps/**/*.js'],
};
```

and add `'@spike-1p-picker'` to the `RUNNABLE` array. Confirm all six scenarios
are actually **selected** (a `pickle` envelope proves only parsing; a `testCase`
envelope proves selection):

```bash
npx cucumber-js -c test/desktop/cucumber.mjs -p dry --format message 2>/dev/null | python3 -c "
import sys, json
pickles={}; selected=set()
for line in sys.stdin:
    line=line.strip()
    if not line: continue
    try: o=json.loads(line)
    except: continue
    if 'pickle' in o: pickles[o['pickle']['id']]=o['pickle']['name']
    if 'testCase' in o: selected.add(o['testCase']['pickleId'])
names={pickles[i] for i in selected if i in pickles}
picker=[n for n in names if n in {
  'a row click resolves as a selection',
  'vault strings render as literal text',
  \"picker mode isolates the panel's own controls\",
  'Enter on the Cancel button dismisses rather than selecting',
  'the modal guard swallows clicks on hidden panel controls',
  'a full picker stays reachable in a short window'}]
print('selected picker scenarios:', len(picker))
"
```
Expected: `selected picker scenarios: 6`.

- [ ] **Step 5: Write the step definitions (CommonJS)**

Create `test/desktop/steps/credential-picker.steps.js`:

```js
'use strict';
const { Given, When, Then } = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const { waitForValue } = require('../support/poll');

const HOSTILE_TITLE = '<img src=x onerror="window.__pwned=1">';
const HOSTILE_USER = '"><script>alert(1)</script>';
const HOSTILE_HOST = '</span><b>x';
const HOSTILE_VAULT = '<img src=y onerror="window.__pwnedVault=1">';

async function startAndRender(world, rows) {
  await world.call('startCredentialPick', rows);
  // showOverlay sends overlay:show asynchronously — poll until the rows render.
  await waitForValue(() => world.call('readPickerDom'), (d) => d !== null, 'picker rows to render');
}

When('the credential picker is requested with two rows', async function () {
  await startAndRender(this, [
    { username: 'first@example.test', title: 'Example', host: 'example.test', vaultName: 'Personal' },
    { username: 'second@example.test', title: 'Example', host: 'example.test', vaultName: 'Personal' },
  ]);
});

When('the credential picker is requested with hostile vault strings', async function () {
  // TWO distinct vaults so the .cred-vault element renders and the hostile
  // vaultName is exercised; the hostile strings are on the FIRST row.
  await startAndRender(this, [
    { username: HOSTILE_USER, title: HOSTILE_TITLE, host: HOSTILE_HOST, vaultName: HOSTILE_VAULT },
    { username: 'second@example.test', title: 'Second', host: 'example.test', vaultName: 'Work' },
  ]);
});

Given('the window is 640 by 480', async function () {
  await this.call('setWindowContentSize', 640, 480);
});

When('the credential picker is requested with ten rows', async function () {
  const rows = Array.from({ length: 10 }, (_, i) => ({
    username: `user${i}@example.test`, title: 'Example',
    host: 'secure.example.test', vaultName: 'Personal',
  }));
  await startAndRender(this, rows);
});

When('the second row is clicked', async function () {
  await this.call('clickPickerRow', 1);
});

When('Enter is pressed while the Cancel button has focus', async function () {
  await this.call('pressEnterOnPickerCancel');
});

When('a hidden panel control is clicked while the picker is up', async function () {
  this.guardResult = await this.call('clickHiddenControlInPicker', '#footerSettings');
});

Then('the pick resolves as selected index 1', async function () {
  // The REAL requestPick promise — this only resolves if handleReply accepted
  // the sender and settled. Against the bare-overlayView wiring bug it would
  // hang here and time out.
  const result = await this.call('awaitCredentialPick');
  assert.deepEqual(result, { index: 1, reason: 'selected' });
});

Then('the pick resolves as dismissed', async function () {
  const result = await this.call('awaitCredentialPick');
  assert.deepEqual(result, { index: null, reason: 'dismissed' });
});

Then('the picker row shows them as literal text', async function () {
  const dom = await this.call('readPickerDom');
  assert.ok(dom, 'the picker row must render');
  assert.ok(dom.text.includes(HOSTILE_TITLE), 'the raw markup must appear as visible characters');
  assert.ok(dom.text.includes(HOSTILE_USER));
  this.pickerDom = dom;
});

Then('the hostile vault name renders as literal text', function () {
  assert.ok(this.pickerDom.vaults >= 1, 'the vault element must render (two distinct vaults)');
  assert.ok(this.pickerDom.text.includes(HOSTILE_VAULT), 'the hostile vault name must be literal');
  assert.equal(this.pickerDom.pwnedVault, 'undefined', 'no handler from a hostile vault name may run');
});

Then('the picker row contains no injected elements', function () {
  assert.equal(this.pickerDom.injected, 0, 'no element may be created from vault data');
  assert.equal(this.pickerDom.pwned, 'undefined', 'no injected handler may run');
});

Then('the address bar, footer, and Settings are hidden and unfocusable', async function () {
  const iso = await this.call('readPickerIsolation');
  assert.ok(iso, 'the isolation probe must return');
  for (const key of ['address', 'footer', 'settings']) {
    assert.ok(iso[key].present, `#${key} must exist in the panel`);
    assert.equal(iso[key].shown, false, `${key} must not be displayed in picker mode`);
    assert.equal(iso[key].focusable, false, `${key} must not be focusable in picker mode`);
  }
});

Then('the Cancel button is available', async function () {
  const iso = await this.call('readPickerIsolation');
  assert.ok(iso.cancel.present, 'the picker must render its own Cancel');
  assert.equal(iso.cancel.shown, true, 'Cancel must be visible');
});

Then('the click never reaches the control', function () {
  assert.ok(this.guardResult, 'the guard probe must return');
  assert.equal(this.guardResult.reached, false,
    'the capture-phase guard must stop the click before the target');
});

Then('the last row and Cancel are reachable', async function () {
  const r = await this.call('readPickerReachability');
  assert.ok(r, 'the reachability probe must return');
  assert.equal(r.rows, 10, 'all ten rows must render');
  assert.equal(r.cardFitsViewport, true, 'the card must not overflow the 480px viewport');
  assert.equal(r.lastRowReachable, true, 'the last row must be reachable (scrolled into the list)');
  assert.equal(r.cancelReachable, true, 'Cancel must be reachable');
});
```

- [ ] **Step 6: Dry-run to confirm steps resolve**

Run: `npm run test:acceptance:dry`
Expected: no "undefined step" warnings, and the selection check from Step 4
prints `6`.

- [ ] **Step 7: Run the scenarios**

Run: `npm run test:acceptance:desktop`
Expected: all six pass. The selection scenario is the load-bearing one — it goes
through the real `handleReply`/`isOverlaySender`, so it would hang-then-fail
against the bare-`overlayView` sender bug fixed in `fe1a84b`.

If the harness cannot reach the overlay renderer, **stop and record it** in the
spec's testing section, then add `jsdom` and port the DOM assertions to unit
tests — a deliberate, recorded decision, not a silent drop. (Selection and
dismissal still need the main-process controller, so those stay acceptance-only.)

- [ ] **Step 8: Commit**

```bash
git add test/desktop/features/credential-picker.feature test/desktop src/main/test-hook.js src/main/main.js
git commit -m "test(1password): acceptance scenarios routed through the real picker controller"
```
### Task 9: Update the dev-usage doc

**Files:**
- Modify: `docs/1password-dev-usage.md`

- [ ] **Step 1: Document ranking and the picker**

In "Notes & limits", after the registrable-domain bullet, add:

```markdown
- **You'll rarely see a picker.** Matches are ranked by how well the saved
  website fits the page — an item saved for the exact host beats one saved for
  the parent domain, which beats a sibling subdomain — and only the best tier is
  offered. Where one item clearly fits, Blanc fills it without asking.
- **When several items tie**, the Island shows a list labelled by **username**
  (the only field that reliably distinguishes near-duplicate items), with the
  item title and matched host beneath. ↑/↓ to move, Enter to fill, Escape or a
  click outside to cancel. At most 10 are shown; if more matched, the last line
  says how many were left out.
- Reading those usernames means Blanc decrypts each listed item — but only when
  a picker is actually needed, never more than 10, and only after the page has
  been judged fillable. Blanc does not deliberately retain or reference a
  decrypted item once it has taken the username, and only the one you pick is
  read again in order to fill it. (JavaScript offers no way to guarantee a
  released value is collected or zeroed, so this describes what Blanc holds, not
  what remains in process memory.)
```

- [ ] **Step 2: Add the new outcomes**

In the troubleshooting table:

```markdown
| `chooser-cancel dismissed` / `chooser-cancel escape` | You cancelled the picker. Nothing was filled. |
| `chooser-cancel timeout` | The picker sat open for 60s and closed itself. Press ⌥⌘P again. |
| `chooser-cancel blur` / `chooser-cancel tab-changed` | The picker closed because you switched away. Nothing was filled. |
| `chooser-cancel invalid-reply` | The picker sent something malformed and was abandoned. Press ⌥⌘P again. |
```

- [ ] **Step 3: Verify accuracy**

Run: `grep -n "exact host\|first visible password" docs/1password-dev-usage.md`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add docs/1password-dev-usage.md
git commit -m "docs(1password): dev-usage covers ranking and the Island picker"
```

---

## Self-Review

**Spec coverage:**
- Orchestration order → Task 6 Steps 8–10, asserted by the `T6-wiring` order test (sliced to the orchestrator, so it can't match the function definition). ✅
- Logging boundary at the first `items.get()` → `chooseAndReveal` returns `fill-error` for any enumeration/reveal failure, never a message (Task 5). ✅
- One survivor skips enumeration **and** the picker; zero survivors log `no-match` → Task 5 test 1, Task 6 Step 8. ✅
- Tiers, best-tier-only, deterministic comparator, smallest host, cap + `truncated` → Task 1. ✅
- `findLogins` shape → Task 2. ✅
- Sequential capped enumeration, injectable client, no password on rows, failure aborts → Task 3. ✅
- Closed reason enum, exactly-once settlement, all ten routes, conditional `win.focus()` → Tasks 4 and 6. ✅
- Two-stage validation with stage 1 **inert**, overlay-only sender, random `requestId`, index validation incl. **missing** index → Task 4. ✅
- Unavailable overlay settles as `window-closed` instead of hanging → Task 4 test + `requestPick`. ✅
- Rows carry exactly four keys → asserted in both Task 4 and Task 5. ✅
- Focus policy per reason, gated on `selected` → Task 5's nine-reason table. ✅
- Consent copy candidate-neutral when a picker follows → Task 6 Step 9 + test. ✅
- `dismissed` reachable from the scrim and from the picker's own cancel → Task 7 Step 4. ✅
- Rows cleared from the renderer on hide → Task 7 Step 4. ✅
- **Modal isolation:** picker mode hides the address bar, footer and Settings (display:none, so unfocusable) and provides its own Cancel → Task 7 Steps 3+5, asserted real-DOM in Task 8. A capture-phase `document` click guard is defense-in-depth against CSS regression, and is itself exercised by a synchronous observer — a click on hidden `#footerSettings` must never reach the control (deleting the guard makes it reach, failing that scenario; no timing wait, so no false-green). ✅
- **A row click is accepted by the REAL controller** — Task 8's selection scenario routes through `pickerController.requestPick()` and asserts the promise resolves `{index:1, reason:'selected'}`, exercising `handleReply`/`isOverlaySender`. This is the test that would have caught the bare-`overlayView` sender bug (`fe1a84b`); the earlier side-channel-IPC version did not. ✅
- **Enter on Cancel dismisses** (not selects the highlighted row) → Task 7 Step 4 `onCancel` branch, asserted in Task 8 by pressing Enter on Cancel and awaiting the real `requestPick` promise → `{index:null, reason:'dismissed'}`. ✅
- **Hostile `vaultName` is exercised** — two distinct vaults so the `.cred-vault` element renders, first name hostile, asserted literal → Task 8. ✅
- **A full 10-row picker stays reachable in a 640×480 window** — `.cred-list` cap + scroll (Task 7 CSS), asserted real-DOM in Task 8: card fits the viewport, last row and Cancel reachable after scroll. ✅
- **Window close settles the picker before resetting `overlayMode`**, so vault rows don't survive a dock reopen → Task 6 (wired + ordering test). ✅
- `textContent`-only + source guard + real-DOM scenario → Tasks 7 and 8. ✅
- Truncation line → Task 7 Step 3. ✅
- Dev-usage doc → Task 9. ✅

**Deliberately not covered:** type-to-filter and remembering a choice per host — both spec non-goals.

**Placeholder scan:** no `TBD`/`TODO`/"handle errors appropriately"; every code step carries the actual code.

**Type consistency:** `findLogins` (T2) → `{vaultId, vaultName, itemId, title, hosts, updatedAt}` is exactly what `rankMatches` (T1) consumes; `rankMatches` adds `tier`/`host`; `revealUsernames` (T3) reads those and adds `username`; `chooseAndReveal` (T5) maps to the four renderer keys `{username, title, host, vaultName}`, which `createPickerController.requestPick` (T4) forwards and `renderCredentialPicker` (T7) reads. `requestPick` resolves `{index, reason}` in T4 and is destructured as such in T5. `isValidPickIndex(index, len)` is defined in T4 Step 1 and called in T4 Step 4 with `pending.rowCount`. `showOverlay` returns a boolean from T6 Step 4, which `requestPick` checks.
