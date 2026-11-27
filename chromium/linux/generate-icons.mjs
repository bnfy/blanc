// Render Sunrise using the same locked sharp dependency as the fork's Dock icons.
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const {values} = parseArgs({options: {output: {type: 'string'}, check: {type: 'boolean'}}});
const source = fileURLToPath(new URL('../../assets/sunrise-mark-4096.png', import.meta.url));
const output = values.output ?? fileURLToPath(new URL('../blanc/branding/linux/', import.meta.url));
if (!values.check) await fs.mkdir(output, {recursive: true});
// Keep pixel rounding stable on x86 and Arm.
sharp.simd(false);
for (const size of [16, 24, 32, 48, 64, 128, 256]) {
  const file = path.join(output, `product_logo_${size}.png`);
  const image = await sharp(source).resize(size, size, {kernel: 'lanczos3', fastShrinkOnLoad: false})
    .png({compressionLevel: 0, adaptiveFiltering: false}).toBuffer();
  if (values.check) {
    if (!(await fs.readFile(file)).equals(image)) throw new Error(`Stale Linux installer icon: ${file}`);
  } else {
    await fs.writeFile(file, image);
  }
}
