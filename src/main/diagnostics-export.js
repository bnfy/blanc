const fs = require('node:fs');
const { randomUUID } = require('node:crypto');

async function writeDiagnosticsFile(
  file,
  report,
  { fileSystem = fs.promises, nonce = randomUUID } = {}
) {
  if (typeof file !== 'string' || !file || !report || typeof report !== 'object') {
    throw new TypeError('a destination and diagnostics report are required');
  }
  const temporary = `${file}.${nonce()}.tmp`;
  try {
    await fileSystem.writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await fileSystem.rename(temporary, file);
  } finally {
    try { await fileSystem.unlink(temporary); } catch { /* best effort */ }
  }
}

module.exports = { writeDiagnosticsFile };
