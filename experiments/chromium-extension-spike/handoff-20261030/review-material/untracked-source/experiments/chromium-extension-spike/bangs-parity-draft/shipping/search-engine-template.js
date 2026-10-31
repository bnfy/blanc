// Custom search engine addresses (Settings → General → Search engine →
// Custom…). Pure: no require('electron'), so the rules are unit-tested
// directly. Spec: docs/superpowers/specs/2026-10-14-kagi-and-custom-search-design.md
//
// A template is the user's search address with %s where the query goes, the
// convention Chrome, Firefox, Vivaldi and Kagi's and SearXNG's setup guides
// use, so users can paste what those guides give them.
const { isLocalNetworkHost } = require('./site-security');

const MAX_TEMPLATE_LENGTH = 2048;
const PLACEHOLDER = '%s';
// Stands in for the query while a template is parsed. Lowercase ASCII, so it
// survives host normalization unchanged and can be found again.
const PROBE = 'blancsearchprobe';

function parseTemplate(value) {
  if (typeof value !== 'string') return null;
  const template = value.trim();
  if (!template || template.length > MAX_TEMPLATE_LENGTH) return null;
  // Exactly one lowercase %s. %S and OpenSearch's {searchTerms} are refused
  // rather than silently searching for literal text.
  if (template.split(PLACEHOLDER).length !== 2) return null;
  let url;
  try {
    url = new URL(template.replace(PLACEHOLDER, PROBE));
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  // The query must land after the host and port, so typed words can never
  // become part of a server name and leak through a DNS lookup.
  if (url.host.includes(PROBE)) return null;
  if (url.protocol === 'https:') return { template, url };
  // Plain http:// only to this computer or the home network: searches to a
  // server on the internet must not travel unencrypted.
  if (url.protocol === 'http:' && isLocalNetworkHost(url.hostname)) return { template, url };
  return null;
}

function isValidSearchTemplate(value) {
  return parseTemplate(value) !== null;
}

function searchUrlFromTemplate(template, query) {
  const parsed = parseTemplate(template);
  if (!parsed) return null;
  const encoded = encodeURIComponent(String(query));
  // A function replacement: a string one would expand $& and $1 in the query.
  return parsed.template.replace(PLACEHOLDER, () => encoded);
}

// The server's name, shown as the ⌘L search row's tag. URL.host already
// lowercases and drops a default port.
function searchTemplateLabel(template) {
  const parsed = parseTemplate(template);
  return parsed ? parsed.url.host.replace(/^www\./, '') : '';
}

// Cross-field write rule, the search counterpart of reconcileSecureDnsWrite.
// Given the stored { searchEngine, searchEngineTemplate } and an already
// sanitized partial, return only the keys to write. A change that would leave
// Custom selected without a valid address is refused whole ({}), keeping the
// previous engine and address. Keys the partial didn't touch are never
// returned, so they are not re-stamped for Profile Sync.
function reconcileSearchEngineWrite(prev, incoming) {
  const touchesEngine = 'searchEngine' in incoming;
  const touchesTemplate = 'searchEngineTemplate' in incoming;
  if (!touchesEngine && !touchesTemplate) return {};
  const engine = touchesEngine ? incoming.searchEngine : prev.searchEngine;
  const template = touchesTemplate ? incoming.searchEngineTemplate : prev.searchEngineTemplate;
  if (engine === 'custom' && !isValidSearchTemplate(template)) return {};
  const out = {};
  if (touchesEngine) out.searchEngine = engine;
  if (touchesTemplate) out.searchEngineTemplate = template;
  return out;
}

module.exports = {
  MAX_TEMPLATE_LENGTH,
  isValidSearchTemplate,
  searchUrlFromTemplate,
  searchTemplateLabel,
  reconcileSearchEngineWrite,
};
