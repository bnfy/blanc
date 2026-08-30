'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  ROOT,
  createComplianceArtifacts,
} = require('./compliance-model');

const LICENSE_NAME = /^(?:licen[sc]e|copying|notice)(?:\.|$)/i;

function resourcesDirectory(context) {
  if (context.electronPlatformName === 'darwin') {
    return path.join(
      context.appOutDir,
      `${context.packager.appInfo.productFilename}.app`,
      'Contents/Resources'
    );
  }
  return path.join(context.appOutDir, 'resources');
}

function safeLicenseFilename(name, version) {
  return `${name.replace(/^@/, '').replaceAll('/', '__').replace(/[^a-z0-9_.-]/gi, '_')}--${version}.txt`;
}

async function existingLicenseFiles(directory) {
  let names;
  try {
    names = await fs.readdir(directory);
  } catch {
    return [];
  }
  const files = [];
  for (const name of names.filter((candidate) => LICENSE_NAME.test(candidate)).sort()) {
    const target = path.join(directory, name);
    if ((await fs.stat(target)).isFile()) files.push(target);
  }
  return files;
}

async function firstFile(candidates) {
  for (const candidate of candidates) {
    if ((await fs.stat(candidate).catch(() => null))?.isFile()) return candidate;
  }
  return null;
}

async function extractElectronLegalArchive(context) {
  const electronPackage = require('../node_modules/electron/package.json');
  const checksums = require('../node_modules/electron/checksums.json');
  const { Arch } = require('builder-util');
  const arch = Arch[context.arch] || process.arch;
  const platform = context.electronPlatformName;
  if (!['darwin', 'win32', 'linux'].includes(platform) || !arch) {
    throw new Error(`package-compliance: unsupported Electron legal archive target ${platform}/${arch}`);
  }
  const [{ downloadArtifact }, { extract }] = await Promise.all([
    import('@electron/get'),
    import('@electron-internal/extract-zip'),
  ]);
  const archive = await downloadArtifact({
    version: electronPackage.version,
    artifactName: 'electron',
    platform,
    arch,
    checksums,
  });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'blanc-electron-legal-'));
  await extract(archive, { dir: directory });
  return directory;
}

async function copyElectronLegalFiles(context, resources) {
  const electronPackageDir = path.join(ROOT, 'node_modules/electron');
  const records = [
    {
      target: 'LICENSE.electron.txt',
      sources: [
        path.join(resources, 'LICENSE.electron.txt'),
        path.join(context.appOutDir, 'LICENSE.electron.txt'),
        path.join(electronPackageDir, 'LICENSE'),
      ],
    },
    {
      target: 'LICENSES.chromium.html',
      sources: [
        path.join(resources, 'LICENSES.chromium.html'),
        path.join(context.appOutDir, 'LICENSES.chromium.html'),
        path.join(electronPackageDir, 'LICENSES.chromium.html'),
      ],
    },
  ];
  let extracted = null;
  try {
    const missing = [];
    for (const record of records) {
      if (!await firstFile(record.sources)) missing.push(record.target);
    }
    if (missing.length) extracted = await extractElectronLegalArchive(context);

    for (const record of records) {
      const archiveName = record.target === 'LICENSE.electron.txt' ? 'LICENSE' : record.target;
      const source = await firstFile([
        ...record.sources,
        ...(extracted ? [path.join(extracted, archiveName)] : []),
      ]);
      if (!source) throw new Error(`package-compliance: Electron legal record is missing: ${record.target}`);
      const target = path.join(resources, record.target);
      if (path.resolve(source) !== path.resolve(target)) await fs.copyFile(source, target);
    }
  } finally {
    if (extracted) await fs.rm(extracted, { recursive: true, force: true });
  }
}

async function packageCompliance(context) {
  const generated = createComplianceArtifacts();
  const noticeRelative = 'compliance/THIRD_PARTY_NOTICES.txt';
  const sbomRelative = 'compliance/runtime-sbom.cdx.json';
  const notice = await fs.readFile(path.join(ROOT, noticeRelative), 'utf8');
  const sbom = await fs.readFile(path.join(ROOT, sbomRelative), 'utf8');
  if (notice !== generated.files[noticeRelative] || sbom !== generated.files[sbomRelative]) {
    throw new Error('package-compliance: committed runtime notices/SBOM are stale; run npm run compliance:build');
  }

  const resources = resourcesDirectory(context);
  const licenseDir = path.join(resources, 'ThirdPartyLicenses');
  await fs.mkdir(licenseDir, { recursive: true });
  await fs.writeFile(path.join(resources, 'THIRD_PARTY_NOTICES.txt'), notice);
  await fs.writeFile(path.join(resources, 'runtime-sbom.cdx.json'), sbom);
  await fs.copyFile(path.join(ROOT, 'LICENSE'), path.join(resources, 'LICENSE.blanc.txt'));

  for (const item of generated.runtime.runtimePackages) {
    const { name, version } = item.component;
    const packageDir = path.join(ROOT, item.lockPath);
    const licenseFiles = await existingLicenseFiles(packageDir);
    let body;
    if (licenseFiles.length) {
      const sections = [];
      for (const file of licenseFiles) {
        sections.push(`===== ${path.basename(file)} =====\n\n${await fs.readFile(file, 'utf8').then((text) => text.trim())}`);
      }
      body = `${name} ${version}\n\n${sections.join('\n\n')}`;
    } else {
      const fallback = generated.policy.licenseFileFallbacks[`${name}@${version}`];
      if (!fallback || fallback.license !== item.entry.license) {
        throw new Error(`package-compliance: ${name}@${version} ships no license file and has no matching fallback`);
      }
      const evidence = fallback.evidence && path.join(ROOT, fallback.evidence);
      if (!(await fs.stat(evidence || '').catch(() => null))?.isFile()) {
        throw new Error(`package-compliance: ${name}@${version} fallback evidence is missing`);
      }
      body = `${name} ${version}\n${fallback.reason}\n\n${(await fs.readFile(evidence, 'utf8')).trim()}`;
    }
    await fs.writeFile(
      path.join(licenseDir, safeLicenseFilename(name, version)),
      `${body}\n`
    );
  }

  for (const asset of generated.policy.assets.filter((item) => item.licenseFile)) {
    await fs.copyFile(
      path.join(ROOT, asset.licenseFile),
      path.join(licenseDir, path.basename(asset.licenseFile))
    );
  }

  await copyElectronLegalFiles(context, resources);

  console.log(
    `package-compliance: bundled runtime SBOM, notices, and ${generated.runtime.runtimePackages.length} npm license records.`
  );
}

module.exports = {
  copyElectronLegalFiles,
  extractElectronLegalArchive,
  existingLicenseFiles,
  packageCompliance,
  resourcesDirectory,
  safeLicenseFilename,
};
