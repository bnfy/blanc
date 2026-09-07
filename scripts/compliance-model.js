'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const NOFOLLOW = fs.constants.O_NOFOLLOW || 0;

const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));

function readRegularFile(relative) {
  const absolute = path.join(ROOT, relative);
  const descriptor = fs.openSync(absolute, fs.constants.O_RDONLY | NOFOLLOW);
  try {
    if (!fs.fstatSync(descriptor).isFile()) throw new Error(`${relative} is not a regular file`);
    return fs.readFileSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function packageName(lockPath) {
  const marker = 'node_modules/';
  const index = lockPath.lastIndexOf(marker);
  if (index === -1) throw new Error(`not a package lock path: ${lockPath}`);
  return lockPath.slice(index + marker.length);
}

function npmPurl(name, version) {
  if (name.startsWith('@')) {
    const slash = name.indexOf('/');
    return `pkg:npm/${encodeURIComponent(name.slice(0, slash))}/${encodeURIComponent(name.slice(slash + 1))}@${encodeURIComponent(version)}`;
  }
  return `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(version)}`;
}

function licenseChoice(expression) {
  return /\s(?:AND|OR|WITH)\s|[()]/.test(expression)
    ? { expression }
    : { license: { id: expression } };
}

function integrityHash(integrity) {
  if (!integrity) return [];
  const token = integrity.split(/\s+/)[0];
  const dash = token.indexOf('-');
  if (dash === -1) throw new Error(`invalid package integrity: ${integrity}`);
  const algorithm = token.slice(0, dash).toLowerCase();
  const alg = { sha1: 'SHA-1', sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' }[algorithm];
  if (!alg) throw new Error(`unsupported package integrity algorithm: ${algorithm}`);
  return [{ alg, content: Buffer.from(token.slice(dash + 1), 'base64').toString('hex') }];
}

function resolveDependencyPath(packages, parentPath, name) {
  let directory = parentPath || '.';
  for (;;) {
    const candidate = (directory === '.'
      ? `node_modules/${name}`
      : `${directory}/node_modules/${name}`).replace(/^\.\//, '');
    if (packages[candidate]) return candidate;
    const parent = path.posix.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error(`package-lock cannot resolve ${name} from ${parentPath || '<root>'}`);
}

function componentProperties(values) {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([name, value]) => ({ name: `blanc:${name}`, value: String(value) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function packageComponent({ workspace, lockPath, entry, license, override }) {
  const name = packageName(lockPath);
  const purl = npmPurl(name, entry.version);
  const component = {
    type: 'library',
    'bom-ref': purl,
    name,
    version: entry.version,
    scope: entry.dev ? 'optional' : 'required',
    hashes: integrityHash(entry.integrity),
    licenses: [licenseChoice(license)],
    purl,
    properties: componentProperties({
      workspace,
      lockPath,
      development: !!entry.dev,
      optional: !!entry.optional,
      licenseOverride: override?.reason,
      os: entry.os?.join(','),
      cpu: entry.cpu?.join(','),
    }),
  };
  if (entry.resolved && /^https?:\/\//.test(entry.resolved)) {
    component.externalReferences = [{ type: 'distribution', url: entry.resolved }];
  }
  return component;
}

function auditedLicense({ lockFile, name, entry, override }) {
  const license = entry.license || override?.license;
  if (!license) throw new Error(`${lockFile}: ${name}@${entry.version} has no audited license metadata`);
  if (override) {
    const evidence = path.join(ROOT, override.evidence || '');
    if (!fs.statSync(evidence, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`${lockFile}: license override evidence is missing: ${override.evidence}`);
    }
  }
  return license;
}

function lockModel({ workspace, packageFile, lockFile, policy }) {
  const pkg = readJson(packageFile);
  const lock = readJson(lockFile);
  if (lock.lockfileVersion !== 3 || !lock.packages?.['']) {
    throw new Error(`${lockFile} must use npm lockfileVersion 3 with a root packages entry`);
  }

  const byPath = new Map();
  const components = new Map();
  for (const [lockPath, entry] of Object.entries(lock.packages)) {
    if (!lockPath) continue;
    if (!entry.version) throw new Error(`${lockFile}: ${lockPath} has no version`);
    const name = packageName(lockPath);
    const override = policy.metadataOverrides[`${workspace}:${name}@${entry.version}`];
    const license = auditedLicense({ lockFile, name, entry, override });

    const component = packageComponent({ workspace, lockPath, entry, license, override });
    const existing = components.get(component['bom-ref']);
    if (existing) {
      const same = existing.hashes[0]?.content === component.hashes[0]?.content &&
        JSON.stringify(existing.licenses) === JSON.stringify(component.licenses);
      if (!same) throw new Error(`${lockFile}: conflicting copies of ${component['bom-ref']}`);
      const lockPaths = new Set(
        existing.properties.find((item) => item.name === 'blanc:lockPaths')?.value.split(',') ||
        [existing.properties.find((item) => item.name === 'blanc:lockPath').value]
      );
      lockPaths.add(lockPath);
      existing.properties = existing.properties.filter((item) =>
        item.name !== 'blanc:lockPath' && item.name !== 'blanc:lockPaths');
      existing.properties.push({ name: 'blanc:lockPaths', value: [...lockPaths].sort().join(',') });
      existing.properties.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      components.set(component['bom-ref'], component);
    }
    byPath.set(lockPath, { entry, component });
  }

  const dependencies = new Map();
  const rootRef = `application:${workspace}:${pkg.name}@${pkg.version || '0'}`;
  dependencies.set(rootRef, new Set());
  const rootDeps = {
    ...pkg.dependencies,
    ...pkg.optionalDependencies,
    ...pkg.devDependencies,
  };
  for (const name of Object.keys(rootDeps)) {
    const child = resolveDependencyPath(lock.packages, '', name);
    dependencies.get(rootRef).add(byPath.get(child).component['bom-ref']);
  }
  for (const [lockPath, { entry, component }] of byPath) {
    const set = dependencies.get(component['bom-ref']) || new Set();
    for (const name of Object.keys({ ...entry.dependencies, ...entry.optionalDependencies })) {
      const child = resolveDependencyPath(lock.packages, lockPath, name);
      set.add(byPath.get(child).component['bom-ref']);
    }
    dependencies.set(component['bom-ref'], set);
  }

  return { workspace, pkg, lock, byPath, components, dependencies, rootRef };
}

function runtimeClosure(model) {
  const directNames = Object.keys({
    ...model.pkg.dependencies,
    ...model.pkg.optionalDependencies,
  });
  const queue = directNames.map((name) => resolveDependencyPath(model.lock.packages, '', name));
  const paths = new Set();
  while (queue.length) {
    const lockPath = queue.shift();
    if (paths.has(lockPath)) continue;
    paths.add(lockPath);
    const entry = model.lock.packages[lockPath];
    for (const name of Object.keys({ ...entry.dependencies, ...entry.optionalDependencies })) {
      queue.push(resolveDependencyPath(model.lock.packages, lockPath, name));
    }
  }
  return { directNames, paths };
}

function assetVersion(asset, contents, policy) {
  if (asset.manifest) return readJson(asset.manifest).seedId;
  const version = contents.match(/^! Version:\s*(.+?)\s*$/m)?.[1];
  if (version) return version;
  if (asset.id === 'ghostery-resources') {
    return readJson('src/main/assets/adblock-engine-seed.json').resources.upstreamCommit;
  }
  return undefined;
}

function assetComponents(policy) {
  const components = [];
  for (const asset of policy.assets) {
    if (!policy.runtimeAllowedLicenseExpressions.includes(asset.license)) {
      throw new Error(`${asset.id}: unaudited runtime asset license ${asset.license}`);
    }
    if (asset.licenseFile && !fs.statSync(path.join(ROOT, asset.licenseFile), { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`${asset.id}: missing license file ${asset.licenseFile}`);
    }
    let bytes;
    try {
      bytes = readRegularFile(asset.file);
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'ELOOP') {
        throw new Error(`${asset.id}: missing asset ${asset.file}`);
      }
      throw error;
    }
    const contents = bytes.toString('utf8');
    const component = {
      type: asset.type,
      'bom-ref': `asset:${asset.id}`,
      name: asset.name,
      scope: 'required',
      hashes: [{ alg: 'SHA-256', content: crypto.createHash('sha256').update(bytes).digest('hex') }],
      licenses: [licenseChoice(asset.license)],
      properties: componentProperties({
        file: asset.file,
        attribution: asset.attribution,
        licenseFile: asset.licenseFile,
        licenseUrl: asset.licenseUrl,
      }),
    };
    const version = assetVersion(asset, contents, policy);
    if (version) component.version = version;
    if (asset.homepage) component.externalReferences = [{ type: 'website', url: asset.homepage }];
    components.push(component);
  }
  return components;
}

function electronComponent(model, policy) {
  const lockPath = resolveDependencyPath(model.lock.packages, '', 'electron');
  const entry = model.lock.packages[lockPath];
  if (!policy.runtimeAllowedLicenseExpressions.includes(entry.license)) {
    throw new Error(`electron@${entry.version}: unaudited runtime license ${entry.license}`);
  }
  const component = packageComponent({
    workspace: 'root',
    lockPath,
    entry,
    license: entry.license,
  });
  component.type = 'framework';
  component.scope = 'required';
  component.properties = componentProperties({
    distributedRuntime: true,
    declaration: 'devDependency used as the packaged application framework',
  });
  return component;
}

function bom({ name, version, rootRef, components, dependencies, description }) {
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    version: 1,
    metadata: {
      component: {
        type: 'application',
        'bom-ref': rootRef,
        name,
        version,
        description,
      },
      properties: [{ name: 'blanc:generated-from', value: 'committed lockfiles and compliance/policy.json' }],
    },
    components: [...components].sort((a, b) => a['bom-ref'].localeCompare(b['bom-ref'])),
    dependencies: [...dependencies.entries()]
      .map(([ref, values]) => ({ ref, dependsOn: [...values].sort() }))
      .sort((a, b) => a.ref.localeCompare(b.ref)),
  };
}

function buildSbom(model) {
  return bom({
    name: `${model.pkg.name} dependency lock`,
    version: model.pkg.version || '0',
    rootRef: model.rootRef,
    components: model.components.values(),
    dependencies: model.dependencies,
    description: `Complete ${model.workspace} npm supply-chain inventory, including development and optional packages.`,
  });
}

function runtimeSbom(model, policy) {
  const closure = runtimeClosure(model);
  const components = [];
  const refsByName = new Map();
  const dependencies = new Map();
  for (const lockPath of closure.paths) {
    const { component, entry } = model.byPath.get(lockPath);
    const license = entry.license;
    if (!policy.runtimeAllowedLicenseExpressions.includes(license)) {
      throw new Error(`${component.name}@${component.version}: unaudited runtime license ${license}`);
    }
    components.push(component);
    if (!refsByName.has(component.name)) refsByName.set(component.name, component['bom-ref']);
    const childRefs = model.dependencies.get(component['bom-ref']) || new Set();
    dependencies.set(component['bom-ref'], new Set(
      [...childRefs].filter((ref) => components.some((candidate) => candidate['bom-ref'] === ref) ||
        [...closure.paths].some((candidatePath) => model.byPath.get(candidatePath).component['bom-ref'] === ref))
    ));
  }

  const electron = electronComponent(model, policy);
  components.push(electron);
  dependencies.set(electron['bom-ref'], new Set());

  const assets = assetComponents(policy);
  for (const component of assets) {
    components.push(component);
    dependencies.set(component['bom-ref'], new Set());
  }
  for (const asset of policy.assets) {
    const deps = dependencies.get(`asset:${asset.id}`);
    for (const requested of asset.dependsOn || []) {
      if (requested.startsWith('npm:')) {
        const ref = refsByName.get(requested.slice(4));
        if (!ref) throw new Error(`${asset.id}: runtime npm dependency not found: ${requested}`);
        deps.add(ref);
      } else {
        const ref = `asset:${requested}`;
        if (!dependencies.has(ref)) throw new Error(`${asset.id}: asset dependency not found: ${requested}`);
        deps.add(ref);
      }
    }
  }

  const rootRef = `application:runtime:${model.pkg.name}@${model.pkg.version}`;
  const rootDeps = new Set([electron['bom-ref'], 'asset:inter-font', 'asset:jetbrains-mono-font', 'asset:blanc-adblock-seed']);
  for (const name of closure.directNames) {
    const lockPath = resolveDependencyPath(model.lock.packages, '', name);
    rootDeps.add(model.byPath.get(lockPath).component['bom-ref']);
  }
  dependencies.set(rootRef, rootDeps);

  return {
    sbom: bom({
      name: model.pkg.productName || model.pkg.name,
      version: model.pkg.version,
      rootRef,
      components,
      dependencies,
      description: 'Shipped desktop runtime: npm closure, Electron framework, bundled fonts, and blocker data provenance.',
    }),
    runtimePackages: [...closure.paths].map((lockPath) => ({
      lockPath,
      entry: model.lock.packages[lockPath],
      component: model.byPath.get(lockPath).component,
    })).sort((a, b) => a.component['bom-ref'].localeCompare(b.component['bom-ref'])),
    electron,
    assets,
  };
}

function notices(runtime, policy, application) {
  const lines = [
    'BLANC THIRD-PARTY NOTICES',
    '',
    'Generated from package-lock.json and compliance/policy.json. Do not edit by hand.',
    `Blanc itself is released under the ${application.license} License; LICENSE.blanc.txt is copied beside this notice.`,
    'The notices below cover third-party material distributed with Blanc.',
    '',
    'RUNTIME NPM COMPONENTS',
    '',
  ];
  for (const item of runtime.runtimePackages) {
    const c = item.component;
    const license = item.entry.license;
    lines.push(`- ${c.name} ${c.version} — ${license} — ${item.entry.resolved || c.purl}`);
  }
  lines.push(
    '',
    'EMBEDDED FRAMEWORK',
    '',
    `- Electron ${runtime.electron.version} — MIT — https://github.com/electron/electron`,
    '  Electron embeds Chromium, Node.js, V8, and other upstream work. LICENSE.electron.txt and',
    '  LICENSES.chromium.html are copied beside this notice in every packaged application.',
    '',
    'BUNDLED ASSETS AND DATA',
    ''
  );
  for (const asset of policy.assets) {
    const component = runtime.assets.find((candidate) => candidate['bom-ref'] === `asset:${asset.id}`);
    const version = component.version ? ` ${component.version}` : '';
    lines.push(`- ${asset.name}${version} — ${asset.license}`);
    if (asset.attribution) lines.push(`  Attribution: ${asset.attribution}`);
    if (asset.homepage) lines.push(`  Source: ${asset.homepage}`);
    if (asset.licenseUrl) lines.push(`  License: ${asset.licenseUrl}`);
    if (asset.licenseFile) lines.push(`  Full text: ThirdPartyLicenses/${path.basename(asset.licenseFile)}`);
  }
  lines.push(
    '',
    'MPL SOURCE AVAILABILITY',
    '',
    'Blanc uses unmodified npm releases from the Ghostery adblocker project under MPL-2.0.',
    'The corresponding source is linked above and Blanc source is available at https://github.com/bnfy/blanc.',
    '',
    'Full license texts shipped by runtime npm packages are copied into ThirdPartyLicenses/.',
    ''
  );
  return lines.join('\n');
}

function createComplianceArtifacts() {
  const policy = readJson('compliance/policy.json');
  if (policy.schemaVersion !== 1) throw new Error('unsupported compliance policy schema');
  for (const [key, fallback] of Object.entries(policy.licenseFileFallbacks || {})) {
    if (!/^.+@\d+\.\d+\.\d+(?:-.+)?$/.test(key) || !fallback.license || !fallback.reason) {
      throw new Error(`invalid version-pinned license fallback: ${key}`);
    }
    if (!fallback.evidence || !fs.statSync(path.join(ROOT, fallback.evidence), { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`${key}: committed license fallback evidence is missing`);
    }
  }
  const root = lockModel({
    workspace: 'root',
    packageFile: 'package.json',
    lockFile: 'package-lock.json',
    policy,
  });
  const site = lockModel({
    workspace: 'site',
    packageFile: 'site/package.json',
    lockFile: 'site/package-lock.json',
    policy,
  });
  const runtime = runtimeSbom(root, policy);
  return {
    policy,
    runtime,
    files: {
      'compliance/runtime-sbom.cdx.json': `${JSON.stringify(runtime.sbom, null, 2)}\n`,
      'compliance/root-lock-sbom.cdx.json': `${JSON.stringify(buildSbom(root), null, 2)}\n`,
      'compliance/site-lock-sbom.cdx.json': `${JSON.stringify(buildSbom(site), null, 2)}\n`,
      'compliance/THIRD_PARTY_NOTICES.txt': notices(runtime, policy, root.pkg),
    },
  };
}

module.exports = {
  ROOT,
  auditedLicense,
  createComplianceArtifacts,
  integrityHash,
  lockModel,
  npmPurl,
  packageName,
  resolveDependencyPath,
  runtimeSbom,
  runtimeClosure,
};
