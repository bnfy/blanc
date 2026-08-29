const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const WIDTH = 1080;
const HEIGHT = 1920;
const OUTPUT_DIR = __dirname;
const LOGO_PATH = path.resolve(__dirname, '../../../site/public/logo.png');

// Blanc's motion system stays strictly paper/ink. Campaign accent colors may
// appear in standalone graphics, but never behind or inside the Blanc mark.
const PAPER = '#ffffff';
const PAPER_SOFT = '#f7f7f7';
const HAIRLINE = '#dedede';
const INK = '#0e0e0e';
const INK_SOFT = '#191919';
const DARK_BORDER = '#333333';
const DIM = '#6b6b6b';
const LIGHT_TEXT = '#f5f5f5';

const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

function base({ background = PAPER, foreground = INK, grain = true } = {}) {
  return `
    <defs>
      <filter id="grain" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="3" seed="18" result="noise"/>
        <feColorMatrix in="noise" type="saturate" values="0"/>
        <feComponentTransfer><feFuncA type="table" tableValues="0 0.055"/></feComponentTransfer>
      </filter>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000" flood-opacity="0.16"/>
      </filter>
      <style>
        text { font-family: Inter, Arial, sans-serif; fill: ${foreground}; }
        .caps { font-weight: 900; letter-spacing: -5px; }
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 800; }
      </style>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="${background}"/>
    ${grain ? `<rect width="1080" height="1920" fill="${INK}" filter="url(#grain)" opacity="0.16"/>` : ''}`;
}

function eyebrow(label, { x = 72, y = 100, inverted = false } = {}) {
  const fill = inverted ? PAPER : INK;
  const textFill = inverted ? INK : PAPER;
  return `
    <rect x="${x}" y="${y}" width="510" height="62" rx="31" fill="${fill}"/>
    <text x="${x + 30}" y="${y + 42}" class="mono" font-size="30" letter-spacing="4" fill="${textFill}" style="fill:${textFill}">${escapeXml(label)}</text>`;
}

function tabCard(x, y, w, h, rotation, fill = PAPER, opacity = 1, stroke = INK, detail = INK) {
  return `
    <g transform="rotate(${rotation} ${x + w / 2} ${y + h / 2})" filter="url(#shadow)">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.round(h * 0.2)}" fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="5"/>
      <circle cx="${x + 27}" cy="${y + 26}" r="8" fill="${detail}"/>
      <line x1="${x + 50}" y1="${y + 26}" x2="${x + w - 24}" y2="${y + 26}" stroke="${detail}" stroke-width="6" stroke-linecap="round" opacity="0.24"/>
    </g>`;
}

