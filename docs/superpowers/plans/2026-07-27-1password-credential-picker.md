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
  const r = rankMatches(input, 'google.com');           // page www.google.com normalizes to this
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

### Task 4: Picker lifecycle in main — settlement, reply validation, IPC

The exactly-once owner of picker resolution, plus the hardened reply channel. Built before the orchestrator so Task 5 has something to await, and before the renderer so the contract is fixed first.

**Files:**
- Modify: `src/main/main.js`
- Modify: `src/main/preload.js`
- Test: `test/unit/onepassword-match.test.js`

**Interfaces:**
- Consumes: `overlayView`, `overlayMode`, `showOverlay`/`hideOverlay`, `restoreTabFocus`, `isTrustedSender`.
- Produces:
  - `isValidPickIndex(index, len) → boolean` (exported for test via `module.exports` on main is not possible; see Step 1 — it lives in `onepassword.js` as a pure helper)
  - `requestCredentialPick(rows, truncated, host) → Promise<{ index: number|null, reason: string }>`
  - `settleCredentialPick(index, reason) → void` — idempotent
  - `PICK_TIMEOUT_MS = 60_000`

- [ ] **Step 1: Write the failing tests**

The index validator is pure, so it lives in `onepassword.js` where the unit suite can reach it. The rest is asserted against `main.js` source. Append to `test/unit/onepassword-match.test.js`:

```js
// ===========================================================================
// Credential picker — reply validation + settlement wiring
// ===========================================================================
const { isValidPickIndex } = require('../../src/main/onepassword');

test('isValidPickIndex: null means cancel and is valid', () => {
  assert.equal(isValidPickIndex(null, 3), true);
});

test('isValidPickIndex: in-range integers are valid', () => {
  assert.equal(isValidPickIndex(0, 3), true);
  assert.equal(isValidPickIndex(2, 3), true);
});

test('isValidPickIndex: everything else fails closed', () => {
  for (const bad of [-1, 3, 1.5, NaN, Infinity, '0', '1', true, undefined, {}, []]) {
    assert.equal(isValidPickIndex(bad, 3), false, `${String(bad)} must be rejected`);
  }
});

test('T-picker: main wires an exactly-once settlement owner', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../../src/main/main.js'), 'utf8');
  assert.ok(/function settleCredentialPick\(/.test(src), 'settleCredentialPick is required');
  // Every reason in the closed enum must appear as a settlement call site.
  for (const reason of ['selected', 'dismissed', 'escape', 'invalid-reply',
    'mode-replaced', 'hidden', 'blur', 'tab-changed', 'window-closed', 'timeout']) {
    assert.ok(src.includes(`'${reason}'`), `reason '${reason}' must be wired`);
  }
});

test('T-picker: the reply handler is scoped to the OVERLAY sender alone', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../../src/main/main.js'), 'utf8');
  const handler = src.slice(src.indexOf("ipcMain.on('chrome:credential-pick'"));
  assert.ok(handler.length > 0, 'the chrome:credential-pick handler must exist');
  const body = handler.slice(0, handler.indexOf('\n  });'));
  assert.ok(/isTrustedSender\(event,\s*\[overlayView\]\)/.test(body),
    'the chrome window is not an acceptable sender for this channel');
  assert.ok(!/win\b/.test(body.replace(/window-closed/g, '')),
    'the handler must not accept the chrome window as a sender');
});

test('T-picker: selection gates on focus restoration before decrypting', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../../src/main/main.js'), 'utf8');
  const pickAt = src.indexOf('requestCredentialPick(');
  const gateAt = src.indexOf('await restoreTabFocus(wc)', pickAt);
  const revealAt = src.indexOf('revealCredential(', pickAt);
  assert.ok(pickAt > -1 && gateAt > -1 && revealAt > -1);
  assert.ok(gateAt < revealAt,
    'focus must be confirmed restored before the selected credential is read');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/unit/onepassword-match.test.js`
Expected: FAIL — `isValidPickIndex is not a function`.

- [ ] **Step 3: Add the pure index validator**

In `src/main/onepassword.js`, add after `rankMatches`, and add `isValidPickIndex` to the exports:

