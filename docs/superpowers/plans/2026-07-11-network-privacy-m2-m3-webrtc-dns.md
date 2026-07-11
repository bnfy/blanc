# Network Privacy M2+M3 — WebRTC Leak Protection + Encrypted DNS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one "network privacy" app release adding two settings-driven, session-level protections to Blanc: WebRTC IP-handling policy (F26) and encrypted DNS / DoH (F25), each with a Settings control, parity-spec entries, and an honest security-page section.

**Architecture:** A new pure, Electron-free module `src/main/network-privacy.js` holds all the decision logic (setting value → Electron policy string / host-resolver options, plus DoH-template validation) so it can be unit-tested in isolation like `permission-decisions.js`. `settings.js` gains the two enums + string key through the S5 substrate (schema.json + the hand-written `build.mjs` generator + regenerated mobile artifacts). `main.js` applies WebRTC policy per-tab at the single `createTab` choke point and configures DoH per-session on both browsing sessions, re-applying both live from the existing `onSettingsChanged` listener. The internal Settings page gets two Privacy controls.

**Tech Stack:** Electron 43.1.0 (pinned), Node's built-in `node:test`, the existing `JsonStore` settings layer, the `settings-schema` codegen substrate, static internal HTML pages served over `blanc://`.

**Spec:** `docs/superpowers/specs/2026-07-11-network-privacy-design.md` — Track 2, Feature 1 (F26) and Feature 2 (F25). Read those two feature sections before starting.

## Global Constraints

- **Two features, one release.** Tasks keep WebRTC (Task 3) and DoH (Task 4) separable so a reviewer can gate each, but they ship together as one version bump.
- **Verified Electron 43.1.0 API facts (confirmed against `node_modules/electron/electron.d.ts`):**
  - DoH is **`app.configureHostResolver(options)`** — a **process-wide App method** (`electron.d.ts:1044`, inside `interface App`), called **once** after `ready`. It is NOT a Session method: `class Session` (`electron.d.ts:12288`) exposes only `clearHostResolverCache` (`electron.d.ts:12902`). This matches the original spec; an earlier draft of this plan wrongly put it on Session — do not reintroduce `sess.configureHostResolver`, which does not exist.
  - `configureHostResolver` **must be called after the `ready` event**.
  - **Do NOT force `enableBuiltInResolver`.** Electron documents it as "prefer Chromium's built-in resolver over getaddrinfo" (default: on for macOS, off for Windows/Linux), not a DoH prerequisite. Forcing it would move Windows/Linux off the system resolver in the **Off** position, contradicting "Off — use the system resolver" and possibly altering VPN/corporate DNS. Omit it entirely; only add it **per-mode** (never for `off`) if cross-platform testing proves a specific mode needs it (Task 4 Step 4 records this as a testing-gated decision).
  - `secureDnsMode` accepts exactly `'off' | 'automatic' | 'secure'`; servers go in `secureDnsServers: string[]`.
  - WebRTC is **`webContents.setWebRTCIPHandlingPolicy(policy)`** accepting exactly `'default' | 'default_public_interface_only' | 'default_public_and_private_interfaces' | 'disable_non_proxied_udp'`.
  - Live DNS transitions: re-call `app.configureHostResolver(opts)` once, then clear **both** browsing sessions' caches via `session.clearHostResolverCache(): Promise<void>` — handle the returned promises (`Promise.allSettled`) so a failed clear can't become an unhandled rejection.
- **Strict DNS never falls back (F25 hard rule).** `custom` is persisted only alongside a valid template: `setSettings` rejects an invalid custom transition (preserving the last valid config), and `getSettings` coerces a corrupted stored `custom` state to the default on read (the `appIcon` symmetry pattern). `hostResolverOptionsFor` therefore never returns `automatic` for `custom`.
- **New Settings controls are capability-guarded.** Initialize them behind `supports('webrtcPolicy')` / `supports('secureDns')` and `.remove()` the markup when unsupported, exactly like `homePage`/`appIcon` — so D17/D18 (no iOS controls) are honored by the same mechanism.
- **Version bump updates BOTH `package.json` and `package-lock.json`** (the lockfile records the version at its top level and at `packages[""]`). Use `npm version 0.17.0 --no-git-tag-version`, which edits both, and stage both.
- **Honesty rules (verbatim intent from the spec — enforce in every user-facing string):**
  - WebRTC strict mode is labeled **"Disable direct UDP"**, never "relay-only," "closes the leak," or "closes the leak entirely." The precise claim is that it **blocks a specific direct-UDP proxy-bypass path** / reduces that bypass risk — it does not close an entire WebRTC leak. Stored enum ids stay `standard`/`strict`; only labels carry the honest wording.
  - DoH copy must state: it does not hide destination IPs; hostnames may still leak via TLS metadata when ECH is unavailable; provider choice is a trust decision; **Auto does not guarantee encrypted DNS** (opportunistic, falls back to plaintext). Strict provider positions hard-fail rather than fall back.
  - Per-provider DoH labels state each resolver's real behavior: Cloudflare unfiltered, **Quad9 blocks known-malware domains + validates DNSSEC**, Mullvad base/unfiltered.
- **Device-local settings.** `webrtcPolicy`, `secureDns`, `secureDnsTemplate` are **NOT** added to `SYNCED_KEYS` in `settings.js` (device/network-specific in v1).
- **S5 substrate is hand-written, not schema-driven.** `settings-schema/build.mjs` hardcodes enum parsing, default regexes, drift `cmp`/`eq` lines, and Swift **and** Kotlin generation per key. Editing `schema.json` alone leaves the drift guard and mobile artifacts blind. Never hand-edit `settings-schema/generated/*` — run `npm run settings:build`.
- **Site claims only shipped features.** The security-page sections (Task 7) land in this same release and deploy *after* the release is cut, never before.
- **Concurrency-safe git (shared checkout):** before Task 1's first commit, `git tag -l m2m3-base` must be empty (else an earlier run aborted — reconcile, then `git tag -d m2m3-base`); then `git tag m2m3-base`. Every commit runs `git status --short` first and stages only that task's named files (never `git add -A` / `git add src`). Delete the tag when the release task completes or the run stops.

---

### Task 1: Pure `network-privacy.js` decision module (TDD, no Electron)

**Files:**
- Create: `src/main/network-privacy.js`
- Test: `test/unit/network-privacy.test.js`

**Interfaces:**
- Produces (consumed by Tasks 2, 3, 4):
  - `WEBRTC_IP_HANDLING_POLICY: { standard: 'default_public_interface_only', strict: 'disable_non_proxied_udp' }`
  - `webrtcPolicyFor(value: string): string` — maps a `webrtcPolicy` setting to an Electron policy string; unknown → the `standard` mapping.
  - `SECURE_DNS_TEMPLATES: { cloudflare, quad9, mullvad: string }`
  - `isValidDohTemplate(str: unknown): boolean` — raw-string DoH template validation.
  - `hostResolverOptionsFor(secureDns: string, secureDnsTemplate: string): { secureDnsMode: 'off'|'automatic'|'secure', secureDnsServers?: string[] }` (no `enableBuiltInResolver` — see Global Constraints)

