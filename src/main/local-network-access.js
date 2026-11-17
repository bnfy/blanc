'use strict';

// Local Network Access (spec docs/superpowers/specs/2026-11-17-local-network-access-design.md).
// Pure classification for the request gate: which requests move inward from a
// website to this device or the local network, and whose decision applies.
// No electron here, so it unit-tests in plain node.
//
// Classification is by NAME, before the request is sent: Electron's
// onBeforeRequest has no resolved address. A public name that resolves to a
// private address (an intranet name, DNS rebinding) reads as public and is not
// gated. That gap is accepted and documented in the spec.

const net = require('node:net');

const WEB_TARGET_SCHEMES = new Set(['http:', 'https:', 'ws:', 'wss:']);
const WEB_INITIATOR_SCHEMES = new Set(['http:', 'https:']);

function ipv4Parts(host) {
  if (!net.isIPv4(host)) return null;
  return host.split('.').map(Number);
}

function ipv4Space([a, b]) {
  if (a === 127 || (a === 0 && b === 0)) return 'loopback'; // 0.0.0.0/16 reaches this host on macOS and Linux
  if (a === 10) return 'local';
  if (a === 172 && b >= 16 && b <= 31) return 'local';
  if (a === 192 && b === 168) return 'local';
  if (a === 169 && b === 254) return 'local';
  if (a === 100 && b >= 64 && b <= 127) return 'local';
  return 'public';
}

// Expand an IPv6 literal (without brackets) to eight 16-bit numbers. URL
// hostnames are already normalized to hex, so a dotted IPv4 tail never
// arrives here; anything unexpected reads as public.
function ipv6Hextets(host) {
  if (!net.isIPv6(host) || host.includes('.')) return null;
  const [head, tail] = host.includes('::') ? host.split('::') : [host, null];
  const front = head ? head.split(':') : [];
  const back = tail ? tail.split(':') : [];
  const fill = 8 - front.length - back.length;
  return [...front, ...Array(fill).fill('0'), ...back].map((word) => parseInt(word, 16));
}

function ipv6Space(words) {
  if (words.slice(0, 7).every((w) => w === 0) && (words[7] === 1 || words[7] === 0)) return 'loopback';
  // IPv4-mapped ::ffff:a.b.c.d
  if (words.slice(0, 5).every((w) => w === 0) && words[5] === 0xffff) {
    return ipv4Space([words[6] >> 8, words[6] & 0xff, words[7] >> 8, words[7] & 0xff]);
  }
  if ((words[0] & 0xfe00) === 0xfc00) return 'local'; // fc00::/7 unique local
  if ((words[0] & 0xffc0) === 0xfe80) return 'local'; // fe80::/10 link-local
  return 'public';
}

/** 'loopback' | 'local' | 'public' for a URL's hostname (IPv6 in brackets). */
function addressSpaceOfHost(hostname) {
  if (typeof hostname !== 'string' || !hostname) return 'public';
  let host = hostname.toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) {
    const words = ipv6Hextets(host.slice(1, -1));
    return words ? ipv6Space(words) : 'public';
  }
  if (host.endsWith('.')) host = host.slice(0, -1);
  const v4 = ipv4Parts(host);
  if (v4) return ipv4Space(v4);
  if (host === 'localhost' || host.endsWith('.localhost')) return 'loopback';
  // Names reserved for private networks: mDNS (.local, RFC 6762), home
  // networks (.home.arpa, RFC 8375) and ICANN's private-use .internal.
  if (host.endsWith('.local') || host.endsWith('.home.arpa') || host.endsWith('.internal')) return 'local';
  return 'public';
}

const RANK = { public: 0, local: 1, loopback: 2 };

/** The permission a move from one space to another needs, or null. */
function gatedScope(initiatorSpace, targetSpace) {
  if (!(RANK[targetSpace] > RANK[initiatorSpace])) return null;
  return targetSpace === 'loopback' ? 'loopback-network' : 'local-network';
}

function parse(url) {
  try { return new URL(url); } catch { return null; }
}

/**
 * Decide whether a request is gated and whose decision applies.
 *  details: { url, resourceType, initiatorOrigin } from onBeforeRequest.
 *  frame:   { frameOrigin, topOrigin } for the requesting frame, or null when
 *           the request has no live frame (a worker, a navigated frame).
 * Returns null (not gated) or { scope, origin, mode }:
 *  'prompt'      ask the top-level site (origin) if undecided;
 *  'stored-only' no one to ask: only a stored allow for origin lets it through;
 *  'deny'        refused without a prompt (opaque or cross-origin frame).
 */
function classifyRequest(details, frame) {
  if (!details || details.resourceType === 'mainFrame') return null;
  const target = parse(details.url);
  if (!target || !WEB_TARGET_SCHEMES.has(target.protocol)) return null;
  const initiatorOrigin = details.initiatorOrigin;
  if (typeof initiatorOrigin !== 'string' || !initiatorOrigin) return null;
  const targetSpace = addressSpaceOfHost(target.hostname);
  if (targetSpace === 'public') return null;

  if (initiatorOrigin === 'null') {
    // Opaque origin: nothing to key a decision on. A sandboxed document in
    // any space still reads as public here, which is the safe direction.
    return { scope: gatedScope('public', targetSpace), origin: null, mode: 'deny' };
  }
  const initiator = parse(initiatorOrigin);
  if (!initiator || !WEB_INITIATOR_SCHEMES.has(initiator.protocol)) return null;
  const scope = gatedScope(addressSpaceOfHost(initiator.hostname), targetSpace);
  if (!scope) return null;

  const origin = initiator.origin;
  const topOrigin = frame?.topOrigin || null;
  if (!frame || !frame.frameOrigin || !topOrigin) return { scope, origin, mode: 'stored-only' };
  if (origin !== topOrigin) return { scope, origin: topOrigin, mode: 'deny' };
  return { scope, origin: topOrigin, mode: 'prompt' };
}

module.exports = { addressSpaceOfHost, gatedScope, classifyRequest };
