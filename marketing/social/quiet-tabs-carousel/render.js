const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const W = 1080;
const H = 1350;
const OUT = __dirname;
const LOGO = path.resolve(__dirname, '../../../site/public/logo.png');

const PAPER = '#ffffff';
const SURFACE = '#f7f7f7';
const BORDER = '#dedede';
const INK = '#0e0e0e';
const DARK_SURFACE = '#191919';
const DARK_BORDER = '#333333';
const DIM = '#6b6b6b';
const LIGHT = '#f5f5f5';

const xml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

function shell({ background = PAPER, foreground = INK, body, index }) {
  const edge = background === INK ? DARK_BORDER : BORDER;
  const muted = background === INK ? '#9c9c9c' : DIM;
  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="18" stdDeviation="26" flood-color="#000" flood-opacity="0.14"/>
      </filter>
      <style>
        text { font-family: "Inter Variable", Inter, Arial, sans-serif; fill: ${foreground}; }
        .mono { font-family: "JetBrains Mono", ui-monospace, Menlo, monospace; }
        .hero { font-size: 104px; font-weight: 500; letter-spacing: -3.6px; text-anchor: middle; }
        .sub { font-size: 31px; font-weight: 400; letter-spacing: -0.4px; text-anchor: middle; }
      </style>
    </defs>
    <rect width="${W}" height="${H}" fill="${background}"/>
    <line x1="60" y1="82" x2="1020" y2="82" stroke="${edge}"/>
    <text x="60" y="56" class="mono" font-size="17" letter-spacing="3" fill="${muted}" style="fill:${muted}">BLANC / QUIET TABS</text>
    <text x="1020" y="56" text-anchor="end" class="mono" font-size="17" fill="${muted}" style="fill:${muted}">${index} / 4</text>
    ${body}
  </svg>`;
}

function island({ x = 110, y = 760, width = 860, quiet = [0, 3] } = {}) {
  const dots = [0, 1, 2, 3, 4, 5].map((i) => {
    const cx = x + 72 + i * 54;
    const isQuiet = quiet.includes(i);
    return isQuiet
      ? `<circle cx="${cx}" cy="${y + 58}" r="13" fill="none" stroke="${PAPER}" stroke-width="2"/><circle cx="${cx}" cy="${y + 58}" r="5" fill="${PAPER}"/>`
      : `<circle cx="${cx}" cy="${y + 58}" r="11" fill="${PAPER}"/>`;
  }).join('');
  return `<g filter="url(#shadow)">
    <rect x="${x}" y="${y}" width="${width}" height="116" rx="58" fill="${INK}" stroke="${DARK_BORDER}" stroke-width="2"/>
    ${dots}
    <line x1="${x + 420}" y1="${y + 34}" x2="${x + 420}" y2="${y + 82}" stroke="${DARK_BORDER}"/>
    <circle cx="${x + 462}" cy="${y + 58}" r="16" fill="${PAPER}"/>
    <text x="${x + 494}" y="${y + 68}" font-size="25" fill="${LIGHT}" style="fill:${LIGHT}">blancbrowser.com</text>
  </g>`;
}

function slide1() {
  return shell({ background: INK, foreground: LIGHT, index: 1, body: `
    <text x="540" y="265" class="hero" fill="${LIGHT}" style="fill:${LIGHT}">
      <tspan x="540">Your laptop has</tspan><tspan x="540" dy="114">enough to do.</tspan>
    </text>
    <text x="540" y="560" class="sub" fill="#9c9c9c" style="fill:#9c9c9c">
      <tspan x="540">It does not need to keep every inactive page running.</tspan><tspan x="540" dy="46">Keep the tabs you need. Free up memory from the rest.</tspan>
    </text>
    ${island({ y: 820 })}
    <g transform="translate(60 1095)">
      <circle cx="13" cy="13" r="12" fill="none" stroke="${LIGHT}" stroke-width="2"/><circle cx="13" cy="13" r="5" fill="${LIGHT}"/>
      <text x="42" y="21" class="mono" font-size="21" fill="#9c9c9c" style="fill:#9c9c9c">page unloaded</text>
      <circle cx="340" cy="13" r="11" fill="${LIGHT}"/>
      <text x="368" y="21" class="mono" font-size="21" fill="#9c9c9c" style="fill:#9c9c9c">live page</text>
    </g>
  ` });
}

function slide2() {
  return shell({ index: 2, body: `
    <text x="540" y="270" class="hero">
      <tspan x="540">Free up memory</tspan><tspan x="540" dy="114">without closing tabs.</tspan>
    </text>
    <text x="540" y="590" class="sub" fill="${DIM}" style="fill:${DIM}">
      <tspan x="540">Blanc unloads eligible inactive pages.</tspan><tspan x="540" dy="46">Their tabs stay in place and reload when you return.</tspan>
    </text>
    <g transform="translate(60 790)">
      <rect width="960" height="285" rx="34" fill="${SURFACE}" stroke="${BORDER}" stroke-width="2"/>
      <text x="38" y="58" class="mono" font-size="19" fill="${DIM}" style="fill:${DIM}">AFTER THE PAGE UNLOADS</text>
      <circle cx="88" cy="142" r="25" fill="none" stroke="${INK}" stroke-width="3"/><circle cx="88" cy="142" r="9" fill="${INK}"/>
      <line x1="145" y1="125" x2="570" y2="125" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
      <line x1="145" y1="159" x2="448" y2="159" stroke="${BORDER}" stroke-width="7" stroke-linecap="round"/>
      <path d="M704 141h112m-22-23 22 23-22 23" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="870" y="149" text-anchor="middle" class="mono" font-size="19">RELOAD</text>
      <text x="38" y="247" class="mono" font-size="19" fill="${DIM}" style="fill:${DIM}">SAME TAB. FRESH PAGE.</text>
    </g>
    <text x="60" y="1188" class="mono" font-size="20" fill="${DIM}" style="fill:${DIM}">Returning reloads the page. Exact live state is not promised.</text>
  ` });
}

function card(x, y, label, detail) {
  return `<g transform="translate(${x} ${y})">
    <rect width="450" height="162" rx="28" fill="${DARK_SURFACE}" stroke="${DARK_BORDER}" stroke-width="2"/>
    <circle cx="38" cy="42" r="10" fill="${LIGHT}"/>
    <text x="64" y="50" class="mono" font-size="19" fill="${LIGHT}" style="fill:${LIGHT}">${xml(label)}</text>
    <text x="38" y="101" font-size="24" fill="#9c9c9c" style="fill:#9c9c9c">${xml(detail)}</text>
  </g>`;
}

function slide3() {
  return shell({ background: INK, foreground: LIGHT, index: 3, body: `
    <text x="540" y="265" class="hero" fill="${LIGHT}" style="fill:${LIGHT}">
      <tspan x="540">Your work in</tspan><tspan x="540" dy="114">progress stays live.</tspan>
    </text>
    <text x="540" y="565" class="sub" fill="#9c9c9c" style="fill:#9c9c9c">Forms, media, pins, and permission prompts keep their live page.</text>
    ${card(60, 770, 'IN PROGRESS', 'half-filled forms')}
    ${card(570, 770, 'PLAYING', 'audio or video')}
    ${card(60, 962, 'KEPT CLOSE', 'pinned tabs')}
    ${card(570, 962, 'WAITING', 'permission prompts')}
    <text x="60" y="1215" class="mono" font-size="20" fill="#9c9c9c" style="fill:#9c9c9c">Eligibility is conservative by design.</text>
  ` });
}

function slide4(logoData) {
  return shell({ index: 4, body: `
    <text x="540" y="270" class="hero">
      <tspan x="540">You decide</tspan><tspan x="540" dy="114">when.</tspan>
    </text>
    <text x="540" y="515" class="sub" fill="${DIM}" style="fill:${DIM}">Choose a delay—or use /sleep whenever you want to free up memory.</text>
    <g transform="translate(60 620)">
      <rect width="960" height="112" rx="56" fill="${SURFACE}" stroke="${BORDER}" stroke-width="2"/>
      ${['30m', '1h', '6h', 'off'].map((label, i) => `
        <g transform="translate(${18 + i * 234} 16)">
          <rect width="216" height="80" rx="40" fill="${i === 1 ? INK : PAPER}" stroke="${i === 1 ? INK : BORDER}" stroke-width="2"/>
          <text x="108" y="51" text-anchor="middle" class="mono" font-size="25" fill="${i === 1 ? PAPER : INK}" style="fill:${i === 1 ? PAPER : INK}">${label}</text>
        </g>`).join('')}
    </g>
    <rect x="60" y="785" width="960" height="114" rx="57" fill="${INK}"/>
    <text x="540" y="855" text-anchor="middle" class="mono" font-size="28" fill="${PAPER}" style="fill:${PAPER}">/sleep</text>
    <line x1="60" y1="1000" x2="1020" y2="1000" stroke="${BORDER}"/>
    <image href="data:image/png;base64,${logoData}" x="60" y="1050" width="118" height="118"/>
    <text x="210" y="1105" font-size="48" font-weight="500">Keep your tabs. Free up memory.</text>
    <text x="210" y="1158" class="mono" font-size="22" fill="${DIM}" style="fill:${DIM}">BLANCBROWSER.COM</text>
  ` });
}

async function render(index, markup) {
  const stem = `quiet-tabs-carousel-${index}-1080x1350`;
  await fs.writeFile(path.join(OUT, `${stem}.svg`), markup);
  await sharp(Buffer.from(markup)).png({ quality: 100 }).toFile(path.join(OUT, `${stem}.png`));
}

async function main() {
  const logoData = (await fs.readFile(LOGO)).toString('base64');
  const slides = [slide1(), slide2(), slide3(), slide4(logoData)];
  for (let i = 0; i < slides.length; i += 1) await render(i + 1, slides[i]);
  console.log(slides.map((_, i) => path.join(OUT, `quiet-tabs-carousel-${i + 1}-1080x1350.png`)).join('\n'));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
