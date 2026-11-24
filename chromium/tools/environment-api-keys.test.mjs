// Patch 0108: Blanc never takes Google API keys or OAuth client IDs from the
// environment (owner decision, 2026-11-21). Chromium's non-Google builds read
// GOOGLE_API_KEY, GOOGLE_DEFAULT_CLIENT_ID and the rest from it at launch, so
// a key left in someone's shell for another tool turned on Google-backed
// services that Blanc's outbound check never ran with.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const PATCH = 'patches/0108-blanc-no-environment-api-keys.patch';

test('every key and client ID stops reading the environment, and nothing else changes', () => {
  const patch = read(PATCH);
  assert.match(patch, /^\+\+\+ b\/google_apis\/default_api_keys-inc\.cc$/m);
  // The one flag every CalculateKeyValue call passes (api_key_cache.cc).
  assert.match(patch, /^-      \.allow_override_via_environment = !BUILDFLAG\(GOOGLE_CHROME_BRANDING\),\n(\+      \/\/.*\n)+\+      \.allow_override_via_environment = false,$/m);
  assert.equal(patch.match(/^-[^-]/gm).length, 1);
  assert.equal(patch.match(/^\+[^+].*$/gm).filter(line => !line.startsWith('+      //')).length, 1);
  assert.equal(patch.match(/^@@ /gm).length, 1);
});

test('the patched line is the upstream one the source map pins', () => {
  const upstream = read('upstream/google_apis/default_api_keys-inc.cc');
  assert.equal(upstream.split('.allow_override_via_environment = !BUILDFLAG(GOOGLE_CHROME_BRANDING),').length, 2);
  assert.ok(JSON.parse(read('source-map.json')).upstreamFiles['google_apis/default_api_keys-inc.cc']);
});

test('the desktop lane applies it, so the Mac and Windows builds both carry it', () => {
  assert.ok(JSON.parse(read('lanes/desktop.json')).patches.includes(PATCH));
});
