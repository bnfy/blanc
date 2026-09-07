const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');

const W = 1080;
const H = 1920;
const FPS = 30;
const DURATION = 16.5;
const FRAME_COUNT = Math.ceil(FPS * DURATION);
const OUT = __dirname;
const LOGO = path.resolve(__dirname, '../../../site/public/logo.png');
const ROW_FAVICONS = {
  blanc: path.resolve(__dirname, '../../../site/public/favicon-32x32.png'),
  mdn: path.resolve(__dirname, 'favicon-mdn.png'),
  notion: path.resolve(__dirname, 'favicon-notion.png'),
};
// TikTok/Reels controls occupy the far right. A 25px optical shift keeps the
// composition balanced while leaving more clearance there than on the left.
const CENTER_X = 515;
const CONTENT_X = 100;

// Blanc motion remains paper/ink. The mark is black on white only.
const PAPER = '#ffffff';
const SURFACE = '#f7f7f7';
const HAIRLINE = '#333333';
const INK = '#0e0e0e';
const DARK_SURFACE = '#191919';
const PANEL_SURFACE = '#1f1f1f';
const PANEL_FIELD = '#171717';
const PANEL_BORDER = '#2e2e2e';
const DIM = '#9c9c9c';

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const lerp = (from, to, amount) => from + ((to - from) * amount);
const smooth = (value) => {
  const t = clamp(value);
  return t * t * (3 - (2 * t));
};
const sceneOpacity = (time, start, end, fade = 0.28) => (
  smooth((time - start) / fade) * smooth((end - time) / fade)
);

function headline(lines, opacity, y = 280, size = 112) {
  return `<g opacity="${opacity.toFixed(4)}">
    <text x="${CENTER_X}" y="${y}" class="hero" font-size="${size}">
      ${lines.map((line, index) => `<tspan x="${CENTER_X}" dy="${index === 0 ? 0 : Math.round(size * 1.02)}">${line}</tspan>`).join('')}
    </text>
  </g>`;
}

function subtitle(lines, opacity, y, size = 42) {
  return `<g opacity="${opacity.toFixed(4)}">
    <text x="${CENTER_X}" y="${y}" text-anchor="middle" font-size="${size}" fill="${DIM}" style="fill:${DIM}">
      ${lines.map((line, index) => `<tspan x="${CENTER_X}" dy="${index === 0 ? 0 : Math.round(size * 1.28)}">${line}</tspan>`).join('')}
    </text>
  </g>`;
}

function island(time) {
  const visible = sceneOpacity(time, 0.35, 8.35, 0.35);
  const rise = smooth((time - 8.0) / 0.8);
  const y = lerp(1150, 925, rise);
  const x = CONTENT_X;
  const width = 830;
  const quietProgress = smooth((time - 6.8) / 0.8);
  const dots = Array.from({ length: 8 }, (_, index) => {
    const cx = x + 58 + (index * 50);
    const quiet = [0, 3, 6].includes(index);
    if (!quiet) return `<circle cx="${cx}" cy="${y + 62}" r="12" fill="${PAPER}"/>`;
    const ring = lerp(0, 1, quietProgress);
    return `<circle cx="${cx}" cy="${y + 62}" r="${lerp(12, 14, ring)}" fill="none" stroke="${PAPER}" stroke-width="2" opacity="${ring}"/>
      <circle cx="${cx}" cy="${y + 62}" r="${lerp(12, 5, ring)}" fill="${PAPER}"/>`;
  }).join('');

  return `<g opacity="${visible.toFixed(4)}" filter="url(#shadow)">
    <rect x="${x}" y="${y}" width="${width}" height="124" rx="62" fill="${DARK_SURFACE}" stroke="${HAIRLINE}" stroke-width="3"/>
    ${dots}
    <line x1="${x + 520}" y1="${y + 33}" x2="${x + 520}" y2="${y + 91}" stroke="${HAIRLINE}" stroke-width="2"/>
    <circle cx="${x + 562}" cy="${y + 62}" r="17" fill="${PAPER}"/>
    <text x="${x + 596}" y="${y + 72}" font-size="25">blancbrowser.com</text>
  </g>`;
}

const TAB_STARTS = [
  [200, 790, -7], [505, 700, 4], [820, 790, -3], [255, 930, 5],
  [575, 885, -5], [850, 990, 6], [180, 1065, -4], [520, 1030, 3],
];