```js
/** Stage-2 reply validation: `null` cancels, otherwise it must be an integer
 * index into the candidate list. Fractional, negative, out-of-range, NaN and
 * string values all fail closed. Pure so the rejection cases are testable
 * without Electron. */
function isValidPickIndex(index, len) {
  if (index === null) return true;
  return Number.isInteger(index) && index >= 0 && index < len;
}
```

- [ ] **Step 4: Make `restoreTabFocus`'s window focus conditional**

In `src/main/main.js`, in `restoreTabFocus` (around line 1398), replace:

```js
  if (hasLiveWindow()) win.focus();
```

with:

```js
  // Only re-assert the WINDOW when Blanc is already frontmost. A picker
  // dismissed by ⌘-Tab must not drag the window back over whatever the user
  // switched to. (Same instinct as the overlay blur guard further up.)
  if (hasLiveWindow() && win.isFocused()) win.focus();
```

- [ ] **Step 5: Add the picker lifecycle**

In `src/main/main.js`, add directly below the `FILL_WORLD_ID` constant:

```js
// --- Credential picker lifecycle -------------------------------------------
// One pending request at a time, owned entirely by settleCredentialPick. Every
// route that can end a picker — selection, dismissal, Escape, a replaced mode,
// hideOverlay, a tab switch, window death, timeout — must go through it, or the
// fill will await a promise that never settles and wedge onePasswordFillInFlight.
const PICK_TIMEOUT_MS = 60_000;
let pendingPick = null; // { requestId, candidates, resolve, timer }

/** Resolve the pending pick exactly once. Clears all state BEFORE resolving so
 * a handler running synchronously off the resolution can't see a half-torn-down
 * request. `index` is null for every cancellation reason. */
function settleCredentialPick(index, reason) {
  const pending = pendingPick;
  if (!pending) return; // already settled, or none open — idempotent by design
  pendingPick = null;
  clearTimeout(pending.timer);
  // Drop the vault-derived rows from the renderer as well as from main.
  if (overlayMode === 'credential-picker') hideOverlay({ refocusContent: false });
  overlayPrefill = null;
  pending.resolve({ index, reason });
}

/** Show the picker and await the user's choice. Rows must already be free of
 * secrets and ids — see buildPickerRows in the orchestrator. */
function requestCredentialPick(rows, truncated, host) {
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    pendingPick = {
      requestId,
      candidates: rows,
      resolve,
      timer: setTimeout(() => settleCredentialPick(null, 'timeout'), PICK_TIMEOUT_MS),
    };
    showOverlay('credential-picker', { prefill: { requestId, host, rows, truncated } });
  });
}
```

- [ ] **Step 6: Wire every settlement route**

In `src/main/main.js`:

**(a)** At the top of `hideOverlay` (line ~770), immediately after `if (!overlayMode) return;`:

```js
  // A picker dismissed by any other caller still has a promise awaiting it.
  // 'hidden' is deliberately no-restore: hideOverlay has six callers and the
  // cause can't be attributed, so it fails safe.
  if (overlayMode === 'credential-picker' && pendingPick) settleCredentialPick(null, 'hidden');
```

**(b)** At the top of `showOverlay` (line ~752), immediately after the `if (!hasLiveWindow() || !overlayView) return;` guard:

```js
  if (overlayMode === 'credential-picker' && mode !== 'credential-picker' && pendingPick) {
    settleCredentialPick(null, 'mode-replaced');
  }
```

**(c)** In the overlay's `before-input-event` Escape handler (line ~687), replace `hideOverlay();` with:

```js
      if (overlayMode === 'credential-picker') settleCredentialPick(null, 'escape');
      else hideOverlay();
```

**(d)** In the overlay `blur` handler (line ~707), before the existing `hideOverlay({ refocusContent: false });`:

```js
    if (overlayMode === 'credential-picker') return settleCredentialPick(null, 'blur');
```

**(e)** In `setActiveTab`, immediately after the existing `hideOverlay(...)` call for tab switches (line ~1073) — and in `closeTab` where the captured tab dies — add:

```js
  if (pendingPick) settleCredentialPick(null, 'tab-changed');
```

**(f)** In `createOverlay()`, after the existing overlay `webContents` listeners:

