// Differential test: the native auto-hide policy (blanc/browser/ui/
// island_autohide.h), compiled with the system C++ compiler, must answer as
// shipping v1.45.1's src/main/island-autohide.js does for every input below,
// boundaries and non-finite values included.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHIPPING = '85883b1afa11375e1300130914d6f40c5388af21';
const module = {exports: {}};
vm.runInNewContext(execFileSync('git', ['show', `${SHIPPING}:src/main/island-autohide.js`], {cwd: root, encoding: 'utf8'}), {module});
const ship = module.exports;

// One request per line, numbers as JavaScript prints them (NaN, Infinity).
const HARNESS = `#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>
#include "blanc/browser/ui/island_autohide.h"
namespace a = blanc::island_autohide;
double D(const std::string& s) { return s == "NaN" ? NAN : s == "Infinity" ? INFINITY : s == "-Infinity" ? -INFINITY : std::stod(s); }
std::optional<a::Point> P(const std::vector<std::string>& v, size_t i) {
  if (v[i] == "-") return std::nullopt; return a::Point{D(v[i]), D(v[i + 1])}; }
int main() { std::cout << std::setprecision(17); std::string line;
  while (std::getline(std::cin, line)) { std::istringstream in(line); std::vector<std::string> v; std::string t;
    while (in >> t) v.push_back(t);
    const std::string& k = v[0];
    if (k == "hold") { a::HoldState s{v[3] == "1", D(v[4]), D(v[5]), D(v[6]), D(v[7]), D(v[8]), v[9] == "1"};
      std::cout << a::PointHoldsIsland(P(v, 1), s); }
    else if (k == "dwell") { std::optional<a::Dwell> d; if (v[1] != "-") d = a::Dwell{{D(v[1]), D(v[2])}, D(v[3])};
      auto r = a::RevealDwellStep(d, P(v, 4), D(v[6]), D(v[7]), D(v[8]), v[9] == "1");
      if (r.dwell) std::cout << r.dwell->anchor.x << " " << r.dwell->anchor.y << " " << r.dwell->since; else std::cout << "-";
      std::cout << " " << r.reveal; }
    else if (k == "reach") std::cout << a::ReachAboveWindow(D(v[1]), D(v[2]), D(v[3]));
    else if (k == "ease") std::cout << a::EaseOutCubic(D(v[1]));
    else if (k == "style") std::cout << a::NormalizeStyle(v.size() > 1 ? v[1] : "");
    else if (k == "delay") std::cout << a::HideCheckDelay(v[1] == "1");
    else if (k == "pinned") std::cout << a::IslandPinned(v[1] == "1", v[2] == "1", v[3] == "1");
    else if (k == "hidden") std::cout << a::StripHidden(v[1] == "1", v[2] == "1", v[3] == "1");
    else if (k == "floating") std::cout << a::FloatingLayout(v[1] == "1", v[2]);
    std::cout << "\\n"; } }
`;

function native(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-autohide-'));
  fs.writeFileSync(path.join(dir, 'main.cc'), HARNESS);
  execFileSync('c++', ['-std=c++20', '-I', root, path.join(dir, 'main.cc'), '-o', path.join(dir, 'autohide')]);
  const out = execFileSync(path.join(dir, 'autohide'), {input: lines.join('\n') + '\n', encoding: 'utf8'}).split('\n').slice(0, lines.length);
  fs.rmSync(dir, {recursive: true, force: true});
  return out;
}

const b = value => (value ? '1' : '0');
const num = value => String(value);
const close = (actual, expected, label) => {
  if (Number.isNaN(expected)) return assert.ok(Number.isNaN(Number(actual)), label);
  assert.ok(Math.abs(Number(actual) - expected) <= 1e-12 * Math.max(1, Math.abs(expected)), `${label}: ${actual} vs ${expected}`);
};

test('the native constants are shipping\'s', () => {
  const header = fs.readFileSync(path.join(root, 'blanc/browser/ui/island_autohide.h'), 'utf8');
  const constant = name => Number(new RegExp(`k${name} = ([0-9.]+);`).exec(header)?.[1]);
  for (const [js, cc] of [['REVEAL_EDGE_PX', 'RevealEdgePx'], ['REACH_ABOVE_PX', 'ReachAbovePx'], ['REVEAL_DWELL_BAND_PX', 'RevealDwellBandPx'],
    ['REVEAL_DWELL_MS', 'RevealDwellMs'], ['REVEAL_DWELL_DRIFT_PX', 'RevealDwellDriftPx'], ['REVEAL_WATCH_MS', 'RevealWatchMs'],
    ['HIDE_SLACK_PX', 'HideSlackPx'], ['HIDE_CHECK_MS', 'HideCheckMs'], ['FLOAT_HIDE_CHECK_MS', 'FloatHideCheckMs'],
    ['INTRO_MS', 'IntroMs'], ['SLIDE_IN_MS', 'SlideInMs'], ['SLIDE_OUT_MS', 'SlideOutMs']])
    assert.equal(constant(cc), ship[js], js);
  assert.deepEqual([...ship.AUTO_HIDE_STYLES], ['float', 'push']);
});

