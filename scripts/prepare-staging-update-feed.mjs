#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const PLATFORM_METADATA = Object.freeze({
  mac: ['latest-mac.yml', 'staging-mac.yml'],
  windows: ['latest.yml', 'staging.yml'],
  linux: ['latest-linux.yml', 'staging-linux.yml'],
});

function yamlScalar(raw) {
  const value = raw.trim();
  if (value.startsWith('"') && value.endsWith('"')) return JSON.parse(value);
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value;
}

export function inspectUpdateMetadata(text) {
  const versionMatch = text.match(/^version:\s*(.+?)\s*$/m);
  if (!versionMatch) throw new Error('update metadata has no version');
  const version = yamlScalar(versionMatch[1]);

  const assets = new Set();
  for (const match of text.matchAll(/^\s*(?:-\s+)?(?:url|path):\s*(.+?)\s*$/gm)) {
    const asset = yamlScalar(match[1]);
    if (
      !asset || asset.includes('/') || asset.includes('\\') ||
      path.basename(asset) !== asset || asset === '.' || asset === '..'
    ) {
      throw new Error(`unsafe update asset path: ${asset}`);
    }
    assets.add(asset);
  }
  if (!assets.size) throw new Error('update metadata references no artifacts');
  return { version, assets: [...assets] };
}

export function prepareStagingFeed({ sourceDir, outputDir, platform, expectedVersion }) {
  const names = PLATFORM_METADATA[platform];
  if (!names) throw new Error(`unknown platform ${platform}; use mac, windows, or linux`);

  const source = path.resolve(sourceDir);
  const output = path.resolve(outputDir);
  if (source === output) throw new Error('staging output must be separate from the build directory');
  if (!fs.statSync(source, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`build directory does not exist: ${source}`);
  }
  if (fs.existsSync(output) && fs.readdirSync(output).length) {
    throw new Error(`staging output is not empty: ${output}`);
  }

  const [sourceMetadataName, stagingMetadataName] = names;
  const sourceMetadata = path.join(source, sourceMetadataName);
  if (!fs.statSync(sourceMetadata, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`missing update metadata: ${sourceMetadata}`);
  }
  const metadata = fs.readFileSync(sourceMetadata, 'utf8');
  const inspected = inspectUpdateMetadata(metadata);
  if (expectedVersion && inspected.version !== expectedVersion) {
    throw new Error(
      `metadata version ${inspected.version} does not match expected ${expectedVersion}`
    );
  }

  const copies = [];
  for (const asset of inspected.assets) {
    const assetPath = path.join(source, asset);
    if (!fs.statSync(assetPath, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`metadata references a missing artifact: ${asset}`);
    }
    copies.push([assetPath, asset]);

    const blockmap = `${assetPath}.blockmap`;
    if (fs.statSync(blockmap, { throwIfNoEntry: false })?.isFile()) {
      copies.push([blockmap, `${asset}.blockmap`]);
    }
  }

  fs.mkdirSync(output, { recursive: true });
  const copied = [];
  for (const [sourcePath, name] of copies) {
    fs.copyFileSync(sourcePath, path.join(output, name));
    copied.push(name);
  }
  fs.writeFileSync(path.join(output, stagingMetadataName), metadata);

  return {
    version: inspected.version,
    metadata: stagingMetadataName,
    assets: copied.sort(),
    outputDir: output,
  };
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const outputDir = option('--output');
    if (!outputDir) throw new Error('--output is required');
    const defaultPlatform = process.platform === 'darwin'
      ? 'mac'
      : (process.platform === 'win32' ? 'windows' : 'linux');
    const result = prepareStagingFeed({
      sourceDir: option('--source') || 'dist',
      outputDir,
      platform: option('--platform') || defaultPlatform,
      expectedVersion: option('--version') || null,
    });
    console.log(
      `staging update feed ready: ${result.version} (${result.metadata}, ${result.assets.length} artifacts) at ${result.outputDir}`
    );
  } catch (err) {
    console.error(`prepare-staging-update-feed: ${err.message}`);
    process.exitCode = 1;
  }
}
