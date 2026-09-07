#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createComplianceArtifacts } = require('./compliance-model');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

try {
  const { files, runtime } = createComplianceArtifacts();
  const stale = [];
  for (const [relative, expected] of Object.entries(files)) {
    const target = path.join(root, relative);
    if (check) {
      const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
      if (current !== expected) stale.push(relative);
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, expected);
    }
  }
  if (stale.length) {
    throw new Error(`generated compliance artifacts are stale: ${stale.join(', ')}`);
  }
  const verb = check ? 'current' : 'generated';
  console.log(
    `compliance ${verb} — ${runtime.runtimePackages.length} runtime npm packages, ` +
    `${runtime.sbom.components.length} shipped/provenance components, root + site lock SBOMs.`
  );
} catch (err) {
  console.error(`compliance: ${err.message}`);
  process.exitCode = 1;
}
