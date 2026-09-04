#!/usr/bin/env node
import { servePreview } from './preview-server.mjs';
// Screenshots every page from the baseline (git archive) and from dist/,
// at desktop and mobile widths, into site/.parity-shots/{old,new}/ for
// side-by-side human review. Requires the repo root's playwright.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'site/.parity-shots');
const PAGES = ['index.html', 'download.html', 'features.html', 'about.html', 'privacy.html',
  'terms.html', 'changelog.html', 'features/island.html', 'features/ad-blocking.html',
  'features/private-tabs.html', 'features/command-palette.html', 'features/tab-groups.html',
  'features/sync.html', 'features/security.html'];
const SIZES = [{ tag: 'desktop', width: 1280, height: 2400 }, { tag: 'mobile', width: 480, height: 2400 }];

// Materialize the baseline into a temp dir.
const oldDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-site-old-'));
execFileSync('bash', ['-c', `git archive site-pre-astro site | tar -x -C ${oldDir}`], { cwd: ROOT });


const oldServer = await servePreview(path.join(oldDir, 'site'));
const newServer = await servePreview(path.join(ROOT, 'site/dist'));
const browser = await chromium.launch();
for (const [label, server] of [['old', oldServer], ['new', newServer]]) {
  for (const size of SIZES) {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, reducedMotion: 'reduce' });
    for (const file of PAGES) {
      const dest = path.join(OUT, label, size.tag, file.replace('/', '__') + '.png');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      await page.goto(`http://localhost:${server.address().port}/${file}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      await page.screenshot({ path: dest, fullPage: true });
    }
    await page.close();
  }
}
await browser.close();
oldServer.close(); newServer.close();
console.log(`Screenshots in ${OUT} — review old/ vs new/ side by side.`);
