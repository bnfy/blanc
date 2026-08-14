'use strict';

const dns = require('node:dns');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');

const MAX_BYTES = 256 * 1024;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 3000;
const FAVICON_REQUEST_HEADERS = Object.freeze({
  Accept: 'image/png,image/*;q=0.8',
  'Cache-Control': 'no-store',
  // Several public CDNs reject HTTP/1.1 requests unless the identity has the
  // ordinary browser shape. Keep it static and generic: no Blanc/Electron
  // version fingerprint, cookies, referrer, or page/session state.
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
});

// Keep families separate: adding the IPv4-mapped IPv6 range to a shared
// BlockList makes Node treat every IPv4 address as matching that IPv6 rule.
const deniedV4 = new net.BlockList();
const deniedV6 = new net.BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
  ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
]) deniedV4.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [
  ['::', 128], ['::1', 128], ['::ffff:0:0', 96], ['64:ff9b::', 96],
  ['64:ff9b:1::', 48], ['100::', 64], ['2001:db8::', 32],
  ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
]) deniedV6.addSubnet(network, prefix, 'ipv6');

function cleanAddress(address) {
  if (typeof address !== 'string' || address.includes('%')) return null;
  return address.toLowerCase().replace(/^\[|\]$/g, '');
}

function isPublicAddress(address, family = net.isIP(cleanAddress(address))) {
  const value = cleanAddress(address);
  if (!value || (family !== 4 && family !== 6)) return false;
  return family === 4
    ? !deniedV4.check(value, 'ipv4')
    : !deniedV6.check(value, 'ipv6');
}

async function resolvePinnedTarget(source, lookup = dns.promises.lookup) {
  let url;
  try { url = new URL(source); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  if (url.username || url.password) return null;
  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) return null;

  const literalFamily = net.isIP(hostname);
  let addresses;
  if (literalFamily) {
    addresses = [{ address: hostname, family: literalFamily }];
  } else {
    try { addresses = await lookup(hostname, { all: true, verbatim: true }); }
    catch { return null; }
  }
  if (!Array.isArray(addresses) || addresses.length === 0) return null;
  const normalized = addresses.map(({ address, family }) => ({
    address: cleanAddress(address),
    family: Number(family) || net.isIP(cleanAddress(address)),
  }));
  // Mixed public/private answers are rejected wholesale. Selecting only the
  // public answer would let an attacker race which address another resolver
  // or later request observes.
  if (normalized.some(({ address, family }) => !isPublicAddress(address, family))) return null;
  return { url, ...normalized[0], addresses: normalized };
}

// The socket-level lookup that pins the connection to the addresses resolved
// (and policy-checked) by resolvePinnedTarget, defeating DNS rebinding between
// resolution and connect. Node's autoSelectFamily path (default-on since 20)
// calls this with `{all: true}` and requires an array answer; the legacy path
// expects `(err, address, family)`. Answer whichever shape is asked for —
// getting it wrong aborts the connection before any bytes move. The array
// form carries the COMPLETE pinned set (every address passed the same policy
// check in one resolution), so Node's happy-eyeballs can fall back to the
// other approved family when the preferred one is unreachable — pinning only
// the first address silently re-broke dual-stack networks with one dead
// family, exactly the failure mode this module exists to avoid.
function pinnedLookup(target) {
  return (_hostname, options, callback) => {
    if (options?.all) {
      callback(null, target.addresses.map(({ address, family }) => ({ address, family })));
    } else {
      callback(null, target.address, target.family);
    }
  };
}

/** True when the connected peer is one of the pinned, policy-checked addresses. */
function isPinnedRemote(target, remote) {
  return target.addresses.some(({ address }) => address === remote);
}

function redirectSource(source, statusCode, location) {
  if (![301, 302, 303, 307, 308].includes(statusCode) || typeof location !== 'string') return null;
  try {
    const next = new URL(location, source);
    if (!['http:', 'https:'].includes(next.protocol) || next.username || next.password) return null;
    return next.href;
  } catch {
    return null;
  }
}

async function readIconBytesOnce(source, { signal, lookup } = {}) {
  const target = await resolvePinnedTarget(source, lookup);
  if (!target || signal?.aborted) return null;
  return new Promise((resolve) => {
    const client = target.url.protocol === 'https:' ? https : http;
    const options = {
      protocol: target.url.protocol,
      hostname: target.url.hostname,
      port: target.url.port || undefined,
      path: `${target.url.pathname}${target.url.search}`,
      method: 'GET',
      agent: false,
      signal,
      headers: FAVICON_REQUEST_HEADERS,
      lookup: pinnedLookup(target),
      ...(target.url.protocol === 'https:' ? { servername: target.url.hostname } : {}),
    };

    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    let request;
    try {
      request = client.request(options, (response) => {
        const remote = cleanAddress(response.socket?.remoteAddress);
        const remoteFamily = net.isIP(remote);
        if (
          !remote ||
          !isPublicAddress(remote, remoteFamily) ||
          !isPinnedRemote(target, remote)
        ) {
          response.resume();
          return done(null);
        }
        const redirect = redirectSource(target.url.href, response.statusCode, response.headers.location);
        if (redirect) {
          response.resume();
          return done({ redirect });
        }
        if (response.statusCode !== 200) {
          response.resume();
          return done(null);
        }
        const contentType = String(response.headers['content-type'] ?? '')
          .split(';', 1)[0].trim().toLowerCase();
        if (!/^image\/[a-z0-9][a-z0-9.+-]*$/.test(contentType)) {
          response.resume();
          return done(null);
        }
        const declared = Number(response.headers['content-length']);
        if (Number.isFinite(declared) && declared > MAX_BYTES) {
          response.resume();
          return done(null);
        }
        const chunks = [];
        let total = 0;
        response.on('data', (chunk) => {
          total += chunk.length;
          if (total > MAX_BYTES) response.destroy(new Error('favicon too large'));
          else chunks.push(chunk);
        });
        response.on('end', () => done({ contentType, bytes: Buffer.concat(chunks, total) }));
        response.on('error', () => done(null));
      });
    } catch {
      return done(null);
    }
    request.setTimeout(TIMEOUT_MS, () => request.destroy(new Error('favicon timeout')));
    request.on('error', () => done(null));
    request.end();
  });
}

async function readIconBytes(source, options = {}) {
  let current = source;
  const seen = new Set();
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    if (seen.has(current)) return null;
    seen.add(current);
    const result = await readIconBytesOnce(current, options);
    if (!result) return null;
    if (!result.redirect) return result;
    if (redirects === MAX_REDIRECTS) return null;
    current = result.redirect;
  }
  return null;
}

module.exports = {
  FAVICON_REQUEST_HEADERS,
  MAX_BYTES,
  isPublicAddress,
  redirectSource,
  resolvePinnedTarget,
  pinnedLookup,
  readIconBytes,
};
