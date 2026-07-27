const assert = require('node:assert/strict');
const test = require('node:test');

const { matchesHost, buildFillScript, selectFields } = require('../../src/main/onepassword');

test('matchesHost: exact host matches', () => {
  assert.equal(matchesHost(['https://github.com/login'], 'github.com'), true);
});

test('matchesHost: www vs bare host both directions', () => {
  assert.equal(matchesHost(['https://www.github.com'], 'github.com'), true);
  assert.equal(matchesHost(['https://github.com'], 'www.github.com'), true);
});

test('matchesHost: scheme-less stored value matches', () => {
  assert.equal(matchesHost(['github.com'], 'github.com'), true);
});

test('matchesHost: subdomain NOW matches its registrable domain', () => {
  assert.equal(matchesHost(['https://google.com'], 'accounts.google.com'), true);
});

test('matchesHost: deep-subdomain item matches the parent domain', () => {
  assert.equal(matchesHost(['https://accounts.google.com'], 'google.com'), true);
});

test('matchesHost: cross-tenant private domains must NOT match (github.io)', () => {
  assert.equal(matchesHost(['https://alice.github.io'], 'bob.github.io'), false);
});

test('matchesHost: cross-tenant private domains must NOT match (vercel.app)', () => {
  assert.equal(matchesHost(['https://one.vercel.app'], 'two.vercel.app'), false);
});

test('matchesHost: same private-domain tenant still matches', () => {
  assert.equal(matchesHost(['https://alice.github.io'], 'alice.github.io'), true);
});

test('matchesHost: public suffix is not collapsed (co.uk)', () => {
  assert.equal(matchesHost(['https://foo.co.uk'], 'bar.co.uk'), false);
  assert.equal(matchesHost(['https://shop.foo.co.uk'], 'foo.co.uk'), true);
});

test('matchesHost: localhost falls back to exact host', () => {
  assert.equal(matchesHost(['http://localhost'], 'localhost'), true);
  assert.equal(matchesHost(['http://localhost'], 'other-host'), false);
});

test('matchesHost: raw IP falls back to exact host', () => {
  assert.equal(matchesHost(['http://127.0.0.1'], '127.0.0.1'), true);
  assert.equal(matchesHost(['http://127.0.0.1'], '192.168.1.5'), false);
});

test('matchesHost: substring trap must NOT match', () => {
  assert.equal(matchesHost(['https://github.com.evil.com'], 'github.com'), false);
});

test('matchesHost: item with multiple urls, one matches', () => {
  assert.equal(matchesHost(['https://example.org', 'github.com'], 'github.com'), true);
});

test('matchesHost: item with no urls does not match', () => {
  assert.equal(matchesHost([], 'github.com'), false);
});

test('matchesHost: malformed stored url is skipped, not thrown', () => {
  assert.doesNotThrow(() => matchesHost(['http://', ':::', 'github.com'], 'github.com'));
  assert.equal(matchesHost(['http://', ':::', 'github.com'], 'github.com'), true);
});

test('buildFillScript: embeds expectedURL and timeOrigin via JSON.stringify', () => {
  const s = buildFillScript({ expectedURL: 'https://github.com/login', expectedTimeOrigin: 1234.5, username: 'u', password: 'p' });
  assert.ok(s.includes(JSON.stringify('https://github.com/login')));
  assert.ok(s.includes('1234.5'));
});

test('buildFillScript: dangerous credential chars are safely escaped', () => {
  const nasty = 'a"b\\c\nd\'e';
  const s = buildFillScript({ expectedURL: 'https://x.test/', expectedTimeOrigin: 0, username: null, password: nasty });
  assert.ok(s.includes(JSON.stringify(nasty)));       // embedded encoded
  assert.ok(!s.includes('"' + nasty + '"'));          // never the raw sequence in double quotes
});

test('buildFillScript: contains identity guard, visibility check, native setter', () => {
  const s = buildFillScript({ expectedURL: 'https://x.test/', expectedTimeOrigin: 0, username: 'u', password: 'p' });
  assert.ok(s.includes('location.href'));
  assert.ok(s.includes('document.hasFocus()'));
  assert.ok(s.includes('performance.timeOrigin'));
  assert.ok(s.includes('offsetParent'));
  assert.ok(s.includes('HTMLInputElement.prototype'));
});

