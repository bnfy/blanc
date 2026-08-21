'use strict';

const { nativeImage } = require('electron');
const iconRaster = require('./icon-raster');
const model = require('./tabicons-model');
const { readIconBytes } = require('./favicon-network');

const MAX_CACHE = 512;
const SESSION_FETCH_TIMEOUT_MS = 5000;
const cache = new Map();

function pngData(image) {
  if (!image || image.isEmpty()) return null;
  const resized = image.resize({ width: model.ICON_SIZE, height: model.ICON_SIZE, quality: 'best' });
  if (resized.isEmpty()) return null;
  return model.validIconData(`data:image/png;base64,${resized.toPNG().toString('base64')}`);
}

async function sanitizeFetched(contentType, bytes, signal) {
  if (!bytes || signal?.aborted) return null;
  // Trust the validated byte signature over a stale/mistaken server label.
  // Google, for example, serves real PNG bytes as image/x-icon.
  const png = model.validSourcePngBytes(bytes);
  if (png) return pngData(nativeImage.createFromBuffer(png));
  if (contentType === 'image/png') return null;
  const dataUrl = model.imageSourceToDataUrl(contentType, bytes);
  return dataUrl ? model.validIconData(await iconRaster.rasterize(dataUrl, signal)) : null;
}

async function readBoundedResponse(response) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > model.MAX_SOURCE_BYTES) return null;
  if (!response.body?.getReader) {
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length <= model.MAX_SOURCE_BYTES ? bytes : null;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > model.MAX_SOURCE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks, total);
}

async function readSameOriginSessionIcon(source, pageUrl, browsingSession, signal) {
  if (!browsingSession?.fetch) return null;
  let page;
  let current;
  try {
    page = new URL(pageUrl);
    current = new URL(source);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(page.protocol) || current.origin !== page.origin) return null;

  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), SESSION_FETCH_TIMEOUT_MS);
  const requestSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;
  try {
    const response = await browsingSession.fetch(current.href, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      signal: requestSignal,
    });
    if (!response.ok || requestSignal.aborted) return null;
    if (response.url && new URL(response.url).origin !== page.origin) return null;
    const declaredContentType = response.headers?.get?.('content-type');
    if (!model.canReadFaviconResponse(declaredContentType, current.href)) return null;
    const bytes = await readBoundedResponse(response);
    if (requestSignal.aborted || !bytes) return null;
    const contentType = model.faviconResponseMediaType(
      declaredContentType,
      current.href,
      bytes,
    );
    return contentType ? { contentType, bytes } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function sanitizeUncached(source, signal, { browsingSession, pageUrl } = {}) {
  if (signal?.aborted || typeof source !== 'string') return null;
  const alreadySafe = model.validIconData(source);
  if (alreadySafe) return alreadySafe;
  if (source.toLowerCase().startsWith('data:image/')) {
    const bounded = model.boundedImageDataUrl(source);
    if (!bounded) return null;
    if (/^data:image\/png[;,]/i.test(source)) {
      const png = model.sourcePngFromDataUrl(source);
      return png ? pngData(nativeImage.createFromBuffer(png)) : null;
    }
    return model.validIconData(await iconRaster.rasterize(bounded, signal));
  }
  let fetched = await readIconBytes(source, { signal });
  let sanitized = fetched
    ? await sanitizeFetched(fetched.contentType, fetched.bytes, signal)
    : null;
  if (sanitized || signal?.aborted) return sanitized;
  fetched = await readSameOriginSessionIcon(source, pageUrl, browsingSession, signal);
  return fetched ? sanitizeFetched(fetched.contentType, fetched.bytes, signal) : null;
}

function sanitizeFavicon(source, signal, {
  allowNetwork = true,
  browsingSession,
  pageUrl,
} = {}) {
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
  const promise = sanitizeUncached(source, signal, { browsingSession, pageUrl })
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
