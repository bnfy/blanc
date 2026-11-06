// Globals bare V8 lacks. `__host` is the only way out: see sync_runner.mojom.
(function (g) {
  'use strict';
  const host = g.__host;
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const utf8 = s => {
    const out = [];
    for (let i = 0; i < s.length; i++) {
      let c = s.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
        const d = s.charCodeAt(i + 1);
        if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; }
      }
      if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | c >> 6, 0x80 | c & 63);
      else if (c < 0x10000) out.push(0xe0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63);
      else out.push(0xf0 | c >> 18, 0x80 | c >> 12 & 63, 0x80 | c >> 6 & 63, 0x80 | c & 63);
    }
    return out;
  };
  const fromUtf8 = b => {
    const parts = []; let chunk = '';
    for (let i = 0; i < b.length;) {
      const c = b[i]; let n = c < 0x80 ? 0 : c >= 0xc2 && c < 0xe0 ? 1 : c >= 0xe0 && c < 0xf0 ? 2 : c >= 0xf0 && c < 0xf5 ? 3 : -1;
      if (n < 0) { chunk += '�'; i++; continue; }
      if (n === 0) { chunk += String.fromCharCode(c); i++; continue; }
      let cp = c & (0x3f >> n), ok = i + n < b.length + 0, used = 1;
      for (let k = 1; k <= n; k++) {
        const d = b[i + k]; let lo = 0x80, hi = 0xbf;
        if (k === 1) { if (c === 0xe0) lo = 0xa0; if (c === 0xed) hi = 0x9f; if (c === 0xf0) lo = 0x90; if (c === 0xf4) hi = 0x8f; }
        if (d === undefined || d < lo || d > hi) { ok = false; break; }
        cp = cp << 6 | d & 63; used++;
      }
      if (!ok || used !== n + 1) { chunk += '�'; i += used; continue; }
      chunk += String.fromCodePoint(cp); i += n + 1;
      if (chunk.length > 4096) { parts.push(chunk); chunk = ''; }
    }
    parts.push(chunk); return parts.join('');
  };
  const b64enc = (b, url) => {
    let s = '';
    for (let i = 0; i < b.length; i += 3) {
      const n = b[i] << 16 | (b[i + 1] || 0) << 8 | (b[i + 2] || 0);
      s += B64[n >> 18] + B64[n >> 12 & 63] + (i + 1 < b.length ? B64[n >> 6 & 63] : '=') + (i + 2 < b.length ? B64[n & 63] : '=');
    }
    return url ? s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : s;
  };
  const b64dec = s => {
    const out = []; let n = 0, bits = 0;
    for (const ch of s) {
      const c = ch === '-' ? 62 : ch === '_' ? 63 : B64.indexOf(ch);
      if (ch === '=') break;
      if (c < 0) continue;
      n = n << 6 | c; bits += 6;
      if (bits >= 8) { bits -= 8; out.push(n >> bits & 255); n &= (1 << bits) - 1; }
    }
    return out;
  };
  class Buffer extends Uint8Array {
    static isBuffer(x) { return x instanceof Buffer; }
    static alloc(n, fill = 0) { const b = new Buffer(n); if (fill) b.fill(fill); return b; }
    static byteLength(x) { return typeof x === 'string' ? utf8(x).length : x.byteLength; }
    static concat(list) {
      const out = new Buffer(list.reduce((n, b) => n + b.length, 0)); let at = 0;
      for (const b of list) { out.set(b, at); at += b.length; }
      return out;
    }
    static from(x, enc) {
      if (typeof x === 'string') {
        const e = (enc || 'utf8').toLowerCase();
        const bytes = e === 'base64' || e === 'base64url' ? b64dec(x)
          : e === 'hex' ? (x.match(/[0-9a-f]{2}/gi) || []).map(h => parseInt(h, 16))
          : e === 'ascii' || e === 'latin1' || e === 'binary' ? [...x].map(c => c.charCodeAt(0) & 255) : utf8(x);
        return Buffer.from(bytes);
      }
      if (x.length === undefined && x.byteLength !== undefined) { const b = new Buffer(x.byteLength); b.set(new Uint8Array(x)); return b; }
      const b = new Buffer(x.length); b.set(x); return b;
    }
    toString(enc) {
      const e = (enc || 'utf8').toLowerCase();
      if (e === 'base64') return b64enc(this, false);
      if (e === 'base64url') return b64enc(this, true);
      if (e === 'hex') { let s = ''; for (const c of this) s += (c < 16 ? '0' : '') + c.toString(16); return s; }
      if (e === 'ascii') { let s = ''; for (const c of this) s += String.fromCharCode(c & 127); return s; }
      if (e === 'latin1' || e === 'binary') { let s = ''; for (const c of this) s += String.fromCharCode(c); return s; }
      return fromUtf8(this);
    }
    equals(o) { return this.length === o.length && this.every((v, i) => v === o[i]); }
    slice(a, b) { return this.subarray(a, b); }
    readUInt16LE(o = 0) { return this[o] | this[o + 1] << 8; }
    readUInt32LE(o = 0) { return (this[o] | this[o + 1] << 8 | this[o + 2] << 16) + this[o + 3] * 0x1000000; }
    readUInt32BE(o = 0) { return this[o] * 0x1000000 + (this[o + 1] << 16 | this[o + 2] << 8 | this[o + 3]); }
    static get [Symbol.species]() { return Buffer; }
  }
  g.Buffer = Buffer;

  const timers = new Map(); let nextTimer = 1;
  const addTimer = (fn, ms, repeat, args) => {
    const id = nextTimer++; const t = {fn, ms: Math.max(0, +ms || 0), repeat, args};
    timers.set(id, t); host.setTimer(id, t.ms);
    return {id, unref() { return this; }, ref() { return this; }, hasRef() { return true; }, [Symbol.toPrimitive]() { return id; }};
  };
  g.setTimeout = (fn, ms, ...a) => addTimer(fn, ms, false, a);
  g.setInterval = (fn, ms, ...a) => addTimer(fn, ms, true, a);
  g.clearTimeout = g.clearInterval = h => { if (h != null) timers.delete(typeof h === 'object' ? h.id : h); };
  g.__fireTimer = id => {
    const t = timers.get(id); if (!t) return;
    if (t.repeat) host.setTimer(id, t.ms); else timers.delete(id);
    t.fn(...t.args);
  };
  g.queueMicrotask = g.queueMicrotask || (fn => Promise.resolve().then(fn));
  g.structuredClone = g.structuredClone || (function clone(x) {
    if (x === undefined) return undefined;
    if (x === null || typeof x !== 'object') return x;
    if (Array.isArray(x)) return x.map(clone);
    if (x instanceof Date) return new Date(x.getTime());
    if (x instanceof Map) return new Map([...x].map(([k, v]) => [clone(k), clone(v)]));
    if (x instanceof Set) return new Set([...x].map(clone));
    if (ArrayBuffer.isView(x)) return x.slice();
    const o = {}; for (const k of Object.keys(x)) o[k] = clone(x[k]); return o;
  });
  g.console = g.console || {log() {}, info() {}, debug() {}, warn(...a) { host.log(a.join(' ')); }, error(...a) { host.log(a.join(' ')); }};
  g.process = {platform: host.platform, pid: 1, env: host.env || {}, versions: {}, arch: '', cwd: () => '/', nextTick: (f, ...a) => Promise.resolve().then(() => f(...a))};
  g.performance = g.performance || {now: () => host.monotonicNow()};

  class AbortSignal {
    constructor() { this.aborted = false; this.reason = undefined; this._l = new Set(); }
    addEventListener(t, f) { if (t === 'abort') this._l.add(f); }
    removeEventListener(t, f) { this._l.delete(f); }
    throwIfAborted() { if (this.aborted) throw this.reason; }
    _abort(reason) { if (this.aborted) return; this.aborted = true; this.reason = reason; for (const f of [...this._l]) f({type: 'abort'}); }
    static timeout(ms) { const s = new AbortSignal(); setTimeout(() => { const e = new Error('The operation timed out'); e.name = 'TimeoutError'; s._abort(e); }, ms); return s; }
    static any(list) { const s = new AbortSignal(); for (const x of list) { if (x.aborted) { s._abort(x.reason); break; } x.addEventListener('abort', () => s._abort(x.reason)); } return s; }
  }
  class AbortController {
    constructor() { this.signal = new AbortSignal(); }
    abort(reason) { const e = reason ?? Object.assign(new Error('This operation was aborted'), {name: 'AbortError'}); this.signal._abort(e); }
  }
  g.AbortSignal = AbortSignal; g.AbortController = AbortController;

  class URLSearchParams {
    constructor(q = '') { this._p = String(q).replace(/^\?/, '').split('&').filter(Boolean).map(kv => { const i = kv.indexOf('='); const d = s => decodeURIComponent(s.replace(/\+/g, ' ')); return i < 0 ? [d(kv), ''] : [d(kv.slice(0, i)), d(kv.slice(i + 1))]; }); }
    get(k) { const e = this._p.find(p => p[0] === k); return e ? e[1] : null; }
    has(k) { return this._p.some(p => p[0] === k); }
    getAll(k) { return this._p.filter(p => p[0] === k).map(p => p[1]); }
    [Symbol.iterator]() { return this._p[Symbol.iterator](); }
  }
  class URL {
    constructor(u, base) {
      const p = host.parseUrl(String(u), base === undefined ? undefined : String(base));
      if (!p) { const e = new TypeError(`Invalid URL: ${u}`); e.code = 'ERR_INVALID_URL'; throw e; }
      Object.assign(this, p); this.searchParams = new URLSearchParams(p.search);
    }
    get origin() { return /^(https?|wss?|ftp):$/.test(this.protocol) ? `${this.protocol}//${this.host}` : 'null'; }
    toString() { return this.href; }
    toJSON() { return this.href; }
    static canParse(u, b) { return !!host.parseUrl(String(u), b === undefined ? undefined : String(b)); }
  }
  g.URL = URL; g.URLSearchParams = URLSearchParams;
})(globalThis);