function movingTabs(time) {
  const baseOpacity = sceneOpacity(time, 0.2, 8.4, 0.35);
  const islandY = 1150;
  return TAB_STARTS.map(([startX, startY, rotation], index) => {
    const movement = smooth((time - (2.9 + (index * 0.055))) / 1.8);
    const destinationX = 158 + (index * 50);
    const x = lerp(startX, destinationX, movement);
    const y = lerp(startY, islandY + 62, movement);
    const scale = lerp(1, 0.08, movement);
    const opacity = baseOpacity * lerp(1, 0, smooth((movement - 0.72) / 0.28));
    const float = Math.sin((time * 3.2) + index) * 7 * (1 - movement);
    return `<g transform="translate(${x.toFixed(2)} ${(y + float).toFixed(2)}) rotate(${lerp(rotation, 0, movement).toFixed(2)}) scale(${scale.toFixed(3)})" opacity="${opacity.toFixed(4)}" filter="url(#shadow)">
      <rect x="-116" y="-58" width="232" height="116" rx="22" fill="${SURFACE}" stroke="${INK}" stroke-width="5"/>
      <circle cx="-84" cy="-24" r="8" fill="${INK}"/>
      <line x1="-58" y1="-24" x2="84" y2="-24" stroke="${INK}" stroke-width="6" stroke-linecap="round" opacity="0.23"/>
    </g>`;
  }).join('');
}

function expandedIsland(time, favicons) {
  const opacity = sceneOpacity(time, 8.0, 12.3, 0.32);
  const highlightDraw = smooth((time - 8.45) / 0.8);
  const highlightPerimeter = 1680;
  const highlightVisible = sceneOpacity(time, 8.4, 12.18, 0.28);
  const highlightPulse = 0.68 + (Math.sin((time - 9.25) * Math.PI * 1.35) * 0.14);
  const highlightOpacity = highlightVisible * highlightPulse;
  const rows = [
    { title: 'Quiet Tabs — Blanc Browser', icon: favicons.blanc, active: true },
    { title: 'Web API reference · MDN', icon: favicons.mdn, quiet: true },
    { title: 'Project notes · Notion', icon: favicons.notion },
  ].map((row, index) => {
    const y = 102 + (index * 70);
    return `<g transform="translate(24 ${y})" opacity="${row.quiet ? '0.5' : '1'}">
      <image href="data:image/png;base64,${row.icon}" x="14" y="18" width="30" height="30"/>
      <text x="62" y="40" font-size="25" font-weight="${row.active ? '600' : '400'}">${row.title}</text>
      ${row.active ? `<g transform="translate(754 33)" stroke="${PAPER}" stroke-width="2.2" stroke-linecap="round"><path d="M-7-7 7 7M7-7-7 7"/></g>` : ''}
    </g>`;
  }).join('');

  return `<g opacity="${opacity.toFixed(4)}" transform="translate(${CONTENT_X} 870)" filter="url(#shadow)">
    <rect width="830" height="414" rx="24" fill="${PANEL_SURFACE}" stroke="${PANEL_BORDER}" stroke-width="2"/>
    <rect x="22" y="20" width="520" height="54" rx="27" fill="${PANEL_FIELD}" stroke="${PANEL_BORDER}" stroke-width="2"/>
    <text x="48" y="55" font-size="21" fill="${DIM}" style="fill:${DIM}">Search, enter address, or / for commands</text>
    <g fill="none" stroke="${DIM}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <g transform="translate(566 35) scale(1.55)" opacity="0.28"><path d="M9.75 3.5 5.25 8l4.5 4.5"/></g>
      <g transform="translate(610 35) scale(1.55)" opacity="0.28"><path d="M6.25 3.5 10.75 8l-4.5 4.5"/></g>
      <g transform="translate(654 35) scale(1.55)"><path d="M12.42 10.35a5 5 0 1 1-4.42-7.35c1.4 0 2.74.56 3.74 1.53L13 5.78"/><path d="M13 3v2.78h-2.78"/></g>
      <g transform="translate(698 35) scale(1.55)"><path d="M8 13.25C4.6 11 2.75 8.9 2.75 6.6a2.85 2.85 0 0 1 5.25-1.54A2.85 2.85 0 0 1 13.25 6.6c0 2.3-1.85 4.4-5.25 6.65z"/></g>
      <g transform="translate(742 35) scale(1.55)"><path d="M4.5 10.25 8 6.75l3.5 3.5"/></g>
    </g>
    <rect x="20" y="168" width="790" height="64" rx="16" fill="${PAPER}" opacity="${(highlightVisible * 0.025).toFixed(4)}"/>
    <rect x="20" y="168" width="790" height="64" rx="16" fill="none" stroke="${PAPER}" stroke-width="2.5" stroke-dasharray="${(highlightDraw * highlightPerimeter).toFixed(2)} ${highlightPerimeter}" stroke-linecap="round" opacity="${highlightOpacity.toFixed(4)}" filter="url(#highlightGlow)"/>
    ${rows}
    <line x1="22" y1="326" x2="808" y2="326" stroke="${PANEL_BORDER}" stroke-width="2"/>
    <rect x="22" y="346" width="156" height="48" rx="24" fill="${PAPER}"/>
    <text x="100" y="378" text-anchor="middle" font-size="20" font-weight="500" fill="${INK}" style="fill:${INK}">+ new tab</text>
    <rect x="192" y="346" width="148" height="48" rx="24" fill="none" stroke="${DIM}" stroke-width="2" stroke-dasharray="6 5"/>
    <text x="266" y="378" text-anchor="middle" font-size="20" fill="${DIM}" style="fill:${DIM}">+ private</text>
    <g fill="none" stroke="${DIM}" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">
      <g transform="translate(540 353) scale(1.65)"><rect x="2.5" y="4.75" width="8.75" height="8.5" rx="1.5"/><path d="M5.25 4.75V3.25a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-1.5"/></g>
      <g transform="translate(588 353) scale(1.65)"><path d="M4.25 2.75h7.5v10.5L8 10.5l-3.75 2.75z"/></g>
      <g transform="translate(636 353) scale(1.65)"><circle cx="8" cy="8" r="5.75"/><path d="M8 4.75V8l2.25 1.5"/></g>
      <g transform="translate(684 353) scale(1.65)"><path d="M8 2.5v6.5M5.3 6.3 8 9l2.7-2.7M3.5 12.5h9"/></g>
      <g transform="translate(732 353) scale(1.65)"><rect x="2.5" y="2.75" width="11" height="10.5" rx="1.5"/><path d="M6 2.75v10.5"/></g>
      <g transform="translate(780 353) scale(1.65)"><path d="M2.5 4.75h6M12 4.75h1.5M2.5 11.25h1.5M7.5 11.25h6"/><circle cx="10.25" cy="4.75" r="1.75"/><circle cx="5.75" cy="11.25" r="1.75"/></g>
    </g>
  </g>`;
}

