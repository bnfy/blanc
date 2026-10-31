'use strict';
const Bangs = require('./shipping/bangs');
const { isValidSearchTemplate } = require('./shipping/search-engine-template');
const MAX_CUSTOM_BANGS = 100;
const MAX_RECENT_BANGS = 10;
const MAX_CUSTOM_BANG_NAME = 60;

/** A person's own bangs: { code, name, template } rows, code per the shared
 * grammar and lowercased, name trimmed to 1–60 characters, template valid
 * by the custom search address's rule. Junk rows are dropped, unknown keys
 * stripped, the first of a duplicate code kept, at most 100. */
function normalizeCustomBangs(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const code = typeof row.code === 'string' ? row.code.trim().toLowerCase() : '';
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const template = typeof row.template === 'string' ? row.template.trim() : '';
    if (!Bangs.isBangCode(code) || seen.has(code)) continue;
    if (!name || name.length > MAX_CUSTOM_BANG_NAME) continue;
    if (!isValidSearchTemplate(template)) continue;
    seen.add(code);
    out.push({ code, name, template });
    if (out.length >= MAX_CUSTOM_BANGS) break;
  }
  return out;
}

function normalizeRecentBangs(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const code of value) {
    if (!Bangs.isBangCode(code) || out.includes(code)) continue;
    out.push(code);
    if (out.length >= MAX_RECENT_BANGS) break;
  }
  return out;
}

module.exports = { normalizeCustomBangs, normalizeRecentBangs };
