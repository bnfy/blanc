'use strict';

const { nativeImage } = require('electron');
const iconRaster = require('./icon-raster');
const model = require('./tabicons-model');
const { readIconBytes } = require('./favicon-network');

const MAX_CACHE = 512;
const cache = new Map();

function pngData(image) {
  if (!image || image.isEmpty()) return null;
  const resized = image.resize({ width: model.ICON_SIZE, height: model.ICON_SIZE, quality: 'best' });
  if (resized.isEmpty()) return null;
  return model.validIconData(`data:image/png;base64,${resized.toPNG().toString('base64')}`);
}

async function sanitizeUncached(source, signal) {
  if (signal?.aborted || typeof source !== 'string') return null;
  const alreadySafe = model.validIconData(source);
  if (alreadySafe) return alreadySafe;
  let contentType;
  let bytes;
  if (source.toLowerCase().startsWith('data:image/')) {
    const bounded = model.boundedImageDataUrl(source);
    if (!bounded) return null;
    if (/^data:image\/png[;,]/i.test(source)) {
      const png = model.sourcePngFromDataUrl(source);
      return png ? pngData(nativeImage.createFromBuffer(png)) : null;
    }
    return model.validIconData(await iconRaster.rasterize(bounded, signal));
  }
  const fetched = await readIconBytes(source, { signal });
  if (!fetched || signal?.aborted) return null;
  ({ contentType, bytes } = fetched);
  if (contentType === 'image/png') {
    const png = model.validSourcePngBytes(bytes);
    return png ? pngData(nativeImage.createFromBuffer(png)) : null;
  }
  const dataUrl = model.imageSourceToDataUrl(contentType, bytes);
  return dataUrl ? model.validIconData(await iconRaster.rasterize(dataUrl, signal)) : null;
}

function sanitizeFavicon(source, signal, { allowNetwork = true } = {}) {
  if (typeof source !== 'string') return Promise.resolve(null);
  // Private tabs may reuse inline pixels supplied by their own document, but
  // Blanc must never create a second, main-process network request for them.
  if (!allowNetwork && /^https?:\/\//i.test(source)) return Promise.resolve(null);
  const existing = cache.get(source);
  if (existing) {
    cache.delete(source);
    cache.set(source, existing);
    return existing;
  }
  const promise = sanitizeUncached(source, signal)
    .catch(() => null)
    .then((result) => {
      // Deduplicate in-flight work and cache valid pixels, but let transient
      // DNS/network/decoder failures retry on the next favicon event.
      if (!result && cache.get(source) === promise) cache.delete(source);
      return result;
    });
  cache.set(source, promise);
  while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  return promise;
}

module.exports = { sanitizeFavicon };
