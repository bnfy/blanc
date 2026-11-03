// Writes each custom product page's artboards (docs/ios/app-store/custom-pages/
// <page>/design/) from pages.json, as literal canvas markup that
// scripts/ios-app-store-compose.mjs renders. The shots reuse the default
// page's real captures and its sky at each position: dawn on the first shot,
// day on the last. Never draw app UI here; every screen is a capture.
//
//   node scripts/ios-app-store-custom-pages.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = path.join(root, 'docs/ios/app-store/custom-pages');
const cap = {
  start: ['1246f491fa05fb8a1eeed4864660c5c2', "Blanc's Start Page on iPhone: the time over a sunrise, with the Island at the bottom"],
  devices: ['a9d4d42e7049cf21fc72a907dce0c6ab', "Blanc's palette on iPhone: two pages sent from a MacBook Pro, and the MacBook Pro's open tabs"],
  spaces: ['8015062cda6e3f0eaad63c0b8ae20247', "Blanc's Spaces menu on iPhone over a Van Gogh painting: This iPhone, Work, and Trip shared with a computer"],
  commands: ['46ae869b6edf52e66c352cd2380c8b03', "Blanc's palette on iPhone listing slash commands such as /favorites, /history, /new and /private"],
  grid: ['8e2a2886c7cb07e64551041558c463b8', "Blanc's tab grid on iPhone: open tabs of paintings from The Met, three of them in a Museum day group"],
  private: ['9415088981cd7c30cce90e1ecfba92f2', "A private tab in Blanc on iPhone showing Van Gogh's Sunflowers, with the Island's menu open and Ad and tracker blocking on"],
};
const DESKTOP = '9a866b36cfa42b317337439b00aabc56';
const MARK = '745cf8f66e1c585df02334091a43e067';
// The sunrise by position, as on the default page: dawn on the first shot, day on the last.
const sky = [
  ['linear-gradient(180deg, #1E150C 0%, #3A2714 22%, #8A6131 44%, #DDB676 60%, #F3E1C0 74%, #F8F2E8 88%)', '#F8F2E8', '#EAD9BC', 'rgba(30, 18, 6, 0.42)', 0.16],
  ['linear-gradient(180deg, #3A2814 0%, #6B4A24 20%, #B68A4C 40%, #E6C890 56%, #F4E6CC 70%, #F8F2E8 84%)', '#F8F2E8', '#EAD9BC', 'rgba(30, 18, 6, 0.4)', 0.16],
  ['linear-gradient(180deg, #C9A062 0%, #DFBF86 22%, #EED8B0 42%, #F6EAD5 60%, #F8F2E8 78%)', '#111111', '#3A3026', 'rgba(60, 38, 10, 0.32)', 0.12],
  ['linear-gradient(180deg, #E2C48D 0%, #EFDAB4 26%, #F6EBD7 50%, #F8F2E8 70%)', '#111111', '#4A3F33', 'rgba(60, 38, 10, 0.28)', 0.12],
  ['linear-gradient(180deg, #EFDFC1 0%, #F5EAD7 36%, #F8F2E8 64%)', '#111111', '#6B6257', 'rgba(60, 38, 10, 0.26)', 0.12],
  ['radial-gradient(1400px 900px at 50% 100%, rgba(212, 173, 102, 0.34), rgba(212, 173, 102, 0) 70%), #F8F2E8', '#111111', '#6B6257', 'rgba(60, 38, 10, 0.26)', 0.12],
];
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
function phone({ left, top, width, capture, shadow, inset }) {
  const k = width / 900, r = (n) => Math.round(n * k);
  const pad = r(24), sw = width - 2 * pad, sh = Math.round(sw * 2868 / 1320);
  const [id, alt] = cap[capture];
  return `<div style="position: absolute; left: ${left}px; top: ${top}px; width: ${width}px; height: ${sh + 2 * pad}px; box-sizing: border-box; padding: ${pad}px; border-radius: ${r(143)}px; background: linear-gradient(145deg, #4a4743 0%, #1a1917 42%, #2e2c29 100%); box-shadow: inset 0 0 0 2px rgba(255, 255, 255, ${inset}), 0 60px 140px ${shadow};">
<div style="position: relative; width: ${sw}px; height: ${sh}px; border-radius: ${r(119)}px; overflow: hidden; background: #000;">
<img src="/_blob/${id}" alt="${esc(alt)}" style="display: block; width: ${sw}px; height: ${sh}px; object-fit: cover;">
<div style="position: absolute; left: ${r(305)}px; top: ${r(27)}px; width: ${r(241)}px; height: ${r(70)}px; border-radius: ${r(35)}px; background: #000;"></div>
</div>
</div>`;
}
function board(index, shot) {
  const [bg, ink, sub, shadow, inset] = sky[index];
  const text = (top, size) => `<div style="position: absolute; left: 100px; right: 100px; top: ${top}px; display: flex; flex-direction: column; align-items: center; gap: 40px; text-align: center;">
<h1 style="margin: 0; font-family: 'Blubird Display', sans-serif; font-weight: 400; font-size: ${size}px; line-height: 1.02; letter-spacing: 0; color: ${ink}; text-wrap: balance;">${esc(shot.h)}</h1>
<p style="margin: 0; max-width: 1040px; font-size: 48px; line-height: 1.32; color: ${sub}; text-wrap: pretty;">${esc(shot.p)}</p>
</div>`;
  let body;
  if (shot.desktop) {
    body = `${text(200, 124)}
<img src="/_blob/${DESKTOP}" alt="Blanc on a Mac showing Connect your iPhone: a QR code to scan with Blanc for iPhone" style="position: absolute; left: 80px; top: 740px; width: 1160px; height: 725px; filter: drop-shadow(0 40px 90px ${shadow});">
${phone({ left: 540, top: 1270, width: 700, capture: shot.capture, shadow, inset })}`;
  } else if (shot.mark) {
    body = `<img src="/_blob/${MARK}" alt="The Blanc Sunrise" style="position: absolute; left: 510px; top: 140px; width: 300px; height: 300px;">
${text(500, 132)}
${phone({ left: 250, top: 1050, width: 820, capture: shot.capture, shadow, inset })}`;
  } else {
    body = `${text(200, 124)}
${phone({ left: 210, top: 869, width: 900, capture: shot.capture, shadow, inset })}`;
  }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${index + 1} · ${esc(shot.h)}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<style>
@font-face{font-family:"Blubird Display";src:url("/_blob/94d199612bda369249344a32e2d5e7f9") format("woff2");font-weight:400}
@font-face{font-family:"Blubird Text";src:url("/_blob/6926555ca39db09de7588a5c2bb46b73") format("woff2");font-weight:400}
body{margin:0}
</style>
</helmet>
<div style="position: relative; width: 1320px; height: 2868px; overflow: hidden; box-sizing: border-box; background: ${bg}; font-family: 'Blubird Text', sans-serif; -webkit-font-smoothing: antialiased;">
${body}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":1320,"height":2868}}'>
class Component extends DCLogic {
renderVals() { return {}; }
}
</script>
</body>
</html>
`;
}
const pages = JSON.parse(fs.readFileSync(path.join(base, 'pages.json'), 'utf8'));
for (const page of pages) {
  if (page.promotionalText.length > 170) throw new Error(`${page.slug}: promotional text is ${page.promotionalText.length}`);
  const dir = path.join(base, page.slug, 'design');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const boards = {}, order = [];
  page.shots.forEach((shot, i) => {
    const file = `${i + 1}-${shot.file}.dc.html`;
    fs.writeFileSync(path.join(dir, file), board(i, shot));
    boards[file] = { h: 2868, title: shot.title, w: 1320, x: i * 1400, y: 0 };
    order.push(file);
  });
  fs.writeFileSync(path.join(dir, 'canvas.json'), JSON.stringify({ v: 3, boards, order, title: `Blanc for iPhone · ${page.name}` }, null, 2) + '\n');
  console.log(`${page.slug}: ${page.shots.length} artboards, promotional text ${page.promotionalText.length}/170`);
}
