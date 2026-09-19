#!/usr/bin/env node

/**
 * Read-only GitHub Release download snapshot for social measurement.
 *
 * Prints one JSON object and writes nothing. Counts are asset requests, not
 * unique people or attributed conversions. A macOS update can fetch the ZIP,
 * and QA/retries may fetch any artifact, so campaign conclusions require a
 * before/after delta plus first-party campaign evidence.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const tag = process.argv[2] || 'v1.13.0';
const baselinePath = process.argv[3] || null;
const repository = 'bnfy/blanc';

const raw = execFileSync('gh', [
  'release', 'view', tag,
  '--repo', repository,
  '--json', 'name,tagName,publishedAt,assets,url',
], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const release = JSON.parse(raw);

const packages = release.assets.filter((asset) =>
  /\.(dmg|exe|AppImage)$/.test(asset.name) || asset.name.endsWith('.zip')
);
const updater = release.assets.filter((asset) =>
  /\.(yml|blockmap)$/.test(asset.name)
);
const categorized = new Set([...packages, ...updater].map((asset) => asset.name));
const auxiliary = release.assets.filter((asset) => !categorized.has(asset.name));
const total = (assets) => assets.reduce((sum, asset) => sum + asset.downloadCount, 0);

const packageByPlatform = {
  mac: total(packages.filter((asset) => asset.name.endsWith('.dmg') || asset.name.endsWith('.zip'))),
  windows: total(packages.filter((asset) => asset.name.endsWith('.exe'))),
  linux: total(packages.filter((asset) => asset.name.endsWith('.AppImage'))),
};

const snapshot = {
  capturedAt: new Date().toISOString(),
  source: 'GitHub Releases asset downloadCount via gh release view',
  repository,
  release: {
    tag: release.tagName,
    name: release.name,
    publishedAt: release.publishedAt,
    url: release.url,
  },
  totals: {
    packageAssetRequests: total(packages),
    updaterMetadataAndBlockmapRequests: total(updater),
    auxiliaryAssetRequests: total(auxiliary),
    allAssetRequests: total(release.assets),
  },
  packageAssetRequestsByPlatform: packageByPlatform,
  packageAssets: packages.map(({ name, downloadCount }) => ({ name, downloadCount })),
  updaterAssets: updater.map(({ name, downloadCount }) => ({ name, downloadCount })),
  limitations: [
    'Counts are requests for release assets, not unique people.',
    'The macOS ZIP can be fetched by the updater as well as downloaded directly.',
    'QA, retries, updater handoffs, and non-social traffic are included.',
    'A before/after delta is aggregate corroboration, not social attribution.',
  ],
};

if (baselinePath) {
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const currentTotal = snapshot.totals.packageAssetRequests;
  const baselineTotal = baseline.totals?.packageAssetRequests;

  if (!Number.isFinite(baselineTotal)) {
    throw new Error(`Baseline has no numeric packageAssetRequests total: ${baselinePath}`);
  }

  snapshot.comparison = {
    baselinePath,
    baselineCapturedAt: baseline.capturedAt || null,
    elapsedMinutes: baseline.capturedAt
      ? Math.round((Date.parse(snapshot.capturedAt) - Date.parse(baseline.capturedAt)) / 60000)
      : null,
    packageAssetRequestDelta: currentTotal - baselineTotal,
    packageAssetRequestDeltaByPlatform: Object.fromEntries(
      Object.entries(snapshot.packageAssetRequestsByPlatform).map(([platform, count]) => [
        platform,
        count - (baseline.packageAssetRequestsByPlatform?.[platform] || 0),
      ])
    ),
    updaterMetadataAndBlockmapRequestDelta:
      snapshot.totals.updaterMetadataAndBlockmapRequests
      - (baseline.totals?.updaterMetadataAndBlockmapRequests || 0),
    allAssetRequestDelta:
      snapshot.totals.allAssetRequests - (baseline.totals?.allAssetRequests || 0),
    interpretation:
      'Aggregate request movement only; it does not identify unique users or attribute a request to social.',
  };
}

console.log(JSON.stringify(snapshot, null, 2));
