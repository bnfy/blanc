// Reproducible desktop blocker seed: pinned EasyList + EasyPrivacy + the
// Ghostery resource bundle used by the installed engine version.
//
//   node adblock/seed.mjs           regenerate src/main/assets/adblock-engine-seed.*
//   node adblock/seed.mjs --check   verify the committed seed matches its sources

// The serialized engine is intentionally committed and packaged with Blanc so
// a fresh install can start protected without contacting a filter-list host.

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
const RESOURCE_FILE = 'ghostery-resources.json';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function generate() {
  const filterBuffers = FILTER_FILES.map((file) => ({
    file,
    bytes: fs.readFileSync(path.join(SOURCES, file)),
  }));
  const resourceBytes = fs.readFileSync(path.join(SOURCES, RESOURCE_FILE));
  const pinned = JSON.parse(fs.readFileSync(path.join(SOURCES, 'pinned.json'), 'utf8'));
  const resourcePin = pinned.ghosteryResources;
  if (
    resourcePin?.packageVersion !== enginePackage.version ||
    !/^[a-f0-9]{40}$/.test(resourcePin?.commit || '') ||
    (enginePackage.gitHead && enginePackage.gitHead !== resourcePin.commit)
  ) {
    throw new Error(
      'Ghostery resource pin does not match the installed @ghostery/adblocker-electron package'
    );
  }
  const filters = filterBuffers.map(({ bytes }) => bytes.toString('utf8')).join('\n');
  const resources = resourceBytes.toString('utf8');

  const engine = ElectronBlocker.parse(filters);
  engine.updateResources(resources, sha256(resourceBytes));
  const seed = Buffer.from(engine.serialize());
  const seedHash = sha256(seed);
  const manifest = {
    schemaVersion: 1,
    seedId: seedHash.slice(0, 16),
    sha256: seedHash,
    byteLength: seed.length,
    engine: {
      package: '@ghostery/adblocker-electron',
      packageVersion: enginePackage.version,
      formatVersion: ENGINE_VERSION,
    },
    filters: {
      sourceDate: pinned.date,
      files: filterBuffers.map(({ file, bytes }) => ({
        file,
        sha256: sha256(bytes),
      })),
    },
    resources: {
      file: RESOURCE_FILE,
      upstreamCommit: resourcePin.commit,
      sha256: sha256(resourceBytes),
    },
  };

  return { seed, manifest: `${JSON.stringify(manifest, null, 2)}\n` };
}

function build() {
  const generated = generate();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(OUT_BIN, generated.seed);
  fs.writeFileSync(OUT_MANIFEST, generated.manifest);
  console.log(
    `Wrote desktop blocker seed ${generated.seed.length} bytes ` +
      `(${JSON.parse(generated.manifest).seedId}).`
  );
}

function check() {
  const generated = generate();
  let failed = false;
  const expected = [
    [OUT_BIN, generated.seed],
    [OUT_MANIFEST, Buffer.from(generated.manifest)],
  ];

  for (const [file, content] of expected) {
    const onDisk = fs.existsSync(file) ? fs.readFileSync(file) : null;
    if (!onDisk?.equals(content)) {
      failed = true;
      console.error(`STALE: ${path.relative(path.resolve(ROOT, '..'), file)} — run \`npm run adblock:build\``);
    }
  }

  if (failed) {
    console.error('\nadblock seed check failed.');
    process.exit(1);
  }
  const manifest = JSON.parse(generated.manifest);
  console.log(`adblock seed check OK — ${generated.seed.length} bytes (${manifest.seedId}).`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.argv.includes('--check') ? check() : build();
}
