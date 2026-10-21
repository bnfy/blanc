// The Billboard clock drawn on a canvas: stretched taller the way the iOS
// Lock Screen clock stretches, and the masks and maps its glass is made from
// (spec docs/superpowers/specs/2026-10-21-billboard-clock-style-design.md).
// The pixel rules at the top are pure (no DOM), so test/unit runs them in a
// vm; the drawing below them needs a document.
(() => {
  'use strict';

  // Rows nearest the cap height and the baseline never stretch, so the ends of
  // strokes keep their shape.
  const EDGE_GUARD = 0.06;
  // How strongly the stretch prefers the most vertical rows. Smaller is
  // stricter: a bowl's straight sides take nearly everything, its curves next
  // to nothing; a glyph with no vertical row (7's diagonal) shares it evenly.
  const SHARPNESS = 0.08;
  // A row inside a horizontal bar also matches its neighbours, so it must be
  // told apart by width: any ink run wider than this many stems is a bar (or
  // the flat of a curve) and never stretches.
  const BAR = 1.6;
  // Coverage that counts as ink when measuring runs.
  const INK = 128;
  // A colon's share of the stretch between its dots; the rest goes above.
  const GAP_SHARE = 0.75;
  // Glyphs are stretched at this many times the output resolution.
  const OVERSAMPLE = 2;
  // The glass's own light: how much of its color the body carries, how bright
  // the rim facing the light gets and how deep the edge facing away.
  const GLASS_BODY = 0.22;
  const GLASS_RIM = 1;
  const GLASS_SHADE = 0.4;
  // Above this relative luminance an ink counts as light.
  const LIGHT_INK = 0.4;
  // The shadow that keeps the figures readable over any wallpaper: the
  // opposite of the ink, a hairline edge, a close soft one and a wide one.
  const SHADOWS = Object.freeze({
    light: '0 0 1px rgb(0 0 0 / 0.35), 0 1px 3px rgb(0 0 0 / 0.32), 0 4px 22px rgb(0 0 0 / 0.28)',
    dark: '0 0 1px rgb(255 255 255 / 0.6), 0 1px 3px rgb(255 255 255 / 0.5), 0 2px 24px rgb(255 252 247 / 0.45)',
  });

  /** Every row's ink runs (lengths), and the glyph's typical stem width. */
  function runsOf(alpha, width, height) {
    const rows = [];
    const all = [];
    for (let r = 0; r < height; r++) {
      const runs = [];
      let run = 0;
      for (let x = 0; x <= width; x++) {
        if (x < width && alpha[r * width + x] >= INK) run++;
        else if (run) { runs.push(run); all.push(run); run = 0; }
      }
      rows.push(runs);
    }
    all.sort((a, b) => a - b);
    // The narrowest third of the runs are stem crossings in every digit.
    const stem = all.length ? all[Math.floor(all.length / 3)] : 0;
    return { rows, stem };
  }

  /**
   * How much each row of one glyph grows. `alpha` is the glyph's coverage
   * (one byte per pixel, `width` per row); rows `top` to `bottom` (cap height
   * to baseline) share `extra` pixels. A row where only vertical strokes cross
   * matches its neighbours and takes the stretch, so stems lengthen while
   * curves, corners and horizontal bars keep their size and thickness; rows
   * crossing a bar are told apart by run width and never stretch. A glyph
   * with empty rows between its marks (the colon) stretches only there and
   * above, so the dots spread apart and stay round. Returns each row's new
   * height (1 + its share).
   */
  function stretchRows(alpha, width, height, top, bottom, extra) {
    const heights = new Float64Array(height).fill(1);
    if (!(extra > 0) || bottom - top < 3) return heights;
    const guard = Math.max(1, Math.round((bottom - top) * EDGE_GUARD));
    const from = Math.max(1, top + guard);
    const to = Math.min(height - 2, bottom - guard);
    const { rows, stem } = runsOf(alpha, width, height);
    const isBar = (r) => rows[r].some((run) => run > stem * BAR + 1);
    const cost = new Float64Array(height);
    let lowest = Infinity;
    for (let r = from; r <= to; r++) {
      if (isBar(r)) { cost[r] = Infinity; continue; }
      let change = 0, ink = 0;
      for (let x = 0; x < width; x++) {
        const here = alpha[r * width + x];
        change += Math.abs(here - alpha[(r - 1) * width + x]) + Math.abs(here - alpha[(r + 1) * width + x]);
        ink += here;
      }
      cost[r] = ink ? change / ink : 0;
      lowest = Math.min(lowest, cost[r]);
    }
    const weights = new Float64Array(height);
    let total = 0;
    if (lowest === Infinity) return heights;
    // A colon: its empty rows stretch alone, mostly between the dots (as on the
    // Lock Screen, the dots end about a third and four fifths of the way down).
    // Empty means no coverage at all: a dot's soft edge is still the dot.
    const empty = (r) => {
      for (let x = 0; x < width; x++) if (alpha[r * width + x]) return false;
      return true;
    };
    const inked = [];
    for (let r = from; r <= to; r++) if (!empty(r)) inked.push(r);
    const isGap = (r) => inked.length && r > inked[0] && r < inked[inked.length - 1] && empty(r);
    const gaps = [];
    for (let r = from; r <= to; r++) if (isGap(r)) gaps.push(r);
    if (gaps.length) {
      const outer = [];
      for (let r = from; r < inked[0]; r++) outer.push(r);
      const toGap = outer.length ? GAP_SHARE : 1;
      for (const r of gaps) heights[r] += (extra * toGap) / gaps.length;
      for (const r of outer) heights[r] += (extra * (1 - toGap)) / outer.length;
      return heights;
    }
    for (let r = from; r <= to; r++) {
      weights[r] = cost[r] === Infinity ? 0 : Math.exp(-(cost[r] - lowest) / SHARPNESS);
      total += weights[r];
    }
    for (let r = from; r <= to; r++) heights[r] += extra * (weights[r] / total);
    return heights;
  }

  /**
   * Redraw `alpha` with each row at its new height. Each output row repeats
   * the source row it falls in, so nothing smears into a stretched gap; the
   * caller draws oversampled and scales down, which smooths the steps a
   * steepened diagonal gets. Returns { alpha, height }.
   */
  function resampleRows(alpha, width, height, heights) {
    const starts = new Float64Array(height + 1);
    for (let r = 0; r < height; r++) starts[r + 1] = starts[r] + heights[r];
    const outHeight = Math.round(starts[height]);
    const out = new Uint8ClampedArray(width * outHeight);
    let r = 0;
    for (let o = 0; o < outHeight; o++) {
      while (r < height - 1 && starts[r + 1] <= o + 0.5) r++;
      out.set(alpha.subarray(r * width, (r + 1) * width), o * width);
    }
    return { alpha: out, height: outHeight };
  }

  /**
   * The glass's refraction map from a blurred copy of the numerals: red and
   * green carry how far each point bends what is behind it (128 = not at all),
   * pushing outward across the bevel at each edge, like a rounded lens.
   * `rgba` is the blurred mask's pixels (coverage in alpha).
   */
  function refractionMap(rgba, width, height, strength) {
    const out = new Uint8ClampedArray(width * height * 4);
    const at = (x, y) => rgba[(Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))) * 4 + 3];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const gx = at(x + 1, y) - at(x - 1, y);
        const gy = at(x, y + 1) - at(x, y - 1);
        out[i] = 128 - gx * strength;
        out[i + 1] = 128 - gy * strength;
        out[i + 2] = 128;
        out[i + 3] = 255;
      }
    }
    return out;
  }

  /**
   * The glass's own light, from the same blurred mask: a bright rim where the
   * bevel faces the light (above, a little to the left), a faint shade where
   * it faces away, and the clock's color through the body. Premultiplied-free
   * RGBA; `mask` is the sharp coverage, `tint` an [r, g, b] the body takes.
   */
  function glassLight(blurred, mask, width, height, tint) {
    const out = new Uint8ClampedArray(width * height * 4);
    const at = (x, y) => blurred[(Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))) * 4 + 3];
    const lx = -0.45, ly = -0.89;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const cover = mask[i + 3] / 255;
        if (!cover) continue;
        const gx = (at(x + 1, y) - at(x - 1, y)) / 510;
        const gy = (at(x, y + 1) - at(x, y - 1)) / 510;
        const slope = Math.min(1, Math.hypot(gx, gy) * 6);
        // The bevel's normal points down the slope, out of the glyph.
        const facing = slope ? -(gx * lx + gy * ly) / Math.hypot(gx, gy) : 0;
        const rim = Math.max(0, facing) ** 2 * slope;
        const shade = Math.max(0, -facing) * slope;
        const alpha = Math.min(1, GLASS_BODY + rim * GLASS_RIM + shade * GLASS_SHADE);
        const lit = rim * GLASS_RIM / alpha;
        const dark = shade * GLASS_SHADE / alpha;
        for (let c = 0; c < 3; c++) {
          out[i + c] = (tint[c] * (1 - lit) + 255 * lit) * (1 - dark);
        }
        out[i + 3] = alpha * cover * 255;
      }
    }
    return out;
  }

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

  /** The same shadow as a CSS filter, for the drawn clock. */
  const shadowFilter = (shadow) => shadow.split(/,(?![^(]*\))/).map((layer) => `drop-shadow(${layer.trim()})`).join(' ');

  // ---- drawing (needs a document) ----

  const canvas = (width, height) => {
    const element = document.createElement('canvas');
    element.width = Math.max(1, Math.ceil(width));
    element.height = Math.max(1, Math.ceil(height));
    return element;
  };
  const context = (element) => element.getContext('2d', { willReadFrequently: true });
  function setFont(ctx, style) {
    ctx.font = `${style.weight} ${style.size}px ${style.family}`;
    ctx.fontStretch = style.stretch;
    ctx.letterSpacing = `${style.letterSpacing}px`;
    ctx.fontKerning = 'normal';
  }

  /**
   * The clock's coverage as a canvas mask at `scale` device pixels per CSS
   * pixel, padded left and right for the glass's bevel. `style`: { family,
   * weight, size, stretch (CSS font-stretch keyword), letterSpacing (px) }.
   * `factor` is how many times taller the figures stand (1 = as typeset).
   * The box is laid out like a line-height: 1 line of text, grown by the
   * stretch. Returns { mask, width, height, left } in CSS pixels.
   */
  function drawClock(text, style, factor, scale) {
    // Glyphs are stretched at twice the output resolution, then scaled down.
    const over = OVERSAMPLE;
    const s = { ...style, size: style.size * scale * over, letterSpacing: style.letterSpacing * scale * over };
    const probe = context(canvas(1, 1));
    setFont(probe, s);
    const line = probe.measureText(text);
    const flat = probe.measureText('147').actualBoundingBoxAscent;
    const lineAscent = line.fontBoundingBoxAscent;
    const lineDescent = line.fontBoundingBoxDescent;
    const extra = Math.max(0, Math.round(flat * (factor - 1)));
    const pad = Math.ceil(s.size * 0.12);
    const boxHeight = s.size + extra;
    // Where text with line-height: 1 puts its baseline, moved down by the stretch.
    const baseline = (s.size - (lineAscent + lineDescent)) / 2 + lineAscent + extra;
    const width = Math.ceil(line.width);
    const big = canvas(width + pad * 2, boxHeight);
    const out = big.getContext('2d');
    const glyphHeight = Math.ceil(lineAscent + lineDescent) + pad * 2;
    const glyphBaseline = Math.ceil(lineAscent) + pad;
    const characters = [...text];
    let prefix = '';
    for (const character of characters) {
      const x = probe.measureText(prefix).width;
      prefix += character;
      const advance = Math.ceil(probe.measureText(character).width) + pad * 2;
      const glyph = canvas(advance, glyphHeight);
      const g = context(glyph);
      setFont(g, s);
      g.fillStyle = '#fff';
      g.fillText(character, pad, glyphBaseline);
      const pixels = g.getImageData(0, 0, glyph.width, glyph.height).data;
      const alpha = new Uint8ClampedArray(glyph.width * glyph.height);
      for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3];
      const heights = stretchRows(alpha, glyph.width, glyph.height, Math.round(glyphBaseline - flat), glyphBaseline, extra);
      const drawn = resampleRows(alpha, glyph.width, glyph.height, heights);
      const image = new ImageData(glyph.width, drawn.height);
      for (let i = 0; i < drawn.alpha.length; i++) {
        image.data[i * 4] = 255; image.data[i * 4 + 1] = 255; image.data[i * 4 + 2] = 255;
        image.data[i * 4 + 3] = drawn.alpha[i];
      }
      const piece = canvas(glyph.width, drawn.height);
      piece.getContext('2d').putImageData(image, 0, 0);
      // The glyph's baseline lands on the line's, below the added rows.
      out.drawImage(piece, Math.round(x), Math.round(baseline - glyphBaseline - extra));
    }
    const mask = canvas(big.width / over, big.height / over);
    const small = mask.getContext('2d');
    small.imageSmoothingQuality = 'high';
    small.drawImage(big, 0, 0, mask.width, mask.height);
    // CSS pixels; `left` is how far the drawing starts before the text would.
    return { mask, width: mask.width / scale, height: mask.height / scale, left: pad / over / scale };
  }

  /** The mask filled with one color (any CSS color). */
  function paintSolid(mask, color) {
    const face = canvas(mask.width, mask.height);
    const ctx = face.getContext('2d');
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, face.width, face.height);
    return face;
  }

  /** A soft copy of the mask, the glass's bevel. */
  function bevel(mask, radius) {
    const soft = canvas(mask.width, mask.height);
    const ctx = context(soft);
    ctx.filter = `blur(${radius}px)`;
    ctx.drawImage(mask, 0, 0);
    return ctx.getImageData(0, 0, soft.width, soft.height).data;
  }

  /**
   * The glass from the mask: the refraction map (a canvas sized like the
   * mask) and the lit face to lay over the bent backdrop. `tint` is [r, g, b].
   */
  function paintGlass(mask, tint, radius, strength) {
    const width = mask.width, height = mask.height;
    const sharp = context(mask).getImageData(0, 0, width, height).data;
    const blurred = bevel(mask, radius);
    const map = canvas(width, height);
    map.getContext('2d').putImageData(new ImageData(refractionMap(blurred, width, height, strength), width, height), 0, 0);
    const face = canvas(width, height);
    face.getContext('2d').putImageData(new ImageData(glassLight(blurred, sharp, width, height, tint), width, height), 0, 0);
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
    stretchRows, resampleRows, refractionMap, glassLight, luminance, shadowFor, shadowFilter,
    drawClock, paintSolid, paintGlass, paintShadow,
  });
})();
