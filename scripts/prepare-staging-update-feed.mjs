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
const NOFOLLOW = fs.constants.O_NOFOLLOW || 0;
const COPY_BUFFER_BYTES = 1024 * 1024;

function readRegularFile(file) {
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | NOFOLLOW);
  try {
    if (!fs.fstatSync(descriptor).isFile()) throw new Error(`not a regular file: ${file}`);
    return fs.readFileSync(descriptor, 'utf8');
  } finally {
    fs.closeSync(descriptor);
  }
}

function copyRegularFile(source, target) {
  let sourceDescriptor;
  let targetDescriptor;
  let complete = false;
  try {
    sourceDescriptor = fs.openSync(source, fs.constants.O_RDONLY | NOFOLLOW);
    if (!fs.fstatSync(sourceDescriptor).isFile()) throw new Error(`not a regular file: ${source}`);
    targetDescriptor = fs.openSync(
      target,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | NOFOLLOW,
      0o600
    );
    const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
    for (;;) {
      const bytesRead = fs.readSync(sourceDescriptor, buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      let written = 0;
      while (written < bytesRead) {
        written += fs.writeSync(targetDescriptor, buffer, written, bytesRead - written);
      }
    }
    fs.fsyncSync(targetDescriptor);
    complete = true;
  } finally {
    if (targetDescriptor !== undefined) fs.closeSync(targetDescriptor);
    if (sourceDescriptor !== undefined) fs.closeSync(sourceDescriptor);
    if (!complete) fs.rmSync(target, { force: true });
  }
}

function yamlScalar(raw) {
  const value = raw.trim();
  if (value.startsWith('"') && value.endsWith('"')) return JSON.parse(value);
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'");
  return value;
}

export function inspectUpdateMetadata(text) {
  const versionMatch = text.match(/^version:\s*(.+?)\s*$/m);
  if (!versionMatch) throw new Error('update metadata has no version');
  const version = yamlScalar(versionMatch[1]);
  const assets = new Set();
  for (const match of text.matchAll(/^\s*(?:-\s+)?(?:url|path):\s*(.+?)\s*$/gm)) {
    const asset = yamlScalar(match[1]);
    if (!asset || asset.includes('/') || asset.includes('\\') ||
        path.basename(asset) !== asset || asset === '.' || asset === '..') {
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
  let metadata;
  try {
    metadata = readRegularFile(sourceMetadata);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ELOOP') {
      throw new Error(`missing update metadata: ${sourceMetadata}`);
    }
    throw error;
  }
  const inspected = inspectUpdateMetadata(metadata);
  if (expectedVersion && inspected.version !== expectedVersion) {
    throw new Error(`metadata version ${inspected.version} does not match expected ${expectedVersion}`);
  }
  fs.mkdirSync(output, { recursive: true });
  const copied = [];
  try {
    for (const asset of inspected.assets) {
      const assetPath = path.join(source, asset);
      try {
        copyRegularFile(assetPath, path.join(output, asset));
      } catch (error) {
        if (error?.code === 'ENOENT' || error?.code === 'ELOOP') {
          throw new Error(`metadata references a missing artifact: ${asset}`);
        }
        throw error;
      }
      copied.push(asset);

      const blockmapName = `${asset}.blockmap`;
      try {
        copyRegularFile(`${assetPath}.blockmap`, path.join(output, blockmapName));
        copied.push(blockmapName);
      } catch (error) {
        if (error?.code !== 'ENOENT' && error?.code !== 'ELOOP') throw error;
      }
    }
    fs.writeFileSync(path.join(output, stagingMetadataName), metadata, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    for (const name of [...copied, stagingMetadataName]) {
      fs.rmSync(path.join(output, name), { force: true });
    }
    throw error;
  }
  return { version: inspected.version, metadata: stagingMetadataName, assets: copied.sort(), outputDir: output };
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const outputDir = option('--output');
    if (!outputDir) throw new Error('--output is required');
    const defaultPlatform = process.platform === 'darwin' ? 'mac' : (process.platform === 'win32' ? 'windows' : 'linux');
    const result = prepareStagingFeed({
      sourceDir: option('--source') || 'dist',
      outputDir,
      platform: option('--platform') || defaultPlatform,
      expectedVersion: option('--version') || null,
    });
    console.log(`staging update feed ready: ${result.version} (${result.metadata}, ${result.assets.length} artifacts) at ${result.outputDir}`);
  } catch (error) {
    console.error(`prepare-staging-update-feed: ${error.message}`);
    process.exitCode = 1;
  }
}
