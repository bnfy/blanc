// F20 — HTTP authentication policy. Blanc never turns an HTTP Basic/Digest or
// proxy challenge into a credentials dialog of its own; the challenge is
// cancelled and the 401/407 reaches the page like any other response, while a
// website's own sign-in form is untouched.
//
// The probe below is test-only observation installed from the harness: an
// additive `app.on('login')` listener (Blanc's own policy handler stays first
// and decides) plus a `browser-window-created` counter, which is the signal a
// credentials dialog cannot hide behind — the old dialog was a BrowserWindow.
// Every scenario also carries a positive control: the challenge must actually
// have reached Electron, or "no prompt" would pass vacuously.
const assert = require('node:assert/strict');
const { When, Then, After } = require('@cucumber/cucumber');
const ctx = require('../support/context');
const { waitForValue } = require('../support/poll');

const PROXY_TARGET = 'http://proxied.test/auth/protected';

function installProbe() {
  return ctx.app.evaluate(({ app }) => {
    const previous = globalThis.__blancAuthProbe;
    if (previous) {
      app.removeListener('login', previous.onLogin);
      app.removeListener('browser-window-created', previous.onWindow);
    }
    const probe = { logins: [], windowsCreated: 0 };
    probe.onLogin = (_event, _webContents, details, authInfo) => {
      probe.logins.push({
        url: details?.url ?? null,
        navigation: !!details?.isRequestForNavigation,
        proxy: !!authInfo?.isProxy,
        scheme: authInfo?.scheme ?? null,
        realm: authInfo?.realm ?? null,
      });
    };
    probe.onWindow = () => { probe.windowsCreated += 1; };
    app.on('login', probe.onLogin);
    app.on('browser-window-created', probe.onWindow);
    globalThis.__blancAuthProbe = probe;
  });
}

function readProbe() {
  return ctx.app.evaluate(() => {
    const probe = globalThis.__blancAuthProbe;
    return probe ? { logins: probe.logins, windowsCreated: probe.windowsCreated } : null;
  });
}

function waitForChallenge(predicate, label) {
  return waitForValue(
    readProbe,
    (probe) => !!probe && probe.logins.some(predicate),
    `${label} to reach Electron's login event (positive control)`,
    10_000
  );
}

async function readTab(world, tabId) {
  return world.call('executeTab', tabId,
    `({ href: location.href, title: document.title, text: document.body ? document.body.innerText : '' })`);
}

function waitForTabSettled(world, tabId, urlPrefix) {
  return world.waitForState((state) => state.tabs.some((tab) =>
    tab.id === tabId && !tab.loading && tab.loadedUrl.startsWith(urlPrefix)), { timeout: 15_000 });
}

// ---- F20-1: navigation challenge ----

When('I navigate to a URL protected by HTTP basic auth', async function () {
  await installProbe();
  this.authUrl = `${ctx.fixturesBase}/auth/protected`;
  this.authTabId = await this.call('openTab', this.authUrl);
  await waitForChallenge((login) => login.navigation && !login.proxy, 'the navigation challenge');
});

Then('no Blanc credential prompt is shown', async function () {
  const probe = await readProbe();
  assert.ok(probe && probe.logins.length >= 1, 'positive control: no HTTP auth challenge was observed');
  assert.equal(probe.windowsCreated, 0,
    `Blanc created ${probe?.windowsCreated} window(s) after HTTP auth challenges ${JSON.stringify(probe?.logins)}`);
});

Then('the protected navigation fails', async function () {
  await waitForTabSettled(this, this.authTabId, this.authUrl);
  const dom = await readTab(this, this.authTabId);
  assert.equal(dom.href, this.authUrl);
  assert.doesNotMatch(dom.text, /PROTECTED-CONTENT/, 'the protected resource must not have been obtained');
  assert.match(dom.text, /401 body for \/auth\/protected/, 'the server\'s 401 response is what the tab shows');
});

// ---- F20-2: page-resource challenges ----

When("a page's own fetch, XHR, and image requests receive HTTP auth challenges", async function () {
  await installProbe();
  this.authUrl = `${ctx.fixturesBase}/auth/page`;
  this.authTabId = await this.call('openTab', this.authUrl);
  // Only the positive control here: a credentials dialog would hold the page's
  // pending resources (and its load) open, so settling belongs to the last step.
  await waitForChallenge((login) => !login.navigation && !login.proxy, 'a page-resource challenge');
});

