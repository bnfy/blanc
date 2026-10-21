#!/usr/bin/env node
// Renders the 1080x1920 vertical video (TikTok, Instagram Reels, Facebook Reels)
// and its cover frame from graphic.html?format=story. Silent: add sound in each app.
//   node marketing/social/blanc-got-bangs-2026-10-17/render-video.mjs [--frames-only]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30;
const OUT = path.join(DIR, 'blanc-got-bangs-1080x1920.mp4');
const COVER = path.join(DIR, 'blanc-got-bangs-cover-1080x1920.png');
const frames = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-bangs-frames-'));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto(`${pathToFileURL(path.join(DIR, 'graphic.html')).href}?format=story`);
await page.waitForSelector('body[data-ready="1"]');
await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
const duration = await page.evaluate(() => window.__duration);
const total = Math.round(duration * FPS);
for (let i = 0; i < total; i++) {
  await page.evaluate((t) => window.__setTime(t), i / FPS);
  await page.screenshot({ path: path.join(frames, `f${String(i).padStart(4, '0')}.png`) });
}
await page.evaluate((t) => window.__setTime(t), duration);
await page.screenshot({ path: COVER });
await browser.close();

if (!process.argv.includes('--frames-only')) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, 'f%04d.png'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT]);
  fs.rmSync(frames, { recursive: true, force: true });
  console.log(OUT);
} else {
  console.log(frames);
}
console.log(COVER);
