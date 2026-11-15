// The approach swell (shipping v1.45.1's "Island proximity"): the resting
// pill rises and grows as the cursor approaches. The host runs shipping's own
// island-proximity.js; native forwards the page's moves near the Island
// (blanc/browser/ui/island_proximity.h, compiled here with the system C++
// compiler) and draws the swell on Chromium's extension buttons.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {generate} from './island-renderer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const record = JSON.parse(read('blanc/island-renderer.json'));
const shippingModule = {exports: {}};
vm.runInNewContext(execFileSync('git', ['show', `${record.ref}:src/main/island-proximity.js`], {cwd: root, encoding: 'utf8'}),
  {module: shippingModule});
const ship = shippingModule.exports;
const plain = value => JSON.parse(JSON.stringify(value));

test('the host runs shipping\'s proximity module unchanged', () => {
  const window = {};
  vm.runInNewContext(generate(record.ref)['island-proximity.js'], {window});
  const host = window.BlancIslandProximity;
  assert.deepEqual(plain(Object.keys(host)), plain(Object.keys(ship)));
  for (const name of ['RANGE', 'SETTLE', 'SCALE_AT_1', 'RISE_AT_1']) assert.equal(host[name], ship[name], name);
  const rect = {x: 300, y: 10, width: 400, height: 38};
  for (let x = -50; x <= 1050; x += 37) for (let y = -40; y <= 400; y += 23)
    assert.equal(host.closeness({x, y}, rect), ship.closeness({x, y}, rect), `${x},${y}`);
  assert.equal(host.closeness(null, rect), 0);
  assert.equal(host.closeness({x: 1, y: 1}, {x: 0, y: 0, width: 0, height: 0}), 0);
});