- [ ] **Step 1: Write the failing test**

Create `test/unit/network-privacy.test.js`:

```js
const assert = require('node:assert/strict');
const test = require('node:test');

const {
  WEBRTC_IP_HANDLING_POLICY,
  webrtcPolicyFor,
  SECURE_DNS_TEMPLATES,
  isValidDohTemplate,
  hostResolverOptionsFor,
} = require('../../src/main/network-privacy');

test('webrtcPolicyFor maps settings to Electron policy strings', () => {
  assert.equal(webrtcPolicyFor('standard'), 'default_public_interface_only');
  assert.equal(webrtcPolicyFor('strict'), 'disable_non_proxied_udp');
  // unknown/garbage falls back to the hardened standard default, never 'default'
  assert.equal(webrtcPolicyFor('nonsense'), 'default_public_interface_only');
  assert.equal(webrtcPolicyFor(undefined), 'default_public_interface_only');
  // every mapping is a real Electron policy value
  const valid = new Set(['default', 'default_public_interface_only', 'default_public_and_private_interfaces', 'disable_non_proxied_udp']);
  for (const v of Object.values(WEBRTC_IP_HANDLING_POLICY)) assert.ok(valid.has(v));
});

test('isValidDohTemplate accepts well-formed templates', () => {
  assert.ok(isValidDohTemplate('https://cloudflare-dns.com/dns-query'));
  assert.ok(isValidDohTemplate('https://dns.quad9.net/dns-query'));
  assert.ok(isValidDohTemplate('https://dns.nextdns.io/abc123'));
  assert.ok(isValidDohTemplate('https://example.com/dns-query{?dns}')); // single terminal token
});

test('isValidDohTemplate rejects malformed templates', () => {
  assert.equal(isValidDohTemplate(''), false);
  assert.equal(isValidDohTemplate('http://insecure.example/dns-query'), false); // not https
  assert.equal(isValidDohTemplate('ftp://x'), false);
  assert.equal(isValidDohTemplate('not a url'), false);
  assert.equal(isValidDohTemplate('https://user:pass@host/dns-query'), false); // credentials
  assert.equal(isValidDohTemplate('https://host/dns-query#frag'), false); // fragment
  assert.equal(isValidDohTemplate('https://host/{?dns}/tail'), false); // token not terminal
  assert.equal(isValidDohTemplate('https://host/{?dns}{?dns}'), false); // repeated token
  assert.equal(isValidDohTemplate('https://host/{foo}'), false); // wrong token
  assert.equal(isValidDohTemplate('https://' + 'a'.repeat(2100)), false); // oversize
  assert.equal(isValidDohTemplate(42), false);
  assert.equal(isValidDohTemplate(null), false);
});

test('hostResolverOptionsFor never sets enableBuiltInResolver (Off must keep the system resolver)', () => {
  for (const v of ['auto', 'off', 'cloudflare', 'quad9', 'mullvad', 'custom']) {
    assert.ok(!('enableBuiltInResolver' in hostResolverOptionsFor(v, 'https://dns.example/dns-query')));
  }
});

test('hostResolverOptionsFor: auto and unknown are opportunistic automatic with no servers', () => {
  assert.deepEqual(hostResolverOptionsFor('auto', ''), { secureDnsMode: 'automatic' });
  assert.deepEqual(hostResolverOptionsFor('mystery', ''), { secureDnsMode: 'automatic' });
});

test('hostResolverOptionsFor: off disables DoH', () => {
  assert.deepEqual(hostResolverOptionsFor('off', ''), { secureDnsMode: 'off' });
});

test('hostResolverOptionsFor: named providers hard-fail on their own template', () => {
  assert.deepEqual(hostResolverOptionsFor('cloudflare', ''), {
    secureDnsMode: 'secure', secureDnsServers: ['https://cloudflare-dns.com/dns-query'],
  });
  assert.deepEqual(hostResolverOptionsFor('quad9', ''), {
    secureDnsMode: 'secure', secureDnsServers: ['https://dns.quad9.net/dns-query'],
  });
  assert.deepEqual(hostResolverOptionsFor('mullvad', ''), {
    secureDnsMode: 'secure', secureDnsServers: ['https://dns.mullvad.net/dns-query'],
  });
});

test('hostResolverOptionsFor: custom stays strict (secure) — never degrades to automatic', () => {
  // The settings layer guarantees a valid template accompanies 'custom' (setSettings
  // rejects invalid custom transitions; getSettings coerces corrupted state). So the
  // custom branch is always strict-secure — it must NEVER return automatic.
  assert.deepEqual(hostResolverOptionsFor('custom', 'https://dns.nextdns.io/abc123'), {
    secureDnsMode: 'secure', secureDnsServers: ['https://dns.nextdns.io/abc123'],
  });
  assert.equal(hostResolverOptionsFor('custom', 'https://dns.nextdns.io/abc123').secureDnsMode, 'secure');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- test/unit/network-privacy.test.js` (or `node --test test/unit/network-privacy.test.js`)
Expected: FAIL — `Cannot find module '../../src/main/network-privacy'`.

- [ ] **Step 3: Write the module**

Create `src/main/network-privacy.js`:

