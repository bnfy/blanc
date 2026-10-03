'use strict';
const path = require('node:path');
// Reserved artwork remains a signed Blanc asset. The adapted extension only
// references this exact image endpoint; no HTML, scripts or IPC are exposed.
const UBLOCK_BRAND_URL = 'blanc://ubo-brand/sunrise.png';
function ublockBrandResourcePath(rawUrl) {
  return rawUrl === UBLOCK_BRAND_URL ? path.join(__dirname, '../renderer/sunrise-hero-mark.png') : null;
}
module.exports = { UBLOCK_BRAND_URL, ublockBrandResourcePath };
