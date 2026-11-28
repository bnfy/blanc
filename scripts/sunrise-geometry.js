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

const n = value => Number(value.toFixed(5));

// Use the historical material's own coordinates for its bevels. Only the
// straight sections change length, so all the tips retain round end caps.
function goldRay({ angle, ends: [insideX, insideY, tipX, tipY] }) {
  const scale = rayWidth / 23;
  const length = Math.hypot(tipX - insideX, tipY - insideY) / scale;
  const spine = `M0 0V${n(length)}`;
  return `<g transform="translate(${n(tipX)} ${n(tipY)}) rotate(${angle}) scale(${n(scale)})" stroke-linecap="round">
    <path d="${spine}" stroke="#785319" stroke-width="23"/>
    <path d="${spine}" stroke="url(#rayGold)" stroke-width="19.2"/>
    <path d="M-3.4 1V${n(length - 1)}" stroke="#fff0b3" stroke-opacity=".62" stroke-width="1.6"/>
    <path d="${spine}" stroke="url(#rayLight)" stroke-width="14"/>
    <path d="M-8.2 0a8.2 8.2 0 0 1 11.6 -7.45" stroke="#fff0bf" stroke-opacity=".79" stroke-width="1.05"/>
    <path d="M8.3 ${n(length)}a8.3 8.3 0 0 1 -8.3 8.3" stroke="#d1a452" stroke-opacity=".70" stroke-width=".9"/>
    <use xlink:href="#ray-grain" transform="scale(1 ${n(length / 228)})"/>
  </g>`;
}

function goldBar({ x, y, width, height }) {
  const scale = height / 26;
  const length = (width - height) / scale;
  const spine = `M0 0H${n(length)}`;
  return `<g transform="translate(${n(x + height / 2)} ${n(y + height / 2)}) scale(${n(scale)})" stroke-linecap="round">
    <path d="${spine}" stroke="#644313" stroke-width="26"/>
    <path d="${spine}" stroke="url(#barGold)" stroke-width="23"/>
    <path d="M-1 -7H${n(length + 1)}" stroke="#fff0b4" stroke-opacity=".8" stroke-width="1.1"/>
    <path d="${spine}" stroke="url(#recess)" stroke-width="8.4"/>
    <path d="M0 5.5H${n(length)}" stroke="#e7b64d" stroke-opacity=".5" stroke-width=".7"/>
  </g>`;
}

function goldVector(material) {
  const defs = material.slice(material.indexOf('<defs>'), material.lastIndexOf('</defs>') + '</defs>'.length);
  // The original face is a semicircle with radius 170, centered at (340,456).
  const discTransform = `translate(${n(cx)} ${n(cy)}) scale(${n(rx / 170)} ${n(ry / 170)}) translate(-340 -456)`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024" viewBox="0 0 1024 1024" fill="none">
  ${defs}
  <g id="rays">${rays.map(goldRay).join('\n    ')}</g>
  <use id="sun" xlink:href="#sun-disc" transform="${discTransform}"/>
  <g id="horizon-and-reflections">${water.map(goldBar).join('\n    ')}</g>
</svg>\n`;
}

module.exports = { cx, cy, rx, ry, rayWidth, rays, water, goldVector };
