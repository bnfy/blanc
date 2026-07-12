// SPIKE (1Password fill feasibility) — throwaway; remove or keep env-gated
// before any release. This module owns the 1Password SDK client and ALL
// credential handling. `@1password/sdk` is require()d lazily (Task 2) so a
// normal packaged startup never loads it.

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

/** True iff any of a Login item's stored website URLs resolves to `host`
 * (both sides `www.`-stripped, EXACT equality — deliberately not substring,
 * so `github.com.evil.com` cannot match `github.com`). */
function matchesHost(itemUrls, host) {
  const target = normalizeHost(host);
  if (!target || !Array.isArray(itemUrls)) return false;
  return itemUrls.some((u) => normalizeHost(u) === target);
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

module.exports = { matchesHost, buildFillScript };
