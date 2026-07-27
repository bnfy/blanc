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
  const s = buildFillScript({ expectedURL: 'https://github.com/login', expectedTimeOrigin: 1234.5, username: 'u', password: 'p', nonce: 'n1' });
  assert.ok(s.includes(JSON.stringify('https://github.com/login')));
  assert.ok(s.includes('1234.5'));
});

test('buildFillScript: dangerous credential chars are safely escaped', () => {
  const nasty = 'a"b\\c\nd\'e';
  const s = buildFillScript({ expectedURL: 'https://x.test/', expectedTimeOrigin: 0, username: null, password: nasty, nonce: 'n1' });
  assert.ok(s.includes(JSON.stringify(nasty)));       // embedded encoded
  assert.ok(!s.includes('"' + nasty + '"'));          // never the raw sequence in double quotes
});

test('buildFillScript: contains identity guard, visibility check, native setter', () => {
  const s = buildFillScript({ expectedURL: 'https://x.test/', expectedTimeOrigin: 0, username: 'u', password: 'p', nonce: 'n1' });
  assert.ok(s.includes('location.href'));
  assert.ok(s.includes('document.hasFocus()'));
  assert.ok(s.includes('performance.timeOrigin'));
  assert.ok(s.includes('offsetParent'));
  assert.ok(s.includes('HTMLInputElement.prototype'));
});

