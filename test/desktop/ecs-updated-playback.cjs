'use strict';
const assert = require('node:assert/strict');
const { connect, targets, waitFor } = require('./ecs-local-html-smoke.cjs');
const { inspectLinuxCdm } = require('./ecs-linux-sandbox.cjs');
async function updatedPlayback(port, pid) {
  const chrome = await connect(await waitFor(async () => (await targets(port)).find(t => t.url === 'blanc-chrome://index/'), 'updated chrome'));
  let page;
  const evidence = { mediaErrors: [], players: {}, backend: 'Production' };
  try {
    await chrome.evaluate(() => window.browserAPI.createTab('https://castlabs.github.io/wv-vmp-lab/'));
    const target = await waitFor(async () => (await targets(port)).find(t => t.url.startsWith('https://castlabs.github.io/')), 'updated VMP Lab');
    page = await connect(target, message => {
      if (message.method === 'Media.playerErrorsRaised') for (const error of message.params.errors) evidence.mediaErrors.push({ code: error.code, type: error.errorType });
      if (message.method === 'Media.playerPropertiesChanged') {
        const properties = evidence.players[message.params.playerId] ||= {};
        for (const property of message.params.properties) if (/audio|video|decrypt|codec|key/i.test(property.name) && !/url|origin/i.test(property.name)) properties[property.name] = property.value;
      }
    });
    await page.send('Media.enable');
    await waitFor(() => page.evaluate(() => document.readyState === 'complete' && typeof document.querySelector('#loadContentBtn')?.onclick === 'function'), 'VMP initialized');
    await page.evaluate(() => {
      const select = document.querySelector('#backendSelect'); select.value = 'https://proxy.widevine.com/proxy';
      select.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('#loadContentBtn').click();
    });
    await waitFor(async () => {
      const text = await page.evaluate(() => document.body.innerText);
      if (/DRM\.FAILED_TO_CREATE_CDM/.test(text)) throw Error('Updated CDM failed');
      return /PLATFORM_[A-Z_]+/.test(text);
    }, 'updated production license');
    evidence.statuses = await page.evaluate(() => [...new Set(document.body.innerText.match(/PLATFORM_[A-Z_]+/g) || [])]);
    assert.ok(!evidence.statuses.includes('PLATFORM_TAMPERED'));
    await page.send('Runtime.evaluate', { expression: 'document.querySelector("video").play()', awaitPromise: true, userGesture: true, returnByValue: true });
    const sample = () => page.evaluate(() => ({ time: document.querySelector('video').currentTime, error: document.querySelector('video').error?.code ?? null, paused: document.querySelector('video').paused }));
    evidence.first = await sample(); await new Promise(resolve => setTimeout(resolve, 5000)); evidence.second = await sample();
    assert.equal(evidence.second.error, null); assert.equal(evidence.second.paused, false);
    assert.ok(evidence.second.time - evidence.first.time > 2 && evidence.second.time - evidence.first.time < 8);
    assert.deepEqual(evidence.mediaErrors, []);
    assert.ok(Object.values(evidence.players).some(player => /"encryption scheme":"(?:CENC|CBCS)"/.test(player.kVideoTracks || '')));
    evidence.cdmProcess = await inspectLinuxCdm(pid); evidence.passed = true;
    await page.send('Page.navigate', { url: 'about:blank' });
    return evidence;
  } finally { page?.close(); chrome.close(); }
}
module.exports = { updatedPlayback };
