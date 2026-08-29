const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const OUTPUT_DIR = __dirname;
const LOGO_PATH = path.resolve(__dirname, '../../../site/public/logo.png');

const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

function cardField(width, height, vertical) {
  const cards = vertical
    ? [
        [680, 210, 170, 94, -8], [835, 330, 185, 102, 7], [720, 485, 220, 112, -3],
        [770, 650, 165, 92, 9], [670, 805, 235, 118, -6], [815, 960, 175, 98, 5],
      ]
    : [
        [725, 120, 180, 94, -8], [875, 225, 160, 88, 7], [760, 365, 225, 110, -3],
        [850, 520, 170, 94, 8], [715, 665, 235, 112, -6],
      ];

  return cards.map(([x, y, w, h, rotation], index) => `
    <g transform="rotate(${rotation} ${x + w / 2} ${y + h / 2})">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.round(h * 0.18)}"
        fill="${index === 2 ? '#d9ff43' : '#ffffff'}" fill-opacity="${index === 2 ? '0.94' : '0.48'}"
        stroke="#0b0b0b" stroke-width="4"/>
      <circle cx="${x + 25}" cy="${y + 24}" r="7" fill="#0b0b0b" fill-opacity="0.72"/>
      <line x1="${x + 45}" y1="${y + 24}" x2="${x + w - 20}" y2="${y + 24}"
        stroke="#0b0b0b" stroke-width="5" stroke-linecap="round" stroke-opacity="0.22"/>
    </g>`).join('');
}

function chip(x, y, width, label, rotation = 0, accent = false) {
  return `
    <g transform="rotate(${rotation} ${x + width / 2} ${y + 51})">
      <rect x="${x}" y="${y}" width="${width}" height="102" rx="51"
        fill="${accent ? '#d9ff43' : '#f4f0e8'}" stroke="#0b0b0b" stroke-width="5"/>
      <text x="${x + width / 2}" y="${y + 65}" text-anchor="middle"
        class="chip">${escapeXml(label)}</text>
    </g>`;
}

