// The icon server's pure rules: which paths it answers, which addresses it
// may fetch, which bytes count as an icon, and where a homepage says its icon
// is. Nothing here touches the network.

export const LIMITS = { htmlBytes: 262144, imageBytes: 102400, redirects: 3, timeoutMs: 5000 };

const PATH_PREFIX = '/bang-icons/';
// A DNS name with at least one dot, lowercase, as the bang list stores hosts.
const HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const PRIVATE_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa', '.lan'];

/** The host a `/bang-icons/<host>` path names, or null for anything else. */
export function hostFromPath(pathname) {
  if (!pathname.startsWith(PATH_PREFIX)) return null;
  const host = pathname.slice(PATH_PREFIX.length);
  return HOST.test(host) ? host : null;
}

/**
 * Whether the server may fetch `url`, following the app's own favicon rules:
 * plain http(s) on a default port, no credentials, and never an IP literal or
 * a local network name. The URL parser has already turned numeric IPv4 forms
 * (`2130706433`, `0x7f.1`) into dotted decimal.
 */
export function isPublicUrl(url) {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (url.username || url.password) return false;
  if (url.port !== '' && url.port !== '80' && url.port !== '443') return false;
  const host = url.hostname;
  if (host.startsWith('[') || /^\d+(?:\.\d+){3}$/.test(host)) return false;
  if (host === 'localhost' || PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix))) return false;
  return host.includes('.');
}

const startsWith = (data, ...values) => values.every((value, i) => data[i] === value);
const ascii = (data, offset, value) => [...value].every((char, i) => data[offset + i] === char.charCodeAt(0));

/** The image type `data` really is, by its magic number; never SVG or HTML. */
export function sniffImageType(data) {
  if (startsWith(data, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (startsWith(data, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (ascii(data, 0, 'GIF87a') || ascii(data, 0, 'GIF89a')) return 'image/gif';
  if (ascii(data, 0, 'RIFF') && ascii(data, 8, 'WEBP')) return 'image/webp';
  if (startsWith(data, 0x00, 0x00, 0x01, 0x00)) return 'image/x-icon';
  return null;
}

const LINK = /<link\b[^>]*>/gi;
const ATTRIBUTE = /([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const ICON_RELS = new Set(['icon', 'apple-touch-icon', 'apple-touch-icon-precomposed']);

function attributes(tag) {
  const found = {};
  for (const match of tag.matchAll(ATTRIBUTE)) found[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4];
  return found;
}

// The largest size a link declares; without `sizes`, an Apple touch icon is
// usually 180px and a plain icon 32px.
function declaredSize(rels, sizes) {
  const numbers = String(sizes ?? '').match(/\d+/g);
  if (numbers) return Math.max(...numbers.map(Number));
  return rels.some((rel) => rel.startsWith('apple-touch-icon')) ? 180 : 32;
}

/**
 * The icon URLs a homepage declares, best first: those at least 64px from
 * the smallest up (sharp but light), then the smaller ones largest first,
 * then the site's /favicon.ico. SVG is skipped; the server never serves it.
 */
export function iconCandidates(html, pageUrl) {
  const found = [];
  for (const [tag] of html.matchAll(LINK)) {
    const attrs = attributes(tag);
    const rels = String(attrs.rel ?? '').toLowerCase().split(/\s+/);
    if (!rels.some((rel) => ICON_RELS.has(rel)) || !attrs.href) continue;
    if (/svg/i.test(attrs.type ?? '') || /\.svg(?:[?#]|$)/i.test(attrs.href)) continue;
    let url;
    try { url = new URL(attrs.href, pageUrl); } catch { continue; }
    if (url.protocol === 'https:' || url.protocol === 'http:') found.push({ href: url.href, size: declaredSize(rels, attrs.sizes) });
  }
  const sharp = found.filter((icon) => icon.size >= 64).sort((a, b) => a.size - b.size);
  const small = found.filter((icon) => icon.size < 64).sort((a, b) => b.size - a.size);
  return [...new Set([...sharp, ...small].map((icon) => icon.href).concat(new URL('/favicon.ico', pageUrl).href))];
}