test('the host loads the module, serves it, and no longer flattens the swell', () => {
  const html = read('blanc/island/host.html');
  const at = name => html.indexOf(`<script src="${name}" defer></script>`);
  assert.ok(at('island-proximity.js') > 0 && at('island-proximity.js') < at('host.js'));
  assert.ok(read('blanc/island_resources/served.txt').split('\n').includes('island-proximity.js'));
  for (const file of ['prototype.css', 'host.css', 'extensions.css']) {
    const css = read(`blanc/island/${file}`).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(css, /proximity-active[^{]*\{[^}]*transform\s*:\s*none/, file);
  }
});

// ---- Native: compiled beside shipping's distanceToRect.
const HARNESS = `#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>
#include "blanc/browser/ui/island_proximity.h"
namespace p = blanc::island_proximity;
double D(const std::string& s) { return s == "NaN" ? NAN : s == "Infinity" ? INFINITY : s == "-Infinity" ? -INFINITY : std::stod(s); }
int main() { std::cout << std::setprecision(17); std::string line;
  while (std::getline(std::cin, line)) { std::istringstream in(line); std::string k, a, b, c, d, e, f, g; in >> k;
    if (k == "dist") { in >> a >> b >> c >> d >> e >> f; std::cout << p::DistanceToRect({D(a), D(b)}, {D(c), D(d), D(e), D(f)}); }
    else if (k == "move") { in >> a >> b >> c >> d >> e >> f >> g; std::string h; in >> h; bool near = a == "1";
      auto r = p::PageMove(near, b == "1", {D(c), D(d)}, {D(e), D(f), D(g), D(h)});
      std::cout << static_cast<int>(r) << " " << near; }
    else if (k == "swell") { in >> a >> b >> c; std::cout << p::ValidSwell(D(a), D(b), D(c)); }
    std::cout << "\\n"; } }
`;
function native(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-proximity-'));
  try {
    fs.writeFileSync(path.join(dir, 'main.cc'), HARNESS);
    execFileSync('c++', ['-std=c++20', '-I', root, path.join(dir, 'main.cc'), '-o', path.join(dir, 'proximity')]);
    return execFileSync(path.join(dir, 'proximity'), {input: lines.join('\n') + '\n', encoding: 'utf8'}).split('\n').slice(0, lines.length);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

test('native measures distance as shipping does, and forwards only near the Island', () => {
  const header = read('blanc/browser/ui/island_proximity.h');
  assert.match(header, new RegExp(`kRangePx = ${ship.RANGE};`));
  const rect = [300, 10, 400, 38];
  const points = [];
  for (let x = -50; x <= 1050; x += 61) for (let y = -40; y <= 400; y += 47) points.push([x, y]);
  const distances = native(points.map(([x, y]) => `dist ${x} ${y} ${rect.join(' ')}`));
  // Math.hypot and libm's hypot may differ in the last bit.
  points.forEach(([x, y], i) => assert.ok(Math.abs(Number(distances[i]) -
    ship.distanceToRect({x, y}, {x: rect[0], y: rect[1], width: rect[2], height: rect[3]})) < 1e-9, `${x},${y}`));

  // [wasNear, frameRunning, x, y] → [Forward, near after]: 0 none, 1 send, 2 park.
  const cases = [
    [[0, 0, 500, 30], [1, 1]],    // over the pill: send
    [[0, 1, 500, 30], [2, 1]],    // within a frame: park the newest
    [[0, 0, 500, 308], [1, 1]],   // 260px below the box: still near
    [[0, 0, 500, 309], [0, 0]],   // beyond reach, already far: nothing
    [[1, 0, 500, 309], [1, 0]],   // the first move out goes, so the pill rests
    [[1, 1, 500, 309], [2, 0]],
    [[1, 0, 'NaN', 30], [1, 0]],
  ];
  const out = native(cases.map(([[near, frame, x, y]]) => `move ${near} ${frame} ${x} ${y} ${rect.join(' ')}`));
  cases.forEach(([input, expected], i) => assert.deepEqual(out[i].split(' ').map(Number), expected, String(input)));
  // An Island not yet measured is never near.
  assert.equal(native([`move 0 0 1 1 0 0 0 0`])[0], '0 0');
});

test('native accepts only a swell the pill could draw', () => {
  const cases = [['1 0 0', '1'], ['1.02 -4.5 -2', '1'], ['1.05 64 -64', '1'], ['0.99 0 0', '0'], ['1.06 0 0', '0'],
    ['1 65 0', '0'], ['1 0 -65', '0'], ['NaN 0 0', '0'], ['1 Infinity 0', '0']];
  assert.deepEqual(native(cases.map(([args]) => `swell ${args}`)), cases.map(([, ok]) => ok));
});

test('native forwards page moves and draws the swell on the extension buttons', () => {
  const ui = read('blanc/browser/ui/blanc_prototype_ui.cc');
  const controller = read('blanc/browser/ui/island_proximity_controller.inc');
  assert.match(ui, /AutoHidePageMove\(this, event\);\n\s*IslandProximityPageMove\(this, event\);/);
  assert.match(ui, /#include "blanc\/browser\/ui\/island_proximity_controller.inc"/);
  assert.match(ui, /method == "extensionsSwell"[^]*?ValidSwell\(scale, dx, dy\)[^]*?SetExtensionsPillOffset\(owner, extensions\)/);
  assert.match(controller, /window\.blancIslandPointer\?\.\(%d,%d\)/);
  // A swell changed without a page move arms the next page move, wherever it lands.
  assert.match(ui, /method == "armIslandPointer" && args\.empty\(\)\) \{\n\s*ArmIslandPointer\(owner\);/);
  assert.match(controller, /void ArmIslandPointer\(Owner\* owner\) \{\n\s*owner->island_pointer_near = true;/);
  assert.match(host, /updateHover\(null\);\n[^]*?armPagePointer\(\);/);
  // The slide and the swell share one transform: neither may replace the other.
  assert.match(controller, /Translate\(owner->extensions_swell_dx, owner->extensions_pill_y \+ owner->extensions_swell_dy\)/);
  assert.equal((ui.match(/->SetTransform\(/g) ?? []).length, 0, 'only SetExtensionsPillOffset transforms the extension buttons');
});

// ---- The host's half, run from host.js.
const host = read('blanc/island/host.js');
const fn = name => host.match(new RegExp(`  (?:async )?function ${name}\\([^]*?\\n  \\}`))[0];

function hostHarness(snapshot = {windowActive: true, extensionsWidth: 0}) {
  const events = [], requests = [];
  const window = {};
  vm.runInNewContext(generate(record.ref)['island-proximity.js'], {window});
  const context = vm.createContext({
    Proximity: window.BlancIslandProximity, proximityK: 0, snapshot, opened: false, extensionsOpened: false, paneMenu: null,
    pillRect: {x: 300, y: 10, width: 400, height: 38, hoverCapable: true}, Number, Math, Promise,
    emit: (name, value) => events.push({name, value}), request: (method, args) => { requests.push({method, args}); return Promise.resolve(); },
    notice() {}, strip: {getBoundingClientRect: () => ({x: 0, y: 0})}, swellSent: '1,0,0',
  });
  vm.runInContext(['proximityAwake', 'updateProximity', 'wakeProximity', 'armPagePointer', 'restingRect', 'syncExtensionsSwell'].map(fn).join('\n'), context);
  vm.runInContext(host.match(/  window\.blancIslandPointer = [^]*?\n  \};/)[0].replace('window.blancIslandPointer', 'this.pointer'), context);
  return {context, events, requests};
}

test('the host sends the swell only when it changes, and rests it while asleep', () => {
  const {context: c, events} = hostHarness();
  c.updateProximity({x: 500, y: 600});
  assert.deepEqual(events, []);   // far away: still at rest, nothing said
  c.updateProximity({x: 500, y: 60});
  assert.deepEqual(plain(events), [{name: 'onIslandProximity', value: {k: 1}}]);
  c.updateProximity({x: 520, y: 70});
  assert.equal(events.length, 1);
  c.pointer(500, 200);            // a page move, in host coordinates
  assert.equal(events.at(-1).value.k, Number(ship.closeness({x: 500, y: 200}, c.pillRect).toFixed(3)));
  c.pointer(NaN, 4);
  assert.equal(events.length, 2);
  c.opened = true;                // something open over the pill: asleep
  c.updateProximity({x: 500, y: 30});
  assert.equal(events.at(-1).value.k, 0);
  c.opened = false;
  c.snapshot.windowActive = false;
  c.updateProximity({x: 500, y: 30});
  assert.equal(events.length, 3);
});

test('closing a surface always tells the pill where the cursor is, and arms native', () => {
  const {context: c, events, requests} = hostHarness();
  c.wakeProximity(null);          // no cursor over the window: rest
  assert.deepEqual(plain(events), [{name: 'onIslandProximity', value: {k: 0}}]);
  c.updateProximity({x: 500, y: 30});
  c.wakeProximity({x: 500, y: 30});
  assert.deepEqual(events.map(e => e.value.k), [0, 1, 1]);
  // Native hears each wake, so its next page move goes wherever it lands.
  assert.deepEqual(requests.map(r => r.method), ['armIslandPointer', 'armIslandPointer']);
});

function swellDom(k) {
  const classes = new Set(k > 0 ? ['proximity-active'] : []);
  const pill = {classList: {contains: n => classes.has(n), add: n => classes.add(n), remove: n => classes.delete(n)}};
  // A slot near the pill's right end: the swell grows it 2% and moves it
  // out from the pill's top centre (500) and up by the rise.
  const rest = {x: 650, y: 20, width: 26, height: 26};
  const slot = {getBoundingClientRect: () => !classes.has('proximity-active') ? rest
    : {x: 500 + (rest.x - 500) * (1 + 0.02 * k), y: rest.y - 2 * k + (rest.y - 10) * 0.02 * k, width: rest.width * (1 + 0.02 * k), height: rest.height * (1 + 0.02 * k)}};
  return {pill, slot, classes, doc: {getElementById: id => ({islandPill: pill, nativeExtensions: slot})[id]}};
}

test('the extension buttons get the slot\'s swell, only while there are some', () => {
  const {context: c, requests} = hostHarness({windowActive: true, extensionsWidth: 0});
  let dom = swellDom(1);
  c.strip.contentDocument = dom.doc;
  c.syncExtensionsSwell();
  assert.deepEqual(requests, []);   // no extension buttons: nothing to move
  c.snapshot.extensionsWidth = 52;
  c.syncExtensionsSwell();
  assert.deepEqual(plain(requests), [{method: 'extensionsSwell', args: [1.02, 3, -1.8]}]);
  assert.ok(dom.classes.has('proximity-active'), 'measuring the resting slot puts the swell back');
  c.syncExtensionsSwell();
  assert.equal(requests.length, 1);
  dom = swellDom(0);
  c.strip.contentDocument = dom.doc;
  c.syncExtensionsSwell();
  assert.deepEqual(plain(requests.at(-1)), {method: 'extensionsSwell', args: [1, 0, 0]});
});

test('the extension buttons are placed at the slot\'s resting place', () => {
  const geometry = fn('reportGeometry');
  assert.match(geometry, /const a = pill \? restingRect\(pill, slot\) : slot\.getBoundingClientRect\(\);/);
  assert.match(host, /observer\.observe\(pill, \{ attributes: true, attributeFilter: \['style', 'class'\] \}\)/);
  assert.match(fn('settleHover'), /watchSwell\(strip\.contentDocument\);/);
  assert.match(host, /hover\.lastPoint = \{[^\n]*\};\n\s*updateProximity\(hover\.lastPoint\);/);
  assert.match(fn('close'), /wakeProximity\(point\);\n\s*updateHover\(point, \{ sampled: true \}\);/);
});

// Blink repeats a document's last pointer position as a move when what lies
// under it changes, as the swell does; shipping's main never sees those.
test('the Island\'s own moves ignore a repeat of the last pointer position', () => {
  const hook = fn('hookHover');
  const listeners = {};
  const doc = {addEventListener: (type, listener) => { listeners[type] = listener; }, documentElement: {}};
  const seen = [];
  const context = vm.createContext({hoverHooked: new WeakSet(), hover: {}, strip: {getBoundingClientRect: () => ({x: 0, y: 0})},
    updateProximity: point => seen.push(['k', point.x]), updateHover: point => seen.push(['hover', point && point.x]), armPagePointer() {}});
  vm.runInContext(hook, context);
  context.hookHover(doc, null);
  const move = (x, y) => listeners.mousemove({clientX: x, clientY: y, screenX: x + 100, screenY: y + 100, buttons: 0});
  move(10, 20); move(10, 20); move(11, 20);
  assert.deepEqual(seen, [['k', 10], ['hover', 10], ['k', 11], ['hover', 11]]);
});
