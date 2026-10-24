'use strict';
// Blanc's own Linux native pieces for the ECS (DRM) package, built for an old
// glibc baseline so the AppImage starts on every supported distribution.
//
// Blanc 1.43.0 compiled both on the Ubuntu 24.04 release runner, so its
// launcher needed GLIBC_2.38 and GLIBCXX_3.4.32 and its CDM preload GLIBC_2.34:
// the AppImage didn't start on Ubuntu 22.04 or Debian 12. The castLabs runtime
// itself needs only GLIBC_2.25.
//
// - The launcher calls only file, prctl and execv APIs (no NSS, no dlopen), so
//   it links fully static: no interpreter and no shared libraries at all.
// - The CDM preload is loaded into Chromium's processes and must stay a shared
//   library, so it is compiled in a pinned manylinux_2_28 image (glibc 2.28).
// Both are then checked from their ELF headers (assertLinuxBaseline); a build
// that needs anything newer fails closed.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Pinned by digest: a reviewed build input, like the castLabs archives.
const LINUX_NATIVE_IMAGE = 'quay.io/pypa/manylinux_2_28_x86_64@sha256:f6adcfd450f0927a05c66ded9b4c3bb538fbab625b1ca3f35d71ac093b24b57f';
const LINUX_GLIBC_BASELINE = '2.28';

const LAUNCHER_FLAGS = ['-std=c++17', '-O2', '-Wall', '-Wextra', '-Werror', '-DBLANC_ECS_PRODUCTION', '-static',
  '-Wl,-z,relro,-z,now'];
const PRELOAD_FLAGS = ['-shared', '-fPIC', '-O2', '-Wall', '-Wextra', '-Werror', '-fvisibility=hidden',
  '-Wl,-z,relro,-z,now'];

/** Build the fully static launcher with the host compiler. */
function buildLauncher(source, output, { exec = execFileSync } = {}) {
  exec('c++', [...LAUNCHER_FLAGS, source, '-o', output], { stdio: 'inherit' });
  return output;
}

/** Build the CDM preload inside the pinned glibc 2.28 image. */
function buildCdmPreload(source, output, { exec = execFileSync, image = LINUX_NATIVE_IMAGE } = {}) {
  const sourceDir = path.dirname(path.resolve(source));
  const outputDir = path.dirname(path.resolve(output));
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
  const gid = typeof process.getgid === 'function' ? process.getgid() : 0;
  exec('docker', ['run', '--rm', '--platform', 'linux/amd64', '--network', 'none', '--user', `${uid}:${gid}`,
    '-v', `${sourceDir}:/blanc-src:ro`, '-v', `${outputDir}:/blanc-out`, image,
    'cc', ...PRELOAD_FLAGS, `/blanc-src/${path.basename(source)}`, '-o', `/blanc-out/${path.basename(output)}`, '-ldl'],
  { stdio: 'inherit' });
  return output;
}

const versionParts = (value) => value.split('.').map(Number);
function newerThan(version, baseline) {
  const a = versionParts(version), b = versionParts(baseline);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

/**
 * What a binary needs at load time, from `readelf -V -d -l --wide` output:
 * the dynamic loader it asks for, its NEEDED libraries, and every versioned
 * symbol requirement (GLIBC_x, GLIBCXX_x, CXXABI_x, GCC_x).
 */
function parseElfNeeds(readelfText) {
  const text = String(readelfText ?? '');
  const interpreter = /\[Requesting program interpreter: ([^\]]+)\]/.exec(text)?.[1] ?? null;
  const needed = [...text.matchAll(/\(NEEDED\)\s+Shared library: \[([^\]]+)\]/g)].map((m) => m[1]);
  const versions = [...new Set([...text.matchAll(/Name: ((?:GLIBC|GLIBCXX|CXXABI|GCC)_[0-9.]+)/g)].map((m) => m[1]))];
  return { interpreter, needed, versions };
}

/** Problems with a binary against the baseline; [] when it passes. */
function baselineProblems(needs, { kind, baseline = LINUX_GLIBC_BASELINE } = {}) {
  const problems = [];
  if (kind === 'static') {
    if (needs.interpreter) problems.push(`asks for a dynamic loader (${needs.interpreter})`);
    if (needs.needed.length) problems.push(`needs shared libraries (${needs.needed.join(', ')})`);
  }
  for (const version of needs.versions) {
    const [family, number] = version.split('_');
    if (family === 'GLIBC') {
      if (newerThan(number, baseline)) problems.push(`needs ${version}, newer than glibc ${baseline}`);
    } else {
      problems.push(`needs ${version} from the system C++ runtime`);
    }
  }
  if (kind === 'shared') {
    const allowed = new Set(['libc.so.6', 'libdl.so.2']);
    const extra = needs.needed.filter((lib) => !allowed.has(lib));
    if (extra.length) problems.push(`needs libraries beyond libc (${extra.join(', ')})`);
  }
  return problems;
}

/** Throw unless the binary fits the baseline. Reads it with readelf. */
function assertLinuxBaseline(file, { kind, baseline = LINUX_GLIBC_BASELINE, exec = execFileSync } = {}) {
  if (!['static', 'shared'].includes(kind)) throw Error(`Unknown Linux native kind: ${kind}`);
  if (!fs.existsSync(file)) throw Error(`Linux native missing: ${file}`);
  const text = exec('readelf', ['-V', '-d', '-l', '--wide', file], { encoding: 'utf8' });
  const problems = baselineProblems(parseElfNeeds(text), { kind, baseline });
  if (problems.length) {
    throw Error(`${path.basename(file)} would not start on glibc ${baseline}: ${problems.join('; ')}`);
  }
  return true;
}

module.exports = {
  LINUX_NATIVE_IMAGE,
  LINUX_GLIBC_BASELINE,
  LAUNCHER_FLAGS,
  PRELOAD_FLAGS,
  buildLauncher,
  buildCdmPreload,
  parseElfNeeds,
  baselineProblems,
  assertLinuxBaseline,
};