test('the native policy answers as shipping\'s does', () => {
  const lines = [], expected = [];
  const add = (line, value) => { lines.push(line); expected.push(value); };
  const xs = [NaN, -1, 0, 247, 248, 400, 1199, 1200, 1201, Infinity];
  const ys = [NaN, -Infinity, -120, -17, -16, -1, 0, 2, 10, 10.5, 30, 40, 41, 67, 68, 91, 92, 93, 400, 800, 801];
  const holds = [];
  for (const revealed of [false, true]) for (const floating of [false, true]) for (const reachAbove of [0, 16, 120, NaN, -5])
    for (const left of [0, 248, NaN]) for (const chromeHeight of [68, 0, -10])
      holds.push({revealed, floating, reachAbove, left, chromeHeight, width: 1200, height: 800});
  for (const s of holds) {
    add(`hold - - ${b(s.revealed)} ${num(s.chromeHeight)} 1200 800 ${num(s.reachAbove)} ${num(s.left)} ${b(s.floating)}`, String(+ship.pointHoldsIsland(null, s)));
    for (const x of xs) for (const y of ys)
      add(`hold ${num(x)} ${num(y)} ${b(s.revealed)} ${num(s.chromeHeight)} 1200 800 ${num(s.reachAbove)} ${num(s.left)} ${b(s.floating)}`,
        String(+ship.pointHoldsIsland({x, y}, s)));
  }
  const dwells = [null, {anchor: {x: 400, y: 30}, since: 1000}, {anchor: {x: 392, y: 22}, since: 1000}];
  for (const dwell of dwells) for (const floating of [false, true]) for (const left of [0, 248, NaN])
    for (const point of [null, {x: 400, y: 30}, {x: 408, y: 38}, {x: 409, y: 30}, {x: 400, y: 10}, {x: 400, y: 40}, {x: 400, y: 41},
      {x: 100, y: 30}, {x: 1200, y: 30}, {x: 1201, y: 30}, {x: NaN, y: 30}])
      for (const now of [1000, 1299, 1300, 5000]) {
        const r = ship.revealDwellStep(dwell, point, now, {width: 1200, left, floating});
        const d = dwell ? `${dwell.anchor.x} ${dwell.anchor.y} ${dwell.since}` : '- - -';
        const p = point ? `${num(point.x)} ${num(point.y)}` : '- -';
        add(`dwell ${d} ${p} ${now} 1200 ${num(left)} ${b(floating)}`,
          `${r.dwell ? `${r.dwell.anchor.x} ${r.dwell.anchor.y} ${r.dwell.since}` : '-'} ${+r.reveal}`);
      }
  for (const contentTop of [0, 25, 26, 27, 28, 200, NaN]) for (const workAreaTop of [0, 25, NaN]) for (const displayTop of [0, -900])
    add(`reach ${num(contentTop)} ${num(workAreaTop)} ${num(displayTop)}`, ship.reachAboveWindow({contentTop, workAreaTop, displayTop}));
  for (const t of [NaN, -1, 0, 0.25, 0.5, 0.999, 1, 2, Infinity, -Infinity]) add(`ease ${num(t)}`, ship.easeOutCubic(t));
  for (const value of ['float', 'push', 'Push', 'pushx', 'slide']) add(`style ${value}`, ship.normalizeAutoHideStyle(value));
  for (const floating of [false, true]) add(`delay ${b(floating)}`, String(ship.hideCheckDelay(floating)));
  for (const o of [false, true]) for (const p of [false, true]) for (const i of [false, true]) {
    add(`pinned ${b(o)} ${b(p)} ${b(i)}`, String(+ship.islandPinned({overlayMode: o ? 'panel' : null, popupOpen: p, introducing: i})));
    add(`hidden ${b(o)} ${b(p)} ${b(i)}`, String(+ship.stripHidden({autoHide: o, revealed: p, pinned: i})));
  }
  for (const autoHide of [false, true]) for (const style of ['float', 'push', 'other'])
    add(`floating ${b(autoHide)} ${style}`, String(+ship.floatingLayout({autoHide, style})));
  const out = native(lines);
  for (const [i, line] of lines.entries()) {
    if (typeof expected[i] === 'number') close(out[i], expected[i], line);
    else assert.equal(out[i], expected[i], line);
  }
});
