// Rasterize arbitrary favicon bytes into a fixed 16x16 PNG using Chromium's own
// image decoders. `nativeImage.createFromBuffer` only decodes PNG/JPEG, so ICO
// (BMP-framed), SVG, GIF, WEBP, and friends — the majority of real favicons —
// cannot be rendered that way and never synced. This draws the bytes into a
// canvas inside a locked-down, detached WebContentsView instead.
//
// Only inert `data:` bytes are ever handed in (fetched in the main process with
// the SSRF/cookie/redirect guards in tabicons.js), never a live URL — so this
// view makes no network requests of its own. An SVG loaded through `<img>`
// additionally runs no scripts and fetches no external resources, keeping
// untrusted vector sources inert. The output is re-validated as a bounded 16x16
// PNG by the caller (`validIconData`) before it can enter the sidecar.

const { WebContentsView } = require('electron');

const ICON_SIZE = 16;
const RASTER_TIMEOUT_MS = 3000;

let view = null;
let ready = null;

function ensureView() {
  if (view && !view.webContents.isDestroyed()) return ready;
  view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Detached and never shown: keep timers/decoding live regardless.
      backgroundThrottling: false,
    },
  });
  const wc = view.webContents;
  wc.once('destroyed', () => { view = null; ready = null; });
  ready = wc.loadURL('about:blank').then(() => {}, () => {});
  return ready;
}

// Serialized to a string and evaluated inside the sandboxed page — must stay
// self-contained (no closure references). Returns a PNG data URL, or null when
// the source fails to decode or renders fully transparent (a blank draw is
// worse than falling back to the glyph).
function drawInPage(dataUrl, size, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => { if (!settled) { settled = true; resolve(value); } };
    const timer = setTimeout(() => done(null), timeoutMs);
    try {
      const img = new Image();
      img.onload = () => {
        clearTimeout(timer);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) return done(null);
          ctx.clearRect(0, 0, size, size);
          ctx.drawImage(img, 0, 0, size, size);
          const { data } = ctx.getImageData(0, 0, size, size);
          let opaque = false;
          for (let i = 3; i < data.length; i += 4) {
            if (data[i] !== 0) { opaque = true; break; }
          }
          done(opaque ? canvas.toDataURL('image/png') : null);
        } catch (err) {
          done(null);
        }
      };
      img.onerror = () => { clearTimeout(timer); done(null); };
      img.src = dataUrl;
    } catch (err) {
      clearTimeout(timer);
      done(null);
    }
  });
}

/** Draw a bounded image `data:` URL down to a 16x16 PNG data URL, or null. */
async function rasterize(dataUrl, signal) {
  if (typeof dataUrl !== 'string' || signal?.aborted) return null;
  try {
    await ensureView();
  } catch {
    return null;
  }
  if (signal?.aborted || !view || view.webContents.isDestroyed()) return null;
  const code = `(${drawInPage.toString()})(${JSON.stringify(dataUrl)},${ICON_SIZE},${RASTER_TIMEOUT_MS})`;
  try {
    const out = await view.webContents.executeJavaScript(code, true);
    if (signal?.aborted) return null;
    return typeof out === 'string' ? out : null;
  } catch {
    return null;
  }
}

function dispose() {
  if (view && !view.webContents.isDestroyed()) view.webContents.close();
  view = null;
  ready = null;
}

module.exports = { rasterize, dispose };