test('buildFillScript: a null username is embedded as a null literal (fills password only)', () => {
  const s = buildFillScript({ expectedURL: 'https://x.test/', expectedTimeOrigin: 0, username: null, password: 'p', nonce: 'n1' });
  assert.ok(/var USER = null;/.test(s), 'the USER guard resolves to false at runtime');
  assert.ok(s.includes(JSON.stringify('p')));
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

// selectFields also reports passwordBasis; these assertions predate it and
// only care about WHICH fields were chosen, so project to the two indices.
function pick(r) {
  return { passwordIndex: r.passwordIndex, usernameIndex: r.usernameIndex };
}

test('selectFields: standard single-page login picks both fields', () => {
  const r = selectFields([
    cand(0, { type: 'text', name: 'username', formKey: 1 }),
    cand(1, { type: 'password', formKey: 1 }),
  ]);
  assert.deepEqual(pick(r), { passwordIndex: 1, usernameIndex: 0 });
});

test('selectFields: password step with no username field', () => {
  const r = selectFields([cand(0, { type: 'password', formKey: 1 })]);
  assert.deepEqual(pick(r), { passwordIndex: 0, usernameIndex: null });
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
  assert.deepEqual(pick(r), { passwordIndex: null, usernameIndex: 0 });
});

test('selectFields: Microsoft-style username step (name=loginfmt)', () => {
  const r = selectFields([cand(0, { type: 'email', name: 'loginfmt' })]);
  assert.deepEqual(pick(r), { passwordIndex: null, usernameIndex: 0 });
});

test('selectFields: focused GENERIC field is not evidence — no fill', () => {
  const r = selectFields([cand(0, { type: 'text', isFocused: true })]);
  assert.deepEqual(pick(r), { passwordIndex: null, usernameIndex: null });
});

test('selectFields: camelCase search ids are excluded even when focused', () => {
  const r = selectFields([
    cand(0, { type: 'text', id: 'siteSearch', isFocused: true }),
    cand(1, { type: 'text', name: 'queryInput' }),
  ]);
  assert.deepEqual(pick(r), { passwordIndex: null, usernameIndex: null });
});

test('selectFields: sole newsletter email is excluded', () => {
  const r = selectFields([cand(0, { type: 'email', id: 'newsletter-email' })]);
  assert.deepEqual(pick(r), { passwordIndex: null, usernameIndex: null });
});

test('selectFields: login email wins over a newsletter email', () => {
  const r = selectFields([
    cand(0, { type: 'email', id: 'newsletter-email' }),
    cand(1, { type: 'email', name: 'email' }),
  ]);
  assert.deepEqual(pick(r), { passwordIndex: null, usernameIndex: 1 });
});

test('selectFields: two ambiguous emails, none strong or focused -> no fill', () => {
  const r = selectFields([
    cand(0, { type: 'email', name: 'email' }),
    cand(1, { type: 'email', name: 'contactEmail' }),
  ]);
  assert.deepEqual(pick(r), { passwordIndex: null, usernameIndex: null });
});

test('selectFields: focus breaks ties among positive candidates', () => {
  const r = selectFields([
    cand(0, { type: 'email', name: 'email' }),
    cand(1, { type: 'email', name: 'contactEmail', isFocused: true }),
  ]);
  assert.deepEqual(pick(r), { passwordIndex: null, usernameIndex: 1 });
});

test('selectFields: focused field in ANOTHER form does not take the username', () => {
  const r = selectFields([
    cand(0, { type: 'email', name: 'email', formKey: 2, isFocused: true }), // newsletter form
    cand(1, { type: 'text', name: 'username', formKey: 1 }),                 // login form
    cand(2, { type: 'password', formKey: 1 }),
  ]);
  assert.deepEqual(pick(r), { passwordIndex: 2, usernameIndex: 1 });
});

test('selectFields: two anonymous forms stay separate (formKey identity)', () => {
  const r = selectFields([
    cand(0, { type: 'email', name: 'email', formKey: 0 }),  // anonymous newsletter form
    cand(1, { type: 'text', name: 'user', formKey: 1 }),    // anonymous login form
    cand(2, { type: 'password', formKey: 1 }),
  ]);
  assert.deepEqual(pick(r), { passwordIndex: 2, usernameIndex: 1 });
});

test('selectFields: hidden/honeypot inputs are ignored', () => {
  const r = selectFields([
    cand(0, { type: 'text', name: 'username', isVisible: false }),
    cand(1, { type: 'password', isVisible: false }),
    cand(2, { type: 'text', name: 'username', formKey: 1 }),
    cand(3, { type: 'password', formKey: 1 }),
  ]);
  assert.deepEqual(pick(r), { passwordIndex: 3, usernameIndex: 2 });
});

test('selectFields: no inputs at all', () => {
  assert.deepEqual(pick(selectFields([])), { passwordIndex: null, usernameIndex: null });
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
  assert.deepEqual(pick(r), { passwordIndex: 4, usernameIndex: 3 });
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

test('AUDIT P4: on a form-less SPA page, focus cannot steer the username', () => {
  // Form-less inputs all share formKey null, which is the ABSENCE of a scope —
  // so the username is declined outright and only the password is filled. Task
  // 4's adapter restores username filling here by deriving a real container
  // key for form-less inputs; until then this is the safe behavior.
  const r = selectFields([
    cand(0, { name: 'couponCode', placeholder: 'Coupon', isFocused: true }),
    cand(1, { name: 'username', autocomplete: 'username' }),
    cand(2, { type: 'password', autocomplete: 'current-password' }),
  ]);
  assert.deepEqual(pick(r), { passwordIndex: 2, usernameIndex: null });
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
  assert.deepEqual(pick(r), { passwordIndex: 1, usernameIndex: 0 });
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
  assert.deepEqual(pick(r), { passwordIndex: 1, usernameIndex: 0 });
});

test('AUDIT2: unannotated but login-ish form still fills', () => {
  const r = selectFields([
    cand(0, { name: 'username', placeholder: 'Username', formKey: 1 }),
    cand(1, { type: 'password', name: 'password', placeholder: 'Password', formKey: 1 }),
  ]);
  assert.deepEqual(pick(r), { passwordIndex: 1, usernameIndex: 0 });
});

// --- Review round 3 regressions ---------------------------------------------

test('AUDIT3: signup wording in scope overrides a stray current-password token', () => {
  const r = selectFields([
    cand(0, { type: 'email', name: 'signup_email', formKey: 1 }),
    cand(1, { type: 'password', name: 'pw', autocomplete: 'current-password', formKey: 1 }),
  ]);
  assert.deepEqual(pick(r), { passwordIndex: null, usernameIndex: null });
});

test('AUDIT3: two form-less login widgets fail closed instead of splitting credentials', () => {
  const r = selectFields([
    cand(0, { name: 'username', autocomplete: 'username' }),
    cand(1, { type: 'password', autocomplete: 'current-password' }),
    cand(2, { name: 'user2', autocomplete: 'username', isFocused: true }),
    cand(3, { type: 'password', autocomplete: 'current-password' }),
  ]);
  assert.deepEqual(pick(r), { passwordIndex: null, usernameIndex: null },
    'two authoritative password fields in one scope must not be guessed between');
});

test('AUDIT3: explicit autocomplete=username outranks regex-matched wording', () => {
  const before = selectFields([
    cand(0, { name: 'accountRecoveryEmail', formKey: 1 }),
    cand(1, { name: 'u', autocomplete: 'username', formKey: 1 }),
    cand(2, { type: 'password', autocomplete: 'current-password', formKey: 1 }),
  ]);
  assert.equal(before.usernameIndex, 1);
  // ...and still wins when the regex-matched field comes later in the document.
  const after = selectFields([
    cand(0, { name: 'u', autocomplete: 'username', formKey: 1 }),
    cand(1, { name: 'accountRecoveryEmail', formKey: 1 }),
    cand(2, { type: 'password', autocomplete: 'current-password', formKey: 1 }),
  ]);
  assert.equal(after.usernameIndex, 0);
});

test('AUDIT3: no evidence-free adjacency guess (coupon box keeps its value)', () => {
  const r = selectFields([
    cand(0, { name: 'couponCode', placeholder: 'Coupon', formKey: 1 }),
    cand(1, { type: 'password', autocomplete: 'current-password', formKey: 1 }),
  ]);
  assert.equal(r.passwordIndex, 1);
  assert.equal(r.usernameIndex, null, 'password fills; username is left to the user');
});

test('AUDIT3: label/button copy is consulted (generic input attrs, signup labels)', () => {
  // The dominant real-world signup shape: name="password", all the signal is in
  // the <label> and submit button, which collectCandidates supplies as labelText.
  const r = selectFields([
    cand(0, { type: 'email', name: 'email', formKey: 1, labelText: 'Email address Sign up' }),
    cand(1, { type: 'password', name: 'password', formKey: 1, labelText: 'Create a password Sign up' }),
  ]);
  assert.deepEqual(pick(r), { passwordIndex: null, usernameIndex: null });
});

test('AUDIT3: label copy does not break an ordinary login form', () => {
  const r = selectFields([
    cand(0, { type: 'text', name: 'u', formKey: 1, labelText: 'Username Sign in' }),
    cand(1, { type: 'password', name: 'p', formKey: 1, labelText: 'Password Sign in' }),
  ]);
  assert.deepEqual(pick(r), { passwordIndex: 1, usernameIndex: 0 });
});

// --- passwordBasis: authoritative fills silently, heuristic must be confirmed -

test('passwordBasis: authoritative when the site declares current-password', () => {
  const r = selectFields([
    cand(0, { name: 'username', autocomplete: 'username', formKey: 1 }),
    cand(1, { type: 'password', autocomplete: 'current-password', formKey: 1 }),
  ]);
  assert.equal(r.passwordIndex, 1);
  assert.equal(r.passwordBasis, 'authoritative');
});

test('passwordBasis: heuristic when inferred from structure + wording', () => {
  const r = selectFields([
    cand(0, { name: 'username', placeholder: 'Username', formKey: 1 }),
    cand(1, { type: 'password', name: 'password', formKey: 1 }),
  ]);
  assert.equal(r.passwordIndex, 1);
  assert.equal(r.passwordBasis, 'heuristic',
    'an unannotated login form is a guess and must be confirmed before filling');
});

test('passwordBasis: null when no password is selected', () => {
  const r = selectFields([cand(0, { type: 'email', autocomplete: 'username' })]);
  assert.equal(r.passwordIndex, null);
  assert.equal(r.passwordBasis, null);
});

test('passwordBasis: bare password step is heuristic (no annotation to trust)', () => {
  const r = selectFields([cand(0, { type: 'password', name: 'password', formKey: 1 })]);
  assert.equal(r.passwordIndex, 0);
  assert.equal(r.passwordBasis, 'heuristic');
});

// --- Review round 4 -----------------------------------------------------------

test('AUDIT4: form-less page with two username widgets fills no username', () => {
  // One authoritative password, but two equally-annotated username fields in the
  // shared null scope: focus must not pull the username out of another widget.
  const r = selectFields([
    cand(0, { name: 'user1', autocomplete: 'username' }),
    cand(1, { type: 'password', autocomplete: 'current-password' }),
    cand(2, { name: 'user2', autocomplete: 'username', isFocused: true }),
  ]);
  assert.equal(r.passwordIndex, 1);
  assert.equal(r.usernameIndex, null, 'ambiguous form-less scope must not guess a username');
});

test('AUDIT4: submit-button copy does not promote an unrelated field', () => {
  // "Login" on the button must not make a coupon box look like a username.
  const r = selectFields([
    cand(0, { name: 'couponCode', formKey: 1, labelText: 'Coupon code', formText: 'Log in' }),
    cand(1, { type: 'password', name: 'p', formKey: 1, labelText: 'Password', formText: 'Log in' }),
  ]);
  assert.equal(r.usernameIndex, null);
  assert.equal(r.passwordIndex, 1, 'a Log in button is scope-level login evidence');
  assert.equal(r.passwordBasis, 'heuristic');
});

test('AUDIT4: a Confirm submit button does not disqualify a current-password field', () => {
  const r = selectFields([
    cand(0, { name: 'username', formKey: 1, labelText: 'Username', formText: 'Confirm' }),
    cand(1, { type: 'password', autocomplete: 'current-password', formKey: 1, labelText: 'Password', formText: 'Confirm' }),
  ]);
  assert.equal(r.passwordIndex, 1);
  assert.equal(r.passwordBasis, 'authoritative');
});

test('AUDIT4: signup wording on the FORM (not the inputs) still declines', () => {
  const r = selectFields([
    cand(0, { type: 'email', name: 'email', formKey: 1, labelText: 'Email', formText: 'Create account' }),
    cand(1, { type: 'password', name: 'password', formKey: 1, labelText: 'Password', formText: 'Create account' }),
  ]);
  assert.deepEqual(pick(r), { passwordIndex: null, usernameIndex: null });
});

test('AUDIT4: basis is reported on the adversarial signup fixtures too', () => {
  const signup = selectFields([
    cand(0, { type: 'email', name: 'email', formKey: 1 }),
    cand(1, { type: 'password', placeholder: 'Create a password', formKey: 1 }),
  ]);
  assert.equal(signup.passwordBasis, null, 'a declined form reports no basis');
  const annotated = selectFields([
    cand(0, { type: 'password', autocomplete: 'current-password', formKey: 1 }),
  ]);
  assert.equal(annotated.passwordBasis, 'authoritative');
});

test('AUDIT5: form-less scope fills the password only, even for a unique username', () => {
  // A UNIQUE higher-ranked candidate in another form-less widget is still a
  // different widget — uniqueness is not membership.
  const r = selectFields([
    cand(0, { name: 'user1' }),
    cand(1, { type: 'password', autocomplete: 'current-password' }),
    cand(2, { name: 'u2', autocomplete: 'username' }),
  ]);
  assert.equal(r.passwordIndex, 1);
  assert.equal(r.usernameIndex, null);
});

test('AUDIT5: a real form scope still fills both fields', () => {
  const r = selectFields([
    cand(0, { name: 'u', autocomplete: 'username', formKey: 1 }),
    cand(1, { type: 'password', autocomplete: 'current-password', formKey: 1 }),
  ]);
  assert.deepEqual(pick(r), { passwordIndex: 1, usernameIndex: 0 });
});

// ===========================================================================
// Task 4 — injected sources: buildInspectScript / buildFillScript
// ===========================================================================
const vm = require('node:vm');
const {
  buildInspectScript, FORMLIKE_OWNER_SELECTOR,
} = require('../../src/main/onepassword');

const SRC_ARGS = { expectedURL: 'https://x.test/', expectedTimeOrigin: 1 };

/** A stub <form>/container that the adapter can read as an owner. */
function stubOwner(over = {}) {
  const attrs = over.attrs || {};
  return {
    getAttribute: (a) => (a in attrs ? attrs[a] : null),
    querySelector: () => over.submit || null,
    ...over,
  };
}

/** A stub <input>. `attrs` backs getAttribute (autocomplete, placeholder, …). */
function stubInput(over = {}) {
  const attrs = over.attrs || {};
  return {
    tagName: 'INPUT',
    type: 'text',
    name: '',
    id: '',
    form: null,
    labels: [],
    isConnected: true,
    offsetParent: {},
    parentElement: null,
    getAttribute: (a) => (a in attrs ? attrs[a] : null),
    closest: () => null,
    checkVisibility: () => true,
    getBoundingClientRect: () => ({ width: 120, height: 24, top: 10, left: 10, right: 130, bottom: 34 }),
    dispatchEvent: () => true,
    ...over,
  };
}

/** A VM context mirroring the isolated world, with an INSTRUMENTED value setter
 * so every test can assert what was actually written to the DOM — a status flag
 * alone does not prove a credential stayed out. */
function makeCtx(inputs, writes) {
  function HTMLInputElement() {}
  Object.defineProperty(HTMLInputElement.prototype, 'value', {
    configurable: true,
    get() { return this._v || ''; },
    set(v) { this._v = v; writes.push(v); },
  });
  for (const el of inputs) Object.setPrototypeOf(el, HTMLInputElement.prototype);
  const sb = {
    location: { href: 'https://x.test/' },
    performance: { timeOrigin: 1 },
    document: { hasFocus: () => true, querySelectorAll: () => inputs, activeElement: null },
    window: { innerWidth: 1024, innerHeight: 768 },
    getComputedStyle: () => ({ clipPath: 'none', clip: 'auto', overflow: 'visible' }),
    HTMLInputElement,
    Event: function Event(t) { this.type = t; },
    Map, Object, String, Array, Math, RegExp, JSON, Boolean, Number,
  };
  sb.globalThis = sb;
  return vm.createContext(sb);
}

/** An annotated login form: username + password sharing ONE real owner, so the
 * scope is a real form (not the null scope, which fills the password only). */
function loginFixture() {
  const owner = stubOwner({ attrs: { id: 'login' }, submit: { textContent: 'Sign in' } });
  return [
    stubInput({ type: 'text', name: 'username', form: owner, attrs: { autocomplete: 'username' } }),
    stubInput({ type: 'password', name: 'password', form: owner, attrs: { autocomplete: 'current-password' } }),
  ];
}

test('T4: both builders REQUIRE a nonce', () => {
  assert.throws(() => buildInspectScript({ ...SRC_ARGS }), /nonce/);
  assert.throws(() => buildFillScript({ ...SRC_ARGS, username: 'u', password: 'p' }), /nonce/);
});

test('T4: inspect source carries NO credential literal and never writes', () => {
  const s = buildInspectScript({ ...SRC_ARGS, nonce: 'n1' });
  assert.ok(s.includes(JSON.stringify('https://x.test/')));
  assert.ok(s.includes('hasPassword'));
  assert.ok(!s.includes('setValue'), 'inspect must not contain the setter');
  assert.ok(!s.includes('function notify'), 'inspect must not contain the notifier');
});

test('T4: both sources embed the SAME selection logic', () => {
  const a = buildInspectScript({ ...SRC_ARGS, nonce: 'n1' });
  const b = buildFillScript({ ...SRC_ARGS, nonce: 'n1', username: 'u', password: 'p' });
  for (const fn of ['function selectFields', 'function collectCandidates',
    'function pickPasswordInScope', 'function usernameRank', 'function scopeLooksLikeLogin']) {
    assert.ok(a.includes(fn), `inspect missing ${fn}`);
    assert.ok(b.includes(fn), `fill missing ${fn}`);
  }
});

test('T4: fill source embeds only the credentials provided, safely escaped', () => {
  const only = buildFillScript({ ...SRC_ARGS, nonce: 'n1', username: 'alice', password: null });
  assert.ok(only.includes(JSON.stringify('alice')));
  assert.ok(/var PASS = null;/.test(only));
  const nasty = 'a"b\\c\nd\'e';
  const esc = buildFillScript({ ...SRC_ARGS, nonce: 'n1', username: null, password: nasty });
  assert.ok(esc.includes(JSON.stringify(nasty)));
  assert.ok(!esc.includes('"' + nasty + '"'));
});

test('T4 runtime: unchanged DOM fills both fields', () => {
  const writes = [];
  const inputs = loginFixture();
  const ctx = makeCtx(inputs, writes);
  const insp = vm.runInContext(buildInspectScript({ ...SRC_ARGS, nonce: 'n1' }), ctx);
  assert.equal(insp.originMismatch, false);
  assert.equal(insp.hasPassword, true);
  assert.equal(insp.passwordBasis, 'authoritative');
  const filled = vm.runInContext(buildFillScript({ ...SRC_ARGS, nonce: 'n1', username: 'u', password: 'p' }), ctx);
  assert.equal(filled.filledPass, true);
  assert.equal(filled.filledUser, true);
  assert.deepEqual(writes, ['p', 'u']);
});

test('T4 runtime: replay is rejected (stash is single-use) and writes nothing', () => {
  const writes = [];
  const ctx = makeCtx(loginFixture(), writes);
  vm.runInContext(buildInspectScript({ ...SRC_ARGS, nonce: 'n1' }), ctx);
  vm.runInContext(buildFillScript({ ...SRC_ARGS, nonce: 'n1', username: 'u', password: 'p' }), ctx);
  const before = writes.length;
  const replay = vm.runInContext(buildFillScript({ ...SRC_ARGS, nonce: 'n1', username: 'u', password: 'p' }), ctx);
  assert.equal(replay.selectionChanged, true);
  assert.equal(writes.length, before, 'a rejected fill must not write');
});

test('T4 runtime: nonce mismatch is rejected and writes nothing', () => {
  const writes = [];
  const ctx = makeCtx(loginFixture(), writes);
  vm.runInContext(buildInspectScript({ ...SRC_ARGS, nonce: 'n1' }), ctx);
  const bad = vm.runInContext(buildFillScript({ ...SRC_ARGS, nonce: 'OTHER', username: 'u', password: 'p' }), ctx);
  assert.equal(bad.selectionChanged, true);
  assert.equal(writes.length, 0);
});

test('T4 runtime: element REPLACED between passes is rejected and writes nothing', () => {
  const writes = [];
  const inputs = loginFixture();
  const ctx = makeCtx(inputs, writes);
  vm.runInContext(buildInspectScript({ ...SRC_ARGS, nonce: 'n1' }), ctx);
  // The page swaps the password node for a different one with identical markup.
  const owner = inputs[1].form;
  const replacement = stubInput({ type: 'password', name: 'password', form: owner, attrs: { autocomplete: 'current-password' } });
  Object.setPrototypeOf(replacement, Object.getPrototypeOf(inputs[1]));
  inputs[1] = replacement;
  const out = vm.runInContext(buildFillScript({ ...SRC_ARGS, nonce: 'n1', username: 'u', password: 'p' }), ctx);
  assert.equal(out.selectionChanged, true, 'a swapped element must invalidate the authorization');
  assert.equal(writes.length, 0);
});

test('T4 runtime: BASIS change between passes is rejected and writes nothing', () => {
  const writes = [];
  const inputs = loginFixture();
  const ctx = makeCtx(inputs, writes);
  const insp = vm.runInContext(buildInspectScript({ ...SRC_ARGS, nonce: 'n1' }), ctx);
  assert.equal(insp.passwordBasis, 'authoritative');
  // Same node, but the site drops the annotation -> the basis degrades to
  // heuristic, which the user never authorized.
  inputs[1].getAttribute = () => null;
  const out = vm.runInContext(buildFillScript({ ...SRC_ARGS, nonce: 'n1', username: 'u', password: 'p' }), ctx);
  assert.equal(out.selectionChanged, true, 'a basis downgrade must invalidate the authorization');
  assert.equal(writes.length, 0);
});

test('T4 runtime: a disconnected authorized element is rejected', () => {
  const writes = [];
  const inputs = loginFixture();
  const ctx = makeCtx(inputs, writes);
  vm.runInContext(buildInspectScript({ ...SRC_ARGS, nonce: 'n1' }), ctx);
  inputs[1].isConnected = false;
  const out = vm.runInContext(buildFillScript({ ...SRC_ARGS, nonce: 'n1', username: 'u', password: 'p' }), ctx);
  assert.equal(out.selectionChanged, true);
  assert.equal(writes.length, 0);
});

test('T4: owner selector is TOKEN-aware, never substring', () => {
  // [class*=auth i] matched page-wide wrappers (authenticated-layout) and
  // unrelated classes (author-profile), merging every form-less widget.
  assert.ok(!FORMLIKE_OWNER_SELECTOR.includes('*='),
    'substring attribute matchers are forbidden for scope ownership');
  assert.ok(FORMLIKE_OWNER_SELECTOR.includes('[class~=login]'));
  assert.ok(FORMLIKE_OWNER_SELECTOR.includes('[role=form]'));
  for (const bad of ['authenticated-layout', 'author-profile', 'authors']) {
    assert.ok(!FORMLIKE_OWNER_SELECTOR.includes(bad));
  }
});

test('T4 runtime: no page code runs BETWEEN credential writes (1P-AUTH-001)', () => {
  // The password field's own input handler disconnects the username node. If
  // notification is interleaved with assignment, the username lands in a node
  // that is no longer in the document.
  const writes = [];
  const inputs = loginFixture();
  const [userEl, pwEl] = inputs;
  pwEl.dispatchEvent = () => { userEl.isConnected = false; return true; };
  const ctx = makeCtx(inputs, writes);
  // Record connectedness AT WRITE TIME, not afterwards.
  const seen = [];
  const proto = Object.getPrototypeOf(pwEl);
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  Object.defineProperty(proto, 'value', {
    configurable: true,
    get: desc.get,
    set(v) { seen.push({ v, connected: this.isConnected }); desc.set.call(this, v); },
  });
  vm.runInContext(buildInspectScript({ ...SRC_ARGS, nonce: 'n1' }), ctx);
  vm.runInContext(buildFillScript({ ...SRC_ARGS, nonce: 'n1', username: 'USER', password: 'PASS' }), ctx);
  assert.ok(seen.length > 0, 'something must have been written');
  for (const w of seen) {
    assert.equal(w.connected, true,
      `wrote ${JSON.stringify(w.v)} into a disconnected node — page code ran between writes`);
  }
});

test('T4 runtime: a wrong nonce CONSUMES the authorization (1P-AUTH-002)', () => {
  const writes = [];
  const ctx = makeCtx(loginFixture(), writes);
  vm.runInContext(buildInspectScript({ ...SRC_ARGS, nonce: 'good' }), ctx);
  const bad = vm.runInContext(buildFillScript({ ...SRC_ARGS, nonce: 'WRONG', username: 'U', password: 'P' }), ctx);
  assert.equal(bad.selectionChanged, true);
  // The formerly-correct nonce must NOT succeed afterwards: any attempt spends
  // the authorization, so a failed guess can't be followed by a valid replay.
  const after = vm.runInContext(buildFillScript({ ...SRC_ARGS, nonce: 'good', username: 'U', password: 'P' }), ctx);
  assert.equal(after.selectionChanged, true, 'a rejected attempt must still consume the stash');
  assert.equal(writes.length, 0, 'neither attempt may write');
});

test('T4 runtime: an originMismatch attempt CONSUMES the authorization', () => {
  // Losing focus mid-flow must not leave a replayable authorization: the same
  // fill source must fail after focus returns, forcing a fresh inspect.
  const writes = [];
  const inputs = loginFixture();
  let focused = true;
  const ctx = makeCtx(inputs, writes);
  ctx.document.hasFocus = () => focused;
  vm.runInContext(buildInspectScript({ ...SRC_ARGS, nonce: 'n1' }), ctx);
  focused = false;
  const missed = vm.runInContext(buildFillScript({ ...SRC_ARGS, nonce: 'n1', username: 'U', password: 'P' }), ctx);
  assert.equal(missed.originMismatch, true);
  focused = true;
  const replay = vm.runInContext(buildFillScript({ ...SRC_ARGS, nonce: 'n1', username: 'U', password: 'P' }), ctx);
  assert.equal(replay.selectionChanged, true, 'a rejected identity check must still spend the stash');
  assert.equal(writes.length, 0, 'neither attempt may write');
});

// ===========================================================================
// Task 5 — orchestrator wiring (asserted against main.js source)
// ===========================================================================

test('T5: fill path injects into a dedicated isolated world at BOTH call sites', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../../src/main/main.js'), 'utf8');

  const m = src.match(/FILL_WORLD_ID\s*=\s*(\d+)/);
  assert.ok(m, 'FILL_WORLD_ID constant not found in main.js');
  const id = Number(m[1]);
  assert.ok(id >= 1000, 'custom isolated worlds must use id >= 1000');
  assert.notEqual(id, 0);    // page main world
  assert.notEqual(id, 999);  // Electron context-isolation / preload world

  // It must actually be USED for both injections — asserting only the constant
  // stays green if the calls regress to main-world executeJavaScript.
  const isolated = src.match(/executeJavaScriptInIsolatedWorld\(\s*FILL_WORLD_ID\s*,/g) || [];
  assert.equal(isolated.length, 2, 'expected 2 isolated-world injections (inspect + fill)');
  assert.ok(!/executeJavaScript\(\s*source\s*\)/.test(src),
    'the credential-bearing fill must never use main-world executeJavaScript');
});

test('T5: orchestrator mints one nonce and passes it to both builders', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../../src/main/main.js'), 'utf8');
  assert.ok(/const nonce = crypto\.randomUUID\(\)/.test(src), 'a per-invocation nonce is required');
  assert.ok(/buildInspectScript\(\{[^}]*nonce[^}]*\}\)/s.test(src), 'inspect must receive the nonce');
  assert.ok(/buildFillScript\(\{[\s\S]*?nonce,[\s\S]*?\}\)/.test(src), 'fill must receive the same nonce');
});

test('T5: heuristic targets are confirmed before anything is decrypted', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../../src/main/main.js'), 'utf8');
  const confirmAt = src.search(/passwordBasis !== 'authoritative'/);
  const revealAt = src.search(/revealCredential\(/);
  assert.ok(confirmAt > -1, 'a heuristic-target confirmation gate is required');
  assert.ok(revealAt > -1, 'revealCredential must be called');
  assert.ok(confirmAt < revealAt,
    'the confirmation must run BEFORE revealCredential — declining must cost no decrypt');
  assert.ok(/user-declined/.test(src), 'a declined prompt needs its own outcome');
  assert.ok(/selection-changed/.test(src), 'the selectionChanged status needs an outcome');
});

test('T5: tab focus is restored after every modal dialog, before validation', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../../src/main/main.js'), 'utf8');
  assert.ok(/async function restoreTabFocus/.test(src),
    'a focus-restoration helper is required — a modal returns focus to the chrome document');
  // Both dialogs steal focus: the multi-match chooser (before inspect, whose
  // injected guard calls document.hasFocus()) and the heuristic confirmation
  // (before the post-reveal wc.isFocused() guard).
  const calls = src.match(/await restoreTabFocus\(/g) || [];
  assert.ok(calls.length >= 2,
    `expected focus restoration after both dialogs, found ${calls.length}`);
  // It must run before the confirmation's re-validation, not after.
  const restoreAfterConfirm = src.indexOf('await restoreTabFocus', src.indexOf("log('user-declined')"));
  const revalidate = src.indexOf("log('abort-wc-changed')", src.indexOf("log('user-declined')"));
  assert.ok(restoreAfterConfirm > -1 && restoreAfterConfirm < revalidate,
    'focus must be restored before the identity re-validation that checks it');
});

test('T5: a FAILED focus restoration aborts before decrypting', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../../src/main/main.js'), 'utf8');
  // restoreTabFocus reports whether focus actually came back. Ignoring that
  // return value re-creates the very bug it was added for: prompt the user,
  // decrypt, then abort on the post-reveal focus guard.
  const calls = src.match(/await restoreTabFocus\(wc\)/g) || [];
  const gated = src.match(/if\s*\(!\(await restoreTabFocus\(wc\)\)\)/g) || [];
  assert.equal(gated.length, calls.length,
    'every restoreTabFocus call must be gated on its result');
  // And the gate must precede the decrypt.
  const firstGate = src.search(/if\s*\(!\(await restoreTabFocus\(wc\)\)\)/);
  const reveal = src.indexOf('revealCredential(');
  assert.ok(firstGate > -1 && firstGate < reveal,
    'focus must be confirmed restored BEFORE revealCredential');
});

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
