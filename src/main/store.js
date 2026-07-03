const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const SAVE_DELAY_MS = 250;

/** All live stores, so we can flush pending writes on quit. */
const instances = [];

/**
 * Minimal JSON-file persistence: one file per store in userData, loaded
 * synchronously once at construction, saved with a short debounce so
 * bursts of updates (e.g. history during a redirect chain) coalesce into
 * one write. No schema, no migrations — the right weight for a starter.
 */
class JsonStore {
  /**
   * @param {string} name - file becomes `<userData>/<name>.json`
   * @param {object} defaults - shape used when the file is missing/corrupt
   */
  constructor(name, defaults) {
    this.file = path.join(app.getPath('userData'), `${name}.json`);
    this.defaults = defaults;
    this.data = this.#load();
    this.saveTimer = null;
    instances.push(this);
  }

  #load() {
    try {
      return { ...this.defaults, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
    } catch {
      return structuredClone(this.defaults);
    }
  }

  /** Mutate `this.data` inside `fn`, then schedule a save. */
  update(fn) {
    fn(this.data);
    this.#scheduleSave();
  }

  #scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), SAVE_DELAY_MS);
  }

  flush() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    } catch (err) {
      console.warn(`[store] could not write ${this.file}:`, err.message);
    }
  }
}

app.on('before-quit', () => {
  for (const store of instances) store.flush();
});

module.exports = { JsonStore };
