'use strict';

// Tab group colors (spec 2026-10-17-tab-group-colors-design.md): a group may
// carry one of the eight Spaces presets, or no color. Pure — main, the
// persistence paths and Node tests share it.

const { PRESETS } = require('../renderer/space-identity');

/** A preset hex in lower case, or null for anything else (custom, malformed). */
function sanitizeGroupColor(value) {
  if (typeof value !== 'string') return null;
  const hex = value.trim().toLowerCase();
  return PRESETS.some((preset) => preset.hex === hex) ? hex : null;
}

/** A fresh, validated group record from a saved or captured one. Every copy
 * goes through here so a color is never dropped or trusted unchecked. */
function groupRecord(group) {
  return {
    id: group.id,
    name: group.name,
    collapsed: !!group.collapsed,
    color: sanitizeGroupColor(group.color),
  };
}

module.exports = { sanitizeGroupColor, groupRecord };
