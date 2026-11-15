// Chromium's prepare_resources.py refuses a resource target whose resource folder holds a file the
// target doesn't list ("Found files not listed in the sources list"). An incremental build never
// re-runs that check when a file is only added on disk, so it first fails on a clean (release) build.
// For every android_resources target over Blanc's files, every file in each of its folders is listed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const lane = JSON.parse(fs.readFileSync(path.join(ROOT, 'lanes/android.json'), 'utf8'));

// The pinned chrome/android/BUILD.gn with every Android patch applied.
function patchedChromeBuild() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-res-dirs-'));
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, lane.upstreamDir, 'manifest.json'), 'utf8'));
    for (const name of Object.keys(manifest.files)) {
      fs.mkdirSync(path.dirname(path.join(work, name)), {recursive: true});
      fs.copyFileSync(path.join(ROOT, lane.upstreamDir, name), path.join(work, name));
    }
    for (const patch of lane.patches) execFileSync('git', ['apply', path.join(ROOT, patch)], {cwd: work});
    return fs.readFileSync(path.join(work, 'chrome/android/BUILD.gn'), 'utf8');
  } finally { fs.rmSync(work, {recursive: true, force: true}); }
}

// Each android_resources("name") { … } block's //blanc/android/… sources, as paths under chromium/blanc.
export function blancResourceTargets(gn, prefix) {
  const targets = [];
  for (const match of gn.matchAll(/android_resources\("([^"]+)"\)\s*\{/g)) {
    let depth = 0, end = match.index;
    for (let i = match.index + match[0].length - 1; i < gn.length; i++) {
      if (gn[i] === '{') depth++;
      else if (gn[i] === '}' && --depth === 0) { end = i; break; }
    }
    const body = gn.slice(match.index, end).split('\n').filter(line => !line.trim().startsWith('#')).join('\n');
    const sources = [...body.matchAll(/"([^"]+)"/g)].map(m => m[1])
      .map(s => s.startsWith('//blanc/android/') ? s.slice('//blanc/'.length) : prefix && !s.startsWith('/') && !s.startsWith(':') && /\.(xml|png|webp)$/.test(s) ? `${prefix}/${s}` : null)
      .filter(Boolean);
    if (sources.length) targets.push({name: match[1], sources});
  }
  return targets;
}

// Files on disk in a target's resource folders (the folder above each source's values-/drawable- folder)
// that the target doesn't list, as prepare_resources.py's _CheckAllFilesListed sees them.
export function unlisted(target, blancDir) {
  const listed = new Set(target.sources);
  const dirs = new Set(target.sources.map(s => path.posix.dirname(path.posix.dirname(s))));
  const missing = [];
  for (const dir of dirs) {
    for (const sub of fs.readdirSync(path.join(blancDir, dir), {withFileTypes: true})) {
      if (!sub.isDirectory()) continue;
      for (const file of fs.readdirSync(path.join(blancDir, dir, sub.name))) {
        if (file.startsWith('.')) continue;
        const rel = `${dir}/${sub.name}/${file}`;
        if (!listed.has(rel)) missing.push(`${target.name}: ${rel}`);
      }
    }
  }
  return missing;
}

test('the finder reports a file in a listed folder that the target leaves out', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-res-fixture-'));
  try {
    for (const f of ['android/res/values/a.xml', 'android/res/values-de/b.xml']) {
      fs.mkdirSync(path.dirname(path.join(dir, f)), {recursive: true}); fs.writeFileSync(path.join(dir, f), '');
    }
    const [target] = blancResourceTargets('android_resources("t") {\n sources = [ "//blanc/android/res/values/a.xml" ]\n}\n');
    assert.deepEqual(unlisted(target, dir), ['t: android/res/values-de/b.xml']);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('every Chromium resource target over Blanc files lists every file in its folders', () => {
  const blancDir = path.join(ROOT, 'blanc');
  const targets = [...blancResourceTargets(patchedChromeBuild()),
    ...blancResourceTargets(fs.readFileSync(path.join(blancDir, 'android/BUILD.gn'), 'utf8'), 'android')];
  assert.ok(targets.some(t => t.name === 'chrome_base_module_resources'), 'the base module resources were found');
  assert.deepEqual(targets.flatMap(t => unlisted(t, blancDir)), []);
});
