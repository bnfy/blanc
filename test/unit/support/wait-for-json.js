'use strict';
// JsonStore's routine saves are debounced and then written off the main
// thread, so how long a save takes to reach disk depends on the machine. Tests
// that read a store's file back poll for the state they expect instead of
// sleeping a fixed interval that a slow CI runner can outlast.
const fs = require('node:fs');

async function waitForJson(file, predicate, { timeoutMs = 5000, intervalMs = 20 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  for (;;) {
    try {
      last = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (predicate(last)) return last;
    } catch {
      // Not written yet; a committed save replaces the file atomically.
    }
    if (Date.now() >= deadline) {
      throw new Error(`${file} did not reach the expected state within ${timeoutMs} ms; last read: ${JSON.stringify(last)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

module.exports = { waitForJson };
