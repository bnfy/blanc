#!/usr/bin/env node
// Copyright 2026 Bananify Creative. MIT; see LICENSE.
//
// Blanc Beta's Dock images: Icon Composer's own Light and Dark renders of the
// colorways that are not the bundle icon, at shipping's flat Dock geometry
// (an 824 px tile inset 100 px into a 1024 canvas, as src/renderer/pages'
// icon-*.png draw it).
//
// Why images: AppKit draws a named Icon Composer stack handed to
// NSApp.applicationIconImage once, in Light, and never redraws it for Dark.
// Shipping never hands the Dock a stack either: Electron's
// createFromNamedImage treats names without an NS prefix as SF Symbols, finds
// none, and shipping falls back to a Light or Dark image, reapplied when the
// appearance changes. Only the bundle icon (Sunrise Gold here) stays live.
//
// Usage (a Mac with Icon Composer): node render-dock-icons.mjs <dir holding
// the .icon packages compiled into Assets.car> — the inputs pinned by
// icon-manifest.json's iconJson.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sharp = createRequire(path.join(here, '../../../../package.json'))('sharp');
const ICTOOL = '/Applications/Icon Composer.app/Contents/Executables/ictool';
// The colorways the Dock shows as images; Sunrise Gold (BlancDK) is the bundle icon.
const DOCK_STACKS = ['Icon', 'SunriseDark', 'SunriseSpectrum', 'SunriseAmber'];
const CANVAS = 1024, TILE = 824;

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

async function main() {
  const source = process.argv[2];
  if (!source || !fs.existsSync(ICTOOL)) throw new Error('usage: render-dock-icons.mjs <icon packages dir> (needs Icon Composer)');
  const manifestPath = path.join(here, 'icon-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const out = path.join(here, 'dock');
  fs.mkdirSync(out, { recursive: true });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-dock-'));
  const dock = {};
  try {
    for (const name of DOCK_STACKS) {
      const pkg = path.join(source, `${name}.icon`);
      if (sha256(fs.readFileSync(path.join(pkg, 'icon.json'))) !== manifest.iconJson[name])
        throw new Error(`${name}.icon is not the package Assets.car was compiled from`);
      for (const [appearance, rendition] of [['light', 'Default'], ['dark', 'Dark']]) {
        const raw = path.join(work, `${name}-${rendition}.png`);
        execFileSync(ICTOOL, [pkg, '--export-image', '--output-file', raw, '--platform', 'macOS',
          '--rendition', rendition, '--width', '512', '--height', '512', '--scale', '2']);
        const tile = await sharp(raw).resize(TILE, TILE).toBuffer();
        // ictool writes 16-bit PNGs; the Dock needs no more than 8.
        const png = await sharp({ create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
          .composite([{ input: tile, left: (CANVAS - TILE) / 2, top: (CANVAS - TILE) / 2 }])
          .toColourspace('srgb').png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
        const file = `${name}-${appearance}.png`;
        fs.writeFileSync(path.join(out, file), png);
        dock[file] = sha256(png);
      }
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  manifest.dock = dock;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Rendered ${Object.keys(dock).length} Dock images.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