test('buildFillScript: null username still embeds a null literal (fills password only)', () => {
  const s = buildFillScript({ expectedURL: 'https://x.test/', expectedTimeOrigin: 0, username: null, password: 'p' });
  assert.ok(s.includes('null !== null'));  // the USER !== null guard resolves to false at runtime
});

test('requiring onepassword.js does NOT eagerly load the 1Password SDK', () => {
  // The module must stay import-light: `@1password/sdk` is loaded only inside
  // the SDK functions, so a normal packaged startup never pays for it.
  const resolved = require.resolve('../../src/main/onepassword');
  delete require.cache[resolved];
  require('../../src/main/onepassword');
  const sdkLoaded = Object.keys(require.cache).some((p) => p.includes('@1password' + require('path').sep + 'sdk'));
  assert.equal(sdkLoaded, false);
});

// --- selectFields fixtures -------------------------------------------------
// Minimal descriptor factory: visible, unfocused, no form, no signals.
function cand(i, over = {}) {
  return {
    i,
    type: 'text',
    autocomplete: '',
    name: '',
    id: '',
    placeholder: '',
    ariaLabel: '',
    formKey: null,
    isVisible: true,
    isFocused: false,
    inSearchScope: false,
    ...over,
  };
}

test('selectFields: standard single-page login picks both fields', () => {
  const r = selectFields([
    cand(0, { type: 'text', name: 'username', formKey: 1 }),
    cand(1, { type: 'password', formKey: 1 }),
  ]);
  assert.deepEqual(r, { passwordIndex: 1, usernameIndex: 0 });
});

test('selectFields: password step with no username field', () => {
  const r = selectFields([cand(0, { type: 'password', formKey: 1 })]);
  assert.deepEqual(r, { passwordIndex: 0, usernameIndex: null });
});

test('selectFields: signup form (new-password only) gets NO password', () => {
  // Writing the SAVED password into a new-password field would leak the
  // existing credential into a form meant for a new one.
  const r = selectFields([
    cand(0, { type: 'email', name: 'email', formKey: 1 }),
    cand(1, { type: 'password', autocomplete: 'new-password', formKey: 1 }),
  ]);
  assert.equal(r.passwordIndex, null);
});

test('selectFields: change-password form fills current-password, not new', () => {
  const r = selectFields([
    cand(0, { type: 'password', autocomplete: 'current-password', formKey: 1 }),
    cand(1, { type: 'password', autocomplete: 'new-password', formKey: 1 }),
    cand(2, { type: 'password', autocomplete: 'new-password', formKey: 1 }),
  ]);
  assert.equal(r.passwordIndex, 0);
});

test('selectFields: current-password preferred even when it comes later', () => {
  const r = selectFields([
    cand(0, { type: 'password', formKey: 1 }),
    cand(1, { type: 'password', autocomplete: 'current-password', formKey: 1 }),
  ]);
  assert.equal(r.passwordIndex, 1);
});

test('selectFields: autocomplete is parsed as TOKENS, not whole-string', () => {
  // Per the HTML spec `autocomplete` is a space-separated token list, e.g.
  // "section-login current-password webauthn". Whole-string equality would
  // miss the new-password exclusion entirely — a credential-leak hole.
  const leaky = selectFields([
    cand(0, { type: 'password', autocomplete: 'section-signup new-password webauthn', formKey: 1 }),
  ]);
  assert.equal(leaky.passwordIndex, null, 'new-password token must be honored inside a token list');

  const current = selectFields([
    cand(0, { type: 'password', formKey: 1 }),
    cand(1, { type: 'password', autocomplete: 'section-login current-password webauthn', formKey: 1 }),
  ]);
  assert.equal(current.passwordIndex, 1, 'current-password token must be honored inside a token list');

  const user = selectFields([
    cand(0, { type: 'text', autocomplete: 'section-login username webauthn' }),
  ]);
  assert.equal(user.usernameIndex, 0, 'username token must be honored inside a token list');
});

test('selectFields: username step via autocomplete=username', () => {
  const r = selectFields([cand(0, { type: 'email', autocomplete: 'username' })]);
  assert.deepEqual(r, { passwordIndex: null, usernameIndex: 0 });
});

