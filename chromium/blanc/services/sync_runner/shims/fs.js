// Store files live in memory; host keeps them durable. A rename onto a real
// name is the one commit point, as on disk.
const host = globalThis.__host;
const files = new Map(Object.entries(host.loadStores()).map(([k, v]) => [`/sync/${k}`, Buffer.from(v)]));
const fds = new Map(); let nextFd = 3;
const enoent = p => Object.assign(new Error(`ENOENT: ${p}`), {code: 'ENOENT'});
const commit = (name, data) => { if (!/\.tmp$/.test(name)) host.writeStore(name.replace(/^\/sync\//, ''), data); };
const fsObj = {
  existsSync: p => files.has(p) || p === '/sync',
  readFileSync(p, enc) { if (!files.has(p)) throw enoent(p); const b = files.get(p); return enc ? b.toString(typeof enc === 'string' ? enc : enc.encoding) : b; },
  writeFileSync(t, d) { const b = typeof d === 'string' ? Buffer.from(d) : d; if (typeof t === 'number') { fds.get(t).parts.push(b); return; } files.set(t, b); commit(t, b); },
  openSync(p) { const fd = nextFd++; fds.set(fd, {p, parts: []}); return fd; },
  fsyncSync() {}, fchmodSync() {}, chmodSync() {}, mkdirSync() {},
  closeSync(fd) { const f = fds.get(fd); fds.delete(fd); if (f) files.set(f.p, Buffer.concat(f.parts)); },
  renameSync(a, b) { if (!files.has(a)) throw enoent(a); const d = files.get(a); files.delete(a); files.set(b, d); commit(b, d); },
  unlinkSync(p) { files.delete(p); }, rmSync(p) { files.delete(p); },
  readdirSync: () => [...files.keys()].map(k => k.replace(/^\/sync\//, '')),
  statSync(p) { if (!files.has(p)) throw enoent(p); return {size: files.get(p).length, isFile: () => true, isDirectory: () => false}; },
  realpathSync: p => p,
};
fsObj.promises = {
  mkdir: async () => {}, rm: async p => { files.delete(p); },
  rename: async (a, b) => fsObj.renameSync(a, b), unlink: async p => { files.delete(p); },
  open: async p => { const parts = []; return {
    writeFile: async d => { parts.push(typeof d === 'string' ? Buffer.from(d) : d); }, write: async d => { parts.push(typeof d === 'string' ? Buffer.from(d) : d); },
    sync: async () => {}, chmod: async () => {}, close: async () => { files.set(p, Buffer.concat(parts)); } }; },
};
// Desktop opt-in only. Missing support is a refusal, never a fake durability receipt.
fsObj.__persistDesktop = name => {
  const bytes = files.get(`/sync/${name}`);
  return !!bytes && host.persistDesktopStore?.(name, bytes) === true;
};
module.exports = fsObj;