```js
  overlayView.webContents.on('destroyed', () => settleCredentialPick(null, 'window-closed'));
  overlayView.webContents.on('render-process-gone', () => settleCredentialPick(null, 'window-closed'));
```

and in the window's `closed` handler:

```js
  settleCredentialPick(null, 'window-closed');
```

- [ ] **Step 7: Add the reply handler**

In `src/main/main.js`, inside `registerIpcHandlers()`:

```js
  // Two-stage validation. Stage 1 proves the reply belongs to THIS request and
  // failing it changes NO state — otherwise a late reply from a closed picker
  // could cancel a different, live one. Only a stage-1-clean reply may be
  // cancelled by a malformed index.
  ipcMain.on('chrome:credential-pick', (event, payload) => {
    if (!isTrustedSender(event, [overlayView])) return;      // overlay ONLY, never the chrome window
    const pending = pendingPick;
    if (!pending) return;
    if (overlayMode !== 'credential-picker') return;
    if (!payload || payload.requestId !== pending.requestId) return;
    // Stage 2: from here the reply is provably ours, so a bad index means the
    // picker misbehaved and we abandon this request.
    const index = payload.index === undefined ? null : payload.index;
    if (!onepassword.isValidPickIndex(index, pending.candidates.length)) {
      return settleCredentialPick(null, 'invalid-reply');
    }
    settleCredentialPick(index, index === null ? 'dismissed' : 'selected');
  });
```

- [ ] **Step 8: Add the preload bridge**

In `src/main/preload.js`, inside the `browserAPI` object:

```js
  sendCredentialPick: (requestId, index) =>
    ipcRenderer.send('chrome:credential-pick', { requestId, index }),
```

- [ ] **Step 9: Run tests + syntax**

Run: `node --check src/main/main.js && node --check src/main/preload.js && node --test test/unit/onepassword-match.test.js`
Expected: all pass.

- [ ] **Step 10: Full suite**

Run: `npm run test:unit`
Expected: PASS, 0 failures.

- [ ] **Step 11: Commit**

```bash
git add src/main/main.js src/main/preload.js src/main/onepassword.js test/unit/onepassword-match.test.js
git commit -m "feat(1password): picker lifecycle — exactly-once settlement, two-stage reply validation"
```

---

### Task 5: Reorder the orchestrator around the picker

Moves selection *after* inspection and consent, so nothing is decrypted for a page that will be refused, and wires the picker into the flow.

**Files:**
- Modify: `src/main/main.js` (`fillActiveTabFrom1Password`, phase 1 lines ~1414–1456 and phase 2)
- Test: `test/unit/onepassword-match.test.js`

**Interfaces:**
- Consumes: `rankMatches`, `revealUsernames`, `requestCredentialPick`, `restoreTabFocus`, `revealCredential`.
- Produces: the reordered flow; new log outcome `no-match` for the defensive empty-tier case (already an existing outcome string).

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/onepassword-match.test.js`:

```js
test('T5-order: ranking and inspection precede any decryption', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../../src/main/main.js'), 'utf8');
  const rank = src.indexOf('rankMatches(');
  const inspect = src.indexOf('buildInspectScript(');
  const consent = src.indexOf("passwordBasis !== 'authoritative'");
  const enumerate = src.indexOf('revealUsernames(');
  const pick = src.indexOf('requestCredentialPick(');
  const reveal = src.indexOf('revealCredential(');
  assert.ok(rank > -1 && inspect > -1 && consent > -1 && enumerate > -1 && pick > -1 && reveal > -1);
  assert.ok(rank < inspect, 'ranking is metadata-only and must precede inspection');
  assert.ok(inspect < consent, 'consent needs the inspect result');
  assert.ok(consent < enumerate,
    'NOTHING may be decrypted before the page is judged fillable and consented to');
  assert.ok(enumerate < pick, 'rows must be labelled before the picker opens');
  assert.ok(pick < reveal, 'the selected credential is read only after a choice');
});

