'use strict';

// Pure policy for the 1Password integration. No Electron and no SDK import:
// matching and DOM targeting remain directly unit-testable, while the SDK and
// its account-wide authorization live only in onepassword-broker.js.

const PICKER_MAX = 10;
const FILL_WORLD_ID = 1001;
const AUTOFILL = Object.freeze({
  ANYWHERE: 'AnywhereOnWebsite',
  EXACT: 'ExactDomain',
  NEVER: 'Never',
});

function parseWebUrl(value, { defaultProtocol = 'https:' } = {}) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const input = value.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input)
    ? input
    : `${defaultProtocol}//${input}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
}

function effectivePort(url) {
  if (url.port) return url.port;
  return url.protocol === 'https:' ? '443' : '80';
}

/** Apply 1Password's per-website autofill behavior without broad
 * registrable-domain guessing. AnywhereOnWebsite is one-way: an item saved
 * for example.com may cover login.example.com, while an item saved for one
 * tenant/subdomain never covers its parent or a sibling. ExactDomain also
 * requires the effective port, as documented by 1Password. */
function websiteMatch(website, pageValue) {
  const page = parseWebUrl(pageValue);
  const behavior = website?.autofillBehavior;
  if (!page || behavior === AUTOFILL.NEVER) return null;
  const stored = parseWebUrl(website?.url, { defaultProtocol: page.protocol });
  if (!stored) return null;
  const pageHost = page.hostname.toLowerCase();
  const storedHost = stored.hostname.toLowerCase();

  if (behavior === AUTOFILL.EXACT) {
    return pageHost === storedHost && effectivePort(page) === effectivePort(stored)
      ? { tier: 0, host: stored.host.toLowerCase(), behavior }
      : null;
  }
  if (behavior !== AUTOFILL.ANYWHERE) return null; // unknown future enum: fail closed
  if (pageHost === storedHost) {
    return { tier: 1, host: stored.host.toLowerCase(), behavior };
  }
  if (pageHost.endsWith(`.${storedHost}`)) {
    return { tier: 2, host: stored.host.toLowerCase(), behavior };
  }
  return null;
}

function candidateMatch(websites, pageUrl) {
  let best = null;
  for (const website of Array.isArray(websites) ? websites : []) {
    const match = websiteMatch(website, pageUrl);
    if (!match) continue;
    if (!best || match.tier < best.tier ||
        (match.tier === best.tier && match.host < best.host)) best = match;
  }
  return best;
}

function asTimestamp(value) {
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Deterministic, bounded ranking. Exact-domain entries lead, then entries
 * stored for the current hostname, then parent-site entries. We keep every
 * valid tier so multiple legitimate accounts remain selectable. */
function rankMatches(candidates, pageUrl) {
  const ranked = [];
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const match = candidateMatch(candidate.websites, pageUrl);
    if (!match) continue;
    ranked.push({ ...candidate, tier: match.tier, host: match.host });
  }
  ranked.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const updated = asTimestamp(b.updatedAt) - asTimestamp(a.updatedAt);
    if (updated) return updated;
    const title = String(a.title).localeCompare(String(b.title));
    if (title) return title;
    const vault = String(a.vaultName).localeCompare(String(b.vaultName));
    if (vault) return vault;
    return `${a.vaultId}:${a.itemId}`.localeCompare(`${b.vaultId}:${b.itemId}`);
  });
  return {
    kept: ranked.slice(0, PICKER_MAX),
    truncated: Math.max(0, ranked.length - PICKER_MAX),
  };
}

function isValidPickIndex(index, length) {
  return index === null || (Number.isInteger(index) && index >= 0 && index < length);
}

/* Field selection. These functions are stringified into the isolated-world
 * inspect/fill programs, so each stays self-contained and uses no closure. */
function candBlob(candidate) {
  return [candidate.name, candidate.id, candidate.autocomplete, candidate.placeholder,
    candidate.ariaLabel, candidate.labelText]
    .filter(Boolean).map(String).join(' ').toLowerCase();
}

function acHas(candidate, token) {
  return String(candidate.autocomplete || '').toLowerCase().split(/\s+/).includes(token);
}

function isSearchLike(candidate) {
  if (candidate.type === 'search' || candidate.inSearchScope) return true;
  if (/search|query|lookup|filter/.test(candBlob(candidate))) return true;
  const name = String(candidate.name || '').toLowerCase();
  const id = String(candidate.id || '').toLowerCase();
  return name === 'q' || name === 's' || id === 'q' || id === 's';
}

function isNewsletterLike(candidate) {
  return /newsletter|subscribe|marketing|promo/.test(candBlob(candidate));
}

function loginEvidence(candidate) {
  const blob = candBlob(candidate);
  if (acHas(candidate, 'username')) return 'strong';
  if (/user(name)?|login|account|identifier|loginfmt/.test(blob)) return 'strong';
  if (candidate.type === 'email' || acHas(candidate, 'email') || blob.includes('email')) {
    return 'medium';
  }
  return null;
}

function isUsernameCandidate(candidate) {
  return candidate.isVisible && ['text', 'email', 'tel'].includes(candidate.type)
    && !isSearchLike(candidate) && !isNewsletterLike(candidate);
}

function isNewPasswordish(candidate) {
  return /new|create|choose|confirm|repeat|re-?enter|retype|verify|register|sign.?up/
    .test(candBlob(candidate));
}

function isFillablePassword(candidate) {
  return candidate.type === 'password' && candidate.isVisible
    && !acHas(candidate, 'new-password');
}

function isAuthoritativeCurrent(candidate) {
  return candidate.type === 'password' && candidate.isVisible
    && acHas(candidate, 'current-password') && !acHas(candidate, 'new-password')
    && !isNewPasswordish(candidate);
}

function scopeBlob(scope) {
  for (const candidate of scope) {
    if (candidate.formText) return String(candidate.formText).toLowerCase();
  }
  return '';
}

function scopeLooksLikeSignup(scope) {
  const pattern = /sign.?up|register|create.?account|new.?account|registration/;
  return pattern.test(scopeBlob(scope)) || scope.some((candidate) => pattern.test(candBlob(candidate)));
}

function scopeLooksLikeLogin(scope) {
  return /sign.?in|log.?in|login|logon/.test(scopeBlob(scope));
}

function pickPasswordInScope(scopePasswords, scopeAll) {
  if (scopeLooksLikeSignup(scopeAll)) return null;
  const explicit = scopePasswords.filter(isAuthoritativeCurrent);
  if (explicit.length !== 1) {
    if (explicit.length > 1) return null;
  } else {
    return explicit[0];
  }
  if (scopePasswords.length !== 1) return null;
  const only = scopePasswords[0];
  if (!isFillablePassword(only) || isNewPasswordish(only)) return null;
  const textFields = scopeAll.filter(isUsernameCandidate);
  if (textFields.length && !textFields.some((candidate) => loginEvidence(candidate))
      && !scopeLooksLikeLogin(scopeAll)) return null;
  return only;
}

function usernameRank(candidate) {
  if (acHas(candidate, 'username')) return 3;
  const evidence = loginEvidence(candidate);
  return evidence === 'strong' ? 2 : evidence === 'medium' ? 1 : 0;
}

function selectFields(candidates) {
  const list = (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => candidate && typeof candidate.i === 'number');
  const scopeKeys = [];
  for (const candidate of list) {
    if (candidate.type === 'password' && candidate.isVisible
        && !scopeKeys.includes(candidate.formKey)) scopeKeys.push(candidate.formKey);
  }
  const targets = [];
  for (const key of scopeKeys) {
    const scopeAll = list.filter((candidate) => candidate.formKey === key);
    const scopePasswords = scopeAll.filter(
      (candidate) => candidate.type === 'password' && candidate.isVisible
    );
    const picked = pickPasswordInScope(scopePasswords, scopeAll);
    if (picked) targets.push(picked);
  }

  let password = null;
  if (targets.length === 1) {
    password = targets[0];
  } else if (targets.length > 1) {
    const authoritative = targets.filter(isAuthoritativeCurrent);
    if (authoritative.length === 1) password = authoritative[0];
    else {
      const pool = authoritative.length ? authoritative : targets;
      password = pool.find((target) => list.some(
        (candidate) => candidate.isFocused && candidate.isVisible
          && candidate.formKey === target.formKey
      )) || null;
    }
  }

  const passwordIndex = password ? password.i : null;
  const passwordBasis = password
    ? (isAuthoritativeCurrent(password) ? 'authoritative' : 'heuristic')
    : null;
  if (!password && list.some(
    (candidate) => candidate.type === 'password' && candidate.isVisible
  )) {
    return { passwordIndex: null, usernameIndex: null, passwordBasis: null };
  }

  const inScope = password
    ? list.filter((candidate) => isUsernameCandidate(candidate)
      && candidate.formKey === password.formKey)
    : list.filter(isUsernameCandidate);
  const bestRank = inScope.reduce(
    (maximum, candidate) => Math.max(maximum, usernameRank(candidate)), 0
  );
  let usernameIndex = null;
  if (password && password.formKey === null) {
    usernameIndex = null; // no safe ownership boundary for form-less widgets
  } else if (bestRank > 0) {
    const pool = inScope.filter((candidate) => usernameRank(candidate) === bestRank);
    if (pool.length === 1) usernameIndex = pool[0].i;
    else {
      const focused = pool.find((candidate) => candidate.isFocused);
      if (focused) usernameIndex = focused.i;
      else if (password) {
        const preceding = pool.filter((candidate) => candidate.i < password.i);
        if (preceding.length) usernameIndex = preceding[preceding.length - 1].i;
      }
    }
  }
  return { passwordIndex, usernameIndex, passwordBasis };
}

const FORMLIKE_OWNER_SELECTOR = [
  '[role=form]', 'fieldset', 'dialog',
  '[class~=login]', '[class~=login-form]', '[class~=loginForm]',
  '[class~=signin]', '[class~=sign-in]', '[class~=signin-form]', '[class~=sign-in-form]',
  '[class~=auth-form]', '[class~=authForm]',
  '[id=login]', '[id=login-form]', '[id=loginForm]',
  '[id=signin]', '[id=sign-in]', '[id=signin-form]',
].join(', ');

function collectCandidates(ownerSelector) {
  var inputs = document.querySelectorAll('input');
  var ownerKeys = new Map();
  var output = [];
  for (var index = 0; index < inputs.length; index++) {
    var element = inputs[index];
    var owner = element.form || (element.closest ? element.closest(ownerSelector) : null);
    var key = null;
    if (owner) {
      if (!ownerKeys.has(owner)) ownerKeys.set(owner, ownerKeys.size);
      key = ownerKeys.get(owner);
    }
    var visible = true;
    if (element.type === 'hidden' || element.offsetParent === null) {
      visible = false;
    } else {
      visible = typeof element.checkVisibility === 'function'
        ? element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
        : true;
      if (visible) {
        var rect = element.getBoundingClientRect();
        var viewportWidth = window.innerWidth || 0;
        var viewportHeight = window.innerHeight || 0;
        var onScreen = rect.width > 0 && rect.height > 0 && rect.right > 0
          && rect.bottom > 0 && rect.left < viewportWidth && rect.top < viewportHeight;
        var clipped = false;
        try {
          var computed = getComputedStyle(element);
          clipped = !!((computed.clipPath && computed.clipPath !== 'none')
            || (computed.clip && computed.clip !== 'auto'));
        } catch (error) { clipped = false; }
        var ancestor = element.parentElement;
        var hops = 0;
        while (ancestor && hops++ < 20 && onScreen && !clipped) {
          var ancestorStyle = null;
          try { ancestorStyle = getComputedStyle(ancestor); } catch (error) { ancestorStyle = null; }
          if (ancestorStyle && (ancestorStyle.overflow !== 'visible'
              || (ancestorStyle.clipPath && ancestorStyle.clipPath !== 'none'))) {
            var ancestorRect = ancestor.getBoundingClientRect();
            if (ancestorRect.width === 0 || ancestorRect.height === 0
                || rect.right <= ancestorRect.left || rect.left >= ancestorRect.right
                || rect.bottom <= ancestorRect.top || rect.top >= ancestorRect.bottom) onScreen = false;
            if (ancestorStyle.clipPath && ancestorStyle.clipPath !== 'none') clipped = true;
          }
          ancestor = ancestor.parentElement;
        }
        visible = onScreen && !clipped;
      }
    }
    output.push({
      i: index,
      type: String(element.type || '').toLowerCase(),
      autocomplete: String(element.getAttribute('autocomplete') || '').toLowerCase(),
      name: element.name || '',
      id: element.id || '',
      placeholder: element.getAttribute('placeholder') || '',
      ariaLabel: element.getAttribute('aria-label') || '',
      labelText: (function () {
        var parts = [];
        var labels = element.labels || [];
        for (var labelIndex = 0; labelIndex < labels.length; labelIndex++) {
          parts.push(labels[labelIndex].textContent || '');
        }
        var wrapper = element.closest ? element.closest('label') : null;
        if (wrapper) parts.push(wrapper.textContent || '');
        return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 200);
      })(),
      formText: (function () {
        if (!owner) return '';
        var parts = [owner.getAttribute('name') || '', owner.getAttribute('id') || '',
          owner.getAttribute('class') || ''];
        var submit = owner.querySelector
          ? owner.querySelector('button[type=submit], input[type=submit], button:not([type])')
          : null;
        if (submit) parts.push(submit.textContent || submit.value || '');
        return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 200);
      })(),
      formKey: key,
      isVisible: visible,
      isFocused: element === document.activeElement,
      inSearchScope: !!(element.closest && element.closest('[role="search"]')),
    });
  }
  return { elements: inputs, candidates: output };
}

function sharedSelectionSource() {
  return [
    candBlob, acHas, isSearchLike, isNewsletterLike, loginEvidence,
    isUsernameCandidate, isNewPasswordish, isFillablePassword,
    isAuthoritativeCurrent, scopeBlob, scopeLooksLikeSignup,
    scopeLooksLikeLogin, pickPasswordInScope, usernameRank, selectFields,
    collectCandidates,
  ].map((fn) => fn.toString()).join('\n');
}

function buildProbeScript() {
  return `(function () {
    return {
      url: location.href,
      timeOrigin: performance.timeOrigin,
      focused: document.hasFocus(),
    };
  })();`;
}

function buildInspectScript({ expectedURL, expectedTimeOrigin, nonce }) {
  if (typeof nonce !== 'string' || !nonce) throw new Error('nonce required');
  const url = JSON.stringify(expectedURL);
  const timeOrigin = JSON.stringify(expectedTimeOrigin);
  const nonceValue = JSON.stringify(nonce);
  const selector = JSON.stringify(FORMLIKE_OWNER_SELECTOR);
  return `(function () {
    if (location.href !== ${url} || !document.hasFocus()
        || performance.timeOrigin !== ${timeOrigin}) return { originMismatch: true };
    ${sharedSelectionSource()}
    var collected = collectCandidates(${selector});
    var picked = selectFields(collected.candidates);
    globalThis.__blancOnePasswordFill = {
      nonce: ${nonceValue},
      passwordElement: picked.passwordIndex !== null
        ? collected.elements[picked.passwordIndex] : null,
      usernameElement: picked.usernameIndex !== null
        ? collected.elements[picked.usernameIndex] : null,
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

/** Live pre-popup geometry: the ONLY rectangle channel for the picker
 * anchor. Reads the inspect-authorized element's current viewport rect
 * under the same URL/timeOrigin/nonce validation as the fill, WITHOUT
 * consuming the stash (the fill still needs it after the menu). Geometry
 * only — never values. */
function buildFieldRectScript({ expectedURL, expectedTimeOrigin, nonce }) {
  if (typeof nonce !== 'string' || !nonce) throw new Error('nonce required');
  const url = JSON.stringify(expectedURL);
  const timeOrigin = JSON.stringify(expectedTimeOrigin);
  const nonceValue = JSON.stringify(nonce);
  return `(function () {
    var authorization = globalThis.__blancOnePasswordFill;
    if (location.href !== ${url}
        || performance.timeOrigin !== ${timeOrigin}
        || !authorization || authorization.nonce !== ${nonceValue}) return { ok: false };
    var element = authorization.passwordElement || authorization.usernameElement;
    if (!element || !element.isConnected) return { ok: false };
    var rect = element.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return { ok: false };
    return { ok: true, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
  })();`;
}

/** CSS-pixel field rect → window-coordinate anchor at the field's bottom
 * edge, honoring the view's actual origin (vertical tabs' x offset, Glance's
 * primary rect) and the tab's page zoom, clamped into the view so a
 * scrolled-out or oversized rect still anchors over the page area. */
function pickerAnchorPoint({ rect, viewBounds, zoomFactor }) {
  const zoom = Number.isFinite(zoomFactor) && zoomFactor > 0 ? zoomFactor : 1;
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  return {
    x: clamp(viewBounds.x + Math.round(rect.x * zoom),
      viewBounds.x, viewBounds.x + viewBounds.width),
    y: clamp(viewBounds.y + Math.round((rect.y + rect.height) * zoom),
      viewBounds.y, viewBounds.y + viewBounds.height),
  };
}

function buildFillScript({ expectedURL, expectedTimeOrigin, username, password, nonce }) {
  if (typeof nonce !== 'string' || !nonce) throw new Error('nonce required');
  const url = JSON.stringify(expectedURL);
  const timeOrigin = JSON.stringify(expectedTimeOrigin);
  const usernameValue = JSON.stringify(username ?? null);
  const passwordValue = JSON.stringify(password ?? null);
  const nonceValue = JSON.stringify(nonce);
  const selector = JSON.stringify(FORMLIKE_OWNER_SELECTOR);
  return `(function () {
    var authorization = globalThis.__blancOnePasswordFill;
    globalThis.__blancOnePasswordFill = null;
    if (location.href !== ${url} || !document.hasFocus()
        || performance.timeOrigin !== ${timeOrigin}) {
      return { originMismatch: true, filledUser: false, filledPass: false };
    }
    var username = ${usernameValue};
    var password = ${passwordValue};
    if (!authorization || authorization.nonce !== ${nonceValue}) {
      return { selectionChanged: true, filledUser: false, filledPass: false };
    }
    ${sharedSelectionSource()}
    var collected = collectCandidates(${selector});
    var picked = selectFields(collected.candidates);
    var passwordElement = picked.passwordIndex !== null
      ? collected.elements[picked.passwordIndex] : null;
    var usernameElement = picked.usernameIndex !== null
      ? collected.elements[picked.usernameIndex] : null;
    if (picked.passwordBasis !== authorization.basis
        || passwordElement !== authorization.passwordElement
        || usernameElement !== authorization.usernameElement
        || (passwordElement && !passwordElement.isConnected)
        || (usernameElement && !usernameElement.isConnected)) {
      return { selectionChanged: true, filledUser: false, filledPass: false };
    }
    var setValue = function (element, value) {
      var descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      descriptor.set.call(element, value);
    };
    var notify = function (element) {
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    };
    var filledUser = false;
    var filledPass = false;
    if (passwordElement && password !== null) {
      setValue(passwordElement, password);
      filledPass = true;
    }
    if (usernameElement && username !== null) {
      setValue(usernameElement, username);
      filledUser = true;
    }
    if (filledPass) notify(passwordElement);
    if (filledUser) notify(usernameElement);
    return { originMismatch: false, filledUser: filledUser, filledPass: filledPass };
  })();`;
}

module.exports = {
  PICKER_MAX,
  FILL_WORLD_ID,
  AUTOFILL,
  parseWebUrl,
  effectivePort,
  websiteMatch,
  candidateMatch,
  rankMatches,
  isValidPickIndex,
  selectFields,
  FORMLIKE_OWNER_SELECTOR,
  buildProbeScript,
  buildInspectScript,
  buildFillScript,
  buildFieldRectScript,
  pickerAnchorPoint,
};
