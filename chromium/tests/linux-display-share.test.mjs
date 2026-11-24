import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import YAML from 'yaml';
import {CASES, FALLBACK_SEQUENCES, PLANS, TARGET_HANDLE, displayMediaOptions, expectedShareRow, newWindows,
  pageHtml, parseXwininfo, pickerKey, reportPassed, screenPoint} from './linux-display-share.mjs';

const picker = (focus, enabled) => ({found: true, focus, share: {role: 'push button', name: 'Share', enabled}});
const row = name => ({role: 'table row', name});

test('each case asks for its own pane and leaves the sharing tab out of the tab list', () => {
  assert.deepEqual(Object.keys(CASES), ['tab', 'screen']);
  assert.deepEqual(displayMediaOptions(CASES.tab.displaySurface).video, {displaySurface: 'browser'});
  assert.deepEqual(displayMediaOptions(CASES.screen.displaySurface).video, {displaySurface: 'monitor'});
  for (const {displaySurface} of Object.values(CASES)) {
    const options = displayMediaOptions(displaySurface);
    assert.equal(options.audio, false);
    assert.equal(options.selfBrowserSurface, 'exclude');
    assert.equal(options.surfaceSwitching, 'exclude');
  }
  assert.deepEqual(Object.values(CASES).map(c => c.surfaceKind), ['tab', 'screen']);
});

test('guided keys select a source before Share and never send Return to Cancel', () => {
  assert.equal(pickerKey({found: false}), null);
  assert.equal(pickerKey({found: true, focus: null, share: null}), null, 'no Share button read: no guess');
  assert.equal(pickerKey(picker(null, false)), 'Tab');
  assert.equal(pickerKey(picker({role: 'page tab', name: 'Entire screen'}, false)), 'Tab');
  assert.equal(pickerKey(picker(row('Share target'), false)), 'Down');
  assert.equal(pickerKey(picker(row('Share target'), true)), 'Return');
  assert.equal(pickerKey(picker({role: 'push button', name: 'Cancel'}, true)), 'Tab');
  assert.equal(pickerKey(picker({role: 'push button', name: 'Cancel'}, false)), 'Tab');
  assert.equal(pickerKey(picker({role: 'push button', name: 'Share'}, true)), 'Return');
  assert.equal(pickerKey(picker({role: 'check box', name: 'Also share tab audio'}, true)), 'Tab');
  assert.equal(pickerKey(picker({role: 'page tab', name: 'Chrome tab'}, true)), 'Return');
});

test('guided keys try each selection key once at a focus, then move on', () => {
  const focus = row('Share target');
  const sent = [];
  for (const expected of ['Down', 'Home', 'Up', 'Tab']) {
    const key = pickerKey(picker(focus, false), sent);
    assert.equal(key, expected);
    sent.push({key, focus});
  }
  // A Tab in between starts the count again at that focus.
  assert.equal(pickerKey(picker(focus, false), sent), 'Down');
  const source = {role: 'push button', name: 'Entire screen'};
  assert.equal(pickerKey(picker(source, false), []), 'space');
  assert.equal(pickerKey(picker(source, false), [{key: 'space', focus: source}]), 'Tab');
  assert.equal(pickerKey(picker(source, true), [{key: 'space', focus: source}]), 'Tab');
});

test('the blind sequences end with Return and follow the guided plan', () => {
  assert.equal(PLANS[0], 'guided');
  assert.deepEqual(PLANS.slice(1), FALLBACK_SEQUENCES.map(keys => keys.join(',')));
  assert.ok(FALLBACK_SEQUENCES.every(keys => keys.at(-1) === 'Return' && keys.includes('Down')));
  assert.equal(new Set(PLANS).size, PLANS.length);
});

test('window, point and share-row helpers', () => {
  assert.deepEqual(newWindows(['1', '2'], ['2', '3', '1', '4']), ['3', '4']);
  assert.deepEqual(parseXwininfo(`
xwininfo: Window id: 0x1e00007 "Choose what to share"
  Absolute upper-left X:  640
  Absolute upper-left Y:  -2
  Width: 640
  Height: 480
  Map State: IsViewable
`), {x: 640, y: -2, width: 640, height: 480, mapState: 'IsViewable'});
  assert.deepEqual(screenPoint({x: 10, y: 20}, {x: 5.4, y: 7.6}), {x: 15, y: 28});
  assert.deepEqual(expectedShareRow('screen', 7, 'http://127.0.0.1:1'),
    {shareId: '7', pending: false, origin: 'http://127.0.0.1:1', surfaceLabel: null, surfaceKind: 'screen',
      computerAudio: false, tabId: '7'});
});

