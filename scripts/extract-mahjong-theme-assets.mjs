#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages = path.join(root, 'src', 'renderer', 'pages');
// Source sheets stay outside src/ so they are never packaged into the app.
const sources = path.join(root, 'assets', 'mahjong');

// Bounds trace the complete tiles in the supplied crops, expressed in the
// matching original sheets so that cut-off edges can be recovered. Order is
// left, top, right, bottom (exclusive). The corner mask excludes sheet shadow.
const themes = {
  porcelain: {
    radius: 33,
    tiles: {
      chr1: [43, 53, 255, 347], chr5: [280, 53, 491, 347], chr9: [519, 53, 729, 347],
      dot1: [757, 53, 968, 347], dot5: [995, 53, 1206, 347], dot9: [1233, 53, 1444, 347],
      bam1: [43, 382, 245, 671], bam5: [260, 382, 447, 671], bam9: [463, 382, 650, 671],
      windN: [667, 382, 847, 671], windE: [864, 382, 1044, 671],
      windS: [1061, 382, 1241, 671], windW: [1258, 382, 1444, 671],
      dragonRed: [44, 698, 292, 1008], dragonGreen: [329, 698, 577, 1008],
      dragonWhite: [615, 698, 867, 1008], flower: [911, 698, 1160, 1008], season: [1192, 698, 1444, 1008],
    },
    blank: { ink: [799, 130, 924, 255], paper: [796, 72, 928, 127] },
    number: { base: 'chr5', ink: [346, 85, 421, 179], paper: [292, 77, 343, 171], center: 384, bottom: 176 },
    pip: [1018, 107, 1082, 171], bamboo: [490, 403, 526, 480],
  },
  carved: {
    radius: 26,
    tiles: {
      chr1: [57, 79, 263, 355], chr5: [283, 79, 489, 356], chr9: [510, 79, 715, 356],
      dot1: [766, 79, 972, 355], dot5: [991, 79, 1201, 355], dot9: [1221, 79, 1433, 355],
      bam1: [50, 392, 243, 668], bam5: [255, 392, 448, 668], bam9: [460, 392, 650, 668],
      windN: [679, 392, 861, 668], windE: [872, 392, 1052, 668],
      windS: [1061, 392, 1240, 668], windW: [1252, 392, 1437, 668],
      dragonRed: [82, 701, 325, 984], dragonGreen: [353, 701, 591, 984],
      dragonWhite: [622, 701, 872, 984], flower: [905, 701, 1132, 984], season: [1163, 701, 1404, 984],
    },
    blank: { ink: [786, 150, 949, 312], paper: [790, 97, 949, 145] },
    number: { base: 'chr1', ink: [87, 106, 128, 196], paper: [139, 104, 163, 197], center: 114, bottom: 194 },
    pip: [1237, 112, 1301, 176], bamboo: [498, 419, 532, 478],
  },
  inlay: {
    radius: 26,
    tiles: {
      chr1: [69, 57, 287, 343], chr5: [291, 57, 498, 343], chr9: [503, 57, 710, 343],
      dot1: [775, 57, 979, 343], dot5: [990, 57, 1197, 343], dot9: [1206, 57, 1419, 343],
      bam1: [42, 373, 242, 662], bam5: [248, 373, 450, 662], bam9: [459, 373, 659, 662],
      windN: [667, 374, 854, 662], windE: [862, 374, 1051, 662],
      windS: [1058, 374, 1249, 662], windW: [1257, 374, 1449, 662],
      dragonRed: [77, 692, 331, 999], dragonGreen: [346, 692, 599, 999],
      dragonWhite: [619, 692, 866, 999], flower: [888, 692, 1140, 999], season: [1157, 692, 1410, 999],
    },
    blank: { ink: [806, 129, 945, 269], paper: [801, 77, 948, 124] },
    number: { base: 'chr5', ink: [339, 86, 442, 221], paper: [303, 83, 334, 220], center: 391, bottom: 215 },
    pip: [1005, 88, 1077, 160], bamboo: [485, 392, 526, 491],
  },
};

