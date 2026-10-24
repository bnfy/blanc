#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  getCurrentFuseWire,
  FuseV1Options,
} = require('@electron/fuses');

// --ecs: the castLabs ECS runtime needs GrantFileProtocolExtraPrivileges ON
// (set before VMP signing; see scripts/ecs-production-packaging.cjs). Every
// other hardened state is identical, and the binary must belong to a package
// whose immutable metadata says it is an ECS build.
const ecs = process.argv[2] === '--ecs';
const binary = path.resolve(process.argv[ecs ? 3 : 2] ?? '');
if (!fs.statSync(binary, { throwIfNoEntry: false })?.isFile()) {
  throw new Error(`Electron binary not found: ${binary}`);
}

const expected = new Map([
  [FuseV1Options.RunAsNode, false],
  [FuseV1Options.EnableCookieEncryption, true],
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable, false],
  [FuseV1Options.EnableNodeCliInspectArguments, false],
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, true],
  [FuseV1Options.OnlyLoadAppFromAsar, true],
  // Electron does not ship browser_v8_context_snapshot.bin. Enabling this
  // fuse without packaging that separate snapshot makes the main process
  // fail before application code can run.
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot, false],
  [FuseV1Options.GrantFileProtocolExtraPrivileges, ecs],
]);
if (ecs) {
  const { extractFile } = require('@electron/asar');
  const resources = process.platform === 'darwin' || binary.includes('.app/Contents/')
    ? path.join(binary, '../../Resources') : path.join(path.dirname(binary), 'resources');
  const metadata = JSON.parse(extractFile(path.join(resources, 'app.asar'), 'package.json'));
  if (metadata.blancRuntime !== 'ecs') throw new Error('--ecs requires a package built on the ECS runtime');
}

const wire = await getCurrentFuseWire(binary);
if (wire.version !== '1') throw new Error(`Unexpected Electron fuse wire version: ${wire.version}`);
for (const [option, enabled] of expected) {
  const actual = wire[option];
  const expectedByte = enabled ? '1'.charCodeAt(0) : '0'.charCodeAt(0);
  if (actual !== expectedByte) {
    throw new Error(
      `${FuseV1Options[option]} expected ${enabled ? 'ON' : 'OFF'}, got byte ${actual}`
    );
  }
}

console.log(`electron fuses OK — ${path.basename(binary)} has all ${expected.size} hardened states${ecs ? ' (ECS file-protocol privilege)' : ''}`);
