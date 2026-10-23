'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const {runWindowsPowerShell} = require('./windows-powershell.cjs');
function inspectWindowsCdm(processIds, expectedBinary, expectedHash) {
  assert.equal(process.platform, 'win32');
  assert(processIds.length > 0 && processIds.every(id => Number.isInteger(id) && id > 0));
  const script = path.join(__dirname, 'windows-cdm-inspect.ps1');
  const command = `& '${script.replaceAll("'", "''")}' -ProcessIds @(${processIds.join(',')})`;
  const rows = JSON.parse(runWindowsPowerShell(command));
  try {
  assert.equal(rows.length, 1, 'exactly one active CDM service required');
  const row = rows[0];
  assert.equal(path.resolve(row.binary).toLowerCase(), path.resolve(expectedBinary).toLowerCase(), 'exact mapped CDM path');
  assert.equal(row.sha256, expectedHash, 'exact mapped CDM bytes');
  assert.equal(row.signature, 'Valid');
  assert.equal(row.cdmService, true, 'expected CDM service role'); assert.equal(row.cdmSandbox, true, 'expected CDM sandbox policy'); assert.equal(row.sandboxDisabled, false, 'sandbox bypass forbidden');
  assert.equal(row.restrictedToken, true, 'restricted CDM token required'); assert.equal(row.inJob, true, 'CDM job membership required');
  assert(/^S-1-16-\d+$/.test(row.integritySid));
  assert(Number(row.integritySid.split('-').at(-1)) <= 4096, 'CDM must run at low or untrusted integrity');
  const {binary:_privatePath, ...sanitized} = row;
  return sanitized;
  } catch (error) {
    error.cdmEvidence = rows.map(({binary:_privatePath, ...sanitized}) => sanitized);
    throw error;
  }
}
module.exports = {inspectWindowsCdm};
