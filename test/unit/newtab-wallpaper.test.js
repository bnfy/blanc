const test = require('node:test');
const assert = require('node:assert/strict');
const { phaseForTime, createController } = require('../../src/renderer/pages/newtab-wallpaper');
const tick = () => new Promise((resolve) => setImmediate(resolve));
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
  for (const [hour, minute, expected] of [[4,59,'night'],[5,0,'dawn'],[7,59,'dawn'],[8,0,'day'],[16,59,'day'],[17,0,'dusk'],[18,59,'dusk'],[19,0,'night'],[19,9,'night'],[0,0,'night']]) {
    assert.equal(phaseForTime(new Date(2026,9,1,hour,minute)), expected);
  }
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
  const reported = `const {phaseForTime} = require(${JSON.stringify(modulePath)}); process.stdout.write(phaseForTime(new Date('2026-10-01T23:09:00Z')));`;
  assert.equal(execFileSync(process.execPath, ['-e', reported], { env: { ...process.env, TZ: 'America/New_York' }, encoding: 'utf8' }), 'night');
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
