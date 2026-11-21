import path from 'node:path';

export const ASSET_NAME = 'blanc-linux-candidate.tar.gz';

export function candidateId(exeSha256) {
  if (typeof exeSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(exeSha256)) {
    throw new Error('chrome SHA-256 must be 64 lowercase hex digits.');
  }
  return `linux-x64-${exeSha256.slice(0, 16)}`;
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
  if (candidate?.id !== candidateId(candidate?.exeSha256)) {
    throw new Error('candidate.json id does not match its chrome hash.');
  }
  return {
    candidate: candidate.id,
    executable: path.join(directory, 'chrome'),
    executableSha256: candidate.exeSha256,
    singleBinary: true,
    blockerAssets: path.join(directory, 'blocker'),
    diskAssets: false,
  };
}
