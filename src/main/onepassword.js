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
  return [c.name, c.id, c.autocomplete, c.placeholder, c.ariaLabel, c.labelText]
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

/** Copy that belongs to the FORM, not to any one field (submit-button text,
 * form name/id). Kept out of candBlob deliberately: a single "Log in" button
 * would otherwise make every field in the form look like a username, and a
 * "Confirm" button would disqualify a legitimate current-password field. */
function scopeBlob(scope) {
  for (const c of scope) {
    if (c.formText) return String(c.formText).toLowerCase();
  }
  return '';
}

/** Does this form scope announce a registration flow — via its own fields or
 * its submit-button/form copy? */
function scopeLooksLikeSignup(scope) {
  const re = /sign.?up|register|create.?account|new.?account|registration/;
  return re.test(scopeBlob(scope)) || scope.some((c) => re.test(candBlob(c)));
}

/** Does the form itself announce a sign-in flow? Scope-level positive evidence,
 * so a login form whose inputs are generically named still qualifies. */
function scopeLooksLikeLogin(scope) {
  return /sign.?in|log.?in|login|logon/.test(scopeBlob(scope));
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
  // A scope announcing a registration flow is never a login target, even if a
  // field in it carries a current-password token.
  if (scopeLooksLikeSignup(scopeAll)) return null;

  // 1. Authoritative: the site declared this field holds the existing password.
  //    Two of them in one scope is contradictory (e.g. two form-less login
  //    widgets sharing the null scope) — fail closed rather than pick one.
  const explicit = scopePasswords.filter(isAuthoritativeCurrent);
  if (explicit.length > 1) return null;
  if (explicit.length === 1) return explicit[0];

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
  if (texts.length && !texts.some((c) => loginEvidence(c) !== null) && !scopeLooksLikeLogin(scopeAll)) {
    return null;
  }

  return only;
}

/** Rank a username candidate: 3 = the site said so outright
 * (autocomplete=username), 2 = strong wording, 1 = medium, 0 = none. An
 * explicit annotation must outrank a regex guess — otherwise a field merely
 * *containing* "account" (e.g. accountRecoveryEmail) ties with it and document
 * order decides. */
function usernameRank(c) {
  if (acHas(c, 'username')) return 3;
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
  // How we chose it. `authoritative` means the site itself declared the field
  // holds the existing credential, so it can be filled silently. `heuristic`
  // means we INFERRED it from structure and wording — and that inference rests
  // on English-language signals, so a localized signup page could reach here.
  // The orchestrator must confirm with the user before filling a heuristic
  // target (and before decrypting anything).
  const passwordBasis = pw ? (isAuthoritativeCurrent(pw) ? 'authoritative' : 'heuristic') : null;

  // A page that HAS a password field we refused to fill is a page we've judged
  // unsafe (signup / reset / ambiguous). Don't hand it the username either.
  const refusedPassword = !pw && list.some((c) => c.type === 'password' && c.isVisible);
  if (refusedPassword) return { passwordIndex: null, usernameIndex: null, passwordBasis: null };

  // Username: EVIDENCE FIRST in both branches. An explicit autocomplete=username
  // outranks mere adjacency or focus; focus only breaks ties inside the best
  // evidence tier.
  const inScope = pw
    ? list.filter((c) => isUsernameCandidate(c) && c.formKey === pw.formKey)
    : list.filter(isUsernameCandidate);
  const bestRank = inScope.reduce((m, c) => Math.max(m, usernameRank(c)), 0);
  let usernameIndex = null;

  if (pw && pw.formKey === null) {
    // Form-less password scope: `null` is not a boundary, it is the ABSENCE of
    // one — every form-less input on the page shares it, so any username we
    // picked could belong to an unrelated widget. Fill the password only.
    // (Lifting this needs real container identity from the adapter, not a
    // better tie-break: uniqueness of a candidate says nothing about whether it
    // belongs to the same widget.)
    usernameIndex = null;
  } else if (bestRank > 0) {
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
  }
  // Deliberately NO evidence-free fallback: adjacency alone would type the
  // username into whatever happens to precede the password (a coupon box, an
  // unlabelled search field). When nothing carries login evidence we fill the
  // password only and leave the username to the user.

  return { passwordIndex, usernameIndex, passwordBasis };
}

/** Scope-ownership markers for form-less inputs. TOKEN-aware (`~=`) on purpose:
 * a substring matcher like `[class*=auth]` matches page-wide wrappers
 * (`authenticated-layout`) and unrelated classes (`author-profile`), which
 * would merge every form-less widget on the page into one scope and re-open the
 * cross-widget username leak the null-scope rule exists to prevent. */
