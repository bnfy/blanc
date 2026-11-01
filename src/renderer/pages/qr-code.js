'use strict';
// A small QR encoder for the pairing sheet (design 2026-10-28 §6.2): byte
// mode, error correction level M, versions 1–4 (up to 62 bytes), which is all
// a pair link needs. First-party so the pairing path carries no third-party
// code; written from the QR Code standard (ISO/IEC 18004) and checked module
// for module against an independent encoder's output (test/unit/qr-code.test.js).
// Same dual-environment wrapper as the Settings page models.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.blancQrCode = api;
})(typeof self !== 'undefined' ? self : this, function () {
  // Level M, per version: total codewords, EC codewords per block, blocks.
  const VERSIONS = {
    1: { total: 26, ec: 10, blocks: 1, align: [] },
    2: { total: 44, ec: 16, blocks: 1, align: [6, 18] },
    3: { total: 70, ec: 26, blocks: 1, align: [6, 22] },
    4: { total: 100, ec: 18, blocks: 2, align: [6, 26] },
  };
  const dataCodewords = (v) => VERSIONS[v].total - VERSIONS[v].ec * VERSIONS[v].blocks;
  // Byte mode: 4-bit mode, 8-bit count (versions 1–9), then the bytes.
  const capacity = (v) => Math.floor((dataCodewords(v) * 8 - 12) / 8);

  // GF(256) with the QR polynomial x^8 + x^4 + x^3 + x^2 + 1.
  const EXP = new Array(512);
  const LOG = new Array(256);
  for (let i = 0, x = 1; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

  function generator(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i += 1) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j += 1) {
        next[j] ^= poly[j];
        next[j + 1] ^= mul(poly[j], EXP[i]);
      }
      poly = next;
    }
    return poly;
  }

  function reedSolomon(data, degree) {
    const gen = generator(degree);
    const rem = new Array(degree).fill(0);
    for (const byte of data) {
      const factor = byte ^ rem.shift();
      rem.push(0);
      for (let i = 0; i < degree; i += 1) rem[i] ^= mul(gen[i + 1], factor);
    }
    return rem;
  }

  function codewords(bytes, v) {
    const bits = [];
    const push = (value, length) => { for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1); };
    push(0b0100, 4);
    push(bytes.length, 8);
    for (const byte of bytes) push(byte, 8);
    const room = dataCodewords(v) * 8;
    push(0, Math.min(4, room - bits.length));
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
    for (let pad = 0xec; data.length < dataCodewords(v); pad ^= 0xec ^ 0x11) data.push(pad);
    // Split into blocks, append each block's error correction, interleave.
    const { ec, blocks } = VERSIONS[v];
    const per = data.length / blocks;
    const dataBlocks = Array.from({ length: blocks }, (_, b) => data.slice(b * per, (b + 1) * per));
    const ecBlocks = dataBlocks.map((block) => reedSolomon(block, ec));
    const out = [];
    for (let i = 0; i < per; i += 1) for (const block of dataBlocks) out.push(block[i]);
    for (let i = 0; i < ec; i += 1) for (const block of ecBlocks) out.push(block[i]);
    return out;
  }

  const MASKS = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];

  // Format information: level M (00) and the mask, BCH(15,5), then the
  // standard XOR so it is never all zeros.
  function formatBits(mask) {
    const data = (0b00 << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((data << 10) | rem) ^ 0x5412;
  }

  function baseMatrix(v) {
    const size = 17 + 4 * v;
    const modules = Array.from({ length: size }, () => new Array(size).fill(false));
    const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (r, c, dark) => { modules[r][c] = dark; reserved[r][c] = true; };
    // Finder patterns with their separators.
    for (const [r0, c0] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
      for (let r = -1; r <= 7; r += 1) {
        for (let c = -1; c <= 7; c += 1) {
          const rr = r0 + r;
          const cc = c0 + c;
          if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
          const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
          set(rr, cc, r >= 0 && r <= 6 && c >= 0 && c <= 6 && ring !== 2);
        }
      }
    }
    // Timing patterns.
    for (let i = 8; i < size - 8; i += 1) {
      set(6, i, i % 2 === 0);
      set(i, 6, i % 2 === 0);
    }
    // Alignment patterns (one, at most, for versions 2–4).
    const align = VERSIONS[v].align;
    for (const r of align) {
      for (const c of align) {
        if (reserved[r][c]) continue;
        for (let dr = -2; dr <= 2; dr += 1) for (let dc = -2; dc <= 2; dc += 1) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
      }
    }
    // The format areas, and the module that is always dark.
    for (let i = 0; i < 9; i += 1) {
      reserved[8][i] = true;
      reserved[i][8] = true;
    }
    for (let i = 0; i < 8; i += 1) {
      reserved[8][size - 1 - i] = true;
      reserved[size - 1 - i][8] = true;
    }
    set(size - 8, 8, true);
    return { size, modules, reserved };
  }

  function placeData({ size, modules, reserved }, words) {
    const bits = [];
    for (const word of words) for (let i = 7; i >= 0; i -= 1) bits.push((word >>> i) & 1);
    let index = 0;
    let upward = true;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // the vertical timing column is skipped
      for (let step = 0; step < size; step += 1) {
        const r = upward ? size - 1 - step : step;
        for (const c of [right, right - 1]) {
          if (reserved[r][c]) continue;
          modules[r][c] = index < bits.length ? bits[index] === 1 : false; // remainder bits are light
          index += 1;
        }
      }
      upward = !upward;
    }
  }

  function applyMask({ size, modules, reserved }, mask) {
    const test = MASKS[mask];
    for (let r = 0; r < size; r += 1) for (let c = 0; c < size; c += 1) if (!reserved[r][c] && test(r, c)) modules[r][c] = !modules[r][c];
  }

  function drawFormat({ size, modules }, mask) {
    const bits = formatBits(mask);
    const bit = (i) => ((bits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i += 1) modules[i][8] = bit(i);
    modules[7][8] = bit(6);
    modules[8][8] = bit(7);
    modules[8][7] = bit(8);
    for (let i = 9; i < 15; i += 1) modules[8][14 - i] = bit(i);
    for (let i = 0; i < 8; i += 1) modules[8][size - 1 - i] = bit(i);
    for (let i = 8; i < 15; i += 1) modules[size - 15 + i][8] = bit(i);
    modules[size - 8][8] = true;
  }

  // The standard's four penalty rules; the lowest total picks the mask.
  function penalty({ size, modules }) {
    let score = 0;
    const at = (r, c, vertical) => (vertical ? modules[c][r] : modules[r][c]);
    for (const vertical of [false, true]) {
      for (let line = 0; line < size; line += 1) {
        let run = 0;
        let last = null;
        let window = 0;
        for (let i = 0; i < size; i += 1) {
          const dark = at(line, i, vertical);
          if (dark === last) run += 1;
          else {
            if (run >= 5) score += 3 + (run - 5);
            last = dark;
            run = 1;
          }
          // 1:1:3:1:1 finder-like runs with four light modules on one side.
          window = ((window << 1) & 0x7ff) | (dark ? 1 : 0);
          if (i >= 10 && (window === 0x5d0 || window === 0x05d)) score += 40;
        }
        if (run >= 5) score += 3 + (run - 5);
      }
    }
    for (let r = 0; r < size - 1; r += 1) {
      for (let c = 0; c < size - 1; c += 1) {
        const sum = modules[r][c] + modules[r][c + 1] + modules[r + 1][c] + modules[r + 1][c + 1];
        if (sum === 0 || sum === 4) score += 3;
      }
    }
    const dark = modules.flat().filter(Boolean).length;
    score += Math.abs(Math.ceil((dark * 100) / (size * size) / 5) - 10) * 10;
    return score;
  }

  function utf8(text) {
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(text));
    return Array.from(Buffer.from(text, 'utf8'));
  }

  /** { version, size, mask, modules: boolean[][] } for text in byte mode, level M. */
  function encode(text, { mask } = {}) {
    const bytes = utf8(String(text));
    const version = [1, 2, 3, 4].find((v) => bytes.length <= capacity(v));
    if (!version) throw new RangeError('QR text too long for versions 1–4 at level M');
    const words = codewords(bytes, version);
    const build = (m) => {
      const matrix = baseMatrix(version);
      placeData(matrix, words);
      applyMask(matrix, m);
      drawFormat(matrix, m);
      return matrix;
    };
    let chosen = Number.isInteger(mask) && mask >= 0 && mask < 8 ? mask : null;
    if (chosen === null) {
      let best = Infinity;
      for (let m = 0; m < 8; m += 1) {
        const score = penalty(build(m));
        if (score < best) { best = score; chosen = m; }
      }
    }
    const { size, modules } = build(chosen);
    return { version, size, mask: chosen, modules };
  }

  const QUIET = 4;
  const viewBoxSize = (matrix) => matrix.size + 2 * QUIET;

  /** One SVG path of unit squares, offset by the four-module quiet zone. */
  function svgPath(matrix) {
    let d = '';
    matrix.modules.forEach((row, r) => row.forEach((dark, c) => { if (dark) d += `M${c + QUIET} ${r + QUIET}h1v1h-1z`; }));
    return d;
  }

  return { encode, svgPath, viewBoxSize };
});
