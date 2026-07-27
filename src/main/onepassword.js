const { getDomain } = require('tldts-experimental');

// SPIKE (1Password fill feasibility) — throwaway; MUST be removed before any
// release (plan Task 6 — env-gating alone is not release-safety). This module
// owns the 1Password SDK client and ALL credential handling. `@1password/sdk`
// is require()d lazily so a normal packaged startup never loads it.

/** Extract a comparable hostname from a possibly scheme-less / malformed
 * stored 1Password website value. `www.`-stripped. Returns null on garbage
 * (caller skips it — never throws). */
function normalizeHost(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  let host;
  try {
    host = new URL(withScheme).hostname;
  } catch {
    return null; // still malformed after prepending a scheme
  }
  if (!host) return null;
  return host.replace(/^www\./i, '').toLowerCase();
}

/** Reduce a normalized host to its registrable domain (eTLD+1) for matching.
 * `allowPrivateDomains: true` is REQUIRED: without it `user.github.io` collapses
 * to `github.io`, so two tenants would cross-match and a single wrong match
 * fills silently. Falls back to the exact host when there is no public suffix
 * at all (localhost, raw IPs, single-label intranet names). */
function registrableKey(host) {
  return getDomain(host, { allowPrivateDomains: true }) || host;
}

/** True iff any of a Login item's stored website URLs shares a registrable
 * domain with `host` — so an item saved for `google.com` matches
 * `accounts.google.com`, while `github.com.evil.com` (registrable domain
 * `evil.com`) still cannot match `github.com`. */
function matchesHost(itemUrls, host) {
  const targetHost = normalizeHost(host);
  if (!targetHost || !Array.isArray(itemUrls)) return false;
  const targetKey = registrableKey(targetHost);
  return itemUrls.some((u) => {
    const h = normalizeHost(u);
    return h != null && registrableKey(h) === targetKey;
  });
}

/* ---------------------------------------------------------------------------
 * Field selection. These helpers are embedded into the injected script(s) via
 * Function.prototype.toString(), so they must stay self-contained (no module
 * closures) — and so the code under test is literally the code that runs in
 * the page. `selectFields` is pure and unit-tested.
 * ------------------------------------------------------------------------- */

/** Lowercased blob of every identifying attribute, for signal matching.
 * String()-coerced: page attributes reach us as data and must never throw. */
function candBlob(c) {
  return [c.name, c.id, c.autocomplete, c.placeholder, c.ariaLabel]
    .filter(Boolean)
    .map(String)
    .join(' ')
    .toLowerCase();
}

/** `autocomplete` is a SPACE-SEPARATED token list per the HTML spec
 * (e.g. "section-login current-password webauthn"), so membership must be
 * tested by token, never by whole-string equality. */
function acHas(c, token) {
  return String(c.autocomplete || '').toLowerCase().split(/\s+/).indexOf(token) !== -1;
}

/** Search boxes must never receive a username. Substring (not word-boundary)
 * matching so camelCase ids like `siteSearch`/`queryInput` are caught. */
function isSearchLike(c) {
  if (c.type === 'search' || c.inSearchScope) return true;
  const blob = candBlob(c);
  if (/search|query|lookup|filter/.test(blob)) return true;
  const n = String(c.name || '').toLowerCase();
  const id = String(c.id || '').toLowerCase();
  return n === 'q' || n === 's' || id === 'q' || id === 's';
}

/** Newsletter/marketing signup fields are not login fields. */
function isNewsletterLike(c) {
  const blob = candBlob(c);
  return blob.includes('newsletter') || blob.includes('subscribe')
    || blob.includes('marketing') || blob.includes('promo');
}

/** 'strong' | 'medium' | null — how confident we are this is a LOGIN field. */
function loginEvidence(c) {
  const blob = candBlob(c);
  if (acHas(c, 'username')) return 'strong';
  if (/user(name)?|login|account|identifier|loginfmt/.test(blob)) return 'strong';
  if (c.type === 'email' || acHas(c, 'email') || blob.includes('email')) return 'medium';
  return null;
}

