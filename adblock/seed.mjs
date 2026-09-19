// Reproducible desktop blocker seed generated exclusively from Blanc's
// committed, hash-pinned filter lists and Ghostery resource bundle.
//
//   node adblock/seed.mjs           regenerate the packaged seed
//   node adblock/seed.mjs --check   fail if committed output is stale
//   node adblock/seed.mjs --prepare generate the binary against its pinned manifest
//
// Startup never invokes this generator and never fetches these inputs.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { ElectronBlocker, ENGINE_VERSION } = require('@ghostery/adblocker-electron');
const enginePackage = require('@ghostery/adblocker-electron/package.json');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const SOURCES = path.join(ROOT, 'sources');
const OUT = path.resolve(ROOT, '../src/main/assets');
const OUT_BIN = path.join(OUT, 'adblock-engine-seed.bin');
const OUT_MANIFEST = path.join(OUT, 'adblock-engine-seed.json');
const FILTER_FILES = ['easylist.txt', 'easyprivacy.txt'];

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function generate() {
  const pinned = JSON.parse(fs.readFileSync(path.join(SOURCES, 'pinned.json'), 'utf8'));
  if (pinned.version !== 1 || !Array.isArray(pinned.lists)) {
    throw new Error('Invalid adblock source manifest');
  }

  const manifestByFile = new Map(pinned.lists.map((entry) => [entry.file, entry]));
  const filterBuffers = FILTER_FILES.map((file) => {
    const bytes = fs.readFileSync(path.join(SOURCES, file));
    if (sha256(bytes) !== manifestByFile.get(file)?.sha256) {
      throw new Error(`Pinned hash mismatch for ${file}`);
    }
    return { file, bytes };
  });
  const filters = filterBuffers.map(({ bytes }) => bytes.toString('utf8')).join('\n');
  if (sha256(filters) !== pinned.combinedSha256) {
    throw new Error('Pinned combined adblock hash mismatch');
  }

  const resourcePin = pinned.ghosteryResources;
  if (
    resourcePin?.file !== 'ghostery-resources.json'
    || resourcePin.packageVersion !== enginePackage.version
    || resourcePin.commit !== enginePackage.gitHead
    || !/^[a-f0-9]{64}$/.test(resourcePin.sha256 || '')
  ) throw new Error('Ghostery resource pin does not match the installed engine package');
  const resourceBytes = fs.readFileSync(path.join(SOURCES, resourcePin.file));
  if (sha256(resourceBytes) !== resourcePin.sha256) {
    throw new Error('Pinned Ghostery resource hash mismatch');
  }

  const engine = ElectronBlocker.parse(filters);
  engine.updateResources(resourceBytes.toString('utf8'), resourcePin.sha256);
  const seed = Buffer.from(engine.serialize());
  const seedHash = sha256(seed);
  const manifest = {
    schemaVersion: 1,
    seedId: seedHash.slice(0, 16),
    byteLength: seed.length,
    sha256: seedHash,
    engine: {
      package: '@ghostery/adblocker-electron',
      packageVersion: enginePackage.version,
      formatVersion: ENGINE_VERSION,
    },
    filters: {
      sourceDate: pinned.date,
      combinedSha256: pinned.combinedSha256,
      files: filterBuffers.map(({ file, bytes }) => ({ file, sha256: sha256(bytes) })),
    },
    resources: {
      file: resourcePin.file,
      packageVersion: resourcePin.packageVersion,
      upstreamCommit: resourcePin.commit,
      sha256: resourcePin.sha256,
      source: `https://github.com/ghostery/adblocker/tree/${resourcePin.commit}/packages/adblocker/assets/ublock-origin`,
    },
  };
  return { seed, manifest: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`) };
}

function build() {
  const generated = generate();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(OUT_BIN, generated.seed);
  fs.writeFileSync(OUT_MANIFEST, generated.manifest);
  const manifest = JSON.parse(generated.manifest);
  console.log(`Wrote desktop blocker seed ${manifest.byteLength} bytes (${manifest.seedId}).`);
}

function check() {
  const generated = generate();
  let stale = false;
  for (const [file, expected] of [[OUT_BIN, generated.seed], [OUT_MANIFEST, generated.manifest]]) {
    const actual = fs.existsSync(file) ? fs.readFileSync(file) : null;
    if (!actual?.equals(expected)) {
      stale = true;
      console.error(`STALE: ${path.relative(path.resolve(ROOT, '..'), file)}`);
    }
  }
  if (stale) throw new Error('adblock seed check failed; run `npm run adblock:build`');
  const manifest = JSON.parse(generated.manifest);
  console.log(`adblock seed check OK — ${manifest.byteLength} bytes (${manifest.seedId}).`);
}

function prepare() {
  const generated = generate();
  // Dependency setup may recreate the ignored binary, but must never silently
  // approve changed source/dependency inputs by rewriting the tracked manifest.
  const manifest = fs.readFileSync(OUT_MANIFEST);
  if (!manifest.equals(generated.manifest)) {
    throw new Error('Blocker seed manifest mismatch; review inputs and run npm run adblock:build');
  }
  fs.writeFileSync(OUT_BIN, generated.seed);
  console.log(`Prepared pinned blocker seed (${generated.seed.length} bytes).`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--check')) check();
  else if (process.argv.includes('--prepare')) prepare();
  else build();
}

export { generate };
