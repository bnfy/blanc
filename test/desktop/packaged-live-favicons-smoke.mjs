// Pre-release live compatibility canary for Blanc's favicon pipeline. This is
// deliberately separate from CI: it depends on third-party sites, but the
// release script runs it against the signed packaged candidate before tagging.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { launchPackagedOverCdp } from './support/packaged-cdp.mjs';

const defaultExecutable = process.platform === 'darwin'
  ? path.resolve('dist/mac-arm64/Blanc.app/Contents/MacOS/Blanc')
  : null;
const executablePath = process.env.BLANC_PACKAGED_EXECUTABLE || defaultExecutable;
if (!executablePath || !fs.existsSync(executablePath)) {
  throw new Error(
    'Packaged Blanc executable not found. Set BLANC_PACKAGED_EXECUTABLE or build dist/mac-arm64 first.'
  );
}

// Two independent sets spanning gated touch icons, slow CDN assets, SVG,
// classic ICO, multi-size PNG, and sites with same-origin redirects.
const primarySites = [
  { name: 'X', url: 'https://x.com/', host: 'x.com' },
  { name: 'United', url: 'https://www.united.com/', host: 'united.com' },
  { name: 'GitHub', url: 'https://github.com/', host: 'github.com' },
  { name: 'Apple', url: 'https://www.apple.com/', host: 'apple.com' },
  { name: 'Google', url: 'https://www.google.com/', host: 'google.com' },
  { name: 'Wikipedia', url: 'https://www.wikipedia.org/', host: 'wikipedia.org' },
  { name: 'Microsoft', url: 'https://www.microsoft.com/', host: 'microsoft.com' },
  { name: 'CNN', url: 'https://www.cnn.com/', host: 'cnn.com' },
  { name: 'Reddit', url: 'https://www.reddit.com/', host: 'reddit.com' },
  { name: 'Amazon', url: 'https://www.amazon.com/', host: 'amazon.com' },
  { name: 'YouTube', url: 'https://www.youtube.com/', host: 'youtube.com' },
  { name: 'LinkedIn', url: 'https://www.linkedin.com/', host: 'linkedin.com' },
  { name: 'Stack Overflow', url: 'https://stackoverflow.com/', host: 'stackoverflow.com' },
  { name: 'npm', url: 'https://www.npmjs.com/', host: 'npmjs.com' },
  { name: 'Mozilla', url: 'https://www.mozilla.org/', host: 'mozilla.org' },
  { name: 'Cloudflare', url: 'https://www.cloudflare.com/', host: 'cloudflare.com' },
  { name: 'Delta', url: 'https://www.delta.com/', host: 'delta.com' },
  { name: 'Southwest', url: 'https://www.southwest.com/', host: 'southwest.com' },
  { name: 'Walmart', url: 'https://www.walmart.com/', host: 'walmart.com' },
  { name: 'eBay', url: 'https://www.ebay.com/', host: 'ebay.com' },
  { name: 'BBC', url: 'https://www.bbc.com/', host: 'bbc.com' },
  { name: 'New York Times', url: 'https://www.nytimes.com/', host: 'nytimes.com' },
  { name: 'ESPN', url: 'https://www.espn.com/', host: 'espn.com' },
  { name: 'DuckDuckGo', url: 'https://duckduckgo.com/', host: 'duckduckgo.com' },
  { name: 'Stripe', url: 'https://stripe.com/', host: 'stripe.com' },
  // Only a large touch icon is declared; the usable /favicon.ico is valid ICO
  // bytes served as application/octet-stream. This guards the shared local +
  // synced fallback that browsers such as Brave already support.
  { name: 'App Store Connect', url: 'https://appstoreconnect.apple.com/', host: 'appstoreconnect.apple.com' },
];
const additionalSites = [
  { name: 'Facebook', url: 'https://www.facebook.com/', host: 'facebook.com' },
  { name: 'Instagram', url: 'https://www.instagram.com/', host: 'instagram.com' },
  { name: 'TikTok', url: 'https://www.tiktok.com/', host: 'tiktok.com' },
  { name: 'Netflix', url: 'https://www.netflix.com/', host: 'netflix.com' },
  { name: 'Adobe', url: 'https://www.adobe.com/', host: 'adobe.com' },
  { name: 'Salesforce', url: 'https://www.salesforce.com/', host: 'salesforce.com' },
  { name: 'Dropbox', url: 'https://www.dropbox.com/', host: 'dropbox.com' },
  { name: 'Zoom', url: 'https://www.zoom.com/', host: 'zoom.com' },
  { name: 'Slack', url: 'https://slack.com/', host: 'slack.com' },
  { name: 'Discord', url: 'https://discord.com/', host: 'discord.com' },
  { name: 'Twitch', url: 'https://www.twitch.tv/', host: 'twitch.tv' },
  { name: 'Pinterest', url: 'https://www.pinterest.com/', host: 'pinterest.com' },
  { name: 'PayPal', url: 'https://www.paypal.com/', host: 'paypal.com' },
  { name: 'Shopify', url: 'https://www.shopify.com/', host: 'shopify.com' },
  { name: 'Target', url: 'https://www.target.com/', host: 'target.com' },
  { name: 'Best Buy', url: 'https://www.bestbuy.com/', host: 'bestbuy.com' },
  { name: 'Home Depot', url: 'https://www.homedepot.com/', host: 'homedepot.com' },
  { name: 'Costco', url: 'https://www.costco.com/', host: 'costco.com' },
  { name: 'Uber', url: 'https://www.uber.com/', host: 'uber.com' },
  { name: 'Airbnb', url: 'https://www.airbnb.com/', host: 'airbnb.com' },
  { name: 'Booking.com', url: 'https://www.booking.com/', host: 'booking.com' },
  { name: 'American Airlines', url: 'https://www.aa.com/', host: 'aa.com' },
  { name: 'Marriott', url: 'https://www.marriott.com/', host: 'marriott.com' },
  { name: 'The Guardian', url: 'https://www.theguardian.com/', host: 'theguardian.com' },
  { name: 'Reuters', url: 'https://www.reuters.com/', host: 'reuters.com' },
  // NFL's only ordinary favicon is compressed app artwork (currently
  // 2000x2000), with no working /favicon.ico fallback.
  { name: 'NFL', url: 'https://www.nfl.com/', host: 'nfl.com' },
];
const matrices = { primary: primarySites, additional: additionalSites };
const allSites = [...primarySites, ...additionalSites];
assert.equal(primarySites.length, 26);
assert.equal(additionalSites.length, 26);
assert.equal(new Set(allSites.map(({ name }) => name.toLowerCase())).size, 52, 'favicon matrix names must be unique');
assert.equal(new Set(allSites.map(({ host }) => host)).size, 52, 'favicon matrix hosts must be unique');

