import outline from '../data/blocker-shield-outline.json' with { type: 'json' };
import { createShieldGeometry } from './horizon-shield-model.js';

// The new face has one raised diagonal in place of Horizon's horizontal seams.
// Coordinates follow the band in the transparent bronze export. Both sides
// receive the same relief/UVs; the shared perimeter keeps every edge closed.
function blockerDepth(x, v, t) {
  const interior = Math.max(0, 1 - t * t) * Math.sin(Math.PI * v);
  const diagonal = 0.48 - 0.5 * x;
  const bandDistance = Math.abs(v - diagonal);
  const band = Math.exp(-Math.pow(bandDistance / 0.055, 6));
  const seam = Math.exp(-Math.pow((bandDistance - 0.071) / 0.012, 2));
  return 0.075 + 0.14 * interior + (0.048 * band - 0.03 * seam) * Math.sqrt(interior);
}

export function createBlockerShieldGeometry() {
  return createShieldGeometry({ silhouette: outline, depth: blockerDepth });
}
