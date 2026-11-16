// An Electron Blanc data folder for the profile importer's native tests: the
// synthetic fixture (tools/importer-fixtures.mjs) written to a new temporary
// folder, and a digest of every file in it, so a test can require that an
// import changed nothing in its source.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {writeFixture, buildFixture} from '../../tools/importer-fixtures.mjs';

// Writes the fixture under |parent| and returns the data folder and the answer key.
export function makeImportSource(parent, change = null) {
  const out = path.join(parent, 'electron-source-' + crypto.randomUUID());
  writeFixture(out);
  const userData = path.join(out, 'userData');
  if (change) change(userData);
  return {userData, expected: buildFixture().expected};
}

// Every file under |dir| with its size, mode and SHA-256, in path order.
export function digestTree(dir) {
  const rows = [];
  const walk = folder => {
    for (const entry of fs.readdirSync(folder, {withFileTypes: true}).sort((a, b) => a.name < b.name ? -1 : 1)) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) { rows.push([path.relative(dir, full) + '/', 'dir']); walk(full); continue; }
      const stat = fs.lstatSync(full);
      rows.push([path.relative(dir, full), stat.size, stat.mode & 0o777, stat.mtimeMs,
        crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex')]);
    }
  };
  walk(dir);
  return JSON.stringify(rows);
}
