import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { measureWaylandStrip } from './lib/wayland-strip.mjs';

// Run 44948958941, frame-wayland/layout-1-1x.png. The fixture is the lossless
// strip crop at (1899, 256); the button rectangles are from its frame.json.
const strip = fileURLToPath(new URL('./fixtures/wayland-strip-1x.png', import.meta.url));
const state = {
  width: 868, height: 68, scale: 1,
  payload: { buttons: [
    { kind: 'minimize', x: 32, y: 0, width: 32, height: 40 },
    { kind: 'maximize', x: 64, y: 0, width: 32, height: 40 },
    { kind: 'close', x: 0, y: 0, width: 32, height: 40 }
  ] }
};

function framebuffer(layers) {
  return sharp({ create: { width: 2800, height: 1600, channels: 3, background: '#777' } })
    .composite(layers).removeAlpha().raw().toBuffer({ resolveWithObject: true });
}

test('measures the captured strip and native button ink at its Weston placement', async () => {
  const pixels = await framebuffer([{ input: strip, left: 1899, top: 256 }]);
  assert.deepEqual(measureWaylandStrip(pixels, state), {
    bounds: { x: 1899, y: 256, width: 868, height: 68 }, ratio: 1,
    ink: { minimize: 22, maximize: 76, close: 49 }
  });
});

test('rejects the same strip moved one pixel off the right edge', async () => {
  const pixels = await framebuffer([{ input: strip, left: 1933, top: 256 }]);
  assert.throws(() => measureWaylandStrip(pixels, state), /saw 867×68 marker pixels at \(1933, 256\)/);
});

test('rejects proportional clipping that preserves the strip aspect ratio', async () => {
  const pixels = await framebuffer([{ input: strip, left: 2366, top: 1566 }]);
  assert.throws(() => measureWaylandStrip(pixels, state), /saw 434×34 marker pixels/);
});

test('uses the 2× output scale for both dimensions and caption buttons', async () => {
  const doubled = await sharp(strip).resize(1736, 136, { kernel: 'nearest' }).png().toBuffer();
  const pixels = await framebuffer([{ input: doubled, left: 216, top: 122 }]);
  const measured = measureWaylandStrip(pixels, { ...state, scale: 2 });
  assert.deepEqual(measured.bounds, { x: 216, y: 122, width: 1736, height: 136 });
  assert.deepEqual(measured.ink, { minimize: 88, maximize: 304, close: 196 });
});

test('an unpainted capture supplies no strip measurement', async () => {
  assert.equal(measureWaylandStrip(await framebuffer([]), state), null);
});