function settingsScene(time, logoData) {
  const opacity = sceneOpacity(time, 11.85, DURATION + 0.3, 0.38);
  const rise = lerp(42, 0, smooth((time - 11.85) / 0.5));
  const chips = ['30m', '1h', '6h', 'off'].map((label, index) => {
    const x = CONTENT_X + (index * 210);
    const selected = index === 1;
    return `<g transform="translate(${x} ${780 + rise})">
      <rect width="190" height="84" rx="42" fill="${selected ? PAPER : DARK_SURFACE}" stroke="${selected ? PAPER : HAIRLINE}" stroke-width="2"/>
      <text x="95" y="54" text-anchor="middle" class="mono" font-size="27" fill="${selected ? INK : PAPER}" style="fill:${selected ? INK : PAPER}">${label}</text>
    </g>`;
  }).join('');

  return `<g opacity="${opacity.toFixed(4)}">
    ${chips}
    <rect x="${CONTENT_X}" y="910" width="830" height="98" rx="49" fill="none" stroke="${PAPER}" stroke-width="3"/>
    <text x="${CENTER_X}" y="972" text-anchor="middle" class="mono" font-size="30">/sleep</text>
    <line x1="${CONTENT_X}" y1="1115" x2="930" y2="1115" stroke="${HAIRLINE}" stroke-width="2"/>
    <rect x="400" y="1190" width="230" height="230" rx="34" fill="${PAPER}"/>
    <image href="data:image/png;base64,${logoData}" x="420" y="1210" width="190" height="190"/>
    <text x="${CENTER_X}" y="1535" text-anchor="middle" font-size="44" font-weight="500">Keep your tabs. Free up memory.</text>
    <text x="${CENTER_X}" y="1610" text-anchor="middle" class="mono" font-size="27" fill="${DIM}" style="fill:${DIM}">BLANCBROWSER.COM</text>
  </g>`;
}

