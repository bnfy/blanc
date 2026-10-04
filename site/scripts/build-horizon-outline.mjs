// Read the approved artwork's alpha silhouette; this never modifies its pixels.
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
const variant = process.argv[2] || 'horizon';
if (!['horizon', 'blocker'].includes(variant)) throw new Error('Expected horizon or blocker');
const asset = variant === 'blocker' ? 'blocker-shield-bronze' : 'horizon-shield';
const { data, info } = await sharp(fileURLToPath(new URL(`../public/${asset}.webp`, import.meta.url))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const rows = [];
for (let y = 0; y < info.height; y++) {
  let left = info.width, right = -1;
  for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] > 224) { left = Math.min(left, x); right = x; }
  }
  if (right >= left) rows.push([y / (info.height - 1), left / (info.width - 1), right / (info.width - 1)]);
}
// Subpixel alpha steps should not become ridges in the polished metal rim.
const smoothRows = rows.map((row, i) => {
  if (i === 0 || i === rows.length - 1) return row;
  const radius = Math.min(9, i, rows.length - 1 - i);
  let weight = 0, left = 0, right = 0;
  for (let d = -radius; d <= radius; d++) {
    const w = radius + 1 - Math.abs(d);
    left += rows[i + d][1] * w; right += rows[i + d][2] * w; weight += w;
  }
  return [row[0], left / weight, right / weight];
});
const outline = smoothRows.filter((_, i) => i === 0 || i === rows.length - 1 || i % 6 === 0).map(row => row.map(n => +n.toFixed(6)));
await writeFile(new URL(`../src/data/${variant}-shield-outline.json`, import.meta.url), `${JSON.stringify(outline)}\n`);
console.log(`${outline.length} rows traced from the ${variant} shield alpha channel.`);
