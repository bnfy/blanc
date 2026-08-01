'use strict';

const fs = require('node:fs/promises');
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

async function copyElectronLegalFiles(context, resources) {
  const electronDist = path.join(ROOT, 'node_modules/electron/dist');
  const records = [
    {
      target: 'LICENSE.electron.txt',
      sources: [
        path.join(resources, 'LICENSE.electron.txt'),
        path.join(context.appOutDir, 'LICENSE.electron.txt'),
        path.join(electronDist, 'LICENSE'),
      ],
    },
    {
      target: 'LICENSES.chromium.html',
      sources: [
        path.join(resources, 'LICENSES.chromium.html'),
        path.join(context.appOutDir, 'LICENSES.chromium.html'),
        path.join(electronDist, 'LICENSES.chromium.html'),
      ],
    },
  ];
  for (const record of records) {
    const source = await firstFile(record.sources);
    if (!source) throw new Error(`package-compliance: Electron legal record is missing: ${record.target}`);
    const target = path.join(resources, record.target);
    if (path.resolve(source) !== path.resolve(target)) await fs.copyFile(source, target);
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
      body = `${name} ${version}\n${fallback.reason}\n\n${fallback.notice.trim()}`;
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
  existingLicenseFiles,
  packageCompliance,
  resourcesDirectory,
  safeLicenseFilename,
};