/** A fillable username candidate: visible text-ish input, not a search or
 * newsletter field. */
function isUsernameCandidate(c) {
  if (!c.isVisible) return false;
  if (c.type !== 'text' && c.type !== 'email' && c.type !== 'tel') return false;
  return !isSearchLike(c) && !isNewsletterLike(c);
}

/** A password field we may write the SAVED password into. Excludes
 * `autocomplete="new-password"`: that marks a signup or change-password field,
 * and writing the existing credential there would leak it into a form meant for
 * a new value. (The HTML autofill spec distinguishes current- vs new-password.) */
function isFillablePassword(c) {
  return c.type === 'password' && c.isVisible && !acHas(c, 'new-password');
}

/** The site telling us outright that this holds the EXISTING credential. A
 * field carrying both tokens is contradictory and is never treated as
 * authoritative — nor is one whose own label says "Confirm"/"New", where the
 * token contradicts the visible wording (a stray token must not license a
 * signup field). */
function isAuthoritativeCurrent(c) {
  return c.type === 'password' && c.isVisible
    && acHas(c, 'current-password') && !acHas(c, 'new-password')
    && !isNewPasswordish(c);
}

/** Wording that marks a password box as a place to invent a NEW secret. A
 * single-password signup form is structurally identical to a login form, so
 * this text signal is the only thing separating them when the site omits
 * autocomplete annotations (verified: adversarial audit round 2). */
function isNewPasswordish(c) {
  return /new|create|choose|confirm|repeat|re-?enter|retype|verify|register|sign.?up/
    .test(candBlob(c));
}

/** Does anything in this form scope announce a registration flow? */
function scopeLooksLikeSignup(scope) {
  return scope.some((c) => /sign.?up|register|create.?account|new.?account|registration/
    .test(candBlob(c)));
}

/** Pick the login password inside ONE form scope, or null.
 *
 * The structural invariant that separates a login form from a signup / change /
 * reset form: a login form has exactly ONE visible password field, while those
 * others carry two or more (new + confirm, or current + new + confirm). Counting
 * ALL visible password fields — not just the fillable ones — is what makes this
 * hold: an annotated signup form's `new-password` + unannotated confirm would
 * otherwise leave the confirm field alone in the fillable pool and receive the
 * saved credential (verified: adversarial audit, 2026-07).
 *
 * An explicit `current-password` token overrides the count, since that is the
 * site telling us exactly where the existing credential belongs. */
function pickPasswordInScope(scopePasswords, scopeAll) {
  // 1. Authoritative: the site declared this field holds the existing password.
  const explicit = scopePasswords.find(isAuthoritativeCurrent);
  if (explicit) return explicit;

  // 2. Heuristic. Structure first: 2+ visible password fields means signup /
  //    change / reset, never a login form.
  if (scopePasswords.length !== 1) return null;
  const only = scopePasswords[0];
  if (!isFillablePassword(only)) return null;

  // 3. Negative evidence: "Create a password" / "Confirm" / "Sign up" wording
  //    on the field or anywhere in its form means this is not a login.
  if (isNewPasswordish(only) || scopeLooksLikeSignup(scopeAll)) return null;

  // 4. Positive evidence: a login-ish companion field. A bare password step
  //    (no text inputs at all, e.g. Google's second screen) is allowed; a form
  //    whose only text fields look unrelated (a profile form) is not.
  const texts = scopeAll.filter(isUsernameCandidate);
  if (texts.length && !texts.some((c) => loginEvidence(c) !== null)) return null;

  return only;
}

/** Rank a username candidate: 2 = strong login evidence, 1 = medium, 0 = none. */
function usernameRank(c) {
  const ev = loginEvidence(c);
  return ev === 'strong' ? 2 : ev === 'medium' ? 1 : 0;
}

/** Choose which fields to fill. Pure: takes descriptors, returns indices.
 * Never guesses — an ambiguous page yields nulls rather than a wrong fill. */
