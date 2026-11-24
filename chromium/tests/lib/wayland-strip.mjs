import assert from 'node:assert/strict';

// CSS pixels and button DIPs coincide at the resting strip's 100% zoom.
// Weston captures framebuffer pixels, at the scale advertised to Chromium.
export function measureWaylandStrip({ data, info }, { width, height, scale, payload }) {
  const marker = (x, y) => {
    const at = (y * info.width + x) * info.channels;
    return Math.abs(data[at] - 16) < 6 && Math.abs(data[at + 1] - 240) < 6 && Math.abs(data[at + 2] - 123) < 6;
  };
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (!marker(x, y)) continue;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) return null; // Weston may still be presenting the unmarked frame.
  const bounds = { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  assert.ok(bounds.width === width * scale && bounds.height === height * scale,
    `Expected the full ${width * scale}×${height * scale} strip on the ${info.width}×${info.height} output, ` +
    `saw ${bounds.width}×${bounds.height} marker pixels at (${x0}, ${y0})`);

  const ink = {};
  for (const b of payload.buttons) {
    let count = 0;
    for (let y = Math.ceil(y0 + (b.y + b.height * .2) * scale); y < y0 + (b.y + b.height * .8) * scale; y++) {
      for (let x = Math.ceil(x0 + (b.x + b.width * .2) * scale); x < x0 + (b.x + b.width * .8) * scale; x++) {
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1 && !marker(x, y)) count++;
      }
    }
    assert.ok(count >= 3, b.kind + ' must paint above the WebUI');
    ink[b.kind] = count;
  }
  return { bounds, ratio: scale, ink };
}
