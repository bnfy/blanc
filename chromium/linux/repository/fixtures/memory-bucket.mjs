export class MemoryBucket {
  objects = new Map();

  async put(key, value, options = {}) {
    const bytes = new Uint8Array(await new Response(value).arrayBuffer());
    // Test the precondition and commit the write together, as R2 does.
    if (options.onlyIf?.get('If-None-Match') === '*' && this.objects.has(key)) return null;
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

