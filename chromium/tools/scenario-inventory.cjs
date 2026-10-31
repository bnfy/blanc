'use strict';
// Inventory only: this command never launches a browser or credits a pass.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { generateMessages } = require('@cucumber/gherkin');
const { IdGenerator, SourceMediaType } = require('@cucumber/messages');
const root = path.resolve(__dirname, '../..');
const shipping = '85883b1afa11375e1300130914d6f40c5388af21';
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const spec = fs.readFileSync(path.join(root, 'docs/chromium-replacement/2026-10-30-desktop-replacement-spec.md'), 'utf8');
const rows = [...spec.matchAll(/^\| ((?:F|R|X|N)\d+) \| (.+)$/gm)].map(m => {
  const columns = m[2].split('|').map(x => x.trim());
  return { id: m[1], requirement: columns[0], slice: columns[1],
    legacyMacState: columns[3] || 'not assessed', canonicalState: 'not-started',
    platformVerification: { macos: null, windows: null, linux: null } };
});
if (rows.length !== 79 || new Set(rows.map(r => r.id)).size !== 79) throw Error('Spec must have 79 unique rows');
const ids = new Set(rows.map(r => r.id));
// Explicit aliases: shipping's existing tags predate the expanded matrix.
const aliases = { F55: { row: 'N9', reason: 'Shipping send-to-device.feature maps to new Send to device row' },
  F39: { row: 'N5', reason: 'Shipping certificate-safety scenarios map to the certificate-error row' },
  F24: { row: 'N7', reason: 'Mobile-only credentials/passkey scenario; excluded from desktop applicability, linked to platform authenticator row' } };
const scenarios = [];
const files = git('ls-tree', '-r', '--name-only', shipping, 'spec/acceptance').trim().split('\n').filter(p => p.endsWith('.feature'));
for (const file of files) {
  const envelopes = generateMessages(git('show', `${shipping}:${file}`), file, SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN,
    { includeGherkinDocument: true, includePickles: false, newId: IdGenerator.incrementing() });
  const errors = envelopes.filter(x => x.parseError);
  if (errors.length) throw Error(JSON.stringify(errors));
  const doc = envelopes.find(x => x.gherkinDocument)?.gherkinDocument;
  function walk(children, inherited) {
    for (const child of children) {
      if (child.rule) walk(child.rule.children, [...inherited, ...child.rule.tags]);
      if (!child.scenario) continue;
      const s = child.scenario;
      const tags = [...inherited, ...s.tags].map(t => t.name);
      const roots = [...new Set(tags.flatMap(t => t.match(/^@((?:F|R|X|N)\d+)(?:-|$)/)?.[1] || []))];
      const featureRows = [...new Set(roots.flatMap(id => ids.has(id) ? id : aliases[id]?.row || []))];
      const scenarioId = `${file}:${s.location.line}`;
      const shippingScenarioTag = [...s.tags.map(t => t.name), ...tags].find(t => /^@(?:F|R|X|N)\d+-\d+$/.test(t))?.slice(1) || null;
      const mobileOnly = tags.includes('@mobile') && !tags.includes('@desktop') && !tags.includes('@all');
      scenarios.push({ id: scenarioId, shippingScenarioTag, file, line: s.location.line, name: s.name, tags,
        featureRows, mappingReasons: roots.filter(id => aliases[id]).map(id => aliases[id].reason),
        desktopApplicability: mobileOnly ? 'excluded' : 'applicable',
        exclusionReason: mobileOnly ? 'Shipping scenario explicitly targets mobile only' : null,
        result: 'not-run', shippingTag: 'v1.45.1', shippingCommit: shipping,
        forkCommit: null, candidate: null, platform: null });
    }
  }
  walk(doc.feature.children, doc.feature.tags);
}
if (scenarios.length !== 578) throw Error(`Unexpected declaration count ${scenarios.length}`);
const unmapped = scenarios.filter(s => !s.featureRows.length);
const output = { schemaVersion: 1, qualification: 'scenario declaration inventory only; no fork baseline run or pass credit',
  shippingTag: 'v1.45.1', shippingCommit: shipping, declarationCount: scenarios.length,
  unmappedCount: unmapped.length, mappingAliases: aliases, scenarios };
fs.writeFileSync(path.join(root, 'chromium/scenarios/inventory.json'), JSON.stringify(output, null, 2) + '\n');
if (!fs.existsSync(path.join(root, 'chromium/tracker.json'))) fs.writeFileSync(path.join(root, 'chromium/tracker.json'), JSON.stringify({ schemaVersion: 1,
  qualification: 'initial requirement inventory; canonical/platform states await verification',
  shippingTag: 'v1.45.1', shippingCommit: shipping, rows }, null, 2) + '\n');
console.log(JSON.stringify({ declarations: scenarios.length, mapped: scenarios.length - unmapped.length,
  desktopApplicable: scenarios.filter(s => s.desktopApplicability === 'applicable').length,
  rows: rows.length, forkBaselineRun: false, unmapped: unmapped.map(s => s.id) }));
