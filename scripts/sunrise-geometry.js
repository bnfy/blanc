'use strict';

// Approved Sunrise on the 1024-point Icon Composer canvas. Amber Glass uses a
// 936-unit drawing grid for its sun and rays and a 180-unit grid for the water.
const unit = 1024 / 936;
const waterUnit = 1024 / 180;
const cx = 512;
const cy = 607 * unit - 6 * waterUnit;
const rx = 198 * unit;
const ry = 205 * unit;
const rayWidth = 34 * unit;
const fan = [
  [457, 235],
  [445.3682, 224.5776],
  [418.2516, 200.2074],
  [393.6536, 178.016],
];
const rays = [-72, -48, -24, 0, 24, 48, 72].map(angle => {
  const [tip, length] = fan[Math.abs(angle) / 24];
  const radial = distance => [
    cx + Math.sin(angle * Math.PI / 180) * distance,
    cy - Math.cos(angle * Math.PI / 180) * distance,
  ];
  return { angle, ends: [...radial((tip - length) * unit + rayWidth / 2), ...radial(tip * unit - rayWidth / 2)] };
});
const water = [
  [110, 140, 6], [119, 112, 5], [127, 80, 5],
  [135, 58, 5], [143, 30, 5], [151, 12, 5],
].map(([top, width, height]) => ({
  x: cx - width * waterUnit / 2, y: top * waterUnit, width: width * waterUnit, height: height * waterUnit,
}));

// The transparent master supplies the brushed metal within editable SVG
// contours. Embedding the material keeps downloaded SVGs self-contained.
function goldVector(master) {
  const n = value => Number(value.toFixed(5));
  const ray = ({ ends: [x1, y1, x2, y2] }) =>
    `<path d="M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}" stroke="url(#brass)" stroke-width="${n(rayWidth)}" stroke-linecap="round"/>`;
  const bar = ({ x, y, width, height }) =>
    `<rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" rx="${n(height / 2)}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs><pattern id="brass" patternUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><image width="1024" height="1024" xlink:href="data:image/png;base64,${master.toString('base64')}"/></pattern></defs>
  <g id="rays" fill="none">${rays.map(ray).join('\n    ')}</g>
  <path id="sun" d="M${n(cx - rx)} ${n(cy)}a${n(rx)} ${n(ry)} 0 0 1 ${n(2 * rx)} 0Z" fill="url(#brass)"/>
  <g id="horizon-and-reflections" fill="url(#brass)">${water.map(bar).join('\n    ')}</g>
</svg>\n`;
}

module.exports = { cx, cy, rx, ry, rayWidth, rays, water, goldVector };
