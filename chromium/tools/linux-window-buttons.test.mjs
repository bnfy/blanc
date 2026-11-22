// Exercise the actual host and strip documents with the native WebUI boundary mocked.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const assets = new URL('../blanc/island/', import.meta.url);
const width = 640;
let browser;
before(async () => {
  // The foundation runner ships Chrome. Developer machines may use Playwright's build.
  browser = await chromium.launch({ chromiumSandbox: true, ...(fs.existsSync(chromium.executablePath())
    ? { executablePath: chromium.executablePath() } : { channel: 'chrome' }) });
});
after(() => browser?.close());

async function openIsland(t, scale = 1, navigatorPlatform = 'Linux x86_64') {
  const page = await browser.newPage({ viewport: { width, height: 480 }, deviceScaleFactor: scale, reducedMotion: 'reduce' });
  t.after(() => page.close());
  await page.route('https://island.test/**', async route => {
    const name = new URL(route.request().url()).pathname.slice(1);
    const file = new URL(name, assets);
    if (!file.href.startsWith(assets.href) || !fs.existsSync(file)) return route.abort();
    await route.fulfill({ path: fileURLToPath(file) });
  });
  await page.addInitScript(navigatorPlatform => {
    Object.defineProperty(navigator, 'platform', { value: navigatorPlatform });
    window.nativeCalls = {};
    window.chrome.send = (_, [id, method, args]) => {
      window.nativeCalls[method] = args;
      let value = null;
      if (method === 'snapshot') value = { tabs: [], groups: [], splits: [], closed: [], extensionsWidth: 0,
        verticalTabsWidth: 248, tabLayout: window.nativeCalls.rail?.[0] ? 'vertical' : 'island', ...window.testSnapshot };
      if (method === 'rail') value = args[1];
      if (method === 'syncSurface') value = [];
      queueMicrotask(() => window.blancPrototypeReply(id, true, value));
    };
    if (['/index.html', '/overlay.html'].includes(location.pathname))
      window.browserAPI = parent.BlancPrototypeHost.apiForDocument(document);
  }, navigatorPlatform);
  await page.goto('https://island.test/host.html');
  const strip = page.frameLocator('#strip');
  await strip.locator('#mainMenuButton').waitFor({ state: 'visible', timeout: 5000 });
  return { page, strip };
}

function buttonLayout(layout, scale) {
  const [left, right] = layout.split(':').map(side => side.split(',').filter(Boolean));
  const makeButtons = (kinds, start) => kinds.map((kind, index) => ({
    kind, x: start + index * 32, y: 0, width: 32, height: 32
  }));
  return { deviceScaleFactor: scale, leading: left.length * 32, trailing: right.length * 32,
    buttons: [...makeButtons(left, 0), ...makeButtons(right, width - right.length * 32)] };
}

async function sendLayout(page, layout, scale = 1) {
  const data = buttonLayout(layout, scale);
  await page.evaluate(value => window.blancPrototypeEvent('windowButtons', value), data);
  return data;
}

for (const scale of [1, 2]) {
  for (const layout of ['close,minimize,maximize:', ':minimize,maximize,close', 'close:maximize', ':close']) {
    test(`strip reserves GTK layout ${layout} at ${scale}x`, async t => {
      const { page, strip } = await openIsland(t, scale);
      const data = await sendLayout(page, layout, scale);
      const boxes = await strip.locator('html').evaluate(root => {
        const style = getComputedStyle(root);
        const box = id => document.getElementById(id).getBoundingClientRect().toJSON();
        return { leading: style.getPropertyValue('--window-controls-leading-w'),
          trailing: style.getPropertyValue('--window-controls-w'),
          controls: getComputedStyle(document.getElementById('windowControls')).display,
          menu: box('mainMenuButton'), pill: box('islandPill'), scale: devicePixelRatio };
      });
      assert.equal(boxes.scale, scale);
      assert.equal(boxes.leading.trim(), data.leading + 'px');
      assert.equal(boxes.trailing.trim(), data.trailing + 'px');
      assert.equal(boxes.controls, 'none');
      assert.ok(boxes.menu.left >= data.leading && boxes.menu.width > 0);
      for (const box of [boxes.menu, boxes.pill]) {
        assert.ok(box.width > 0 && box.height > 0);
        for (const button of data.buttons)
          assert.ok(box.right <= button.x || box.left >= button.x + button.width ||
            box.top >= button.y + button.height || box.bottom <= button.y);
      }
    });
  }
}

