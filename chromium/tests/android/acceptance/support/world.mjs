// Each scenario starts from a fresh Blanc (data cleared, launched on its Start Page) on the
// emulator, light mode, at 1080x1920 and density 320 so the grid and palette fit a scenario's
// tabs without scrolling (UI Automator sees only what's on screen).
import {After, AfterAll, Before, BeforeAll, setDefaultTimeout, setWorldConstructor} from '@cucumber/cucumber';
import {execFileSync} from 'node:child_process';
import {Device, adb, startFixtures} from './device.mjs';
import {fixtureUrl} from './parse.mjs';

setDefaultTimeout(180 * 1000);

let stopFixtures = null;

BeforeAll(function () {
  adb('shell', 'cmd', 'uimode', 'night', 'no');
  adb('shell', 'wm', 'size', '1080x1920');
  adb('shell', 'wm', 'density', '320');
  stopFixtures = startFixtures();
});

AfterAll(function () {
  if (stopFixtures) stopFixtures();
  adb('shell', 'wm', 'size', 'reset');
  adb('shell', 'wm', 'density', 'reset');
});

class AndroidWorld {
  constructor({attach}) {
    this.attach = attach;
    this.device = new Device();
    this.named = {};
  }

  url(name, pathname) { return fixtureUrl(name, pathname); }

  // Opens a named fixture site in a new tab and remembers it as `name`.
  async open(name, pathname = '/') {
    const url = this.url(name, pathname);
    await this.device.view(url);
    this.named[name] = url;
    return url;
  }
}

setWorldConstructor(AndroidWorld);

Before(async function () {
  await this.device.reset();
});

After(async function ({result}) {
  if (result?.status !== 'PASSED') {
    this.attach(execFileSync('adb', ['exec-out', 'screencap', '-p'], {maxBuffer: 64 * 1024 * 1024}), 'image/png');
  }
});