test('selectFields: Microsoft-style username step (name=loginfmt)', () => {
  const r = selectFields([cand(0, { type: 'email', name: 'loginfmt' })]);
  assert.deepEqual(r, { passwordIndex: null, usernameIndex: 0 });
});

test('selectFields: focused GENERIC field is not evidence — no fill', () => {
  const r = selectFields([cand(0, { type: 'text', isFocused: true })]);
  assert.deepEqual(r, { passwordIndex: null, usernameIndex: null });
});

test('selectFields: camelCase search ids are excluded even when focused', () => {
  const r = selectFields([
    cand(0, { type: 'text', id: 'siteSearch', isFocused: true }),
    cand(1, { type: 'text', name: 'queryInput' }),
  ]);
  assert.deepEqual(r, { passwordIndex: null, usernameIndex: null });
});

test('selectFields: sole newsletter email is excluded', () => {
  const r = selectFields([cand(0, { type: 'email', id: 'newsletter-email' })]);
  assert.deepEqual(r, { passwordIndex: null, usernameIndex: null });
});

test('selectFields: login email wins over a newsletter email', () => {
  const r = selectFields([
    cand(0, { type: 'email', id: 'newsletter-email' }),
    cand(1, { type: 'email', name: 'email' }),
  ]);
  assert.deepEqual(r, { passwordIndex: null, usernameIndex: 1 });
});

test('selectFields: two ambiguous emails, none strong or focused -> no fill', () => {
  const r = selectFields([
    cand(0, { type: 'email', name: 'email' }),
    cand(1, { type: 'email', name: 'contactEmail' }),
  ]);
  assert.deepEqual(r, { passwordIndex: null, usernameIndex: null });
});

test('selectFields: focus breaks ties among positive candidates', () => {
  const r = selectFields([
    cand(0, { type: 'email', name: 'email' }),
    cand(1, { type: 'email', name: 'contactEmail', isFocused: true }),
  ]);
  assert.deepEqual(r, { passwordIndex: null, usernameIndex: 1 });
});

test('selectFields: focused field in ANOTHER form does not take the username', () => {
  const r = selectFields([
    cand(0, { type: 'email', name: 'email', formKey: 2, isFocused: true }), // newsletter form
    cand(1, { type: 'text', name: 'username', formKey: 1 }),                 // login form
    cand(2, { type: 'password', formKey: 1 }),
  ]);
  assert.deepEqual(r, { passwordIndex: 2, usernameIndex: 1 });
});

test('selectFields: two anonymous forms stay separate (formKey identity)', () => {
  const r = selectFields([
    cand(0, { type: 'email', name: 'email', formKey: 0 }),  // anonymous newsletter form
    cand(1, { type: 'text', name: 'user', formKey: 1 }),    // anonymous login form
    cand(2, { type: 'password', formKey: 1 }),
  ]);
  assert.deepEqual(r, { passwordIndex: 2, usernameIndex: 1 });
});

test('selectFields: hidden/honeypot inputs are ignored', () => {
  const r = selectFields([
    cand(0, { type: 'text', name: 'username', isVisible: false }),
    cand(1, { type: 'password', isVisible: false }),
    cand(2, { type: 'text', name: 'username', formKey: 1 }),
    cand(3, { type: 'password', formKey: 1 }),
  ]);
  assert.deepEqual(r, { passwordIndex: 3, usernameIndex: 2 });
});

test('selectFields: no inputs at all', () => {
  assert.deepEqual(selectFields([]), { passwordIndex: null, usernameIndex: null });
});

// --- Audit regressions (adversarial workflow, 2026-07): a login form has
// exactly ONE visible password field; signup/change/reset forms have 2+. ------

test('AUDIT P1: unannotated signup form gets NO password', () => {
  const r = selectFields([
    cand(0, { name: 'username', formKey: 1 }),
    cand(1, { type: 'password', name: 'password', placeholder: 'Create a password', formKey: 1 }),
    cand(2, { type: 'password', name: 'password_confirm', placeholder: 'Confirm password', formKey: 1 }),
  ]);
  assert.equal(r.passwordIndex, null);
});

