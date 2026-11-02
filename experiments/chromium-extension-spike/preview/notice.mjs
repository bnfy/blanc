import fs from 'node:fs';
import path from 'node:path';
const here = new URL('./', import.meta.url);
export function noticeMetadata(version) {
  return { ...JSON.parse(fs.readFileSync(new URL('status.json', here))), version,
    revision: 'development', packagedAt: 'Development assets — not a signed candidate' };
}
export function noticeMeta(metadata) {
  const escaped = JSON.stringify(metadata).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
  return `<meta name="blanc-preview-build" content="${escaped}">`;
}
export function addPreviewNotice(assets, generated, version) {
  const file = name => path.join(generated, name);
  const read = name => assets.get(file(name)).toString('utf8');
  const marker = noticeMeta(noticeMetadata(version));
  for (const name of ['pages/newtab.html', 'overlay.html']) {
    const value = read(name);
    if (!value.includes('</head>')) throw new Error('Preview notice head anchor missing');
    assets.set(file(name), value.replace('</head>', `${marker}\n</head>`));
  }
  const button = '<button id="previewNoticeButton" class="preview-notice-button" type="button" aria-haspopup="dialog" hidden>Version &amp; security</button>';
  const newtab = read('pages/newtab.html');
  if (!newtab.includes('<span class="footer-left">')) throw new Error('Preview footer anchor missing');
  assets.set(file('pages/newtab.html'), newtab.replace('<span class="footer-left">', `<span class="footer-left">${button}`)
    .replace('</body>', `${fs.readFileSync(new URL('notice.html', here), 'utf8')}\n</body>`));
  const overlay = read('overlay.html');
  if (!overlay.includes('<div id="islandHint"></div>')) throw new Error('Preview Island anchor missing');
  assets.set(file('overlay.html'), overlay.replace('<div id="islandHint"></div>', '<button id="previewStatusLink" class="preview-notice-button" type="button" hidden>Security &amp; updates</button>\n<div id="islandHint"></div>'));
  const js = fs.readFileSync(new URL('notice.js', here), 'utf8');
  for (const name of ['pages/newtab-adapter.js', 'adapter.js']) assets.set(file(name), `${read(name)}\n${js}`);
  const css = fs.readFileSync(new URL('notice.css', here), 'utf8');
  for (const name of ['pages/newtab-prototype.css', 'prototype.css']) assets.set(file(name), `${read(name)}\n${css}`);
}