test('the expanded address row clears GTK buttons as the layout changes', async t => {
  const { page } = await openIsland(t);
  const panel = page.frameLocator('#overlay').locator('#islandPanel');
  const input = panel.locator('#addressInput');
  await sendLayout(page, 'close,minimize,maximize:');
  await page.evaluate(() => window.BlancPrototypeHost.open());
  await input.fill('keep this text');
  const left = await panel.boundingBox();
  assert.ok(left.width > 0 && left.x >= 96, JSON.stringify(left));

  // Change to a narrower cluster on the other side while the user is typing.
  await sendLayout(page, ':minimize,close');
  const right = await panel.boundingBox();
  assert.ok(right.width > left.width && right.x + right.width <= width - 64, JSON.stringify(right));
  assert.equal(await input.inputValue(), 'keep this text');
  await sendLayout(page, ':');
  assert.ok((await panel.boundingBox()).width > right.width);

  await page.evaluate(() => window.BlancPrototypeHost.api.setTabLayout('vertical'));
  const inRailLayout = await panel.boundingBox();
  await sendLayout(page, 'close,minimize,maximize:');
  assert.ok(inRailLayout.x >= 96);
  assert.deepEqual(await panel.boundingBox(), inRailLayout, 'the rail already clears the leading cluster');
});

test('strip, float and open panel update GTK clearances after a WebUI zoom change', async t => {
  const scale = 2;
  const { page, strip } = await openIsland(t, scale);
  await sendLayout(page, 'close,minimize:maximize', scale);
  await page.evaluate(() => window.BlancPrototypeHost.open());
  const client = await page.context().newCDPSession(page);
  // Match the layout viewport and CSS pixel ratio of a 640-DIP WebUI at 75%.
  // The native GTK rectangles and compositor scale stay fixed.
  const zoom = 0.75;
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: Math.round(width / zoom), height: 640, deviceScaleFactor: scale * zoom, mobile: false
  });
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  for (const frame of [strip, page.frameLocator('#floatPill')]) {
    const css = await frame.locator('html').evaluate(root => {
      const style = getComputedStyle(root);
      return ['--window-controls-leading-w', '--window-controls-w', '--window-controls-leading-h']
        .map(name => parseFloat(style.getPropertyValue(name)));
    });
    for (const [i, dip] of [64, 32, 32].entries())
      assert.ok(Math.abs(css[i] * zoom - dip) < 0.01, JSON.stringify(css));
  }
  const panel = page.frameLocator('#overlay').locator('#islandPanel');
  const clearance = await panel.evaluate(el =>
    parseFloat(getComputedStyle(el).getPropertyValue('--panel-side-clear')));
  assert.ok(clearance * zoom >= 64, String(clearance));
  const band = await strip.locator('#dragBand').evaluate(el => parseFloat(getComputedStyle(el).height));
  assert.equal(band * zoom, 6);

  await page.evaluate(() => window.BlancPrototypeHost.escape());
  const menuButton = strip.locator('#mainMenuButton');
  const menu = await menuButton.boundingBox();
  assert.ok(menu.x * zoom >= 64 && menu.width > 0, JSON.stringify(menu));
  const menuDips = [menu.x, menu.y, menu.width, menu.height].map(n => Math.round(n * zoom));
  assert.deepEqual(await page.evaluate(() => window.nativeCalls.menuButtonBounds), menuDips);
  await menuButton.click();
  assert.deepEqual(await page.evaluate(() => window.nativeCalls.openMainMenu),
    [menuDips[0], Math.round((menu.y + menu.height) * zoom)]);
});

