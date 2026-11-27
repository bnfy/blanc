const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { cx, cy, rx, ry, rays, rayWidth, water } = require('../../scripts/sunrise-geometry');

const root = path.resolve(__dirname, '../..');
const classic = path.join(root, 'build/app-icons/Icon.icon/Assets');
const amber = path.join(root, 'ios/Blanc/Blanc/AppIcons/AppIcon.icon');
const alpha = image => sharp(image).ensureAlpha().extractChannel('alpha').raw().toBuffer();

test('Classic, Amber Glass and the flat master share the approved ray tips and reflection spacing', async () => {
  const native = JSON.parse(fs.readFileSync(path.join(amber, 'icon.json')));
  const dy = native.groups[0].layers[0].position['translation-in-points'][1];
  const apple = async name => {
    const png = await sharp(path.join(amber, 'Assets', name + '.svg')).png().toBuffer();
    const shifted = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#00000000' } })
      .composite([{ input: await sharp(png).extract({ left: 0, top: -Math.round(dy), width: 1024, height: 1024 + Math.round(dy) }).png().toBuffer(), left: 0, top: 0 }])
      .png().toBuffer();
    return alpha(shifted);
  };
  const rayMasks = await Promise.all(rays.map((_, i) => alpha(path.join(classic, `Sunrise Ray ${i + 1}.png`))));
  const amberRays = await apple('Rays');
  const master = await alpha(await sharp(path.join(root, 'assets/sunrise-mark-4096.png')).resize(1024).png().toBuffer());
  const pixel = (mask, x, y) => mask[Math.round(y) * 1024 + Math.round(x)];
  for (const [i, { angle, ends: [x1, y1, x2, y2] }] of rays.entries()) {
    const a = angle * Math.PI / 180;
    for (const offset of [-2, 2]) {
      const x = x2 + (rayWidth / 2 + offset) * Math.sin(a);
      const y = y2 - (rayWidth / 2 + offset) * Math.cos(a);
      for (const mask of [rayMasks[i], amberRays, master]) assert.equal(pixel(mask, x, y) > 127, offset < 0, `ray ${i + 1} tip`);
    }
    const reflected = rays[6 - i].ends;
    assert.ok(Math.abs(x1 + reflected[0] - 2 * cx) < 0.001 && Math.abs(y1 - reflected[1]) < 0.001);
  }
  const top = rays[3].ends[3] - rayWidth / 2;
  assert.ok(Math.abs(top - 130) < 0.5, 'approved middle tip on the 1024-point canvas');
  const sun = await apple('Sun');
  assert.ok(pixel(sun, cx, cy - ry + 2) > 127 && pixel(sun, cx + rx + 2, cy - 2) < 128);
  for (const [i, bar] of water.entries()) {
    const name = i === 0 ? 'Horizon' : `Reflection ${i}`;
    for (const mask of [await alpha(path.join(classic, `Sunrise ${name}.png`)), await apple(name), master]) {
      const y = bar.y + bar.height / 2;
      for (const x of [bar.x + 2, 2 * cx - bar.x - 2]) assert.ok(pixel(mask, x, y) > 127, name);
      for (const x of [bar.x - 2, 2 * cx - bar.x + 2]) assert.ok(pixel(mask, x, y) < 128, name);
    }
  }
});
