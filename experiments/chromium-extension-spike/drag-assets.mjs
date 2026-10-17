// Prototype-only correction discovered during the 157 native acceptance run.
// Empty sections can share a gap with a populated section. Prefer the source
// tab's bucket at that exact coordinate; do not skip nearer forbidden buckets.
export function prepareDragAsset(source) {
  const anchor = '      if (!best || Math.abs(slot.y - y) < Math.abs(best.y - y)) best = slot;';
  if (source.split(anchor).length !== 2) throw new Error('Tab drop resolver anchor changed');
  return source.replace(anchor, `      const allowed = source.pinned ? slot.pinned : slot.unpinned;
      const bestAllowed = best && (source.pinned ? best.pinned : best.unpinned);
      if (!best || Math.abs(slot.y - y) < Math.abs(best.y - y) ||
          (slot.y === best.y && allowed && !bestAllowed)) best = slot;`);
}