test('AUDIT P1: annotated signup is not defeated by its confirm sibling', () => {
  // new-password + an unannotated confirm: the confirm must NOT become the target.
  const r = selectFields([
    cand(0, { type: 'email', autocomplete: 'email', name: 'email', formKey: 1 }),
    cand(1, { type: 'password', autocomplete: 'new-password', placeholder: 'New password', formKey: 1 }),
    cand(2, { type: 'password', autocomplete: 'off', name: 'password2', placeholder: 'Confirm', formKey: 1 }),
  ]);
  assert.equal(r.passwordIndex, null);
});

test('AUDIT P1: a signup form before the login form does not steal the fill', () => {
  const r = selectFields([
    cand(0, { type: 'email', autocomplete: 'email', formKey: 1 }),
    cand(1, { type: 'password', autocomplete: 'new-password', formKey: 1 }),
    cand(2, { type: 'password', name: 'confirm', formKey: 1 }),
    cand(3, { name: 'username', formKey: 2 }),
    cand(4, { type: 'password', name: 'password', formKey: 2 }),
  ]);
  assert.deepEqual(r, { passwordIndex: 4, usernameIndex: 3 });
});

test('AUDIT P1: password-reset page (new + confirm, no current) gets NO password', () => {
  const r = selectFields([
    cand(0, { type: 'email', name: 'email', formKey: 1 }),
    cand(1, { type: 'password', name: 'new_password', placeholder: 'New password', formKey: 1 }),
    cand(2, { type: 'password', name: 'confirm_new_password', placeholder: 'Re-enter', formKey: 1 }),
  ]);
  assert.equal(r.passwordIndex, null);
});

test('AUDIT P1: hidden current-password does not license the visible new fields', () => {
  const r = selectFields([
    cand(0, { type: 'password', autocomplete: 'current-password', formKey: 1, isVisible: false }),
    cand(1, { type: 'password', name: 'newPassword', formKey: 1 }),
    cand(2, { type: 'password', name: 'confirmPassword', formKey: 1 }),
  ]);
  assert.equal(r.passwordIndex, null);
});

test('AUDIT P3: explicit autocomplete=username beats an adjacent unmarked field', () => {
  const r = selectFields([
    cand(0, { name: 'username', autocomplete: 'username', formKey: 1 }),
    cand(1, { name: 'displayName', placeholder: 'Display name', formKey: 1 }),
    cand(2, { type: 'password', formKey: 1 }),
  ]);
  assert.equal(r.usernameIndex, 0);
});

test('AUDIT P4: on a form-less SPA page, focus cannot beat login evidence', () => {
  const r = selectFields([
    cand(0, { name: 'couponCode', placeholder: 'Coupon', isFocused: true }),
    cand(1, { name: 'username', autocomplete: 'username' }),
    cand(2, { type: 'password', autocomplete: 'current-password' }),
  ]);
  assert.deepEqual(r, { passwordIndex: 2, usernameIndex: 1 });
});

test('AUDIT P5: non-string attributes do not throw', () => {
  assert.doesNotThrow(() => selectFields([
    cand(0, { name: 123, id: null, placeholder: undefined }),
    cand(1, { type: 'password', formKey: 1 }),
  ]));
});

test('AUDIT: change-password form still fills the current-password field', () => {
  const r = selectFields([
    cand(0, { type: 'password', autocomplete: 'current-password', formKey: 1 }),
    cand(1, { type: 'password', autocomplete: 'new-password', formKey: 1 }),
    cand(2, { type: 'password', autocomplete: 'new-password', formKey: 1 }),
  ]);
  assert.equal(r.passwordIndex, 0);
});

// --- Re-audit regressions (round 2): structure alone cannot separate a
// single-password signup form from a login form, so evidence is required. ----

test('AUDIT2: single-field signup ("Create a password", no confirm) gets NO password', () => {
  const r = selectFields([
    cand(0, { type: 'email', name: 'email', formKey: 1 }),
    cand(1, { type: 'password', name: 'password', placeholder: 'Create a password', ariaLabel: 'Create a password', formKey: 1 }),
  ]);
  assert.equal(r.passwordIndex, null);
});

test('AUDIT2: reset-link page with a single "New password" field gets NO password', () => {
  const r = selectFields([
    cand(0, { type: 'password', name: 'new_password', placeholder: 'New password', formKey: 1 }),
  ]);
  assert.equal(r.passwordIndex, null);
});

