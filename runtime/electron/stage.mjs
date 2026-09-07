import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const source = process.argv[2];
if (!source) throw new Error('Usage: node runtime/electron/stage.mjs /build/src/out/BlancRelease');
const root = fileURLToPath(new URL('../../', import.meta.url));
const lock = JSON.parse(fs.readFileSync(new URL('./source.json', import.meta.url), 'utf8'));
const recordPath = path.join(source, 'blanc-runtime-build.json');
const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
for (const key of Object.keys(lock)) {
  if (JSON.stringify(record[key]) !== JSON.stringify(lock[key])) throw new Error(`Unapproved runtime source: ${key}`);
}
const archive = path.join(source, 'dist.zip');
const digest = createHash('sha256');
for await (const chunk of fs.createReadStream(archive)) digest.update(chunk);
if (digest.digest('hex') !== record.archiveSha256) throw new Error('Runtime archive hash differs from its build record');
fs.mkdirSync(path.join(root, '.runtime'), { recursive: true });
fs.copyFileSync(archive, path.join(root, '.runtime/electron.zip'));
fs.copyFileSync(recordPath, path.join(root, '.runtime/blanc-runtime-build.json'));
console.log('Staged the verified patched runtime. Native capture and release gates remain required.');
