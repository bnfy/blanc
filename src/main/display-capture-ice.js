'use strict';

const MAX_SIGNAL_BYTES = 65536;
const LOOPBACK_V4 = /^127(?:\.\d{1,3}){3}$/;

function isLoopbackIp(ip) {
  if (ip === '::1') return true;
  return LOOPBACK_V4.test(ip);
}

function isAllowedIp(ip, localAddresses) {
  if (typeof ip !== 'string' || !ip) return false;
  if (isLoopbackIp(ip)) return true;
  return localAddresses instanceof Set && localAddresses.has(ip);
}

function parseCandidateIp(line) {
  const raw = String(line).trim();
  const body = raw.startsWith('a=') ? raw.slice(2) : raw;
  if (!body.startsWith('candidate:')) return { ok: false, ip: null };
  const parts = body.split(/\s+/);
  // candidate:<foundation> <component> <proto> <priority> <ip> <port> typ ...
  if (parts.length < 8 || parts[6] !== 'typ') return { ok: false, ip: null };
  const ip = parts[4];
  if (!ip) return { ok: false, ip: null };
  return { ok: true, ip };
}

function parseConnectionIp(line) {
  const match = /^c=IN IP4 ([^\s]+)$/.exec(line.trim())
    || /^c=IN IP6 ([^\s]+)$/.exec(line.trim());
  if (!match) return null;
  return match[1];
}

function filterSignaling(sdpOrCandidate, { localAddresses } = {}) {
  if (typeof sdpOrCandidate !== 'string') return { ok: false, reason: 'type' };
  if (Buffer.byteLength(sdpOrCandidate, 'utf8') > MAX_SIGNAL_BYTES) {
    return { ok: false, reason: 'size' };
  }
  const trimmed = sdpOrCandidate.trim();
  if (!trimmed) return { ok: false, reason: 'empty' };

  const isSingleCandidate = !trimmed.includes('\n')
    && (trimmed.startsWith('a=candidate:') || trimmed.startsWith('candidate:'));
  if (isSingleCandidate) {
    const parsed = parseCandidateIp(trimmed);
    if (!parsed.ok) return { ok: false, reason: 'unparseable' };
    if (!isAllowedIp(parsed.ip, localAddresses)) return { ok: false, reason: 'remote' };
    return { ok: true, candidate: trimmed.startsWith('a=') ? trimmed : `a=${trimmed}` };
  }

  const kept = [];
  for (const line of sdpOrCandidate.replace(/\r\n/g, '\n').split('\n')) {
    if (line.startsWith('a=candidate:') || line.startsWith('candidate:')) {
      const parsed = parseCandidateIp(line);
      if (!parsed.ok) return { ok: false, reason: 'unparseable' };
      if (!isAllowedIp(parsed.ip, localAddresses)) continue;
      kept.push(line.startsWith('a=') ? line : `a=${line}`);
      continue;
    }
    const connIp = parseConnectionIp(line);
    if (connIp && connIp !== '0.0.0.0' && connIp !== '::' && !isAllowedIp(connIp, localAddresses)) {
      return { ok: false, reason: 'remote' };
    }
    kept.push(line);
  }
  return { ok: true, sdp: kept.join('\n') };
}

function collectLocalAddresses() {
  const os = require('node:os');
  const out = new Set(['127.0.0.1', '::1']);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const entry of list || []) {
      if (entry?.address) out.add(entry.address);
    }
  }
  return out;
}

module.exports = { filterSignaling, MAX_SIGNAL_BYTES, collectLocalAddresses };
