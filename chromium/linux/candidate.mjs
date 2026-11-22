import path from 'node:path';

function checkArch(arch) {
  if (arch !== 'x64' && arch !== 'arm64') throw new Error('Linux candidate architecture must be x64 or arm64.');
}

// L0 recorded one x64 candidate before arm64 runners existed.
export function byArchitecture(current) {
  if (!current?.id) return current ?? {};
  const arch = current.arch ?? 'x64';
  checkArch(arch);
  return {[arch]:current};
}

export function matchesLinuxCandidate(current, arch, config) {
  checkArch(arch);
  const recorded = byArchitecture(current)[arch];
  // The installed executable can be stripped. The verified package supplies
  // its digest; the archive's executable identifies the tracker entry.
  return !!recorded && recorded.id === config.candidate &&
    recorded.exeSha256 === (config.archiveExecutableSha256 ?? config.executableSha256);
}

export function ASSET_NAME(arch, channel = 'preview', build) {
  checkArch(arch);
  if (channel === 'preview') return `blanc-linux-${arch}-candidate.tar.gz`;
  if (channel !== 'beta' || !Number.isInteger(build) || build < 1 || build > 9999)
    throw new Error('Expected a beta channel and build number from 1 to 9999.');
  return `blanc-linux-beta-${arch}-${build}-candidate.tar.gz`;
}

export function signedCandidateName(arch) {
  checkArch(arch);
  return `signed-candidate-${arch}.json`;
}

function packageName(channel) {
  if (channel === 'beta') return 'blanc-beta';
  if (channel === 'preview') return 'blanc-prototype';
  throw new Error(`Unknown Linux channel: ${channel}`);
}

export function installedChrome(channel = 'preview') {
  return `/opt/bnfy/${packageName(channel)}/chrome`;
}

export function packageNames(version, arch, channel = 'preview') {
  checkArch(arch);
  if (!/^\d+(?:\.\d+){3}$/.test(version)) throw new Error('Expected a four-part Chromium version.');
  const name = packageName(channel);
  return {
    deb: `${name}_${version}-1_${arch === 'arm64' ? 'arm64' : 'amd64'}.deb`,
    rpm: `${name}-${version}-1.${arch === 'arm64' ? 'aarch64' : 'x86_64'}.rpm`,
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

export function runtimeConfig(directory, candidate, installedSha256) {
  if (candidate?.id !== candidateId(candidate?.exeSha256, candidate?.arch)) {
    throw new Error('candidate.json id does not match its chrome hash.');
  }
  const config = {candidate: candidate.id, singleBinary: true, diskAssets: false};
  if (installedSha256 !== undefined) {
    if (typeof installedSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(installedSha256)) {
      throw new Error('Expected the SHA-256 of the installed Linux executable.');
    }
    return {
      ...config,
      executable: installedChrome(candidate.channel),
      executableSha256: installedSha256,
      archiveExecutableSha256: candidate.exeSha256,
    };
  }
  // L0 tarballs have no packages and put the executable at the archive root.
  const runtime = Object.hasOwn(candidate, 'packages') ? path.join(directory, 'chrome') : directory;
  return {
    ...config,
    executable: path.join(runtime, 'chrome'),
    executableSha256: candidate.exeSha256,
    ...(candidate.channel === 'beta' ? {} : {blockerAssets: path.join(runtime, 'blocker')}),
  };
}