test('T5-order: enumeration and the picker are skipped for a single survivor', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../../src/main/main.js'), 'utf8');
  assert.ok(/kept\.length > 1/.test(src),
    'a single survivor must bypass revealUsernames and the picker entirely');
  assert.ok(/kept\.length === 0/.test(src) || /!kept\.length/.test(src),
    'the defensive empty-tier case must be handled');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/unit/onepassword-match.test.js`
Expected: FAIL — `rankMatches(` not found in `main.js`.

- [ ] **Step 3: Replace the phase-1 chooser with ranking only**

In `src/main/main.js`, replace the whole `if (matches.length > 1) { … }` block in phase 1 (lines ~1431–1453, including its `dialog.showMessageBox` and the `restoreTabFocus` call that followed it) with:

```js
    // Rank on METADATA only — no decryption here. One survivor is the common
    // case and needs no picker at all.
    const { kept, truncated } = onepassword.rankMatches(matches, expectedHost);
    if (kept.length === 0) return log('no-match', expectedHost); // defensive: never use the unranked list
    pickerTruncated = truncated;
    pickerCandidates = kept;
    chosen = kept[0]; // provisional; replaced by the picker when kept.length > 1
```

and declare `pickerCandidates` / `pickerTruncated` alongside the other phase-1 `let` bindings at the top of the function.

- [ ] **Step 4: Insert enumeration + picker into phase 2**

In phase 2, immediately **after** the consent block (after its `if (!(await restoreTabFocus(wc))) return log('abort-wc-changed');`) and **before** `const { username, password } = await onepassword.revealCredential(...)`:

```js
    // Several equally-good candidates: label them with usernames and let the
    // user choose. This is the first decryption in the flow, and it is reached
    // only on a page already judged fillable and already consented to.
    if (pickerCandidates.length > 1) {
      const rows = await onepassword.revealUsernames(pickerCandidates);
      const { index, reason } = await requestCredentialPick(
        // Only these four keys reach the renderer — no vaultId, no itemId,
        // never a password.
        rows.map((r) => ({
          username: r.username,
          title: r.title,
          host: r.host,
          vaultName: r.vaultName,
        })),
        pickerTruncated,
        expectedHost,
      );
      if (index === null) {
        // Best-effort focus return only where the user is demonstrably still
        // in Blanc; ungated, since nothing further happens.
        if (reason === 'dismissed' || reason === 'escape') await restoreTabFocus(wc);
        return log('chooser-cancel', reason);
      }
      chosen = pickerCandidates[index];
      // The overlay took focus. Gate on its return BEFORE decrypting.
      if (!(await restoreTabFocus(wc))) return log('abort-wc-changed');
      if (!hasLiveWindow() || !win.isFocused()) return log('abort-window-changed');
      if (activeTabId !== capturedTabId || !tabs.has(capturedTabId)) return log('abort-tab-changed');
      if (wc.isDestroyed()) return log('abort-wc-changed');
      if (tab.navEpoch !== capturedEpoch) return log('abort-navigated');
      if (wc.getURL() !== expectedURL) return log('abort-url-changed');
    }
```

- [ ] **Step 5: Run tests + syntax**

Run: `node --check src/main/main.js && node --test test/unit/onepassword-match.test.js`
Expected: PASS.

- [ ] **Step 6: Confirm no stale chooser remains**

Run: `grep -n "showMessageBox" src/main/main.js`
Expected: the `will-prevent-unload` and consent dialogs only — **no** chooser over `matches`.

- [ ] **Step 7: Full suite**

Run: `npm run test:unit`
Expected: PASS, 0 failures.

- [ ] **Step 8: Commit**

```bash
git add src/main/main.js test/unit/onepassword-match.test.js
git commit -m "feat(1password): rank before inspect, pick after consent"
```

---

### Task 6: The overlay picker UI

The renderer half: a `'credential-picker'` mode whose rows are built with `createElement` + `textContent` only.

**Files:**
- Modify: `src/renderer/overlay.js`
- Modify: `src/renderer/styles.css`
- Test: `test/unit/onepassword-match.test.js` (source guard)

**Interfaces:**
- Consumes: `window.browserAPI.onOverlayShow` (existing), `window.browserAPI.sendCredentialPick(requestId, index)` (Task 4).
- Produces: the `credential-picker` mode; rows rendered from `{ username, title, host, vaultName }`.

- [ ] **Step 1: Write the failing source guard**

Append to `test/unit/onepassword-match.test.js`:

```js
test('T6: the picker render path never uses innerHTML', () => {
  // Vault strings are untrusted text entering a PRIVILEGED renderer that holds
  // the browserAPI bridge. overlay.js uses innerHTML ~10 lines away for static
  // scaffolding, so the local convention is the dangerous one — this guard
  // scopes to the picker function only.
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

In `src/renderer/overlay.js`, add before `applyMode`:

```js
  let pickerRequestId = null;
  let pickerIndex = 0;

  /** Render the credential picker.
   *
   * EVERY value here (`username`, `title`, `host`, `vaultName`) is untrusted
   * text from the user's vault, arriving in a privileged renderer. Build nodes
   * with createElement and set text with textContent — never innerHTML, not
   * even for the truncation line. A vault item titled `<img src=x onerror=…>`
   * must render as those literal characters.
   */
  function renderCredentialPicker(prefill) {
    pickerRequestId = prefill?.requestId ?? null;
    pickerIndex = 0;
    const rows = Array.isArray(prefill?.rows) ? prefill.rows : [];
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

      if (r.vaultName && rows.some((o) => o.vaultName !== r.vaultName)) {
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

    islandList.replaceChildren(list);
    highlightPicker();
  }

  function highlightPicker() {
    const rows = [...islandList.querySelectorAll('.cred-row')];
    rows.forEach((el, i) => el.classList.toggle('sel', i === pickerIndex));
    rows[pickerIndex]?.focus();
  }

  function choosePicker(index) {
    if (pickerRequestId === null) return;
    const id = pickerRequestId;
    pickerRequestId = null; // one reply per request
    window.browserAPI.sendCredentialPick(id, index);
  }
```

- [ ] **Step 4: Wire the mode**

In `applyMode`, add a branch alongside the existing ones:

```js
    } else if (next === 'credential-picker') {
      renderCredentialPicker(prefill);
```

and in the same function's visibility lines, make the panel anchor visible for the picker:

```js
    panelAnchor.hidden = next !== 'panel' && next !== 'palette' && next !== 'credential-picker';
    backdrop.hidden = next !== 'panel' && next !== 'palette' && next !== 'credential-picker';
```

Add keyboard handling in the overlay's existing `keydown` listener:

```js
    if (mode === 'credential-picker') {
      const rows = islandList.querySelectorAll('.cred-row');
      if (e.key === 'ArrowDown') { e.preventDefault(); pickerIndex = Math.min(pickerIndex + 1, rows.length - 1); highlightPicker(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); pickerIndex = Math.max(pickerIndex - 1, 0); highlightPicker(); }
      else if (e.key === 'Enter') { e.preventDefault(); choosePicker(pickerIndex); }
      return;
    }
```

Escape is already handled in main via `before-input-event` (Task 4c) — the renderer must not also send a reply for it.

And in `onOverlayHide`, clear the request so a late click can't reply:

```js
    pickerRequestId = null;
```

- [ ] **Step 5: Add styles**

In `src/renderer/styles.css`, near the other island row rules:

```css
.cred-list { display: flex; flex-direction: column; gap: 2px; }
.cred-row {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas: "user vault" "meta vault";
  gap: 0 10px;
  width: 100%;
  padding: 7px 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--fg);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.cred-row:hover, .cred-row.sel { background: var(--hover); }
.cred-user { grid-area: user; font-weight: 500; }
.cred-meta { grid-area: meta; color: var(--fg-dim); font-size: 11px; }
.cred-vault { grid-area: vault; align-self: center; color: var(--fg-dim); font-size: 11px; }
.cred-more { padding: 6px 10px; color: var(--fg-dim); font-size: 11px; }
```

- [ ] **Step 6: Run tests + full suite**

Run: `node --test test/unit/onepassword-match.test.js && npm run test:unit`
Expected: PASS, 0 failures.

- [ ] **Step 7: Manual smoke**

Chrome documents load once at window creation, so **relaunch** rather than ⌘R:

```bash
BLANC_1P_ACCOUNT="<your-account>" npm start
```

On `https://accounts.google.com/` press ⌥⌘P. Verify: the Island shows a list of usernames (not a native button row); ↑/↓ move the highlight; Enter fills; Escape logs `chooser-cancel escape`; the truncation line reads `N more not shown` when more than ten matched.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/overlay.js src/renderer/styles.css test/unit/onepassword-match.test.js
git commit -m "feat(1password): Island credential picker with textContent-only rows"
```

---

### Task 7: Adversarial real-DOM fixture

The source guard in Task 6 proves the picker path contains no `innerHTML`; this proves the rendered result is inert. It needs a real DOM, which `node --test` does not provide, so it lives in the existing Playwright-Electron harness.

**Files:**
- Create: `test/desktop/features/credential-picker.feature`
- Modify: `test/desktop/steps/` (a new step file, following the existing step-definition pattern)
- Modify: `src/main/test-hook.js` (expose a picker trigger)

**Interfaces:**
- Consumes: the `credential-picker` overlay mode (Task 6), the existing `globalThis.__blanc` test surface.
- Produces: a Cucumber scenario asserting vault strings render as literal text.

- [ ] **Step 1: Expose a test-only picker trigger**

In `src/main/test-hook.js`, add to the installed surface:

```js
    showCredentialPicker: (rows, truncated = 0) =>
      showOverlay('credential-picker', {
        prefill: { requestId: 'test-request', host: 'example.test', rows, truncated },
      }),
```

and pass `showOverlay` through from `main.js`'s `test-hook` install call (it is already passed — confirm it is in the destructured options; if not, add it).

- [ ] **Step 2: Write the failing scenario**

Create `test/desktop/features/credential-picker.feature`:

```gherkin
Feature: 1Password credential picker
  The picker renders vault-supplied strings, which are untrusted text in a
  privileged renderer. They must never become markup.

  Scenario: vault strings render as literal text
    Given the app is running
    When the credential picker is shown with a hostile item title
    Then the picker row shows the title as literal text
    And the picker row contains no injected elements
```

- [ ] **Step 3: Write the step definitions**

Create `test/desktop/steps/credential-picker.steps.mjs`, following the existing steps' import style:

```js
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

const HOSTILE = '<img src=x onerror="window.__pwned=1">';

When('the credential picker is shown with a hostile item title', async function () {
  await this.app.evaluate(({ }, payload) => globalThis.__blanc.showCredentialPicker(payload), [
    { username: '"><script>alert(1)</script>', title: HOSTILE, host: '</span><b>x', vaultName: 'Personal' },
  ]);
});

Then('the picker row shows the title as literal text', async function () {
  const overlay = await this.overlayWindow();
  const text = await overlay.locator('.cred-row .cred-meta').first().textContent();
  assert.ok(text.includes(HOSTILE), 'the raw markup must appear as visible characters');
});

Then('the picker row contains no injected elements', async function () {
  const overlay = await this.overlayWindow();
  const injected = await overlay.locator('.cred-row img, .cred-row script, .cred-row b').count();
  assert.equal(injected, 0, 'no element may be created from vault data');
  const pwned = await overlay.evaluate(() => window.__pwned);
  assert.equal(pwned, undefined, 'no injected handler may run');
});
```

*(If the harness has no `overlayWindow()` helper, add one alongside the existing window helpers in the world/support file — the overlay is a separate `WebContentsView`, so it is reached as its own Playwright page.)*

- [ ] **Step 4: Dry-run to check step resolution**

Run: `npm run test:acceptance:dry`
Expected: the three new steps resolve (no "undefined step" warnings).

- [ ] **Step 5: Run the scenario**

Run: `npm run test:acceptance:desktop`
Expected: the `credential-picker` scenario passes.

If the harness cannot reach the overlay renderer, **stop and record it** in the spec's testing section, then add `jsdom` as an explicit devDependency and port this assertion to a unit test — a deliberate, recorded decision, not a silent drop.

- [ ] **Step 6: Commit**

```bash
git add test/desktop src/main/test-hook.js
git commit -m "test(1password): adversarial real-DOM fixture for picker rendering"
```

---

### Task 8: Update the dev-usage doc

User-visible behavior changed — the picker looks different, appears less often, and has new outcomes.

**Files:**
- Modify: `docs/1password-dev-usage.md`

- [ ] **Step 1: Document ranking and the picker**

In the "Notes & limits" section, after the registrable-domain bullet, add:

```markdown
- **You'll rarely see a picker.** Matches are ranked by how well the saved
  website fits the page — an item saved for the exact host beats one saved for
  the parent domain, which beats a sibling subdomain — and only the best tier is
  offered. On a site where one item clearly fits, Blanc fills it without asking.
- **When several items tie**, the Island shows a list labelled by **username**
  (the only field that reliably distinguishes near-duplicate items), with the
  item title and matched host beneath. ↑/↓ to move, Enter to fill, Escape to
  cancel. At most 10 are shown; if more matched, the last line says how many
  were left out.
- Reading those usernames means Blanc briefly decrypts each listed item — but
  only when a picker is actually needed, never more than 10, and only after the
  page has been judged fillable. The passwords are released immediately; only
  the one you pick is read again to fill.
```

- [ ] **Step 2: Add the new outcomes**

In the troubleshooting table, add:

```markdown
| `chooser-cancel dismissed` / `chooser-cancel escape` | You cancelled the picker. Nothing was filled. |
| `chooser-cancel timeout` | The picker sat open for 60s and closed itself. Press ⌥⌘P again. |
| `chooser-cancel blur` / `chooser-cancel tab-changed` | The picker closed because you switched away. Nothing was filled. |
```

- [ ] **Step 3: Verify accuracy**

Run: `grep -n "exact host\|first visible password" docs/1password-dev-usage.md`
Expected: no output (no stale matching claims).

- [ ] **Step 4: Commit**

```bash
git add docs/1password-dev-usage.md
git commit -m "docs(1password): dev-usage covers ranking and the Island picker"
```

---

## Self-Review

**Spec coverage:**
- Orchestration order (rank → inspect → reject → consent → enumerate → pick → re-validate → reveal → fill) → Task 5 Steps 3–4, asserted by the `T5-order` test. ✅
- Logging boundary moves to the first `items.get()` → enumeration sits inside phase 2's binding-less catch (Task 5 Step 4). ✅
- `kept.length === 1` skips enumeration and picker; `=== 0` logs `no-match` → Task 5 Step 3 + `T5-order` test. ✅
- Tiers, best-tier-only, deterministic comparator, smallest-host, cap + `truncated` → Task 1. ✅
- `findLogins` richer shape → Task 2. ✅
- Sequential enumeration, ≤ `PICKER_MAX`, injectable client, no password on rows, failure aborts → Task 3. ✅
- Closed `reason` enum, exactly-once settlement, all ten routes, conditional `win.focus()` → Task 4 Steps 4–6. ✅
- Two-stage reply validation (stage 1 inert, stage 2 cancels), overlay-only sender, random `requestId`, index validation → Task 4 Steps 3, 7. ✅
- Rows carry only four keys → Task 5 Step 4 (the `.map` is the enforcement point). ✅
- Focus policy: `selected` gated before decrypt, `dismissed`/`escape` best-effort, others none → Task 5 Step 4. ✅
- `textContent`-only rendering + source guard + adversarial DOM fixture → Tasks 6 and 7. ✅
- Truncation line → Task 6 Step 3. ✅
- Dev-usage doc → Task 8. ✅

**Deliberately not covered:** type-to-filter and remembering a choice per host — both listed as spec non-goals.

**Known risk carried into execution:** Task 7 assumes the acceptance harness can drive the overlay renderer as its own Playwright page. Step 5 states the fallback explicitly (record it, add `jsdom`, port the assertion) rather than leaving the test to be silently dropped.

**Placeholder scan:** no `TBD`/`TODO`/"handle errors appropriately". Every code step carries the actual code. The one conditional instruction — Task 7's harness fallback — names its decision and its recorded outcome.

**Type consistency:** `findLogins` (Task 2) emits `{vaultId, vaultName, itemId, title, hosts, updatedAt}`, exactly the shape `rankMatches` (Task 1) consumes; `rankMatches` adds `tier` and `host`, which `revealUsernames` (Task 3) reads and passes through; the orchestrator (Task 5) maps those rows down to the four renderer keys `{username, title, host, vaultName}` that `renderCredentialPicker` (Task 6) reads. `requestCredentialPick` resolves `{index, reason}` in Task 4 and is destructured as such in Task 5. `isValidPickIndex(index, len)` is defined in Task 4 Step 3 and called in Task 4 Step 7 with `pending.candidates.length`.