function artwork({ width, height, vertical, logoData, stage = 4 }) {
  const top = vertical ? 185 : 118;
  const titleY = vertical ? 475 : 355;
  const lineGap = vertical ? 118 : 106;
  const chipTop = vertical ? 1195 : 895;
  const footerY = vertical ? 1540 : 1213;
  const left = 72;
  const chipWidth = vertical ? 430 : 424;
  const chipGap = 24;

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <filter id="grain" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="3" seed="18" result="noise"/>
        <feColorMatrix in="noise" type="saturate" values="0"/>
        <feComponentTransfer><feFuncA type="table" tableValues="0 0.055"/></feComponentTransfer>
      </filter>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#0b0b0b" flood-opacity="0.18"/>
      </filter>
      <style>
        text { font-family: Inter, Arial, sans-serif; fill: #0b0b0b; }
        .eyebrow { font-size: ${vertical ? 31 : 27}px; font-weight: 800; letter-spacing: 4px; }
        .headline { font-size: ${vertical ? 104 : 96}px; font-weight: 900; letter-spacing: -5px; }
        .chip { font-size: 34px; font-weight: 850; letter-spacing: -1px; }
        .footer { font-size: ${vertical ? 34 : 29}px; font-weight: 650; letter-spacing: -0.8px; }
        .brand { font-size: 28px; font-weight: 800; letter-spacing: -0.5px; }
      </style>
    </defs>

    <rect width="${width}" height="${height}" fill="#f4f0e8"/>
    <rect width="${width}" height="${height}" fill="#0b0b0b" filter="url(#grain)" opacity="0.32"/>
    <circle cx="${vertical ? 920 : 936}" cy="${vertical ? 190 : 120}" r="${vertical ? 310 : 245}" fill="#ff563b"/>
    <path d="M ${vertical ? 570 : 610} 0 L ${width} 0 L ${width} ${vertical ? 1030 : 755} C ${vertical ? 870 : 900} ${vertical ? 920 : 690}, ${vertical ? 760 : 810} ${vertical ? 560 : 380}, ${vertical ? 570 : 610} 0 Z"
      fill="#ebe6dc" fill-opacity="0.58"/>
    ${stage >= 2 ? cardField(width, height, vertical) : ''}

    <g>
      <rect x="${left}" y="${top}" width="${vertical ? 510 : 460}" height="58" rx="29" fill="#0b0b0b"/>
      <text x="${left + 28}" y="${top + 39}" class="eyebrow" fill="#f4f0e8" style="fill:#f4f0e8">TAB COUNT CONFESSION</text>
      <g transform="rotate(-5 ${left + (vertical ? 675 : 635)} ${top + 16})">
        <rect x="${left + (vertical ? 580 : 540)}" y="${top - 12}" width="190" height="76" rx="14" fill="#d9ff43" stroke="#0b0b0b" stroke-width="4"/>
        <text x="${left + (vertical ? 675 : 635)}" y="${top + 37}" text-anchor="middle" class="eyebrow" style="font-size:25px;letter-spacing:1px">DON'T LIE.</text>
      </g>
    </g>

    <text x="${left}" y="${titleY}" class="headline">
      <tspan x="${left}" dy="0">NO CLEANING</tspan>
      <tspan x="${left}" dy="${lineGap}">UP FIRST.</tspan>
    </text>

    ${stage >= 2 ? `<text x="${left}" y="${titleY + lineGap * 2 + 24}" class="headline">
      <tspan x="${left}" dy="0">HOW MANY</tspan>
      <tspan x="${left}" dy="${lineGap}">TABS?</tspan>
    </text>` : ''}

    ${stage >= 3 ? `<g filter="url(#shadow)">
      ${chip(left, chipTop, chipWidth, '0–10', -1.4)}
      ${chip(left + chipWidth + chipGap, chipTop, chipWidth, '11–30', 1.2)}
      ${chip(left, chipTop + 126, chipWidth, '31–100', 1.1)}
      ${chip(left + chipWidth + chipGap, chipTop + 126, chipWidth, 'LOST COUNT', -1.2, true)}
    </g>` : ''}

    ${stage >= 4 ? `<g>
      <text x="${left}" y="${footerY}" class="footer">reply with the number + your oldest tab.</text>
      <rect x="${left}" y="${footerY + 34}" width="${width - left * 2}" height="4" rx="2" fill="#0b0b0b" opacity="0.24"/>
      <image href="data:image/png;base64,${logoData}" x="${left}" y="${footerY + 70}" width="66" height="66"/>
      <text x="${left + 82}" y="${footerY + 114}" class="brand">blancbrowser</text>
      <rect x="${width - left - 280}" y="${footerY + 77}" width="280" height="52" rx="26" fill="#0b0b0b"/>
      <circle cx="${width - left - 242}" cy="${footerY + 103}" r="10" fill="#f4f0e8"/>
      <circle cx="${width - left - 202}" cy="${footerY + 103}" r="10" fill="#f4f0e8" opacity="0.75"/>
      <circle cx="${width - left - 162}" cy="${footerY + 103}" r="10" fill="#f4f0e8" opacity="0.52"/>
    </g>` : ''}
  </svg>`;
}

async function render(name, options, logoData, { writeSvg = true } = {}) {
  const svg = artwork({ ...options, logoData });
  const svgPath = path.join(OUTPUT_DIR, `${name}.svg`);
  const pngPath = path.join(OUTPUT_DIR, `${name}.png`);
  if (writeSvg) await fs.writeFile(svgPath, svg);
  await sharp(Buffer.from(svg)).png({ quality: 100 }).toFile(pngPath);
  return { name, svgPath: writeSvg ? svgPath : null, pngPath, ...options };
}

async function main() {
  const logoData = (await fs.readFile(LOGO_PATH)).toString('base64');
  const outputs = await Promise.all([
    render('tab-count-confession-feed-1080x1350', { width: 1080, height: 1350, vertical: false }, logoData),
    render('tab-count-confession-vertical-1080x1920', { width: 1080, height: 1920, vertical: true }, logoData),
    ...[1, 2, 3, 4].map((stage) => render(
      `tab-count-confession-motion-${stage}`,
      { width: 1080, height: 1920, vertical: true, stage },
      logoData,
      { writeSvg: false },
    )),
  ]);
  console.log(JSON.stringify(outputs, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
