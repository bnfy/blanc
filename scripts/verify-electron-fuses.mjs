#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  getCurrentFuseWire,
  FuseV1Options,
} = require('@electron/fuses');

const binary = path.resolve(process.argv[2] ?? '');
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
  [FuseV1Options.GrantFileProtocolExtraPrivileges, false],
]);

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

console.log(`electron fuses OK — ${path.basename(binary)} has all ${expected.size} hardened states`);
