#!/usr/bin/env node
// Renders the media kit's black Sunrise mark from the full-color 4096 master,
// so the two downloads share one canvas, crop, and scale:
//   node site/scripts/render-sunrise-black-mark.mjs
// With --check it renders in memory and fails if the committed file has
// drifted from the master (test/unit/media-page.test.js runs this).
// Only true ivory connected to the canvas edge stays white; the gold, its dark
// insets, and its enclosed highlights all become ink, keeping soft outer edges.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sharp = createRequire(path.join(ROOT, 'package.json'))('sharp');
const SOURCE = path.join(ROOT, 'export/app-icons-1024-square/icon-sunrise-4096.png');
const OUTPUT = path.join(ROOT, 'site/public/press/blanc-sunrise-mark-black-4096.png');
const INK = 14;
(async () => {
  const src = SOURCE;
  const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H;
  const [r0, g0, b0] = [data[0], data[1], data[2]];
  const dist = new Uint8Array(N);
  for (let p = 0; p < N; p++) dist[p] = Math.max(Math.abs(data[3 * p] - r0), Math.abs(data[3 * p + 1] - g0), Math.abs(data[3 * p + 2] - b0));
  // Ground = true ivory reachable from the canvas edge; enclosed highlights are not ground.
  const ground = new Uint8Array(N); const stack = new Int32Array(N); let top = 0;
  const seed = (p) => { if (!ground[p] && dist[p] < 6) { ground[p] = 1; stack[top++] = p; } };
  for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
  while (top) { const p = stack[--top]; const x = p % W;
    if (x > 0) seed(p - 1); if (x < W - 1) seed(p + 1); if (p >= W) seed(p - W); if (p < N - W) seed(p + W); }
  // Distance (in px, up to 3) from the ground keeps anti-aliased outer edges.
  const near = new Uint8Array(N).fill(255);
  for (let p = 0; p < N; p++) if (ground[p]) near[p] = 0;
  for (let pass = 1; pass <= 3; pass++) for (let p = 0; p < N; p++) if (near[p] === 255) {
    const x = p % W;
    if ((x > 0 && near[p - 1] === pass - 1) || (x < W - 1 && near[p + 1] === pass - 1) || (p >= W && near[p - W] === pass - 1) || (p < N - W && near[p + W] === pass - 1)) near[p] = pass;
  }
  const out = Buffer.alloc(N * 3); const lo = 6, hi = 40;
  for (let p = 0; p < N; p++) {
    let t;
    if (ground[p]) t = 0;
    else if (near[p] <= 3) t = Math.min(1, Math.max(0, (dist[p] - lo) / (hi - lo)));
    else t = 1;
    const v = Math.round(255 + (INK - 255) * t);
    out[3 * p] = out[3 * p + 1] = out[3 * p + 2] = v;
  }
  if (process.argv.includes('--check')) {
    const committed = await sharp(OUTPUT).removeAlpha().raw().toBuffer();
    if (!committed.equals(out)) {
      console.error(`${path.relative(ROOT, OUTPUT)} is stale. Run node site/scripts/render-sunrise-black-mark.mjs and commit the result.`);
      process.exit(1);
    }
    console.log(`${path.relative(ROOT, OUTPUT)} matches the color master.`);
    return;
  }
  await sharp(out, { raw: { width: W, height: H, channels: 3 } }).png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(OUTPUT);
  console.log(`Rendered ${OUTPUT}`);
})();
