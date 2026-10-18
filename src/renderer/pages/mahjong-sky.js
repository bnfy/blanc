// Mahjong's board-cleared sky: a photographic sunrise by day (bloom, light
// shafts, starburst, anamorphic streak and lens-flare ghosts) and a textured
// moonrise among twinkling stars at night, painted on a canvas. Feature
// layout is deterministic and exported for Node unit tests; painting runs
// only in the page.
(() => {
  'use strict';

  // mulberry32: small, fast, seedable.
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const easeOutCubic = (p) => 1 - (1 - p) ** 3;
  const smooth = (from, to, p) => {
    const x = Math.min(1, Math.max(0, (p - from) / (to - from)));
    return x * x * (3 - 2 * x);
  };

  // Maria and craters in unit-disc coordinates (the moon spans -1..1).
  function moonFeatures(seed) {
    const r = rng(seed);
    const place = (radius) => {
      const angle = r() * Math.PI * 2;
      const dist = Math.sqrt(r()) * Math.max(0, 1 - radius - 0.005);
      return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, r: radius };
    };
    // Seas cluster in a few regions, as on the real near side.
    const maria = [];
    for (let cluster = 0; cluster < 4; cluster++) {
      const centre = place(0.42);
      for (let i = 0; i < 5; i++) {
        const radius = 0.08 + r() * 0.16;
        const x = centre.x + (r() - 0.5) * 0.5;
        const y = centre.y + (r() - 0.5) * 0.5;
        const scale = Math.min(1, (1 - radius - 0.005) / Math.max(1e-6, Math.hypot(x, y)));
        maria.push({ x: x * scale, y: y * scale, r: radius, alpha: 0.2 + r() * 0.16 });
      }
    }
    const craters = Array.from({ length: 150 }, () => ({
      ...place(0.006 + 0.07 * r() ** 3.2),
      depth: 0.3 + r() * 0.7,
      bright: r() < 0.05,
    }));
    return { maria, craters };
  }

  function starField(seed, count) {
    const r = rng(seed);
    return Array.from({ length: count }, () => {
      const size = 0.4 + r() ** 3 * 1.7;
      return {
        x: r(),
        y: r() * 0.8,
        size,
        alpha: 0.35 + r() * 0.65,
        phase: r() * Math.PI * 2,
        speed: 1.2 + r() * 3,
        warm: r(),
        glint: size > 1.25,
      };
    });
  }

  // Ghost reflections sit on the line from the light through the frame
  // centre (t = 1) and beyond, as a real lens throws them.
  const GHOSTS = [
    [0.42, 0.55, 0.16, '255, 196, 120', 'disc'],
    [0.78, 1.3, 0.1, '150, 205, 255', 'ring'],
    [1.12, 0.32, 0.22, '255, 236, 180', 'disc'],
    [1.42, 2.1, 0.08, '170, 255, 210', 'hex'],
    [1.78, 0.85, 0.12, '255, 175, 205', 'disc'],
    [2.25, 2.9, 0.06, '200, 185, 255', 'ring'],
  ];
  function flareGhosts(sun, centre) {
    const dx = centre.x - sun.x;
    const dy = centre.y - sun.y;
    return GHOSTS.map(([t, size, alpha, rgb, kind]) => ({ x: sun.x + dx * t, y: sun.y + dy * t, size, alpha, rgb, kind }));
  }

  // The shaft sprite is blurred and drawn scaled, so a bounded size looks the
  // same on a 5K display without allocating hundreds of megabytes.
  const SHAFT_MAX = 768;
  const shaftLength = (w, h) => Math.min(SHAFT_MAX, Math.round(Math.max(w, h) * 0.75));

  const REST = { sun: 0.58, moon: 0.4 };
  const COLUMN = { sun: 0.36, moon: 0.62 };
  function risePath(p, w, h, kind) {
    const startY = h * 1.15;
    return { x: w * COLUMN[kind], y: startY + (h * REST[kind] - startY) * easeOutCubic(p) };
  }

  // --- painting -------------------------------------------------------------

  function canvasOf(width, height) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(width));
    c.height = Math.max(1, Math.round(height));
    return c;
  }

  function moonTexture(diameter, seed) {
    const c = canvasOf(diameter, diameter);
    const ctx = c.getContext('2d');
    const R = diameter / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R, 0, Math.PI * 2);
    ctx.clip();
    const base = ctx.createRadialGradient(R * 0.72, R * 0.68, R * 0.05, R, R, R);
    base.addColorStop(0, '#f6f3ec');
    base.addColorStop(0.65, '#dcd7cb');
    base.addColorStop(1, '#a9a396');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, diameter, diameter);
    const { maria, craters } = moonFeatures(seed);
    for (const m of maria) {
      ctx.filter = `blur(${Math.max(1, m.r * R * 0.45)}px)`;
      ctx.fillStyle = `rgba(82, 84, 94, ${m.alpha})`;
      ctx.beginPath();
      ctx.arc(R + m.x * R, R + m.y * R, m.r * R, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.filter = 'none';
    for (const k of craters) {
      const x = R + k.x * R;
      const y = R + k.y * R;
      const cr = Math.max(0.7, k.r * R);
      // Floor, then the inner wall: shadowed toward the light (upper left),
      // lit on the far side, as sunlight falls into a bowl.
      const floor = ctx.createRadialGradient(x + cr * 0.15, y + cr * 0.15, 0, x, y, cr);
      floor.addColorStop(0, `rgba(96, 92, 88, ${0.16 * k.depth})`);
      floor.addColorStop(1, 'rgba(96, 92, 88, 0)');
      ctx.fillStyle = floor;
      ctx.beginPath();
      ctx.arc(x, y, cr, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(0.5, cr * 0.22);
      ctx.strokeStyle = `rgba(48, 46, 44, ${0.34 * k.depth})`;
      ctx.beginPath();
      ctx.arc(x, y, cr * 0.82, Math.PI * 0.95, Math.PI * 1.65);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255, 252, 244, ${0.3 * k.depth})`;
      ctx.beginPath();
      ctx.arc(x, y, cr * 0.82, -Math.PI * 0.08, Math.PI * 0.62);
      ctx.stroke();
      if (k.bright) {
        const glow = ctx.createRadialGradient(x, y, 0, x, y, cr * 5);
        glow.addColorStop(0, 'rgba(255, 255, 250, 0.35)');
        glow.addColorStop(1, 'rgba(255, 255, 250, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, cr * 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Fine regolith grain.
    const image = ctx.getImageData(0, 0, c.width, c.height);
    const grain = rng(seed + 101);
    for (let i = 0; i < image.data.length; i += 4) {
      const n = (grain() - 0.5) * 20;
      image.data[i] += n;
      image.data[i + 1] += n;
      image.data[i + 2] += n;
    }
    ctx.putImageData(image, 0, 0);
    // Limb darkening and a soft terminator: a waxing gibbous moon.
    const limb = ctx.createRadialGradient(R, R, R * 0.5, R, R, R);
    limb.addColorStop(0, 'rgba(30, 28, 40, 0)');
    limb.addColorStop(1, 'rgba(30, 28, 40, 0.5)');
    ctx.fillStyle = limb;
    ctx.fillRect(0, 0, diameter, diameter);
    const terminator = ctx.createLinearGradient(diameter * 0.55, 0, diameter, 0);
    terminator.addColorStop(0, 'rgba(14, 16, 32, 0)');
    terminator.addColorStop(1, 'rgba(14, 16, 32, 0.72)');
    ctx.fillStyle = terminator;
    ctx.fillRect(0, 0, diameter, diameter);
    ctx.restore();
    return c;
  }

  function shaftSprite(length, seed) {
    const size = length * 2;
    const c = canvasOf(size, size);
    const ctx = c.getContext('2d');
    const r = rng(seed);
    ctx.translate(length, length);
    ctx.filter = `blur(${Math.max(2, length * 0.012)}px)`;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 30; i++) {
      const angle = (i / 30) * Math.PI * 2 + (r() - 0.5) * 0.18;
      const spread = 0.018 + r() * 0.032;
      const reach = length * (0.55 + r() * 0.45);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, reach);
      const a = 0.22 + r() * 0.22;
      g.addColorStop(0, `rgba(255, 236, 190, ${a})`);
      g.addColorStop(0.35, `rgba(255, 214, 150, ${a * 0.55})`);
      g.addColorStop(1, 'rgba(255, 200, 130, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, reach, angle - spread, angle + spread);
      ctx.closePath();
      ctx.fill();
    }
    return c;
  }

  function radial(ctx, x, y, r0, r1, stops) {
    const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
    for (const [at, color] of stops) g.addColorStop(at, color);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r1, 0, Math.PI * 2);
    ctx.fill();
  }

  function paintGhost(ctx, ghost, R, strength) {
    const r = R * ghost.size;
    const a = ghost.alpha * strength;
    ctx.save();
    ctx.translate(ghost.x, ghost.y);
    if (ghost.kind === 'ring') {
      ctx.strokeStyle = `rgba(${ghost.rgb}, ${a})`;
      ctx.lineWidth = Math.max(1, r * 0.08);
      ctx.filter = `blur(${Math.max(1, r * 0.04)}px)`;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (ghost.kind === 'hex') {
      ctx.fillStyle = `rgba(${ghost.rgb}, ${a * 0.8})`;
      ctx.filter = `blur(${Math.max(1, r * 0.06)}px)`;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const t = (i / 6) * Math.PI * 2 + 0.2;
        ctx[i ? 'lineTo' : 'moveTo'](Math.cos(t) * r, Math.sin(t) * r);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      radial(ctx, 0, 0, 0, r, [[0, `rgba(${ghost.rgb}, ${a * 0.5})`], [0.8, `rgba(${ghost.rgb}, ${a})`], [1, `rgba(${ghost.rgb}, 0)`]]);
    }
    ctx.restore();
  }

  function paintSunrise(ctx, w, h, p, t, scene) {
    const { R, shafts, quiet } = scene;
    const sun = risePath(p, w, h, 'sun');
    const glow = smooth(0.05, 0.6, p);
    const rays = quiet ? 0 : smooth(0.3, 0.85, p);
    const flare = quiet ? 0 : smooth(0.45, 0.95, p);
    const far = Math.max(w, h);

    ctx.globalCompositeOperation = 'screen';
    radial(ctx, sun.x, sun.y, 0, far * 1.1, [
      [0, `rgba(255, 200, 128, ${0.42 * glow})`],
      [0.4, `rgba(255, 176, 112, ${0.2 * glow})`],
      [1, 'rgba(255, 170, 110, 0)'],
    ]);
    const band = ctx.createLinearGradient(0, h * 0.62, 0, h);
    band.addColorStop(0, 'rgba(255, 186, 120, 0)');
    band.addColorStop(1, `rgba(255, 178, 118, ${0.3 * glow})`);
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = 'lighter';
    if (rays > 0) {
      ctx.save();
      ctx.globalAlpha = rays;
      ctx.translate(sun.x, sun.y);
      ctx.rotate(t * 0.00005);
      ctx.scale(scene.shaftScale, scene.shaftScale);
      ctx.drawImage(shafts, -shafts.width / 2, -shafts.height / 2);
      ctx.restore();
    }
    radial(ctx, sun.x, sun.y, R * 0.6, R * 7, [
      [0, `rgba(255, 244, 214, ${0.7 * glow})`],
      [0.3, `rgba(255, 210, 140, ${0.22 * glow})`],
      [1, 'rgba(255, 196, 120, 0)'],
    ]);
    ctx.globalCompositeOperation = 'source-over';
    radial(ctx, sun.x, sun.y, 0, R * 1.06, [
      [0, '#ffffff'],
      [0.55, '#fff7dc'],
      [0.88, '#ffd98c'],
      [1, 'rgba(255, 196, 100, 0)'],
    ]);
    ctx.globalCompositeOperation = 'lighter';
    if (flare > 0) {
      // Starburst spikes from the aperture blades.
      ctx.save();
      ctx.translate(sun.x, sun.y);
      ctx.rotate(0.3 + t * 0.00008);
      for (let i = 0; i < 8; i++) {
        ctx.rotate(Math.PI / 4);
        const len = R * (i % 2 ? 5 : 8.5);
        const g = ctx.createLinearGradient(0, 0, len, 0);
        g.addColorStop(0, `rgba(255, 244, 220, ${0.55 * flare})`);
        g.addColorStop(1, 'rgba(255, 244, 220, 0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = Math.max(1, R * 0.03);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(len, 0);
        ctx.stroke();
      }
      ctx.restore();
      // Anamorphic streak.
      ctx.save();
      ctx.translate(sun.x, sun.y);
      ctx.scale(1, 0.03);
      radial(ctx, 0, 0, 0, w * 0.55, [[0, `rgba(255, 226, 180, ${0.5 * flare})`], [1, 'rgba(255, 226, 180, 0)']]);
      ctx.restore();
      for (const ghost of flareGhosts(sun, { x: w / 2, y: h / 2 })) paintGhost(ctx, ghost, R, flare);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function paintMoonrise(ctx, w, h, p, t, scene) {
    const { R, moon, stars, dpr } = scene;
    const pos = risePath(p, w, h, 'moon');
    const show = smooth(0, 0.35, p);
    ctx.globalCompositeOperation = 'lighter';
    for (const s of stars) {
      const x = s.x * w;
      const y = s.y * h;
      const nearMoon = Math.min(1, Math.hypot(x - pos.x, y - pos.y) / (R * 4));
      const a = s.alpha * show * nearMoon * (0.55 + 0.45 * Math.sin(t * 0.001 * s.speed + s.phase));
      if (a <= 0.01) continue;
      const tint = s.warm > 0.8 ? '255, 230, 200' : s.warm < 0.2 ? '200, 215, 255' : '255, 255, 255';
      radial(ctx, x, y, 0, s.size * dpr * 2.2, [[0, `rgba(${tint}, ${a})`], [0.4, `rgba(${tint}, ${a * 0.5})`], [1, `rgba(${tint}, 0)`]]);
      if (s.glint) {
        ctx.strokeStyle = `rgba(${tint}, ${a * 0.5})`;
        ctx.lineWidth = Math.max(0.6, dpr * 0.5);
        const len = s.size * dpr * 6;
        ctx.beginPath();
        ctx.moveTo(x - len, y); ctx.lineTo(x + len, y);
        ctx.moveTo(x, y - len); ctx.lineTo(x, y + len);
        ctx.stroke();
      }
    }
    radial(ctx, pos.x, pos.y, R * 0.9, R * 6, [
      [0, `rgba(214, 222, 255, ${0.3 * show})`],
      [0.35, `rgba(180, 190, 240, ${0.1 * show})`],
      [1, 'rgba(160, 170, 230, 0)'],
    ]);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = show;
    ctx.drawImage(moon, pos.x - R, pos.y - R, R * 2, R * 2);
    // Low on the horizon the moon looks warmer through more atmosphere.
    const low = 1 - easeOutCubic(p);
    if (low > 0.02) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = low * 0.4;
      ctx.fillStyle = '#ffae6b';
      ctx.fillRect(pos.x - R, pos.y - R, R * 2, R * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  const TIER_SCALE = { quiet: 0.8, standard: 1, grand: 1.2 };

  // Starts painting `canvas` and returns stop(). Progress runs over
  // `duration` ms, then the final frame keeps shimmering until stopped.
  function animate(canvas, { night = false, tier = 'standard', duration = 1200, seed = 7 } = {}) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const R = Math.min(w, h) * (night ? 0.075 : 0.085) * (TIER_SCALE[tier] || 1);
    const scene = night
      ? { R, dpr, moon: moonTexture(Math.round(R * 2), seed), stars: starField(seed, 90) }
      : { R, dpr, quiet: tier === 'quiet', shafts: tier === 'quiet' ? null : shaftSprite(shaftLength(w, h), seed), shaftScale: Math.max(w, h) * 0.75 / shaftLength(w, h) };
    const paint = night ? paintMoonrise : paintSunrise;
    const started = performance.now();
    let frame = 0;
    const draw = (now) => {
      const p = Math.min(1, (now - started) / duration);
      ctx.clearRect(0, 0, w, h);
      paint(ctx, w, h, p, now - started, scene);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      ctx.clearRect(0, 0, w, h);
    };
  }

  const exports = { rng, moonFeatures, starField, flareGhosts, risePath, easeOutCubic, shaftLength, animate };
  if (typeof module !== 'undefined' && module.exports) module.exports = exports;
  else window.MahjongSky = exports;
})();
