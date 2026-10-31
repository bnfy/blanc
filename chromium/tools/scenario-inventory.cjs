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
    { includeGherkinDocument: true, includePickles: true, newId: IdGenerator.incrementing() });
  const errors = envelopes.filter(x => x.parseError);
  if (errors.length) throw Error(JSON.stringify(errors));
  const doc = envelopes.find(x => x.gherkinDocument)?.gherkinDocument;
  const astLocations = new Map();
  function locations(value) {
    if (!value || typeof value !== 'object') return;
    if (value.id && value.location) astLocations.set(value.id, value.location.line);
    for (const child of Object.values(value)) if (Array.isArray(child)) child.forEach(locations); else if (child && typeof child === 'object') locations(child);
  }
  locations(doc);
  const pickles = envelopes.filter(e => e.pickle).map(e => e.pickle);
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
      const cases = pickles.filter(p => p.astNodeIds.includes(s.id)).map(p => {
        const exampleId = p.astNodeIds.find(id => id !== s.id);
        const exampleLine = exampleId ? astLocations.get(exampleId) : null;
        return { id: scenarioId + (exampleLine ? `:example-${exampleLine}` : ':plain'), name: p.name, exampleLine: exampleLine || null,
          steps: p.steps.map(step => ({ text: step.text, type: step.type, argument: step.argument || null, sourceLine: astLocations.get(step.astNodeIds[0]) || null })) };
      });
      if (!cases.length) throw Error(`Scenario has no executable cases: ${scenarioId}`);
      scenarios.push({ id: scenarioId, shippingScenarioTag, cases, file, line: s.location.line, name: s.name, tags,
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
const inventoryFile = path.join(root, 'chromium/scenarios/inventory.json');
const serialized = JSON.stringify(output, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (fs.readFileSync(inventoryFile, 'utf8') !== serialized) throw Error('Scenario inventory is stale');
} else fs.writeFileSync(inventoryFile, serialized);
if (process.argv.includes('--sync-mapping')) {
  const trackerFile = path.join(root, 'chromium/tracker.json');
  const tracker = JSON.parse(fs.readFileSync(trackerFile));
  if (tracker.shippingCommit !== shipping) throw Error('Rebaseline shipping reference before changing mappings');
  tracker.scenarioIds = scenarios.map(s => s.id);
  tracker.scenarioCases = Object.fromEntries(scenarios.map(s => [s.id, s.cases.map(c => c.id)]));
  fs.writeFileSync(trackerFile, JSON.stringify(tracker, null, 2) + '\n');
}

if (!fs.existsSync(path.join(root, 'chromium/tracker.json'))) fs.writeFileSync(path.join(root, 'chromium/tracker.json'), JSON.stringify({ schemaVersion: 1,
  qualification: 'initial requirement inventory; canonical/platform states await verification',
  shippingTag: 'v1.45.1', shippingCommit: shipping, rows }, null, 2) + '\n');
console.log(JSON.stringify({ declarations: scenarios.length, mapped: scenarios.length - unmapped.length,
  desktopApplicable: scenarios.filter(s => s.desktopApplicability === 'applicable').length, executableCases: scenarios.reduce((n,s) => n + s.cases.length, 0),
  rows: rows.length, forkBaselineRun: false, unmapped: unmapped.map(s => s.id) }));
