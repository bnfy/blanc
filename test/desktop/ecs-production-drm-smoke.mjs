// Fresh profile and the normal production entrypoint: no candidate bootstrap,
// test IPC, main inspector, personal account, or sandbox bypass.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { launchPackagedOverCdp } from './support/packaged-cdp.mjs';
const require = createRequire(import.meta.url);
const { waitFor, inspectCdmProcess } = require('./ecs-drm-playback-smoke.cjs');
const { browserStartupReady } = require('./support/ecs-startup.cjs');
const executable = process.env.BLANC_PACKAGED_EXECUTABLE;
assert(executable);
assert.equal(process.env.BLANC_UPDATE_CHANNEL, 'ecs-qualification-disabled');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ecs-production-drm-'));
const report = { platform: process.platform, arch: process.arch, passed: false, mediaErrors: [], players: {}, networkFailures: [] };
await fs.writeFile(path.join(root, 'settings.json'), JSON.stringify({ onboardingVersion: 1, usagePing: false, searchSuggestions: false }));
let app, playbackPage;
// Default-off app diagnostics (src/main/navigation-trace.js): one trace file
// per launch, read back into the report. Times share this machine's clock.
const traceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ecs-navigation-trace-'));
const traceFiles = [];
report.timeline = {};
const launch = () => {
  const trace = path.join(traceDir, `launch-${traceFiles.length + 1}.jsonl`);
  traceFiles.push(trace);
  return launchPackagedOverCdp({ executablePath: executable, launchViaOpen: process.platform === 'darwin',
    args: [`--user-data-dir=${root}`], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', BLANC_NAVIGATION_TRACE: trace,
      BLANC_NAVIGATION_TRACE_HOSTS: 'castlabs.github.io' }, timeoutMs: 30000 });
};
// Complete evidence: the app's trace-start marker is present, no line is
// malformed, the app did not hit its cap, and nothing retained was dropped.
const RETAINED = 200;
async function readTraces() {
  return Promise.all(traceFiles.map(async (file, index) => {
    const text = await fs.readFile(file, 'utf8').catch(() => null);
    if (text === null) return { launch: index + 1, active: false, complete: false };
    let malformedLines = 0;
    const events = text.split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { malformedLines += 1; return []; } });
    const started = events[0]?.event === 'trace-start';
    const capReached = events.some(event => event.event === 'trace-truncated');
    const relevant = events.filter(event => !/^trace-(start|truncated)$/.test(event.event));
    const retainedTruncated = relevant.length > RETAINED;
    return { launch: index + 1, active: started, complete: started && malformedLines === 0 && !capReached && !retainedTruncated,
      malformedLines, capReached, retainedTruncated, totalEvents: relevant.length, events: relevant.slice(0, RETAINED) };
  }));
}
function observeNetwork(context) {
  context.on('requestfailed', request => {
    let host; try { host = new URL(request.url()).hostname; } catch { return; }
    let redirects = 0; for (let previous = request.redirectedFrom(); previous; previous = previous.redirectedFrom()) redirects += 1;
    report.networkFailures.push({ host, error: request.failure()?.errorText, at: Date.now(), resourceType: request.resourceType(),
      navigation: request.isNavigationRequest(), redirects });
  });
  context.on('response', response => {
    if (response.status() >= 400) report.networkFailures.push({ host: new URL(response.url()).hostname, status: response.status() });
  });
}
try {
  report.stage = 'component-installation';
  app = await launch();
  observeNetwork(app.context);
  report.stage = 'browser-startup';
  // ECS downloads its actual component through normal startup. Linux must then
  // re-enter the native launcher to load that component before sandboxing.
  const installed = await waitFor(async () => {
    const versions = await fs.readdir(path.join(root, 'WidevineCdm')).catch(() => []);
    for (const version of versions.filter(v => /^\d+(?:\.\d+){3}$/.test(v))) {
      const manifest = await fs.readFile(path.join(root, 'WidevineCdm', version, 'manifest.json'), 'utf8').then(JSON.parse, () => null);
      if (manifest?.version === version) return version;
    }
    return null;
  }, 'actual Widevine component installation', 90000);
  report.installedVersion = installed;
  await app.close(); app = null;
  app = await launch();
  observeNetwork(app.context);
  const chrome = await waitFor(() => app.pages().find(p => p.url() === 'blanc-chrome://index/'), 'normal browser chrome');
  await chrome.waitForFunction(() => !!window.browserAPI);
  // The bridge exists before session restoration completes. A tab opened in
  // that gap can be replaced by startup restoration on a slower native host.
  await waitFor(() => browserStartupReady(app), 'completed browser startup');
  report.timeline.startupReadyAt = Date.now();
  report.stage = 'vmp-navigation';
  report.timeline.createTabAt = Date.now();
  await chrome.evaluate(() => window.browserAPI.createTab('https://castlabs.github.io/wv-vmp-lab/'));
  const page = await waitFor(() => {
    for (const p of app.pages()) {
      let url; try { url = new URL(p.url()); } catch { continue; }
      if (url.protocol === 'blanc:' && url.hostname === 'error' && url.searchParams.get('url') === 'https://castlabs.github.io/wv-vmp-lab/') {
        report.timeline.errorPageAt = Date.now();
        throw Error(`VMP navigation failed: ${url.searchParams.get('desc')} (${url.searchParams.get('code')})`);
      }
    }
    return app.pages().find(p => p.url().startsWith('https://castlabs.github.io/wv-vmp-lab/'));
  }, 'production VMP Lab');
  playbackPage = page;
  const media = await app.context.newCDPSession(page);
  media.on('Media.playerErrorsRaised', event => {
    for (const error of event.errors) report.mediaErrors.push({ code: error.code, type: error.errorType });
  });
  media.on('Media.playerPropertiesChanged', event => {
    const player = report.players[event.playerId] ||= {};
    for (const property of event.properties) {
      if (/audio|video|decrypt|codec|key/i.test(property.name) && !/url|origin/i.test(property.name)) player[property.name] = property.value;
    }
  });
  await media.send('Media.enable');
  report.stage = 'vmp-initialization';
  await page.waitForFunction(() => typeof document.querySelector('#loadContentBtn')?.onclick === 'function', undefined, { timeout: 60000 });
  await page.evaluate(() => {
    const backend = document.querySelector('#backendSelect'); backend.value = 'https://proxy.widevine.com/proxy';
    backend.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('#loadContentBtn').click();
  });
  const statuses = await waitFor(async () => {
    const text = await page.locator('body').innerText();
    if (text.includes('DRM.FAILED_TO_CREATE_CDM')) throw Error('Production Widevine CDM could not start');
    return /PLATFORM_[A-Z_]+/.test(text) && [...new Set(text.match(/PLATFORM_[A-Z_]+/g))];
  }, 'production VMP verification', 60000);
  report.statuses = statuses;
  report.stage = 'protected-playback';
  assert(!statuses.includes('PLATFORM_TAMPERED'));
  if (process.platform !== 'linux') assert(statuses.includes('PLATFORM_SOFTWARE_VERIFIED'), 'production VMP must verify');
  await page.locator('video').evaluate(video => video.play());
  const sample = () => page.locator('video').evaluate(video => ({ time: video.currentTime, paused: video.paused,
    error: video.error?.code ?? null, mediaKeys: !!video.mediaKeys, seeking: video.seeking,
    muted: video.muted, volume: video.volume,
    readyState: video.readyState, bufferedAhead: video.buffered.length ? video.buffered.end(video.buffered.length - 1) - video.currentTime : 0,
    decodedFrames: video.getVideoPlaybackQuality().totalVideoFrames, visibility: document.visibilityState }));
  const warmingAt = Date.now();
  await waitFor(async () => {
    const state = await sample();
    report.buffering = state;
    if (state.error) throw Error(`Media error during buffering: ${state.error}`);
    return state.readyState >= 3 && state.bufferedAhead >= 6;
  }, 'six seconds of protected playback buffered', 60000);
  report.bufferWarmupMs = Date.now() - warmingAt;
  report.first = await sample();
  await new Promise(resolve => setTimeout(resolve, 5000));
  report.second = await sample();
  assert.equal(report.first.muted, false);
  assert.equal(report.second.muted, false);
  assert(report.first.volume > 0 && report.second.volume > 0);
  assert.equal(report.second.paused, false);
  assert.equal(report.second.error, null);
  assert.equal(report.second.mediaKeys, true);
  assert.equal(report.second.seeking, false);
  assert(report.second.time - report.first.time > 2);
  assert.equal(report.mediaErrors.length, 0);
  assert(Object.values(report.players).some(p => /"encryption scheme":"(?:CENC|CBCS)"/.test(p.kVideoTracks || '')));
  const browserSession = await app.browser.newBrowserCDPSession();
  const { processInfo } = await browserSession.send('SystemInfo.getProcessInfo');
  const mainPid = processInfo.find(p => p.type === 'browser').id;
  if (process.platform !== 'win32') report.cdmSandbox = await inspectCdmProcess(mainPid,
    process.platform === 'darwin' ? path.resolve(path.dirname(executable), '../..') : path.dirname(executable));
  await browserSession.detach(); await media.detach();
  report.passed = true;
  report.stage = 'complete';
} catch (error) {
  report.failure = { name: error.name, message: error.message.slice(0, 300) };
  // These comparisons never convert the strict unmuted playback failure into
  // a pass. They separate native visibility and audio-clock problems from DRM.
  if (process.platform === 'darwin' && process.arch === 'x64' && playbackPage) {
    try {
      await playbackPage.bringToFront();
      const sample = () => playbackPage.locator('video').evaluate(video => ({
        time: video.currentTime, paused: video.paused, error: video.error?.code ?? null,
        muted: video.muted, visibility: document.visibilityState,
        decodedFrames: video.getVideoPlaybackQuality().totalVideoFrames,
      }));
      const first = await sample();
      await new Promise(resolve => setTimeout(resolve, 5000));
      report.focusedDiagnostic = { first, second: await sample() };
      await playbackPage.locator('video').evaluate(async video => { video.muted = true; await video.play(); });
      const mutedFirst = await sample();
      await new Promise(resolve => setTimeout(resolve, 5000));
      report.mutedDiagnostic = { first: mutedFirst, second: await sample() };
    } catch { report.comparisonUnavailable = true; }
  }
  if (process.platform === 'darwin' && process.env.GITHUB_ACTIONS === 'true') {
    try {
      const { execFileSync } = require('node:child_process');
      const audio = JSON.parse(execFileSync('system_profiler', ['SPAudioDataType', '-json'], { encoding: 'utf8', timeout: 15000 }));
      report.hostAudio = { containers: audio.SPAudioDataType?.length || 0,
        devices: (audio.SPAudioDataType || []).reduce((count, item) => count + (item._items?.length || 0), 0),
        capabilities: (audio.SPAudioDataType || []).flatMap(item => item._items || []).map(item =>
          Object.fromEntries(Object.entries(item).filter(([key]) => /default|output|input|sample_rate|transport/.test(key)))) };
    } catch { report.hostAudio = { unavailable: true }; }
  }
  report.pages = await Promise.all((app?.pages() || []).map(async page => {
    const url = new URL(page.url());
    return { page: `${url.protocol}//${url.hostname}${url.pathname}`, ...await page.evaluate(() => ({
      title: document.title, shakaType: typeof shaka,
      error: document.getElementById('errorDetail')?.textContent?.slice(0, 120),
      contentControl: !!document.getElementById('loadContentBtn'),
    })).catch(() => ({})) };
  }));
  throw error;
} finally {
  try { if (app) await app.close(); }
  catch (error) { report.passed = false; throw error; }
  finally {
    report.navigationTrace = await readTraces().catch(error => ({ unavailable: error.message.slice(0, 120) }));
    await fs.rm(traceDir, { recursive: true, force: true });
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    report.profileRemoved = !(await fs.stat(root).catch(() => null));
    await fs.mkdir('output/ecs-production', { recursive: true });
    await fs.writeFile(`output/ecs-production/drm-${process.platform}-${process.arch}.json`, JSON.stringify(report, null, 2));
  }
}
console.log(JSON.stringify(report));