Then('the page observes the 401 responses itself', async function () {
  await waitForTabSettled(this, this.authTabId, this.authUrl);
  this.authResults = await waitForValue(
    () => this.call('executeTab', this.authTabId, 'window.__authResults || null'),
    (results) => !!results?.done,
    'the page\'s fetch/XHR/image probes to settle',
    15_000
  );
  const probe = await readProbe();
  const resources = probe.logins.filter((login) => !login.navigation);
  // Positive control: the same-origin fetch, the Bearer-carrying XHR, and the
  // same-origin image each raise a real challenge in Electron. The cross-site
  // image deliberately has no such expectation — Chromium's network layer
  // fails it without ever raising a login event (observed 2026-09-15), so it
  // is asserted only through what the page sees.
  assert.ok(resources.filter((login) => /\/auth\/api$/.test(login.url)).length >= 2,
    `expected the fetch and XHR challenges to reach Electron, saw ${JSON.stringify(probe.logins)}`);
  assert.ok(resources.some((login) => /127\.0\.0\.1:\d+\/auth\/protected\.png$/.test(login.url)),
    `expected the same-origin image challenge to reach Electron, saw ${JSON.stringify(probe.logins)}`);
  const r = this.authResults;
  assert.equal(r.sameOriginFetch.status, 401);
  assert.equal(r.sameOriginFetch.wwwAuthenticate, 'Basic realm="/auth/api"');
  assert.equal(r.sameOriginFetch.body, '401 body for /auth/api');
  assert.equal(r.bearerXhr.status, 401);
  assert.deepEqual(r.sameOriginImage, { loaded: false });
  assert.deepEqual(r.crossOriginImage, { loaded: false });
});

// ---- F20-3: the website's own sign-in form ----

When("I submit a website's own sign-in form", async function () {
  await installProbe();
  const signInUrl = `${ctx.fixturesBase}/auth/signin`;
  this.authTabId = await this.call('openTab', signInUrl);
  await waitForTabSettled(this, this.authTabId, signInUrl);
  await this.call('executeTab', this.authTabId, `(() => {
    document.getElementById('signin-user').value = 'acceptance-user';
    document.getElementById('signin-pass').value = 'acceptance-secret';
    document.getElementById('signin').requestSubmit();
  })()`);
  this.authUrl = `${ctx.fixturesBase}/auth/login`;
});

Then('the website completes the sign-in', async function () {
  await waitForTabSettled(this, this.authTabId, this.authUrl);
  const dom = await readTab(this, this.authTabId);
  assert.equal(dom.href, this.authUrl);
  assert.match(dom.text, /form-login-received \d+ bytes/);
});

Then('no HTTP auth challenge was involved', async function () {
  const probe = await readProbe();
  assert.deepEqual(probe.logins, [], 'a form POST must never surface as an HTTP auth challenge');
  assert.equal(probe.windowsCreated, 0);
});

// ---- F20-4: proxy challenge ----

When('a proxy demands authentication for a navigation', async function () {
  await installProbe();
  const proxyPort = new URL(ctx.fixturesBase).port;
  // The fixtures server answers absolute-form requests with 407, so routing
  // plain-http traffic through it makes it an authenticating proxy. Loopback
  // hosts bypass proxies implicitly, hence a non-loopback target name.
  await ctx.app.evaluate(async ({ session }, port) => {
    await session.defaultSession.setProxy({ proxyRules: `http=127.0.0.1:${port}` });
    globalThis.__blancAuthProxySet = true;
  }, proxyPort);
  this.authUrl = PROXY_TARGET;
  this.authTabId = await this.call('openTab', PROXY_TARGET);
  const state = await this.waitForState((s) => s.tabs.some((tab) => tab.id === this.authTabId && tab.webContentsId));
  const tab = state.tabs.find((t) => t.id === this.authTabId);
  const onDefaultSession = await ctx.app.evaluate(({ session, webContents }, id) =>
    webContents.fromId(id)?.session === session.defaultSession, tab.webContentsId);
  assert.equal(onDefaultSession, true, 'the proxy was configured on a session the tab does not use');
  await waitForChallenge((login) => login.proxy, 'the proxy challenge');
});

Then('the proxied navigation fails', async function () {
  await this.waitForState((state) => state.tabs.some((tab) => tab.id === this.authTabId && !tab.loading),
    { timeout: 15_000 });
  const dom = await readTab(this, this.authTabId);
  assert.doesNotMatch(dom.text, /PROTECTED-CONTENT/, 'the proxied resource must not have been obtained');
  assert.ok(/407 body for fixture-proxy/.test(dom.text) || dom.href.startsWith('blanc://error/'),
    `expected the 407 body or Blanc's error page, got ${JSON.stringify(dom)}`);
});

After({ tags: '@F20' }, async function () {
  if (!ctx.app) return;
  await ctx.app.evaluate(async ({ app, session }) => {
    const probe = globalThis.__blancAuthProbe;
    if (probe) {
      app.removeListener('login', probe.onLogin);
      app.removeListener('browser-window-created', probe.onWindow);
      globalThis.__blancAuthProbe = null;
    }
    if (globalThis.__blancAuthProxySet) {
      await session.defaultSession.setProxy({ mode: 'direct' });
      globalThis.__blancAuthProxySet = false;
    }
  });
});