```js
// Pure, Electron-free decision logic for the network-privacy settings
// (WebRTC IP-handling policy + encrypted DNS). Kept dependency-free so it
// unit-tests in isolation, exactly like permission-decisions.js. main.js and
// settings.js import from here; nothing here imports electron.

// WebRTC: map the user-facing setting to a Chromium IP-handling policy.
// 'standard' hides non-default-route/multi-homed addresses (Blanc's hardened
// default). 'strict' additionally disables direct UDP that would bypass an
// application-level proxy — this is NOT relay-only enforcement (Electron only
// offers disable_non_proxied_udp), so no caller may describe it as such.
const WEBRTC_IP_HANDLING_POLICY = {
  standard: 'default_public_interface_only',
  strict: 'disable_non_proxied_udp',
};

function webrtcPolicyFor(value) {
  return WEBRTC_IP_HANDLING_POLICY[value] || WEBRTC_IP_HANDLING_POLICY.standard;
}

// DoH provider templates. Cloudflare/Mullvad are unfiltered; dns.quad9.net is
// Quad9's malware-blocking + DNSSEC-validating endpoint (that filtering is its
// signature service — the Settings label says so). Ad/tracker filtering stays
// the job of Blanc's own blocker.
const SECURE_DNS_TEMPLATES = {
  cloudflare: 'https://cloudflare-dns.com/dns-query',
  quad9: 'https://dns.quad9.net/dns-query',
  mullvad: 'https://dns.mullvad.net/dns-query',
};

// Validate a custom DoH template against the raw string. We deliberately do NOT
// round-trip through new URL() for the whole value, because that percent-encodes
// the RFC8484 {?dns} braces. Grammar: https scheme, no credentials (userinfo),
// no fragment, <= 2048 chars, and either no template variable or a single
// terminal {?dns}.
function isValidDohTemplate(str) {
  if (typeof str !== 'string') return false;
  if (str.length === 0 || str.length > 2048) return false;
  if (!str.startsWith('https://')) return false;
  if (str.includes('#')) return false; // no fragment

  const authority = str.slice('https://'.length).split(/[/?]/)[0];
  if (authority.length === 0 || authority.includes('@')) return false; // no userinfo

  const tokens = str.match(/\{[^}]*\}/g) || [];
  if (tokens.length > 1) return false;
  if (tokens.length === 1 && (tokens[0] !== '{?dns}' || !str.endsWith('{?dns}'))) return false;

  // Validate the non-template portion is a real https URL (braces stripped first).
  try {
    const u = new URL(str.replace('{?dns}', ''));
    if (u.protocol !== 'https:') return false;
  } catch {
    return false;
  }
  return true;
}

// Build the options object for app.configureHostResolver() (process-wide, Electron
// 43). We deliberately do NOT set enableBuiltInResolver — it defaults on for macOS,
// off for Windows/Linux, and forcing it would push Off/system-resolver users off
// their configured DNS. Named providers use secureDnsMode 'secure' (hard-fail, no
// plaintext fallback); auto is 'automatic' (opportunistic, may fall back to plaintext
// by design); off disables DoH.
//
// 'custom' is ALWAYS strict-secure and never degrades to automatic: the settings
// layer (setSettings reject + getSettings coerce) guarantees a valid template
// accompanies 'custom', so a valid strict choice is never silently downgraded.
function hostResolverOptionsFor(secureDns, secureDnsTemplate) {
  switch (secureDns) {
    case 'off':
      return { secureDnsMode: 'off' };
    case 'cloudflare':
    case 'quad9':
    case 'mullvad':
      return { secureDnsMode: 'secure', secureDnsServers: [SECURE_DNS_TEMPLATES[secureDns]] };
    case 'custom':
      return { secureDnsMode: 'secure', secureDnsServers: [secureDnsTemplate] };
    case 'auto':
    default:
      return { secureDnsMode: 'automatic' };
  }
}

module.exports = {
  WEBRTC_IP_HANDLING_POLICY,
  webrtcPolicyFor,
  SECURE_DNS_TEMPLATES,
  isValidDohTemplate,
  hostResolverOptionsFor,
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- test/unit/network-privacy.test.js`
Expected: PASS — all tests green.

- [ ] **Step 5: Mark the base tag and commit**

```bash
git tag -l m2m3-base   # must print nothing; leftover tag means an aborted run — reconcile then: git tag -d m2m3-base
git tag m2m3-base
git status --short      # expect ONLY the two new files
git add src/main/network-privacy.js test/unit/network-privacy.test.js
git commit -m "Add pure network-privacy decision module (WebRTC + DoH mapping)"
```

---

### Task 2: Settings substrate — new keys through settings.js + schema.json + build.mjs

**Files:**
- Modify: `src/main/settings.js` (enums near line 10; `DEFAULTS` 51–71; `sanitize()` 97–117; `require` at top)
- Modify: `settings-schema/schema.json` (enum lists; `defaults`; `settings` array)
- Modify: `settings-schema/build.mjs` (parse matchers; default regexes; `cmp`/`eq` drift; Swift + Kotlin generators)
- Regenerate: `settings-schema/generated/BlancSettings.swift`, `settings-schema/generated/BlancSettings.kt` (via `npm run settings:build` — never hand-edit)
- Test: reuses `test/unit/network-privacy.test.js`; adds `settings:check` as the guard

**Interfaces:**
- Consumes: `isValidDohTemplate` from Task 1.
- Produces (consumed by Tasks 3–5): settings keys `webrtcPolicy` (default `'standard'`), `secureDns` (default `'auto'`), `secureDnsTemplate` (default `''`), round-tripping through `getSettings()`/`setSettings()`.

- [ ] **Step 1: Add the enums, defaults, and import in `settings.js`**

At the top of `src/main/settings.js`, add the import (near the other requires):

```js
const { isValidDohTemplate } = require('./network-privacy');
```

Immediately after the existing `const THEMES = ['system', 'light', 'dark'];` (line 10), add:

```js
// Network-privacy enums (bare arrays, like THEMES — build.mjs parses them by name).
const WEBRTC_POLICIES = ['standard', 'strict'];
const SECURE_DNS_OPTIONS = ['auto', 'off', 'cloudflare', 'quad9', 'mullvad', 'custom'];
```

In `DEFAULTS` (lines 51–71), add these three keys just after `adblockExceptions: [],` (line 59):

```js
  // Network privacy (device-local — deliberately NOT in SYNCED_KEYS).
  webrtcPolicy: 'standard',
  secureDns: 'auto',
  secureDnsTemplate: '',
```

- [ ] **Step 2: Add the sanitize clauses and the strict-custom guards in `settings.js`**

In `sanitize()` (lines 97–117), after the `theme` line (`if (THEMES.includes(partial.theme)) clean.theme = partial.theme;`, line 105), add:

```js
  if (WEBRTC_POLICIES.includes(partial.webrtcPolicy)) clean.webrtcPolicy = partial.webrtcPolicy;
  if (SECURE_DNS_OPTIONS.includes(partial.secureDns)) clean.secureDns = partial.secureDns;
  if (typeof partial.secureDnsTemplate === 'string') {
    // Accept only an empty string or a valid template. An invalid value is DROPPED
    // (key omitted from clean) so it can never overwrite a good stored template; the
    // cross-field guard in setSettings then decides the secureDns transition.
    const t = partial.secureDnsTemplate.trim();
    if (t === '' || isValidDohTemplate(t)) clean.secureDnsTemplate = t;
  }
```

