'use strict';
const {execFileSync} = require('node:child_process');
// Match the production verifier: a PowerShell 7 parent can otherwise poison
// Windows PowerShell 5's module lookup and hide Get-AuthenticodeSignature.
function runWindowsPowerShell(command, timeout = 30000, exec = execFileSync) {
  return exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-InputFormat', 'None', '-Command',
    "[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); $ErrorActionPreference = 'Stop'; " + command], {
    encoding: 'utf8', timeout, windowsHide: true,
    env: {...process.env, PSModulePath: ''},
  }).trim();
}
module.exports = {runWindowsPowerShell};