test('the Linux auto-hide drag band ends before page row six', async t => {
  const { page, strip } = await openIsland(t);
  const expected = await page.evaluate(() => window.BlancIslandAutoHide.dragBandHeight('linux'));
  const height = await strip.locator('#dragBand').evaluate(el => getComputedStyle(el).height);
  assert.equal(expected, 6);
  assert.equal(height, expected + 'px');
});

test('the 125% rail panel fits its footer and clears the caption cluster', async t => {
  const { page } = await openIsland(t);
  await sendLayout(page, ':minimize,maximize,close');
  await page.evaluate(() => window.BlancPrototypeHost.api.setTabLayout('vertical'));
  const cdp = await page.context().newCDPSession(page);
  // 632x476 client DIPs at 125%, with the same 248-CSS-pixel rail.
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 506, height: 381, deviceScaleFactor: 1.25, mobile: false
  });
  await page.evaluate(() => window.BlancPrototypeHost.open());
  const panel = page.frameLocator('#overlay').locator('#islandPanel');
  await panel.locator('#footerNewTab').waitFor();
  const box = await panel.boundingBox();
  assert.ok(box.y >= 32 / 1.25 || box.x + box.width <= (632 - 96) / 1.25, JSON.stringify(box));
  const overflow = await panel.evaluate(el => {
    const footer = el.querySelector('#islandFooter').getBoundingClientRect();
    return [...el.querySelectorAll('#islandFooter button:not([hidden])')]
      .map(b => ({id:b.id, box:b.getBoundingClientRect()}))
      .filter(({box}) => box.left < footer.left - 1 || box.right > footer.right + 1 ||
        box.bottom > footer.bottom + 1 || box.bottom > innerHeight + 1).map(b => b.id);
  });
  assert.deepEqual(overflow, []);
});

test('the minimum-width rail pill holds its visible actions beside GTK controls', async t => {
  const { page, strip } = await openIsland(t);
  await sendLayout(page, ':minimize,maximize,close');
  await page.evaluate(() => window.BlancPrototypeHost.api.setTabLayout('vertical'));
  await page.evaluate(async () => {
    window.testSnapshot = {extensionsWidth: 30, activeTabId:'1', groups:[{id:'a',name:'minimum-window-group-label'}],
      tabs:[{id:'1',url:'https://example.test/',title:'Example',groupId:'a'}]};
    await window.BlancPrototypeHost.refresh();
  });
  const pill = strip.locator('html[data-tab-layout="vertical"] #islandPill');
  const info = await pill.evaluate(el => {
    return {left:el.getBoundingClientRect().left, right:el.getBoundingClientRect().right,
      width:el.clientWidth, content:el.scrollWidth, classes:el.className,
      children:[...el.children].filter(n => n.offsetWidth).map(n => [n.id,n.offsetWidth,n.offsetLeft])};
  });
  assert.ok(info.left >= 248 && info.right <= width - 96, JSON.stringify(info));
  assert.ok(info.width + 1 >= info.content, JSON.stringify(info));
  await page.setViewportSize({width:1000,height:700});
  const wide = await pill.boundingBox();
  assert.ok(Math.abs(wide.x + wide.width / 2 - (248 + 752 / 2)) <= 1, JSON.stringify(wide));
});

