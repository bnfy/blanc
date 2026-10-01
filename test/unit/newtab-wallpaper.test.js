const test = require('node:test');
const assert = require('node:assert/strict');
const { phaseForTime, createController } = require('../../src/renderer/pages/newtab-wallpaper');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const solar = require('../../src/renderer/pages/suncalc');
const ny = { latitude: 40.71427, longitude: -74.00597 };
function fixture(loader = async () => {}) {
  let date = new Date(2026, 9, 1, 7, 59, 30), visible = true, motion = false;
  const timers = new Map(), frames = [], transitions = [];
  let id = 0;
  const controller = createController({ now: () => date, isVisible: () => visible,
    reducedMotion: () => motion, loadImage: loader, render: (frame, transition) => { frames.push(frame); transitions.push(transition); },
    schedule: (fn, delay) => { timers.set(++id, { fn, delay }); return id; },
    cancel: (key) => timers.delete(key),
  });
  return { controller, timers, frames, transitions,
    time(value) { date = value; }, visible(value) { visible = value; }, motion(value) { motion = value; } };
}
test('local periods include every boundary and wrap across midnight', () => {
  for (const [hour, minute, expected] of [[4,59,'night'],[5,0,'dawn'],[7,59,'dawn'],[8,0,'day'],[16,59,'day'],[17,0,'dusk'],[19,59,'dusk'],[20,0,'night'],[0,0,'night']]) {
    assert.equal(phaseForTime(new Date(2026,9,1,hour,minute)), expected);
  }
});
test('chosen city switches to night at sunset, including the reported NY screenshot', () => {
  const date = new Date('2026-10-01T23:09:00Z');
  const times = solar.getTimes(date, ny.latitude, ny.longitude);
  assert.ok(times.sunset >= new Date('2026-10-01T22:35:00Z') && times.sunset <= new Date('2026-10-01T22:45:00Z'));
  for (const [boundary, before, after] of [[times.dawn, 'night', 'dawn'], [times.goldenHourEnd, 'dawn', 'day'], [times.goldenHour, 'day', 'dusk'], [times.sunset, 'dusk', 'night']]) {
    assert.equal(phaseForTime(new Date(boundary.getTime() - 1), ny), before);
    assert.equal(phaseForTime(boundary, ny), after);
  }
  assert.equal(phaseForTime(date, ny), 'night');
  assert.equal(phaseForTime(new Date('2026-07-01T00:09:00Z'), ny), 'dusk', 'summer sunset remains later than 8 PM');
  assert.equal(phaseForTime(new Date('2026-12-01T22:09:00Z'), ny), 'night', 'winter night can begin before 8 PM');
});
test('polar day/night and invalid city data remain deterministic', () => {
  const tromso = { latitude: 69.6492, longitude: 18.9553 };
  assert.equal(phaseForTime(new Date('2026-06-21T23:00:00Z'), tromso), 'day');
  assert.equal(phaseForTime(new Date('2026-12-21T12:00:00Z'), tromso), 'night');
  const date = new Date(2026, 9, 1, 19, 9);
  for (const bad of [null, {}, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: Infinity }, { latitude: '40', longitude: -74 }]) assert.equal(phaseForTime(date, bad), 'dusk');
});
test('changing chosen city refreshes a visible wallpaper without re-enabling it', async () => {
  const f = fixture();
  f.time(new Date('2026-10-01T23:09:00Z'));
  f.controller.setLocation(ny);
  f.controller.setEnabled(true); await tick();
  assert.equal(f.frames.at(-1).phase, 'night');
  f.controller.setLocation({ latitude: 34.0522, longitude: -118.2437 }); await tick();
  assert.equal(f.frames.at(-1).phase, 'day');
  assert.equal(f.frames.at(-1).animate, true);
  assert.equal(f.timers.size, 1);
});
test('visible minutes recheck local time, clock jumps and resume; hidden tabs have no timer', async () => {
  const f = fixture(); f.controller.setEnabled(true); await tick();
  assert.equal(f.frames.at(-1).phase, 'dawn');
  assert.equal([...f.timers.values()][0].delay, 30_000);
  f.time(new Date(2026,9,1,8)); [...f.timers.values()][0].fn(); await tick();
  assert.equal(f.frames.at(-1).phase, 'day'); assert.equal(f.frames.at(-1).animate, true);
  f.visible(false); f.controller.visibilityChanged(); assert.equal(f.timers.size, 0);
  f.time(new Date(2026,9,1,23)); f.visible(true); f.motion(true); f.controller.visibilityChanged(); await tick();
  assert.equal(f.frames.at(-1).phase, 'night'); assert.equal(f.frames.at(-1).animate, false);
  f.time(new Date(2026,9,1,6)); f.controller.refresh(); await tick();
  assert.equal(f.frames.at(-1).phase, 'dawn');
  f.controller.dispose(); assert.equal(f.timers.size, 0);
});
test('missing artwork falls back to static and can recover on the next minute', async () => {
  let fail = true;
  const f = fixture(async () => { if (fail) throw Error('missing'); });
  f.controller.setEnabled(true); await tick(); assert.equal(f.frames.at(-1), null);
  fail = false; [...f.timers.values()][0].fn(); await tick(); assert.equal(f.frames.at(-1).phase, 'dawn');
});
test('turning off or hiding cancels stale loading completions', async () => {
  let complete;
  const f = fixture(() => new Promise((resolve) => { complete = resolve; }));
  f.controller.setEnabled(true); await tick();
  f.controller.setEnabled(false); complete(); await tick();
  assert.equal(f.frames.at(-1), null); assert.equal(f.timers.size, 0);
  f.controller.setEnabled(true); await tick(); f.visible(false); f.controller.visibilityChanged(); complete(); await tick();
  assert.equal(f.frames.at(-1), null); assert.equal(f.timers.size, 0);
});


