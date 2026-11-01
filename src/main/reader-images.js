'use strict';

const dns = require('node:dns').promises;
const http = require('node:http');
const https = require('node:https');
const { isPublicAddress } = require('./dark-websites');
const { webUrl } = require('./reader-model');
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 16 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 8000;
const RASTER_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function rasterDimensions(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 10) return null;
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (/^GIF8[79]a/.test(bytes.toString('ascii', 0, 6))) return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let at = 2; at + 8 < bytes.length;) {
      if (bytes[at] !== 0xff) return null;
      const marker = bytes[at + 1];
      if (marker === 0xff) { at++; continue; }
      if (marker === 0xd9 || marker === 0xda) break;
      const length = bytes.readUInt16BE(at + 2);
      if (length < 2 || at + length + 2 > bytes.length) return null;
      if ([0xc0, 0xc1, 0xc2].includes(marker)) return { width: bytes.readUInt16BE(at + 7), height: bytes.readUInt16BE(at + 5) };
      at += length + 2;
    }
  }
  if (bytes.length >= 30 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    const kind = bytes.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
    if (kind === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) {
      return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    }
    if (kind === 'VP8L' && bytes[20] === 0x2f) return {
      width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
      height: 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10),
    };
  }
  // Unsupported formats are omitted before native decoding, including AVIF.
  return null;
}

// Pin the actual TCP connection to a validated address. A resolveHost check
// followed by an unrelated fetch would leave a DNS-rebinding window.
async function fetchPublicRaster(rawUrl, { signal, lookup = dns.lookup, request = null } = {}) {
  const safe = webUrl(rawUrl);
  if (!safe) return null;
  const url = new URL(safe);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (url.port && !['80', '443'].includes(url.port)) return null;
  const addresses = await lookup(host, { all: true, verbatim: true });
  if (signal?.aborted || !addresses.length || !addresses.every(item => isPublicAddress(item.address))) return null;
  const endpoint = addresses[0];
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
    const transport = request || (url.protocol === 'https:' ? https.request : http.request);
    const req = transport(url, {
      method: 'GET', agent: false, signal,
      headers: { Accept: 'image/png,image/jpeg,image/webp,image/gif', 'Accept-Encoding': 'identity' },
      lookup: (_host, options, callback) => callback(null,
        options?.all ? [endpoint] : endpoint.address, endpoint.family),
    }, response => {
      const type = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (response.statusCode !== 200 || !RASTER_TYPES.has(type)
          || Number(response.headers['content-length']) > MAX_IMAGE_BYTES
          || (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity')) {
        response.destroy(); finish(null); return;
      }
      const chunks = []; let total = 0;
      response.on('data', chunk => {
        total += chunk.length;
        if (total > MAX_IMAGE_BYTES) { response.destroy(); finish(null); }
        else chunks.push(chunk);
      });
      response.on('end', () => finish(Buffer.concat(chunks)));
      response.on('error', () => finish(null));
      response.on('aborted', () => finish(null));
    });
    req.setTimeout(IMAGE_TIMEOUT_MS, () => { req.destroy(); finish(null); });
    req.on('error', () => finish(null));
    req.end();
  });
}

function createReaderImageBroker({ allowImage, decode, lookupImage, dimensions = rasterDimensions, fetchImage = fetchPublicRaster }) {
  return async function image(record, index) {
    if (!Number.isInteger(index) || index < 0 || index >= record.article.images.length || record.closed) return null;
    if (record.imageCache.has(index)) return record.imageCache.get(index);
    if (record.imageActive >= 3 || record.imageCount >= 30 || record.imageBytes >= 20 * 1024 * 1024) return null;
    record.imageActive++; record.imageCount++;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
    record.imageControllers.add(controller);
    try {
      const url = record.article.images[index];
      const allowed = await Promise.race([
        Promise.resolve(allowImage(record.tab, url)).then(value => value === true, () => false),
        new Promise(resolve => controller.signal.addEventListener('abort', () => resolve(false), { once: true })),
      ]);
      if (!allowed || record.closed || controller.signal.aborted) return null;
      const bytes = await Promise.race([
        fetchImage(url, { signal: controller.signal,
          ...(lookupImage ? { lookup: host => lookupImage(record.tab, host) } : {}) }),
        new Promise(resolve => controller.signal.addEventListener('abort', () => resolve(null), { once: true })),
      ]);
      if (!bytes || record.closed || controller.signal.aborted) return null;
      const size = dimensions(bytes);
      const pixels = size?.width * size?.height;
      if (!Number.isFinite(pixels) || pixels <= 0 || pixels > MAX_IMAGE_PIXELS
          || (record.imagePixels ?? 0) + pixels > 32 * 1024 * 1024) return null;
      const result = decode(bytes);
      if (!result || result.length > MAX_IMAGE_BYTES || record.imageBytes + result.length > 20 * 1024 * 1024) return null;
      record.imageBytes += result.length;
      record.imagePixels = (record.imagePixels ?? 0) + pixels;
      record.imageCache.set(index, result);
      return result;
    } catch { return null; }
    finally {
      clearTimeout(timeout); record.imageControllers.delete(controller); record.imageActive--;
    }
  };
}
module.exports = { MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, IMAGE_TIMEOUT_MS, rasterDimensions, fetchPublicRaster, createReaderImageBroker };