function selectFields(cands) {
  const list = (Array.isArray(cands) ? cands : []).filter((c) => c && typeof c.i === 'number');

  // Password: evaluate each FORM SCOPE independently, so a signup form earlier
  // in the document can't pre-empt the real login form below it.
  const scopeKeys = [];
  for (const c of list) {
    if (c.type === 'password' && c.isVisible && scopeKeys.indexOf(c.formKey) === -1) {
      scopeKeys.push(c.formKey);
    }
  }
  const targets = [];
  for (const key of scopeKeys) {
    const scopeAll = list.filter((c) => c.formKey === key);
    const scopePasswords = scopeAll.filter((c) => c.type === 'password' && c.isVisible);
    const picked = pickPasswordInScope(scopePasswords, scopeAll);
    if (picked) targets.push(picked);
  }
  // More than one plausible login form: an authoritative current-password scope
  // outranks focus, and only a VISIBLE focused element may act as a tie-break —
  // a 0x0 offscreen input must not steer where the credential goes.
  let pw = null;
  if (targets.length === 1) {
    pw = targets[0];
  } else if (targets.length > 1) {
    const authoritative = targets.filter(isAuthoritativeCurrent);
    if (authoritative.length === 1) {
      pw = authoritative[0];
    } else {
      const pool = authoritative.length ? authoritative : targets;
      pw = pool.find((t) => list.some((c) => c.isFocused && c.isVisible && c.formKey === t.formKey)) || null;
    }
  }
  const passwordIndex = pw ? pw.i : null;

  // A page that HAS a password field we refused to fill is a page we've judged
  // unsafe (signup / reset / ambiguous). Don't hand it the username either.
  const refusedPassword = !pw && list.some((c) => c.type === 'password' && c.isVisible);
  if (refusedPassword) return { passwordIndex: null, usernameIndex: null };

  // Username: EVIDENCE FIRST in both branches. An explicit autocomplete=username
  // outranks mere adjacency or focus; focus only breaks ties inside the best
  // evidence tier.
  const inScope = pw
    ? list.filter((c) => isUsernameCandidate(c) && c.formKey === pw.formKey)
    : list.filter(isUsernameCandidate);
  const bestRank = inScope.reduce((m, c) => Math.max(m, usernameRank(c)), 0);
  let usernameIndex = null;

  if (bestRank > 0) {
    const pool = inScope.filter((c) => usernameRank(c) === bestRank);
    if (pool.length === 1) {
      usernameIndex = pool[0].i;
    } else {
      const focused = pool.find((c) => c.isFocused);
      if (focused) usernameIndex = focused.i;
      else if (pw) {
        // Same-tier tie inside a login form: the field just above the password.
        const preceding = pool.filter((c) => c.i < pw.i);
        usernameIndex = preceding.length ? preceding[preceding.length - 1].i : null;
      }
    }
  } else if (pw && pw.formKey !== null) {
    // No labelled candidate anywhere. Fall back to plain adjacency, but ONLY
    // inside a real <form> — on a form-less page every input shares the null
    // scope, and proximity there means nothing.
    const preceding = inScope.filter((c) => c.i < pw.i);
    usernameIndex = preceding.length ? preceding[preceding.length - 1].i : null;
  }

  return { passwordIndex, usernameIndex };
}

/** Build the IIFE source injected via executeJavaScript(source). All four
 * inputs are embedded with JSON.stringify (credential strings included), and
 * the IIFE resolves to a STATUS OBJECT ONLY — never the credential values.
 * Its first act is the synchronous identity guard (see the spec's TOCTOU
 * discussion): a new document changes performance.timeOrigin; an SPA
 * pushState route change keeps timeOrigin but changes location.href. */