const matrixName = String(process.env.BLANC_FAVICON_MATRIX ?? '').trim().toLowerCase();
if (matrixName && !matrices[matrixName]) {
  throw new Error(`Unknown BLANC_FAVICON_MATRIX: ${matrixName}`);
}
const matrixSites = matrixName ? matrices[matrixName] : allSites;
const requestedNames = new Set(
  String(process.env.BLANC_FAVICON_SITES ?? '')
    .split(',').map((name) => name.trim().toLowerCase()).filter(Boolean)
);
const brandOnly = process.env.BLANC_FAVICON_BRAND_ONLY === '1';
const sites = brandOnly ? [] : requestedNames.size
  ? matrixSites.filter(({ name }) => requestedNames.has(name.toLowerCase()))
  : matrixSites;
if (sites.length === 0 && !brandOnly) {
  throw new Error(`BLANC_FAVICON_SITES matched no sites: ${[...requestedNames].join(', ')}`);
}

const matchesHost = (url, host) => {
  try {
    const actual = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return actual === host || actual.endsWith(`.${host}`);
  } catch {
    return false;
  }
};

const displayUrl = (url) => {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.href;
  } catch {
    return '<invalid URL>';
  }
};

const BATCH_SIZE = 5;
const BATCH_ATTEMPTS = 2;
const batches = [];
for (let index = 0; index < sites.length; index += BATCH_SIZE) {
  batches.push(sites.slice(index, index + BATCH_SIZE));
}