Then, in **`setSettings()`** (lines 119–130), after `const clean = sanitize(partial);` and before the `s.update(...)` call, add the cross-field write-guard (the store's current values are readable as `s.data.*`):

```js
  // Strict-mode invariant (F25): never let secureDns='custom' persist without a
  // valid template — that would silently become plaintext-capable Automatic at the
  // resolver. Reject the DNS part of a change that would leave custom+invalid,
  // preserving the last valid configuration rather than falling back.
  const nextSecureDns = 'secureDns' in clean ? clean.secureDns : s.data.secureDns;
  const nextTemplate = 'secureDnsTemplate' in clean ? clean.secureDnsTemplate : s.data.secureDnsTemplate;
  if (nextSecureDns === 'custom' && !isValidDohTemplate(nextTemplate)) {
    delete clean.secureDns;
    delete clean.secureDnsTemplate;
  }
```

Finally, in **`getSettings()`** (lines 84–88), add a read-side coercion mirroring the existing `appIcon` line — for a *corrupted* stored state only (a hand-edited settings.json), since the write-guard prevents a valid user action from ever producing custom+invalid:

```js
  if (data.secureDns === 'custom' && !isValidDohTemplate(data.secureDnsTemplate)) {
    data.secureDns = DEFAULTS.secureDns;
  }
```

- [ ] **Step 3: Extend `schema.json`**

In `settings-schema/schema.json`, after the `"themes"` line (line 10), add:

```json
  "webrtcPolicies": ["standard", "strict"],
  "secureDnsOptions": ["auto", "off", "cloudflare", "quad9", "mullvad", "custom"],
```

In the `"defaults"` object (lines 26–35), after `"adblockExceptions": [],`, add:

```json
    "webrtcPolicy": "standard",
    "secureDns": "auto",
    "secureDnsTemplate": "",
```

In the `"settings"` array (lines 38–47), after the `theme` entry, add:

```json
    { "key": "webrtcPolicy", "type": "enum", "enum": "webrtcPolicies", "default": "standard", "note": "maps to webContents.setWebRTCIPHandlingPolicy; strict = disable_non_proxied_udp" },
    { "key": "secureDns", "type": "enum", "enum": "secureDnsOptions", "default": "auto", "note": "app.configureHostResolver secureDnsMode; strict positions hard-fail" },
    { "key": "secureDnsTemplate", "type": "string", "default": "", "note": "custom DoH RFC8484 template; validated raw (not URL-normalized)" },
```

- [ ] **Step 4: Extend `build.mjs` — enum parsing + default regexes**

In `settings-schema/build.mjs`, in `parseSettingsJs()`, after the `themes` matcher (line 96–97) — which reads:

```js
  const themesBlock = (js.match(/const THEMES = \[([^\]]*)\]/)?.[1] ?? '').replace(/\/\/.*$/gm, '');
  const themes = [...themesBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]);
```

add two matchers that mirror it **exactly** (comment-strip then `matchAll` — do NOT use `.split(',')`; the comment-strip is what keeps a commented-out entry from being read as live, per the substrate's checker contract):

```js
  const webrtcBlock = (js.match(/const WEBRTC_POLICIES = \[([^\]]*)\]/)?.[1] ?? '').replace(/\/\/.*$/gm, '');
  const webrtcPolicies = [...webrtcBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const secureDnsBlock = (js.match(/const SECURE_DNS_OPTIONS = \[([^\]]*)\]/)?.[1] ?? '').replace(/\/\/.*$/gm, '');
  const secureDnsOptions = [...secureDnsBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]);
```

Then extend the function's return statement (line 115) to include the two new arrays. Change:

```js
  return { engines, themes, appIcons, supporterIcons, defaults, defaultKeys };
```
to:
```js
  return { engines, themes, webrtcPolicies, secureDnsOptions, appIcons, supporterIcons, defaults, defaultKeys };
```

In the `defaults` object built from the DEFAULTS regexes (lines 102–111), add three entries:

```js
    webrtcPolicy: s(/^\s*webrtcPolicy:\s*'([^']*)'/m),
    secureDns: s(/^\s*secureDns:\s*'([^']*)'/m),
    secureDnsTemplate: s(/^\s*secureDnsTemplate:\s*'([^']*)'/m),
```

- [ ] **Step 5: Extend `build.mjs` — drift `cmp`/`eq` lines**

In `check()`, after the `cmp('themes', ...)` line (line 125), add:

```js
  cmp('webrtcPolicies', js.webrtcPolicies, spec.webrtcPolicies);
  cmp('secureDnsOptions', js.secureDnsOptions, spec.secureDnsOptions);
```

After the `eq('theme', ...)` line (line 146), add:

```js
  eq('webrtcPolicy', jd.webrtcPolicy, d.webrtcPolicy);
  eq('secureDns', jd.secureDns, d.secureDns);
  eq('secureDnsTemplate', jd.secureDnsTemplate, d.secureDnsTemplate);
```

- [ ] **Step 6: Extend `build.mjs` — Swift generator**

In `genSwift()`, after the `BlancThemePreference` enum block (lines 37–39) — which reads `for (const t of spec.themes) out += \`    case ${swiftCase(t)}\n\`;` (String enums infer the raw value from the case name, so no `= "..."`) — add two label-less enums modeled on it exactly:

```js
  out += 'public enum BlancWebrtcPolicy: String, CaseIterable {\n';
  for (const v of spec.webrtcPolicies) out += `    case ${swiftCase(v)}\n`;
  out += '}\n\n';
  out += 'public enum BlancSecureDns: String, CaseIterable {\n';
  for (const v of spec.secureDnsOptions) out += `    case ${swiftCase(v)}\n`;
  out += '}\n\n';
```

In the Swift defaults struct (lines 48–55), after the `theme` line (line 52), add:

```js
  out += `    public static let webrtcPolicy: BlancWebrtcPolicy = .${swiftCase(spec.defaults.webrtcPolicy)}\n`;
  out += `    public static let secureDns: BlancSecureDns = .${swiftCase(spec.defaults.secureDns)}\n`;
  out += `    public static let secureDnsTemplate: String = ${JSON.stringify(spec.defaults.secureDnsTemplate)}\n`;
```

- [ ] **Step 7: Extend `build.mjs` — Kotlin generator**

In `genKotlin()`, after the `BlancThemePreference` enum block (lines 66–67) — which reads `spec.themes.map((t) => \`    ${upper(t)}("${t}")\`).join(',\n') + ';\n}\n\n'` — add two enums in the same shape (`("${v}")`, not `JSON.stringify`):

```js
  out += 'enum class BlancWebrtcPolicy(val id: String) {\n';
  out += spec.webrtcPolicies.map((v) => `    ${upper(v)}("${v}")`).join(',\n') + ';\n}\n\n';
  out += 'enum class BlancSecureDns(val id: String) {\n';
  out += spec.secureDnsOptions.map((v) => `    ${upper(v)}("${v}")`).join(',\n') + ';\n}\n\n';
```

In the Kotlin defaults object (lines 70–78), after the `theme` line, add:

```js
  out += `    val webrtcPolicy = BlancWebrtcPolicy.${upper(spec.defaults.webrtcPolicy)}\n`;
  out += `    val secureDns = BlancSecureDns.${upper(spec.defaults.secureDns)}\n`;
  out += `    const val secureDnsTemplate = ${JSON.stringify(spec.defaults.secureDnsTemplate)}\n`;
```

- [ ] **Step 8: Regenerate mobile artifacts and run the drift check**

```bash
npm run settings:build   # regenerates generated/BlancSettings.swift + .kt
npm run settings:check
```
Expected: `settings:check` prints success / exits 0 (no drift, no STALE). If it reports a key missing from schema.json or a STALE generated file, fix the offending edit and re-run — do not proceed on a red check.

- [ ] **Step 9: Confirm the full substrate + unit suite is green**

```bash
npm run substrate:check
npm run test:unit
```
Expected: both exit 0. `substrate:check` runs tokens/settings/copy/adblock checks; only settings changed, so the others must remain green (proving no collateral drift).

- [ ] **Step 10: Commit**

```bash
git status --short   # expect settings.js, schema.json, build.mjs, and the two generated/*.swift/.kt files
git add src/main/settings.js settings-schema/schema.json settings-schema/build.mjs settings-schema/generated/BlancSettings.swift settings-schema/generated/BlancSettings.kt
git commit -m "Add webrtcPolicy + secureDns settings through the S5 substrate"
```

---

### Task 3: Apply WebRTC IP-handling policy in the main process (F26)

**Files:**
- Modify: `src/main/main.js` (import near line 6; per-tab apply at line 906; live re-apply in the `onSettingsChanged` block at 2078)

**Interfaces:**
- Consumes: `webrtcPolicyFor` from Task 1; `settings.getSettings().webrtcPolicy` from Task 2.
- Produces: `applyWebrtcPolicyToAllTabs()` and the WebRTC branch of the shared `onSettingsChanged` listener (Task 4 adds the DNS branch to the same block).

- [ ] **Step 1: Import the helper**

In `src/main/main.js`, near the other `require('./...')` lines (the adblock import is at line 6), add:

```js
const { webrtcPolicyFor, hostResolverOptionsFor } = require('./network-privacy');
```

(Both helpers are imported together here; Task 4 uses `hostResolverOptionsFor`.)

- [ ] **Step 2: Apply the policy at the single tab choke point**

In `createTab()`, immediately after `const wc = view.webContents;` (line 906), add:

```js
  // WebRTC IP-handling policy applies per-webContents; this is the single choke
  // point every tab (fresh or adopted window.open child) passes through.
  wc.setWebRTCIPHandlingPolicy(webrtcPolicyFor(settings.getSettings().webrtcPolicy));
```

- [ ] **Step 3: Add the live re-apply helper**

Near the other tab-broadcast helpers in `main.js` (any module-scope function region above the `app.whenReady` handler), add:

```js
// Re-apply the current WebRTC policy to every open tab (used when the setting changes).
function applyWebrtcPolicyToAllTabs() {
  const policy = webrtcPolicyFor(settings.getSettings().webrtcPolicy);
  for (const tab of tabs.values()) {
    tab.view.webContents.setWebRTCIPHandlingPolicy(policy);
  }
}
```

- [ ] **Step 4: Hook it into the settings listener**

In the existing `settings.onSettingsChanged((s) => { ... })` block (lines 2078–2082), which currently reads:

```js
  settings.onSettingsChanged((s) => {
    setAdBlockEnabled(s.adblockEnabled);
    applyTheme();
    applyAppIcon();
  });
```

replace it with (WebRTC line added now; the DoH branch is added in Task 4). The WebRTC reapply is unconditional — `setWebRTCIPHandlingPolicy` is a cheap, idempotent per-tab call, and settings writes are infrequent and user-initiated, so change-detection isn't worth the state:

```js
  settings.onSettingsChanged((s) => {
    setAdBlockEnabled(s.adblockEnabled);
    applyTheme();
    applyAppIcon();
    applyWebrtcPolicyToAllTabs();
  });
```

- [ ] **Step 5: Manual verification (WebRTC)**

Run the app: `npm start`. Then, in three separately-tested network contexts — a direct connection, a system-wide VPN, and an application-level proxy — visit `https://browserleaks.com/webrtc` and record the ICE-candidate behavior in each:
- Standard (default): local/multi-homed private addresses are not exposed in any of the three.
- Switch Settings → Privacy → "Disable direct UDP", reload the test page: with an application-level proxy configured, direct UDP candidates no longer appear.

Do NOT write up any result as demonstrating relay-only behavior — the mode only disables direct UDP. (The value mapping itself is already unit-tested in Task 1; this step verifies the live wiring.)

- [ ] **Step 6: Commit**

```bash
git status --short   # expect only src/main/main.js
git add src/main/main.js
git commit -m "Apply WebRTC IP-handling policy per tab, live on settings change (F26)"
```

---

### Task 4: Configure encrypted DNS process-wide (F25)

**Files:**
- Modify: `src/main/main.js` (process-wide config after line 1931; live re-config + cache clears in the `onSettingsChanged` block)

**Interfaces:**
- Consumes: `hostResolverOptionsFor` from Task 1 (imported in Task 3 Step 1); `app` (imported at `main.js:1`); `browsingSessions` closure var (line 1931, used only for the cache clears).
- Produces: module-scope `lastSecureDns` / `lastSecureDnsTemplate` (owned entirely by this task) and the DNS branch of the shared listener.

- [ ] **Step 1: Declare DNS change-tracking state (module scope)**

Directly above the `app.whenReady().then(async () => {` line (1928), add (starts null; seeded in Step 2 when DNS is first configured, so nothing touches the settings store at require-time):

```js
// Last-applied encrypted-DNS values, so onSettingsChanged only reconfigures the
// resolver + clears its cache when DNS actually changes — the listener fires on
// every settings write, and clearing the cache mid-session isn't free.
let lastSecureDns = null;
let lastSecureDnsTemplate = null;
```

- [ ] **Step 2: Configure both sessions once, after `ready`, and seed the state**

In the `app.whenReady().then(async () => { ... })` handler, immediately after `const browsingSessions = [ses, privateSes];` (line 1931), add:

```js
  // Encrypted DNS (DoH). app.configureHostResolver is process-wide in Electron 43
  // (an App method — electron.d.ts:1044) and must run after 'ready'. ONE call covers
  // every session, including the private-browsing session, so private tabs inherit
  // it by construction. Deliberately no enableBuiltInResolver (see Global Constraints:
  // forcing it would move the Off position off the system resolver on Win/Linux).
  {
    lastSecureDns = settings.getSettings().secureDns;
    lastSecureDnsTemplate = settings.getSettings().secureDnsTemplate;
    app.configureHostResolver(hostResolverOptionsFor(lastSecureDns, lastSecureDnsTemplate));
  }
```

- [ ] **Step 3: Add live re-config to the settings listener**

Extend the `settings.onSettingsChanged((s) => { ... })` block (as left by Task 3 Step 4) to add the DNS branch, so it reads:

```js
  settings.onSettingsChanged((s) => {
    setAdBlockEnabled(s.adblockEnabled);
    applyTheme();
    applyAppIcon();
    applyWebrtcPolicyToAllTabs();
    if (s.secureDns !== lastSecureDns || s.secureDnsTemplate !== lastSecureDnsTemplate) {
      lastSecureDns = s.secureDns;
      lastSecureDnsTemplate = s.secureDnsTemplate;
      app.configureHostResolver(hostResolverOptionsFor(s.secureDns, s.secureDnsTemplate));
      // Clear cached lookups on both sessions so the new resolver takes effect without
      // a restart. clearHostResolverCache returns a promise; Promise.allSettled collects
      // any rejection so a failed clear can't surface as an unhandled rejection.
      Promise.allSettled(browsingSessions.map((sess) => sess.clearHostResolverCache()));
    }
  });
```

- [ ] **Step 4: Manual verification (DoH) — macOS, Windows, and Linux**

Electron's built-in resolver defaults differ by platform, so this is a three-platform check, not a single-machine one. On each of macOS, Windows, and Linux, run `npm start` and:
1. Settings → Privacy → DNS = **Cloudflare**; visit `https://one.one.one.one/help` → "Using DNS over HTTPS (DoH): **Yes**".
2. DNS = **Custom** with a garbage-but-well-formed template (e.g. `https://doh.invalid.example/dns-query`); attempt any navigation → it **fails** (proves no silent plaintext fallback in secure mode).
3. DNS = **Auto**; browsing works everywhere.
4. Change provider while the app is running (e.g. Cloudflare → Off → Quad9) → each switch takes effect **without a restart** (cache-clear working).
5. **Off must preserve system DNS:** with a system-level VPN/corporate resolver active, set DNS = Off and confirm name resolution still goes through that resolver (not a browser-side DoH path).

**Testing-gated `enableBuiltInResolver` decision:** if and only if strict/secure DoH (steps 1–2) does *not* activate on Windows or Linux — where Chromium's built-in resolver is off by default — add `enableBuiltInResolver: true` to the `secure` and `automatic` return branches of `hostResolverOptionsFor` **only** (never `off`), update that unit test, and re-run steps 1–5 on all three platforms. Do not add it preemptively; record the outcome in the commit message.

(The option-building is unit-tested in Task 1; this verifies the live Electron wiring and the platform-specific resolver behavior.)

- [ ] **Step 5: Commit**

```bash
git status --short   # expect only src/main/main.js
git add src/main/main.js
git commit -m "Configure encrypted DNS per session, live on settings change (F25)"
```

---

### Task 5: Settings-page Privacy controls

**Files:**
- Modify: `src/renderer/pages/settings.html` (`#group-privacy` section, ~line 84)
- Modify: `src/renderer/pages/settings.js` (load + change wiring, following the theme/searchEngine pattern at lines 16–36 and the conditional-visibility pattern at 399–401)
- Modify: `src/renderer/pages/pages.css` only if a new class is genuinely needed (prefer reusing existing `.setting`, `.setting-note` styles)

**Interfaces:**
- Consumes: settings keys from Task 2, round-tripped via `window.bowserPages.settings.get()/set()` (no IPC changes — `clientSettings()` already forwards all non-secret keys, per `pages.js:128`).

- [ ] **Step 1: Add the two controls to `settings.html`**

Inside the `.settings-card` of `<section id="group-privacy">` (line 86+), add three `.setting` blocks that reuse the established `.setting > .label > span + span.hint` structure (mirroring the Search-engine and New-tab-page settings at lines 66–80). Labels carry the honest wording; option `value`s are the stored enum ids. The custom-template field is its own `.setting` row (`#secureDnsCustomRow`) that shows only for the Custom provider, so its copy never joins the select's flex row:

```html
            <div class="setting">
              <div class="label">
                <span>WebRTC</span>
                <span class="hint">Limits which network addresses WebRTC may reveal. Standard hides non-default-route and multi-homed addresses.</span>
              </div>
              <select id="webrtcPolicy">
                <option value="standard">Standard — hide non-default addresses</option>
                <option value="strict">Disable direct UDP — for proxy users; may break or degrade some video calls</option>
              </select>
            </div>

            <div class="setting">
              <div class="label">
                <span>Encrypted DNS</span>
                <span class="hint">Encrypts DNS lookups between Blanc and the chosen resolver. It does not hide the sites you visit from your network, and it makes the resolver a party you trust. Automatic does not guarantee encryption. Strict providers may block captive-portal login pages — switch to Automatic to get through.</span>
              </div>
              <select id="secureDns">
                <option value="auto">Automatic — upgrade when available (may fall back to unencrypted)</option>
                <option value="off">Off — use the system resolver (best with a VPN's own DNS)</option>
                <option value="cloudflare">Cloudflare — unfiltered</option>
                <option value="quad9">Quad9 — blocks known-malware domains, validates DNSSEC</option>
                <option value="mullvad">Mullvad — unfiltered</option>
                <option value="custom">Custom provider…</option>
              </select>
            </div>

            <div class="setting" id="secureDnsCustomRow" hidden>
              <div class="label">
                <span>Custom DoH template</span>
                <span class="hint" id="secureDnsTemplateHint">An https:// DoH URL (RFC 8484). An invalid entry is ignored and the previous provider is kept.</span>
              </div>
              <input id="secureDnsTemplate" type="url" placeholder="https://your-provider.example/dns-query" />
            </div>
```

- [ ] **Step 2: Wire load + change in `settings.js`**

In `src/renderer/pages/settings.js`, after the existing simple bindings (theme/searchEngine/adblock, lines 16–36), add both controls behind `supports(...)` guards — mirroring the `homePage` guard at lines 39–45, so D17/D18 (no iOS controls) are honored by the same mechanism:

```js
  if (supports('webrtcPolicy')) {
    const webrtcPolicy = document.getElementById('webrtcPolicy');
    webrtcPolicy.value = settings.webrtcPolicy ?? 'standard';
    webrtcPolicy.addEventListener('change', () =>
      window.bowserPages.settings.set({ webrtcPolicy: webrtcPolicy.value }));
  } else {
    document.getElementById('webrtcPolicy')?.closest('.setting')?.remove();
  }

  if (supports('secureDns')) {
    const secureDns = document.getElementById('secureDns');
    const secureDnsRow = document.getElementById('secureDnsCustomRow');
    const secureDnsTemplate = document.getElementById('secureDnsTemplate');

    // Inline mirror of the main-process isValidDohTemplate for UX only; the main
    // process is the source of truth and re-validates + guards on write.
    const looksLikeValidTemplate = (t) => {
      if (typeof t !== 'string' || t.length === 0 || t.length > 2048) return false;
      if (!t.startsWith('https://') || t.includes('#')) return false;
      const authority = t.slice(8).split(/[/?]/)[0];
      if (!authority || authority.includes('@')) return false;
      const tokens = t.match(/\{[^}]*\}/g) || [];
      if (tokens.length > 1) return false;
      if (tokens.length === 1 && (tokens[0] !== '{?dns}' || !t.endsWith('{?dns}'))) return false;
      try { return new URL(t.replace('{?dns}', '')).protocol === 'https:'; } catch { return false; }
    };

    const commitCustomDns = () => {
      const t = secureDnsTemplate.value.trim();
      const ok = looksLikeValidTemplate(t);
      secureDnsTemplate.setAttribute('aria-invalid', ok ? 'false' : 'true');
      // Only persist secureDns=custom together with a valid template — never switch
      // to custom with an invalid one (the main process would reject it anyway).
      if (ok) window.bowserPages.settings.set({ secureDns: 'custom', secureDnsTemplate: t });
    };

    secureDns.value = settings.secureDns ?? 'auto';
    secureDnsTemplate.value = settings.secureDnsTemplate ?? '';
    secureDnsRow.hidden = secureDns.value !== 'custom';

    secureDns.addEventListener('change', () => {
      secureDnsRow.hidden = secureDns.value !== 'custom';
      if (secureDns.value === 'custom') {
        commitCustomDns(); // persists only if the (possibly pre-filled) template is valid
      } else {
        window.bowserPages.settings.set({ secureDns: secureDns.value });
      }
    });
    secureDnsTemplate.addEventListener('change', commitCustomDns);
  } else {
    document.getElementById('secureDns')?.closest('.setting')?.remove();
    document.getElementById('secureDnsCustomRow')?.remove();
  }
```

- [ ] **Step 3: Relaunch and verify the controls**

Because chrome/internal-page HTML/CSS/JS is loaded once, restart the app rather than reloading:

```bash
npm start
```
Open `blanc://settings` → Privacy section. Verify:
- WebRTC select shows both options; changing it persists (reopen Settings → value retained).
- Encrypted DNS select shows all six options; selecting "Custom provider…" reveals the custom-template `.setting` row.
- A bad URL in the custom field marks the input `aria-invalid` and does **not** switch the stored provider (reopen Settings → the previous provider is still selected — the strict-custom write-guard held).
- A valid template persists (reopen Settings → Custom selected, template retained).
- Selecting a named provider hides the custom row.

- [ ] **Step 4: Commit**

```bash
git status --short   # expect settings.html, settings.js, and pages.css only if changed
git add src/renderer/pages/settings.html src/renderer/pages/settings.js
git commit -m "Add WebRTC + encrypted-DNS controls to Settings → Privacy"
```

---

### Task 6: Parity spec entries (F25, F26, D17, D18)

**Files:**
- Modify: `spec/features.md` (append F25 and F26 after F24, line ~350)
- Modify: `spec/divergence-register.md` (append D17 and D18 after D16, line ~350)

**Interfaces:** none (documentation). Guarded only by the acceptance dry-run staying green.

- [ ] **Step 1: Add F25 and F26 to `spec/features.md`**

Append after the F24 entry:

```markdown
## F25 — Encrypted DNS (DoH)

- A Settings → Privacy control chooses how DNS is resolved: **Automatic**
  (opportunistic upgrade, may fall back to plaintext — no guarantee), **Off**
  (system resolver — the right choice under a VPN that runs its own DNS), a
  **named provider** (Cloudflare/Quad9/Mullvad — strict, hard-fail, no plaintext
  fallback), or a **Custom** RFC8484 template. DoH encrypts lookups between the
  browser and the chosen resolver; it does not hide destination IPs, and it makes
  the resolver a trusted party. Applies to normal and private sessions alike.
- **Acceptance:** With a named provider selected, `one.one.one.one/help` (or the
  provider's equivalent) reports DoH active; a deliberately-unreachable custom
  template fails closed rather than silently resolving over plaintext.

## F26 — WebRTC leak protection

- A Settings → Privacy control sets the WebRTC IP-handling policy: **Standard**
  exposes no addresses beyond the default route's public interface; **Disable
  direct UDP** additionally stops WebRTC from opening direct UDP paths that bypass
  an application-level proxy (not relay-only enforcement). Applied to every tab.
- **Acceptance:** On a WebRTC test page, Standard reveals no local/multi-homed
  private addresses; with an application proxy configured, Disable-direct-UDP
  removes direct UDP candidates.
```

- [ ] **Step 2: Add D17 and D18 to `spec/divergence-register.md`**

Append after the D16 entry:

```markdown
## D17 — Encrypted DNS control (F25)
**Features:** F25
**Why:** In-app DoH control depends on the platform's network stack.

- **Desktop:** full control via `app.configureHostResolver` (Electron 43,
  process-wide, applied after `ready`).
- **Android:** OS-level Private DNS (DoT) exists; per-app DoH control to be
  assessed at port time.
- **iOS:** WKWebView exposes no in-app DoH control; encrypted DNS is an OS concern
  (Settings / configuration profiles). iOS contract: **document and defer to OS**,
  no in-app control.

**Parity contract:** the *encrypted-DNS control* is desktop-only; the *protection*
(encrypted DNS when the user configures it) is available on every platform through
whatever layer that platform provides.

**Status:** Accepted 2026-07-11.

---

## D18 — WebRTC IP-handling control (F26)
**Features:** F26
**Why:** WebRTC IP-policy control depends on the engine.

- **Desktop:** `webContents.setWebRTCIPHandlingPolicy` (standard + disable-direct-UDP).
- **Android:** WebView WebRTC IP-handling support to be assessed at port time.
- **iOS:** WKWebView exposes no WebRTC IP-handling policy; iOS contract downgrades
  to **platform default behavior, documented** (no in-app control).

**Parity contract:** the *control* is desktop-first; where a platform can't express
it, that's a documented capability gap, not a behavioral promise broken.

**Status:** Accepted 2026-07-11.
```

- [ ] **Step 3: Verify the parity dry-run still passes**

```bash
npm run test:acceptance:dry
```
Expected: exits 0 (step definitions resolve; prose-only spec additions don't break scenario binding).

- [ ] **Step 4: Commit**

```bash
git status --short   # expect only the two spec/*.md files
git add spec/features.md spec/divergence-register.md
git commit -m "Add F25/F26 features and D17/D18 divergences for network privacy"
```

---

### Task 7: Security-page sections (site) for both features

**Files:**
- Modify: `site/features/security.html` (add one "On the network" section with two articles; update the page `<meta name="description">` to include the shipped capabilities)

**Interfaces:** none. Deploys *after* the release is cut (Task 8), never before.

- [ ] **Step 1: Add the network section to the security page**

In `site/features/security.html`, insert a new section after the "the sensitive parts" grid and before the `truth-note` aside:

```html
  <section class="feature-copy-grid" aria-labelledby="security-network-title">
    <div><p class="section-kicker">on the network</p><h2 id="security-network-title">Respecting the VPN you already chose.</h2></div>
    <div class="feature-copy-list">
      <article><h3>WebRTC stays in its lane.</h3><p>WebRTC can reveal network addresses that sidestep a proxy. Blanc limits it to your default connection by default, and an optional &ldquo;disable direct UDP&rdquo; mode blocks a specific direct-UDP path around an application proxy. It is not a promise of anonymity — it reduces one well-known proxy-bypass risk.</p></article>
      <article><h3>DNS you can encrypt — or hand to your VPN.</h3><p>Blanc can send DNS lookups over an encrypted connection (DoH) to Cloudflare, Quad9, Mullvad, or a provider you name — or stay out of the way and leave DNS to your system or VPN. Encryption hides your lookups from the network in transit; it does not hide the sites themselves, and it makes the resolver a party you choose to trust. Automatic mode upgrades opportunistically and is not a guarantee.</p></article>
    </div>
  </section>
```

- [ ] **Step 2: Update the page meta description (shipped capabilities only)**

Replace the security page's `<meta name="description">` content to include the now-shipped features:

```html
<meta name="description" content="How Blanc is built for privacy: sandboxed pages, network-level ad and tracker blocking, no extension runtime, encrypted sync, WebRTC leak protection, optional encrypted DNS, and a usage ping you can switch off.">
```

- [ ] **Step 3: Verify the page locally and the honesty rules**

```bash
cd site && python3 -m http.server 8124 &
```
Open `http://localhost:8124/features/security.html`; confirm the new section renders in the page style. Then the hard-rule sweep — no over-claims:

```bash
grep -niE "relay-only|closes?( a| the)?( specific| well-known)? leak|anonymous( browsing)?|hides (the )?sites you visit|guarantees? (encrypt|privacy)" site/features/security.html
```
Expected: no output (the strengthened pattern now catches "closes a … leak" phrasings, not just "closes the leak entirely"). Stop the server when done (`kill %1`).

- [ ] **Step 4: Commit (do NOT deploy yet)**

```bash
git status --short   # expect only site/features/security.html
git add site/features/security.html
git commit -m "Add WebRTC + encrypted-DNS sections to the security page"
```

---

### Task 8: Version bump, full verification, and release (user-gated)

**Files:**
- Modify: `package.json` **and** `package-lock.json` (`version` 0.16.0 → 0.17.0 in both — the lockfile records it at its top level and at `packages[""]`)

**Interfaces:** none. This task cuts a real public release — its final step is gated on explicit user go-ahead, like M1's deploy.

- [ ] **Step 1: Decide the Electron devDependency**

Per CLAUDE.md, releasing is the moment to consider bumping `electron` (it tracks Chromium stable, which can't be swapped out of a running app). Check whether a newer 43.x/stable is available and worth taking. If bumping, do it as its own commit and re-run the full suite (the verified API facts in this plan are for 43.1.0 — re-verify `configureHostResolver`/`setWebRTCIPHandlingPolicy` still match if you move a major version). If not bumping, note that explicitly and proceed. Do not bump silently.

- [ ] **Step 2: Bump the app version (both manifest files)**

Use npm so `package.json` and `package-lock.json` are updated together (a hand-edit of `package.json` alone leaves the lockfile at 0.16.0, and `release.sh` treats both as release-source metadata):

```bash
npm version 0.17.0 --no-git-tag-version
```
Expected: prints `v0.17.0`; `git status --short` now shows both `package.json` and `package-lock.json` modified. Confirm the lockfile changed:

```bash
grep -c '"version": "0.17.0"' package-lock.json   # expect >= 2 (top-level + packages[""])
```

- [ ] **Step 3: Full pre-release verification**

```bash
npm run test:unit
npm run substrate:check
npm run test:acceptance:dry
```
Expected: all three exit 0. If any fails, stop and fix before releasing.

- [ ] **Step 4: Commit the bump**

```bash
git status --short   # expect package.json AND package-lock.json
git add package.json package-lock.json
git commit -m "Release v0.17.0: WebRTC leak protection + encrypted DNS"
```

- [ ] **Step 5: Ask the user for the release go-ahead**

`npm run release` builds, signs, notarizes, publishes a GitHub release, and dispatches the Windows/Linux CI — a public, irreversible, immutable release. Confirm with the user before running it. Do not proceed on silence. If the user defers, still run the tag cleanup in Step 8 and stop.

- [ ] **Step 6: Cut the release (only after go-ahead)**

```bash
npm run release
```
Expected: `scripts/release.sh` runs clean (dirty-tree refusal won't trigger — all work is committed), builds the signed+notarized macOS artifacts, creates the GitHub release, and dispatches `release-windows-linux.yml`. Watch it to completion.

- [ ] **Step 7: Sync and deploy the site (security-page sections + regenerated changelog)**

`release.sh` seds the site version metadata and regenerates the changelog. Commit those, then deploy the site (which now carries the Task 7 security-page sections):

```bash
git status --short
git add site/index.html site/sitemap.xml site/changelog.html site/changelog.xml
git commit -m "Sync site changelog + version metadata for v0.17.0"
npx wrangler pages deploy site --project-name=blancbrowser
```
Verify live (cache-busted): `curl -s "https://blancbrowser.com/features/security?cb=$RANDOM" | grep -c "on the network"` → ≥1.

- [ ] **Step 8: Remove the base tag**

```bash
git tag -d m2m3-base
```

---

## Self-Review Notes

- **Spec coverage:** F26 WebRTC (Tasks 1,3,5,6,7), F25 DoH (Tasks 1,2,4,5,6,7), settings + S5 generator extension (Task 2, all six hardcoded categories per the review's warning), device-local not-synced (Task 2 Step 1 comment + Global Constraints), parity F25/F26 + D17/D18 (Task 6), security-page sections (Task 7), release + version bump (Task 8). D13 is deliberately untouched — it belongs to M4 (shield report), not this release.
- **Electron API (verified against `electron.d.ts`):** `app.configureHostResolver` is process-wide (App method, line 1044), called once after `ready`; `clearHostResolverCache` is per-Session (line 12902) and its promises are collected with `Promise.allSettled`. `enableBuiltInResolver` is deliberately NOT forced (it would break the Off/system-resolver contract on Win/Linux) — its addition is a testing-gated, per-mode decision in Task 4 Step 4.
- **Strict DNS never falls back:** enforced in the settings layer (setSettings reject + getSettings coerce, Task 2 Step 2), so `hostResolverOptionsFor`'s `custom` branch is unconditionally strict-secure — verified by unit test (Task 1) and manual test (Task 5 Step 3).
- **Capability guards:** both new controls are wrapped in `supports(...)` with `.remove()` fallbacks (Task 5 Step 2), matching `homePage`/`appIcon`, so D17/D18's "no iOS controls" holds by construction.
- **Lockfile:** the version bump uses `npm version --no-git-tag-version` and stages `package.json` + `package-lock.json` together (Task 8 Steps 2, 4).
- **Honesty rules** are enforced with a strengthened grep gate (Task 7 Step 3, now catching "closes a … leak") and baked into every label/copy string; "strict" is only an internal enum id, never a user-facing word; the WebRTC claim is "reduces one proxy-bypass risk", never "closes the leak".
- **Type/name consistency:** `webrtcPolicyFor`, `hostResolverOptionsFor`, `isValidDohTemplate`, `applyWebrtcPolicyToAllTabs`, `lastSecureDns`/`lastSecureDnsTemplate`, and the setting keys `webrtcPolicy`/`secureDns`/`secureDnsTemplate` are used identically across Tasks 1–5.
- **Change-detection is DNS-only** (`lastSecureDns`/`lastSecureDnsTemplate`, owned entirely by Task 4) so the listener never reconfigures DNS or clears the resolver cache on unrelated settings writes; WebRTC reapplies unconditionally because the per-tab call is cheap and idempotent. No require-time settings-store access.