function buildFillScript({ expectedURL, expectedTimeOrigin, username, password }) {
  const U = JSON.stringify(expectedURL);
  const TO = JSON.stringify(expectedTimeOrigin);
  const USER = JSON.stringify(username ?? null);
  const PASS = JSON.stringify(password ?? null);
  return `(function () {
    if (location.href !== ${U} || !document.hasFocus() || performance.timeOrigin !== ${TO}) {
      return { originMismatch: true, filledUser: false, filledPass: false };
    }
    var isVisible = function (el) {
      if (!el || el.type === 'hidden' || el.offsetParent === null) return false;
      var r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    var setNative = function (el, value) {
      var d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      d.set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    var pw = null;
    var pwlist = document.querySelectorAll('input[type=password]');
    for (var i = 0; i < pwlist.length; i++) { if (isVisible(pwlist[i])) { pw = pwlist[i]; break; } }
    if (!pw) return { originMismatch: false, filledUser: false, filledPass: false, noPasswordField: true };
    var filledPass = false, filledUser = false;
    if (${PASS} !== null) { setNative(pw, ${PASS}); filledPass = true; }
    var isText = function (el) { return el && el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'email'); };
    var user = null;
    var active = document.activeElement;
    if (isText(active) && isVisible(active)) {
      user = active;
    } else {
      var scope = pw.form || document;
      var texts = scope.querySelectorAll('input[type=text], input[type=email]');
      for (var j = 0; j < texts.length; j++) {
        if (!isVisible(texts[j])) continue;
        if (pw.compareDocumentPosition(texts[j]) & Node.DOCUMENT_POSITION_PRECEDING) user = texts[j];
      }
    }
    if (user && ${USER} !== null) { setNative(user, ${USER}); filledUser = true; }
    return { originMismatch: false, filledUser: filledUser, filledPass: filledPass };
  })();`;
}

const { app } = require('electron');

let cachedClient = null;

/** Lazily construct + cache the SDK client via the native desktop-app bridge
 * (DesktopAuth → SharedLibCore → dlopen of 1Password's libop_sdk_ipc_client).
 * BLANC_1P_ACCOUNT is required and never committed. The cache is discarded
 * only on an unrecoverable failure — the SDK re-authorizes an ordinary
 * ~10-min session expiry itself. */
async function getClient() {
  if (cachedClient) return cachedClient;
  const account = process.env.BLANC_1P_ACCOUNT;
  if (!account) throw new Error('BLANC_1P_ACCOUNT is not set');
  const { createClient, DesktopAuth } = require('@1password/sdk'); // lazy — never at module scope
  cachedClient = await createClient({
    auth: new DesktopAuth(account),
    integrationName: 'Blanc',
    integrationVersion: app.getVersion(),
  });
  return cachedClient;
}

/** Match Login items against `expectedHost` on OVERVIEWS only — no secret is
 * decrypted here. Skips a vault that can't be listed (logged by caller). */
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
      if (matchesHost(urls, expectedHost)) {
        matches.push({ vaultId: vault.id, itemId: ov.id, title: ov.title });
      }
    }
  }
  return matches;
}

/** Decrypt exactly the one chosen item and read its BUILT-IN username +
 * password fields (by id — no "first Concealed field" fallback, which could
 * return a custom PIN/recovery secret). A missing built-in field returns null
 * (a defined outcome), never a guess. */
async function revealCredential(vaultId, itemId) {
  const client = await getClient();
  const item = await client.items.get(vaultId, itemId);
  const fields = Array.isArray(item.fields) ? item.fields : [];
  const read = (id) => {
    const f = fields.find((x) => x.id === id);
    return f && typeof f.value === 'string' ? f.value : null;
  };
  return { username: read('username'), password: read('password') };
}

/** Criterion 3(a) probe: force-load the SDK package — module resolution +
 * @1password/sdk-core's eager core_bg.wasm compile — WITHOUT authenticating.
 * Throws if the package can't load. Lives here (not in main.js) so the
 * `require('@1password/sdk')` stays confined to this module, alongside
 * getClient — preserving the lazy-require boundary. Never authenticates, so it
 * does not dlopen the native 1Password bridge (that's getClient/criterion 3b). */
function probePackageLoad() {
  require('@1password/sdk'); // lazy — the only other place this is required
}

module.exports = { matchesHost, selectFields, buildFillScript, getClient, findLogins, revealCredential, probePackageLoad };
