import outline from '../data/horizon-shield-outline.json' with { type: 'json' };

// The face retains the approved image's UV coordinates. A domed relief puts
// its two curved seams into the mesh, instead of painting them on a flat plane.
const columns = 96;
function frontDepth(x, v, t) {
  const interior = Math.max(0, 1 - t * t) * Math.sin(Math.PI * v);
  const upperSeam = 0.386 + 0.145 * x * x + 0.012 * x;
  const lowerSeam = 0.612 + 0.15 * x * x + 0.012 * x;
  const groove = Math.exp(-Math.pow((v - upperSeam) / 0.013, 2))
    + Math.exp(-Math.pow((v - lowerSeam) / 0.013, 2));
  return 0.075 + 0.17 * interior - 0.068 * groove * Math.sqrt(interior);
}
function geometry(positions, uvs, indices) {
  return { positions: new Float32Array(positions), uvs: new Float32Array(uvs), indices: new Uint32Array(indices) };
}
function surface(outline, depth, back = false) {
  const positions = [], uvs = [], indices = [];
  for (const [v, left, right] of outline) {
    for (let j = 0; j <= columns; j++) {
      const u = left + (right - left) * j / columns;
      const x = u * 2 - 1, y = 1 - v * 2, t = j / columns * 2 - 1;
      const z = depth(x, v, t);
      // The reverse is the very same relief and texture, turned 180 degrees.
      positions.push(back ? -x : x, y, back ? -z : z);
      uvs.push(u, 1 - v);
    }
  }
  for (let i = 0; i < outline.length - 1; i++) {
    for (let j = 0; j < columns; j++) {
      const a = i * (columns + 1) + j, b = a + 1, c = a + columns + 1, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return geometry(positions, uvs, indices);
}
function rim(outline, depth) {
  // Rounded solid perimeter joins front and back, including their narrow caps.
  const boundary = [];
  const top = outline[0], bottom = outline.at(-1);
  for (let j = 0; j <= columns; j++) boundary.push([top[1] + (top[2] - top[1]) * j / columns, top[0], top[1] + top[2], j / columns * 2 - 1]);
  for (const [v, left, right] of outline.slice(1)) boundary.push([right, v, left + right, 1]);
  for (let j = columns - 1; j >= 0; j--) boundary.push([bottom[1] + (bottom[2] - bottom[1]) * j / columns, bottom[0], bottom[1] + bottom[2], j / columns * 2 - 1]);
  for (const [v, left, right] of outline.slice(1, -1).reverse()) boundary.push([left, v, left + right, -1]);
  const rings = [[1, 0.075], [1.008, 0.059], [1.014, 0.03], [1.016, 0], [1.014, -0.03], [1.008, -0.059], [1, -0.075]];
  const positions = [], uvs = [], indices = [];
  for (const [scale, z] of rings) {
    for (const [u, v, center, t] of boundary) {
      // Join the slightly asymmetric original and its reverse without gaps.
      const reverseMix = (0.075 - z) / 0.15;
      const x = u * 2 - 1 + 2 * (1 - center) * reverseMix;
      positions.push(x * scale, (1 - v * 2) * scale, depth(u * 2 - 1, v, t) * z / 0.075);
      uvs.push(u, 1 - v);
    }
  }
  const n = boundary.length;
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < n; i++) {
      const a = r * n + i, b = r * n + (i + 1) % n, c = a + n, d = b + n;
      // This contour is clockwise from the front: the wall winds outward.
      indices.push(a, b, c, b, d, c);
    }
  }
  return geometry(positions, uvs, indices);
}
export function createShieldGeometry({ silhouette = outline, depth = frontDepth } = {}) {
  return { front: surface(silhouette, depth), back: surface(silhouette, depth, true), rim: rim(silhouette, depth) };
}
