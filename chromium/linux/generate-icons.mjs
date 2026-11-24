// Render Sunrise using the same locked sharp dependency as the fork's Dock icons.
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const {values} = parseArgs({options: {output: {type: 'string'}}});
const source = fileURLToPath(new URL('../../assets/sunrise-mark-4096.png', import.meta.url));
const output = values.output ?? fileURLToPath(new URL('../blanc/branding/linux/', import.meta.url));
await fs.mkdir(output, {recursive: true});
// Keep pixel rounding stable on x86 and Arm.
sharp.simd(false);
for (const size of [16, 24, 32, 48, 64, 128, 256]) {
  await sharp(source).resize(size, size, {kernel: 'lanczos3', fastShrinkOnLoad: false})
    .png({compressionLevel: 0, adaptiveFiltering: false}).toFile(path.join(output, `product_logo_${size}.png`));
}