function svg(body, options) {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    ${base(options)}
    ${body}
  </svg>`;
}

function hookScene() {
  return svg(`
    ${eyebrow('TAB COUNT CONFESSION', { inverted: true })}
    <circle cx="930" cy="180" r="285" fill="none" stroke="${DARK_BORDER}" stroke-width="4"/>
    ${tabCard(760, 235, 220, 120, 8, PAPER)}
    ${tabCard(650, 460, 270, 135, -7, INK_SOFT, 1, DARK_BORDER, LIGHT_TEXT)}
    ${tabCard(815, 690, 190, 105, 10, PAPER, 0.86)}
    <text x="72" y="710" class="caps" font-size="146" fill="${LIGHT_TEXT}" style="fill:${LIGHT_TEXT}">
      <tspan x="72">DON'T</tspan><tspan x="72" dy="154">CLEAN</tspan><tspan x="72" dy="154">UP.</tspan>
    </text>
    <text x="76" y="1305" class="mono" font-size="42" fill="${LIGHT_TEXT}" style="fill:${LIGHT_TEXT}">WE CAN TELL.</text>
  `, { background: INK, foreground: LIGHT_TEXT });
}

function countScene(count) {
  return svg(`
    ${eyebrow('HOW MANY ARE OPEN?', { y: 110 })}
    <circle cx="905" cy="385" r="300" fill="${PAPER_SOFT}" stroke="${HAIRLINE}" stroke-width="4"/>
    ${tabCard(105, 360, 250, 132, -8, PAPER)}
    ${tabCard(735, 735, 250, 132, 9, INK, 1, INK, LIGHT_TEXT)}
    ${tabCard(110, 1325, 290, 142, 7, PAPER_SOFT, 0.86)}
    <text x="540" y="1140" text-anchor="middle" class="caps" font-size="520" fill="${INK}" style="fill:${INK}">${escapeXml(count)}</text>
    <text x="540" y="1645" text-anchor="middle" class="mono" font-size="48">NO CLEANING UP FIRST.</text>
  `, { background: PAPER, foreground: INK });
}

function choice(x, y, label, accent = false, rotation = 0) {
  return `
    <g transform="rotate(${rotation} ${x + 220} ${y + 67})" filter="url(#shadow)">
      <rect x="${x}" y="${y}" width="440" height="134" rx="67" fill="${accent ? PAPER : INK_SOFT}" stroke="${accent ? PAPER : DARK_BORDER}" stroke-width="6"/>
      <text x="${x + 220}" y="${y + 85}" text-anchor="middle" class="mono" font-size="44" fill="${accent ? INK : LIGHT_TEXT}" style="fill:${accent ? INK : LIGHT_TEXT}">${escapeXml(label)}</text>
    </g>`;
}

function choicesScene() {
  return svg(`
    ${eyebrow('PICK YOUR DAMAGE.', { inverted: true })}
    <circle cx="920" cy="245" r="320" fill="none" stroke="${DARK_BORDER}" stroke-width="4"/>
    <text x="72" y="485" class="caps" font-size="122" fill="${LIGHT_TEXT}" style="fill:${LIGHT_TEXT}">
      <tspan x="72">YOUR TAB</tspan><tspan x="72" dy="128">COUNT IS…</tspan>
    </text>
    ${choice(70, 865, '0–10', false, -1.5)}
    ${choice(570, 865, '11–30', false, 1.5)}
    ${choice(70, 1055, '31–100', false, 1.2)}
    ${choice(570, 1055, 'LOST COUNT', true, -1.2)}
    <text x="540" y="1445" text-anchor="middle" class="mono" font-size="40" fill="${LIGHT_TEXT}" style="fill:${LIGHT_TEXT}">DON'T LIE. WE'VE ALL BEEN THERE.</text>
  `, { background: INK, foreground: LIGHT_TEXT });
}

function commentScene() {
  return svg(`
    ${eyebrow('CONFESSION TIME.', { y: 108 })}
    <circle cx="930" cy="210" r="300" fill="${PAPER_SOFT}" stroke="${HAIRLINE}" stroke-width="4"/>
    ${tabCard(730, 270, 250, 135, 9, INK, 1, INK, LIGHT_TEXT)}
    ${tabCard(650, 475, 285, 145, -7, PAPER)}
    <text x="70" y="695" class="caps" font-size="124">
      <tspan x="70">DROP THE</tspan><tspan x="70" dy="132">NUMBER +</tspan><tspan x="70" dy="132">YOUR</tspan><tspan x="70" dy="132">OLDEST TAB.</tspan>
    </text>
    <rect x="70" y="1320" width="940" height="150" rx="75" fill="${INK}" stroke="${INK}" stroke-width="6"/>
    <text x="540" y="1412" text-anchor="middle" class="mono" font-size="46" fill="${PAPER}" style="fill:${PAPER}">PUT BOTH IN THE COMMENTS.</text>
  `, { background: PAPER, foreground: INK });
}

function followScene(logoData) {
  return svg(`
    <rect x="335" y="350" width="410" height="410" rx="48" fill="${PAPER}"/>
    <image href="data:image/png;base64,${logoData}" x="360" y="375" width="360" height="360"/>
    <text x="540" y="1035" text-anchor="middle" class="caps" font-size="102" fill="${LIGHT_TEXT}" style="fill:${LIGHT_TEXT}">FOLLOW</text>
    <text x="540" y="1168" text-anchor="middle" class="mono" font-size="52" fill="${LIGHT_TEXT}" style="fill:${LIGHT_TEXT}">@BLANCBROWSER</text>
    <text x="540" y="1345" text-anchor="middle" class="mono" font-size="38" fill="${LIGHT_TEXT}" style="fill:${LIGHT_TEXT}">WE'RE BUILDING THE OTHER OPTION.</text>
    <rect x="250" y="1510" width="580" height="78" rx="39" fill="${PAPER}"/>
    <text x="540" y="1562" text-anchor="middle" class="mono" font-size="32" fill="${INK}" style="fill:${INK}">BLANCBROWSER.COM</text>
  `, { background: INK, foreground: LIGHT_TEXT });
}

function coverScene() {
  return svg(`
    <circle cx="925" cy="225" r="325" fill="${PAPER_SOFT}" stroke="${HAIRLINE}" stroke-width="4"/>
    ${tabCard(735, 215, 240, 130, 8, INK, 1, INK, LIGHT_TEXT)}
    ${eyebrow("DON'T CLEAN UP FIRST.", { y: 140 })}
    <text x="70" y="620" class="caps" font-size="132">
      <tspan x="70">HOW MANY</tspan><tspan x="70" dy="142">TABS?</tspan>
    </text>
    ${choice(70, 1010, '0–10', false, -1.2)}
    ${choice(570, 1010, '11–30', false, 1.2)}
    ${choice(70, 1195, '31–100', false, 1.1)}
    ${choice(570, 1195, 'LOST COUNT', true, -1.1)}
    <text x="540" y="1570" text-anchor="middle" class="mono" font-size="42">TAB COUNT CONFESSION</text>
    <text x="540" y="1640" text-anchor="middle" class="mono" font-size="34">@BLANCBROWSER</text>
  `, { background: PAPER, foreground: INK });
}

async function renderScene(index, markup) {
  const svgPath = path.join(OUTPUT_DIR, `tab-count-confession-tiktok-${index}.svg`);
  const pngPath = path.join(OUTPUT_DIR, `tab-count-confession-tiktok-${index}.png`);
  await fs.writeFile(svgPath, markup);
  await sharp(Buffer.from(markup)).png({ quality: 100 }).toFile(pngPath);
  return pngPath;
}

async function main() {
  const logoData = (await fs.readFile(LOGO_PATH)).toString('base64');
  const scenes = [
    hookScene(),
    countScene('12'),
    countScene('28'),
    countScene('47'),
    countScene('99+'),
    choicesScene(),
    commentScene(),
    followScene(logoData),
  ];
  const outputs = [];
  for (let index = 0; index < scenes.length; index += 1) {
    outputs.push(await renderScene(index + 1, scenes[index]));
  }
  const coverSvg = coverScene();
  const coverSvgPath = path.join(OUTPUT_DIR, 'tab-count-confession-tiktok-cover-1080x1920.svg');
  const coverPngPath = path.join(OUTPUT_DIR, 'tab-count-confession-tiktok-cover-1080x1920.png');
  await fs.writeFile(coverSvgPath, coverSvg);
  await sharp(Buffer.from(coverSvg)).png({ quality: 100 }).toFile(coverPngPath);
  outputs.push(coverPngPath);
  console.log(JSON.stringify(outputs, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
