import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { noticeMeta, noticeMetadata } from '../preview/notice.mjs';
import { synchronizeNotice, readVersion } from '../preview/sync-development-version.mjs';
const here = new URL('./', import.meta.url);
const noticeDir = new URL('../preview/', here);
export function stageStart({ sourceAssets, outputAssets, shippingOnboarding, chromiumVersion }) {
  if (fs.existsSync(outputAssets)) throw new Error('Output already exists; preserve prior evidence.');
  const version = readVersion(fs.readFileSync(chromiumVersion, 'utf8'));
  const read = name => fs.readFileSync(path.join(sourceAssets, name), 'utf8');
  // Only explicitly marked development assets may be transformed: signed
  // candidate provenance must never be rewritten by this development staging.
  const overlay = synchronizeNotice(read('overlay.html'), version);
  let page = read('pages/newtab.html');
  if (page.includes('blanc-preview-build') || page.includes('src="onboarding.js"'))
    throw new Error('Start page already transformed; inspect it before restaging.');
  const footer = '<span class="footer-left">';
  const anchor = '  <script src="newtab.js"></script>';
  if (page.split(footer).length !== 2 || page.split(anchor).length !== 2 || page.split('</head>').length !== 2 || page.split('</body>').length !== 2)
    throw new Error('Shipping page anchors changed.');
  const button = '<button id="previewNoticeButton" class="preview-notice-button" type="button" aria-haspopup="dialog" hidden>Version &amp; security</button>';
  page = page.replace('</head>', `${noticeMeta(noticeMetadata(version))}\n</head>`)
    .replace(footer, footer + button)
    .replace(anchor, '  <script src="onboarding.js"></script>\n  <script src="onboarding-guard.js"></script>\n' + anchor)
    .replace('</body>', `${fs.readFileSync(new URL('notice.html', noticeDir), 'utf8')}\n</body>`);
  const onboarding = fs.readFileSync(shippingOnboarding, 'utf8');
  if (!onboarding.includes('window.blancOnboarding = { maybeShow };')) throw new Error('Shipping onboarding export changed.');
  fs.cpSync(sourceAssets, outputAssets, { recursive: true, errorOnExist: true });
  const write = (name, data) => fs.writeFileSync(path.join(outputAssets, name), data);
  write('overlay.html', overlay);
  write('pages/newtab.html', page);
  write('pages/onboarding.js', onboarding);
  write('pages/onboarding-guard.js', fs.readFileSync(new URL('onboarding-guard.js', here), 'utf8'));
  write('pages/newtab-adapter.js', read('pages/newtab-adapter.js') + '\n' + fs.readFileSync(new URL('notice.js', noticeDir), 'utf8'));
  write('pages/newtab-prototype.css', read('pages/newtab-prototype.css') + '\n' + fs.readFileSync(new URL('notice.css', noticeDir), 'utf8'));
  return { version, outputAssets, onboardingActive: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [sourceAssets, outputAssets, shippingOnboarding, chromiumVersion] = process.argv.slice(2);
  if (!chromiumVersion || process.argv.length !== 6) throw Error('Usage: node prepare-shipping-start.mjs SOURCE_ASSETS NEW_OUTPUT SHIPPING_ONBOARDING CHROMIUM_VERSION');
  console.log(JSON.stringify(stageStart({sourceAssets, outputAssets, shippingOnboarding, chromiumVersion})));
}