test('the pages: the target sets its capture handle, the sharer reports its track', () => {
  assert.match(pageHtml('/target'), /setCaptureHandleConfig/);
  assert.ok(pageHtml('/target').includes(JSON.stringify(TARGET_HANDLE)));
  const sharer = pageHtml('/sharer');
  for (const part of ['getDisplayMedia(options)', "addEventListener('ended'", 'getCaptureHandle', 'displaySurface'])
    assert.ok(sharer.includes(part), part);
  assert.ok(!pageHtml('/<script>').toLowerCase().includes('<script>'), 'a requested path never reaches the page as markup');
});

test('the report passes only with both cases, in order, passed', () => {
  assert.equal(reportPassed({cases: [{name: 'tab', passed: true}, {name: 'screen', passed: true}]}), true);
  assert.equal(reportPassed({cases: [{name: 'tab', passed: true}]}), false);
  assert.equal(reportPassed({cases: [{name: 'screen', passed: true}, {name: 'tab', passed: true}]}), false);
  assert.equal(reportPassed({cases: [{name: 'tab', passed: true}, {name: 'screen', passed: false}]}), false);
});

test('the picker probe only reads AT-SPI', () => {
  const probe = readFileSync(new URL('./lib/linux-media-picker.py', import.meta.url), 'utf8');
  assert.doesNotMatch(probe, /do_action|get_action_iface|grab_focus|get_extents|generate_(keyboard|mouse)_event/);
  assert.match(probe, /DOCUMENT_WEB/);
  const script = readFileSync(new URL('./linux-display-share.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(script, /pkill|killall|--auto-select|linux-download-exit/);
});

const workflow = YAML.parse(readFileSync(new URL('../../.github/workflows/chromium-linux-candidate.yml', import.meta.url), 'utf8'));

test('display-share runs the installed package as an ordinary user on X11 for one architecture', () => {
  assert.ok(workflow.on.workflow_dispatch.inputs.check.options.includes('display-share'));
  const job = workflow.jobs['display-share'];
  assert.match(job.if, /inputs\.check == 'display-share'/);
  assert.match(job['runs-on'], /ubuntu-24\.04-arm/);
  assert.match(job['runs-on'], /'ubuntu-24\.04'/);
  // The same verified-package steps as the keys job, in the same order.
  const names = steps => steps.map(step => step.name ?? step.uses);
  const keys = names(workflow.jobs.keys.steps);
  assert.deepEqual(names(job.steps).slice(0, 10), keys.slice(0, 10));
  const runs = job.steps.map(step => step.run ?? '').join('\n');
  assert.match(runs, /at-spi2-core python3-gi gir1\.2-atspi-2\.0 "\$QUIT_DEB"/);
  assert.match(runs, /--arg dir '\/opt\/bnfy\/blanc-prototype'/);
  assert.match(runs, /executableSha256:\$exe/);
  assert.doesNotMatch(runs, /blockerAssets|blanc-blocker-assets|sudo node|--no-sandbox/);
  const share = job.steps.find(step => step.run?.includes('node chromium/tests/linux-display-share.mjs'));
  assert.ok(share, 'the job runs the check');
  assert.equal(share.env.ACCESSIBILITY_ENABLED, '1');
  assert.match(share.run, /xvfb-run -a --server-args='-screen 0 1920x1080x24' dbus-run-session/);
  assert.match(share.run, /unset WAYLAND_DISPLAY/);
  assert.match(share.run, /XDG_SESSION_TYPE=x11/);
  assert.match(share.run, /openbox --sm-disable/);
  assert.match(share.run, /"\$RUNNER_TEMP\/display-share-config\.json" "\$RESULTS\/display-share"/);
  const upload = job.steps.at(-1);
  assert.equal(upload.if, 'always()');
  assert.match(upload.uses, /^actions\/upload-artifact@[0-9a-f]{40}/);
  assert.match(upload.with.name, /^chromium-linux-display-share-\$\{\{ inputs\.arch \}\}/);
});
