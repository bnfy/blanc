// The Billboard clock's Height and Glass (spec
// docs/superpowers/specs/2026-10-21-billboard-clock-style-design.md).
//
// Height is type, not a transform: the figures are set larger, then drawn
// narrower and lighter through the face's own width and weight axes, so the
// clock keeps its width and stroke and every curve stays as designed. The fit
// is solved from a small table of measured widths and stems.
//
// Glass is a lens over the page: a smooth pillow made by blurring the
// figures bends what is behind them (most at the edges) and lights them with
// a highlight and a rim, and a shadow outside keeps them readable.
//
// The rules at the top are pure (no DOM), so test/unit runs them in a vm; the
// measuring and drawing below them need a document.
(() => {
  'use strict';

  // ---- Height ----

  // Bilinear lookup in a measured grid: `values[i][j]` at stretches[i], weights[j].
  function lookup(table, values, stretch, weight) {
    const at = (axis, v) => {
      let i = 0;
      while (i < axis.length - 2 && v > axis[i + 1]) i++;
      const t = Math.max(0, Math.min(1, (v - axis[i]) / (axis[i + 1] - axis[i])));
      return [i, t];
    };
    const [i, s] = at(table.stretches, stretch);
    const [j, w] = at(table.weights, weight);
    const v = (a, b) => values[a][b];
    return (v(i, j) * (1 - w) + v(i, j + 1) * w) * (1 - s) + (v(i + 1, j) * (1 - w) + v(i + 1, j + 1) * w) * s;
  }

  // The value in [lo, hi] where an increasing `f` meets `target`.
  function solve(f, target, lo, hi) {
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (f(mid) < target) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /**
   * The width (CSS font-stretch percent) and weight that set the figures
   * `factor` times taller while the clock keeps the width and stem it has at
   * `base` ({ stretch, weight }). `table` holds the face's measured text width
   * and stem width over a grid of stretches and weights, all at one size; both
   * grow with each axis. Where the face can't narrow further it stays at its
   * narrowest and grows wider; where it can't lighten further the stem
   * thickens a little.
   */
  function fitHeight(table, base, factor) {
    if (!(factor > 1)) return { stretch: base.stretch, weight: base.weight };
    const sMin = table.stretches[0], sMax = table.stretches[table.stretches.length - 1];
    const wMin = table.weights[0], wMax = table.weights[table.weights.length - 1];
    const width = lookup(table, table.width, base.stretch, base.weight) / factor;
    const stem = lookup(table, table.stem, base.stretch, base.weight) / factor;
    const stretchFor = (weight) => {
      if (lookup(table, table.width, sMin, weight) >= width) return sMin;
      return solve((s) => lookup(table, table.width, s, weight), width, sMin, sMax);
    };
    const stemAt = (weight) => lookup(table, table.stem, stretchFor(weight), weight);
    let weight;
    if (stemAt(wMin) >= stem) weight = wMin;
    else if (stemAt(wMax) <= stem) weight = wMax;
    else weight = solve(stemAt, stem, wMin, wMax);
    return { stretch: stretchFor(weight), weight };
  }

  // ---- Glass ----

  /**
   * `values` (0–1 a pixel) blurred by a box `radius` pixels wide, three times
   * over: close to a Gaussian of that radius, and smooth everywhere.
   */
  function soften(values, width, height, radius) {
    const r = Math.max(1, Math.round(radius));
    const line = (src, dst, count, stride, offset) => {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += k >= 0 && k < count ? src[offset + k * stride] : 0;
      for (let k = 0; k < count; k++) {
        dst[offset + k * stride] = sum / (2 * r + 1);
        const out = k - r, inn = k + r + 1;
        if (out >= 0) sum -= src[offset + out * stride];
        if (inn < count) sum += src[offset + inn * stride];
      }
    };
    let from = values;
    for (let pass = 0; pass < 3; pass++) {
      const across = new Float32Array(width * height);
      for (let y = 0; y < height; y++) line(from, across, width, 1, y * width);
      const down = new Float32Array(width * height);
      for (let x = 0; x < width; x++) line(across, down, height, width, x);
      from = down;
    }
    return from;
  }

  const normalize = ([x, y, z]) => {
    const n = Math.hypot(x, y, z) || 1;
    return [x / n, y / n, z / n];
  };
  // Light from above and a little left; a weaker one from below right, the
  // glass's second rim. Each is lit at its half-vector with the viewer.
  const KEY = normalize([-0.45, -0.75, 0.5]);
  const FILL = normalize([0.5, 0.8, 0.35]);
  const halfway = (light) => normalize([light[0], light[1], light[2] + 1]);
  const KEY_HALF = halfway(KEY);
  const FILL_HALF = halfway(FILL);
  // How much of its color the body of the glass carries.
  const GLASS_BODY = 0.1;
  // The pillow's blur as a share of the bevel, and how steeply its edges rise.
  const BLUR = 0.6;
  const LIFT = 7;

  /**
   * The glass from the figures' coverage (`alpha`, one byte a pixel):
   * - `map`: RGBA for feDisplacementMap (128 = no bend). A rounded bevel
   *   about `bevel` pixels wide rises from each edge, and the page behind
   *   bends along its slope by up to `bend` pixels, most at the edge, as
   *   through a lens's rim. `scale` is the displacement filter's scale.
   * - `face`: RGBA light laid over the bent page: a crisp highlight where the
   *   bevel faces the key light, a softer one opposite, a bright Fresnel rim
   *   all round, and a faint body in `tint` ([r, g, b]).
   */
  function glassMaps(alpha, width, height, { bevel, bend, scale, tint }) {
    // The glass's surface is the figures blurred, a pillow: smooth everywhere,
    // so it has no ridge down a stroke's middle or at a corner (the crease a
    // distance field has where the slopes from two edges meet). A thin stroke
    // becomes a round rod, a wide one a slab with rounded edges.
    const coverage = new Float32Array(width * height);
    for (let i = 0; i < coverage.length; i++) coverage[i] = alpha[i] / 255;
    const surface = soften(coverage, width, height, bevel * BLUR);
    // Steep at the edges: a sharp edge blurred this far rises by about
    // 0.4/bevel a pixel, so this lift tilts it to about 70 degrees there.
    const lift = bevel * LIFT;
    const map = new Uint8ClampedArray(width * height * 4);
    const face = new Uint8ClampedArray(width * height * 4);
    const at = (x, y) => surface[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))];
    const dot = (a, b) => Math.max(0, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
    const reach = (bend / scale) * 255;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x, o = i * 4;
        map[o] = 128; map[o + 1] = 128; map[o + 2] = 128; map[o + 3] = 255;
        const cover = alpha[i] / 255;
        if (!cover) continue;
        const gx = (at(x + 1, y) - at(x - 1, y)) / 2;
        const gy = (at(x, y + 1) - at(x, y - 1)) / 2;
        const normal = normalize([-gx * lift, -gy * lift, 1]);
        map[o] = 128 + Math.max(-127, Math.min(127, normal[0] * reach));
        map[o + 1] = 128 + Math.max(-127, Math.min(127, normal[1] * reach));
        // Light gathers on the bevel only; the flat of a wide stroke stays clear.
        const edge = Math.min(1, (1 - normal[2]) * 6);
        const key = dot(normal, KEY_HALF) ** 48 * edge;
        const fill = dot(normal, FILL_HALF) ** 24 * 0.45 * edge;
        const rim = (1 - normal[2]) ** 1.6 * 0.55;
        const light = Math.min(1, key + fill + rim);
        const a = GLASS_BODY + light * (1 - GLASS_BODY);
        const lit = light / a;
        for (let c = 0; c < 3; c++) face[o + c] = tint[c] * (1 - lit) + 255 * lit;
        face[o + 3] = a * cover * 255;
      }
    }
    return { map, face };
  }

  // ---- Shadow ----

  // Above this relative luminance an ink counts as light.
  const LIGHT_INK = 0.4;
  // The shadow that keeps the figures readable over any wallpaper: the
  // opposite of the ink, a hairline edge, a close soft one and a wide one.
  const SHADOWS = Object.freeze({
    light: '0 0 1px rgb(0 0 0 / 0.35), 0 1px 3px rgb(0 0 0 / 0.32), 0 4px 22px rgb(0 0 0 / 0.28)',
    dark: '0 0 1px rgb(255 255 255 / 0.6), 0 1px 3px rgb(255 255 255 / 0.5), 0 2px 24px rgb(255 252 247 / 0.45)',
  });
  const linear = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  /** WCAG relative luminance of an [r, g, b]. */
  const luminance = ([r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

  /**
   * The clock's shadow for an ink ([r, g, b]), as a CSS text-shadow list: a
   * dark one under light ink and a light halo around dark ink, so every
   * figure has an edge of the opposite brightness whatever is behind it.
   */
  const shadowFor = (rgb) => (luminance(rgb) > LIGHT_INK ? SHADOWS.light : SHADOWS.dark);

  /**
   * A computed CSS color as [r, g, b] in 0–255: `rgb()`/`rgba()`, or the
   * `color(srgb r g b)` form (channels 0–1) Chromium gives a color-mix().
   */
  function parseColor(css) {
    const value = String(css ?? '');
    const numbers = (value.match(/-?[\d.]+(?:e-?\d+)?/g) ?? []).map(Number);
    if (/^color\(\s*srgb\b/.test(value)) return [0, 1, 2].map((i) => Math.round((numbers[i] ?? 0) * 255));
    return [0, 1, 2].map((i) => numbers[i] ?? 0);
  }


  // ---- measuring and drawing (needs a document) ----

  const canvas = (width, height) => {
    const element = document.createElement('canvas');
    element.width = Math.max(1, Math.ceil(width));
    element.height = Math.max(1, Math.ceil(height));
    return element;
  };
  const context = (element) => element.getContext('2d', { willReadFrequently: true });

  // Canvas can't set font-variation-settings or font-variant-numeric, so each
  // width and weight the clock is measured or drawn at is a face of its own,
  // made from the face's file with those exact values as its only width and
  // weight, and with proportional figures, as the typeset clock sets them.
  let faceCount = 0;
  function makeFace(url, stretch, weight) {
    const family = `Blanc Clock ${++faceCount}`;
    const face = new FontFace(family, `url("${url}")`, {
      stretch: `${stretch}%`, weight: String(weight), featureSettings: '"pnum" 1',
    });
    document.fonts.add(face);
    return { face, family: `"${family}"` };
  }
  // The few drawing faces kept, most recent last. Each holds a decoded copy of
  // the font, so older ones are let go.
  const MOST_FACES = 8;
  const faces = new Map();
  /**
   * A loaded family name for `url` at exactly `stretch` (%) and `weight`. A
   * face that fails to load is forgotten, so the next draw tries again.
   */
  function instance(url, stretch, weight) {
    const key = `${url}|${stretch}|${weight}`;
    const held = faces.get(key);
    if (held) {
      faces.delete(key);
      faces.set(key, held);
      return held.loaded;
    }
    const made = makeFace(url, stretch, weight);
    made.loaded = made.face.load().then(() => made.family, (error) => {
      if (faces.get(key) === made) faces.delete(key);
      document.fonts.delete(made.face);
      throw error;
    });
    faces.set(key, made);
    while (faces.size > MOST_FACES) {
      const [oldest, gone] = faces.entries().next().value;
      faces.delete(oldest);
      document.fonts.delete(gone.face);
    }
    return made.loaded;
  }

  // A text's width and the "1"'s stem at one size, for the fit's table.
  const SAMPLE = '0123456789:';
  const SAMPLE_SIZE = 200;
  // Measured with a face of its own, let go once measured.
  async function measure(url, stretch, weight) {
    const { face, family } = makeFace(url, stretch, weight);
    try {
      await face.load();
      return measureWith(family, weight);
    } finally {
      document.fonts.delete(face);
    }
  }
  function measureWith(family, weight) {
    const sheet = canvas(SAMPLE_SIZE, SAMPLE_SIZE * 1.4);
    const ctx = context(sheet);
    ctx.font = `${Math.round(weight)} ${SAMPLE_SIZE}px ${family}`;
    const width = ctx.measureText(SAMPLE).width;
    const one = ctx.measureText('1');
    ctx.fillStyle = '#000';
    ctx.fillText('1', 0, SAMPLE_SIZE);
    // Coverage across the stem a little below the middle of the figure.
    const row = Math.round(SAMPLE_SIZE - one.actualBoundingBoxAscent * 0.4);
    const pixels = ctx.getImageData(0, row, sheet.width, 1).data;
    let stem = 0;
    for (let x = 0; x < sheet.width; x++) stem += pixels[x * 4 + 3] / 255;
    return { width, stem };
  }

  const tables = new Map();
  /**
   * The face's fit table over a grid of its widths and weights (cached; a
   * table that fails to measure is forgotten, so the next draw tries again).
   */
  function measureFace(url, stretches, weights) {
    const key = `${url}|${stretches}|${weights}`;
    if (!tables.has(key)) {
      const table = (async () => {
        const width = [], stem = [];
        for (const s of stretches) {
          const measured = await Promise.all(weights.map((w) => measure(url, s, w)));
          width.push(measured.map((m) => m.width));
          stem.push(measured.map((m) => m.stem));
        }
        return { stretches, weights, width, stem };
      })();
      table.catch(() => { if (tables.get(key) === table) tables.delete(key); });
      tables.set(key, table);
    }
    return tables.get(key);
  }

  /**
   * The clock's coverage as a canvas mask at `scale` device pixels per CSS
   * pixel, laid out like a line-height: 1 line of the text, padded left and
   * right for the glass's bevel. `family` is a loaded canvas family. Returns
   * { mask, width, height, left } in CSS pixels.
   */
  function drawClock(text, { family, weight, size, letterSpacing }, scale) {
    const px = size * scale;
    const ctx0 = context(canvas(1, 1));
    ctx0.font = `${Math.round(weight)} ${px}px ${family}`;
    ctx0.letterSpacing = `${letterSpacing * scale}px`;
    const line = ctx0.measureText(text);
    const pad = Math.ceil(px * 0.1);
    const baseline = (px - (line.fontBoundingBoxAscent + line.fontBoundingBoxDescent)) / 2 + line.fontBoundingBoxAscent;
    const mask = canvas(Math.ceil(line.width) + pad * 2, px);
    const ctx = mask.getContext('2d');
    ctx.font = ctx0.font;
    ctx.letterSpacing = ctx0.letterSpacing;
    ctx.fillStyle = '#fff';
    ctx.fillText(text, pad, baseline);
    return { mask, width: mask.width / scale, height: mask.height / scale, left: pad / scale };
  }

  /**
   * The glass from a mask: the refraction map and the lit face, each a
   * canvas the size of the mask. Lengths are in device pixels.
   */
  function paintGlass(mask, options) {
    const width = mask.width, height = mask.height;
    const rgba = context(mask).getImageData(0, 0, width, height).data;
    const alpha = new Uint8ClampedArray(width * height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
    const maps = glassMaps(alpha, width, height, options);
    const map = canvas(width, height);
    map.getContext('2d').putImageData(new ImageData(maps.map, width, height), 0, 0);
    const face = canvas(width, height);
    face.getContext('2d').putImageData(new ImageData(maps.face, width, height), 0, 0);
    return { map, face };
  }

  /**
   * The glass's shadow, outside the figures only so the glass stays clear: a
   * close dark contact shadow and a wide soft one, each `{ blur, y, alpha }`
   * in device pixels. The canvas overhangs the mask by `margin` on each side.
   */
  function paintShadow(mask, layers, margin) {
    const shadow = canvas(mask.width + margin * 2, mask.height + margin * 2);
    const ctx = shadow.getContext('2d');
    for (const { blur, y, alpha } of layers) {
      ctx.save();
      ctx.filter = `blur(${blur}px) brightness(0)`;
      ctx.globalAlpha = alpha;
      ctx.drawImage(mask, margin, margin + y);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(mask, margin, margin);
    return shadow;
  }

  globalThis.blancClockArt = Object.freeze({
    lookup, fitHeight, soften, glassMaps, luminance, shadowFor, parseColor,
    instance, measureFace, drawClock, paintGlass, paintShadow,
  });
})();