const FORMLIKE_OWNER_SELECTOR = [
  '[role=form]', 'fieldset', 'dialog',
  '[class~=login]', '[class~=login-form]', '[class~=loginForm]',
  '[class~=signin]', '[class~=sign-in]', '[class~=signin-form]', '[class~=sign-in-form]',
  '[class~=auth-form]', '[class~=authForm]',
  '[id=login]', '[id=login-form]', '[id=loginForm]',
  '[id=signin]', '[id=sign-in]', '[id=signin-form]',
].join(', ');

/** DOM adapter (runs in the page): every <input> in document order, described
 * as plain data for `selectFields`. */
function collectCandidates(OWNER_SELECTOR) {
  var inputs = document.querySelectorAll('input');
  var ownerKeys = new Map();
  var out = [];
  for (var i = 0; i < inputs.length; i++) {
    var el = inputs[i];
    // Scope identity. A real <form> is authoritative; otherwise the nearest
    // token-matched form-like container. Anything else stays null, and a null
    // password scope fills the password only.
    var owner = el.form || (el.closest ? el.closest(OWNER_SELECTOR) : null);
    var key = null;
    if (owner) {
      if (!ownerKeys.has(owner)) ownerKeys.set(owner, ownerKeys.size);
      key = ownerKeys.get(owner);
    }
    // Visibility: geometry, viewport intersection and clipping (own + ancestor).
    var visible = true;
    if (el.type === 'hidden' || el.offsetParent === null) {
      visible = false;
    } else {
      visible = typeof el.checkVisibility === 'function'
        ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
        : true;
      if (visible) {
        var rc = el.getBoundingClientRect();
        var vw = window.innerWidth || 0;
        var vh = window.innerHeight || 0;
        var onScreen = rc.width > 0 && rc.height > 0
          && rc.right > 0 && rc.bottom > 0 && rc.left < vw && rc.top < vh;
        var clipped = false;
        try {
          var cs = getComputedStyle(el);
          clipped = !!((cs.clipPath && cs.clipPath !== 'none') || (cs.clip && cs.clip !== 'auto'));
        } catch (e) { clipped = false; }
        var anc = el.parentElement;
        var hops = 0;
        while (anc && hops++ < 20 && onScreen && !clipped) {
          var acs = null;
          try { acs = getComputedStyle(anc); } catch (e2) { acs = null; }
          if (acs && (acs.overflow !== 'visible' || (acs.clipPath && acs.clipPath !== 'none'))) {
            var ar = anc.getBoundingClientRect();
            if (ar.width === 0 || ar.height === 0
              || rc.right <= ar.left || rc.left >= ar.right
              || rc.bottom <= ar.top || rc.top >= ar.bottom) { onScreen = false; }
            if (acs.clipPath && acs.clipPath !== 'none') clipped = true;
          }
          anc = anc.parentElement;
        }
        visible = onScreen && !clipped;
      }
    }
    out.push({
      i: i,
      type: String(el.type || '').toLowerCase(),
      autocomplete: String(el.getAttribute('autocomplete') || '').toLowerCase(),
      name: el.name || '',
      id: el.id || '',
      placeholder: el.getAttribute('placeholder') || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      // FIELD-LOCAL copy only. Submit text must never land here: one "Log in"
      // button would promote every field to username evidence, and one
      // "Confirm" would disqualify a legitimate current-password field.
      labelText: (function () {
        var parts = [];
        var labels = el.labels || [];
        for (var li = 0; li < labels.length; li++) parts.push(labels[li].textContent || '');
        var wrap = el.closest ? el.closest('label') : null;
        if (wrap) parts.push(wrap.textContent || '');
        return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 200);
      })(),
      // SCOPE-LEVEL copy, read only by scopeLooksLikeSignup/scopeLooksLikeLogin.
      formText: (function () {
        if (!owner) return '';
        var parts = [
          owner.getAttribute('name') || '',
          owner.getAttribute('id') || '',
          owner.getAttribute('class') || '',
        ];
        var submit = owner.querySelector
          ? owner.querySelector('button[type=submit], input[type=submit], button:not([type])')
          : null;
        if (submit) parts.push(submit.textContent || submit.value || '');
        return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 200);
      })(),
      formKey: key,
      isVisible: visible,
      isFocused: el === document.activeElement,
      inSearchScope: !!(el.closest && el.closest('[role="search"]')),
    });
  }
  return { els: inputs, cands: out };
}

/** Every function the injected sources transitively need. An omission is
 * invisible to a parse check and surfaces in the page as a ReferenceError at
 * fill time, so the runtime VM tests exercise a real login fixture. */
function sharedSelectionSource() {
  return [
    candBlob, acHas, isSearchLike, isNewsletterLike, loginEvidence,
    isUsernameCandidate, isFillablePassword, isAuthoritativeCurrent,
    isNewPasswordish, scopeBlob, scopeLooksLikeSignup, scopeLooksLikeLogin,
    pickPasswordInScope, usernameRank, selectFields, collectCandidates,
  ].map((fn) => fn.toString()).join('\n');
}

