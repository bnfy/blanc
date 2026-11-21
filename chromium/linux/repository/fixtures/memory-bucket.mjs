export class MemoryBucket {
  objects = new Map();

  async put(key, value, options = {}) {
    if (options.onlyIf && this.objects.has(key)) return null;
    const bytes = new Uint8Array(await new Response(value).arrayBuffer());
    this.objects.set(key, bytes);
    return {key};
  }

  async get(key) {
    const bytes = this.objects.get(key);
    if (!bytes) return null;
    return Object.assign(new Response(bytes), {size: bytes.length, httpEtag: '"test"'});
  }

  async list() {
    return {objects: [...this.objects.keys()].map(key => ({key})), truncated: false};
  }

  async delete(keys) {
    for (const key of [keys].flat()) this.objects.delete(key);
  }
}

