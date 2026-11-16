// A pinned Chromium file of the Android lane with every Android patch applied, for tests that
// check what a patch leaves in a file.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const lane = JSON.parse(fs.readFileSync(path.join(ROOT, 'lanes/android.json'), 'utf8'));

// A pinned Chromium file with every Android patch applied.
export function patchedChromiumFile(name) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-res-dirs-'));
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, lane.upstreamDir, 'manifest.json'), 'utf8'));
    for (const name of Object.keys(manifest.files)) {
      fs.mkdirSync(path.dirname(path.join(work, name)), {recursive: true});
      fs.copyFileSync(path.join(ROOT, lane.upstreamDir, name), path.join(work, name));
    }
    for (const patch of lane.patches) execFileSync('git', ['apply', path.join(ROOT, patch)], {cwd: work});
    return fs.readFileSync(path.join(work, name), 'utf8');
  } finally { fs.rmSync(work, {recursive: true, force: true}); }
}