/** Credential-FREE inspection source. Reports only what exists and how it was
 * chosen, and leaves an authorization stash the fill pass must match. */
function buildInspectScript({ expectedURL, expectedTimeOrigin, nonce }) {
  if (typeof nonce !== 'string' || !nonce) throw new Error('buildInspectScript requires a nonce');
  const U = JSON.stringify(expectedURL);
  const TO = JSON.stringify(expectedTimeOrigin);
  const N = JSON.stringify(nonce);
  const SEL = JSON.stringify(FORMLIKE_OWNER_SELECTOR);
  return `(function () {
    if (location.href !== ${U} || !document.hasFocus() || performance.timeOrigin !== ${TO}) {
      return { originMismatch: true };
    }
    ${sharedSelectionSource()}
    var collected = collectCandidates(${SEL});
    var picked = selectFields(collected.cands);
    globalThis.__blancFill = {
      nonce: ${N},
      pwEl: picked.passwordIndex !== null ? collected.els[picked.passwordIndex] : null,
      userEl: picked.usernameIndex !== null ? collected.els[picked.usernameIndex] : null,
      basis: picked.passwordBasis,
    };
    return {
      originMismatch: false,
      hasPassword: picked.passwordIndex !== null,
      hasUsername: picked.usernameIndex !== null,
      passwordBasis: picked.passwordBasis,
    };
  })();`;
}

/** Credential-bearing fill source, injected into a DEDICATED ISOLATED WORLD.
 * Only the credentials passed in are embedded — a null value is never written.
 * Before writing it verifies the authorization stash left by the inspect pass
 * (matching nonce, identical live element references, unchanged basis), so the
 * consent that was given — or the silent-fill decision that was made — is bound
 * to those exact elements rather than to whatever `selectFields` resolves to a
 * moment later. Selection and setting happen synchronously in one execution, so
 * page JS gets no window between them. Resolves to a STATUS OBJECT ONLY. */
function buildFillScript({ expectedURL, expectedTimeOrigin, username, password, nonce }) {
  if (typeof nonce !== 'string' || !nonce) throw new Error('buildFillScript requires a nonce');
  const U = JSON.stringify(expectedURL);
  const TO = JSON.stringify(expectedTimeOrigin);
  const USER = JSON.stringify(username ?? null);
  const PASS = JSON.stringify(password ?? null);
  const N = JSON.stringify(nonce);
  const SEL = JSON.stringify(FORMLIKE_OWNER_SELECTOR);
  return `(function () {
    if (location.href !== ${U} || !document.hasFocus() || performance.timeOrigin !== ${TO}) {
      return { originMismatch: true, filledUser: false, filledPass: false };
    }
    var USER = ${USER};
    var PASS = ${PASS};
    // Consume the authorization FIRST: every attempt spends it, including a
    // rejected one, so a wrong-nonce probe cannot be followed by a valid replay.
    var auth = globalThis.__blancFill;
    globalThis.__blancFill = null;
    if (!auth || auth.nonce !== ${N}) {
      return { selectionChanged: true, filledUser: false, filledPass: false };
    }
    ${sharedSelectionSource()}
    // Assignment and notification are SEPARATE phases. Dispatching after each
    // write would let the first field's handler run page code before the second
    // is written — long enough to disconnect or swap the authorized node, so the
    // second credential lands somewhere never verified.
    var setValue = function (el, value) {
      var d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      d.set.call(el, value);
    };
    var notify = function (el) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    var collected = collectCandidates(${SEL});
    var picked = selectFields(collected.cands);
    var pwEl = picked.passwordIndex !== null ? collected.els[picked.passwordIndex] : null;
    var userEl = picked.usernameIndex !== null ? collected.els[picked.usernameIndex] : null;
    if (picked.passwordBasis !== auth.basis
        || pwEl !== auth.pwEl || userEl !== auth.userEl
        || (pwEl && !pwEl.isConnected) || (userEl && !userEl.isConnected)) {
      globalThis.__blancFill = null;
      return { selectionChanged: true, filledUser: false, filledPass: false };
    }
    globalThis.__blancFill = null; // single use
    var filledPass = false, filledUser = false;
    // Phase 1 — write every authorized value. No page code runs in between.
    if (pwEl && PASS !== null) { setValue(pwEl, PASS); filledPass = true; }
    if (userEl && USER !== null) { setValue(userEl, USER); filledUser = true; }
    // Phase 2 — notify. Frameworks still observe the native setter plus these
    // bubbling events, so controlled inputs keep the value.
    if (filledPass) notify(pwEl);
    if (filledUser) notify(userEl);
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

module.exports = { matchesHost, selectFields, FORMLIKE_OWNER_SELECTOR, buildInspectScript, buildFillScript, getClient, findLogins, revealCredential, probePackageLoad };