const rect = ([left, top, right, bottom]) => ({ left, top, width: right - left, height: bottom - top });
const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
const png = (image) => image.png({ compressionLevel: 9 }).toBuffer();
const crop = (source, bounds) => sharp(source).extract(rect(bounds));

async function tileCutout(input, radius) {
  const { width, height } = await sharp(input).metadata();
  const mask = Buffer.from(`<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}" fill="white"/></svg>`);
  return png(sharp(input).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]));
}

// Restore ivory only where a symbol is being replaced. The patch samples
// nearby unprinted porcelain and blends into the original finish on all sides.
async function replaceInk(source, bounds, { ink, paper }, feather = 5) {
  const { data, info } = await crop(source, bounds).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const swatch = await crop(source, paper).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const mirror = (index, size) => size - 1 - Math.abs(index % (2 * size) - size + 0.5) + 0.5;
  const [left, top, right, bottom] = ink;
  for (let y = top - feather; y < bottom + feather; y++) {
    for (let x = left - feather; x < right + feather; x++) {
      const weight = clamp(Math.min(x - left, right - 1 - x, y - top, bottom - 1 - y) / feather + 1, 0, 1);
      const target = ((y - bounds[1]) * info.width + x - bounds[0]) * 4;
      const px = mirror(x - left + feather, swatch.info.width);
      const py = mirror(y - top + feather, swatch.info.height);
      const sample = (py * swatch.info.width + px) * 4;
      for (let c = 0; c < 3; c++) data[target + c] = Math.round(data[target + c] * (1 - weight) + swatch.data[sample + c] * weight);
    }
  }
  return png(sharp(data, { raw: info }));
}

async function isolateSymbol(source, bounds, round = false) {
  const { data, info } = await crop(source, bounds).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let offset = 0; offset < data.length; offset += 4) {
    const [r, g, b] = data.subarray(offset, offset + 3);
    // The sampled pip and stick have a closed dark/gold outline. Keep both
    // pigments and their antialiasing, and key only the nearby plain ivory.
    const ink = Math.max((213 - g) / 24, (r - b - 57) / 25, (g - r + 4) / 15);
    const x = offset / 4 % info.width + 0.5 - info.width / 2;
    const y = Math.floor(offset / 4 / info.width) + 0.5 - info.height / 2;
    const edge = round ? Math.min(info.width, info.height) / 2 - 1 - Math.hypot(x, y) : 1;
    data[offset + 3] = Math.round(255 * clamp(Math.min(ink, edge), 0, 1));
  }
  return png(sharp(data, { raw: info }));
}

function rgbToHsl(r, g, b) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness];
  const delta = max - min;
  const saturation = lightness > 0.5
    ? delta / (2 - max - min)
    : delta / (max + min);
  let hue;
  if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  return [hue / 6, saturation, lightness];
}

function hslToRgb(hue, saturation, lightness) {
  if (saturation === 0) {
    const value = Math.round(lightness * 255);
    return [value, value, value];
  }
  const hueToRgb = (p, q, t) => {
    let channel = t;
    if (channel < 0) channel += 1;
    if (channel > 1) channel -= 1;
    if (channel < 1 / 6) return p + (q - p) * 6 * channel;
    if (channel < 1 / 2) return q;
    if (channel < 2 / 3) return p + (q - p) * (2 / 3 - channel) * 6;
    return p;
  };
  const q = lightness < 0.5
    ? lightness * (1 + saturation)
    : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  return [
    Math.round(hueToRgb(p, q, hue + 1 / 3) * 255),
    Math.round(hueToRgb(p, q, hue) * 255),
    Math.round(hueToRgb(p, q, hue - 1 / 3) * 255),
  ];
}

function median(values) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.floor(ordered.length / 2)];
}