function frameSvg(time, logoData, favicons) {
  const scene1 = sceneOpacity(time, 0, 4.4, 0.3);
  const scene2 = sceneOpacity(time, 3.95, 8.35, 0.3);
  const scene3 = sceneOpacity(time, 7.9, 12.3, 0.3);
  const scene4 = sceneOpacity(time, 11.85, DURATION + 0.25, 0.35);

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <filter id="shadow" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#000000" flood-opacity="0.28"/>
      </filter>
      <filter id="highlightGlow" x="-20%" y="-100%" width="140%" height="300%">
        <feGaussianBlur stdDeviation="3" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <style>
        text { font-family: Inter, Arial, sans-serif; fill: ${PAPER}; }
        .hero { font-weight: 600; letter-spacing: -0.035em; text-anchor: middle; }
        .mono { font-family: "JetBrains Mono", ui-monospace, Menlo, monospace; font-weight: 650; letter-spacing: 1px; }
      </style>
    </defs>
    <rect width="${W}" height="${H}" fill="${INK}"/>
    <text x="70" y="112" class="mono" font-size="20" letter-spacing="4" fill="${DIM}" style="fill:${DIM}">BLANC / QUIET TABS</text>
    <line x1="70" y1="145" x2="1010" y2="145" stroke="${HAIRLINE}" stroke-width="2"/>
    ${headline(['You shouldn’t have', 'to close tabs', 'just to free up memory.'], scene1, 255, 82)}
    ${headline(['Blanc can unload', 'eligible inactive pages.'], scene2, 280, 90)}
    ${headline(['Need one again?', 'Click the dimmed tab', 'to wake it up.'], scene3, 250, 82)}
    ${headline(['Choose the delay.'], scene4, 330, 100)}
    ${subtitle(['Sometimes you still need them later.'], scene1, 575, 40)}
    ${subtitle(['That can free memory', 'without closing their tabs.'], scene2, 500, 40)}
    ${subtitle(['Blanc reloads the page.', 'The tab stays within reach.'], scene3, 510, 40)}
    ${subtitle(['30 minutes, 1 hour, 6 hours, or off.', 'Run /sleep to check eligible', 'background tabs without waiting.'], scene4, 455, 36)}
    ${movingTabs(time)}
    ${island(time)}
    ${expandedIsland(time, favicons)}
    ${settingsScene(time, logoData)}
  </svg>`;
}

async function renderFrame(frameDir, index, time, logoData, favicons) {
  const name = `frame-${String(index).padStart(4, '0')}.png`;
  await sharp(Buffer.from(frameSvg(time, logoData, favicons))).png({ compressionLevel: 9 }).toFile(path.join(frameDir, name));
}

async function main() {
  const logoData = (await fs.readFile(LOGO)).toString('base64');
  const favicons = Object.fromEntries(await Promise.all(
    Object.entries(ROW_FAVICONS).map(async ([key, file]) => [key, (await fs.readFile(file)).toString('base64')]),
  ));
  const frameDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blanc-quiet-tabs-'));
  const videoPath = path.join(OUT, 'quiet-tabs-vertical-1080x1920.mp4');
  const coverPath = path.join(OUT, 'quiet-tabs-vertical-cover-1080x1920.png');

  try {
    for (let index = 0; index < FRAME_COUNT; index += 1) {
      await renderFrame(frameDir, index, index / FPS, logoData, favicons);
    }
    await sharp(Buffer.from(frameSvg(9.8, logoData, favicons))).png({ compressionLevel: 9 }).toFile(coverPath);

    const result = spawnSync('ffmpeg', [
      '-y', '-v', 'error', '-framerate', String(FPS),
      '-i', path.join(frameDir, 'frame-%04d.png'),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      '-t', String(DURATION), videoPath,
    ], { stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`ffmpeg exited with ${result.status}`);
  } finally {
    await fs.rm(frameDir, { recursive: true, force: true });
  }

  console.log(videoPath);
  console.log(coverPath);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { frameSvg };
