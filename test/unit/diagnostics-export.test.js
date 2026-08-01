const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { writeDiagnosticsFile } = require('../../src/main/diagnostics-export');

test('diagnostics export atomically writes readable JSON and removes its temporary file', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-diagnostics-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const destination = path.join(directory, 'report.json');

  await writeDiagnosticsFile(destination, { schemaVersion: 1, crashLedger: { events: [] } }, {
    nonce: () => 'fixed',
  });

  assert.equal(JSON.parse(fs.readFileSync(destination, 'utf8')).schemaVersion, 1);
  assert.equal(fs.existsSync(`${destination}.fixed.tmp`), false);
});
test('a failed export leaves the destination untouched and cleans its temporary file', async () => {
  const writes = new Map([['/report.json', 'old report']]);
  const fileSystem = {
    writeFile: async (file, contents) => { writes.set(file, contents); },
    rename: async () => { throw new Error('disk full'); },
    unlink: async (file) => { writes.delete(file); },
  };

  await assert.rejects(
    writeDiagnosticsFile('/report.json', { schemaVersion: 1 }, {
      fileSystem,
      nonce: () => 'failed',
    }),
    /disk full/
  );
  assert.equal(writes.get('/report.json'), 'old report');
  assert.equal(writes.has('/report.json.failed.tmp'), false);
});