async function redPalette(input) {
  const { data } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const colors = [];
  for (let offset = 0; offset < data.length; offset += 4) {
    const [r, g, b, alpha] = data.subarray(offset, offset + 4);
    if (alpha > 24 && r > 72 && r > g * 1.35 && r > b * 1.25) {
      colors.push(rgbToHsl(r, g, b));
    }
  }
  return {
    hue: median(colors.map((color) => color[0])),
    saturation: median(colors.map((color) => color[1])),
    lightness: median(colors.map((color) => color[2])),
  };
}

async function normalizeNumeralPalette(input, target) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const colors = [];
  for (let offset = 0; offset < data.length; offset += 4) {
    const [r, g, b, alpha] = data.subarray(offset, offset + 4);
    if (alpha > 24 && r > g * 1.1 && r > b * 1.1) colors.push(rgbToHsl(r, g, b));
  }
  const sourceSaturation = median(colors.map((color) => color[1]));
  const sourceLightness = median(colors.map((color) => color[2]));
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] === 0) continue;
    const [, saturation, lightness] = rgbToHsl(data[offset], data[offset + 1], data[offset + 2]);
    const normalizedSaturation = Math.max(0, Math.min(1,
      saturation * (target.saturation / sourceSaturation)));
    const normalizedLightness = Math.max(0, Math.min(1,
      lightness * (target.lightness / sourceLightness)));
    const [r, g, b] = hslToRgb(target.hue, normalizedSaturation, normalizedLightness);
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

// The sheets show 1, 5, and 9. Use the existing raster numeral master only
// for the six ranks absent from the sheets.
const numeralMaster = path.join(sources, 'mahjong-character-numerals-master.png');
const numeralMetadata = await sharp(numeralMaster).metadata();
const numeralCellWidth = Math.floor(numeralMetadata.width / 3);
const numeralCellHeight = Math.floor(numeralMetadata.height / 3);

for (const [theme, design] of Object.entries(themes)) {
  const source = path.join(sources, `mahjong-theme-${theme}-sheet.png`);
  const write = (name, buffer) => sharp(buffer).png({ compressionLevel: 9 })
    .toFile(path.join(pages, `mahjong-exact-${theme}-${name}.png`));
  for (const [name, bounds] of Object.entries(design.tiles)) {
    await write(name, await tileCutout(await png(crop(source, bounds)), design.radius));
  }
  await write('blank', await tileCutout(await replaceInk(source, design.tiles.dot1, design.blank), design.radius));
  await write('pip', await isolateSymbol(source, design.pip, true));
  await write('bamboo', await isolateSymbol(source, design.bamboo));

  const { base, ink, center, bottom } = design.number;
  const bounds = design.tiles[base];
  const plate = await replaceInk(source, bounds, design.number, 3);
  const referenceRed = await redPalette(await png(crop(source, ink)));
  for (const rank of [2, 3, 4, 6, 7, 8]) {
    const index = rank - 1;
    const cell = await png(sharp(numeralMaster).extract({
      left: (index % 3) * numeralCellWidth,
      top: Math.floor(index / 3) * numeralCellHeight,
      width: numeralCellWidth,
      height: numeralCellHeight,
    }));
    const numeral = await normalizeNumeralPalette(cell, referenceRed);
    const height = { porcelain: 90, carved: 85, inlay: 121 }[theme];
    const width = { porcelain: 76, carved: 66, inlay: 98 }[theme];
    const trimmed = await png(sharp(numeral).trim({ background: '#00000000', threshold: 12 }));
    const glyph = await sharp(trimmed).resize({ height, width, fit: 'inside' }).png().toBuffer({ resolveWithObject: true });
    const combined = await png(sharp(plate).composite([{
      input: glyph.data,
      left: center - bounds[0] - Math.round(glyph.info.width / 2),
      top: bottom - bounds[1] - glyph.info.height,
    }]));
    await write(`chr${rank}`, await tileCutout(combined, design.radius));
  }
}
