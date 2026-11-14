// One device, one profile: there's no concurrent store to tell apart.
class AsyncLocalStorage { constructor() { this.v = undefined; } run(v, f, ...a) { const p = this.v; this.v = v; try { return f(...a); } finally { this.v = p; } } getStore() { return this.v; } }
module.exports = {AsyncLocalStorage};