test('AUDIT2: signup with a progressively-disclosed (hidden) confirm gets NO password', () => {
  const r = selectFields([
    cand(0, { type: 'email', name: 'email', formKey: 1 }),
    cand(1, { type: 'password', placeholder: 'Create a password', formKey: 1 }),
    cand(2, { type: 'password', placeholder: 'Confirm password', formKey: 1, isVisible: false }),
  ]);
  assert.equal(r.passwordIndex, null);
});

test('AUDIT2: a stray current-password token cannot license a new-password field', () => {
  const both = selectFields([
    cand(0, { type: 'password', autocomplete: 'current-password new-password', placeholder: 'Create a password', formKey: 1 }),
  ]);
  assert.equal(both.passwordIndex, null, 'a field carrying BOTH tokens must not be filled');
});

test('AUDIT2: signup confirm field with a stray current-password token is not filled', () => {
  const r = selectFields([
    cand(0, { type: 'password', autocomplete: 'new-password', placeholder: 'New password', formKey: 1 }),
    cand(1, { type: 'password', autocomplete: 'current-password', name: 'confirm', placeholder: 'Confirm password', formKey: 1 }),
  ]);
  assert.equal(r.passwordIndex, null);
});

test('AUDIT2: an explicit current-password login form beats a focused signup form', () => {
  const r = selectFields([
    cand(0, { name: 'username', formKey: 1 }),
    cand(1, { type: 'password', autocomplete: 'current-password', formKey: 1 }),
    cand(2, { type: 'email', name: 'email', formKey: 2, isFocused: true }),
    cand(3, { type: 'password', placeholder: 'Create a password', formKey: 2 }),
  ]);
  assert.deepEqual(r, { passwordIndex: 1, usernameIndex: 0 });
});

test('AUDIT2: an INVISIBLE focused input cannot elect which form gets filled', () => {
  const r = selectFields([
    cand(0, { name: 'zz', formKey: 2, isVisible: false, isFocused: true }),
    cand(1, { name: 'username', autocomplete: 'username', formKey: 1 }),
    cand(2, { type: 'password', autocomplete: 'current-password', formKey: 1 }),
    cand(3, { type: 'password', name: 'pw2', formKey: 2 }),
  ]);
  assert.equal(r.passwordIndex, 2);
});

test('AUDIT2: when the password is declined, the username is NOT sprayed elsewhere', () => {
  const r = selectFields([
    cand(0, { type: 'email', name: 'email', formKey: 1 }),
    cand(1, { type: 'password', placeholder: 'Create a password', formKey: 1 }),
    cand(2, { name: 'username', autocomplete: 'username', formKey: 2 }),
  ]);
  assert.equal(r.passwordIndex, null);
  assert.equal(r.usernameIndex, null, 'a page with a refused password must not receive the username either');
});

test('AUDIT2: a profile form (text fields, none login-ish) gets NO password', () => {
  const r = selectFields([
    cand(0, { name: 'displayName', placeholder: 'Display name', formKey: 1 }),
    cand(1, { type: 'password', name: 'pw', formKey: 1 }),
  ]);
  assert.equal(r.passwordIndex, null);
});

test('AUDIT2: bare password step (no text fields at all) still fills', () => {
  const r = selectFields([cand(0, { type: 'password', name: 'password', formKey: 1 })]);
  assert.equal(r.passwordIndex, 0);
});

test('AUDIT2: ordinary annotated login still fills both fields', () => {
  const r = selectFields([
    cand(0, { name: 'username', autocomplete: 'username', formKey: 1 }),
    cand(1, { type: 'password', autocomplete: 'current-password', formKey: 1 }),
  ]);
  assert.deepEqual(r, { passwordIndex: 1, usernameIndex: 0 });
});

test('AUDIT2: unannotated but login-ish form still fills', () => {
  const r = selectFields([
    cand(0, { name: 'username', placeholder: 'Username', formKey: 1 }),
    cand(1, { type: 'password', name: 'password', placeholder: 'Password', formKey: 1 }),
  ]);
  assert.deepEqual(r, { passwordIndex: 1, usernameIndex: 0 });
});