const runBatch = async (batch, batchIndex) => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-live-favicons-'));
  fs.writeFileSync(path.join(userDataDir, 'settings.json'), JSON.stringify({
    adblockEnabled: false,
    onboardingVersion: 1,
    searchSuggestions: false,
    usagePing: false,
  }, null, 2));

  let app;
  try {
    app = await launchPackagedOverCdp({
      executablePath,
      args: [`--user-data-dir=${userDataDir}`, ...batch.map(({ url }) => url)],
      env: { ...process.env, BLANC_TEST: '0' },
    });

    const readTabs = async () => {
      const chrome = app.pages().find((page) => page.url() === 'blanc-chrome://index/');
      return chrome ? chrome.evaluate(() => window.browserAPI.getAllTabs()) : null;
    };
    const deadline = Date.now() + 90_000;
    const passedAt = new Map();
    let state = null;
    while (Date.now() < deadline && passedAt.size < batch.length) {
      state = await readTabs();
      for (const site of batch) {
        const tab = state?.tabs?.find((candidate) => matchesHost(candidate.url, site.host));
        if (tab?.favicon?.startsWith('data:image/png;base64,')) passedAt.set(site.name, tab);
      }
      if (passedAt.size < batch.length) await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const failures = await Promise.all(batch.filter(({ name }) => !passedAt.has(name)).map(async (site) => {
      const tab = state?.tabs?.find((candidate) => matchesHost(candidate.url, site.host));
      const page = app.pages().find((candidate) => matchesHost(candidate.url(), site.host));
      const rawLinks = page ? await page.evaluate(() => [...document.querySelectorAll(
        'link[rel~="icon"], link[rel~="apple-touch-icon"]'
      )].slice(0, 20).map((link) => ({
        href: link.href,
        rel: link.rel,
        sizes: link.getAttribute('sizes') || '',
      }))) : [];
      const links = rawLinks.map((link) => ({ ...link, href: displayUrl(link.href) }));
      return {
        name: site.name,
        requested: site.url,
        tab: tab ? {
          title: tab.title,
          url: displayUrl(tab.url),
          isLoading: tab.isLoading,
          audible: tab.audible,
        } : null,
        links,
      };
    }));
    assert.deepEqual(
      failures,
      [],
      `live favicon failures in batch ${batchIndex + 1}: ${JSON.stringify(failures)}`
    );

    // Let Chromium's audio-state notification settle after the last favicon,
    // then prove that no hidden live-site can make sound during the batch.
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    state = await readTabs();
    const hiddenAudible = (state?.tabs ?? [])
      .filter((tab) => tab.id !== state.activeTabId && tab.audible)
      .map((tab) => ({ title: tab.title, url: displayUrl(tab.url) }));
    assert.deepEqual(
      hiddenAudible,
      [],
      `background tabs remained audible in batch ${batchIndex + 1}: ${JSON.stringify(hiddenAudible)}`
    );

    return batch.map(({ name }) => {
      const tab = passedAt.get(name);
      const bytes = Buffer.from(tab.favicon.split(',')[1], 'base64');
      assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG', name);
      assert.equal(bytes.readUInt32BE(16), 32, `${name} width`);
      assert.equal(bytes.readUInt32BE(20), 32, `${name} height`);
      assert.ok(bytes.length > 100, `${name} favicon should contain real pixels`);
      return { name, finalUrl: displayUrl(tab.url), pngBytes: bytes.length };
    });
  } finally {
    if (app) await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
};

// Availability alone is not enough for Blanc's own mark: the site declares a
// small multi-frame ICO before its SVG, which is the exact ordering that made
// 1.2.3 stop at soft, upscaled pixels. Compare the chrome payload with a fresh
// Chromium raster of the declared vector so this first-party quality contract
// stays deterministic even if the PNG encoder changes in a future Electron.
const runBrandQualityCanary = async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-brand-favicon-'));
  fs.writeFileSync(path.join(userDataDir, 'settings.json'), JSON.stringify({
    adblockEnabled: false,
    onboardingVersion: 1,
    searchSuggestions: false,
    usagePing: false,
  }, null, 2));

  let app;
  try {
    app = await launchPackagedOverCdp({
      executablePath,
      args: [`--user-data-dir=${userDataDir}`, 'https://blancbrowser.com/changelog'],
      env: { ...process.env, BLANC_TEST: '0' },
    });
    const deadline = Date.now() + 30_000;
    let expected = null;
    let actual = null;
    let matched = false;
    while (Date.now() < deadline && !matched) {
      const page = app.pages().find((candidate) => matchesHost(candidate.url(), 'blancbrowser.com'));
      const chrome = app.pages().find((candidate) => candidate.url() === 'blanc-chrome://index/');
      if (page && !expected) {
        expected = await page.evaluate(() => new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 32;
            canvas.height = 32;
            canvas.getContext('2d').drawImage(img, 0, 0, 32, 32);
            resolve(canvas.toDataURL('image/png'));
          };
          img.onerror = () => resolve(null);
          img.src = '/favicon.svg';
        }));
      }
      const state = chrome ? await chrome.evaluate(() => window.browserAPI.getAllTabs()) : null;
      actual = state?.tabs?.find((tab) => matchesHost(tab.url, 'blancbrowser.com'))?.favicon ?? null;
      matched = !!expected && actual === expected;
      if (!matched) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(expected?.startsWith('data:image/png;base64,'), 'Blanc SVG should rasterize in Chromium');
    assert.equal(actual, expected, 'Blanc chrome favicon must use the declared SVG pixels');
    const bytes = Buffer.from(actual.split(',')[1], 'base64');
    assert.equal(bytes.readUInt32BE(16), 32, 'Blanc favicon width');
    assert.equal(bytes.readUInt32BE(20), 32, 'Blanc favicon height');
    return { name: 'Blanc first-party quality canary', pngBytes: bytes.length };
  } finally {
    if (app) await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
};

const proof = [];
for (const [batchIndex, batch] of batches.entries()) {
  let result = null;
  let failure = null;
  for (let attempt = 1; attempt <= BATCH_ATTEMPTS; attempt += 1) {
    try {
      result = await runBatch(batch, batchIndex);
      failure = null;
      break;
    } catch (error) {
      failure = error;
      if (attempt < BATCH_ATTEMPTS) {
        console.warn(
          `Retrying live favicon batch ${batchIndex + 1}/${batches.length} after a cold-site failure (${attempt}/${BATCH_ATTEMPTS})`
        );
      }
    }
  }
  if (failure) throw failure;
  proof.push(...result);
}
const ranBrandCanary = brandOnly ||
  ((!matrixName || matrixName === 'primary') && requestedNames.size === 0);
if (ranBrandCanary) proof.push(await runBrandQualityCanary());
console.log(JSON.stringify(proof, null, 2));
console.log(
  `packaged-live-favicons-smoke OK: ${matrixName || 'all'} matrix, ${sites.length} sites in ${batches.length} cold batches` +
  (ranBrandCanary ? ' + Blanc vector-quality canary' : '')
);
