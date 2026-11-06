// Node's crypto, as far as sync uses it. Every primitive is BoringSSL through __host.
const host = globalThis.__host;
const bytes = x => (typeof x === 'string' ? Buffer.from(x) : x);
class Hash { constructor(a) { this.a = a; this.parts = []; }
  update(x, enc) { this.parts.push(typeof x === 'string' ? Buffer.from(x, enc) : x); return this; }
  digest(enc) { const out = Buffer.from(host.digest(this.a, Buffer.concat(this.parts))); return enc ? out.toString(enc) : out; } }
class Gcm { constructor(enc, key, iv) { this.enc = enc; this.key = key; this.iv = iv; this.parts = []; this.tag = null; }
  setAuthTag(t) { this.tag = t; return this; }
  getAuthTag() { return this.tag; }
  update(x, inEnc) { this.parts.push(typeof x === 'string' ? Buffer.from(x, inEnc) : x); return Buffer.alloc(0); }
  final() { const data = Buffer.concat(this.parts);
    if (this.enc) { const out = host.gcmSeal(this.key, this.iv, data); const b = Buffer.from(out); this.tag = b.subarray(b.length - 16); return b.subarray(0, b.length - 16); }
    const out = host.gcmOpen(this.key, this.iv, Buffer.concat([data, this.tag]));
    if (!out) throw new Error('Unsupported state or unable to authenticate data');
    return Buffer.from(out); } }
const hex = b => Buffer.from(b).toString('hex');
module.exports = {
  randomBytes: n => Buffer.from(host.randomBytes(n)),
  randomUUID() { const b = Buffer.from(host.randomBytes(16)); b[6] = b[6] & 15 | 64; b[8] = b[8] & 63 | 128; const h = hex(b); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; },
  randomInt(max) { const limit = Math.floor(0x100000000 / max) * max; for (;;) { const n = Buffer.from(host.randomBytes(4)).readUInt32BE(0); if (n < limit) return n % max; } },
  scryptSync: (p, s, len, o) => Buffer.from(host.scrypt(bytes(p), bytes(s), o.N, o.r, o.p, o.maxmem, len)),
  hkdfSync: (a, ikm, salt, info, len) => host.hkdf(a, bytes(ikm), bytes(salt), bytes(info), len),
  createHash: a => new Hash(a),
  createCipheriv: (a, k, iv) => new Gcm(true, k, iv),
  createDecipheriv: (a, k, iv) => new Gcm(false, k, iv),
};
