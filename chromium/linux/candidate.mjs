import path from 'node:path';

function checkArch(arch) {
  if (arch !== 'x64' && arch !== 'arm64') throw new Error('Linux candidate architecture must be x64 or arm64.');
}

export function ASSET_NAME(arch) {
  checkArch(arch);
  return `blanc-linux-${arch}-candidate.tar.gz`;
}

export function signedCandidateName(arch) {
  checkArch(arch);
  return `signed-candidate-${arch}.json`;
}

export function packageNames(version, arch) {
  checkArch(arch);
  if (!/^\d+(?:\.\d+){3}$/.test(version)) throw new Error('Expected a four-part Chromium version.');
  return {
    deb: `blanc-prototype_${version}-1_${arch === 'arm64' ? 'arm64' : 'amd64'}.deb`,
    rpm: `blanc-prototype-${version}-1.${arch === 'arm64' ? 'aarch64' : 'x86_64'}.rpm`,
  };
}

export function candidateId(exeSha256, arch = 'x64') {
  checkArch(arch);
  if (typeof exeSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(exeSha256)) {
    throw new Error('chrome SHA-256 must be 64 lowercase hex digits.');
  }
  return `linux-${arch}-${exeSha256.slice(0, 16)}`;
}

// GN reports runtime_deps relative to the build output, including directories.
export function runtimeFiles(lines) {
  const files = new Set();
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (path.win32.isAbsolute(line) || line.includes('\\') || line.split('/').includes('..')) {
      throw new Error(`Runtime file outside the output folder: ${line}`);
    }
    const relative = path.posix.normalize(line).replace(/\/$/, '');
    if (relative === '.') throw new Error('A runtime dependency names the whole output folder.');
    if (!/\.(pdb|lib|exp|ilk)$/i.test(relative)) files.add(relative);
  }
  if (!files.has('chrome')) throw new Error('The Linux runtime list has no chrome executable.');
  return [...files].sort();
}

export function runtimeConfig(directory, candidate) {
  if (candidate?.id !== candidateId(candidate?.exeSha256, candidate?.arch)) {
    throw new Error('candidate.json id does not match its chrome hash.');
  }
  // L0 tarballs have no packages and put the executable at the archive root.
  const runtime = Object.hasOwn(candidate, 'packages') ? path.join(directory, 'chrome') : directory;
  return {
    candidate: candidate.id,
    executable: path.join(runtime, 'chrome'),
    executableSha256: candidate.exeSha256,
    singleBinary: true,
    blockerAssets: path.join(runtime, 'blocker'),
    diskAssets: false,
  };
}