test('the floating rail pill and extension slot match the resting strip in window coordinates', async t => {
  const { page, strip } = await openIsland(t);
  await sendLayout(page, ':minimize,maximize,close');
  await page.evaluate(async () => {
    await window.BlancPrototypeHost.api.setTabLayout('vertical');
    window.testSnapshot = {activeTabId:'1',tabs:[{id:'1',url:'https://example.test/',title:'Example'}],
      extensionsWidth:60,islandAutoHide:{enabled:true,style:'float',floating:true,stripHidden:false}};
    await window.BlancPrototypeHost.refresh();
  });
  const copy = page.frameLocator('#floatPill');
  await copy.locator('html.float-shown[data-tab-layout="vertical"]').waitFor();
  for (const id of ['islandPill','nativeExtensions']) {
    const resting = await strip.locator('#' + id).boundingBox();
    const floating = await copy.locator('#' + id).boundingBox();
    assert.ok(resting.width > 0);
    for (const key of ['x','y','width','height'])
      assert.ok(Math.abs(resting[key] - floating[key]) <= 1,
        JSON.stringify({id,key,resting,floating}));
  }
});

test('the first animated rail panel open after narrowing starts below the GTK controls', async t => {
  const { page } = await openIsland(t);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.setViewportSize({width:1000,height:480});
  await sendLayout(page, ':minimize,maximize,close');
  await page.evaluate(() => window.BlancPrototypeHost.api.setTabLayout('vertical'));
  await page.setViewportSize({width,height:480});
  const opening = await page.evaluate(async () => {
    const overlay = document.getElementById('overlay');
    const doc = overlay.contentDocument;
    const panel = doc.getElementById('islandPanel');
    let target;
    const measure = panel.getBoundingClientRect.bind(panel);
    panel.getBoundingClientRect = () => {
      const box = measure();
      if (box.width && !panel.style.width) target ??= {width:box.width, top:box.top};
      return box;
    };
    // Deliver the host's opening frame before any incidental strip geometry
    // callback. The overlay iframe still runs its real animation frames.
    const scheduleFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = callback => { callback(performance.now()); return 0; };
    try {
      await window.BlancPrototypeHost.open();
    } finally {
      window.requestAnimationFrame = scheduleFrame;
      delete panel.getBoundingClientRect;
    }
    return {target,animating:panel.classList.contains('morph-start')};
  });
  assert.equal(opening.animating, true);
  const panel = page.frameLocator('#overlay').locator('#islandPanel:not(.morph-start):not(.morph-run)');
  const settled = await panel.evaluate(el => {
    const {width,top} = el.getBoundingClientRect();
    return {width,top};
  });
  assert.ok(settled.top >= 32);
  assert.deepEqual(opening.target, settled);
});

// Linux and Windows both publish the woken tab awake and still loading first.
for (const [os, navigatorPlatform] of [['Linux', 'Linux x86_64'], ['Windows', 'Win32']])
test(`${os}: a chosen quiet Glance row keeps Opening through the first awake, loading snapshot`, async t => {
  const { page } = await openIsland(t, 1, navigatorPlatform);
  await page.evaluate(async () => {
    const send = chrome.send;
    const main = {id:'1',title:'main',url:'https://main.test/'};
    const reference = {id:'2',title:'reference',url:'https://ref.test/',asleep:true};
    chrome.send = (name, [id,method,args]) => {
      if (method === 'wakeTab') Object.assign(reference,{asleep:false,isLoading:true});
      if (method === 'snapshot') {
        queueMicrotask(() => window.blancPrototypeReply(id,true,{
          tabs:[{...main},{...reference}],activeTabId:'1',groups:[],closed:[],splits:[],extensionsWidth:0
        }));
      } else send(name,[id,method,args]);
    };
    await window.BlancPrototypeHost.refresh();
    await window.BlancPrototypeHost.api.openGlancePicker('');
  });
  const overlay = page.frameLocator('#overlay');
  await overlay.locator('#glance-picker-option-2').click();
  const row = overlay.locator('#glance-picker-option-2:not(.quiet)');
  await row.waitFor();
  assert.equal(await row.locator('.glance-picker-option-sub').textContent(), 'Opening…');
  assert.equal(await overlay.locator('#glancePickerLive').textContent(), 'Opening…');
});
