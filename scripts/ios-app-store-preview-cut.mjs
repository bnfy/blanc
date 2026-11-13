#!/usr/bin/env node
// Cuts the App Store app preview from a Simulator recording (see
// scripts/ios-app-store-preview.sh): the tour from its first step to its
// `end` mark, sped up evenly only if it runs past 29 seconds, scaled and
// cropped to Apple's 6.9" preview size (886 x 1920), 30 fps H.264 with a
// silent stereo AAC track, and each step's caption from
// docs/ios/app-store/preview/captions.json set over its stretch in Blubird
// (rendered here; the licensed fonts come from `npm run site:fonts`).
//
//   node scripts/ios-app-store-preview-cut.mjs <raw.mov> <marks> <out-dir>
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const [raw, marksFile, out] = process.argv.slice(2);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fonts = path.join(root, 'site/public/fonts/blubird');
for (const face of ['Blubird-RegularDisplay.woff2']) {
  if (!fs.existsSync(path.join(fonts, face))) throw new Error(`${face} is missing (npm run site:fonts -- /path/to/Blubird.zip)`);
}
const captions = JSON.parse(fs.readFileSync(path.join(root, 'docs/ios/app-store/preview/captions.json'), 'utf8'));
const marks = fs.readFileSync(marksFile, 'utf8').trim().split('\n').map((line) => {
  const [t, step] = line.split(' ');
  return { t: Number(t), step };
});
const end = marks.find((m) => m.step === 'end')?.t;
if (!end) throw new Error('no end mark');
const speed = end > 29 ? end / 28.5 : 1;
const length = end / speed;
if (length < 15) throw new Error(`the tour is ${length.toFixed(1)} s; Apple needs 15 to 30`);

const W = 886, H = 1920;
const work = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || '/tmp'), 'blanc-cut-'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: 300 } });
const steps = marks.filter((m) => m.step !== 'end');
const inputs = [];
const overlays = [];
for (const [i, m] of steps.entries()) {
  const text = captions[m.step];
  if (!text) continue;
  const file = path.join(work, `caption-${i}.png`);
  const html = path.join(work, `caption-${i}.html`);
  fs.writeFileSync(html, `<!doctype html><meta charset=utf-8><style>
    @font-face{font-family:BD;src:url(${pathToFileURL(path.join(fonts, 'Blubird-RegularDisplay.woff2')).href})}
    html,body{margin:0;background:transparent}
    div{position:absolute;left:50%;top:40px;transform:translateX(-50%);max-width:760px;width:max-content;box-sizing:border-box;
      padding:22px 34px 24px;border-radius:30px;background:rgba(30,21,12,.86);color:#F8F2E8;
      font:400 44px/1.12 BD;letter-spacing:0;text-align:center;-webkit-font-smoothing:antialiased;
      box-shadow:0 18px 50px rgba(30,21,12,.28)}
  </style><div>${text}</div>`);
  // A file page, so it may load the font from disk.
  await page.goto(pathToFileURL(html).href);
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (!document.fonts.check('44px BD')) throw new Error('Blubird did not load');
  });
  await page.screenshot({ path: file, omitBackground: true });
  const from = m.t / speed;
  const to = (steps[i + 1]?.t ?? end) / speed;
  inputs.push('-loop', '1', '-i', file);
  overlays.push({ from, to });
}
await browser.close();

// Captions sit just below the status bar; each fades in and out over 0.2 s.
let chain = `[0:v]trim=0:${end},setpts=(PTS-STARTPTS)/${speed},fps=30,scale=${W}:1925,crop=${W}:${H}:0:2,setsar=1[v0]`;
overlays.forEach(({ from, to }, i) => {
  chain += `;[${i + 1}:v]format=rgba,fade=t=in:st=${from}:d=0.2:alpha=1,fade=t=out:st=${Math.max(from, to - 0.2)}:d=0.2:alpha=1[c${i}]`;
  chain += `;[v${i}][c${i}]overlay=0:96:enable='between(t,${from},${to})'[v${i + 1}]`;
});
const video = path.join(out, 'blanc-preview.mp4');
execFileSync('ffmpeg', [
  '-y', '-i', raw, ...inputs,
  '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
  '-filter_complex', chain, '-map', `[v${overlays.length}]`, '-map', `${overlays.length + 1}:a`,
  '-t', length.toFixed(3),
  '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.0', '-pix_fmt', 'yuv420p',
  // Apple's target is 10 to 12 Mbps; hold it there even on still frames.
  '-b:v', '11M', '-minrate', '10M', '-maxrate', '12M', '-bufsize', '12M', '-x264-params', 'nal-hrd=cbr', '-r', '30',
  '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2',
  '-movflags', '+faststart', video,
], { stdio: ['ignore', 'ignore', 'inherit'] });
execFileSync('ffmpeg', ['-y', '-ss', '1.2', '-i', video, '-frames:v', '1', path.join(out, 'blanc-preview-poster.png')], { stdio: 'ignore' });
fs.rmSync(work, { recursive: true, force: true });
console.log(`${path.relative(root, video)}: ${length.toFixed(1)} s at ${speed.toFixed(2)}x, ${W} x ${H}`);
