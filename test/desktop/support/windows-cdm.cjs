'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
function inspectWindowsCdm(processIds, expectedBinary, expectedHash) {
  assert.equal(process.platform, 'win32');
  assert(processIds.length > 0 && processIds.every(id => Number.isInteger(id) && id > 0));
  const script = path.join(__dirname, 'windows-cdm-inspect.ps1');
  const command = `& '${script.replaceAll("'", "''")}' -ProcessIds @(${processIds.join(',')})`;
  const rows = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {encoding:'utf8',timeout:30000}));
  assert.equal(rows.length, 1, 'exactly one active CDM service required');
  const row = rows[0];
  assert.equal(path.resolve(row.binary).toLowerCase(), path.resolve(expectedBinary).toLowerCase(), 'exact mapped CDM path');
  assert.equal(row.sha256, expectedHash, 'exact mapped CDM bytes');
  assert.equal(row.signature, 'Valid');
  assert.equal(row.cdmService, true); assert.equal(row.cdmSandbox, true); assert.equal(row.sandboxDisabled, false);
  assert.equal(row.restrictedToken, true); assert.equal(row.inJob, true);
  assert(/^S-1-16-\d+$/.test(row.integritySid));
  assert(Number(row.integritySid.split('-').at(-1)) <= 4096, 'CDM must run at low or untrusted integrity');
  const {binary:_privatePath, ...sanitized} = row;
  return sanitized;
}
module.exports = {inspectWindowsCdm};