test('phase follows a changed local timezone for the same instant', () => {
  const { execFileSync } = require('node:child_process');
  const modulePath = require.resolve('../../src/renderer/pages/newtab-wallpaper');
  const script = `const {phaseForTime} = require(${JSON.stringify(modulePath)}); process.stdout.write(phaseForTime(new Date('2026-10-01T12:00:00Z')));`;
  const phase = (TZ) => execFileSync(process.execPath, ['-e', script], { env: { ...process.env, TZ }, encoding: 'utf8' });
  assert.equal(phase('Etc/UTC'), 'day');
  assert.equal(phase('America/Los_Angeles'), 'dawn');
  assert.equal(phase('Asia/Tokyo'), 'night');
});

test('preference changes fade both ways while repeated status preserves the off fade', async () => {
  const f = fixture();
  f.controller.setEnabled(false);
  f.controller.setEnabled(true); await tick();
  assert.equal(f.frames.at(-1).animate, true, 'enabling after initial opt-out fades from static');
  f.controller.setEnabled(false);
  assert.equal(f.frames.at(-1), null);
  assert.deepEqual(f.transitions.at(-1), { animate: true }, 'disabling fades to static');
  assert.equal(f.timers.size, 0, 'off immediately cancels the minute timer');
  const count = f.frames.length;
  f.controller.setEnabled(false);
  assert.equal(f.frames.length, count, 'an unchanged status does not reset the fade');
  f.controller.setEnabled(true); await tick();
  assert.equal(f.frames.at(-1).animate, true);
});

test('initial load, reduced motion and hidden preference changes switch immediately', async () => {
  const f = fixture();
  f.controller.setEnabled(true); await tick();
  assert.equal(f.frames.at(-1).animate, false, 'initial saved opt-in loads immediately');
  f.motion(true); f.controller.setEnabled(false);
  assert.deepEqual(f.transitions.at(-1), { animate: false });
  f.controller.setEnabled(true); await tick();
  assert.equal(f.frames.at(-1).animate, false);
  f.motion(false); f.visible(false); f.controller.setEnabled(false);
  assert.deepEqual(f.transitions.at(-1), { animate: false });
  f.controller.setEnabled(true); await tick();
  assert.equal(f.timers.size, 0);
  f.visible(true); f.controller.visibilityChanged(); await tick();
  assert.equal(f.frames.at(-1).animate, false);
});
